// ============================================================
// 기록 저장 (영역 공통) — preload를 거쳐 메인 프로세스가 userData/progress.json에 쓴다.
//   구조는 docs/DESIGN.md 2장:
//   { version, settings: { common, {영역} }, sections: { {영역}: { items: {id: {...}}, exams: [...] } } }
//   오답노트는 별도 목록이 아니라 items[id].review 플래그다.
// ============================================================
const Storage = (() => {
  const VERSION = 1;
  let data = null;
  let saving = Promise.resolve();

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

  // 저장은 순서대로 (앞의 저장이 끝난 뒤 최신 상태를 쓴다)
  function save() {
    saving = saving.then(() => window.jlpt.saveProgress(data)).catch((e) => console.warn('기록 저장 실패', e));
    return saving;
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
    load, save, section, item, getSetting, setSetting, recordAnswer, removeFromReview, addExam, resetAll, replaceAll,
    get data() { return data; },
  };
})();
