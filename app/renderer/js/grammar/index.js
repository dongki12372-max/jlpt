// ============================================================
// 문법 영역: 데이터(문형·문제), 기록, 홈 모드·요약
//   기록 (progress.json sections.grammar.items):
//     문항 id(bunpou·narabe) · `{bunshou id}#{빈칸 번호}` — 풀이 기록, 오답노트 = review 플래그
//     `point:{문형 key}` — 문형 기록 (퀴즈 결과와 문제에서 그 문형을 맞혔는지). review면 「약한 문형」
// ============================================================
const Grammar = (() => {
  const SECTION = 'grammar';
  const cfg = window.APP_CONFIG.sections[SECTION];
  const LEVELS = Object.keys(window.APP_CONFIG.levels);   // N5, N4, N3 (쉬운 순)
  let data = null;    // { points: {n5: […]}, questions: {n5: […]}, manifest }
  let byKey = new Map();

  const prefs = {
    get furigana() { return Storage.getSetting('common', 'furigana', true); },
    set furigana(v) { Storage.setSetting('common', 'furigana', !!v); },
    get showKo() { return Storage.getSetting(SECTION, 'showKo', true); },
    set showKo(v) { Storage.setSetting(SECTION, 'showKo', !!v); },
    get order() { return Storage.getSetting(SECTION, 'order', 'seq'); },
    set order(v) { Storage.setSetting(SECTION, 'order', v); },
    get unsolvedFirst() { return Storage.getSetting(SECTION, 'unsolvedFirst', true); },
    set unsolvedFirst(v) { Storage.setSetting(SECTION, 'unsolvedFirst', !!v); },
  };

  async function load() {
    data = await window.jlpt.loadSection(SECTION);
    byKey = new Map();
    for (const lv of LEVELS) for (const p of points(lv)) byKey.set(p.key, p);
  }

  // ---------- 문형 ----------
  const points = (level) => (data && data.points[level.toLowerCase()]) || [];
  const point = (key) => byKey.get(key) || null;
  const allPoints = () => LEVELS.flatMap(points);
  const exampleAudio = (p, n) => `../../audio/${SECTION}/examples/${p.id}-${n}.mp3`;
  const questionAudio = (q) => `../../audio/${SECTION}/questions/${q.id}.mp3`;
  const hasAudio = (kind, id) => !!(data.manifest && data.manifest[`${kind}/${id}`]);

  const pointRecord = (key) => Storage.item(SECTION, `point:${key}`);
  // new 아직 안 봄 / ok 맞힘 / weak 틀려서 다시 볼 문형 (연속 reviewClearStreak번 맞히면 ok로)
  function pointState(p) {
    const r = pointRecord(p.key);
    if (!r) return 'new';
    return r.review ? 'weak' : 'ok';
  }
  const POINT_STATE_LABEL = { new: '안 푼 문형', ok: '맞힘', weak: '약한 문형' };
  const recordPoint = (key, correct) => { if (point(key)) Storage.recordAnswer(SECTION, `point:${key}`, correct); };

  // ---------- 문제 ----------
  const questions = (level) => (data && data.questions[level.toLowerCase()]) || [];
  const question = (id) => LEVELS.flatMap(questions).find((q) => q.id === id) || null;
  const levelTypes = (level) => cfg.typeOrder.filter((t) => t in cfg.levels[level].exam);
  // 채점 단위: bunshou는 빈칸마다
  const recordIds = (q) => (q.type === 'bunshou' ? q.items.map((_, i) => `${q.id}#${i + 1}`) : [q.id]);
  const itemCount = (q) => (q.type === 'bunshou' ? q.items.length : 1);
  const targetsOf = (q, i = null) => (q.type !== 'bunshou' ? q.targets : i === null ? q.items.flatMap((it) => it.targets) : q.items[i].targets);
  // 문항 기록 요약: 푼 적 있으면 { lastCorrect: 모든 빈칸을 마지막에 맞혔는지, review: 하나라도 오답노트 }
  function record(q) {
    const rs = recordIds(q).map((id) => Storage.item(SECTION, id));
    if (!rs.some(Boolean)) return null;
    return { lastCorrect: rs.every((r) => r && r.lastCorrect), review: rs.some((r) => r && r.review) };
  }
  // 문항(또는 bunshou의 빈칸 i) 하나를 푼 결과. 그 문형 기록도 같이 남긴다.
  function recordAnswer(q, i, correct) {
    const id = q.type === 'bunshou' ? `${q.id}#${i + 1}` : q.id;
    Storage.recordAnswer(SECTION, id, correct);
    for (const t of targetsOf(q, q.type === 'bunshou' ? i : null)) recordPoint(t, correct);
  }
  const reviewList = (level) => questions(level).filter((q) => (record(q) || {}).review);
  const exams = (level) => Storage.section(SECTION).exams.filter((e) => e.level === level);
  const questionsFor = (key) => LEVELS.flatMap(questions).filter((q) => targetsOf(q).includes(key));

  // ---------- 홈 ----------
  function modes(level) {
    const ps = points(level);
    const weak = ps.filter((p) => pointState(p) === 'weak').length;
    const hasQ = questions(level).length > 0;
    const nReview = reviewList(level).length;
    return [
      { id: 'points', title: '문형 사전', desc: ps.length ? `${ps.length}개 · 객관식 퀴즈${weak ? ` · 약한 문형 ${weak}` : ''}` : '준비 중', enabled: ps.length > 0, open: () => GrammarPoints.showList(level, {}) },
      { id: 'practice', title: '유형별 연습', desc: hasQ ? '형식을 골라 풀고 바로 해설 확인' : '준비 중', enabled: hasQ, open: () => GrammarPractice.showSetup(level) },
      { id: 'exam', title: '실전 모의', desc: hasQ ? `${cfg.levels[level].examMinutes}분 · 자유 이동·제출` : '준비 중', enabled: hasQ, open: () => GrammarExam.showStart(level) },
      { id: 'review', title: '오답노트', desc: !hasQ ? '준비 중' : nReview ? `${nReview}문항 · 연속 ${window.APP_CONFIG.reviewClearStreak}번 맞히면 빠짐` : '틀린 문항이 없습니다', enabled: hasQ, open: () => GrammarReview.show(level) },
    ];
  }

  function summary(level) {
    const rows = LEVELS.map((lv) => {
      const ps = points(lv);
      const ok = ps.filter((p) => pointState(p) === 'ok').length;
      const weak = ps.filter((p) => pointState(p) === 'weak').length;
      return `<tr class="${lv === level ? 'current' : ''}"><td>${lv}</td><td class="num">${ok} / ${ps.length}</td><td class="num">${weak}</td></tr>`;
    }).join('');
    const qs = questions(level);
    const qRows = levelTypes(level).map((t) => {
      const ofType = qs.filter((q) => q.type === t);
      const solved = ofType.filter((q) => record(q));
      const right = solved.filter((q) => record(q).lastCorrect).length;
      const exam = cfg.levels[level].exam[t];
      return `<tr><td><span lang="ja">${cfg.types[t].label_ja}</span> <span class="dim">${cfg.types[t].label_ko}</span></td>
        <td class="num">${solved.length ? `${Math.round((right / solved.length) * 100)}%` : '<span class="dim">—</span>'}</td>
        <td class="num">${solved.length} / ${ofType.length}</td><td class="num">${t === 'bunshou' ? `빈칸 ${exam}` : exam}</td></tr>`;
    }).join('');
    const last = exams(level).slice(-1)[0];
    return `
      <section class="card">
        <h2>문형</h2>
        <table class="table" data-el="grammar-points-summary">
          <thead><tr><th>레벨</th><th class="num">맞힌 문형 / 전체</th><th class="num">약한 문형</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="dim small">문형 퀴즈나 문제에서 그 문형을 맞히면 「맞힘」, 틀리면 「약한 문형」이 됩니다.</p>
      </section>
      ${qs.length ? `
      <section class="card">
        <h2>${level} 문법 문제</h2>
        <p class="last-exam">최근 실전 모의: ${last ? `<span data-el="last-exam">${last.correct} / ${last.total}</span> 정답 (${Math.round((last.correct / last.total) * 100)}%)` : '<span class="dim">아직 응시하지 않았습니다</span>'}</p>
        <table class="table" data-el="summary">
          <thead><tr><th>형식</th><th class="num">정답률</th><th class="num">푼 문항</th><th class="num">실전 구성</th></tr></thead>
          <tbody>${qRows}</tbody>
        </table>
      </section>` : ''}`;
  }

  App.registerSection(SECTION, { load, modes, summary });

  return {
    SECTION, cfg, prefs, LEVELS,
    points, point, allPoints, exampleAudio, questionAudio, hasAudio, pointRecord, pointState, POINT_STATE_LABEL, recordPoint,
    questions, question, levelTypes, recordIds, itemCount, targetsOf, record, recordAnswer, reviewList, exams, questionsFor,
    get data() { return data; },
  };
})();
