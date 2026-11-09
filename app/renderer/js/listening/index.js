// ============================================================
// 청해(聴解) 영역: 데이터 접근 도우미, 설정, 홈 화면의 모드·요약, App에 등록
// ============================================================
const Listening = (() => {
  const SECTION = 'listening';
  const cfg = window.APP_CONFIG.sections[SECTION];
  let data = null;   // { questions: {n5: […]}, manifest: {id: {...}} }

  // 설정 (progress.json settings). 재생 속도는 연습 중 바꾼 값을 이번 실행 동안만 유지하고,
  // 저장되는 기본값은 설정 화면에서만 바꾼다.
  let sessionRate = null;
  const prefs = {
    get furigana() { return Storage.getSetting('common', 'furigana', true); },
    set furigana(v) { Storage.setSetting('common', 'furigana', !!v); },
    get defaultRate() { return Storage.getSetting(SECTION, 'playbackRate', cfg.defaultPlaybackRate); },
    set defaultRate(v) { Storage.setSetting(SECTION, 'playbackRate', v); sessionRate = v; },
    get rate() { return sessionRate === null ? this.defaultRate : sessionRate; },
    set rate(v) { sessionRate = v; },
    get answerSeconds() { return Storage.getSetting(SECTION, 'answerSeconds', cfg.answerSeconds); },
    set answerSeconds(v) { Storage.setSetting(SECTION, 'answerSeconds', v); },
    get order() { return Storage.getSetting(SECTION, 'order', 'resume'); },
    set order(v) { Storage.setSetting(SECTION, 'order', v); },
    // 해설 스크립트의 줄별 한국어 해석 표시
    get showKo() { return Storage.getSetting(SECTION, 'showKo', true); },
    set showKo(v) { Storage.setSetting(SECTION, 'showKo', !!v); },
    get unsolvedFirst() { return Storage.getSetting(SECTION, 'unsolvedFirst', false); },
    set unsolvedFirst(v) { Storage.setSetting(SECTION, 'unsolvedFirst', !!v); },
  };

  async function load() {
    data = await window.jlpt.loadSection(SECTION);
  }

  const questions = (level) => data.questions[level.toLowerCase()] || [];
  const levelTypes = (level) => cfg.typeOrder.filter((t) => t in cfg.levels[level].exam);
  const audioUrl = (q) => `../../audio/${SECTION}/${q.level.toLowerCase()}/${q.id}.mp3`;
  const audioInfo = (q) => data.manifest[q.id] || null;
  const readImage = (name) => window.jlpt.readImage(SECTION, name);

  // 기록
  const record = (q) => Storage.item(SECTION, q.id);
  const recordAnswer = (q, correct) => Storage.recordAnswer(SECTION, q.id, correct);
  const reviewList = (level) => questions(level).filter((q) => (record(q) || {}).review);
  const exams = (level) => Storage.section(SECTION).exams.filter((e) => e.level === level);

  // ---------- 홈 ----------
  function modes(level) {
    const nReview = reviewList(level).length;
    return [
      { id: 'practice', title: '유형별 연습', desc: '유형을 골라 한 문제씩 풀고 바로 해설 확인', enabled: true, open: () => Practice.showSetup(level) },
      { id: 'exam', title: '실전 모의', desc: '실제 순서·시간대로 한 번만 듣고 풀기', enabled: true, open: () => Exam.showStart(level) },
      { id: 'review', title: '오답노트', desc: nReview ? `${nReview}문항 · 연속 ${window.APP_CONFIG.reviewClearStreak}번 맞히면 빠짐` : '틀린 문항이 없습니다', enabled: true, open: () => Review.show(level) },
    ];
  }

  function summary(level) {
    const qs = questions(level);
    const rows = levelTypes(level).map((t) => {
      const ofType = qs.filter((q) => q.type === t);
      const solved = ofType.filter((q) => record(q));
      const right = solved.filter((q) => record(q).lastCorrect).length;
      const withAudio = ofType.filter((q) => audioInfo(q)).length;
      return `
        <tr>
          <td><span lang="ja">${cfg.types[t].label_ja}</span> <span class="dim">${cfg.types[t].label_ko}</span></td>
          <td class="num">${solved.length ? `${Math.round((right / solved.length) * 100)}%` : '<span class="dim">—</span>'}</td>
          <td class="num">${solved.length} / ${ofType.length}</td>
          <td class="num">${cfg.levels[level].exam[t]}</td>
          <td class="num ${withAudio < ofType.length ? 'warn' : ''}">${withAudio} / ${ofType.length}</td>
        </tr>`;
    }).join('');
    const last = exams(level).slice(-1)[0];
    const lastText = last
      ? `<span class="score-mini" data-el="last-exam">${last.score}</span> / ${cfg.examScoreMax}점 · ${last.correct}/${last.total} 정답 · ${new Date(last.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : '<span class="dim">아직 응시하지 않았습니다</span>';
    return `
      <section class="card">
        <h2>${level} 청해 현황</h2>
        <p class="last-exam">최근 실전 모의: ${lastText}</p>
        <table class="table" data-el="summary">
          <thead><tr><th>유형</th><th class="num">정답률</th><th class="num">푼 문항</th><th class="num">실전 구성</th><th class="num">음성</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="dim small">정답률은 푼 문항의 마지막 풀이 기준입니다.</p>
      </section>`;
  }

  // ---------- 설정 화면 항목 ----------
  const settings = {
    render() {
      return `
        <label class="row">
          <span>기본 재생 속도 <span class="dim small">(연습 모드)</span></span>
          <select data-setting="playbackRate">
            ${cfg.playbackRates.map((r) => `<option value="${r}" ${r === prefs.defaultRate ? 'selected' : ''}>${r.toFixed(1)}×</option>`).join('')}
          </select>
        </label>
        <label class="row">
          <span>답 고르는 시간 <span class="dim small">(실전 모의)</span></span>
          <select data-setting="answerSeconds">
            ${cfg.answerSecondsOptions.map((s) => `<option value="${s}" ${s === prefs.answerSeconds ? 'selected' : ''}>${s}초</option>`).join('')}
          </select>
        </label>`;
    },
    bind(root, saved) {
      root.querySelector('[data-setting="playbackRate"]').addEventListener('change', (e) => { prefs.defaultRate = Number(e.target.value); saved(); });
      root.querySelector('[data-setting="answerSeconds"]').addEventListener('change', (e) => { prefs.answerSeconds = Number(e.target.value); saved(); });
    },
  };

  App.registerSection(SECTION, { load, modes, summary, settings });

  return { SECTION, cfg, prefs, questions, levelTypes, audioUrl, audioInfo, readImage, record, recordAnswer, reviewList, exams };
})();
