// ============================================================
// 청해 · 오답노트: 틀린 문항(items[id].review)을 레벨·유형별로 모아 다시 풀기
//   복습 간격(config.reviewIntervalsDays)마다 다시 맞히면 자동으로 빠지고, 목록에서 수동으로 뺄 수도 있다.
//   「오늘 복습」은 복습 날이 된 문항만, 「전체 다시 풀기」·「이 유형만 풀기」는 날짜와 상관없이 전부.
// ============================================================
const Review = (() => {
  const cfg = () => Listening.cfg;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let session = null;   // { level, list, idx, results: {id: {n, correct, was}} } — 건너뛴 문항은 없음

  // ---------- 목록 ----------
  function show(level) {
    const list = Listening.reviewList(level);
    const nDue = Listening.dueList(level).length;
    const groups = Listening.levelTypes(level).map((t) => {
      const qs = list.filter((q) => q.type === t);
      if (!qs.length) return '';
      const tc = cfg().types[t];
      const rows = qs.map((q) => {
        const r = Listening.record(q);
        return `
          <li data-qid="${q.id}">
            <span class="qid">${q.id}</span>
            <span class="dim">시도 ${r.attempts}회 · ${Util.reviewStatus(r)}</span>
            <button class="link danger" data-remove="${q.id}" title="오답노트에서 빼기">빼기</button>
          </li>`;
      }).join('');
      return `
        <section class="card review-group">
          <div class="group-head">
            <h3><span lang="ja">${tc.label_ja}</span> <span class="dim">${tc.label_ko}</span> · ${qs.length}문항</h3>
            <button class="secondary" data-start-type="${t}">이 유형만 풀기</button>
          </div>
          <ul class="review-list">${rows}</ul>
        </section>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 청해 오답노트</span>
        <span class="pos">${list.length}문항</span>
      </div>
      ${list.length ? `
        ${Util.reviewButtons(nDue)}
        ${groups}` : `
        <section class="card empty"><p>오답노트가 비어 있습니다. 연습이나 실전 모의에서 틀린 문항이 여기에 모입니다.</p></section>`}
    `, { onKey: (e) => {
      if (e.key === 'Enter' && list.length) { e.preventDefault(); start(level, null, nDue > 0); } else if (e.key === 'Escape') App.showHome();
    } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    if (!list.length) return;
    $('[data-act="all"]').addEventListener('click', () => start(level, null));
    if (nDue) $('[data-act="due"]').addEventListener('click', () => start(level, null, true));
    $$('[data-start-type]').forEach((b) => b.addEventListener('click', () => start(level, b.dataset.startType)));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      Storage.removeFromReview(Listening.SECTION, b.dataset.remove);
      show(level);
    }));
  }

  // ---------- 다시 풀기 ----------
  function start(level, type, dueOnly = false) {
    // 유형 순서(실전 순서)대로
    const order = Listening.levelTypes(level);
    const list = (dueOnly ? Listening.dueList(level) : Listening.reviewList(level))
      .filter((q) => !type || q.type === type)
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    if (!list.length) { show(level); return; }
    session = { level, list, idx: 0, results: {} };
    showQuestion();
  }

  function showQuestion() {
    const q = session.list[session.idx];
    const tc = cfg().types[q.type];
    const last = session.idx === session.list.length - 1;
    const done = session.results[q.id];
    const next = () => {
      if (session.idx < session.list.length - 1) { session.idx += 1; showQuestion(); } else { showDone(); }
    };
    QuestionView.show(q, {
      crumb: `${q.level} · 오답노트 · <span lang="ja">${tc.label_ja}</span> ${tc.label_ko}`,
      pos: `${session.idx + 1} / ${session.list.length}`,
      backLabel: '← 오답노트',
      onBack: () => show(session.level),
      answered: done ? done.n : undefined,
      autoplay: !done,
      onAnswer: (n, correct) => {
        const r = Listening.recordAnswer(q, correct);
        session.results[q.id] = { n, correct, was: true, cleared: !r.review };
      },
      nextLabel: last ? '결과 보기' : '다음 문제',
      onNext: next,
      onSkip: next,
      onPrev: session.idx > 0 ? () => { session.idx -= 1; showQuestion(); } : null,
    });
  }

  function showDone() {
    const { level, list, results } = session;
    const cleared = Object.values(results).filter((r) => r.cleared).length;
    const rows = list.map((q, i) => {
      const r = results[q.id];
      return Util.resultRow(r, `${i + 1}. ${q.id}${Util.reviewBadge(r, Listening.record(q))}`);
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 오답노트</button>
        <span class="crumb">${level} · 오답노트 결과</span>
      </div>
      <section class="card done">
        ${Util.resultHead(list, results)}
        <p class="dim">이번에 오답노트에서 빠진 문항: ${cleared}개 · 남은 문항: ${Listening.reviewList(level).length}개</p>
        <ul class="result-list">${rows}</ul>
        <div class="next-row">
          <button class="primary" data-act="back">오답노트로</button>
        </div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); show(level); } } });
    $$('[data-act="back"]').forEach((b) => b.addEventListener('click', () => show(level)));
  }

  return { show };
})();
