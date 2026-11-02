#!/usr/bin/env python3
"""작성한 문자·어휘 문항 배치를 레벨 파일에 합친다 (서식 유지) + 단어의 vocab:{문항} 출처 맞추기.

  .venv/bin/python tools/merge_questions.py batch.json [--allow-warnings]

validate_vocab.py --questions-batch가 실패하면 합치지 않는다. 배치 문항에 경고가 있어도 기본은 거부.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from vocab_common import ROOT, load_questions, save_questions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("batch")
    ap.add_argument("--allow-warnings", action="store_true")
    args = ap.parse_args()

    batch = json.loads(Path(args.batch).read_text(encoding="utf-8"))
    ids = {q["id"] for q in batch}
    v = subprocess.run([sys.executable, str(ROOT / "tools" / "validate_vocab.py"), "--questions-batch", args.batch, "--partial"],
                       capture_output=True, text=True)
    out = v.stdout + v.stderr
    batch_warn = [l for l in out.splitlines() if "⚠" in l and any(f" {i}:" in l for i in ids)]
    if v.returncode != 0:
        print(out[-4000:])
        print("검증 실패 — 합치지 않음")
        sys.exit(1)
    if batch_warn and not args.allow_warnings:
        print("\n".join(batch_warn))
        print("배치에 경고가 있음 — 합치지 않음 (--allow-warnings로 허용)")
        sys.exit(1)
    lv = batch[0]["id"].split("-")[0]
    items = load_questions(lv)
    have = {q["id"] for q in items}
    dup = ids & have
    if dup:
        print(f"이미 있는 id: {sorted(dup)}")
        sys.exit(1)
    save_questions(lv, items + batch)
    print(f"{lv}: {len(batch)}문항 합침 → {len(items) + len(batch)}문항")
    subprocess.run([sys.executable, str(ROOT / "tools" / "import_listening_vocab.py")], check=True, capture_output=True)


if __name__ == "__main__":
    main()
