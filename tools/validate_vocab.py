#!/usr/bin/env python3
"""문자·어휘 데이터 검증 (단어 + 문항).

  .venv/bin/python tools/validate_vocab.py             # 전부
  .venv/bin/python tools/validate_vocab.py --words-batch <파일>   # 아직 합치지 않은 단어 배치를 함께 검사
  .venv/bin/python tools/validate_vocab.py --partial  # 청해 단어를 다 넣기 전 중간 상태 (누락은 경고)

오류가 하나라도 있으면 종료 코드 1 (음성 생성으로 넘어가지 않는다). 경고·분포·음성 누락은 출력만 한다.
"""
import argparse
import json
import re
import sys
from collections import Counter

from jsonschema import Draft202012Validator

from validate import KANJI_RE, check_furigana_markup, check_tts_reading, furigana_spans, to_hiragana
from vocab_common import (LEVEL_KEYS, LEVEL_RANK, QUESTIONS_SCHEMA, VAUDIO_DIR, WORDS_SCHEMA,
                          listening_vocab, load_all_words, load_questions, load_vocab_config)

KATA_RE = re.compile(r"[ァ-ヺ]")


def example_has_word(w):
    """예문에 그 단어가 (활용형이라도) 들어 있는지 — 어간 기준, 경고용."""
    text, word = w["example"]["text"], w["word"].lstrip("〜")  # 조수사·접사(〜人, 〜屋)는 〜를 빼고 찾는다
    if w["kind"] == "expression":
        return True
    stem = word
    if w["pos"] == "verb":
        stem = word[:-2] if word.endswith("する") and len(word) > 2 else word[:-1]
    elif w["pos"] == "i-adj":
        stem = word[:-1]
    stem = stem or word
    return stem in text or to_hiragana(stem) in to_hiragana(text)


def check_word(w, level_key, cfg, err, warn):
    word, reading = w["word"], w["reading"]
    if w["level"].lower() != level_key:
        err(f"level {w['level']}이 파일 {level_key}.json과 다름")
    if not w["id"].startswith(f"{level_key}-w-"):
        err(f"id가 '{level_key}-w-NNNN' 형식이 아님")
    if w["key"] != f"{word}|{reading}":
        err(f"key가 「{word}|{reading}」가 아님")

    # 읽기: 히라가나 (외래어는 가타카나 허용)
    if KATA_RE.search(reading) and w["pos"] != "katakana" and not KATA_RE.search(word):
        warn("읽기에 가타카나가 있는데 외래어(katakana)가 아님")
    if not KANJI_RE.search(word):
        if to_hiragana(word.lstrip("〜")) != to_hiragana(reading):
            err(f"가나 단어인데 표기와 읽기가 다름 ({word} / {reading})")
    # 단어 음성 교정
    if "ttsText" in w:
        for is_err, msg in check_tts_reading(word, w["ttsText"], [(0, len(word), reading)]):
            (err if is_err else warn)(f"ttsText: {msg}")

    # 뜻
    n_mean = len([m for m in re.split(r"[,，、]", w["meaning_ko"]) if m.strip()])
    if n_mean > cfg["meaningMax"]:
        err(f"뜻 {n_mean}개 (최대 {cfg['meaningMax']}개)")

    # 예문
    ex = w["example"]
    check_furigana_markup(ex["furigana"], "예문", err, warn)
    plain, spans = furigana_spans(ex["furigana"])
    if plain != ex["text"]:
        err(f"예문 furigana를 지운 글자가 text와 다름\n      furigana: {plain}\n      text    : {ex['text']}")
    elif "ttsText" in ex:
        for is_err, msg in check_tts_reading(ex["text"], ex["ttsText"], spans):
            (err if is_err else warn)(f"예문 ttsText: {msg}")
    limit = cfg["exampleLength"][w["level"]]
    if len(ex["text"]) > limit * 1.6:
        warn(f"예문 {len(ex['text'])}자 (기준 {limit}자 안팎)")
    if not example_has_word(w):
        warn(f"예문에 「{word}」가 없음")
    if not ex["meaning_ko"].strip():
        err("예문 해석이 비어 있음")


