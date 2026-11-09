// ============================================================
// 기록 저장 (영역 공통) — preload를 거쳐 메인 프로세스가 userData/progress.json에 쓴다.
//   구조는 docs/DESIGN.md 2장:
//   { version, settings: { common, {영역} }, sections: { {영역}: { items: {id: {...}}, exams: [...] } } }
//   오답노트는 별도 목록이 아니라 items[id].review 플래그다.
//   updatedAt = 마지막 저장 시각(ms). 기기 간 동기화(sync.js)는 merge()로 두 기록을 합친다.
// ============================================================
const Storage = (() => {
  const VERSION = 1;
  let data = null;
  let saving = Promise.resolve();
  const saveListeners = [];

  const empty = () => ({ version: VERSION, settings: { common: {} }, sections: {} });

  function normalize(raw) {
    const d = raw && typeof raw === 'object' ? raw : empty();
    d.version = d.version || VERSION;
    d.settings = d.settings || {};
    d.settings.common = d.settings.common || {};
    d.sections = d.sections || {};
    return d;
  }

  async function load() {
    data = normalize(await window.jlpt.loadProgress());
  }

  // 기록 파일 가져오기 (설정 화면): 지금 기록을 통째로 바꾼다. 형식이 아니면 예외
  function replaceAll(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.sections !== 'object') {
      throw new Error('JLPT 연습 기록 파일이 아닙니다.');
    }
    data = normalize(raw);
    return save();
  }

  // 저장은 순서대로 (앞의 저장이 끝난 뒤 최신 상태를 쓴다). quiet = 동기화로 받은 기록을 쓸 때 (다시 올리지 않게)
  function save({ quiet = false } = {}) {
    if (!quiet) data.updatedAt = Date.now();
    saving = saving.then(() => window.jlpt.saveProgress(data)).catch((e) => console.warn('기록 저장 실패', e));
    if (!quiet) saveListeners.forEach((fn) => fn());
    return saving;
  }
  const onSave = (fn) => saveListeners.push(fn);

  // ---------- 두 기기의 기록 합치기 ----------
  //   문항 기록(items)·단어 카드(cards)는 항목마다 더 최근에 바뀐 쪽 (at, 없으면 lastAt·reps),
  //   실전 기록(exams)·학습한 날(studyDays)은 합집합, 퀴즈 기록은 더 많이 푼 쪽,
  //   설정과 그 밖의 값은 더 최근에 저장된 쪽(updatedAt). settings.sync(이 기기의 동기화 설정)는 a 것을 쓴다.
  const stamp = (x) => (x && (x.at || (x.lastAt ? Date.parse(x.lastAt) : 0))) || 0;
  function newerEntry(x, y) {
    if (!x) return y;
    if (!y) return x;
    const sx = stamp(x), sy = stamp(y);
    if (sx !== sy) return sx > sy ? x : y;
    return (y.reps || y.attempts || 0) > (x.reps || x.attempts || 0) ? y : x;
  }
  function mergeMap(x = {}, y = {}) {
    const out = { ...x };
    for (const k of Object.keys(y)) out[k] = newerEntry(x[k], y[k]);
    return out;
  }
  function mergeSection(x = {}, y = {}, yNewer) {
    const out = { ...(yNewer ? { ...x, ...y } : { ...y, ...x }) };
    out.items = mergeMap(x.items, y.items);
    const seen = new Set();
    out.exams = [...(x.exams || []), ...(y.exams || [])]
      .filter((e) => { const k = `${e.at}|${e.level}|${e.total}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((p, q) => String(p.at).localeCompare(String(q.at)));
    if (x.cards || y.cards) out.cards = mergeMap(x.cards, y.cards);
    if (x.studyDays || y.studyDays) out.studyDays = [...new Set([...(x.studyDays || []), ...(y.studyDays || [])])].sort();
    if (x.quiz || y.quiz) {
      out.quiz = { ...(x.quiz || {}) };
      for (const [k, v] of Object.entries(y.quiz || {})) if (!out.quiz[k] || v.n > out.quiz[k].n) out.quiz[k] = v;
    }
    if (x.daily && y.daily && x.daily.day === y.daily.day) out.daily = { day: x.daily.day, newDone: Math.max(x.daily.newDone, y.daily.newDone) };
    return out;
  }
  function merge(a, b) {
    const x = normalize(JSON.parse(JSON.stringify(a)));
    const y = normalize(JSON.parse(JSON.stringify(b)));
    const yNewer = (y.updatedAt || 0) > (x.updatedAt || 0);
    const out = { ...(yNewer ? { ...x, ...y } : { ...y, ...x }) };
    out.settings = {};
    for (const scope of new Set([...Object.keys(x.settings), ...Object.keys(y.settings)])) {
      if (scope === 'sync') continue;
      out.settings[scope] = yNewer ? { ...x.settings[scope], ...y.settings[scope] } : { ...y.settings[scope], ...x.settings[scope] };
    }
    if (x.settings.sync) out.settings.sync = x.settings.sync;
    out.sections = {};
    for (const id of new Set([...Object.keys(x.sections), ...Object.keys(y.sections)])) {
      out.sections[id] = mergeSection(x.sections[id], y.sections[id], yNewer);
    }
    out.updatedAt = Math.max(x.updatedAt || 0, y.updatedAt || 0);
    return out;
  }
  // 받은 기록을 지금 기록과 합친다. 지금 기록이 바뀌었는지(=합친 결과가 받은 것과 다른지) 돌려준다
  function mergeIn(remote) {
    const merged = merge(data, remote);
    const changedLocal = JSON.stringify(merged.sections) !== JSON.stringify(data.sections)
      || JSON.stringify(merged.settings) !== JSON.stringify(data.settings);
    data = merged;
    if (changedLocal) save({ quiet: true });
    return changedLocal;
  }

  function section(id) {
    if (!data.sections[id]) data.sections[id] = {};
    const s = data.sections[id];
    s.items = s.items || {};
    s.exams = s.exams || [];
    return s;
  }

  // 설정: 저장된 값이 없으면 defaults
  function getSetting(scope, key, fallback) {
    const s = data.settings[scope];
    return s && s[key] !== undefined ? s[key] : fallback;
  }
  function setSetting(scope, key, value) {
    data.settings[scope] = data.settings[scope] || {};
    data.settings[scope][key] = value;
    save();
  }

  const item = (sectionId, id) => section(sectionId).items[id] || null;

  // 문항 하나를 푼 결과. 틀리면 오답노트에 넣고, 연속 정답이 reviewClearStreak 이상이면 뺀다.
  function recordAnswer(sectionId, id, correct) {
    const items = section(sectionId).items;
    const it = items[id] || { attempts: 0, lastCorrect: false, streak: 0, lastAt: null, review: false };
    it.attempts += 1;
    it.lastCorrect = !!correct;
    it.streak = correct ? it.streak + 1 : 0;
    it.lastAt = new Date().toISOString();
    it.at = Date.now();
    if (!correct) {
      it.review = true;
      it.reviewManual = false;
    } else if (it.review && it.streak >= window.APP_CONFIG.reviewClearStreak) {
      it.review = false;
    }
    items[id] = it;
    save();
    return it;
  }

  function removeFromReview(sectionId, id) {
    const it = item(sectionId, id);
    if (!it) return;
    it.review = false;
    it.reviewManual = true;
    it.at = Date.now();
    save();
  }

  function addExam(sectionId, record) {
    section(sectionId).exams.push(record);
    save();
  }

  function resetAll() {
    data = empty();
    return save();
  }

  return {
    load, save, onSave, merge, mergeIn, section, item, getSetting, setSetting, recordAnswer, removeFromReview, addExam, resetAll, replaceAll,
    get data() { return data; },
  };
})();
