#!/usr/bin/env python3
"""한자 묶음 하나씩 읽기 확인 (개발용) — 문장 전체 거리(check_vocab_tts · check_grammar_tts)로는 안 잡히는 한두 박 오독용.

  .venv/bin/python tools/check_readings.py                        # 문자·어휘 + 문법 + 청해 의심 목록
  .venv/bin/python tools/check_readings.py --area vocab --level n4
  .venv/bin/python tools/check_readings.py --fix                  # 틀리게 읽힌 것이 확인된 묶음만 가나로 바꾼 ttsText 넣기

방법: 후리가나 묶음 {漢字|よみ} 하나만 가나로 바꾼 문장을 같은 화자로 읽혀 원래 음성과 비교한다.
읽기가 같으면 두 음성이 거의 같고, 다르면 그 자리에서만 크게 벌어진다 → MFCC + DTW 경로에서 이어진 PEAK_FRAMES 프레임의
평균 비용 최대값이 voices.json readings.check 이상이면 의심.
의심만으로는 고치지 않는다 — 히라가나로 바꾼 쪽이 이상하게 읽혀도(はは·らいしゅう 앞뒤 조사와 붙어 「わ」 등) 똑같이 벌어지기 때문이다.
확인 ①: 묶음을 가타카나로 바꾼 문장(조사와 안 섞인다)과도 readings.confirm 이상 벌어지고,
확인 ②: 그 한자의 다른 읽기(tools/reading_alts.json, 예: 町|まち → ちょう)로 바꾼 문장 쪽에 readings.margin 넘게 더 가까울 때만 「오독」으로 보고 고친다.
ttsText에는 히라가나를 넣되, 히라가나로 바꾼 음성이 가타카나 쪽과 다르게 읽히면(readings.same 이상) 가타카나를 넣는다.
청해 발화표현의 상황 + 질문은 situationTts에 넣는다.
다른 읽기가 표에 없는데 ①에 걸린 묶음은 「표에 없음」으로 목록만 낸다 (표에 읽기를 더해 다시 돌린다).
청해 대사는 문항 음성에 합쳐져 있어 대사를 다시 읽혀 비교한다 (같은 글·같은 화자는 같게 읽힌다). 상황 설명·질문은 발화표현(스크립트에 후리가나가 있다)만 본다.
읽힌 음성은 audio/_check/, 비교 결과는 audio/_check/readings.json에 캐시한다. 이미 ttsText가 있는 항목은 건너뛴다.
고친 뒤: validate*.py → build_vocab_audio.py · build_grammar_audio.py · build_audio.py.
"""
import argparse
import asyncio
import hashlib
import json
import os
import warnings
from concurrent.futures import ProcessPoolExecutor

import librosa
import numpy as np
from scipy.spatial.distance import cdist

import build_grammar_audio
import grammar_common
import vocab_common
from build_vocab_audio import VOICES_PATH, example_speaker, synth
from check_vocab_tts import feat
from merge_batch import fmt_question
from validate import FURIGANA_RE, KANJI_RE, QUESTIONS_DIR, ROOT, expected_script_lines, strip_furigana

warnings.filterwarnings("ignore")
LEVEL_KEYS = vocab_common.LEVEL_KEYS
AREAS = ["vocab", "grammar", "listening"]
CHECK_DIR = ROOT / "audio" / "_check"
STATS_PATH = CHECK_DIR / "readings.json"
ALTS_PATH = ROOT / "tools" / "reading_alts.json"   # {"漢字|바른 읽기": ["틀리게 읽힐 만한 읽기", …]}
# 전에 읽혀 둔 가나 음성 (check_vocab_tts · check_grammar_tts)도 같은 이름이면 그대로 쓴다
CACHE_DIRS = [CHECK_DIR, vocab_common.VAUDIO_DIR / "_check", grammar_common.GAUDIO_DIR / "_check"]
PEAK_FRAMES = 6  # 약 0.2초


def render(markup, kana):
    """후리가나 표기 → 읽힐 글. kana에 든 번호의 묶음만 읽기(가나)로, 나머지는 한자로. kana가 {번호: 글}이면 그 글로 바꾼다."""
    n = iter(range(len(markup)))

    def one(m):
        i = next(n)
        return m.group(1) if i not in kana else kana[i] if isinstance(kana, dict) else m.group(2)
    return FURIGANA_RE.sub(one, markup)