def check_words(words_by_level, cfg, errors, warnings, extra=None, partial=False):
    """단어 파일 전체. extra = (level_key, [단어]) — 합치기 전 배치."""
    schema = Draft202012Validator(json.loads(WORDS_SCHEMA.read_text(encoding="utf-8")))
    keys, ids = {}, {}
    lv_vocab = listening_vocab()
    stats = {}
    all_words = []
    for lv in LEVEL_KEYS:
        words = list(words_by_level.get(lv, []))
        if extra and extra[0] == lv:
            words += extra[1]
        bad = set()
        for e in schema.iter_errors(words):
            idx = e.absolute_path[0] if e.absolute_path else None
            wid = words[idx].get("id", f"#{idx}") if isinstance(idx, int) and isinstance(words[idx], dict) else lv
            loc = "/".join(str(p) for p in list(e.absolute_path)[1:])
            errors.append(f"{wid}: 스키마 오류 {loc or '(단어)'} — {e.message}")
            if isinstance(idx, int):
                bad.add(idx)
        pos_c, kind_c = Counter(), Counter()
        for i, w in enumerate(words):
            if i in bad:
                continue
            wid = w["id"]
            err = lambda m, wid=wid: errors.append(f"{wid}: {m}")
            warn = lambda m, wid=wid: warnings.append(f"{wid}: {m}")
            if wid in ids:
                err(f"id 중복 ({ids[wid]})")
            ids[wid] = lv
            if w["key"] in keys:
                err(f"key 「{w['key']}」 중복 ({keys[w['key']]})")
            keys[w["key"]] = wid
            check_word(w, lv, cfg, err, warn)
            # 청해 출처는 실제로 그 문항 vocab에 있어야 한다
            for s in w["sources"]:
                if s.startswith("listening:"):
                    qid = s.split(":", 1)[1]
                    if w["key"] not in lv_vocab or qid not in lv_vocab[w["key"]]["ids"]:
                        err(f"출처 {s}의 vocab에 이 단어가 없음 (import_listening_vocab.py로 다시 맞추기)")
            pos_c[w["pos"]] += 1
            kind_c[w["kind"]] += 1
            all_words.append(w)
        stats[lv] = (len(words), pos_c, kind_c)

    # 청해 vocab(word·expression)은 모두 단어 데이터에 있어야 한다
    missing = [k for k in lv_vocab if k not in keys]
    if missing:
        (warnings if partial else errors).append(f"청해 vocab {len(missing)}개가 단어 데이터에 없음 (import_listening_vocab.py): " + ", ".join(missing[:10])
                      + (" …" if len(missing) > 10 else ""))
    for k, v in lv_vocab.items():
        if k in keys:
            w = next(x for x in all_words if x["key"] == k)
            want = {f"listening:{i}" for i in v["ids"]}
            lacking = want - set(w["sources"])
            if lacking:
                errors.append(f"{w['id']}: 청해 출처 누락 {sorted(lacking)} (import_listening_vocab.py)")

    for w in all_words:
        for s in w.get("similar", []):
            if s not in keys:
                warnings.append(f"{w['id']}: similar 「{s}」가 단어 데이터에 없음")
            elif s == w["key"]:
                errors.append(f"{w['id']}: similar에 자기 자신")
    return keys, stats, all_words


UNDER_RE = re.compile(r"\[\[([^\[\]]+)\]\]")
BLANK = "（　）"
KANA_ONLY_RE = re.compile(r"^[ぁ-ゖァ-ヺー〜]+$")


def reading_of(full_furigana, start, end):
    """fullFurigana에서 본문 [start, end) 구간의 읽기 (후리가나가 구간에 걸치면 그 단위 전체)."""
    plain, spans = furigana_spans(full_furigana)
    out, k = [], start
    for s, e, r in spans:
        if e <= start or s >= end:
            continue
        out.append(plain[k:s] if s > k else "")
        out.append(r)
        k = e
    out.append(plain[k:end] if end > k else "")
    return "".join(out)


