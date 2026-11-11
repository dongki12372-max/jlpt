#!/usr/bin/env python3
"""문법 데이터 검증 (문형 + 문항).

  .venv/bin/python tools/validate_grammar.py                       # 전부
  .venv/bin/python tools/validate_grammar.py --points-batch <파일>     # 합치기 전 문형 배치를 함께 검사
  .venv/bin/python tools/validate_grammar.py --questions-batch <파일>  # 합치기 전 문항 배치를 함께 검사

오류가 하나라도 있으면 종료 코드 1 (음성 생성으로 넘어가지 않는다). 경고·분포·음성 누락은 출력만 한다.
"""
import argparse
import json
import re
import sys
from collections import Counter

from jsonschema import Draft202012Validator

from grammar_common import (GAUDIO_DIR, LEVEL_KEYS, LEVEL_RANK, POINTS_SCHEMA, QUESTIONS_SCHEMA, check_gloss_line,
                            load_all_points, load_grammar_config, load_questions)
from validate import KANJI_RE, check_furigana_markup, check_tts_reading, furigana_spans, to_hiragana

BLANK = "（　）"
SLOT = "［＿］"
STAR = "［★］"
GAP_RE = re.compile(r"［(\d+)］")
SENT_RE = re.compile(r"(?<=[.!?。])\s*")


def n_sentences(s):
    return len([x for x in SENT_RE.split(s) if x.strip()])


def check_markup(markup, plain, label, err, warn):
    """후리가나 표기 문법 + 지운 글자가 원문과 같은지."""
    check_furigana_markup(markup, label, err, warn)
    got = furigana_spans(markup)[0]
    if got != plain:
        err(f"{label}를 지운 글자가 원문과 다름\n      {got}\n      {plain}")
        return False
    return True


def check_tts(q, text_key, markup_key, err, warn, label="ttsText"):
    if "ttsText" in q:
        for is_err, msg in check_tts_reading(q[text_key], q["ttsText"], furigana_spans(q[markup_key])[1]):
            (err if is_err else warn)(f"{label}: {msg}")


def pattern_core(pattern):
    """예문에 문형이 들어 있는지 볼 때 쓰는 조각들 (〜 빼고, ／·/로 나뉜 변형 각각의 앞 2글자와 뒤 2글자).
    활용·접속에 따라 앞이나 뒤가 바뀌므로(た→の あとで) 둘 중 하나만 보여도 된다."""
    out = []
    for part in re.split(r"[／/・]", pattern):
        # （様態）·（禁止） 같은 뜻 구분 꼬리표는 빼고, （ら）れる 같은 생략 가능한 가나는 괄호만 뺀다
        core = re.sub(r"（[^）]*[一-龯][^）]*）", "", part).replace("〜", "").replace("（", "").replace("）", "").strip()
        if core:
            out += [core[:2], core[-2:]] if len(core) > 2 else [core]
    return out


# ---------- 문형 ----------
def check_point(p, level_key, cfg, err, warn):
    if p["level"].lower() != level_key:
        err(f"level {p['level']}이 파일 {level_key}.json과 다름")
    if not p["id"].startswith(f"{level_key}-g-"):
        err(f"id가 '{level_key}-g-NNN' 형식이 아님")
    if p["key"] != p["pattern"]:
        err("key는 pattern과 같아야 함")
    n_mean = len([m for m in re.split(r"[,，、]", p["meaning_ko"]) if m.strip()])
    if n_mean > 3:
        warn(f"뜻 {n_mean}개 (짧게 2개까지 권장)")
    n = n_sentences(p["explanation_ko"])
    if not 1 <= n <= 4:
        warn(f"설명이 {n}문장 (2~3문장 권장)")
    if len(p["examples"]) != cfg["examplesPerPoint"]:
        err(f"예문 {len(p['examples'])}개 (정확히 {cfg['examplesPerPoint']}개)")
    limit = cfg["exampleLength"][p["level"]]
    cores = pattern_core(p["pattern"])
    for i, ex in enumerate(p["examples"], 1):
        label = f"예문 {i}"
        if check_markup(ex["furigana"], ex["text"], label, err, warn) and "ttsText" in ex:
            for is_err, msg in check_tts_reading(ex["text"], ex["ttsText"], furigana_spans(ex["furigana"])[1]):
                (err if is_err else warn)(f"{label} ttsText: {msg}")
        for is_err, msg in check_gloss_line(ex["furigana"], ex["gloss"]):
            (err if is_err else warn)(f"{label} {msg}")
        if len(ex["text"]) > limit * 1.6:
            warn(f"{label} {len(ex['text'])}자 (기준 {limit}자 안팎)")
        hira = to_hiragana(ex["text"])
        if cores and not any(c in ex["text"] or to_hiragana(c) in hira for c in cores):
            warn(f"{label}에 문형 「{p['pattern']}」이 안 보임")


