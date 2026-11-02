#!/usr/bin/env python3
"""문제 은행 → 문항별 mp3 + 유형별 지시문 mp3 (개발용 빌드 도구, 앱 실행 중에는 쓰지 않는다).

  .venv/bin/python tools/build_audio.py                  # 전 레벨, 바뀐 문항만
  .venv/bin/python tools/build_audio.py --level n5
  .venv/bin/python tools/build_audio.py --id n5-kadai-001
  .venv/bin/python tools/build_audio.py --force          # 전부 다시 생성

순서: validate.py 통과 → 구간별 edge-tts → 쉼과 함께 합치기 → loudnorm → audio/listening/{level}/{id}.mp3
audio/listening/manifest.json에 내용 해시와 구간 시각(대사별·질문·선택지 읽는 시간·음성 선택지)과
스크립트 줄마다 단어별 시각(edge-tts WordBoundary)을 기록한다.
전화·음성 메시지 문항은 `phone` 화자의 대사를 전화 음질(voices.json phone 대역 필터)로 만든다.
답 고르는 시간은 음성에 넣지 않는다 (앱 타이머).
"""
import argparse
import asyncio
import difflib
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts
from pydub import AudioSegment

from validate import AUDIO_DIR, DATA_DIR, QUESTIONS_DIR, ROOT, load_listening_config

MANIFEST_PATH = AUDIO_DIR / "manifest.json"
VOICES_PATH = ROOT / "tools" / "voices.json"
INTROS_PATH = DATA_DIR / "intros.json"
BUILD_VERSION = 2  # 합치는 방식이 바뀌면 올려서 전부 다시 만든다 (2: 단어별 시각 기록)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


# ---------- 구간 계획 ----------
# step: ("say", mark, speaker, text) | ("pause", mark, seconds)
#   mark는 manifest에 시각을 남길 구간 표시 (없으면 None)

def plan_question(q, cfg, vc):
    p, qtype = vc["pauses"], q["type"]
    steps = []
    say = lambda mark, spk, text: steps.append(("say", mark, spk, text))
    pause = lambda sec, mark=None: steps.append(("pause", mark, sec))

    pause(p["leadIn"])
    if qtype == "sokuji":
        line = q["lines"][0]
        say(["line", 0], line["speaker"], line.get("ttsText", line["text"]))
    elif qtype == "hatsuwa":
        say(["situation"], "N", q["situation"] + q["question"])
    else:
        say(["situation"], "N", q["situation"])
        if qtype == "point":
            pause(cfg["levels"][q["level"]]["pointReadingSec"], ["reading"])
        else:
            pause(p["situationToDialogue"])
        for i, line in enumerate(q["lines"]):
            if i:
                pause(p["betweenLines"])
            say(["line", i], line["speaker"], line.get("ttsText", line["text"]))
        pause(p["dialogueToQuestion"])
        say(["question"], "N", q["question"])

    if q["spokenOptions"]:
        spk = q.get("optionSpeaker", "N")
        pause(p["questionToOptions"])
        for i, opt in enumerate(q["options"]):
            if i:
                pause(p["betweenOptions"])
            say(["optnum", i], "N", vc["optionNumbers"][i])
            pause(p["afterOptionNumber"])
            say(["option", i], spk, opt.get("ttsText", opt["text"]))
    pause(p["tail"])
    return steps


def plan_intro(text, vc):
    p = vc["pauses"]
    return [("pause", None, p["leadIn"]), ("say", None, "N", text), ("pause", None, p["tail"])]


def steps_hash(steps, vc, phone=()):
    speakers = sorted({s[2] for s in steps if s[0] == "say"})
    payload = {
        "v": BUILD_VERSION,
        "steps": steps,
        "voices": {k: vc["voices"][k] for k in speakers},
        "output": vc["output"],
    }
    if phone:   # 전화 음질 화자가 있을 때만 해시에 넣는다 (다른 문항은 해시가 그대로)
        payload["phone"] = {"speakers": sorted(phone), "filter": vc["phone"]}
    return hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


# ---------- 합성·합치기 ----------