def check_question(q, level_key, cfg, words_by_key, err, warn):
    qtype, level = q["type"], q["level"]
    if level.lower() != level_key:
        err(f"level {level}이 파일 {level_key}.json과 다름")
    if not q["id"].startswith(f"{level_key}-{qtype}-"):
        err("id가 '{레벨}-{유형}-NNN'과 맞지 않음")
    if qtype not in cfg["levels"][level]["exam"]:
        err(f"{level}에는 {qtype} 유형이 없음")

    stem, sfuri = q["stem"], q["stemFurigana"]
    opts = [o["text"] for o in q["options"]]
    ans = opts[q["answer"] - 1]
    if len(set(opts)) != 4:
        err("선택지 4개가 서로 다르지 않음")

    # 후리가나 문법·일치
    for label, markup, plain in (("stemFurigana", sfuri, stem), ("fullFurigana", q["fullFurigana"], q["fullText"])):
        if not markup and not plain:
            continue
        # 漢字読み의 밑줄 한자어는 일부러 후리가나가 없다 → 그 부분은 '후리가나 없는 한자' 검사에서 뺀다
        body = UNDER_RE.sub("", markup) if (qtype == "yomi" and label == "stemFurigana") else UNDER_RE.sub(r"\1", markup)
        check_furigana_markup(body, label, err, warn)
        if furigana_spans(markup)[0] != plain:
            err(f"{label}를 지운 글자가 원문과 다름\n      {furigana_spans(markup)[0]}\n      {plain}")
    for i, o in enumerate(q["options"], 1):
        if "furigana" in o:
            check_furigana_markup(o["furigana"], f"선택지 {i}", err, warn)
            if furigana_spans(o["furigana"])[0] != o["text"]:
                err(f"선택지 {i}: furigana를 지운 글자가 text와 다름")
        elif KANJI_RE.search(o["text"]) and qtype not in ("hyouki",):
            warn(f"선택지 {i}: 한자가 있는데 furigana 없음")
    if "ttsText" in q:
        for is_err, msg in check_tts_reading(q["fullText"], q["ttsText"], furigana_spans(q["fullFurigana"])[1]):
            (err if is_err else warn)(f"ttsText: {msg}")

    # 유형별 문장 모양과 완성 문장
    unders = UNDER_RE.findall(stem)
    if qtype == "youhou":
        if stem or sfuri:
            err("用法은 stem·stemFurigana를 비워야 함")
        if not q.get("word"):
            err("用法은 word(제시 단어)가 필요함")
        if q["fullText"] != ans:
            err("用法의 fullText는 정답 선택지 문장과 같아야 함")
        # 활용형도 찾도록 끝의 가나 한 글자(写す→写, 高い→高)를 빼고 본다
        w = q.get("word", "")
        stem = w[:-1] if len(w) > 1 and re.match(r"[ぁ-ゖ]", w[-1]) else w
        if w and not any(stem in o for o in opts):
            warn("선택지 문장에 제시 단어가 안 보임")
    else:
        if "word" in q:
            err("word는 用法 전용")
        if qtype == "bunmyaku":
            if stem.count(BLANK) != 1 or unders:
                err(f"文脈規定은 빈칸 {BLANK} 하나 (밑줄 없음)")
            elif q["fullText"] != stem.replace(BLANK, ans):
                err(f"fullText ≠ 빈칸에 정답을 넣은 문장\n      {q['fullText']}\n      {stem.replace(BLANK, ans)}")
            if sfuri.count(BLANK) != 1:
                err("stemFurigana에도 빈칸이 하나 있어야 함")
        else:
            if len(unders) != 1 or BLANK in stem:
                err("밑줄 [[ ]]이 정확히 하나여야 함")
            else:
                u = unders[0]
                start = stem.index("[[")
                if qtype == "hyouki":
                    want = UNDER_RE.sub(ans, stem)
                else:
                    want = UNDER_RE.sub(r"\1", stem)
                if q["fullText"] != want:
                    err(f"fullText가 맞지 않음\n      {q['fullText']}\n      {want}")
                elif qtype == "yomi":
                    if not KANJI_RE.search(u):
                        err("漢字読み 밑줄 부분에 한자가 없음")
                    r = reading_of(q["fullFurigana"], start, start + len(u))
                    if to_hiragana(r) != to_hiragana(ans):
                        err(f"정답 「{ans}」 ≠ 밑줄 「{u}」의 읽기 「{r}」(fullFurigana)")
                elif qtype == "hyouki":
                    if not KANA_ONLY_RE.match(u):
                        err("表記 밑줄 부분은 가나여야 함")
                    r = reading_of(q["fullFurigana"], start, start + len(ans))
                    if to_hiragana(r) != to_hiragana(u):
                        err(f"밑줄 「{u}」 ≠ 정답 「{ans}」의 읽기 「{r}」(fullFurigana)")
        # 밑줄 부분 후리가나 규칙
        su = UNDER_RE.findall(sfuri)
        if qtype in ("yomi", "hyouki", "iikae") and len(su) != 1:
            err("stemFurigana에도 밑줄 [[ ]]이 하나 있어야 함")
        if qtype == "yomi" and su and "{" in su[0]:
            err("漢字読み: 밑줄 친 한자어에 후리가나를 붙이면 안 됨")

    # 선택지 형태 (후리가나가 답을 알려 주지 않게)
    if qtype == "yomi":
        for i, o in enumerate(q["options"], 1):
            if not KANA_ONLY_RE.match(o["text"]):
                err(f"漢字読み 선택지 {i}는 가나만")
            if "furigana" in o:
                err(f"漢字読み 선택지 {i}에 furigana 금지")
    if qtype == "hyouki":
        for i, o in enumerate(q["options"], 1):
            if not KANJI_RE.search(o["text"]):
                err(f"表記 선택지 {i}에 한자가 없음")
            if "furigana" in o:
                err(f"表記 선택지 {i}에 furigana 금지 (답이 드러남)")

    # 오답 설명
    notes = q["optionNotes_ko"]
    for i, n in enumerate(notes, 1):
        if i == q["answer"] and n.strip():
            err(f"optionNotes_ko {i}(정답 자리)는 빈 문자열이어야 함")
        if i != q["answer"] and not n.strip():
            err(f"optionNotes_ko {i}: 오답 설명이 비어 있음")

    # targets
    for t in q["targets"]:
        w = words_by_key.get(t)
        if not w:
            err(f"targets 「{t}」가 단어 데이터에 없음")
        elif LEVEL_RANK[w["level"]] > LEVEL_RANK[level]:
            err(f"targets 「{t}」는 {w['level']} 단어 (문항 {level}보다 높음)")
    n_sent = len([x for x in re.split(r"(?<=[.!?。])\s*", q["explanation_ko"]) if x.strip()])
    if not 2 <= n_sent <= 4:
        warn(f"해설이 {n_sent}문장 (2~3문장 권장)")
    if not q["tags"]:
        warn("tags가 비어 있음")


