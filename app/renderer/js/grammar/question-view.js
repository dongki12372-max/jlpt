// ============================================================
// 문법 · 문항 화면 (유형별 연습·오답노트 풀이, 실전 모의 결과의 해설 보기) + 실전 모의가 같이 쓰는 조각
//   bunpou  문장의 （　）에 들어갈 말 4지선다 → 즉시 채점
//   narabe  조각 4개를 눌러 자리에 순서대로 놓기(놓인 조각을 누르면 빠짐) → 「확인」 → ★ 자리의 조각으로 채점
//   bunshou 글의 빈칸 ［1］~［n］마다 4지선다, 빈칸마다 바로 채점 → 다 풀면 완성 글·해석
//   해설: 완성 문장(후리가나·해석 토글) ▶ 문장 음성, 해설, 선택지별 오답 설명, 이 문항의 문형(문형 사전으로)
//   단축키: 1~4 답(bunshou는 아직 안 푼 첫 빈칸, narabe는 조각 놓기), Backspace 마지막 조각 빼기,
//           Enter 확인·다음, ← → 이전·건너뛰기, Esc 뒤로
//
//   GrammarQuestionView.show(q, { crumb, pos, backLabel, onBack, answered, onAnswer, nextLabel, onNext, onPrev, onSkip })
//     answered: undefined 풀기 전 / bunpou·narabe 1~4(0 무응답) / bunshou 빈칸별 배열 → 해설부터
//     onAnswer: bunpou·narabe (n, correct) / bunshou (i, n, correct) — 빈칸마다
// ============================================================
const GrammarQuestionView = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const prefs = () => Grammar.prefs;
  const cfg = () => Grammar.cfg;
  const SLOT_RE = /［＿］|［★］/g;

  function applyPrefs() {
    document.body.classList.toggle('no-furigana', !prefs().furigana);
    document.body.classList.toggle('no-ko', !prefs().showKo);
  }

  // 후리가나 표기 → HTML: 빈칸 （　）, narabe 자리 ［＿］·［★］, bunshou 빈칸 ［n］, 줄바꿈
  function markup(text) {
    let slot = 0;
    return Util.furigana(text)
      .replace(/（　）/g, '<span class="blank">（　　　）</span>')
      .replace(SLOT_RE, (m) => `<span class="slot ${m === '［★］' ? 'star' : ''}" data-slot="${slot++}"></span>`)
      .replace(/［(\d+)］/g, '<span class="gap" data-gap="$1"><span class="gap-no">$1</span><span class="gap-fill"></span></span>')
      .replace(/\n/g, '<br>');
  }
  const optText = (o) => (o.furigana ? Util.furigana(o.furigana) : Util.esc(o.text));
  const instruction = (q) => cfg().types[q.type].instruction.replace('［n］', `［${Grammar.itemCount(q)}］`);
  const starIndex = (q) => (q.stem.match(SLOT_RE) || []).indexOf('［★］');

  function headHtml(q) {
    return `<p class="instruction" lang="ja"><span class="type-label">${cfg().types[q.type].label_ja}</span> ${Util.esc(instruction(q))}</p>`;
  }
  function bodyHtml(q) {
    if (q.type === 'bunshou') {
      return `<h3 class="passage-title" lang="ja">${markup(q.title)}</h3>
        <div class="passage" lang="ja" data-el="passage">${markup(q.passageFurigana)}</div>`;
    }
    return `<p class="stem" lang="ja">${markup(q.stemFurigana)}</p>`;
  }

  // 4지선다 (bunpou·bunshou 빈칸). answered=null이면 버튼, chosen = 실전 모의에서 고른 답
  function optionsHtml(options, answer, answered, { chosen = null, item = null } = {}) {
    return options.map((o, i) => {
      const n = i + 1;
      const cls = answered === null || answered === undefined ? (chosen === n ? 'chosen' : '')
        : n === answer ? 'correct' : n === answered ? 'wrong' : 'dim';
      const tag = answered === null || answered === undefined ? 'button' : 'div';
      return `<${tag} class="opt ${cls}" data-n="${n}" ${item !== null ? `data-item="${item}"` : ''}><span class="num">${n}</span><span class="opt-text" lang="ja">${optText(o)}</span></${tag}>`;
    }).join('');
  }

  // ---------- narabe: 조각 놓기 ----------
  //   placed[자리] = 선택지 번호(0 = 빈 자리). locked면 누를 수 없음, grade면 자리마다 바른 조각인지 표시
  function arrange(root, q, placed, { locked = false, grade = false, onChange = () => {} } = {}) {
    const chipsBox = root.querySelector('[data-el="chips"]');
    function render() {
      root.querySelectorAll('.slot').forEach((el) => {
        const k = Number(el.dataset.slot);
        const n = placed[k];
        el.innerHTML = n ? `<span lang="ja">${optText(q.options[n - 1])}</span>` : '';
        el.classList.toggle('filled', !!n);
        el.classList.toggle('ok', grade && n === q.order[k]);
        el.classList.toggle('ng', grade && !!n && n !== q.order[k]);
      });
      chipsBox.innerHTML = q.options.map((o, i) => {
        const used = placed.includes(i + 1);
        return `<button class="chip ${used ? 'used' : ''}" data-chip="${i + 1}" ${used || locked ? 'disabled' : ''}><span class="num">${i + 1}</span><span lang="ja">${optText(o)}</span></button>`;
      }).join('');
    }
    function place(n) {
      if (locked || placed.includes(n)) return;
      const k = placed.indexOf(0);
      if (k < 0) return;
      placed[k] = n;
      render();
      onChange(placed);
    }
    function remove(k) {
      if (locked || !placed[k]) return;
      placed[k] = 0;
      render();
      onChange(placed);
    }
    function removeLast() {
      for (let k = placed.length - 1; k >= 0; k--) if (placed[k]) { remove(k); return; }
    }
    root.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (chip && root.contains(chip)) { place(Number(chip.dataset.chip)); return; }
      const slot = e.target.closest('.slot');
      if (slot && root.contains(slot)) remove(Number(slot.dataset.slot));
    });
    render();
    return { place, removeLast, render, setLocked: (v, g) => { locked = v; grade = g; render(); } };
  }

  // ---------- bunshou: 빈칸 목록 ----------
  //   answers[i] = 고른 번호(0 = 아직). graded면 고른 빈칸은 채점·해설
  function itemsHtml(q, answers, { graded = false } = {}) {
    return q.items.map((it, i) => {
      const a = answers[i] || 0;
      const done = graded && a > 0;
      const notes = done ? `
        <div class="item-explain">
          <p class="${a === it.answer ? 'ok-text' : 'ng-text'}">${a === it.answer ? '정답' : `오답 — 정답은 ${it.answer}번`}</p>
          <p>${Util.esc(it.explanation_ko)}</p>
          <ol class="opt-notes">${it.options.map((o, j) => `<li class="${j + 1 === it.answer ? 'ok' : j + 1 === a ? 'ng' : ''}"><span class="num">${j + 1}</span>
            <span lang="ja">${optText(o)}</span><span class="note">${j + 1 === it.answer ? '정답' : Util.esc(it.optionNotes_ko[j])}</span></li>`).join('')}</ol>
        </div>` : '';
      return `<div class="gitem" data-item-box="${i}">
        <p class="gitem-no"><span class="gap-no">${i + 1}</span></p>
        <div class="options compact">${optionsHtml(it.options, it.answer, done ? a : null, { chosen: graded ? null : a, item: i })}</div>
        ${notes}
      </div>`;
    }).join('');
  }
  // 글의 빈칸에 고른 답을 보여 준다 (채점했으면 맞고 틀림 색)
  function fillGaps(q, answers, graded) {
    $$('[data-el="passage"] .gap').forEach((el) => {
      const i = Number(el.dataset.gap) - 1;
      const a = answers[i] || 0;
      const fill = el.querySelector('.gap-fill');
      fill.innerHTML = a ? optText(q.items[i].options[a - 1]) : '';
      el.classList.toggle('filled', !!a);
      el.classList.toggle('ok', graded && a === q.items[i].answer);
      el.classList.toggle('ng', graded && !!a && a !== q.items[i].answer);
    });
  }

  // ---------- 해설 조각 ----------
  function pointCardsHtml(keys) {
    const cards = [...new Set(keys)].map(Grammar.point).filter(Boolean).map((p) => `
      <div class="mini-card">
        <span class="w" lang="ja">${Util.esc(p.pattern)}</span>
        <span class="m">${Util.esc(p.meaning_ko)}</span>
        <button class="link small" data-point="${Util.esc(p.key)}">문형 사전에서 보기</button>
      </div>`).join('');
    return cards ? `<h3>이 문항의 문형</h3><div class="mini-cards">${cards}</div>` : '';
  }
  function bindPointCards(back) {
    $$('[data-point]').forEach((b) => b.addEventListener('click', () => GrammarPoints.showDetail(b.dataset.point, back)));
  }
  function switchesHtml() {
    return `<span class="switches">
      <label class="switch"><input type="checkbox" data-el="ko" ${prefs().showKo ? 'checked' : ''}> 해석</label>
      <label class="switch"><input type="checkbox" data-el="furi" ${prefs().furigana ? 'checked' : ''}> 후리가나</label>
    </span>`;
  }
  function bindSwitches() {
    const furi = $('[data-el="furi"]');
    if (furi) furi.addEventListener('change', (e) => { prefs().furigana = e.target.checked; applyPrefs(); });
    const ko = $('[data-el="ko"]');
    if (ko) ko.addEventListener('change', (e) => { prefs().showKo = e.target.checked; applyPrefs(); });
    const audio = $('[data-act="full-audio"]');
    if (audio) audio.addEventListener('click', () => Clip.play(Grammar.questionAudio({ id: audio.dataset.qid })));
  }
  const fullHtml = (q) => `
    <div class="explain-head"><h3>${q.type === 'bunshou' ? '완성한 글' : '완성 문장'}</h3>${switchesHtml()}</div>
    <div class="full" lang="ja">${markup(q.fullFurigana)} <button class="btn-mini" data-act="full-audio" data-qid="${Util.esc(q.id)}" title="음성">▶</button></div>
    <p class="ko" lang="ko">${Util.esc(q.fullKo).replace(/\n/g, '<br>')}</p>`;

  // 해설 패널 (bunpou·narabe). answered = 고른 번호(0 무응답), placed = narabe 배열(있으면)
  function explainHtml(q, answered, placed = null) {
    const ok = answered === q.answer;
    let verdict = ok ? '정답입니다' : answered === 0 ? `무응답 — 정답은 ${q.answer}번` : `오답입니다 — 정답은 ${q.answer}번`;
    let body = '';
    if (q.type === 'narabe') {
      const orderOk = placed && placed.every((n, k) => n === q.order[k]);
      if (ok && placed && !orderOk) verdict += ' (★ 자리는 맞았지만 다른 자리 순서가 다름)';
      const star = starIndex(q);
      body = `<h3>바른 순서</h3><p class="order-line" lang="ja">${q.order.map((n, k) =>
        `<span class="chip static ${k === star ? 'star' : ''}"><span class="num">${n}</span>${optText(q.options[n - 1])}</span>`).join('<span class="arrow">→</span>')}</p>`;
    } else {
      body = `<h3>선택지</h3><ol class="opt-notes">${q.options.map((o, i) => `<li class="${i + 1 === q.answer ? 'ok' : i + 1 === answered ? 'ng' : ''}"><span class="num">${i + 1}</span>
        <span lang="ja">${optText(o)}</span><span class="note">${i + 1 === q.answer ? '정답' : Util.esc(q.optionNotes_ko[i])}</span></li>`).join('')}</ol>`;
    }
    return `
      <div class="verdict ${ok ? 'ok' : 'ng'}">${verdict}</div>
      <div class="next-row" data-el="next-row"></div>
      <section class="explain card">
        ${fullHtml(q)}
        <h3>해설</h3>
        <p>${Util.esc(q.explanation_ko)}</p>
        ${body}
        ${pointCardsHtml(q.targets)}
      </section>`;
  }

  // ---------- 문항 화면 ----------
  function show(q, opts) {
    const isB = q.type === 'bunshou';
    let answered = opts.answered === undefined ? null : opts.answered;
    let answers = isB ? (Array.isArray(answered) ? answered.slice() : new Array(q.items.length).fill(0)) : null;
    const allDone = () => answers.every((a) => a > 0);
    const placed = q.type === 'narabe' ? (answered === null ? [0, 0, 0, 0] : q.order.slice()) : null;
    let arr = null;
    const back = () => show(q, { ...opts, answered: isB ? answers : answered });

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">${Util.esc(opts.backLabel)}</button>
        <span class="crumb">${opts.crumb}</span>
        ${Util.stepNav(opts, isB ? (allDone() ? 1 : null) : answered)}
      </div>
      <section class="card vq gq" data-qid="${Util.esc(q.id)}">
        ${headHtml(q)}
        ${bodyHtml(q)}
        ${q.type === 'narabe' ? '<div class="chips" data-el="chips"></div><div class="next-row" data-el="check-row"></div>' : ''}
        ${q.type === 'bunpou' ? '<section class="options" data-el="options"></section>' : ''}
      </section>
      ${isB ? '<section class="gitems" data-el="items"></section>' : ''}
      <section data-el="result"></section>
    `, { onKey });

    $('[data-act="back"]').addEventListener('click', opts.onBack);
    Util.bindStepNav(document, opts);
    applyPrefs();

    const markNext = () => { const s = $('[data-act="step-skip"]'); if (s) s.textContent = '다음 ›'; };
    function nextButton(box) {
      if (!opts.onNext || !box) return;
      box.innerHTML = `<button class="primary" data-act="next">${Util.esc(opts.nextLabel)} → <span class="kbd">Enter</span></button>`;
      box.querySelector('[data-act="next"]').addEventListener('click', opts.onNext);
    }

    // bunpou
    function renderBunpou() {
      const box = $('[data-el="options"]');
      box.innerHTML = optionsHtml(q.options, q.answer, answered);
      box.querySelectorAll('button.opt').forEach((b) => b.addEventListener('click', () => answerOne(Number(b.dataset.n))));
      if (answered !== null) renderResult();
    }
    function answerOne(n) {
      if (answered !== null || n < 1 || n > 4) return;
      answered = n;
      if (opts.onAnswer) opts.onAnswer(n, n === q.answer);
      markNext();
      if (q.type === 'bunpou') renderBunpou();
      else { arr.setLocked(true, true); $('[data-el="check-row"]').innerHTML = ''; renderResult(); }
    }
    function renderResult() {
      $('[data-el="result"]').innerHTML = explainHtml(q, answered, q.type === 'narabe' ? placed : null);
      nextButton($('[data-el="next-row"]'));
      bindSwitches();
      bindPointCards(back);
    }

    // narabe
    function renderCheck() {
      const row = $('[data-el="check-row"]');
      if (answered !== null) { row.innerHTML = ''; return; }
      const full = !placed.includes(0);
      row.innerHTML = `<button class="primary" data-act="check" ${full ? '' : 'disabled'}>확인 <span class="kbd">Enter</span></button>`;
      row.querySelector('[data-act="check"]').addEventListener('click', check);
    }
    function check() {
      if (answered !== null || placed.includes(0)) return;
      answerOne(placed[starIndex(q)]);
    }

    // bunshou
    function renderItems() {
      $('[data-el="items"]').innerHTML = itemsHtml(q, answers, { graded: true });
      fillGaps(q, answers, true);
      $$('[data-el="items"] button.opt').forEach((b) => b.addEventListener('click', () => answerItem(Number(b.dataset.item), Number(b.dataset.n))));
      if (allDone()) {
        $('[data-el="result"]').innerHTML = `
          <div class="verdict ${answers.every((a, i) => a === q.items[i].answer) ? 'ok' : 'ng'}">${answers.filter((a, i) => a === q.items[i].answer).length} / ${q.items.length} 정답</div>
          <div class="next-row" data-el="next-row"></div>
          <section class="explain card">${fullHtml(q)}${pointCardsHtml(Grammar.targetsOf(q))}</section>`;
        nextButton($('[data-el="next-row"]'));
        bindSwitches();
        bindPointCards(back);
      }
    }
    function answerItem(i, n) {
      if (answers[i] || n < 1 || n > 4) return;
      answers[i] = n;
      if (opts.onAnswer) opts.onAnswer(i, n, n === q.items[i].answer);
      if (allDone()) markNext();
      renderItems();
      const box = $(`[data-item-box="${i}"]`);
      if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
    }

    function onKey(e) {
      if (/^[1-4]$/.test(e.key)) {
        const n = Number(e.key);
        if (q.type === 'bunpou') answerOne(n);
        else if (q.type === 'narabe') { if (answered === null) arr.place(n); }
        else { const i = answers.indexOf(0); if (i >= 0) answerItem(i, n); }
      } else if (e.key === 'Backspace' && q.type === 'narabe' && answered === null) {
        e.preventDefault();
        arr.removeLast();
      } else if (e.key === 'Enter') {
        if (q.type === 'narabe' && answered === null) { e.preventDefault(); check(); }
        else if ((isB ? allDone() : answered !== null) && opts.onNext) { e.preventDefault(); opts.onNext(); }
      } else if (Util.stepKey(e, opts)) {
        e.preventDefault();
      } else if (e.key === 'Escape') opts.onBack();
    }

    if (q.type === 'bunpou') renderBunpou();
    else if (q.type === 'narabe') {
      arr = arrange($('.gq'), q, placed, { locked: answered !== null, grade: answered !== null, onChange: renderCheck });
      renderCheck();
      if (answered !== null) renderResult();
    } else renderItems();
  }

  return {
    show, markup, optText, instruction, starIndex, headHtml, bodyHtml, optionsHtml, arrange, itemsHtml, fillGaps,
    explainHtml, pointCardsHtml, bindPointCards, applyPrefs,
  };
})();
