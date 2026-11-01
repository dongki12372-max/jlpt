#!/usr/bin/env python3
"""문제 은행 검증.

  .venv/bin/python tools/validate.py            # 전 레벨
  .venv/bin/python tools/validate.py --level n5 # 한 레벨

오류가 하나라도 있으면 종료 코드 1 (build_audio.py로 넘어가지 않는다).
경고·정답 분포·음성 누락 목록은 참고용으로 출력만 한다.
"""
import argparse
import difflib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS_DIR = ROOT / "data" / "questions"
IMAGES_DIR = ROOT / "data" / "images"
AUDIO_DIR = ROOT / "audio"
SCHEMA_PATH = ROOT / "data" / "schema.json"
CONFIG_PATH = ROOT / "app" / "config.js"

FURIGANA_RE = re.compile(r"\{([^{}|]+)\|([^{}|]+)\}")
KANA_RE = re.compile(r"^[ぁ-ゖァ-ヺー]+$")
KANJI_RE = re.compile(r"[一-龯々〆ヵヶ]")


def load_config():
    """app/config.js를 node로 읽는다 (숫자 규칙의 단일 출처)."""
    out = subprocess.run(
        ["node", "-p", f"JSON.stringify(require({json.dumps(str(CONFIG_PATH))}))"],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def strip_furigana(s):
    return FURIGANA_RE.sub(r"\1", s)


def to_hiragana(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def furigana_spans(script_line):
    """후리가나 표기 줄 → (본문, [(시작, 끝, 읽기)…]) — 위치는 본문 기준."""
    spans, plain, pos = [], [], 0
    for m in FURIGANA_RE.finditer(script_line):
        plain.append(script_line[pos:m.start()])
        start = sum(map(len, plain))
        plain.append(m.group(1))
        spans.append((start, start + len(m.group(1)), m.group(2)))
        pos = m.end()
    plain.append(script_line[pos:])
    return "".join(plain), spans


def check_tts_reading(text, tts, spans):
    """ttsText가 바꾼 구간이 스크립트 후리가나 읽기와 같은지. 문제 목록을 (오류?, 메시지)로 반환."""
    problems = []
    if tts == text:
        return [(False, "ttsText가 text와 같음 (불필요)")]
    ops = difflib.SequenceMatcher(None, text, tts, autojunk=False).get_opcodes()
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            continue
        # 바뀐 구간을 걸치는 후리가나 단위까지 넓힌다 (바깥은 equal 구간이라 tts 쪽도 같은 만큼 넓힌다)
        if i1 == i2:  # 삽입: 후리가나 단위 안쪽에 끼워 넣은 경우만 걸친 것으로 본다
            hit = [s for s in spans if s[0] < i1 < s[1]]
        else:
            hit = [s for s in spans if s[0] < i2 and s[1] > i1]
        a = min([i1] + [s[0] for s in hit])
        b = max([i2] + [s[1] for s in hit])
        j1, j2 = j1 - (i1 - a), j2 + (b - i2)
        got = tts[j1:j2]
        if not hit:
            problems.append((False, f"ttsText가 후리가나 없는 부분을 바꿈: 「{text[a:b]}」→「{got}」"))
            continue
        if KANJI_RE.search(got):
            problems.append((False, f"ttsText 교정 구간에 한자가 남아 비교 불가: 「{text[a:b]}」→「{got}」"))
            continue
        want, k = [], a
        for s, e, reading in sorted(hit):
            want.append(text[k:s])
            want.append(reading)
            k = e
        want.append(text[k:b])
        want = "".join(want)
        if to_hiragana(got) != to_hiragana(want):
            problems.append((True, f"ttsText 읽기 「{got}」 ≠ 스크립트 후리가나 「{want}」 ({text[a:b]})"))
    return problems


def expected_script_lines(q):
    """스크립트가 따라야 할 '화자：본문' 줄 목록."""
    if q["type"] == "hatsuwa":
        return [f"N：{q['situation']}{q['question']}"]
    return [f"{l['speaker']}：{l['text']}" for l in q["lines"]]


def check_question(q, level_key, cfg, errors, warnings):
    qid = q.get("id", "?")
    err = lambda msg: errors.append(f"{qid}: {msg}")
    warn = lambda msg: warnings.append(f"{qid}: {msg}")

    level, qtype = q["level"], q["type"]
    tcfg = cfg["types"][qtype]

    # 파일명·id·level·type 일치
    if level.lower() != level_key:
        err(f"level {level}이 파일 {level_key}.json과 다름")
    prefix = f"{level.lower()}-{qtype}-"
    if not qid.startswith(prefix):
        err(f"id가 '{prefix}NNN' 형식이 아님 (level/type과 불일치)")

    # 레벨-유형 조합
    if qtype not in cfg["levels"][level]["exam"]:
        err(f"{level}에는 {qtype} 유형이 없음")

    # 선택지 개수·정답 범위·음성 선택지 여부
    n_opt = len(q["options"])
    if n_opt != tcfg["optionCount"]:
        err(f"선택지 {n_opt}개 ({qtype}는 {tcfg['optionCount']}개)")
    if not 1 <= q["answer"] <= n_opt:
        err(f"answer {q['answer']}가 범위 1~{n_opt} 밖")
    if q["spokenOptions"] != tcfg["spokenOptions"]:
        err(f"spokenOptions는 {tcfg['spokenOptions']}여야 함")

    # 유형별 구간 구성
    if qtype == "sokuji":
        if q["situation"] or q["question"]:
            err("즉시응답은 situation·question을 비워야 함")
        if len(q["lines"]) != 1:
            err("즉시응답은 발화 한 줄이어야 함")
    else:
        if not q["situation"]:
            err("situation이 비어 있음")
        if not q["question"]:
            err("question이 비어 있음")
    if qtype == "hatsuwa":
        if q["lines"]:
            err("발화표현은 lines를 비워야 함 (선택지만 음성)")
    elif not q["lines"]:
        err("lines가 비어 있음")
    if qtype in ("kadai", "point") and q["question"] and not q["situation"].endswith(q["question"]):
        warn("situation 끝에 question이 붙어 있지 않음 (첫 질문 읽기 누락 가능)")
    if q.get("optionSpeaker") not in (None, "N") and not tcfg["spokenOptions"]:
        warn("선택지를 읽지 않는 유형인데 optionSpeaker가 있음")

    # 그림 파일
    for i, opt in enumerate(q["options"], 1):
        img = opt.get("image")
        if img:
            if img != f"{qid}-opt{i}.svg":
                err(f"선택지 {i} 그림 파일명은 {qid}-opt{i}.svg여야 함")
            if not (IMAGES_DIR / img).is_file():
                err(f"그림 없음: data/images/{img}")
    has_imgs = [bool(o.get("image")) for o in q["options"]]
    if any(has_imgs) and not all(has_imgs):
        err("그림 선택지는 전부 있거나 전부 없어야 함")
    scene_img = (q.get("scene") or {}).get("image")
    if scene_img:
        if scene_img != f"{qid}-scene.svg":
            err(f"장면 그림 파일명은 {qid}-scene.svg여야 함")
        if not (IMAGES_DIR / scene_img).is_file():
            err(f"그림 없음: data/images/{scene_img}")

    # 스크립트: 후리가나 문법 + 대사와 일치
    for m in FURIGANA_RE.finditer(q["script"]):
        if not KANA_RE.match(m.group(2)):
            err(f"후리가나 읽기에 가나 외 문자: {m.group(0)}")
    plain = strip_furigana(q["script"])
    if re.search(r"[{}|]", plain):
        err("스크립트에 짝이 안 맞는 {…|…} 표기")
    got = plain.split("\n")
    want = expected_script_lines(q)
    if got != want:
        if len(got) != len(want):
            err(f"스크립트 {len(got)}줄 ≠ 대사 {len(want)}줄")
        else:
            for i, (g, w) in enumerate(zip(got, want), 1):
                if g != w:
                    err(f"스크립트 {i}번째 줄이 대사와 다름\n      script: {g}\n      lines : {w}")
    elif q["type"] != "hatsuwa":
        # ttsText ↔ 후리가나 읽기 (스크립트가 대사와 일치할 때만 줄 대응이 확실하다)
        for i, (line, sline) in enumerate(zip(q["lines"], q["script"].split("\n")), 1):
            if "ttsText" not in line:
                continue
            plain, spans = furigana_spans(sline)
            offset = len(line["speaker"]) + 1  # "M：" 접두어
            spans = [(s - offset, e - offset, r) for s, e, r in spans if s >= offset]
            for is_err, msg in check_tts_reading(line["text"], line["ttsText"], spans):
                (err if is_err else warn)(f"대사 {i}: {msg}")
    for i, opt in enumerate(q["options"], 1):
        if opt.get("ttsText") == opt["text"]:
            warn(f"선택지 {i}: ttsText가 text와 같음 (불필요)")

    # 해설 길이 (2~4문장 권장)
    n_sent = len([s for s in re.split(r"(?<=[.!?。])\s*", q["explanation_ko"]) if s.strip()])
    if not 2 <= n_sent <= 4:
        warn(f"해설이 {n_sent}문장 (2~4문장 권장)")
    if not q["vocab"]:
        warn("vocab이 비어 있음")
    if not q["tags"]:
        warn("tags가 비어 있음")


def main():
    ap = argparse.ArgumentParser(description="문제 은행 검증")
    ap.add_argument("--level", choices=["n5", "n4", "n3"], help="한 레벨만 검사")
    args = ap.parse_args()

    cfg = load_config()
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    level_keys = [args.level] if args.level else ["n5", "n4", "n3"]
    errors, warnings = [], []
    seen_ids = {}
    total = 0

    for key in level_keys:
        path = QUESTIONS_DIR / f"{key}.json"
        if not path.is_file():
            errors.append(f"{path.relative_to(ROOT)} 없음")
            continue
        try:
            items = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{path.name}: JSON 파싱 실패 — {e}")
            continue

        # 1) 스키마 (구조) — 통과하지 못한 문항은 세부 검사를 건너뛴다
        bad = set()
        for e in validator.iter_errors(items):
            idx = e.absolute_path[0] if e.absolute_path else None
            qid = items[idx].get("id", f"#{idx}") if isinstance(idx, int) and isinstance(items[idx], dict) else path.name
            loc = "/".join(str(p) for p in list(e.absolute_path)[1:])
            errors.append(f"{qid}: 스키마 오류 {loc or '(문항)'} — {e.message}")
            if isinstance(idx, int):
                bad.add(idx)

        # 2) 세부 규칙
        by_type = Counter()
        dist = {4: Counter(), 3: Counter()}
        missing_audio = []
        for i, q in enumerate(items):
            if i in bad:
                continue
            total += 1
            qid = q["id"]
            if qid in seen_ids:
                errors.append(f"{qid}: id 중복 ({seen_ids[qid]})")
            seen_ids[qid] = path.name
            check_question(q, key, cfg, errors, warnings)
            by_type[q["type"]] += 1
            n_opt = len(q["options"])
            if n_opt in dist:
                dist[n_opt][q["answer"]] += 1
            if not (AUDIO_DIR / key / f"{qid}.mp3").is_file():
                missing_audio.append(qid)

        # 3) 레벨 요약
        level = key.upper()
        print(f"\n== {level} ({path.name}) — {sum(by_type.values())}문항 ==")
        exam = cfg["levels"][level]["exam"]
        print("  유형별: " + ", ".join(f"{t} {by_type[t]} (실전 {exam[t]})" for t in cfg["typeOrder"] if t in exam))
        for n_opt, c in dist.items():
            if c:
                cells = " ".join(f"{a}:{c[a]}" for a in range(1, n_opt + 1))
                print(f"  정답 분포 ({n_opt}지선다, {sum(c.values())}문항): {cells}")
        print(f"  음성 없음: {len(missing_audio)}문항" + (f" — {', '.join(missing_audio)}" if missing_audio else ""))
        intro_missing = [t for t in exam if not (AUDIO_DIR / key / f"_intro_{t}.mp3").is_file()]
        if intro_missing:
            print(f"  지시문 음성 없음: {', '.join(intro_missing)}")

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
    print(f"\n검증 통과 — {total}문항")


if __name__ == "__main__":
    main()