def check_questions(cfg, words_by_key, errors, warnings, extra=None):
    schema = Draft202012Validator(json.loads(QUESTIONS_SCHEMA.read_text(encoding="utf-8")))
    ids, stats, all_q = set(), {}, []
    for lv in LEVEL_KEYS:
        items = load_questions(lv)
        if extra and extra[0] == lv:
            items = items + extra[1]
        bad = set()
        for e in schema.iter_errors(items):
            idx = e.absolute_path[0] if e.absolute_path else None
            qid = items[idx].get("id", f"#{idx}") if isinstance(idx, int) and isinstance(items[idx], dict) else lv
            loc = "/".join(str(p) for p in list(e.absolute_path)[1:])
            errors.append(f"{qid}: 스키마 오류 {loc or '(문항)'} — {e.message}")
            if isinstance(idx, int):
                bad.add(idx)
        by_type, dist, target_use = Counter(), Counter(), Counter()
        for i, q in enumerate(items):
            if i in bad:
                continue
            qid = q["id"]
            err = lambda m, qid=qid: errors.append(f"{qid}: {m}")
            warn = lambda m, qid=qid: warnings.append(f"{qid}: {m}")
            if qid in ids:
                err("id 중복")
            ids.add(qid)
            check_question(q, lv, cfg, words_by_key, err, warn)
            by_type[q["type"]] += 1
            dist[q["answer"]] += 1
            for t in q["targets"]:
                target_use[(q["type"], t)] += 1
            all_q.append(q)
        for (t, k), n in target_use.items():
            if n > cfg["maxSameTargetPerType"]:
                errors.append(f"{lv}: 「{k}」가 {t} 유형 targets로 {n}번 (최대 {cfg['maxSameTargetPerType']})")
        stats[lv] = (by_type, dist)
    return stats, all_q


def print_question_stats(stats, all_q, cfg):
    for lv in LEVEL_KEYS:
        by_type, dist = stats[lv]
        level = lv.upper()
        exam = cfg["levels"][level]["exam"]
        print(f"\n== {level} 문제 — {sum(by_type.values())}문항 ==")
        print("  유형별: " + ", ".join(f"{t} {by_type[t]} (실전 {exam[t]})" for t in cfg["typeOrder"] if t in exam))
        if dist:
            print("  정답 분포: " + " ".join(f"{a}:{dist[a]}" for a in range(1, 5)))
    miss = [q["id"] for q in all_q if not (VAUDIO_DIR / "questions" / f"{q['id']}.mp3").is_file()]
    print(f"\n  문항 음성 없음: {len(miss)}문항" + (f" — {', '.join(miss[:10])}" + (" …" if len(miss) > 10 else "") if miss else ""))