async def synth(text, spec, out, retries):
    """mp3를 out에 쓰고 단어 경계 [(시작초, 끝초, 글자)]를 돌려준다 (edge-tts WordBoundary)."""
    last = None
    for attempt in range(1, retries + 1):
        try:
            comm = edge_tts.Communicate(text, spec["voice"], rate=spec.get("rate", "+0%"), pitch=spec.get("pitch", "+0Hz"),
                                        boundary="WordBoundary")
            words = []
            with open(out, "wb") as f:
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        s = chunk["offset"] / 1e7
                        words.append((s, s + chunk["duration"] / 1e7, chunk["text"]))
            if out.stat().st_size > 0:
                return words
            last = RuntimeError("빈 파일")
        except Exception as e:  # 네트워크·서비스 오류 → 재시도
            last = e
        await asyncio.sleep(attempt)
    raise RuntimeError(f"edge-tts {retries}회 실패: {text[:20]}… ({last})")


def ffprobe_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def phone_filter(seg, spec):
    """전화 음질: 대역 필터(저역·고역을 여러 번 걸어 가파르게) 뒤 원래 음량으로 맞춤."""
    out = seg
    for _ in range(spec["passes"]):
        out = out.high_pass_filter(spec["low"]).low_pass_filter(spec["high"])
    return out.apply_gain(seg.dBFS - out.dBFS)


async def render(steps, out_path, voices, vc, sem, phone=()):
    """steps를 합쳐 out_path(mp3)로 저장하고 {mark: (start, end)}와 길이를 돌려준다."""
    sr = vc["output"]["sampleRate"]
    with tempfile.TemporaryDirectory(prefix="jlpt-audio-") as tmp:
        tmp = Path(tmp)

        bounds = {}

        async def one(i, step):
            async with sem:
                bounds[i] = await synth(step[3], voices[step[2]], tmp / f"{i:03d}.mp3", vc["tts"]["retries"])

        await asyncio.gather(*(one(i, s) for i, s in enumerate(steps) if s[0] == "say"))

        audio = AudioSegment.silent(duration=0, frame_rate=sr)
        marks = {}
        for i, step in enumerate(steps):
            if step[0] == "pause":
                seg = AudioSegment.silent(duration=round(step[2] * 1000), frame_rate=sr)
            else:
                seg = AudioSegment.from_mp3(tmp / f"{i:03d}.mp3").set_frame_rate(sr).set_channels(1)
                if step[2] in phone and step[1] and step[1][0] == "line":
                    seg = phone_filter(seg, vc["phone"])
            start = len(audio)
            audio += seg
            if step[1]:
                marks[tuple(step[1])] = (start / 1000, len(audio) / 1000)
                if step[0] == "say":
                    # 단어 경계: 구간 시작 + 구간 안 시각, 글자는 그 구간에서 읽힌 문자열
                    marks[("words",) + tuple(step[1])] = [(start / 1000 + a, start / 1000 + b, w) for a, b, w in bounds.get(i, [])]

        wav = tmp / "joined.wav"
        audio.export(wav, format="wav")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        part = out_path.with_suffix(".part.mp3")
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
             "-af", f"loudnorm={vc['output']['loudnorm']}", "-ar", str(sr), "-ac", "1",
             "-b:a", vc["output"]["bitrate"], str(part)],
            check=True,
        )
        part.replace(out_path)

    duration = ffprobe_duration(out_path)
    drift = abs(duration - len(audio) / 1000)
    if drift > 0.1:
        print(f"  ⚠ {out_path.name}: loudnorm 뒤 길이가 {drift:.2f}초 달라짐 (구간 시각 오차 가능)")
    return marks, duration


def map_words(display, spoken, words):
    """읽힌 문자열(spoken)의 단어 경계 → 화면 문자열(display)의 글자 위치 [[시작초, 끝초, 시작글자, 끝글자]].
    ttsText로 읽기를 바꾼 줄은 두 문자열을 맞춰(difflib) 위치를 옮긴다."""
    ops = difflib.SequenceMatcher(None, display, spoken, autojunk=False).get_opcodes()

    def to_display(j, end):
        for tag, i1, i2, j1, j2 in ops:
            if j1 <= j < j2 or (end and j1 < j <= j2):
                if tag == "equal":
                    return i1 + (j - j1)
                return i2 if end else i1
        return len(display) if end else 0

    out, cur = [], 0
    for a, b, w in words:
        at = spoken.find(w, cur)
        if at < 0:
            continue
        cur = at + len(w)
        cs, ce = to_display(at, False), to_display(cur, True)
        if ce > cs:
            out.append([round(a, 3), round(b, 3), cs, ce])
    return out


