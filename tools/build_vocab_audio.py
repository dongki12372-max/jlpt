#!/usr/bin/env python3
"""문자·어휘 음성: 단어 · 예문 · 문항 완성 문장 (개발용 빌드 도구, 앱 실행 중에는 쓰지 않는다).

  .venv/bin/python tools/build_vocab_audio.py              # 바뀐 것만
  .venv/bin/python tools/build_vocab_audio.py --only words # words / examples / questions
  .venv/bin/python tools/build_vocab_audio.py --level n5 --force
  .venv/bin/python tools/build_vocab_audio.py --prune      # 데이터에 없는 음성 파일 지우기

순서: validate_vocab.py --partial 통과 (청해 단어 누락만 허용) → edge-tts → (앞뒤 여백 + loudnorm) → audio/vocab/{words,examples,questions}/{id}.mp3
화자: 단어는 N, 예문은 F·M 번갈아(id 번호 홀수 F, 짝수 M), 문항 완성 문장은 N. 단어는 reading이 아니라 word를 읽힌다
(동음이의어 구분). 잘못 읽히면 ttsText로 교정한다 — 의심 목록은 tools/check_vocab_tts.py.
audio/vocab/manifest.json에 내용 해시와 길이를 기록하고, 해시가 같으면 건너뛴다.
"""
import argparse
import asyncio
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import edge_tts

from vocab_common import LEVEL_KEYS, ROOT, VAUDIO_DIR, load_all_words, load_questions

VOICES_PATH = ROOT / "tools" / "voices.json"
MANIFEST_PATH = VAUDIO_DIR / "manifest.json"
KINDS = ["words", "examples", "questions"]
BUILD_VERSION = 1


def example_speaker(word_id):
    return "F" if int(word_id.rsplit("-", 1)[1]) % 2 else "M"


def collect_jobs(levels, only):
    """(kind, id, speaker, text) 목록."""
    jobs = []
    words = load_all_words()
    for lv in levels:
        for w in words[lv]:
            if "words" in only:
                # 조수사·접사(〜人)의 〜는 읽히지 않게 뺀다
                jobs.append(("words", w["id"], "N", w.get("ttsText", w["word"]).lstrip("〜")))
            if "examples" in only:
                ex = w["example"]
                jobs.append(("examples", w["id"], example_speaker(w["id"]), ex.get("ttsText", ex["text"])))
        if "questions" in only:
            for q in load_questions(lv):
                jobs.append(("questions", q["id"], "N", q.get("ttsText", q["fullText"])))
    return jobs


def job_hash(job, vc):
    kind, _id, spk, text = job
    payload = {"v": BUILD_VERSION, "text": text, "voice": vc["voices"][spk], "pad": vc["vocab"], "output": vc["output"]}
    return hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


async def synth(text, spec, out, retries):
    last = None
    for attempt in range(1, retries + 1):
        try:
            comm = edge_tts.Communicate(text, spec["voice"], rate=spec.get("rate", "+0%"), pitch=spec.get("pitch", "+0Hz"))
            await comm.save(str(out))
            if out.stat().st_size > 0:
                return
            last = RuntimeError("빈 파일")
        except Exception as e:
            last = e
        await asyncio.sleep(attempt)
    raise RuntimeError(f"edge-tts {retries}회 실패: {text[:20]}… ({last})")


async def run_cmd(*args):
    p = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await p.communicate()
    if p.returncode != 0:
        raise RuntimeError(err.decode()[-300:])
    return out.decode()


async def render(job, vc, tmpdir):
    kind, jid, spk, text = job
    raw = Path(tmpdir) / f"{kind}-{jid}.mp3"
    await synth(text, vc["voices"][spk], raw, vc["tts"]["retries"])
    out = VAUDIO_DIR / kind / f"{jid}.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    part = out.with_suffix(".part.mp3")
    pad, o = vc["vocab"], vc["output"]
    await run_cmd("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                  "-af", f"adelay={round(pad['leadIn'] * 1000)}:all=1,apad=pad_dur={pad['tail']},loudnorm={o['loudnorm']}",
                  "-ar", str(o["sampleRate"]), "-ac", "1", "-b:a", o["bitrate"], str(part))
    part.replace(out)
    raw.unlink(missing_ok=True)
    dur = await run_cmd("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out))
    return float(dur.strip())


def main():
    ap = argparse.ArgumentParser(description="문자·어휘 음성 생성 (edge-tts)")
    ap.add_argument("--level", choices=LEVEL_KEYS)
    ap.add_argument("--only", choices=KINDS, action="append", help="종류 한정 (여러 번 지정 가능)")
    ap.add_argument("--id", help="한 항목만 (단어 id 또는 문항 id)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--prune", action="store_true", help="데이터에 없는 mp3와 manifest 항목 지우기")
    args = ap.parse_args()

    print("validate_vocab.py 실행…")
    v = subprocess.run([sys.executable, str(ROOT / "tools" / "validate_vocab.py"), "--partial"], capture_output=True, text=True)
    if v.returncode != 0:
        print(v.stdout[-3000:] + v.stderr)
        print("검증 실패 — 음성 생성을 중단합니다.")
        sys.exit(1)

    vc = json.loads(VOICES_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.is_file() else {}
    levels = [args.level] if args.level else LEVEL_KEYS
    jobs = collect_jobs(levels, args.only or KINDS)
    if args.id:
        jobs = [j for j in jobs if j[1] == args.id]

    if args.prune and not args.level and not args.id:
        live = {f"{k}/{i}" for k, i, _, _ in collect_jobs(LEVEL_KEYS, KINDS)}
        removed = 0
        for kind in KINDS:
            for f in (VAUDIO_DIR / kind).glob("*.mp3") if (VAUDIO_DIR / kind).is_dir() else []:
                if f"{kind}/{f.stem}" not in live:
                    f.unlink()
                    removed += 1
        for k in [k for k in manifest if k not in live]:
            del manifest[k]
        print(f"지운 파일 {removed}개")

    todo = []
    for j in jobs:
        key, digest = f"{j[0]}/{j[1]}", job_hash(j, vc)
        if args.force or manifest.get(key, {}).get("hash") != digest or not (VAUDIO_DIR / j[0] / f"{j[1]}.mp3").is_file():
            todo.append((j, key, digest))
    print(f"대상 {len(jobs)}개 중 생성 {len(todo)}개, 건너뜀 {len(jobs) - len(todo)}개")

    failed = []

    def save_manifest():
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")

    async def run():
        sem = asyncio.Semaphore(vc["vocab"]["concurrency"])
        done = 0
        with tempfile.TemporaryDirectory(prefix="jlpt-vocab-audio-") as tmp:
            async def one(j, key, digest):
                nonlocal done
                async with sem:
                    try:
                        dur = await render(j, vc, tmp)
                        manifest[key] = {"hash": digest, "duration": round(dur, 3)}
                    except Exception as e:
                        failed.append((key, str(e)))
                    done += 1
                    if done % 100 == 0 or done == len(todo):
                        save_manifest()
                        print(f"  {done}/{len(todo)}", flush=True)
            await asyncio.gather(*(one(*t) for t in todo))

    if todo:
        asyncio.run(run())
    save_manifest()
    if failed:
        print(f"\n실패 {len(failed)}개:")
        for key, msg in failed:
            print(f"  ✗ {key} — {msg}")
        sys.exit(1)
    print("완료")


if __name__ == "__main__":
    main()
