#!/usr/bin/env python3
"""문법 음성: 문형 예문 · 문항 완성 문장(글) (개발용 빌드 도구, 앱 실행 중에는 쓰지 않는다).

  .venv/bin/python tools/build_grammar_audio.py              # 바뀐 것만
  .venv/bin/python tools/build_grammar_audio.py --only examples   # examples / questions
  .venv/bin/python tools/build_grammar_audio.py --level n5 --force
  .venv/bin/python tools/build_grammar_audio.py --prune      # 데이터에 없는 음성 파일 지우기

순서: validate_grammar.py 통과 → edge-tts → (앞뒤 여백 + loudnorm) → audio/grammar/{examples,questions}/{id}.mp3
화자: 예문 1은 F, 예문 2는 M, 문항(완성 문장·글)은 N. 대화문의 「A：」「B：」는 읽지 않는다.
잘못 읽히면 ttsText로 교정한다 — 의심 목록은 tools/check_grammar_tts.py.
audio/grammar/manifest.json에 내용 해시와 길이를 기록하고, 해시가 같으면 건너뛴다.
"""
import argparse
import asyncio
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from build_vocab_audio import VOICES_PATH, run_cmd, synth
from grammar_common import GAUDIO_DIR, LEVEL_KEYS, ROOT, load_all_points, load_questions

MANIFEST_PATH = GAUDIO_DIR / "manifest.json"
KINDS = ["examples", "questions"]
BUILD_VERSION = 1
SPEAKER_RE = re.compile(r"^[A-ZＡ-Ｚ]：", re.M)


def speech_text(text):
    """음성으로 읽을 글: 대화문 화자 표시(A：)를 뺀다."""
    return SPEAKER_RE.sub("", text)


def example_speaker(n):
    return "F" if n == 1 else "M"


def collect_jobs(levels, only):
    """(kind, id, speaker, text) 목록."""
    jobs = []
    points = load_all_points()
    for lv in levels:
        if "examples" in only:
            for p in points[lv]:
                for n, ex in enumerate(p["examples"], 1):
                    jobs.append(("examples", f"{p['id']}-{n}", example_speaker(n), ex.get("ttsText", ex["text"])))
        if "questions" in only:
            for q in load_questions(lv):
                jobs.append(("questions", q["id"], "N", speech_text(q.get("ttsText", q["fullText"]))))
    return jobs


def job_hash(job, vc):
    kind, _id, spk, text = job
    payload = {"v": BUILD_VERSION, "text": text, "voice": vc["voices"][spk], "pad": vc["grammar"], "output": vc["output"]}
    return hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


async def render(job, vc, tmpdir):
    kind, jid, spk, text = job
    raw = Path(tmpdir) / f"{kind}-{jid}.mp3"
    await synth(text, vc["voices"][spk], raw, vc["tts"]["retries"])
    out = GAUDIO_DIR / kind / f"{jid}.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    part = out.with_suffix(".part.mp3")
    pad, o = vc["grammar"], vc["output"]
    await run_cmd("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                  "-af", f"adelay={round(pad['leadIn'] * 1000)}:all=1,apad=pad_dur={pad['tail']},loudnorm={o['loudnorm']}",
                  "-ar", str(o["sampleRate"]), "-ac", "1", "-b:a", o["bitrate"], str(part))
    part.replace(out)
    raw.unlink(missing_ok=True)
    dur = await run_cmd("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out))
    return float(dur.strip())


def main():
    ap = argparse.ArgumentParser(description="문법 음성 생성 (edge-tts)")
    ap.add_argument("--level", choices=LEVEL_KEYS)
    ap.add_argument("--only", choices=KINDS, action="append", help="종류 한정 (여러 번 지정 가능)")
    ap.add_argument("--id", help="한 항목만 (예문 id n5-g-001-1 또는 문항 id)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--prune", action="store_true", help="데이터에 없는 mp3와 manifest 항목 지우기")
    args = ap.parse_args()

    print("validate_grammar.py 실행…")
    v = subprocess.run([sys.executable, str(ROOT / "tools" / "validate_grammar.py")], capture_output=True, text=True)
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
            for f in (GAUDIO_DIR / kind).glob("*.mp3") if (GAUDIO_DIR / kind).is_dir() else []:
                if f"{kind}/{f.stem}" not in live:
                    f.unlink()
                    removed += 1
        for k in [k for k in manifest if k not in live]:
            del manifest[k]
        print(f"지운 파일 {removed}개")

    todo = []
    for j in jobs:
        key, digest = f"{j[0]}/{j[1]}", job_hash(j, vc)
        if args.force or manifest.get(key, {}).get("hash") != digest or not (GAUDIO_DIR / j[0] / f"{j[1]}.mp3").is_file():
            todo.append((j, key, digest))
    print(f"대상 {len(jobs)}개 중 생성 {len(todo)}개, 건너뜀 {len(jobs) - len(todo)}개")

    failed = []

    def save_manifest():
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")

    async def run():
        sem = asyncio.Semaphore(vc["grammar"]["concurrency"])
        done = 0
        with tempfile.TemporaryDirectory(prefix="jlpt-grammar-audio-") as tmp:
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
