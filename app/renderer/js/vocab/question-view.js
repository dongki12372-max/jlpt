// ============================================================
// 문자·어휘 · 문항 화면 (유형별 연습·오답노트 풀이, 실전 모의 결과의 해설 보기)
//   지시문, 문제 문장(밑줄·빈칸), 선택지 4개 → 즉시 채점 → 해설 패널
//   해설: 완성 문장(후리가나 토글) ▶ 문장 음성, 한국어 해설, 오답 선택지별 설명, 이 문항의 단어 카드 미리보기
//   단축키: 1~4 답 선택, Enter 다음, F 후리가나 토글, Esc 뒤로
//
//   VocabQuestionView.show(q, { crumb, pos, backLabel, onBack, answered, onAnswer(n, correct), nextLabel, onNext, onPrev, onSkip })
//     answered: undefined 풀기 전 / 1~4 고른 답으로 해설 / 0 무응답으로 해설
// ============================================================
const VocabQuestionView = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const prefs = () => Vocab.prefs;

  function applyFurigana(forceOff = false) {
    document.body.classList.toggle('no-furigana', forceOff || !prefs().furigana);
  }

  // 후리가나 표기 → HTML: 밑줄 [[ ]] → <u>, 빈칸 （　） → 넓은 괄호
  function markup(text) {
    return Util.furigana(text)
      .replace(/\[\[([^[\]]+)\]\]/g, '<u class="under">$1</u>')
      .replace(/（　）/g, '<span class="blank">（　　　）</span>');
  }

  const instruction = (type) => Vocab.cfg.types[type].instruction;

  // 문제 본문 (실전 모의 화면도 같이 쓴다). 실전에서는 후리가나 없는 stem을 쓴다.
  function stemHtml(q, { plain = false } = {}) {
    if (q.type === 'youhou') return `<div class="youhou-word" lang="ja">${Util.esc(q.word)}</div>`;
    return `<p class="stem" lang="ja">${markup(plain ? q.stem : q.stemFurigana)}</p>`;
  }

  function optionsHtml(q, answered, { plain = false, chosen = null } = {}) {
    return q.options.map((o, i) => {
      const n = i + 1;
      const cls = answered === null ? (chosen === n ? 'chosen' : '') : n === q.answer ? 'correct' : n === answered ? 'wrong' : 'dim';
      const text = !plain && o.furigana ? markup(o.furigana) : Util.esc(o.text);
      const tag = answered === null ? 'button' : 'div';
      return `<${tag} class="opt ${cls}" data-n="${n}"><span class="num">${n}</span><span class="opt-text" lang="ja">${text}</span></${tag}>`;
    }).join('');
  }

  // 해설 패널 (연습·결과 공용)
  function explainHtml(q, answered, blank) {
    const verdict = [answered === q.answer ? 'ok' : 'ng', Util.verdictText(answered, q.answer, blank)];
    const notes = q.options.map((o, i) => {
      const n = i + 1;
      const note = q.optionNotes_ko[i];
      return `<li class="${n === q.answer ? 'ok' : n === answered ? 'ng' : ''}"><span class="num">${n}</span>
        <span lang="ja">${o.furigana ? markup(o.furigana) : Util.esc(o.text)}</span>
        <span class="note">${n === q.answer ? '정답' : Util.esc(note)}</span></li>`;
    }).join('');
    const cards = q.targets.map(Vocab.word).filter(Boolean).map((w) => `
      <div class="mini-card">
        <span class="w" lang="ja">${Deck.rubyWord(w)}</span>
        <span class="m">${Util.esc(w.meaning_ko)}</span>
        <button class="btn-mini" data-word-audio="${Util.esc(w.key)}" title="단어 음성">▶</button>
        <button class="link small" data-word-detail="${Util.esc(w.key)}">단어장에서 보기</button>
      </div>`).join('');
    return `
      <div class="verdict ${verdict[0]}">${verdict[1]}</div>
      <div class="next-row" data-el="next-row"></div>
      <section class="explain card">
        <div class="explain-head">
          <h3>완성 문장</h3>
          <label class="switch"><input type="checkbox" data-el="furi" ${prefs().furigana ? 'checked' : ''}> 후리가나 <span class="kbd">F</span></label>
        </div>
        <p class="full" lang="ja">${markup(q.fullFurigana)} <button class="btn-mini" data-act="full-audio" title="문장 음성">▶</button></p>
        <h3>해설</h3>
        <p>${Util.esc(q.explanation_ko)}</p>
        <h3>선택지</h3>
        <ol class="opt-notes">${notes}</ol>
        ${cards ? `<h3>이 문항의 단어</h3><div class="mini-cards">${cards}</div>` : ''}
      </section>`;
  }

  // 해설 패널의 버튼들. back: 단어 상세에서 돌아올 화면
  function bindExplain(q, back) {
    const furi = $('[data-el="furi"]');
    if (furi) furi.addEventListener('change', (e) => { prefs().furigana = e.target.checked; applyFurigana(); });
    const full = $('[data-act="full-audio"]');
    if (full) full.addEventListener('click', () => Clip.play(Vocab.audioUrl('questions', q.id)));
    $$('[data-word-audio]').forEach((b) => b.addEventListener('click', () => Clip.play(Vocab.wordAudio(Vocab.word(b.dataset.wordAudio)))));
    $$('[data-word-detail]').forEach((b) => b.addEventListener('click', () => Deck.showDetail(b.dataset.wordDetail, back)));
  }

  function show(q, opts) {
    let answered = opts.answered === undefined ? null : opts.answered;
    const tc = Vocab.cfg.types[q.type];

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">${Util.esc(opts.backLabel)}</button>
        <span class="crumb">${opts.crumb}</span>
        ${Util.stepNav(opts, answered)}
      </div>
      <section class="card vq">
        <p class="instruction" lang="ja"><span class="type-label">${tc.label_ja}</span> ${Util.esc(instruction(q.type))}</p>
        ${stemHtml(q)}
        <section class="options ${q.type === 'youhou' ? 'sentences' : ''}" data-el="options" data-qid="${Util.esc(q.id)}"></section>
      </section>
      <section data-el="result"></section>
    `, { onKey });

    $('[data-act="back"]').addEventListener('click', opts.onBack);
    Util.bindStepNav(document, opts);

    function renderOptions() {
      const box = $('[data-el="options"]');
      box.innerHTML = optionsHtml(q, answered);
      box.querySelectorAll('button.opt').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.n))));
      Util.dontKnow(box, answered, () => answer(0));
    }

    function answer(n) {
      if (answered !== null || n < 0 || n > 4) return;
      answered = n;
      if (opts.onAnswer) opts.onAnswer(n, n === q.answer);
      const skip = $('[data-act="step-skip"]');
      if (skip) skip.textContent = '다음 ›';
      renderOptions();
      renderResult();
    }

    function renderResult() {
      $('[data-el="result"]').innerHTML = explainHtml(q, answered, opts.blankLabel);
      if (opts.onNext) {
        $('[data-el="next-row"]').innerHTML = `<button class="primary" data-act="next">${Util.esc(opts.nextLabel)} → <span class="kbd">Enter</span></button>`;
        $('[data-act="next"]').addEventListener('click', opts.onNext);
      }
      bindExplain(q, () => show(q, { ...opts, answered }));
    }

    function onKey(e) {
      if (/^[0-4]$/.test(e.key)) answer(Number(e.key));
      else if (e.key === 'Enter' && answered !== null && opts.onNext) { e.preventDefault(); opts.onNext(); }
      else if (e.key === 'f' || e.key === 'F') {
        prefs().furigana = !prefs().furigana;
        applyFurigana();
        const cb = $('[data-el="furi"]');
        if (cb) cb.checked = prefs().furigana;
      } else if (Util.stepKey(e, opts)) e.preventDefault();
      else if (e.key === 'Escape') opts.onBack();
    }

    applyFurigana();
    renderOptions();
    if (answered !== null) renderResult();
  }

  return { show, stemHtml, optionsHtml, explainHtml, bindExplain, markup, instruction, applyFurigana };
})();
