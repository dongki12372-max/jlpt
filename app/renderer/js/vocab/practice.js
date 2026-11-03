// ============================================================
// 문자·어휘 · 유형별 연습 (유형 선택 → 문항 풀이 → 결과)과 오답노트
//   틀리면 그 문항의 targets 단어 카드를 단어장 「오늘 다시 볼 카드」로 당긴다 (Vocab.pullWords).
//   맞혀도 카드 기록은 바꾸지 않는다.
// ============================================================
const VocabPractice = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const prefs = () => Vocab.prefs;
  let session = null;

  // 문항 하나를 푼 결과 기록 (연습·오답노트·실전 공용)
  function record(q, correct) {
    Storage.recordAnswer(Vocab.SECTION, q.id, correct);
    if (!correct) Vocab.pullWords(q.targets, Util.now());
  }

  function showSetup(level) {
    const qs = Vocab.questions(level);
    const cards = Vocab.levelTypes(level).map((t) => {
      const ofType = qs.filter((q) => q.type === t);
      const solved = ofType.filter((q) => Vocab.record(q)).length;
      const tc = Vocab.cfg.types[t];
      return `
        <button class="type-card" data-type="${t}" ${ofType.length ? '' : 'disabled'}>
          <span class="type-ja" lang="ja">${tc.label_ja}</span>
          <span class="type-ko">${tc.label_ko}</span>
          <span class="dim">${ofType.length}문항 · 푼 문항 ${solved}</span>
        </button>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문자·어휘 · 유형별 연습</span>
      </div>
      <h2>유형 선택</h2>
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
      let list = Vocab.questions(level).filter((q) => q.type === b.dataset.type);
      if (prefs().order === 'random') list = Util.shuffle(list);
      if (prefs().unsolvedFirst) list = [...list.filter((q) => !Vocab.record(q)), ...list.filter((q) => Vocab.record(q))];
      run({ level, list, title: Vocab.cfg.types[b.dataset.type].label_ko, back: () => showSetup(level), again: () => b.click() });
    }));
  }

  // 문항 목록을 차례로 푼다 (연습·오답노트 공용)
  function run({ level, list, title, back, again, review = false }) {
    session = { list, idx: 0, results: [] };
    showQuestion();

    function showQuestion() {
      const q = session.list[session.idx];
      const tc = Vocab.cfg.types[q.type];
      const last = session.idx === session.list.length - 1;
      VocabQuestionView.show(q, {
        crumb: `${level} · ${review ? '오답노트' : `<span lang="ja">${tc.label_ja}</span> ${tc.label_ko}`}`,
        pos: `${session.idx + 1} / ${session.list.length}`,
        backLabel: review ? '← 오답노트' : '← 유형 선택',
        onBack: back,
        onAnswer: (n, correct) => {
          session.results.push({ id: q.id, correct });
          record(q, correct);
        },
        nextLabel: last ? '결과 보기' : '다음 문제',
        onNext: () => {
          if (session.idx < session.list.length - 1) { session.idx += 1; showQuestion(); } else showDone();
        },
      });
    }

    function showDone() {
      const { results } = session;
      const correct = results.filter((r) => r.correct).length;
      const rows = list.map((q, i) => {
        const r = results.find((x) => x.id === q.id);
        const cleared = review && r && r.correct && !(Vocab.record(q) || {}).review;
        return `<li class="${r && r.correct ? 'ok' : 'ng'}"><span class="mark">${r && r.correct ? '○' : '×'}</span> ${i + 1}. ${q.id}${cleared ? ' <span class="badge ok">오답노트에서 빠짐</span>' : ''}</li>`;
      }).join('');
      const pulled = results.filter((r) => !r.correct).length;
      App.setScreen(`
        <div class="topbar">
          <button class="link" data-act="back">← 뒤로</button>
          <span class="crumb">${level} · ${Util.esc(title)}</span>
        </div>
        <section class="card done">
          <h2>${correct} / ${list.length} 정답</h2>
          ${pulled ? `<p class="dim">틀린 문항의 단어를 단어장 오늘 복습에 넣었습니다.</p>` : ''}
          <ul class="result-list">${rows}</ul>
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

  return { showSetup, run, record };
})();

// ============================================================
// 문자·어휘 · 오답노트: 레벨·유형별 틀린 문항, 다시 풀기, 수동 빼기 (연속 2번 맞히면 자동으로 빠짐)
// ============================================================
const VocabReview = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function show(level) {
    const list = Vocab.reviewList(level);
    const groups = Vocab.levelTypes(level).map((t) => {
      const items = list.filter((q) => q.type === t);
      if (!items.length) return '';
      const tc = Vocab.cfg.types[t];
      const rows = items.map((q) => {
        const r = Vocab.record(q);
        return `<li><span lang="ja">${Util.esc(q.type === 'youhou' ? q.word : q.stem.replace(/\[\[|\]\]/g, ''))}</span>
          <span class="dim small">${q.id} · 연속 정답 ${r.streak}</span>
          <button class="link danger small" data-remove="${q.id}">빼기</button></li>`;
      }).join('');
      return `<section class="card"><h3><span lang="ja">${tc.label_ja}</span> ${tc.label_ko} · ${items.length}문항
        <button class="secondary small-btn" data-type="${t}">이 유형만 풀기</button></h3><ul class="review-list">${rows}</ul></section>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문자·어휘 · 오답노트</span>
      </div>
      ${list.length ? `
        <p>${list.length}문항 · 연속 ${window.APP_CONFIG.reviewClearStreak}번 맞히면 자동으로 빠집니다.</p>
        <button class="primary" data-act="all">전체 다시 풀기</button>
        ${groups}` : '<section class="card"><p>틀린 문항이 없습니다.</p></section>'}
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    const order = (qs) => Vocab.levelTypes(level).flatMap((t) => qs.filter((q) => q.type === t));
    const start = (qs) => VocabPractice.run({ level, list: order(qs), title: '오답노트', back: () => show(level), review: true });
    if (list.length) $('[data-act="all"]').addEventListener('click', () => start(list));
    $$('[data-type]').forEach((b) => b.addEventListener('click', () => start(list.filter((q) => q.type === b.dataset.type))));
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      Storage.removeFromReview(Vocab.SECTION, b.dataset.remove);
      show(level);
    }));
  }

  return { show };
})();