def check_points(points_by_level, cfg, errors, warnings, extra=None):
    schema = Draft202012Validator(json.loads(POINTS_SCHEMA.read_text(encoding="utf-8")))
    keys, ids, stats, all_points = {}, set(), {}, []
    for lv in LEVEL_KEYS:
        points = list(points_by_level.get(lv, []))
        if extra and extra[0] == lv:
            points += extra[1]
        bad = set()
        for e in schema.iter_errors(points):
            idx = e.absolute_path[0] if e.absolute_path else None
            pid = points[idx].get("id", f"#{idx}") if isinstance(idx, int) and isinstance(points[idx], dict) else lv
            loc = "/".join(str(x) for x in list(e.absolute_path)[1:])
            errors.append(f"{pid}: 스키마 오류 {loc or '(문형)'} — {e.message}")
            if isinstance(idx, int):
                bad.add(idx)
        for i, p in enumerate(points):
            if i in bad:
                continue
            pid = p["id"]
            err = lambda m, pid=pid: errors.append(f"{pid}: {m}")
            warn = lambda m, pid=pid: warnings.append(f"{pid}: {m}")
            if pid in ids:
                err("id 중복")
            ids.add(pid)
            if p["key"] in keys:
                err(f"key 「{p['key']}」 중복 ({keys[p['key']]['id']})")
            keys[p["key"]] = p
            check_point(p, lv, cfg, err, warn)
            all_points.append(p)
        stats[lv] = len(points)
    for p in all_points:
        for s in p["similar"]:
            if s == p["key"]:
                errors.append(f"{p['id']}: similar에 자기 자신")
            elif s not in keys:
                warnings.append(f"{p['id']}: similar 「{s}」가 문형 데이터에 없음")
    return keys, stats, all_points


# ---------- 문항 ----------
def check_options(options, err, warn, label=""):
    texts = [o["text"] for o in options]
    if len(set(texts)) != 4:
        err(f"{label}선택지 4개가 서로 다르지 않음")
    for i, o in enumerate(options, 1):
        if "furigana" in o:
            check_markup(o["furigana"], o["text"], f"{label}선택지 {i}", err, warn)
        elif KANJI_RE.search(o["text"]):
            warn(f"{label}선택지 {i}: 한자가 있는데 furigana 없음")


def check_notes(notes, answer, err, label=""):
    for i, n in enumerate(notes, 1):
        if i == answer and n.strip():
            err(f"{label}optionNotes_ko {i}(정답 자리)는 빈 문자열이어야 함")
        if i != answer and not n.strip():
            err(f"{label}optionNotes_ko {i}: 오답 설명이 비어 있음")


def check_targets(targets, level, points_by_key, err, label=""):
    for t in targets:
        p = points_by_key.get(t)
        if not p:
            err(f"{label}targets 「{t}」가 문형 데이터에 없음")
        elif LEVEL_RANK[p["level"]] > LEVEL_RANK[level]:
            err(f"{label}targets 「{t}」는 {p['level']} 문형 (문항 {level}보다 높음)")


