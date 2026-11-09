// ============================================================
// 문자·어휘 · 단어장 (SRS): 단어장 홈, 카드 학습, 단어 목록, 단어 상세 (객관식 퀴즈는 quiz.js)
//   카드: 읽기 카드(표기 → 읽기, 앞면에 후리가나·음성 없음) / 뜻 카드(표기 + 음성 → 뜻, 앞면에서 음성 자동 재생)
//   뒷면: 읽기, 뜻, 품사, 예문(후리가나 토글·해석, ▶ 예문 음성). 뒷면을 열면 단어 음성 자동 재생.
//   단축키: Space 뒤집기, 1~4 평가(다시·어려움·알맞음·쉬움), R 음성 다시 듣기, Esc 뒤로
// ============================================================
const Deck = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const cfg = () => Vocab.cfg;
  const prefs = () => Vocab.prefs;
  const posLabel = (p) => cfg().pos[p] || p;

  function applyFurigana() {
    document.body.classList.toggle('no-furigana', !prefs().furigana);
  }

  const rubyWord = (w) => (Vocab.hasKanji(w.word) ? Util.furigana(`{${w.word}|${w.reading}}`) : Util.esc(w.word));

  // ---------- 단어장 홈 ----------
  function showHome(level) {
    const now = Util.now();
    const c = Vocab.todayCounts(level, now);
    const levels = Vocab.scopeLevels(level);
    const total = Vocab.scopeWords(level).length;
    const anything = c.review + c.learning + c.fresh > 0;

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 단어장</span>
      </div>
      <section class="card deck-home">
        <div class="deck-counts">
          <div><span class="big" data-el="due">${c.review + c.learning}</span><span class="dim">오늘 복습</span></div>
          <div><span class="big" data-el="new">${c.fresh}</span><span class="dim">새 카드</span></div>
        </div>
        <div class="segmented" role="radiogroup">
          <button data-scope="level" class="${prefs().scope === 'level' ? 'active' : ''}">${level}만</button>
          <button data-scope="cumulative" class="${prefs().scope === 'cumulative' ? 'active' : ''}" ${level === Vocab.LEVELS[0] ? 'disabled' : ''}>${Vocab.LEVELS.slice(0, Vocab.LEVELS.indexOf(level) + 1).join('·')} 누적</button>
        </div>
        <p class="dim small">범위: ${levels.join('·')} · ${total}단어 · 하루 새 카드 ${prefs().newPerDay}장 (설정에서 변경)</p>
        <button class="primary" data-act="start" ${anything ? '' : 'disabled'}>${anything ? '학습 시작' : '오늘 할 카드가 없습니다'}</button>
      </section>
      <section class="card">
        <div class="next-row">
          <button class="secondary" data-act="quiz">객관식 퀴즈</button>
          <button class="secondary" data-act="list">단어 목록</button>
          <button class="secondary" data-act="weak">약한 단어 ${countWeak(level)}</button>
        </div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); else if (e.key === 'Enter' && anything) { e.preventDefault(); study(level); } } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    $('[data-act="start"]').addEventListener('click', () => study(level));
    $('[data-act="quiz"]').addEventListener('click', () => Quiz.showSetup(level));
    $('[data-act="list"]').addEventListener('click', () => showList(level, {}));
    $('[data-act="weak"]').addEventListener('click', () => showList(level, { state: 'weak', level: 'all' }));
    $$('[data-scope]:not(:disabled)').forEach((b) => b.addEventListener('click', () => { prefs().scope = b.dataset.scope; showHome(level); }));
  }

  const countWeak = (level) => Vocab.scopeWords(level).filter((w) => Vocab.wordState(w) === 'weak').length;

  // ---------- 카드 학습 ----------
  function study(level) {
    let done = 0;
    next();

    function next() {
      const now = Util.now();
      const n = Vocab.nextCard(level, now);
      if (!n) return finished();
      showCard(n, now);
    }

    function finished() {
      const now = Util.now();
      const later = Vocab.dueCards(level, Srs.addDays(Srs.dayStart(now), 1) - 1).filter((x) => x.c.state !== 'review');
      App.setScreen(`
        <div class="topbar">
          <button class="link" data-act="back">← 단어장</button>
          <span class="crumb">${level} · 단어장</span>
        </div>
        <section class="card done" data-el="deck-done">
          <h2>오늘 학습 끝</h2>
          <p>이번에 ${done}장을 봤습니다.</p>
          ${later.length ? `<p class="dim">학습 단계 카드 ${later.length}장이 조금 뒤에 다시 나옵니다. 나중에 다시 열어 주세요.</p>` : ''}
          <div class="next-row"><button class="primary" data-act="back">단어장으로</button></div>
        </section>
      `, { onKey: (e) => { if (e.key === 'Escape' || e.key === 'Enter') showHome(level); } });
      $$('[data-act="back"]').forEach((b) => b.addEventListener('click', () => showHome(level)));
    }

    function showCard({ id, isNew }, now) {
      const { key, kind } = Vocab.splitCard(id);
      const w = Vocab.word(key);
      const prev = Vocab.card(id);
      const c = Vocab.todayCounts(level, now);
      let flipped = false;
      applyFurigana();

      const front = kind === 'reading'
        ? `<div class="card-word" lang="ja">${Util.esc(w.word)}</div><p class="dim small">읽기를 떠올려 보세요</p>`
        : `<div class="card-word" lang="ja">${rubyWord(w)}</div><p class="dim small">뜻을 떠올려 보세요</p>`;

      App.setScreen(`
        <div class="topbar">
          <button class="link" data-act="back">← 단어장</button>
          <span class="crumb">${level} · 단어장</span>
          <span class="pos"><span class="cnt-new">${c.fresh}</span> · <span class="cnt-learn">${c.learning}</span> · <span class="cnt-review">${c.review}</span></span>
        </div>
        <section class="card flash" data-card="${Util.esc(id)}" data-kind="${kind}">
          <div class="card-tag">${kind === 'reading' ? '읽기 카드' : '뜻 카드'}${isNew ? ' · <span class="badge">새 카드</span>' : ''}</div>
          <div class="front">${front}</div>
          <div class="back hidden" data-el="back">
            <div class="card-word" lang="ja">${rubyWord(w)}</div>
            <p class="card-reading" lang="ja">${Util.esc(w.reading)} <button class="btn-mini" data-act="word-audio" title="단어 음성 (R)">▶</button></p>
            <p class="card-meaning">${Util.esc(w.meaning_ko)} <span class="dim small">${posLabel(w.pos)}</span></p>
            ${exampleHtml(w)}
          </div>
        </section>
        <div class="flash-actions">
          <button class="primary" data-act="flip">뒤집기 <span class="kbd">Space</span></button>
          <div class="rate-row hidden" data-el="rates">
            ${Srs.RATINGS.map((r) => `<button class="rate-btn rate-${r.id}" data-rate="${r.n}"><span>${r.label}</span><span class="dim small">${Srs.preview(prev, r.n, now)}</span><span class="kbd">${r.n}</span></button>`).join('')}
          </div>
        </div>
      `, { onKey });

      $('[data-act="back"]').addEventListener('click', () => showHome(level));
      $('[data-act="flip"]').addEventListener('click', flip);
      $('[data-act="word-audio"]').addEventListener('click', () => Clip.play(Vocab.wordAudio(w)));
      bindExample(w);
      $$('[data-rate]').forEach((b) => b.addEventListener('click', () => rate(Number(b.dataset.rate))));
      if (kind === 'meaning') Clip.play(Vocab.wordAudio(w));

      function flip() {
        if (flipped) return;
        flipped = true;
        $('[data-el="back"]').classList.remove('hidden');
        $('.front').classList.add('hidden');
        $('[data-act="flip"]').classList.add('hidden');
        $('[data-el="rates"]').classList.remove('hidden');
        Clip.play(Vocab.wordAudio(w));
      }
      function rate(n) {
        if (!flipped) return;
        Vocab.answerCard(id, n, Util.now());
        done += 1;
        next();
      }
      function onKey(e) {
        if (e.key === ' ') { e.preventDefault(); flip(); }
        else if (/^[1-4]$/.test(e.key)) rate(Number(e.key));
        else if (e.key === 'r' || e.key === 'R') { if (kind === 'meaning' || flipped) Clip.play(Vocab.wordAudio(w)); }
        else if (e.key === 'Escape') showHome(level);
      }
    }
  }

  // 예문 블록 (뒷면·상세 공용)
  function exampleHtml(w) {
    const ex = w.example;
    return `
      <div class="example">
        <p lang="ja">${Util.furigana(ex.furigana)} <button class="btn-mini" data-act="example-audio" title="예문 음성">▶</button></p>
        <p class="dim">${Util.esc(ex.meaning_ko)}</p>
      </div>`;
  }
  function bindExample(w) {
    const b = $('[data-act="example-audio"]');
    if (b) b.addEventListener('click', () => Clip.play(Vocab.exampleAudio(w)));
  }

  // ---------- 단어 목록 ----------
  // filter = { level: 'N5'|'all', pos, state, q }
  function showList(level, filter) {
    const f = { level, pos: '', state: '', q: '', ...filter };
    const LIMIT = 300;
    applyFurigana();

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 단어장</button>
        <span class="crumb">${level} · 단어 목록</span>
      </div>
      <section class="card filters">
        <select data-f="level">
          <option value="all" ${f.level === 'all' ? 'selected' : ''}>전체 레벨</option>
          ${Vocab.LEVELS.map((l) => `<option value="${l}" ${f.level === l ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select data-f="pos">
          <option value="">전체 품사</option>
          ${Object.entries(cfg().pos).map(([k, v]) => `<option value="${k}" ${f.pos === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <select data-f="state">
          <option value="">전체 상태</option>
          ${Object.entries(Vocab.STATE_LABEL).map(([k, v]) => `<option value="${k}" ${f.state === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <input type="search" data-f="q" placeholder="검색 (표기·읽기·뜻)" value="${Util.esc(f.q)}">
      </section>
      <p class="dim small" data-el="count"></p>
      <ul class="word-list" data-el="list"></ul>
    `, { onKey: (e) => { if (e.key === 'Escape') showHome(level); } });

    $('[data-act="back"]').addEventListener('click', () => showHome(level));
    $$('[data-f]').forEach((el) => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { f[el.dataset.f] = el.value; render(); }));
    render();

    function render() {
      const levels = f.level === 'all' ? Vocab.LEVELS : [f.level];
      const q = f.q.trim().toLowerCase();
      const list = levels.flatMap(Vocab.words).filter((w) =>
        (!f.pos || w.pos === f.pos) && (!f.state || Vocab.wordState(w) === f.state)
        && (!q || w.word.toLowerCase().includes(q) || w.reading.includes(q) || w.meaning_ko.toLowerCase().includes(q)));
      $('[data-el="count"]').textContent = `${list.length}단어${list.length > LIMIT ? ` (앞 ${LIMIT}개 표시 — 검색으로 좁혀 보세요)` : ''}`;
      $('[data-el="list"]').innerHTML = list.slice(0, LIMIT).map((w) => {
        const st = Vocab.wordState(w);
        return `<li><button class="word-row" data-key="${Util.esc(w.key)}">
          <span class="w" lang="ja">${Util.esc(w.word)}</span><span class="r" lang="ja">${w.word !== w.reading ? Util.esc(w.reading) : ''}</span>
          <span class="m">${Util.esc(w.meaning_ko)}</span><span class="lv dim small">${w.level}</span>
          <span class="st st-${st}">${Vocab.STATE_LABEL[st]}</span></button></li>`;
      }).join('');
      $$('[data-key]').forEach((b) => b.addEventListener('click', () => showDetail(b.dataset.key, () => showList(level, f))));
    }
  }

  // ---------- 단어 상세 ----------
  function showDetail(key, back) {
    const w = Vocab.word(key);
    applyFurigana();
    const cards = Vocab.cardIds(w).map((id) => {
      const c = Vocab.card(id);
      const kind = Vocab.splitCard(id).kind === 'reading' ? '읽기 카드' : '뜻 카드';
      if (!c) return `<li>${kind}: <span class="dim">아직 시작 안 함</span></li>`;
      const due = c.state === 'review' ? `${new Date(c.due).toLocaleDateString('ko-KR')} 복습 예정 (간격 ${c.interval}일)` : '학습 단계';
      return `<li>${kind}: ${due} · 본 횟수 ${c.reps} · 다시 ${c.lapses}${Srs.isWeak(c) ? ' <span class="st st-weak">약한 단어</span>' : ''}</li>`;
    }).join('');
    const sources = w.sources.filter((s) => s !== 'wordlist').map((s) => {
      const [sec, id] = s.split(':');
      const label = sec === 'listening' ? '청해' : '문자·어휘';
      return `<li><button class="link" data-src="${Util.esc(s)}">${label} ${Util.esc(id)}</button></li>`;
    }).join('');
    const quiz = Vocab.quizRecord(w);
    const similar = (w.similar || []).map(Vocab.word).filter(Boolean)
      .map((s) => `<button class="link" data-similar="${Util.esc(s.key)}" lang="ja">${Util.esc(s.word)}</button> <span class="dim">${Util.esc(s.meaning_ko)}</span>`).join(' · ');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 뒤로</button>
        <span class="crumb">${w.level} · 단어</span>
      </div>
      <section class="card word-detail">
        <div class="card-word" lang="ja">${rubyWord(w)}</div>
        <p class="card-reading" lang="ja">${Util.esc(w.reading)} <button class="btn-mini" data-act="word-audio">▶</button></p>
        <p class="card-meaning">${Util.esc(w.meaning_ko)} <span class="dim small">${posLabel(w.pos)} · ${w.level}</span></p>
        ${exampleHtml(w)}
        ${similar ? `<p class="small">비슷한 말: ${similar}</p>` : ''}
      </section>
      <section class="card">
        <h3>카드</h3><ul class="plain">${cards}${quiz ? `<li data-el="quiz-record">객관식 퀴즈: ${quiz.n}번 중 ${quiz.right}번 맞힘 (최근 ${quiz.last ? '맞힘' : '틀림'})</li>` : ''}</ul>
        ${sources ? `<h3>나온 문항</h3><ul class="plain">${sources}</ul>` : ''}
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') back(); else if (e.key === 'r' || e.key === 'R') Clip.play(Vocab.wordAudio(w)); } });

    $('[data-act="back"]').addEventListener('click', back);
    $('[data-act="word-audio"]').addEventListener('click', () => Clip.play(Vocab.wordAudio(w)));
    bindExample(w);
    $$('[data-similar]').forEach((b) => b.addEventListener('click', () => showDetail(b.dataset.similar, () => showDetail(key, back))));
    $$('[data-src]').forEach((b) => b.addEventListener('click', () => openSource(b.dataset.src, () => showDetail(key, back))));
  }

  // 출처 문항 열기 (해설 보기 상태)
  function openSource(src, back) {
    const [sec, id] = src.split(':');
    if (sec === 'listening' && typeof Listening !== 'undefined') {
      const lv = id.slice(0, 2).toUpperCase();
      const q = Listening.questions(lv).find((x) => x.id === id);
      if (!q) return;
      const tc = Listening.cfg.types[q.type];
      QuestionView.show(q, { crumb: `청해 · ${lv} · <span lang="ja">${tc.label_ja}</span>`, pos: id, backLabel: '← 단어', onBack: back, answered: 0, autoplay: false, nextLabel: '단어로 돌아가기', onNext: back });
    } else if (sec === 'vocab' && typeof VocabQuestionView !== 'undefined') {
      const lv = id.slice(0, 2).toUpperCase();
      const q = Vocab.questions(lv).find((x) => x.id === id);
      if (q) VocabQuestionView.show(q, { crumb: `문자·어휘 · ${lv}`, pos: id, backLabel: '← 단어', onBack: back, answered: 0, nextLabel: '단어로 돌아가기', onNext: back });
    }
  }

  return { showHome, study, showList, showDetail, exampleHtml, bindExample, rubyWord, posLabel };
})();
