// ============================================================
// 문법 · 문형 사전: 목록(레벨·상태·검색), 상세(뜻·접속·설명·예문 ▶·비슷한 문형·관련 문제), 객관식 퀴즈
//   퀴즈 형식: meaning 뜻 고르기(문형 → 뜻) / pattern 문형 고르기(뜻 → 문형) / mix 섞어서
//   오답 선택지는 같은 레벨 범위의 문형에서 고르고, 정답과 뜻이 겹치거나 similar로 묶인 문형은 뺀다 (둘 다 정답처럼 보일 수 있어서).
//   퀴즈 결과는 문형 기록(point:{key})에 남는다 — 틀리면 약한 문형.
// ============================================================
const GrammarPoints = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const cfg = () => Grammar.cfg;
  const STATES = ['new', 'ok', 'weak'];

  // ---------- 목록 ----------
  // filter = { level: 'N5'|'all', state, q }
  function showList(level, filter) {
    const f = { level: filter.level || level, state: filter.state || 'all', q: filter.q || '' };
    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문형 사전</span>
      </div>
      <section class="card">
        <div class="next-row left">
          <button class="primary" data-act="quiz">객관식 퀴즈</button>
          <span class="dim small">${Grammar.points(level).length}개 문형 · 약한 문형 ${Grammar.points(level).filter((p) => Grammar.pointState(p) === 'weak').length}</span>
        </div>
      </section>
      <section class="card">
        <div class="filters">
          <select data-f="level">
            ${Grammar.LEVELS.map((l) => `<option value="${l}" ${f.level === l ? 'selected' : ''}>${l}</option>`).join('')}
            <option value="all" ${f.level === 'all' ? 'selected' : ''}>전체 레벨</option>
          </select>
          <select data-f="state">
            <option value="all">전체 상태</option>
            ${STATES.map((s) => `<option value="${s}" ${f.state === s ? 'selected' : ''}>${Grammar.POINT_STATE_LABEL[s]}</option>`).join('')}
          </select>
          <input type="search" data-f="q" placeholder="검색 (문형·뜻)" value="${Util.esc(f.q)}">
        </div>
        <p class="dim small" data-el="count"></p>
        <ul class="word-list point-list" data-el="list"></ul>
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    $('[data-act="quiz"]').addEventListener('click', () => GrammarQuiz.showSetup(level));
    $$('[data-f]').forEach((el) => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
      f[el.dataset.f] = el.value;
      renderList();
    }));
    renderList();

    function renderList() {
      const q = f.q.trim().toLowerCase();
      const ps = (f.level === 'all' ? Grammar.allPoints() : Grammar.points(f.level))
        .filter((p) => f.state === 'all' || Grammar.pointState(p) === f.state)
        .filter((p) => !q || p.pattern.toLowerCase().includes(q) || p.meaning_ko.includes(q) || p.connection.includes(q));
      $('[data-el="count"]').textContent = `${ps.length}개`;
      $('[data-el="list"]').innerHTML = ps.map((p) => {
        const st = Grammar.pointState(p);
        return `<li><button class="word-row point-row" data-key="${Util.esc(p.key)}">
          <span class="w" lang="ja">${Util.esc(p.pattern)}</span><span class="r">${Util.esc(p.connection)}</span>
          <span class="m">${Util.esc(p.meaning_ko)}</span><span class="lv dim small">${p.level}</span>
          <span class="st st-${st === 'ok' ? 'review' : st}">${Grammar.POINT_STATE_LABEL[st]}</span></button></li>`;
      }).join('');
      $$('[data-key]').forEach((b) => b.addEventListener('click', () => showDetail(b.dataset.key, () => showList(level, f))));
    }
  }

  // ---------- 상세 ----------
  function examplesHtml(p) {
    return p.examples.map((ex, i) => `
      <div class="example">
        <p lang="ja">${Util.furigana(ex.furigana)} <button class="btn-mini" data-ex="${i + 1}" title="예문 음성">▶</button></p>
        <p class="ko dim">${Util.esc(ex.meaning_ko)}</p>
      </div>`).join('');
  }
  function bindExamples(p) {
    $$('[data-ex]').forEach((b) => b.addEventListener('click', () => Clip.play(Grammar.exampleAudio(p, Number(b.dataset.ex)))));
  }

  function showDetail(key, back) {
    const p = Grammar.point(key);
    if (!p) return back();
    const st = Grammar.pointState(p);
    const similar = p.similar.map(Grammar.point).filter(Boolean);
    const qs = Grammar.questionsFor(p.key);
    GrammarQuestionView.applyPrefs();
    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 뒤로</button>
        <span class="crumb">${p.level} · 문형 사전</span>
      </div>
      <section class="card word-detail point-detail" data-key="${Util.esc(p.key)}">
        <div class="card-tag">${p.level} · <span class="st st-${st === 'ok' ? 'review' : st}">${Grammar.POINT_STATE_LABEL[st]}</span></div>
        <div class="point-pattern" lang="ja">${Util.esc(p.pattern)}</div>
        <p class="card-meaning">${Util.esc(p.meaning_ko)}</p>
        <p class="connection"><span class="dim small">접속</span> ${Util.esc(p.connection)}</p>
        <p>${Util.esc(p.explanation_ko)}</p>
        <h3>예문</h3>
        ${examplesHtml(p)}
        ${similar.length ? `<h3>비슷한 문형</h3><div class="mini-cards">${similar.map((s) => `
          <button class="mini-card" data-similar="${Util.esc(s.key)}"><span class="w" lang="ja">${Util.esc(s.pattern)}</span><span class="m">${Util.esc(s.meaning_ko)}</span><span class="dim small">${s.level}</span></button>`).join('')}</div>` : ''}
        ${qs.length ? `<h3>이 문형이 나오는 문제</h3><div class="next-row left"><button class="secondary" data-act="related">${qs.length}문항 풀기</button></div>` : ''}
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') back(); } });

    $('[data-act="back"]').addEventListener('click', back);
    bindExamples(p);
    $$('[data-similar]').forEach((b) => b.addEventListener('click', () => showDetail(b.dataset.similar, () => showDetail(key, back))));
    const rel = $('[data-act="related"]');
    if (rel) rel.addEventListener('click', () => GrammarPractice.run({
      level: p.level, list: qs, title: `${p.pattern} 관련 문제`, back: () => showDetail(key, back),
    }));
  }

  return { showList, showDetail, examplesHtml, bindExamples };
})();

