#!/usr/bin/env python3
"""화자 구분 비교 샘플 (voices.json의 compare 항목).

  .venv/bin/python tools/voice_compare.py

후보마다 audio/_compare/{후보}.mp3를 만든다. 파일 하나에
  기준 화자(내레이터·F2는 F, M2는 M)가 문장을 읽고 → 잠깐 쉼 → 후보가 같은 문장을 읽는다.
확정한 값은 voices.json의 voices에 옮긴다.
"""
import asyncio
import json

from build_audio import AUDIO_DIR, VOICES_PATH, render


def main():
    vc = json.loads(VOICES_PATH.read_text(encoding="utf-8"))
    cmp_ = vc["compare"]
    out_dir = AUDIO_DIR / "_compare"
    sentence = cmp_["sentence"]

    async def run():
        sem = asyncio.Semaphore(vc["tts"]["concurrency"])
        for role, cands in cmp_["candidates"].items():
            ref = cmp_["reference"][role]
            for cand in cands:
                name = cand["label"].split()[0]
                voices = {"REF": vc["voices"][ref], "CAND": cand}
                steps = [
                    ("pause", None, vc["pauses"]["leadIn"]),
                    ("say", None, "REF", sentence),
                    ("pause", None, cmp_["gap"]),
                    ("say", None, "CAND", sentence),
                    ("pause", None, vc["pauses"]["tail"]),
                ]
                await render(steps, out_dir / f"{name}.mp3", voices, vc, sem)
                print(f"✓ {name}.mp3  — 기준 {ref} → {cand['label']} (rate {cand['rate']}, pitch {cand['pitch']})")

    asyncio.run(run())
    print(f"\n출력 폴더: {out_dir}")


if __name__ == "__main__":
    main()
