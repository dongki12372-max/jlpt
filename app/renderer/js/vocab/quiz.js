// ============================================================
// 문자·어휘 · 단어장 객관식 퀴즈: 형식·범위·문항 수 고르기 → 4지선다 → 결과
//   형식: meaning 뜻 고르기(단어 → 뜻) / word 단어 고르기(뜻 → 단어) / reading 읽기 고르기(한자 단어 → 읽기) / mix 섞어서
//   오답 선택지는 단어장 범위(레벨)의 같은 품사 단어에서 고르고, 뜻·읽기·표기가 정답과 겹치는 단어는 뺀다.
//   결과는 단어장 카드에 반영한다 (Vocab.quizAnswer: 뜻·단어 고르기 → 뜻 카드, 읽기 고르기 → 읽기 카드).
//     맞힘: 오늘 복습할 카드는 복습 완료, 새 단어는 단어장에 추가(내일 복습) / 틀림: 「다시」 또는 새 카드 맨 앞
//   단축키: 1~4 답, Enter 다음, R 단어 음성, ← → 이전·건너뛰기, Esc 단어장
// ============================================================
const Quiz = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const cfg = () => Vocab.cfg;
  const SECTION = 'vocab';

  const FORMATS = [
    { id: 'meaning', label: '뜻 고르기', desc: '단어를 보고 뜻' },
    { id: 'word', label: '단어 고르기', desc: '뜻을 보고 단어' },
    { id: 'reading', label: '읽기 고르기', desc: '한자 단어의 읽기' },
    { id: 'mix', label: '섞어서', desc: '세 형식을 섞어서' },
  ];
  const RANGES = [
    { id: 'all', label: '범위 전체' },
    { id: 'studied', label: '학습한 단어' },
    { id: 'weak', label: '약한 단어' },
  ];

  const pref = (key, fallback) => Storage.getSetting(SECTION, key, fallback);
  const setPref = (key, v) => Storage.setSetting(SECTION, key, v);

  // 뜻 「이르다, 빠르다」 → ['이르다', '빠르다'] (괄호 설명은 빼고 비교)
  const meaningParts = (m) => m.split(/[,，、/;·]/).map((x) => x.replace(/\(.*?\)|（.*?）/g, '').trim()).filter(Boolean);

  function rangeWords(level, range) {
    const ws = Vocab.scopeWords(level);
    if (range === 'studied') return ws.filter((w) => Vocab.wordState(w) !== 'new');
    if (range === 'weak') return ws.filter((w) => Vocab.wordState(w) === 'weak');
    return ws;
  }

  // ---------- 고르기 ----------
  function showSetup(level) {
    const format = pref('quizFormat', 'meaning');
    const range = pref('quizRange', 'all');
    const count = pref('quizCount', cfg().quiz.defaultCount);
    const sizes = Object.fromEntries(RANGES.map((r) => [r.id, rangeWords(level, r.id).length]));

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 단어장</button>
        <span class="crumb">${level} · 객관식 퀴즈</span>
      </div>
      <section class="card quiz-setup">
        <h3>형식</h3>
        <div class="choice-grid">
          ${FORMATS.map((f) => `<button class="choice ${f.id === format ? 'active' : ''}" data-format="${f.id}"><b>${f.label}</b><span class="dim small">${f.desc}</span></button>`).join('')}
        </div>
        <h3>범위 <span class="dim small">(${Vocab.scopeLevels(level).join('·')})</span></h3>
        <div class="segmented" role="radiogroup">
          ${RANGES.map((r) => `<button data-range="${r.id}" class="${r.id === range ? 'active' : ''}" ${sizes[r.id] ? '' : 'disabled'}>${r.label} ${sizes[r.id]}</button>`).join('')}
        </div>
        <h3>문항 수</h3>
        <div class="segmented" role="radiogroup">
          ${cfg().quiz.counts.map((n) => `<button data-count="${n}" class="${n === count ? 'active' : ''}">${n}</button>`).join('')}
        </div>
        <p class="dim small">결과는 단어장에 반영됩니다: 맞히면 오늘 복습할 카드는 복습 완료, 새 단어는 단어장에 추가(내일 복습). 틀리면 다시 학습합니다.</p>
        <div class="next-row"><button class="primary" data-act="start">시작 <span class="kbd">Enter</span></button></div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') Deck.showHome(level); else if (e.key === 'Enter') { e.preventDefault(); begin(); } } });

    const pick = (attr, key, cast = String) => $$(`[data-${attr}]:not(:disabled)`).forEach((b) => b.addEventListener('click', () => {
      setPref(key, cast(b.dataset[attr]));
      $$(`[data-${attr}]`).forEach((x) => x.classList.toggle('active', x === b));
    }));
    pick('format', 'quizFormat');
    pick('range', 'quizRange');
    pick('count', 'quizCount', Number);
    $('[data-act="back"]').addEventListener('click', () => Deck.showHome(level));
    $('[data-act="start"]').addEventListener('click', begin);

    function begin() {
      let r = pref('quizRange', 'all');
      if (!sizes[r]) r = 'all';
      const list = Util.shuffle(rangeWords(level, r)).slice(0, pref('quizCount', cfg().quiz.defaultCount));
      run(level, list, pref('quizFormat', 'meaning'));
    }
  }

  // ---------- 문항 만들기 ----------
  // 단어 하나 → { w, format, options: [단어 4개], answer: 1~4 }
  function makeQuestion(w, format, pool) {
    if (format === 'mix') format = Util.shuffle(Vocab.hasKanji(w.word) ? ['meaning', 'word', 'reading'] : ['meaning', 'word'])[0];
    if (format === 'reading' && !Vocab.hasKanji(w.word)) format = 'meaning';
    const parts = meaningParts(w.meaning_ko);
    const clash = (x) => x.key === w.key || x.word === w.word
      || (format === 'reading' ? x.reading === w.reading : meaningParts(x.meaning_ko).some((p) => parts.includes(p)));
    const fits = (x) => !clash(x) && (format !== 'reading' || Vocab.hasKanji(x.word));
    const near = (x) => x.pos === w.pos && (format !== 'reading' || Math.abs(x.reading.length - w.reading.length) <= 1);
    const cands = Util.shuffle(pool.filter(fits));
    const picked = [];
    const seen = new Set([text(w, format)]);
    for (const x of [...cands.filter(near), ...cands]) {
      if (picked.length >= cfg().optionCount - 1) break;
      const t = text(x, format);
      if (seen.has(t)) continue;
      seen.add(t);
      picked.push(x);
    }
    const options = Util.shuffle([w, ...picked]);
    return { w, format, options, answer: options.indexOf(w) + 1 };
  }
  // 선택지에 보이는 글 (같은 글이 두 번 나오지 않게 비교용)
  const text = (x, format) => (format === 'meaning' ? x.meaning_ko : format === 'reading' ? x.reading : x.word);

  // 단어장에 어떻게 반영됐는지
  const CARD_NAME = { meaning: '뜻 카드', word: '뜻 카드', reading: '읽기 카드' };
  const nextDue = (card) => (card && card.state === 'review' ? `다음 복습 ${new Date(card.due).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}` : '');
  function effectText(r) {
    const name = CARD_NAME[r.format] || '카드';
    switch (r.effect) {
      case 'reviewed': return `단어장: ${name} 오늘 복습 완료 · ${nextDue(r.card) || '학습 단계 진행'}`;
      case 'introduced': return `단어장: 새 단어로 ${name}를 시작했습니다 · ${nextDue(r.card)}`;
      case 'kept': return `단어장: ${name}는 아직 복습할 때가 아니라 그대로 둡니다 · ${nextDue(r.card) || '학습 단계'}`;
      case 'again': return `단어장: ${name}를 「다시」로 처리했습니다 (곧 다시 나옵니다)`;
      case 'pulled': return '단어장: 오늘 새 카드 맨 앞에 넣었습니다';
      default: return '';
    }
  }
  function deckSummary(results) {
    const c = {};
    for (const r of Object.values(results)) c[r.effect] = (c[r.effect] || 0) + 1;
    const parts = [
      c.reviewed && `복습 완료 ${c.reviewed}`,
      c.introduced && `새로 추가 ${c.introduced}`,
      (c.again || 0) + (c.pulled || 0) && `다시 학습 ${(c.again || 0) + (c.pulled || 0)}`,
      c.kept && `그대로 ${c.kept}`,
    ].filter(Boolean);
    return parts.length ? `단어장 반영: ${parts.join(' · ')}` : '';
  }

  // ---------- 풀기 ----------
  function run(level, words, format) {
    // 오답 선택지는 단어장 범위 전체에서 (범위가 좁으면 모든 레벨)
    let pool = Vocab.scopeWords(level);
    if (pool.length < 40) pool = Vocab.LEVELS.flatMap(Vocab.words);
    const session = { level, format, list: words.map((w) => makeQuestion(w, format, pool)), idx: 0, results: {} };
    show();

    function show() {
      const item = session.list[session.idx];
      const { w } = item;
      const last = session.idx === session.list.length - 1;
      let prev = session.results[w.key];
      let answered = prev ? prev.n : null;
      const next = () => { if (last) showDone(); else { session.idx += 1; show(); } };
      const nav = {
        pos: `${session.idx + 1} / ${session.list.length}`,
        onSkip: next,
        onPrev: session.idx > 0 ? () => { session.idx -= 1; show(); } : null,
      };
      const prompt = item.format === 'word'
        ? `<div class="quiz-prompt">${Util.esc(w.meaning_ko)}</div><p class="dim small">${Deck.posLabel(w.pos)} · 알맞은 단어는?</p>`
        : item.format === 'reading'
          ? `<div class="card-word" lang="ja">${Util.esc(w.word)}</div><p class="dim small">읽기는?</p>`
          : `<div class="card-word" lang="ja">${Deck.rubyWord(w)} <button class="btn-mini" data-act="word-audio" title="단어 음성 (R)">▶</button></div><p class="dim small">뜻은?</p>`;

      App.setScreen(`
        <div class="topbar">
          <button class="link" data-act="back">← 단어장</button>
          <span class="crumb">${level} · 객관식 퀴즈 · ${FORMATS.find((f) => f.id === item.format).label}</span>
          ${Util.stepNav(nav, answered)}
        </div>
        <section class="card flash quiz-q" data-key="${Util.esc(w.key)}">${prompt}</section>
        <section class="options" data-el="options"></section>
        <section data-el="result"></section>
      `, { onKey });

      $('[data-act="back"]').addEventListener('click', () => Deck.showHome(level));
      Util.bindStepNav(document, nav);
      const audio = $('[data-act="word-audio"]');
      if (audio) audio.addEventListener('click', () => Clip.play(Vocab.wordAudio(w)));
      document.body.classList.toggle('no-furigana', !Vocab.prefs.furigana);
      if (item.format === 'meaning' && answered === null) Clip.play(Vocab.wordAudio(w));
      render();

      function optionHtml(x) {
        if (item.format === 'meaning') return Util.esc(x.meaning_ko);
        if (item.format === 'reading') return `<span lang="ja">${Util.esc(x.reading)}</span>`;
        return `<span lang="ja">${Deck.rubyWord(x)}</span>`;
      }

      function render() {
        $('[data-el="options"]').innerHTML = item.options.map((x, i) => {
          const n = i + 1;
          const cls = answered === null ? '' : n === item.answer ? 'correct' : n === answered ? 'wrong' : 'dim';
          const tag = answered === null ? 'button' : 'div';
          // 답한 뒤에는 오답 선택지가 무슨 단어인지도 보여 준다
          const extra = answered === null || x === w ? '' : `<span class="opt-ko">${item.format === 'meaning' ? `<span lang="ja">${Util.esc(x.word)}</span> ${Util.esc(x.reading)}` : Util.esc(x.meaning_ko)}</span>`;
          return `<${tag} class="opt ${cls}" data-n="${n}"><span class="num">${n}</span><span class="opt-text">${optionHtml(x)}${extra}</span></${tag}>`;
        }).join('');
        $$('button.opt').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.n))));
        Util.dontKnow($('[data-el="options"]'), answered, () => answer(0));
        if (answered === null) return;
        const ok = answered === item.answer;
        $('[data-el="result"]').innerHTML = `
          <div class="verdict ${ok ? 'ok' : 'ng'}">${Util.verdictText(answered, item.answer)}</div>
          ${prev && prev.effect ? `<p class="deck-effect dim small" data-el="deck-effect">${effectText(prev)}</p>` : ''}
          <div class="next-row"><button class="primary" data-act="next">${last ? '결과 보기' : '다음 문제'} → <span class="kbd">Enter</span></button></div>
          <section class="card word-detail">
            <div class="card-word" lang="ja">${Deck.rubyWord(w)}</div>
            <p class="card-reading" lang="ja">${Util.esc(w.reading)} <button class="btn-mini" data-act="word-audio-2" title="단어 음성 (R)">▶</button></p>
            <p class="card-meaning">${Util.esc(w.meaning_ko)} <span class="dim small">${Deck.posLabel(w.pos)}</span></p>
            ${Deck.exampleHtml(w)}
          </section>`;
        $('[data-act="next"]').addEventListener('click', next);
        $('[data-act="word-audio-2"]').addEventListener('click', () => Clip.play(Vocab.wordAudio(w)));
        Deck.bindExample(w);
      }

      function answer(n) {
        if (answered !== null || n < 0 || n > item.options.length) return;
        answered = n;
        const correct = n === item.answer;
        const fx = Vocab.quizAnswer(w, item.format, correct, Util.now());
        session.results[w.key] = { n, correct, format: item.format, effect: fx.effect, card: fx.card };
        prev = session.results[w.key];
        const skip = $('[data-act="step-skip"]');
        if (skip) skip.textContent = '다음 ›';
        render();
        Clip.play(Vocab.wordAudio(w));
      }

      function onKey(e) {
        if (/^[0-9]$/.test(e.key)) answer(Number(e.key));
        else if (e.key === 'Enter' && answered !== null) { e.preventDefault(); next(); }
        else if (e.key === 'r' || e.key === 'R') { if (item.format === 'meaning' || answered !== null) Clip.play(Vocab.wordAudio(w)); }
        else if (Util.stepKey(e, nav)) e.preventDefault();
        else if (e.key === 'Escape') Deck.showHome(level);
      }
    }

    function showDone() {
      const { list, results } = session;
      const asQ = list.map((it) => ({ id: it.w.key }));   // Util.resultHead는 id로 찾는다
      const wrong = list.filter((it) => results[it.w.key] && !results[it.w.key].correct).map((it) => it.w);
      const rows = list.map((it, i) => Util.resultRow(results[it.w.key],
        `${i + 1}. <span lang="ja">${Util.esc(it.w.word)}</span> <span class="dim">${Util.esc(it.w.word !== it.w.reading ? it.w.reading : '')} · ${Util.esc(it.w.meaning_ko)}</span>`)).join('');
      App.setScreen(`
        <div class="topbar">
          <button class="link" data-act="back">← 단어장</button>
          <span class="crumb">${level} · 객관식 퀴즈 결과</span>
        </div>
        <section class="card done" data-el="quiz-done">
          ${Util.resultHead(asQ, results)}
          <p class="dim" data-el="deck-summary">${deckSummary(results)}</p>
          <ul class="result-list quiz-results">${rows}</ul>
          <div class="next-row">
            <button class="secondary" data-act="back">단어장으로</button>
            ${wrong.length ? '<button class="secondary" data-act="wrong">틀린 것만 다시</button>' : ''}
            <button class="primary" data-act="again">새로 풀기</button>
          </div>
        </section>
      `, { onKey: (e) => { if (e.key === 'Escape') Deck.showHome(level); else if (e.key === 'Enter') { e.preventDefault(); showSetup(level); } } });
      $$('[data-act="back"]').forEach((b) => b.addEventListener('click', () => Deck.showHome(level)));
      $('[data-act="again"]').addEventListener('click', () => showSetup(level));
      if (wrong.length) $('[data-act="wrong"]').addEventListener('click', () => run(level, Util.shuffle(wrong), format));
    }
  }

  return { showSetup, run, makeQuestion, meaningParts };
})();