def manifest_entry(q, marks, duration, digest):
    r = lambda pair: [round(pair[0], 3), round(pair[1], 3)] if pair else None
    n_opt = len(q["options"]) if q["spokenOptions"] else 0
    return {
        "hash": digest,
        "duration": round(duration, 3),
        "lines": [r(marks.get(("line", i))) for i in range(len(q["lines"]))],
        "question": r(marks.get(("question",))),
        "reading": r(marks.get(("reading",))),
        # 음성 선택지: 번호 읽기 시작 ~ 선택지 끝
        "options": [r((marks[("optnum", i)][0], marks[("option", i)][1])) for i in range(n_opt)],
        # 스크립트 줄마다 단어별 시각 (재생 중 지금 읽는 단어 표시): [[시작초, 끝초, 시작글자, 끝글자], …]
        "words": script_words(q, marks),
    }


def script_words(q, marks):
    if q["type"] == "hatsuwa":   # 스크립트 한 줄 = 상황 + 질문 (situation 구간에서 한 번에 읽음)
        text = q["situation"] + q["question"]
        return [map_words(text, text, marks.get(("words", "situation"), []))]
    return [map_words(line["text"], line.get("ttsText", line["text"]), marks.get(("words", "line", i), []))
            for i, line in enumerate(q["lines"])]


# ---------- 메인 ----------

def main():
    ap = argparse.ArgumentParser(description="문항 음성 생성 (edge-tts)")
    ap.add_argument("--level", choices=["n5", "n4", "n3"])
    ap.add_argument("--id", help="한 문항만 (예: n5-kadai-001)")
    ap.add_argument("--force", action="store_true", help="해시가 같아도 다시 생성")
    args = ap.parse_args()

    # 1) 검증을 먼저 통과해야 한다
    print("validate.py 실행…")
    v = subprocess.run([sys.executable, str(ROOT / "tools" / "validate.py")], capture_output=True, text=True)
    if v.returncode != 0:
        print(v.stdout + v.stderr)
        print("검증 실패 — 음성 생성을 중단합니다.")
        sys.exit(1)

    cfg, vc, intros = load_listening_config(), load_json(VOICES_PATH), load_json(INTROS_PATH)
    manifest = load_json(MANIFEST_PATH) if MANIFEST_PATH.is_file() else {}

    if args.id:
        levels = [args.id.split("-")[0]]
    else:
        levels = [args.level] if args.level else ["n5", "n4", "n3"]

    # 2) 작업 목록 (바뀐 것만)
    jobs = []  # (key, out_path, steps, digest, question|None)
    for lv in levels:
        level = lv.upper()
        exam = cfg["levels"][level]["exam"]
        if not args.id:
            order = [t for t in cfg["typeOrder"] if t in exam]
            for n, t in enumerate(order, 1):
                steps = plan_intro(intros[t].format(n=n), vc)
                jobs.append((f"{lv}/_intro_{t}", AUDIO_DIR / lv / f"_intro_{t}.mp3", steps, steps_hash(steps, vc), None))
        for q in load_json(QUESTIONS_DIR / f"{lv}.json"):
            if args.id and q["id"] != args.id:
                continue
            steps = plan_question(q, cfg, vc)
            jobs.append((q["id"], AUDIO_DIR / lv / f"{q['id']}.mp3", steps, steps_hash(steps, vc, q.get("phone", ())), q))
    if args.id and not any(j[4] for j in jobs):
        print(f"문항 없음: {args.id}")
        sys.exit(1)

    todo = [j for j in jobs if args.force or not j[1].is_file() or manifest.get(j[0], {}).get("hash") != j[3]]
    print(f"대상 {len(jobs)}개 중 생성 {len(todo)}개, 건너뜀 {len(jobs) - len(todo)}개")

    # 3) 생성
    failed = []

    async def run():
        sem = asyncio.Semaphore(vc["tts"]["concurrency"])
        for i, (key, out, steps, digest, q) in enumerate(todo, 1):
            try:
                marks, duration = await render(steps, out, vc["voices"], vc, sem, (q or {}).get("phone", ()))
            except Exception as e:
                failed.append((key, str(e)))
                print(f"[{i}/{len(todo)}] ✗ {key}: {e}")
                continue
            if q is None:
                manifest[key] = {"hash": digest, "duration": round(duration, 3)}
            else:
                manifest[key] = manifest_entry(q, marks, duration, digest)
            MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
            MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
            print(f"[{i}/{len(todo)}] ✓ {key} ({duration:.1f}초)")

    asyncio.run(run())

    if failed:
        print(f"\n실패 {len(failed)}개:")
        for key, msg in failed:
            print(f"  ✗ {key} — {msg}")
        sys.exit(1)
    print("\n완료")


if __name__ == "__main__":
    main()
