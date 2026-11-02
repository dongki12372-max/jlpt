#!/usr/bin/env python3
"""청해 문항에 해석·단어 사전(scriptKo, gloss, optionsKo)을 넣는다.

  .venv/bin/python tools/merge_annotations.py <파일.json> --check   # 검사만 (파일을 바꾸지 않음)
  .venv/bin/python tools/merge_annotations.py <파일.json>           # 검사 통과하면 레벨 파일에 넣기

파일 = { "문항 id": { "scriptKo": [...], "gloss": [[{t,w,r,m}, …], …], "optionsKo": [...] }, … }
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from merge_batch import fmt_question
from validate import QUESTIONS_DIR, ROOT, check_annotations

FIELDS = ("scriptKo", "gloss", "optionsKo")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    ann = json.loads(Path(args.file).read_text(encoding="utf-8"))
    levels = {}
    for lv in ("n5", "n4", "n3"):
        levels[lv] = json.loads((QUESTIONS_DIR / f"{lv}.json").read_text(encoding="utf-8"))
    by = {q["id"]: (lv, q) for lv, qs in levels.items() for q in qs}

    errors = []
    for qid, a in ann.items():
        if qid not in by:
            errors.append(f"{qid}: 없는 문항")
            continue
        _, q = by[qid]
        missing = [k for k in FIELDS if k not in a]
        if missing:
            errors.append(f"{qid}: 필드 없음 {missing}")
        for k in FIELDS:
            if k in a:
                q[k] = a[k]
        for g in (x for line in a.get("gloss", []) for x in line):
            bad = [k for k in ("t", "w", "r", "m") if not str(g.get(k, "")).strip()]
            if bad or set(g) - {"t", "w", "r", "m"}:
                errors.append(f"{qid}: gloss 항목 형식 {g}")
        check_annotations(q, lambda m, qid=qid: errors.append(f"{qid}: {m}"), lambda m: None)

    if errors:
        print("\n".join("✗ " + e for e in errors))
        print(f"\n오류 {len(errors)}건")
        sys.exit(1)
    if args.check:
        print(f"검사 통과 — {len(ann)}문항")
        return

    touched = {by[qid][0] for qid in ann}
    backup = {lv: (QUESTIONS_DIR / f"{lv}.json").read_text(encoding="utf-8") for lv in touched}
    for lv in touched:
        (QUESTIONS_DIR / f"{lv}.json").write_text("[\n" + ",\n".join(fmt_question(q) for q in levels[lv]) + "\n]\n", encoding="utf-8")
    v = subprocess.run([sys.executable, str(ROOT / "tools" / "validate.py")], capture_output=True, text=True)
    if v.returncode != 0:
        for lv, text in backup.items():
            (QUESTIONS_DIR / f"{lv}.json").write_text(text, encoding="utf-8")
        print(v.stdout[-3000:])
        print("validate.py 실패 — 되돌림")
        sys.exit(1)
    print(f"{len(ann)}문항에 해석·단어 사전을 넣음 ({', '.join(sorted(touched))})")


if __name__ == "__main__":
    main()