def check_question(q, level_key, cfg, points_by_key, err, warn):
    qtype, level = q["type"], q["level"]
    if level.lower() != level_key:
        err(f"level {level}이 파일 {level_key}.json과 다름")
    if not q["id"].startswith(f"{level_key}-{qtype}-"):
        err("id가 '{레벨}-{형식}-NNN'과 맞지 않음")
    exam = cfg["levels"][level]["exam"]
    if not q["tags"]:
        warn("tags가 비어 있음")
    lines = q["fullFurigana"].split("\n")
    if len(q["gloss"]) != len(lines):
        err(f"gloss {len(q['gloss'])}줄 ≠ fullFurigana {len(lines)}줄")
    else:
        for i, (markup, gloss) in enumerate(zip(lines, q["gloss"]), 1):
            for is_err, msg in check_gloss_line(markup, gloss):
                (err if is_err else warn)(f"{i}번째 줄 {msg}")

    if qtype == "bunpou":
        stem, ans = q["stem"], q["options"][q["answer"] - 1]["text"]
        if stem.count(BLANK) != 1:
            err(f"빈칸 {BLANK}이 정확히 하나여야 함")
        elif q["fullText"] != stem.replace(BLANK, ans):
            err(f"fullText ≠ 빈칸에 정답을 넣은 문장\n      {q['fullText']}\n      {stem.replace(BLANK, ans)}")
        if q["stemFurigana"].count(BLANK) != 1:
            err("stemFurigana에도 빈칸이 하나 있어야 함")
        check_markup(q["stemFurigana"], stem, "stemFurigana", err, warn)
        if check_markup(q["fullFurigana"], q["fullText"], "fullFurigana", err, warn):
            check_tts(q, "fullText", "fullFurigana", err, warn)
        check_options(q["options"], err, warn)
        check_notes(q["optionNotes_ko"], q["answer"], err)
        check_targets(q["targets"], level, points_by_key, err)
        if not 2 <= n_sentences(q["explanation_ko"]) <= 4:
            warn(f"해설이 {n_sentences(q['explanation_ko'])}문장 (2~3문장 권장)")

    elif qtype == "narabe":
        stem = q["stem"]
        if stem.count(SLOT) != 3 or stem.count(STAR) != 1:
            err(f"자리 {SLOT} 3개와 {STAR} 1개가 있어야 함 (지금 {stem.count(SLOT)}개·{stem.count(STAR)}개)")
        else:
            order = q["order"]
            if sorted(order) != [1, 2, 3, 4]:
                err("order는 1~4를 한 번씩")
            else:
                slots = re.findall(f"{re.escape(SLOT)}|{re.escape(STAR)}", stem)
                star = slots.index(STAR)
                if q["answer"] != order[star]:
                    err(f"answer {q['answer']} ≠ ★ 자리({star + 1}번째)의 선택지 {order[star]}")
                parts = iter(q["options"][n - 1]["text"] for n in order)
                want = re.sub(f"{re.escape(SLOT)}|{re.escape(STAR)}", lambda m: next(parts), stem)
                if q["fullText"] != want:
                    err(f"fullText ≠ 순서대로 넣은 문장\n      {q['fullText']}\n      {want}")
        fs = q["stemFurigana"]
        if fs.count(SLOT) != 3 or fs.count(STAR) != 1:
            err("stemFurigana에도 자리 3개와 ★ 1개")
        check_markup(fs, stem, "stemFurigana", err, warn)
        if check_markup(q["fullFurigana"], q["fullText"], "fullFurigana", err, warn):
            check_tts(q, "fullText", "fullFurigana", err, warn)
        check_options(q["options"], err, warn)
        check_targets(q["targets"], level, points_by_key, err)
        if not 1 <= n_sentences(q["explanation_ko"]) <= 4:
            warn(f"해설이 {n_sentences(q['explanation_ko'])}문장 (2~3문장 권장)")

    elif qtype == "bunshou":
        passage, items = q["passage"], q["items"]
        if len(items) != exam["bunshou"]:
            err(f"빈칸 {len(items)}개 ({level} 실전은 {exam['bunshou']}개)")
        nums = [int(x) for x in GAP_RE.findall(passage)]
        if nums != list(range(1, len(items) + 1)):
            err(f"passage의 빈칸 ［1］~［{len(items)}］이 순서대로 하나씩이어야 함 (지금 {nums})")
        else:
            want = GAP_RE.sub(lambda m: items[int(m.group(1)) - 1]["options"][items[int(m.group(1)) - 1]["answer"] - 1]["text"], passage)
            if q["fullText"] != want:
                err(f"fullText ≠ 빈칸에 정답을 넣은 글\n      {q['fullText']}\n      {want}")
        if [int(x) for x in GAP_RE.findall(q["passageFurigana"])] != nums:
            err("passageFurigana의 빈칸이 passage와 다름")
        check_markup(q["passageFurigana"], passage, "passageFurigana", err, warn)
        if check_markup(q["fullFurigana"], q["fullText"], "fullFurigana", err, warn):
            check_tts(q, "fullText", "fullFurigana", err, warn)
        if q["fullKo"].count("\n") != passage.count("\n"):
            warn("fullKo 문단 수가 passage와 다름")
        for i, it in enumerate(items, 1):
            label = f"빈칸 {i} "
            check_options(it["options"], err, warn, label)
            check_notes(it["optionNotes_ko"], it["answer"], err, label)
            check_targets(it["targets"], level, points_by_key, err, label)
            if not 1 <= n_sentences(it["explanation_ko"]) <= 4:
                warn(f"{label}해설이 {n_sentences(it['explanation_ko'])}문장")


def question_targets(q):
    return q["targets"] if q["type"] != "bunshou" else [t for it in q["items"] for t in it["targets"]]


