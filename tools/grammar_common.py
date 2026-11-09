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
EXAMPLE_FIELDS = ["text", "furigana", "ttsText", "meaning_ko"]
QUESTION_FIELDS = ["id", "level", "type", "title", "stem", "stemFurigana", "passage", "passageFurigana", "options", "order",
                   "answer", "items", "fullText", "fullFurigana", "fullKo", "ttsText", "targets", "explanation_ko",
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