// ============================================================
// 문법 · 문형 객관식 퀴즈 (형식·범위·문항 수 고르기 → 4지선다 → 결과)
//   단축키: 1~4 답, Enter 다음, ← → 이전·건너뛰기, Esc 문형 사전
// ============================================================
const GrammarQuiz = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const cfg = () => Grammar.cfg;
  const SECTION = 'grammar';

  const FORMATS = [
    { id: 'meaning', label: '뜻 고르기', desc: '문형을 보고 뜻' },
    { id: 'pattern', label: '문형 고르기', desc: '뜻을 보고 문형' },
    { id: 'mix', label: '섞어서', desc: '두 형식을 섞어서' },
  ];
  const RANGES = [
    { id: 'level', label: '이 레벨' },
    { id: 'cumulative', label: '아래 레벨까지' },
    { id: 'weak', label: '약한 문형' },
  ];
  const pref = (key, fallback) => Storage.getSetting(SECTION, key, fallback);
  const setPref = (key, v) => Storage.setSetting(SECTION, key, v);
  const meaningParts = (m) => m.split(/[,，、/;·]/).map((x) => x.replace(/\(.*?\)|（.*?）/g, '').replace(/^~/, '').trim()).filter(Boolean);

  const levelsUpTo = (level) => Grammar.LEVELS.slice(0, Grammar.LEVELS.indexOf(level) + 1);
  function rangePoints(level, range) {
    if (range === 'level') return Grammar.points(level);
    const ps = levelsUpTo(level).flatMap(Grammar.points);
    return range === 'weak' ? ps.filter((p) => Grammar.pointState(p) === 'weak') : ps;
  }

  function showSetup(level) {
    const format = pref('quizFormat', 'meaning');
    const range = pref('quizRange', 'level');
    const count = pref('quizCount', cfg().quiz.defaultCount);
    const sizes = Object.fromEntries(RANGES.map((r) => [r.id, rangePoints(level, r.id).length]));

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 문형 사전</button>
        <span class="crumb">${level} · 문형 퀴즈</span>
      </div>
      <section class="card quiz-setup">
        <h3>형식</h3>
        <div class="choice-grid three">
          ${FORMATS.map((f) => `<button class="choice ${f.id === format ? 'active' : ''}" data-format="${f.id}"><b>${f.label}</b><span class="dim small">${f.desc}</span></button>`).join('')}
        </div>
        <h3>범위</h3>
        <div class="segmented" role="radiogroup">
          ${RANGES.map((r) => `<button data-range="${r.id}" class="${r.id === range ? 'active' : ''}" ${sizes[r.id] ? '' : 'disabled'}>${r.label} ${sizes[r.id]}</button>`).join('')}
        </div>
        <h3>문항 수</h3>
        <div class="segmented" role="radiogroup">
          ${cfg().quiz.counts.map((n) => `<button data-count="${n}" class="${n === count ? 'active' : ''}">${n}</button>`).join('')}
        </div>
        <p class="dim small">틀린 문형은 「약한 문형」이 되고, 연속 ${window.APP_CONFIG.reviewClearStreak}번 맞히면 풀립니다.</p>
        <div class="next-row"><button class="primary" data-act="start">시작 <span class="kbd">Enter</span></button></div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') GrammarPoints.showList(level, {}); else if (e.key === 'Enter') { e.preventDefault(); begin(); } } });

    const pick = (attr, key, cast = String) => $$(`[data-${attr}]:not(:disabled)`).forEach((b) => b.addEventListener('click', () => {
      setPref(key, cast(b.dataset[attr]));
      $$(`[data-${attr}]`).forEach((x) => x.classList.toggle('active', x === b));
    }));
    pick('format', 'quizFormat');
    pick('range', 'quizRange');
    pick('count', 'quizCount', Number);
    $('[data-act="back"]').addEventListener('click', () => GrammarPoints.showList(level, {}));
    $('[data-act="start"]').addEventListener('click', begin);

    function begin() {
      let r = pref('quizRange', 'level');
      if (!sizes[r]) r = 'level';
      const list = Util.shuffle(rangePoints(level, r)).slice(0, pref('quizCount', cfg().quiz.defaultCount));
      run(level, list, pref('quizFormat', 'meaning'));
    }
  }

  function makeQuestion(p, format, pool) {
    if (format === 'mix') format = Util.shuffle(['meaning', 'pattern'])[0];
    const parts = meaningParts(p.meaning_ko);
    const clash = (x) => x.key === p.key || p.similar.includes(x.key) || x.similar.includes(p.key)
      || meaningParts(x.meaning_ko).some((m) => parts.includes(m));
    const text = (x) => (format === 'meaning' ? x.meaning_ko : x.pattern);
    const picked = [];
    const seen = new Set([text(p)]);
    for (const x of Util.shuffle(pool.filter((x) => !clash(x)))) {
      if (picked.length >= cfg().optionCount - 1) break;
      if (seen.has(text(x))) continue;
      seen.add(text(x));
      picked.push(x);
    }
    const options = Util.shuffle([p, ...picked]);
    return { p, format, options, answer: options.indexOf(p) + 1 };
  }

  function run(level, points, format) {
    // 오답 선택지: 아래 레벨까지의 문형 전체
    const pool = levelsUpTo(level).flatMap(Grammar.points);
    const session = { list: points.map((p) => makeQuestion(p, format, pool)), idx: 0, results: {} };
    show();

    function show() {
      const item = session.list[session.idx];
      const { p } = item;
      const last = session.idx === session.list.length - 1;
      const prev = session.results[p.key];
      let answered = prev ? prev.n : null;
      const next = () => { if (last) showDone(); else { session.idx += 1; show(); } };
      const nav = {
        pos: `${session.idx + 1} / ${session.list.length}`,
        onSkip: next,
        onPrev: session.idx > 0 ? () => { session.idx -= 1; show(); } : null,
      };
      const prompt = item.format === 'meaning'
        ? `<div class="point-pattern" lang="ja">${Util.esc(p.pattern)}</div><p class="dim small">${Util.esc(p.connection)} · 뜻은?</p>`
        : `<div class="quiz-prompt">${Util.esc(p.meaning_ko)}</div><p class="dim small">${Util.esc(p.connection)} · 알맞은 문형은?</p>`;

      App.setScreen(`
        <div class="topbar">
          <button class="link" data-act="back">← 문형 사전</button>
          <span class="crumb">${level} · 문형 퀴즈 · ${FORMATS.find((f) => f.id === item.format).label}</span>
          ${Util.stepNav(nav, answered)}
        </div>
        <section class="card flash quiz-q" data-key="${Util.esc(p.key)}">${prompt}</section>
        <section class="options" data-el="options"></section>
        <section data-el="result"></section>
      `, { onKey });

      $('[data-act="back"]').addEventListener('click', () => GrammarPoints.showList(level, {}));
      Util.bindStepNav(document, nav);
      GrammarQuestionView.applyPrefs();
      render();

      function render() {
        $('[data-el="options"]').innerHTML = item.options.map((x, i) => {
          const n = i + 1;
          const cls = answered === null ? '' : n === item.answer ? 'correct' : n === answered ? 'wrong' : 'dim';
          const tag = answered === null ? 'button' : 'div';
          const main = item.format === 'meaning' ? Util.esc(x.meaning_ko) : `<span lang="ja">${Util.esc(x.pattern)}</span>`;
          const extra = answered === null || x === p ? '' : `<span class="opt-ko">${item.format === 'meaning' ? `<span lang="ja">${Util.esc(x.pattern)}</span>` : Util.esc(x.meaning_ko)}</span>`;
          return `<${tag} class="opt ${cls}" data-n="${n}"><span class="num">${n}</span><span class="opt-text">${main}${extra}</span></${tag}>`;
        }).join('');
        $$('button.opt').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.n))));
        Util.dontKnow($('[data-el="options"]'), answered, () => answer(0));
        if (answered === null) return;
        const ok = answered === item.answer;
        $('[data-el="result"]').innerHTML = `
          <div class="verdict ${ok ? 'ok' : 'ng'}">${Util.verdictText(answered, item.answer)}</div>
          <div class="next-row"><button class="primary" data-act="next">${last ? '결과 보기' : '다음 문제'} → <span class="kbd">Enter</span></button></div>
          <section class="card word-detail point-detail">
            <div class="point-pattern" lang="ja">${Util.esc(p.pattern)}</div>
            <p class="card-meaning">${Util.esc(p.meaning_ko)}</p>
            <p class="connection"><span class="dim small">접속</span> ${Util.esc(p.connection)}</p>
            <p>${Util.esc(p.explanation_ko)}</p>
            ${GrammarPoints.examplesHtml(p)}
          </section>`;
        $('[data-act="next"]').addEventListener('click', next);
        GrammarPoints.bindExamples(p);
      }

      function answer(n) {
        if (answered !== null || n < 0 || n > item.options.length) return;
        answered = n;
        const correct = n === item.answer;
        session.results[p.key] = { n, correct };
        Grammar.recordPoint(p.key, correct);
        const skip = $('[data-act="step-skip"]');
        if (skip) skip.textContent = '다음 ›';
        render();
      }

      function onKey(e) {
        if (/^[0-9]$/.test(e.key)) answer(Number(e.key));
        else if (e.key === 'Enter' && answered !== null) { e.preventDefault(); next(); }
        else if (Util.stepKey(e, nav)) e.preventDefault();
        else if (e.key === 'Escape') GrammarPoints.showList(level, {});
      }
    }

    function showDone() {
      const { list, results } = session;
      const asQ = list.map((it) => ({ id: it.p.key }));
      const wrong = list.filter((it) => results[it.p.key] && !results[it.p.key].correct).map((it) => it.p);
      const rows = list.map((it, i) => Util.resultRow(results[it.p.key],
        `${i + 1}. <span lang="ja">${Util.esc(it.p.pattern)}</span> <span class="dim">${Util.esc(it.p.meaning_ko)}</span>`)).join('');
      App.setScreen(`
        <div class="topbar">
          <button class="link" data-act="back">← 문형 사전</button>
          <span class="crumb">${level} · 문형 퀴즈 결과</span>
        </div>
        <section class="card done" data-el="gquiz-done">
          ${Util.resultHead(asQ, results)}
          ${wrong.length ? `<p class="dim">틀린 문형 ${wrong.length}개는 「약한 문형」에 들어갔습니다.</p>` : ''}
          <ul class="result-list quiz-results">${rows}</ul>
          <div class="next-row">
            <button class="secondary" data-act="back">문형 사전</button>
            ${wrong.length ? '<button class="secondary" data-act="wrong">틀린 것만 다시</button>' : ''}
            <button class="primary" data-act="again">새로 풀기</button>
          </div>
        </section>
      `, { onKey: (e) => { if (e.key === 'Escape') GrammarPoints.showList(level, {}); else if (e.key === 'Enter') { e.preventDefault(); showSetup(level); } } });
      $$('[data-act="back"]').forEach((b) => b.addEventListener('click', () => GrammarPoints.showList(level, {})));
      $('[data-act="again"]').addEventListener('click', () => showSetup(level));
      if (wrong.length) $('[data-act="wrong"]').addEventListener('click', () => run(level, Util.shuffle(wrong), format));
    }
  }

  return { showSetup, run, makeQuestion, meaningParts };
})();
