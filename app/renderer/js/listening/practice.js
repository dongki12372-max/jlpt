// ============================================================
// 청해 · 유형별 연습: 유형 선택 → 문항 풀이(QuestionView) → 결과 (run은 오늘의 학습도 쓴다)
// ============================================================
const Practice = (() => {
  let session = null;   // { level, list, idx, results: {id: {n, correct}}, title, back, … } — 건너뛴 문항은 results에 없음

  const cfg = () => Listening.cfg;
  const prefs = () => Listening.prefs;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- 유형 선택 ----------
  function showSetup(level) {
    const qs = Listening.questions(level);
    const cards = Listening.levelTypes(level).map((t) => {
      const ofType = qs.filter((q) => q.type === t);
      const n = ofType.length;
      const solved = ofType.filter((q) => Listening.record(q)).length;
      const tc = cfg().types[t];
      return `
        <button class="type-card" data-type="${t}" ${n ? '' : 'disabled'}>
          <span class="type-ja" lang="ja">${tc.label_ja}</span>
          <span class="type-ko">${tc.label_ko}</span>
          <span class="dim">${n}문항 · 푼 문항 ${solved}${Util.resumeNote(ofType, prefs().order, Listening.record)}</span>
        </button>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 유형별 연습</span>
      </div>
      <h2>유형 선택</h2>
      ${Util.orderButtons(prefs().order)}
      <label class="switch inline"><input type="checkbox" data-el="unsolved" ${prefs().unsolvedFirst ? 'checked' : ''}> 안 푼 문항 우선</label>
      <div class="type-grid">${cards}</div>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    $$('[data-order]').forEach((b) => b.addEventListener('click', () => {
      prefs().order = b.dataset.order;
      showSetup(level);
    }));
    $('[data-el="unsolved"]').addEventListener('change', (e) => { prefs().unsolvedFirst = e.target.checked; });
    $$('[data-type]').forEach((b) => b.addEventListener('click', () => start(level, b.dataset.type)));
  }

  function start(level, type) {
    let list = Util.orderList(Listening.questions(level).filter((q) => q.type === type), prefs().order, Listening.record);
    // 안 푼 문항 우선: 순서(이어서/처음부터/무작위)는 유지한 채 안 푼 문항을 앞으로
    if (prefs().unsolvedFirst) list = [...list.filter((q) => !Listening.record(q)), ...list.filter((q) => Listening.record(q))];
    const tc = cfg().types[type];
    run({
      level, list, title: `<span lang="ja">${tc.label_ja}</span> ${tc.label_ko}`,
      back: () => showSetup(level), backLabel: '← 유형 선택', again: () => start(level, type),
    });
  }

  // 문항 목록을 차례로 푼다 (유형별 연습·오늘의 학습 공용). title은 HTML, again이 있으면 결과 화면에 그 버튼(againLabel)
  function run({ level, list, title, back, backLabel = '← 뒤로', again = null, againLabel = '다시 풀기' }) {
    session = { level, list, idx: 0, results: {}, title, back, backLabel, again, againLabel };
    showQuestion();
  }

  // ---------- 문항 ----------
  function showQuestion() {
    const q = session.list[session.idx];
    const tc = cfg().types[q.type];
    const last = session.idx === session.list.length - 1;
    const done = session.results[q.id];   // 이전으로 돌아온 문항은 해설부터
    QuestionView.show(q, {
      crumb: `${q.level} · <span lang="ja">${tc.label_ja}</span> ${tc.label_ko}`,
      pos: `${session.idx + 1} / ${session.list.length}`,
      backLabel: session.backLabel,
      onBack: session.back,
      answered: done ? done.n : undefined,
      autoplay: !done,
      onAnswer: (n, correct) => {
        session.results[q.id] = { n, correct };
        Listening.recordAnswer(q, correct);
      },
      nextLabel: last ? '결과 보기' : '다음 문제',
      onNext: next,
      onSkip: next,
      onPrev: session.idx > 0 ? () => { session.idx -= 1; showQuestion(); } : null,
    });
  }

  function next() {
    if (session.idx < session.list.length - 1) {
      session.idx += 1;
      showQuestion();
    } else {
      showDone();
    }
  }

  // ---------- 결과 ----------
  function showDone() {
    const { results, list, level, title, back, backLabel, again, againLabel } = session;
    const rows = list.map((q, i) => Util.resultRow(results[q.id], `${i + 1}. ${q.id}`)).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">${Util.esc(backLabel)}</button>
        <span class="crumb">${level} · ${title}</span>
      </div>
      <section class="card done">
        ${Util.resultHead(list, results)}
        <ul class="result-list">${rows}</ul>
        <div class="next-row">
          <button class="secondary" data-act="back">${Util.esc(backLabel.replace(/^← /, ''))}</button>
          ${again ? `<button class="primary" data-act="again">${Util.esc(againLabel)}</button>` : ''}
        </div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Enter' && again) { e.preventDefault(); again(); } else if (e.key === 'Escape') back(); } });

    $$('[data-act="back"]').forEach((b) => b.addEventListener('click', back));
    if (again) $('[data-act="again"]').addEventListener('click', again);
  }

  return { showSetup, run };
})();
