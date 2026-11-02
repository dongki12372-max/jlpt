#!/usr/bin/env python3
"""작성한 단어 배치를 레벨 파일에 합친다 (id 부여, 서식 유지).

  .venv/bin/python tools/merge_words.py batch.json [--allow-warnings]

배치 = 같은 레벨 단어 배열 (id 없이, key는 다시 만든다). validate_vocab.py --words-batch가 실패하면 합치지 않는다
(--partial: 청해 단어가 아직 다 들어오지 않은 것은 경고).
경고가 있어도 기본은 거부 (--allow-warnings로 허용). 이미 있는 key는 오류로 걸린다.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from vocab_common import ROOT, load_words, next_word_id, save_words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("batch")
    ap.add_argument("--allow-warnings", action="store_true")
    args = ap.parse_args()

    batch = json.loads(Path(args.batch).read_text(encoding="utf-8"))
    for w in batch:
        w.pop("id", None)
        w.setdefault("sources", ["wordlist"])
        w["key"] = f"{w['word']}|{w['reading']}"
    tmp = Path(args.batch).with_suffix(".check.json")
    tmp.write_text(json.dumps(batch, ensure_ascii=False), encoding="utf-8")
    v = subprocess.run([sys.executable, str(ROOT / "tools" / "validate_vocab.py"), "--words-batch", str(tmp), "--partial"],
                       capture_output=True, text=True)
    tmp.unlink()
    out = v.stdout + v.stderr
    batch_warn = [l for l in out.splitlines() if "⚠" in l and "-w-9" in l]
    if v.returncode != 0:
        print(out)
        print("검증 실패 — 합치지 않음")
        sys.exit(1)
    if batch_warn and not args.allow_warnings:
        print("\n".join(batch_warn))
        print("배치에 경고가 있음 — 합치지 않음 (--allow-warnings로 허용)")
        sys.exit(1)

    lv = batch[0]["level"].lower()
    words = load_words(lv)
    for w in batch:
        w["id"] = next_word_id(lv, words)
        words.append(w)
    save_words(lv, words)
    print(f"{lv}: {len(batch)}개 합침 → {len(words)}개" + (f" (경고 {len(batch_warn)}건 허용)" if batch_warn else ""))


if __name__ == "__main__":
    main()
