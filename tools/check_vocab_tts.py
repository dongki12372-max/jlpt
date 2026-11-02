#!/usr/bin/env python3
"""단어·예문 음성이 의도한 읽기대로 나오는지 확인 (개발용).

  .venv/bin/python tools/check_vocab_tts.py                 # 의심 목록 출력
  .venv/bin/python tools/check_vocab_tts.py --fix-words     # 의심 단어에 ttsText(=읽기) 넣기
  .venv/bin/python tools/check_vocab_tts.py --fix-examples  # 의심 예문에 ttsText(후리가나를 가나로) 넣기
  .venv/bin/python tools/check_vocab_tts.py --fix-questions # 의심 문항 완성 문장에 ttsText 넣기 (예문 기준값 사용)

방법: 실제 음성(한자 표기를 읽힌 것)과, 같은 화자로 가나 읽기를 읽힌 음성을 MFCC(0차 제외, 계수별 정규화) + DTW로
비교한다. 같은 읽기면 거리가 작고(대략 2 이하) 다른 읽기면 커진다(2.5 이상). 기준값은 voices.json vocab.check.
가나 음성은 audio/vocab/_check/에 캐시한다. 이미 ttsText가 있는 항목은 건너뛴다.
"""
import argparse
import asyncio
import hashlib
import json
import warnings

import librosa

from build_vocab_audio import VOICES_PATH, example_speaker, synth
from validate import FURIGANA_RE, KANJI_RE
from vocab_common import LEVEL_KEYS, VAUDIO_DIR, load_all_words, load_questions, save_questions, save_words

warnings.filterwarnings("ignore")
CHECK_DIR = VAUDIO_DIR / "_check"


def feat(path):
    y, sr = librosa.load(str(path), sr=16000)
    y, _ = librosa.effects.trim(y, top_db=30)
    m = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)[1:]
    return (m - m.mean(1, keepdims=True)) / (m.std(1, keepdims=True) + 1e-6)


def dtw_dist(a, b):
    d, wp = librosa.sequence.dtw(X=a, Y=b, metric="euclidean")
    return float(d[-1, -1] / len(wp))


def kana_sentence(furigana):
    return FURIGANA_RE.sub(r"\2", furigana)


async def kana_audio(text, spk, vc, sem):
    spec = vc["voices"][spk]
    h = hashlib.sha1(json.dumps([text, spec], ensure_ascii=False).encode()).hexdigest()[:16]
    out = CHECK_DIR / f"{h}.mp3"
    if not out.is_file():
        async with sem:
            await synth(text, spec, out, vc["tts"]["retries"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix-words", action="store_true")
    ap.add_argument("--fix-examples", action="store_true")
    ap.add_argument("--fix-questions", action="store_true", help="의심 문항 완성 문장에 ttsText(후리가나를 가나로) 넣기")
    ap.add_argument("--level", choices=LEVEL_KEYS)
    args = ap.parse_args()

    vc = json.loads(VOICES_PATH.read_text(encoding="utf-8"))
    th = vc["vocab"]["check"]
    CHECK_DIR.mkdir(parents=True, exist_ok=True)
    words = load_all_words()
    levels = [args.level] if args.level else LEVEL_KEYS

    targets = []  # (kind, word, real_audio, kana_text, speaker)
    for lv in levels:
        for w in words[lv]:
            if KANJI_RE.search(w["word"]) and "ttsText" not in w:
                targets.append(("word", w, VAUDIO_DIR / "words" / f"{w['id']}.mp3", w["reading"], "N"))  # 〜人의 reading은 にん
            ex = w["example"]
            if KANJI_RE.search(ex["text"]) and "ttsText" not in ex:
                targets.append(("example", w, VAUDIO_DIR / "examples" / f"{w['id']}.mp3",
                                kana_sentence(ex["furigana"]), example_speaker(w["id"])))
    questions = {lv: load_questions(lv) for lv in levels}
    for lv in levels:
        for q in questions[lv]:
            if KANJI_RE.search(q["fullText"]) and "ttsText" not in q:
                targets.append(("question", q, VAUDIO_DIR / "questions" / f"{q['id']}.mp3", kana_sentence(q["fullFurigana"]), "N"))
    targets = [t for t in targets if t[2].is_file()]
    print(f"검사 대상 {len(targets)}개 (음성이 있는 한자 단어·예문)")

    async def prep():
        sem = asyncio.Semaphore(vc["vocab"]["concurrency"])
        return await asyncio.gather(*(kana_audio(t[3], t[4], vc, sem) for t in targets))
    kana_paths = asyncio.run(prep())

    flagged = {"word": [], "example": [], "question": []}
    for t, kp in zip(targets, kana_paths):
        kind, w = t[0], t[1]
        d = dtw_dist(feat(t[2]), feat(kp))
        if d > th.get(kind, th["example"]):
            flagged[kind].append((d, w, t[3]))

    names = {"word": "단어", "example": "예문", "question": "문항 완성 문장"}
    for kind in ("word", "example", "question"):
        rows = sorted(flagged[kind], key=lambda x: -x[0])
        print(f"\n{names[kind]} 의심 {len(rows)}개 (기준 {th.get(kind, th['example'])})")
        for d, w, kana in rows:
            shown = w["word"] if kind == "word" else w["example"]["text"] if kind == "example" else w["fullText"]
            print(f"  {d:5.2f}  {w['id']}  {shown}  → {kana}")

    changed = set()
    if args.fix_words:
        for _, w, kana in flagged["word"]:
            w["ttsText"] = kana
            changed.add(w["level"].lower())
    if args.fix_examples:
        for _, w, kana in flagged["example"]:
            w["example"]["ttsText"] = kana
            changed.add(w["level"].lower())
    qchanged = set()
    if args.fix_questions:
        for _, q, kana in flagged["question"]:
            q["ttsText"] = kana
            qchanged.add(q["level"].lower())
    for lv in changed:
        save_words(lv, words[lv])
    for lv in qchanged:
        save_questions(lv, questions[lv])
    changed |= qchanged
    if changed:
        print("\nttsText를 넣었습니다. validate_vocab.py → build_vocab_audio.py로 다시 생성하세요.")


if __name__ == "__main__":
    main()
