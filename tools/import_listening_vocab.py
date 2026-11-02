#!/usr/bin/env python3
"""청해 문항 vocab(kind word·expression) → 문자·어휘 단어 데이터. (문자·어휘 문항 targets의 vocab: 출처도 맞춘다)

  .venv/bin/python tools/import_listening_vocab.py                 # 출처 맞추기 + 없는 단어 보고
  .venv/bin/python tools/import_listening_vocab.py --todo out.json # 없는 단어를 작성용 초안으로 저장

- 이미 있는 key: sources의 listening:{문항 id}를 청해 문항과 같게 맞춘다 (추가·삭제). 다른 출처는 그대로.
- 없는 key: 품사·예문·레벨을 사람이(또는 작성자가) 채워야 하므로 자동으로 넣지 않고 초안 목록으로 낸다.
  채운 뒤 tools/merge_words.py로 합친다.
grammar는 단어장 대상이 아니다 (문법 영역 몫).
"""
import argparse
import json

from vocab_common import LEVEL_KEYS, LEVEL_RANK, listening_vocab, load_all_words, load_questions, save_words


def vocab_question_sources():
    """문자·어휘 문항 targets → {단어 key: [문항 id…]}"""
    out = {}
    for lv in LEVEL_KEYS:
        for q in load_questions(lv):
            for t in q["targets"]:
                out.setdefault(t, []).append(q["id"])
    return out


def sync_sources(words_by_level, lv_vocab):
    """listening:·vocab: 출처를 청해 vocab·문자어휘 문항 targets와 같게 맞춘다 (wordlist는 그대로)."""
    vq = vocab_question_sources()
    changed = 0
    for lv in LEVEL_KEYS:
        for w in words_by_level[lv]:
            want = [f"listening:{i}" for i in sorted(lv_vocab.get(w["key"], {}).get("ids", []))]
            want += [f"vocab:{i}" for i in sorted(vq.get(w["key"], []))]
            others = [s for s in w["sources"] if not s.startswith(("listening:", "vocab:"))]
            new = others + want
            if not new:
                new = ["wordlist"]
            if new != w["sources"]:
                w["sources"] = new
                changed += 1
    return changed


def main():
    ap = argparse.ArgumentParser(description="청해 vocab 가져오기")
    ap.add_argument("--todo", help="단어 데이터에 없는 청해 단어를 초안으로 저장할 파일")
    args = ap.parse_args()

    lv_vocab = listening_vocab()
    words = load_all_words()
    keys = {w["key"] for lv in LEVEL_KEYS for w in words[lv]}

    changed = sync_sources(words, lv_vocab)
    if changed:
        for lv in LEVEL_KEYS:
            save_words(lv, words[lv])
    missing = {k: v for k, v in lv_vocab.items() if k not in keys}
    print(f"청해 vocab(word·expression) {len(lv_vocab)}개: 단어 데이터에 있음 {len(lv_vocab) - len(missing)}, 없음 {len(missing)}")
    print(f"출처를 고친 단어 {changed}개")

    conflicts = {k: v["meanings"] for k, v in lv_vocab.items() if len(v["meanings"]) > 1}
    if conflicts:
        print(f"\n문항마다 뜻이 다른 단어 {len(conflicts)}개 (단어장 뜻을 정할 때 참고):")
        for k, m in conflicts.items():
            print(f"  {k}: " + " / ".join(m))

    if args.todo and missing:
        todo = []
        for k, v in missing.items():
            todo.append({
                "word": v["word"], "reading": v["reading"], "kind": v["kind"],
                "meanings_in_listening": v["meanings"],
                "lowestQuestionLevel": min(v["levels"], key=LEVEL_RANK.get),
                "sources": [f"listening:{i}" for i in sorted(v["ids"])],
            })
        with open(args.todo, "w", encoding="utf-8") as f:
            json.dump(todo, f, ensure_ascii=False, indent=1)
        print(f"\n초안 {len(todo)}개 → {args.todo}")


if __name__ == "__main__":
    main()