def print_word_stats(stats, cfg):
    for lv in LEVEL_KEYS:
        n, pos_c, kind_c = stats[lv]
        level = lv.upper()
        print(f"\n== {level} 단어 ({lv}.json) — {n}개 / 목표 {cfg['wordTargets'][level]} ==")
        print("  품사: " + ", ".join(f"{p} {pos_c[p]}" for p in cfg["pos"] if pos_c[p]))
        print("  kind: " + ", ".join(f"{k} {c}" for k, c in kind_c.items()))


def missing_word_audio(all_words):
    miss_w = [w["id"] for w in all_words if not (VAUDIO_DIR / "words" / f"{w['id']}.mp3").is_file()]
    miss_e = [w["id"] for w in all_words if not (VAUDIO_DIR / "examples" / f"{w['id']}.mp3").is_file()]
    return miss_w, miss_e


def main():
    ap = argparse.ArgumentParser(description="문자·어휘 데이터 검증")
    ap.add_argument("--words-batch", help="합치기 전 단어 배치 파일 (같은 레벨 단어 배열, id 없어도 됨)")
    ap.add_argument("--questions-batch", help="합치기 전 문항 배치 파일 (같은 레벨 문항 배열)")
    ap.add_argument("--partial", action="store_true",
                    help="청해 단어를 아직 다 넣지 않은 중간 상태: '청해 vocab이 단어 데이터에 없음'을 경고로 (합치기·음성 생성용)")
    args = ap.parse_args()

    cfg = load_vocab_config()
    errors, warnings = [], []
    extra = None
    if args.words_batch:
        batch = json.loads(open(args.words_batch, encoding="utf-8").read())
        levels = {w.get("level") for w in batch}
        if len(levels) != 1 or not levels <= set(LEVEL_RANK):
            print(f"배치의 level이 하나가 아님: {sorted(map(str, levels))}")
            sys.exit(1)
        lv = levels.pop().lower()
        for i, w in enumerate(batch, 1):
            w.setdefault("id", f"{lv}-w-{9000 + i:04d}")  # 합칠 때 실제 번호를 붙인다
        extra = (lv, batch)

    keys, stats, all_words = check_words(load_all_words(), cfg, errors, warnings, extra, args.partial)
    print_word_stats(stats, cfg)
    miss_w, miss_e = missing_word_audio(all_words)
    print(f"\n  단어 음성 없음: {len(miss_w)}개 · 예문 음성 없음: {len(miss_e)}개")

    qextra = None
    if args.questions_batch:
        qb = json.loads(open(args.questions_batch, encoding="utf-8").read())
        lvs = {str(q.get("id", "")).split("-")[0] for q in qb}
        if len(lvs) != 1 or not lvs <= set(LEVEL_KEYS):
            print(f"문항 배치의 id 레벨이 하나가 아님: {sorted(lvs)}")
            sys.exit(1)
        qextra = (lvs.pop(), qb)
    words_by_key = {w["key"]: w for w in all_words}
    qstats, all_q = check_questions(cfg, words_by_key, errors, warnings, qextra)
    print_question_stats(qstats, all_q, cfg)
    # 단어의 vocab:{문항} 출처는 그 문항 targets와 맞아야 한다 (import_listening_vocab.py가 맞춘다)
    want_src = {}
    for q in all_q:
        for t in q["targets"]:
            want_src.setdefault(t, set()).add(f"vocab:{q['id']}")
    for w in all_words:
        have = {s for s in w["sources"] if s.startswith("vocab:")}
        if not qextra and have != want_src.get(w["key"], set()):
            errors.append(f"{w['id']}: vocab 출처가 문항 targets와 다름 (import_listening_vocab.py로 맞추기)")

    if warnings:
        print(f"\n경고 {len(warnings)}건")
        for w in warnings:
            print("  ⚠ " + w)
    if errors:
        print(f"\n오류 {len(errors)}건")
        for e in errors:
            print("  ✗ " + e)
        print("\n검증 실패")
        sys.exit(1)
    print(f"\n검증 통과 — 단어 {len(all_words)}개 · 문항 {len(all_q)}개")


if __name__ == "__main__":
    main()
