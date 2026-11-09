#!/usr/bin/env python3
"""문법 예문·문항 음성이 의도한 읽기대로 나오는지 확인 (개발용, 방법은 check_vocab_tts.py와 같다).

  .venv/bin/python tools/check_grammar_tts.py          # 의심 목록 출력
  .venv/bin/python tools/check_grammar_tts.py --fix    # 의심 항목에 ttsText(후리가나를 가나로) 넣기

실제 음성(한자 표기를 읽힌 것)과 같은 화자로 가나 읽기를 읽힌 음성을 MFCC + DTW로 비교한다. 기준값은 voices.json grammar.check.
가나 음성은 audio/grammar/_check/에 캐시한다. 이미 ttsText가 있는 항목은 건너뛴다.
"""
import argparse
import asyncio
import json
import warnings

from build_grammar_audio import example_speaker, speech_text
from build_vocab_audio import VOICES_PATH
from check_vocab_tts import dtw_dist, feat, kana_sentence
import check_vocab_tts
from grammar_common import GAUDIO_DIR, LEVEL_KEYS, load_all_points, load_questions, save_points, save_questions
from validate import KANJI_RE

warnings.filterwarnings("ignore")
CHECK_DIR = GAUDIO_DIR / "_check"
check_vocab_tts.CHECK_DIR = CHECK_DIR  # kana_audio 캐시 위치


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--level", choices=LEVEL_KEYS)
    args = ap.parse_args()

    vc = json.loads(VOICES_PATH.read_text(encoding="utf-8"))
    th = vc["grammar"]["check"]
    CHECK_DIR.mkdir(parents=True, exist_ok=True)
    levels = [args.level] if args.level else LEVEL_KEYS
    points = load_all_points()
    questions = {lv: load_questions(lv) for lv in levels}

    targets = []  # (kind, obj, real_audio, kana_text, speaker, label)
    for lv in levels:
        for p in points[lv]:
            for n, ex in enumerate(p["examples"], 1):
                if KANJI_RE.search(ex["text"]) and "ttsText" not in ex:
                    targets.append(("example", ex, GAUDIO_DIR / "examples" / f"{p['id']}-{n}.mp3",
                                    kana_sentence(ex["furigana"]), example_speaker(n), f"{p['id']}-{n}  {ex['text']}"))
        for q in questions[lv]:
            if KANJI_RE.search(q["fullText"]) and "ttsText" not in q:
                targets.append(("question", q, GAUDIO_DIR / "questions" / f"{q['id']}.mp3",
                                speech_text(kana_sentence(q["fullFurigana"])), "N", f"{q['id']}  {q['fullText'][:40]}"))
    targets = [t for t in targets if t[2].is_file()]
    print(f"검사 대상 {len(targets)}개 (음성이 있는 한자 예문·문항)")

    async def prep():
        sem = asyncio.Semaphore(vc["grammar"]["concurrency"])
        return await asyncio.gather(*(check_vocab_tts.kana_audio(t[3], t[4], vc, sem) for t in targets))
    kana_paths = asyncio.run(prep())

    flagged = []
    for t, kp in zip(targets, kana_paths):
        d = dtw_dist(feat(t[2]), feat(kp))
        if d > th[t[0]]:
            flagged.append((d, t))
    flagged.sort(key=lambda x: -x[0])
    print(f"\n의심 {len(flagged)}개 (기준 예문 {th['example']} · 문항 {th['question']})")
    for d, t in flagged:
        print(f"  {d:5.2f}  {t[5]}  → {t[3][:40]}")

    if args.fix and flagged:
        plevels, qlevels = set(), set()
        for _, t in flagged:
            kind, obj = t[0], t[1]
            if kind == "example":
                obj["ttsText"] = kana_sentence(obj["furigana"])
            else:
                obj["ttsText"] = kana_sentence(obj["fullFurigana"])
                qlevels.add(obj["level"].lower())
        for lv in levels:
            save_points(lv, points[lv])
        for lv in qlevels:
            save_questions(lv, questions[lv])
        print("\nttsText를 넣었습니다. validate_grammar.py → build_grammar_audio.py로 다시 생성하세요.")


if __name__ == "__main__":
    main()
