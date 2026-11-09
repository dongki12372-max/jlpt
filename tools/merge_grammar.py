#!/usr/bin/env python3
"""작성한 문법 배치를 레벨 파일에 합친다 (서식 유지).

  .venv/bin/python tools/merge_grammar.py points batch.json      # 문형 (id·key는 자동으로 붙임)
  .venv/bin/python tools/merge_grammar.py questions batch.json   # 문항
  [--allow-warnings]   배치에 경고가 있어도 합치기 (기본은 거부)

validate_grammar.py가 배치와 함께 통과해야 합친다.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from grammar_common import (ROOT, load_points, load_questions, next_point_id, ordered, POINT_FIELDS, save_points,
                            save_questions)


def validate(flag, path, ids, allow_warnings):
    v = subprocess.run([sys.executable, str(ROOT / "tools" / "validate_grammar.py"), flag, path], capture_output=True, text=True)
    out = v.stdout + v.stderr
    if v.returncode != 0:
        print(out[-6000:])
        print("검증 실패 — 합치지 않음")
        sys.exit(1)
    batch_warn = [l for l in out.splitlines() if "⚠" in l and any(f" {i}:" in l for i in ids)]
    if batch_warn and not allow_warnings:
        print("\n".join(batch_warn))
        print("배치에 경고가 있음 — 합치지 않음 (--allow-warnings로 허용)")
        sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["points", "questions"])
    ap.add_argument("batch")
    ap.add_argument("--allow-warnings", action="store_true")
    args = ap.parse_args()
    batch = json.loads(Path(args.batch).read_text(encoding="utf-8"))

    if args.kind == "points":
        lv = batch[0]["level"].lower()
        points = load_points(lv)
        for p in batch:
            p.pop("id", None)
            p["key"] = p["pattern"]
        # 실제 id를 붙인 뒤 검사 (경고 줄을 id로 찾는다)
        ids = []
        tmp_all = list(points)
        for p in batch:
            p["id"] = next_point_id(lv, tmp_all)
            tmp_all.append(p)
            ids.append(p["id"])
        batch = [ordered(p, POINT_FIELDS) for p in batch]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(batch, f, ensure_ascii=False)
        validate("--points-batch", f.name, ids, args.allow_warnings)
        have = {p["key"] for p in points}
        dup = [p["key"] for p in batch if p["key"] in have]
        if dup:
            print(f"이미 있는 문형: {dup}")
            sys.exit(1)
        save_points(lv, points + batch)
        print(f"{lv}: 문형 {len(batch)}개 합침 → {len(points) + len(batch)}개")
    else:
        ids = [q["id"] for q in batch]
        validate("--questions-batch", args.batch, ids, args.allow_warnings)
        lv = ids[0].split("-")[0]
        items = load_questions(lv)
        dup = set(ids) & {q["id"] for q in items}
        if dup:
            print(f"이미 있는 id: {sorted(dup)}")
            sys.exit(1)
        save_questions(lv, items + batch)
        print(f"{lv}: 문항 {len(batch)}개 합침 → {len(items) + len(batch)}개")


if __name__ == "__main__":
    main()
