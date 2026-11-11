#!/usr/bin/env python3
"""새 문항 배치(JSON 배열)를 레벨 파일 끝에 붙인다. 기존 파일과 같은 서식(대사·선택지·단어는 한 줄 객체)으로 쓴다.

  .venv/bin/python tools/merge_batch.py <배치.json>

합치기 전에 validate.py --batch로 검사하고, 합친 뒤 다시 validate.py를 돌린다.
"""
import json
import subprocess
import sys
from pathlib import Path

from validate import QUESTIONS_DIR, ROOT

FIELD_ORDER = ["id", "level", "type", "situation", "question", "situationTts", "lines", "options", "spokenOptions",
               "optionSpeaker", "phone", "answer", "scene", "script", "scriptKo", "gloss", "optionsKo", "explanation_ko", "vocab", "tags"]
INLINE_LISTS = {"lines", "options", "vocab"}


def j(v):
    return json.dumps(v, ensure_ascii=False)


def inline_obj(o):
    return "{ " + ", ".join(f"{j(k)}: {j(v)}" for k, v in o.items()) + " }"


def fmt_question(q):
    unknown = set(q) - set(FIELD_ORDER)
    if unknown:
        raise ValueError(f"{q.get('id')}: 알 수 없는 필드 {sorted(unknown)}")
    out = []
    for k in FIELD_ORDER:
        if k not in q:
            continue
        v = q[k]
        if k in INLINE_LISTS:
            if not v:
                out.append(f'    {j(k)}: []')
            else:
                rows = ",\n".join(f"      {inline_obj(x)}" for x in v)
                out.append(f'    {j(k)}: [\n{rows}\n    ]')
        elif k == "scene":
            out.append(f'    {j(k)}: {inline_obj(v)}')
        elif k in ("scriptKo", "optionsKo"):
            rows = ",\n".join(f"      {j(x)}" for x in v)
            out.append(f'    {j(k)}: [\n{rows}\n    ]')
        elif k == "gloss":
            # 줄마다 한 줄: [{t,w,r,m}, …]
            rows = ",\n".join("      [" + ", ".join(inline_obj(g) for g in line) + "]" for line in v)
            out.append(f'    {j(k)}: [\n{rows}\n    ]')
        elif k == "phone":
            out.append(f'    {j(k)}: [' + ", ".join(j(t) for t in v) + ']')
        elif k == "tags":
            out.append(f'    {j(k)}: [' + ", ".join(j(t) for t in v) + ']')
        else:
            out.append(f'    {j(k)}: {j(v)}')
    return "  {\n" + ",\n".join(out) + "\n  }"


def main():
    batch_path = Path(sys.argv[1])
    batch = json.loads(batch_path.read_text(encoding="utf-8"))
    level = batch[0]["id"].split("-")[0]

    v = subprocess.run([sys.executable, str(ROOT / "tools" / "validate.py"), "--batch", str(batch_path)],
                       capture_output=True, text=True)
    if v.returncode != 0 or "\n경고 " in v.stdout:
        print(v.stdout + v.stderr)
        print("배치 검증 실패 또는 경고 있음 — 합치지 않습니다.")
        sys.exit(1)

    path = QUESTIONS_DIR / f"{level}.json"
    src = path.read_text(encoding="utf-8").rstrip()
    assert src.endswith("]"), "레벨 파일 끝이 ] 가 아님"
    existing = json.loads(src)
    ids = {q["id"] for q in existing}
    dup = [q["id"] for q in batch if q["id"] in ids]
    if dup:
        print(f"이미 있는 id: {dup}")
        sys.exit(1)

    merged = src[:-1].rstrip() + ",\n" + ",\n".join(fmt_question(q) for q in batch) + "\n]\n"
    if json.loads(merged) != existing + batch:
        print("서식 변환 후 내용이 달라짐 — 합치지 않습니다.")
        sys.exit(1)
    path.write_text(merged, encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {len(existing)} + {len(batch)} = {len(existing) + len(batch)}문항")


if __name__ == "__main__":
    main()
