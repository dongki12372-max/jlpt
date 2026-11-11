// ============================================================
// 문법 영역: 데이터(문형·문제), 기록, 홈 모드·요약
//   기록 (progress.json sections.grammar.items):
//     문항 id(bunpou·narabe) · `{bunshou id}#{빈칸 번호}` — 풀이 기록, 오답노트 = review 플래그
//     `point:{문형 key}` — 문형 기록 (퀴즈 결과와 문제에서 그 문형을 맞혔는지). review면 「약한 문형」, quizAt = 퀴즈로 마지막에 푼 시각
//   약한 문형도 오답노트 문항과 같은 복습 일정이다 (config.reviewIntervalsDays).
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
    get order() { return Storage.getSetting(SECTION, 'order', 'resume'); },
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
  // 따라 읽기(ReadAlong) 항목: 음성 주소 + 줄마다 단어 시각(manifest) + 줄마다 문장·단어 사전·해석
  const audioWords = (kind, id) => (data.manifest && data.manifest[`${kind}/${id}`] && data.manifest[`${kind}/${id}`].words) || null;
  const exampleRead = (p, n) => {
    const ex = p.examples[n - 1];
    return { src: exampleAudio(p, n), words: audioWords('examples', `${p.id}-${n}`), lines: [{ markup: ex.furigana, gloss: ex.gloss, ko: ex.meaning_ko }] };
  };
  const questionRead = (q) => {
    const ja = q.fullFurigana.split('\n');
    const ko = q.fullKo.split('\n');
    const perLine = ko.length === ja.length;   // 줄 수가 같으면 줄마다 해석, 아니면 끝에 한 번
    return {
      src: questionAudio(q), words: audioWords('questions', q.id),
      lines: ja.map((markup, i) => ({ markup, gloss: q.gloss ? q.gloss[i] : null, ko: perLine ? ko[i] : (i === ja.length - 1 ? q.fullKo.replace(/\n/g, ' ') : '') })),
    };
  };

  const pointRecord = (key) => Storage.item(SECTION, `point:${key}`);
  // new 아직 안 봄 / ok 맞힘 / weak 틀려서 다시 볼 문형 (복습 간격마다 다시 맞히면 ok로)
  function pointState(p) {
    const r = pointRecord(p.key);
    if (!r) return 'new';
    return r.review ? 'weak' : 'ok';
  }
  const POINT_STATE_LABEL = { new: '안 푼 문형', ok: '맞힘', weak: '약한 문형' };
  // quiz = 문형 퀴즈로 푼 것 (오늘의 학습이 그날 퀴즈로 본 문형을 센다)
  const recordPoint = (key, correct, quiz = false) => {
    if (point(key)) Storage.recordAnswer(SECTION, `point:${key}`, correct, quiz ? { quizAt: Util.now() } : null);
  };
  const duePoints = (level, now = Util.now()) => points(level).filter((p) => Util.isDue(pointRecord(p.key), now));   // 오늘 복습할 약한 문형

  // ---------- 문제 ----------
  const questions = (level) => (data && data.questions[level.toLowerCase()]) || [];
  const question = (id) => LEVELS.flatMap(questions).find((q) => q.id === id) || null;
  const levelTypes = (level) => cfg.typeOrder.filter((t) => t in cfg.levels[level].exam);
  // 채점 단위: bunshou는 빈칸마다
  const recordIds = (q) => (q.type === 'bunshou' ? q.items.map((_, i) => `${q.id}#${i + 1}`) : [q.id]);
  const itemCount = (q) => (q.type === 'bunshou' ? q.items.length : 1);
  const targetsOf = (q, i = null) => (q.type !== 'bunshou' ? q.targets : i === null ? q.items.flatMap((it) => it.targets) : q.items[i].targets);
  // 문항 기록 요약: 푼 적 있으면 { lastCorrect: 모든 빈칸을 마지막에 맞혔는지, review: 하나라도 오답노트, at: 마지막으로 푼 시각,
  //   stage·due: 오답노트 빈칸 중 가장 덜 나아간 단계·가장 이른 복습 날 }
  function record(q) {
    const rs = recordIds(q).map((id) => Storage.item(SECTION, id));
    if (!rs.some(Boolean)) return null;
    const wrong = rs.filter((r) => r && r.review);
    return {
      lastCorrect: rs.every((r) => r && r.lastCorrect), review: wrong.length > 0,
      at: Math.max(...rs.map(Util.stamp)),
      ...(wrong.length ? { stage: Math.min(...wrong.map((r) => r.stage || 0)), due: Math.min(...wrong.map((r) => r.due || 0)) } : {}),
    };
  }
  // 문항(또는 bunshou의 빈칸 i) 하나를 푼 결과. 그 문형 기록도 같이 남긴다.
  function recordAnswer(q, i, correct) {
    const id = q.type === 'bunshou' ? `${q.id}#${i + 1}` : q.id;
    Storage.recordAnswer(SECTION, id, correct);
    for (const t of targetsOf(q, q.type === 'bunshou' ? i : null)) recordPoint(t, correct);
  }
  const reviewList = (level) => questions(level).filter((q) => (record(q) || {}).review);
  const dueList = (level, now = Util.now()) => reviewList(level).filter((q) => Util.isDue(record(q), now));   // 오늘 복습할 오답노트 문항
  const exams = (level) => Storage.section(SECTION).exams.filter((e) => e.level === level);
  const questionsFor = (key) => LEVELS.flatMap(questions).filter((q) => targetsOf(q).includes(key));

  // ---------- 홈 ----------
  function modes(level) {
    const ps = points(level);
    const weak = ps.filter((p) => pointState(p) === 'weak').length;
    const dueP = duePoints(level).length;
    const hasQ = questions(level).length > 0;
    const nReview = reviewList(level).length;
    return [
      { id: 'points', title: '문형 사전', desc: ps.length ? `${ps.length}개 · 객관식 퀴즈${weak ? ` · 약한 문형 ${weak}${dueP ? ` (오늘 복습 ${dueP})` : ''}` : ''}` : '준비 중', enabled: ps.length > 0, open: () => GrammarPoints.showList(level, {}) },
      { id: 'practice', title: '유형별 연습', desc: hasQ ? '형식을 골라 풀고 바로 해설 확인' : '준비 중', enabled: hasQ, open: () => GrammarPractice.showSetup(level) },
      { id: 'exam', title: '실전 모의', desc: hasQ ? `${cfg.levels[level].examMinutes}분 · 자유 이동·제출` : '준비 중', enabled: hasQ, open: () => GrammarExam.showStart(level) },
      { id: 'review', title: '오답노트', desc: !hasQ ? '준비 중' : Util.reviewDesc(nReview, dueList(level).length), enabled: hasQ, open: () => GrammarReview.show(level) },
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
        <p class="dim small">문형 퀴즈나 문제에서 그 문형을 맞히면 「맞힘」, 틀리면 「약한 문형」이 됩니다. 약한 문형은 ${Util.reviewRule('풀립니다')}.</p>
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
    points, point, allPoints, exampleAudio, questionAudio, hasAudio, exampleRead, questionRead, pointRecord, pointState, POINT_STATE_LABEL, recordPoint, duePoints,
    questions, question, levelTypes, recordIds, itemCount, targetsOf, record, recordAnswer, reviewList, dueList, exams, questionsFor,
    get data() { return data; },
  };
})();