def local_cost(a, b):
    """(경로 평균 비용, 이어진 PEAK_FRAMES 프레임 평균의 최대)."""
    C = cdist(a.T, b.T)
    _, wp = librosa.sequence.dtw(C=C)
    c = C[wp[:, 0], wp[:, 1]]
    peak = np.convolve(c, np.ones(PEAK_FRAMES) / PEAK_FRAMES, "valid").max() if len(c) >= PEAK_FRAMES else c.mean()
    return [round(float(c.mean()), 3), round(float(peak), 3)]


def compare(job):
    base, others = job
    a = feat(base)
    return [local_cost(a, feat(o)) for o in others]


# ---------- 검사 대상 ----------
# target: area, id, label, markup(후리가나 표기), spk, real(음성 파일, 없으면 다시 읽힌다), speech(읽기 전 손질), put(ttsText 넣기, 없으면 목록만)

def vocab_targets(levels, store):
    words = store["vocab_words"] = vocab_common.load_all_words()
    questions = store["vocab_questions"] = {lv: vocab_common.load_questions(lv) for lv in LEVEL_KEYS}
    adir = vocab_common.VAUDIO_DIR
    for lv in levels:
        for w in words[lv]:
            word = w["word"].lstrip("〜")
            if KANJI_RE.search(word) and "ttsText" not in w:
                yield dict(id=w["id"], label=f"단어 {w['word']}", markup=f"{{{word}|{w['reading']}}}", spk="N",
                           real=adir / "words" / f"{w['id']}.mp3", put=(w, ("vocab_words", lv)))
            ex = w["example"]
            if "ttsText" not in ex:
                yield dict(id=w["id"], label="예문", markup=ex["furigana"], spk=example_speaker(w["id"]),
                           real=adir / "examples" / f"{w['id']}.mp3", put=(ex, ("vocab_words", lv)))
        for q in questions[lv]:
            if "ttsText" not in q:
                yield dict(id=q["id"], label="문항", markup=q["fullFurigana"], spk="N",
                           real=adir / "questions" / f"{q['id']}.mp3", put=(q, ("vocab_questions", lv)))


def grammar_targets(levels, store):
    points = store["grammar_points"] = grammar_common.load_all_points()
    questions = store["grammar_questions"] = {lv: grammar_common.load_questions(lv) for lv in LEVEL_KEYS}
    adir = grammar_common.GAUDIO_DIR
    for lv in levels:
        for p in points[lv]:
            for n, ex in enumerate(p["examples"], 1):
                if "ttsText" not in ex:
                    yield dict(id=f"{p['id']}-{n}", label="예문", markup=ex["furigana"], spk=build_grammar_audio.example_speaker(n),
                               real=adir / "examples" / f"{p['id']}-{n}.mp3", put=(ex, ("grammar_points", lv)))
        for q in questions[lv]:
            if "ttsText" not in q:
                yield dict(id=q["id"], label="문항", markup=q["fullFurigana"], spk="N", speech=build_grammar_audio.speech_text,
                           real=adir / "questions" / f"{q['id']}.mp3", put=(q, ("grammar_questions", lv)))


def listening_targets(levels, store):
    questions = store["listening"] = {lv: json.loads((QUESTIONS_DIR / f"{lv}.json").read_text(encoding="utf-8")) for lv in LEVEL_KEYS}
    for lv in levels:
        for q in questions[lv]:
            script = q["script"].split("\n")
            if strip_furigana(q["script"]).split("\n") == expected_script_lines(q):
                if q["type"] == "hatsuwa" and "situationTts" not in q:   # 상황 + 질문
                    yield dict(id=q["id"], label="상황", markup=script[0].split("：", 1)[1], spk="N", real=None,
                               put=(q, ("listening", lv)), key="situationTts")
                for i, (line, sline) in enumerate(zip(q["lines"], script), 1):
                    if "ttsText" not in line:
                        yield dict(id=q["id"], label=f"대사 {i}", markup=sline.split("：", 1)[1], spk=line["speaker"],
                                   real=None, put=(line, ("listening", lv)))
            if q["spokenOptions"]:
                for i, opt in enumerate(q["options"], 1):
                    if "furigana" in opt and "ttsText" not in opt:
                        yield dict(id=q["id"], label=f"선택지 {i}", markup=opt["furigana"], spk=q.get("optionSpeaker", "N"),
                                   real=None, put=(opt, ("listening", lv)))


