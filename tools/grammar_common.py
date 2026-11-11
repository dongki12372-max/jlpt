"""문법 영역 공통: 경로, 문형·문항 파일 읽기/쓰기(서식 고정)."""
import json
import re

from validate import ROOT, load_config

GRAMMAR_DIR = ROOT / "data" / "grammar"
POINTS_DIR = GRAMMAR_DIR / "points"
GQUESTIONS_DIR = GRAMMAR_DIR / "questions"
POINTS_SCHEMA = GRAMMAR_DIR / "schema-points.json"
QUESTIONS_SCHEMA = GRAMMAR_DIR / "schema-questions.json"
GAUDIO_DIR = ROOT / "audio" / "grammar"
LEVEL_KEYS = ["n5", "n4", "n3"]
LEVEL_RANK = {"N5": 0, "N4": 1, "N3": 2}

POINT_FIELDS = ["id", "key", "pattern", "level", "meaning_ko", "connection", "explanation_ko", "examples", "similar", "tags"]
EXAMPLE_FIELDS = ["text", "furigana", "ttsText", "meaning_ko", "gloss"]
QUESTION_FIELDS = ["id", "level", "type", "title", "stem", "stemFurigana", "passage", "passageFurigana", "options", "order",
                   "answer", "items", "fullText", "fullFurigana", "fullKo", "gloss", "ttsText", "targets", "explanation_ko",
                   "optionNotes_ko", "tags"]
ITEM_FIELDS = ["options", "answer", "targets", "explanation_ko", "optionNotes_ko"]


def load_grammar_config():
    return load_config()["sections"]["grammar"]


def ordered(obj, fields):
    out = {k: obj[k] for k in fields if k in obj}
    out.update({k: v for k, v in obj.items() if k not in out})  # 모르는 필드는 뒤에 (스키마가 잡는다)
    return out


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(", ", ": "))


def fmt_point(p):
    p = ordered(p, POINT_FIELDS)
    if isinstance(p.get("examples"), list):
        p["examples"] = [ordered(e, EXAMPLE_FIELDS) if isinstance(e, dict) else e for e in p["examples"]]
    return dumps(p)


def save_points(level_key, points):
    """한 줄에 문형 하나."""
    path = POINTS_DIR / f"{level_key}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    body = ",\n".join("  " + fmt_point(p) for p in points)
    path.write_text("[\n" + body + "\n]\n" if points else "[]\n", encoding="utf-8")


def load_points(level_key):
    path = POINTS_DIR / f"{level_key}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []


def load_all_points():
    return {lv: load_points(lv) for lv in LEVEL_KEYS}


def fmt_question(q):
    """문항 하나: 필드마다 한 줄, 배열은 한 줄로. bunshou의 items는 빈칸 하나에 한 줄."""
    q = ordered(q, QUESTION_FIELDS)
    lines = []
    for k, v in q.items():
        if k == "items" and isinstance(v, list):
            inner = ",\n".join("      " + dumps(ordered(it, ITEM_FIELDS) if isinstance(it, dict) else it) for it in v)
            lines.append(f'    "items": [\n{inner}\n    ]')
        else:
            lines.append(f"    {json.dumps(k, ensure_ascii=False)}: {dumps(v)}")
    return "  {\n" + ",\n".join(lines) + "\n  }"


def save_questions(level_key, items):
    path = GQUESTIONS_DIR / f"{level_key}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("[\n" + ",\n".join(fmt_question(q) for q in items) + "\n]\n" if items else "[]\n", encoding="utf-8")


def load_questions(level_key):
    path = GQUESTIONS_DIR / f"{level_key}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []


def next_point_id(level_key, points):
    nums = [int(p["id"].rsplit("-", 1)[1]) for p in points if re.match(rf"^{level_key}-g-\d{{3}}$", p.get("id", ""))]
    return f"{level_key}-g-{(max(nums) if nums else 0) + 1:03d}"


# ---------- 단어 사전(gloss) ----------

GLOSS_READING_RE = re.compile(r"^[〜ぁ-ゖァ-ヺー]+$")
_FURI_RE = re.compile(r"\{([^{}|]+)\|([^{}|]+)\}")
_NEEDS_GLOSS_RE = re.compile(r"[一-龯々ァ-ヺ]")


def _hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def furigana_units(markup):
    """후리가나 표기 → [(글자, 읽기 또는 None)] (후리가나 묶음은 한 단위, 나머지는 한 글자씩)."""
    out, pos = [], 0
    for m in _FURI_RE.finditer(markup):
        out += [(c, None) for c in markup[pos:m.start()]]
        out.append((m.group(1), m.group(2)))
        pos = m.end()
    return out + [(c, None) for c in markup[pos:]]


def check_gloss_line(markup, gloss):
    """한 줄의 gloss 검사 → [(오류인지, 메시지)].
    t가 줄에 순서대로 나오는지, 읽기 표기, 한자·가타카나 단어가 빠지지 않았는지, 사전형 그대로 나온 단어의 읽기가 후리가나와 같은지."""
    units = furigana_units(markup)
    plain = "".join(u[0] for u in units)
    starts, n = [], 0
    for text, _ in units:
        starts.append(n)
        n += len(text)
    out, covered, pos = [], [False] * len(plain), 0
    for g in gloss:
        t = g.get("t", "")
        if not all(isinstance(g.get(k), str) and g.get(k) for k in ("t", "w", "r", "m")):
            out.append((True, f"gloss 「{t}」: t·w·r·m이 모두 있어야 함"))
            continue
        if not GLOSS_READING_RE.match(g["r"]):
            out.append((True, f"gloss 「{t}」: 읽기 「{g['r']}」는 가나만"))
        at = plain.find(t, pos)
        if at < 0:
            out.append((True, f"gloss 「{t}」: " + ("앞쪽에만 있음 (순서)" if t in plain else "줄에 없음")))
            continue
        pos = at + len(t)
        covered[at:pos] = [True] * len(t)
        # 줄에 나온 모양의 읽기 (후리가나 묶음이 반만 걸치면 알 수 없다)
        reading = ""
        for (text, r), s in zip(units, starts):
            if s + len(text) <= at or s >= pos:
                continue
            if s < at or s + len(text) > pos:
                reading = None
                break
            reading += r or text
        if reading is None or not KANJI_IN_RE.search(t):
            continue
        if t == g["w"] and _hira(reading) != _hira(g["r"]):
            out.append((True, f"gloss 「{t}」: 읽기 「{g['r']}」 ≠ 후리가나 「{reading}」"))
        elif t != g["w"] and t[0] == g["w"][0] and _hira(reading)[0] != _hira(g["r"])[0] and g["w"] != "来る":   # 来る는 き·こ로 바뀐다
            out.append((False, f"gloss 「{t}」({reading}) ↔ 사전형 「{g['w']}」({g['r']}): 읽기 첫 글자가 다름"))
    missed = "".join(c for c, ok in zip(plain, covered) if not ok and _NEEDS_GLOSS_RE.match(c))
    if missed:
        out.append((True, f"gloss에 빠진 한자·가타카나: {missed}"))
    return out


KANJI_IN_RE = re.compile(r"[一-龯々]")
