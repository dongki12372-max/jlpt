"""문자·어휘 영역 공통: 경로, 단어·문항 파일 읽기/쓰기(서식 고정), 청해 vocab 수집."""
import json
import re
from pathlib import Path

from validate import QUESTIONS_DIR as LISTENING_QUESTIONS_DIR, ROOT, load_config

VOCAB_DIR = ROOT / "data" / "vocab"
WORDS_DIR = VOCAB_DIR / "words"
VQUESTIONS_DIR = VOCAB_DIR / "questions"
WORDS_SCHEMA = VOCAB_DIR / "schema-words.json"
QUESTIONS_SCHEMA = VOCAB_DIR / "schema-questions.json"
VAUDIO_DIR = ROOT / "audio" / "vocab"
LEVEL_KEYS = ["n5", "n4", "n3"]
LEVEL_RANK = {"N5": 0, "N4": 1, "N3": 2}

WORD_FIELDS = ["id", "key", "word", "reading", "ttsText", "meaning_ko", "kind", "pos", "level", "example", "similar", "sources"]
EXAMPLE_FIELDS = ["text", "furigana", "ttsText", "meaning_ko"]
QUESTION_FIELDS = ["id", "level", "type", "stem", "stemFurigana", "word", "options", "answer", "fullText", "fullFurigana", "fullKo",
                   "ttsText", "targets", "explanation_ko", "optionNotes_ko", "tags"]


def load_vocab_config():
    return load_config()["sections"]["vocab"]


def ordered(obj, fields):
    out = {k: obj[k] for k in fields if k in obj}
    out.update({k: v for k, v in obj.items() if k not in out})  # 모르는 필드는 뒤에 (스키마가 잡는다)
    return out


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(", ", ": "))


def fmt_word(w):
    w = ordered(w, WORD_FIELDS)
    if "example" in w and isinstance(w["example"], dict):
        w["example"] = ordered(w["example"], EXAMPLE_FIELDS)
    return dumps(w)


def save_words(level_key, words):
    """한 줄에 단어 하나 (diff가 읽기 쉽게)."""
    path = WORDS_DIR / f"{level_key}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    body = ",\n".join("  " + fmt_word(w) for w in words)
    path.write_text("[\n" + body + "\n]\n" if words else "[]\n", encoding="utf-8")


def load_words(level_key):
    path = WORDS_DIR / f"{level_key}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []


def load_all_words():
    return {lv: load_words(lv) for lv in LEVEL_KEYS}


def fmt_question(q):
    """문항 하나: 필드마다 한 줄, 배열은 한 줄로."""
    q = ordered(q, QUESTION_FIELDS)
    lines = [f"    {json.dumps(k, ensure_ascii=False)}: {dumps(v)}" for k, v in q.items()]
    return "  {\n" + ",\n".join(lines) + "\n  }"


def save_questions(level_key, items):
    path = VQUESTIONS_DIR / f"{level_key}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("[\n" + ",\n".join(fmt_question(q) for q in items) + "\n]\n" if items else "[]\n", encoding="utf-8")


def load_questions(level_key):
    path = VQUESTIONS_DIR / f"{level_key}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []


def next_word_id(level_key, words):
    nums = [int(w["id"].rsplit("-", 1)[1]) for w in words if re.match(rf"^{level_key}-w-\d{{4}}$", w.get("id", ""))]
    return f"{level_key}-w-{(max(nums) if nums else 0) + 1:04d}"


def listening_vocab():
    """청해 문항 vocab 중 단어장 대상(kind word·expression) → {key: {word, reading, meaning_ko, kind, ids[], levels[]}}."""
    out = {}
    for lv in LEVEL_KEYS:
        for q in json.loads((LISTENING_QUESTIONS_DIR / f"{lv}.json").read_text(encoding="utf-8")):
            for v in q["vocab"]:
                if v.get("kind") == "grammar":
                    continue
                key = f"{v['word']}|{v['reading']}"
                e = out.setdefault(key, {"word": v["word"], "reading": v["reading"], "meanings": [], "kind": v["kind"],
                                         "ids": [], "levels": []})
                if v["meaning_ko"] not in e["meanings"]:
                    e["meanings"].append(v["meaning_ko"])
                if q["id"] not in e["ids"]:
                    e["ids"].append(q["id"])
                e["levels"].append(q["level"])
    return out