def save(store, touched):
    for name, lv in sorted(touched):
        if name == "vocab_words":
            vocab_common.save_words(lv, store[name][lv])
        elif name == "vocab_questions":
            vocab_common.save_questions(lv, store[name][lv])
        elif name == "grammar_points":
            grammar_common.save_points(lv, store[name][lv])
        elif name == "grammar_questions":
            grammar_common.save_questions(lv, store[name][lv])
        else:
            (QUESTIONS_DIR / f"{lv}.json").write_text("[\n" + ",\n".join(fmt_question(q) for q in store[name][lv]) + "\n]\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--area", choices=AREAS, action="append")
    ap.add_argument("--level", choices=LEVEL_KEYS)
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--top", type=int, default=0, help="기준 아래라도 가장 큰 N개를 더 보여 준다 (기준 정할 때)")
    args = ap.parse_args()

    vc = json.loads(VOICES_PATH.read_text(encoding="utf-8"))
    th = vc["readings"]["check"]
    CHECK_DIR.mkdir(parents=True, exist_ok=True)
    levels = [args.level] if args.level else LEVEL_KEYS
    store = {}
    collect = {"vocab": vocab_targets, "grammar": grammar_targets, "listening": listening_targets}
    targets = [dict(t, area=a) for a in (args.area or AREAS) for t in collect[a](levels, store)]
    for t in targets:
        t["groups"] = FURIGANA_RE.findall(t["markup"])
        t.setdefault("speech", lambda s: s)
    targets = [t for t in targets if t["groups"] and (t["real"] is None or t["real"].is_file())]
    print(f"검사 대상 {len(targets)}개 · 한자 묶음 {sum(len(t['groups']) for t in targets)}개")

    def audio_path(t, kana):
        spec = vc["voices"][t["spk"]]
        text = t["speech"](render(t["markup"], kana))
        name = hashlib.sha1(json.dumps([text, spec], ensure_ascii=False).encode()).hexdigest()[:16] + ".mp3"
        hit = next((d / name for d in CACHE_DIRS if (d / name).is_file()), None)
        return text, spec, hit or CHECK_DIR / name

    def read_all(wanted):
        """wanted: [(target, kana 묶음 번호 집합)] → 음성 파일 목록 (없는 것만 읽힌다)."""
        plan = [audio_path(t, kana) for t, kana in wanted]
        todo = {str(p): (text, spec, p) for text, spec, p in plan if not p.is_file()}

        async def go():
            sem, done = asyncio.Semaphore(vc["vocab"]["concurrency"]), [0]

            async def one(text, spec, p):
                async with sem:
                    part = p.with_suffix(".part.mp3")
                    await synth(text, spec, part, vc["tts"]["retries"])
                    part.replace(p)
                    done[0] += 1
                    if done[0] % 500 == 0:
                        print(f"  읽힌 음성 {done[0]}/{len(todo)}", flush=True)
            await asyncio.gather(*(one(*v) for v in todo.values()))
        if todo:
            print(f"읽힐 음성 {len(todo)}개…", flush=True)
            asyncio.run(go())
        return [p for _, _, p in plan]

    stats = json.loads(STATS_PATH.read_text(encoding="utf-8")) if STATS_PATH.is_file() else {}

    def compare_all(pairs):
        """pairs: [(기준 음성, 비교 음성)] → [(평균, 최대)] (캐시)."""
        key = lambda a, b: f"{a.name}:{a.stat().st_mtime_ns}|{b.name}"
        jobs = {}
        for a, b in pairs:
            if key(a, b) not in stats:
                jobs.setdefault(str(a), (a, []))[1].append(b)
        if jobs:
            print(f"비교할 음성 쌍 {sum(len(v[1]) for v in jobs.values())}개…", flush=True)
            with ProcessPoolExecutor(max_workers=os.cpu_count()) as pool:
                work = [(str(a), [str(b) for b in bs]) for a, bs in jobs.values()]
                for n, ((a, bs), res) in enumerate(zip(jobs.values(), pool.map(compare, work, chunksize=8)), 1):
                    for b, r in zip(bs, res):
                        stats[key(a, b)] = r
                    if n % 1000 == 0:
                        print(f"  비교 {n}/{len(jobs)}", flush=True)
            STATS_PATH.write_text(json.dumps(stats), encoding="utf-8")
        return [stats[key(a, b)] for a, b in pairs]

    # 1) 원래 음성 ↔ 묶음 하나만 가나로 바꾼 음성
    synth_orig = [t for t in targets if t["real"] is None]
    for t, p in zip(synth_orig, read_all([(t, set()) for t in synth_orig])):
        t["real"] = p
    wanted = [(t, {i}) for t in targets for i in range(len(t["groups"]))]
    paths = read_all(wanted)
    costs = compare_all([(t["real"], p) for (t, _), p in zip(wanted, paths)])
    rows = []  # (최대, 평균, target, 묶음 번호)
    for (t, kana), (mean, peak) in zip(wanted, costs):
        rows.append((peak, mean, t, min(kana)))
    rows.sort(key=lambda r: -r[0])

    # 2) 의심 묶음을 가타카나·「다른 읽기」로 바꾼 글과도 비교: 가타카나와도 벌어지고 다른 읽기 쪽에 더 가까우면 오독
    alts = json.loads(ALTS_PATH.read_text(encoding="utf-8"))
    confirm, margin = vc["readings"]["confirm"], vc["readings"]["margin"]
    katakana = lambda s: "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)
    suspects = [(peak, t, i) for peak, mean, t, i in rows if peak >= th]
    hira = read_all([(t, {i}) for _, t, i in suspects])
    kata = read_all([(t, {i: katakana(t["groups"][i][1])}) for _, t, i in suspects])
    kata_costs = compare_all([(t["real"], p) for (_, t, _), p in zip(suspects, kata)])
    same_costs = compare_all(list(zip(hira, kata)))   # 히라가나로 바꾼 것이 가타카나와 같게 읽히는지
    tries = [(t, i, alt) for _, t, i in suspects for alt in alts.get("|".join(t["groups"][i]), [])]
    alt_costs = compare_all([(t["real"], p) for (t, _, _), p in zip(tries, read_all([(t, {i: alt}) for t, i, alt in tries]))])
    heard = {}   # (target, 묶음 번호) → (가장 가까운 다른 읽기, 그 거리)
    for (t, i, alt), (mean, peak) in zip(tries, alt_costs):
        if (id(t), i) not in heard or peak < heard[id(t), i][1]:
            heard[id(t), i] = (alt, peak)

    print(f"\n의심 묶음 {len(suspects)}개 (기준 {th}) — 오독: 가타카나와도 {confirm} 이상, 다른 읽기 쪽이 {margin} 넘게 가까움")
    confirmed = {}   # target → {묶음 번호: ttsText에 넣을 글}
    for (peak, t, i), (_, k), (_, same) in zip(suspects, kata_costs, same_costs):
        base, reading = t["groups"][i]
        alt = heard.get((id(t), i))
        if k < confirm:
            mark = "아님"
        elif alt and alt[1] < th and alt[1] <= k - margin:
            mark = "오독" if t["put"] else "오독·목록만"
            confirmed.setdefault(id(t), (t, {}))[1][i] = reading if same < vc["readings"]["same"] else katakana(reading)
        else:
            mark = "다른 읽기와도 다름" if alt else "표에 없음"
        print(f"  {peak:5.2f}  [{mark}] {t['area']} {t['id']} {t['label']} ({t['spk']})  {base}→{reading}  · 가타카나와 {k:.2f}"
              + (f" · 「{alt[0]}」와 {alt[1]:.2f}" if alt else "") + (f" · 히라가나↔가타카나 {same:.2f}" if k >= confirm else "")
              + f"\n         {strip_furigana(t['markup'])[:70]}")
    touched, n_fixed = set(), 0
    for t, put in confirmed.values():
        if args.fix and t["put"]:
            obj, where = t["put"]
            obj[t.get("key", "ttsText")] = render(t["markup"], put)
            touched.add(where)
            n_fixed += 1
    print(f"\n오독 확인 {sum(len(put) for _, put in confirmed.values())}묶음 · {len(confirmed)}문장")
    if args.top:
        print(f"\n기준 아래 가장 큰 {args.top}개")
        for peak, mean, t, i in [r for r in rows if r[0] < th][:args.top]:
            print(f"  {peak:5.2f}  {t['area']} {t['id']} {t['label']} ({t['spk']})  {t['groups'][i][0]}→{t['groups'][i][1]}  {strip_furigana(t['markup'])[:50]}")
    if touched:
        save(store, touched)
        print(f"\nttsText {n_fixed}개를 넣었습니다. validate*.py → build_*_audio.py로 다시 생성하세요.")


if __name__ == "__main__":
    main()
