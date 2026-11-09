// ============================================================
// 청해 · 유형별 연습: 유형 선택 → 문항 풀이(QuestionView) → 결과
// ============================================================
const Practice = (() => {
  let session = null;   // { level, type, list, idx, results: {id: {n, correct}} } — 건너뛴 문항은 results에 없음

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
    session = {
      level, type,
      list,
      idx: 0,
      results: {},
    };
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
      backLabel: '← 유형 선택',
      onBack: () => showSetup(session.level),
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
    const { results, list, level, type } = session;
    const tc = cfg().types[type];
    const rows = list.map((q, i) => Util.resultRow(results[q.id], `${i + 1}. ${q.id}`)).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 유형 선택</button>
        <span class="crumb">${level} · <span lang="ja">${tc.label_ja}</span> ${tc.label_ko}</span>
      </div>
      <section class="card done">
        ${Util.resultHead(list, results)}
        <ul class="result-list">${rows}</ul>
        <div class="next-row">
          <button class="secondary" data-act="back">유형 선택</button>
          <button class="primary" data-act="again">다시 풀기</button>
        </div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Enter') { e.preventDefault(); start(level, type); } else if (e.key === 'Escape') showSetup(level); } });

    $$('[data-act="back"]').forEach((b) => b.addEventListener('click', () => showSetup(level)));
    $('[data-act="again"]').addEventListener('click', () => start(level, type));
  }

  return { showSetup };
})();