def check_questions(cfg, points_by_key, errors, warnings, extra=None):
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
            # oneOf 실패는 메시지가 길어서, 맞는 형식의 스키마로 다시 검사해 원인을 보여 준다
            msgs = [e.message]
            if e.validator == "oneOf" and isinstance(idx, int):
                t = items[idx].get("type")
                for sub in e.schema["oneOf"]:
                    if sub["properties"]["type"].get("const") == t:
                        sub_full = dict(sub, **{"$defs": schema.schema["$defs"]})
                        msgs = [f"{'/'.join(map(str, x.absolute_path)) or '(문항)'} — {x.message}"
                                for x in Draft202012Validator(sub_full).iter_errors(items[idx])] or msgs
            for m in msgs:
                errors.append(f"{qid}: 스키마 오류 {m}")
            if isinstance(idx, int):
                bad.add(idx)
        by_type, dist, target_use = Counter(), Counter(), Counter()
        gaps = 0
        for i, q in enumerate(items):
            if i in bad:
                continue
            qid = q["id"]
            err = lambda m, qid=qid: errors.append(f"{qid}: {m}")
            warn = lambda m, qid=qid: warnings.append(f"{qid}: {m}")
            if qid in ids:
                err("id 중복")
            ids.add(qid)
            check_question(q, lv, cfg, points_by_key, err, warn)
            by_type[q["type"]] += 1
            if q["type"] == "bunshou":
                gaps += len(q["items"])
                for it in q["items"]:
                    dist[it["answer"]] += 1
            else:
                dist[q["answer"]] += 1
            for t in set(question_targets(q)):
                target_use[(q["type"], t)] += 1
            all_q.append(q)
        for (t, k), n in target_use.items():
            if n > cfg["maxSameTargetPerType"]:
                errors.append(f"{lv}: 「{k}」가 {t} 형식 targets로 {n}번 (최대 {cfg['maxSameTargetPerType']})")
        stats[lv] = (by_type, dist, gaps)
    return stats, all_q


def print_stats(pstats, qstats, all_points, all_q, cfg):
    for lv in LEVEL_KEYS:
        level = lv.upper()
        by_type, dist, gaps = qstats[lv]
        exam = cfg["levels"][level]["exam"]
        print(f"\n== {level} — 문형 {pstats[lv]}개 / 목표 {cfg['pointTargets'][level]} · 문항 {sum(by_type.values())}개 ==")
        print("  형식별: " + ", ".join(
            f"{t} {by_type[t]}" + (f"편(빈칸 {gaps}, 실전 {exam[t]})" if t == "bunshou" else f" (실전 {exam[t]})") for t in cfg["typeOrder"]))
        if dist:
            print("  정답 분포: " + " ".join(f"{a}:{dist[a]}" for a in range(1, 5)))
    used = {t for q in all_q for t in question_targets(q)}
    unused = [p["key"] for p in all_points if p["key"] not in used]
    print(f"\n  문항에 한 번도 안 나온 문형: {len(unused)}개")
    miss_e = [f"{p['id']}-{i}" for p in all_points for i in (1, 2) if not (GAUDIO_DIR / "examples" / f"{p['id']}-{i}.mp3").is_file()]
    miss_q = [q["id"] for q in all_q if not (GAUDIO_DIR / "questions" / f"{q['id']}.mp3").is_file()]
    print(f"  예문 음성 없음: {len(miss_e)}개 · 문항 음성 없음: {len(miss_q)}개")


def main():
    ap = argparse.ArgumentParser(description="문법 데이터 검증")
    ap.add_argument("--points-batch", help="합치기 전 문형 배치 (같은 레벨, id 없어도 됨)")
    ap.add_argument("--questions-batch", help="합치기 전 문항 배치 (같은 레벨)")
    args = ap.parse_args()

    cfg = load_grammar_config()
    errors, warnings = [], []
    extra = None
    if args.points_batch:
        batch = json.loads(open(args.points_batch, encoding="utf-8").read())
        levels = {p.get("level") for p in batch}
        if len(levels) != 1 or not levels <= set(LEVEL_RANK):
            print(f"배치의 level이 하나가 아님: {sorted(map(str, levels))}")
            sys.exit(1)
        lv = levels.pop().lower()
        for i, p in enumerate(batch, 1):
            p.setdefault("id", f"{lv}-g-{900 + i:03d}")  # 합칠 때 실제 번호를 붙인다
            p.setdefault("key", p.get("pattern"))
        extra = (lv, batch)
    keys, pstats, all_points = check_points(load_all_points(), cfg, errors, warnings, extra)

    qextra = None
    if args.questions_batch:
        qb = json.loads(open(args.questions_batch, encoding="utf-8").read())
        lvs = {str(q.get("id", "")).split("-")[0] for q in qb}
        if len(lvs) != 1 or not lvs <= set(LEVEL_KEYS):
            print(f"문항 배치의 id 레벨이 하나가 아님: {sorted(lvs)}")
            sys.exit(1)
        qextra = (lvs.pop(), qb)
    qstats, all_q = check_questions(cfg, keys, errors, warnings, qextra)
    print_stats(pstats, qstats, all_points, all_q, cfg)

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
    print(f"\n검증 통과 — 문형 {len(all_points)}개 · 문항 {len(all_q)}개")


if __name__ == "__main__":
    main()
