// ============================================================
// 문법 · 유형별 연습 (형식 선택 → 문항 풀이 → 결과)과 오답노트
//   bunshou는 빈칸마다 채점·기록하고, 결과 목록에는 「맞힌 빈칸 / 빈칸 수」로 보여 준다.
// ============================================================
const GrammarPractice = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const prefs = () => Grammar.prefs;
  const cfg = () => Grammar.cfg;

  const preview = (q) => (q.type === 'bunshou' ? q.title : q.stem.replace(/［＿］|［★］/g, '＿').replace(/\n/g, ' '));

  function showSetup(level) {
    const qs = Grammar.questions(level);
    const cards = Grammar.levelTypes(level).map((t) => {
      const ofType = qs.filter((q) => q.type === t);
      const solved = ofType.filter((q) => Grammar.record(q)).length;
      const tc = cfg().types[t];
      return `
        <button class="type-card" data-type="${t}" ${ofType.length ? '' : 'disabled'}>
          <span class="type-ja" lang="ja">${tc.label_ja}</span>
          <span class="type-ko">${tc.label_ko}</span>
          <span class="dim">${ofType.length}${t === 'bunshou' ? '편' : '문항'} · 푼 ${solved}</span>
        </button>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문법 · 유형별 연습</span>
      </div>
      <h2>형식 선택</h2>
      <div class="segmented" role="radiogroup">
        <button data-order="seq" class="${prefs().order === 'seq' ? 'active' : ''}">순서대로</button>
        <button data-order="random" class="${prefs().order === 'random' ? 'active' : ''}">무작위</button>
      </div>
      <label class="switch inline"><input type="checkbox" data-el="unsolved" ${prefs().unsolvedFirst ? 'checked' : ''}> 안 푼 문항 우선</label>
      <div class="type-grid">${cards}</div>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    $$('[data-order]').forEach((b) => b.addEventListener('click', () => {
      prefs().order = b.dataset.order;
      $$('[data-order]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    $('[data-el="unsolved"]').addEventListener('change', (e) => { prefs().unsolvedFirst = e.target.checked; });
    $$('[data-type]').forEach((b) => b.addEventListener('click', () => {
      let list = Grammar.questions(level).filter((q) => q.type === b.dataset.type);
      if (prefs().order === 'random') list = Util.shuffle(list);
      if (prefs().unsolvedFirst) list = [...list.filter((q) => !Grammar.record(q)), ...list.filter((q) => Grammar.record(q))];
      run({ level, list, title: cfg().types[b.dataset.type].label_ko, back: () => showSetup(level), again: () => b.click() });
    }));
  }

  // 문항 목록을 차례로 푼다 (연습·오답노트·문형의 관련 문제 공용)
  //   results[id] = { n, correct } (bunshou: { n: 빈칸별 배열, correct: 다 맞혔는지, right }) — 건너뛴 문항은 없음
  function run({ level, list, title, back, again, review = false }) {
    const session = { list, idx: 0, results: {} };
    showQuestion();

    function showQuestion() {
      const q = session.list[session.idx];
      const tc = cfg().types[q.type];
      const last = session.idx === session.list.length - 1;
      const done = session.results[q.id];
      const next = () => {
        if (session.idx < session.list.length - 1) { session.idx += 1; showQuestion(); } else showDone();
      };
      const partial = q.type === 'bunshou' ? (done ? done.n.slice() : new Array(q.items.length).fill(0)) : null;
      GrammarQuestionView.show(q, {
        crumb: `${level} · ${review ? '오답노트' : `<span lang="ja">${tc.label_ja}</span> ${tc.label_ko}`}`,
        pos: `${session.idx + 1} / ${session.list.length}`,
        backLabel: review ? '← 오답노트' : '← 뒤로',
        onBack: back,
        answered: done ? done.n : undefined,
        onAnswer: q.type === 'bunshou'
          ? (i, n, correct) => {
            partial[i] = n;
            Grammar.recordAnswer(q, i, correct);
            if (partial.every((a) => a > 0)) {
              const right = partial.filter((a, k) => a === q.items[k].answer).length;
              session.results[q.id] = { n: partial.slice(), correct: right === q.items.length, right };
            }
          }
          : (n, correct) => {
            session.results[q.id] = { n, correct };
            Grammar.recordAnswer(q, null, correct);
          },
        nextLabel: last ? '결과 보기' : '다음 문제',
        onNext: next,
        onSkip: next,
        onPrev: session.idx > 0 ? () => { session.idx -= 1; showQuestion(); } : null,
      });
    }

    function showDone() {
      const { results } = session;
      const rows = list.map((q, i) => {
        const r = results[q.id];
        const cleared = review && r && r.correct && !(Grammar.record(q) || {}).review;
        const part = q.type === 'bunshou' && r ? ` <span class="dim small">${r.right} / ${q.items.length}</span>` : '';
        return Util.resultRow(r, `${i + 1}. <span lang="ja">${Util.esc(preview(q))}</span>${part}${cleared ? ' <span class="badge ok">오답노트에서 빠짐</span>' : ''}`);
      }).join('');
      App.setScreen(`
        <div class="topbar">
          <button class="link" data-act="back">← 뒤로</button>
          <span class="crumb">${level} · ${Util.esc(title)}</span>
        </div>
        <section class="card done" data-el="grammar-done">
          ${Util.resultHead(list, results)}
          <ul class="result-list single">${rows}</ul>
          <div class="next-row">
            <button class="secondary" data-act="back">뒤로</button>
            ${again ? '<button class="primary" data-act="again">다시 풀기</button>' : ''}
          </div>
        </section>
      `, { onKey: (e) => { if (e.key === 'Escape') back(); else if (e.key === 'Enter' && again) { e.preventDefault(); again(); } } });
      $$('[data-act="back"]').forEach((b) => b.addEventListener('click', back));
      if (again) $('[data-act="again"]').addEventListener('click', again);
    }
  }

  return { showSetup, run, preview };
})();

// ============================================================
// 문법 · 오답노트: 형식별 틀린 문항, 다시 풀기, 수동 빼기 (연속 2번 맞히면 자동으로 빠짐)
// ============================================================
const GrammarReview = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function show(level) {
    const list = Grammar.reviewList(level);
    const groups = Grammar.levelTypes(level).map((t) => {
      const items = list.filter((q) => q.type === t);
      if (!items.length) return '';
      const tc = Grammar.cfg.types[t];
      const rows = items.map((q) => `<li><span lang="ja">${Util.esc(GrammarPractice.preview(q))}</span>
          <span class="dim small">${q.id}</span>
          <button class="link danger small" data-remove="${q.id}">빼기</button></li>`).join('');
      return `<section class="card"><h3><span lang="ja">${tc.label_ja}</span> ${tc.label_ko} · ${items.length}문항
        <button class="secondary small-btn" data-type="${t}">이 형식만 풀기</button></h3><ul class="review-list">${rows}</ul></section>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문법 · 오답노트</span>
      </div>
      ${list.length ? `
        <p>${list.length}문항 · 연속 ${window.APP_CONFIG.reviewClearStreak}번 맞히면 자동으로 빠집니다.</p>
        <button class="primary" data-act="all">전체 다시 풀기</button>
        ${groups}` : '<section class="card"><p>틀린 문항이 없습니다.</p></section>'}
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    const order = (qs) => Grammar.levelTypes(level).flatMap((t) => qs.filter((q) => q.type === t));
    const start = (qs) => GrammarPractice.run({ level, list: order(qs), title: '오답노트', back: () => show(level), review: true });
    if (list.length) $('[data-act="all"]').addEventListener('click', () => start(list));
    $$('[data-type]').forEach((b) => b.addEventListener('click', () => start(list.filter((q) => q.type === b.dataset.type))));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      const q = Grammar.question(b.dataset.remove);
      for (const id of Grammar.recordIds(q)) Storage.removeFromReview(Grammar.SECTION, id);
      show(level);
    }));
  }

  return { show };
})();
