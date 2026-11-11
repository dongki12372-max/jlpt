#!/usr/bin/env python3
"""문법 예문·문항 완성 문장에 단어 사전(gloss)을 넣는다.

  .venv/bin/python tools/merge_grammar_gloss.py <파일…> --check   # 검사만 (데이터를 바꾸지 않음)
  .venv/bin/python tools/merge_grammar_gloss.py <파일…>           # 검사 통과하면 데이터에 넣기
  .venv/bin/python tools/merge_grammar_gloss.py --worklist <폴더>   # 쓸 대상 목록 만들기 (id, 줄, 문장, 해석)

파일 한 줄 = id <탭> 줄 번호 <탭> t|w|r|m <탭> t|w|r|m …
  id = 예문 id(n5-g-001-1) 또는 문항 id(n5-bunpou-001), 줄 번호 = 완성 문장(글)의 \\n으로 나눈 줄 (1부터, 예문은 늘 1)
  t = 문장에 나온 모양, w = 사전형(문형은 〜로 시작 — 문형 사전의 key와 같으면 사전 창에서 이어진다), r = 사전형 읽기, m = 한국어 뜻
"""
import argparse
import sys
from pathlib import Path

from grammar_common import (LEVEL_KEYS, check_gloss_line, load_all_points, load_questions, save_points, save_questions)


def targets():
    """{(id, 줄): (후리가나 문장, 해석, 넣을 곳)} — 넣을 곳 = ("ex", 예문) 또는 ("q", 문항, 줄 index)."""
    out, points, questions = {}, load_all_points(), {lv: load_questions(lv) for lv in LEVEL_KEYS}
    for lv in LEVEL_KEYS:
        for p in points[lv]:
            for n, ex in enumerate(p["examples"], 1):
                out[(f"{p['id']}-{n}", 1)] = (ex["furigana"], ex["meaning_ko"], ("ex", ex))
        for q in questions[lv]:
            lines, ko = q["fullFurigana"].split("\n"), q["fullKo"].split("\n")
            for i, line in enumerate(lines):
                out[(q["id"], i + 1)] = (line, ko[i] if len(ko) == len(lines) else q["fullKo"].replace("\n", " "), ("q", q, i, len(lines)))
    return out, points, questions


def parse(path):
    for no, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        cols = raw.split("\t")
        try:
            gloss = []
            for c in cols[2:]:
                if c.strip():
                    t, w, r, m = (x.strip() for x in c.split("|"))
                    gloss.append({"t": t, "w": w, "r": r, "m": m})
            yield (cols[0].strip(), int(cols[1])), gloss, None
        except (ValueError, IndexError):
            yield None, None, f"{Path(path).name}:{no} 형식 오류 — {raw[:60]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--worklist")
    args = ap.parse_args()
    tg, points, questions = targets()

    if args.worklist:
        from grammar_common import furigana_units
        groups = {}
        for (tid, line), (markup, ko, put) in tg.items():
            name = f"{tid[:2]}-{'points' if put[0] == 'ex' else 'questions'}"
            groups.setdefault(name, []).append(f"{tid}\t{line}\t{''.join(u[0] for u in furigana_units(markup))}\t{markup}\t{ko}")
        for name, rows in groups.items():
            Path(args.worklist, f"{name}.tsv").write_text("\n".join(rows) + "\n", encoding="utf-8")
            print(name, len(rows))
        return

    errors, warnings, got = [], [], {}
    for f in args.files:
        for key, gloss, bad in parse(f):
            if bad:
                errors.append(bad)
            elif key not in tg:
                errors.append(f"{key[0]} {key[1]}번째 줄: 없는 대상")
            else:
                got[key] = gloss
                for is_err, msg in check_gloss_line(tg[key][0], gloss):
                    (errors if is_err else warnings).append(f"{key[0]} {key[1]}번째 줄: {msg}")
    # 문항은 모든 줄이 있어야 넣는다
    for key in got:
        put = tg[key][2]
        if put[0] == "q":
            missing = [i for i in range(1, put[3] + 1) if (key[0], i) not in got]
            if missing and key[1] == min(k[1] for k in got if k[0] == key[0]):
                errors.append(f"{key[0]}: {missing}번째 줄이 없음")
    for w in warnings:
        print(f"  ⚠ {w}")
    for e in errors:
        print(f"  ✗ {e}")
    print(f"{len(got)}줄 · 오류 {len(errors)} · 경고 {len(warnings)}")
    if errors:
        sys.exit(1)
    if args.check:
        return
    for key, gloss in got.items():
        put = tg[key][2]
        if put[0] == "ex":
            put[1]["gloss"] = gloss
        else:
            q = put[1]
            q.setdefault("gloss", [[] for _ in range(put[3])])[put[2]] = gloss
    for lv in LEVEL_KEYS:
        save_points(lv, points[lv])
        save_questions(lv, questions[lv])
    print("넣었습니다")


if __name__ == "__main__":
    main()
