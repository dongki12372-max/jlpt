// ============================================================
// 스크립트 단어 사전 (영역 공통): 후리가나 문장 + gloss 목록 → 누를 수 있는 단어, 누르면 작은 사전 창
//   gloss 항목 = { t: 문장에 나온 모양, w: 사전형, r: 읽기, m: 한국어 뜻 } — 줄 안에서 나오는 순서대로
//   단어장(문자·어휘)에 같은 key(w|r)가 있으면 ▶ 발음과 「단어장에서 보기」를, 문법 문형(key = w)이 있으면 「문형 사전에서 보기」를 붙인다.
//   Esc 또는 창 밖을 누르면 닫힌다.
// ============================================================
const Dict = (() => {
  let pop = null;

  // {漢字|かな} 표기를 글자 단위로 나눈다: [{ plain, html }] (후리가나 묶음은 한 단위)
  function units(markup) {
    const out = [];
    const re = /\{([^{}|]+)\|([^{}|]+)\}/g;
    let pos = 0;
    let m;
    const plainChars = (str) => { for (const ch of str) out.push({ plain: ch, html: Util.esc(ch) }); };
    while ((m = re.exec(markup))) {
      plainChars(markup.slice(pos, m.index));
      out.push({ plain: m[1], html: Util.ruby(Util.esc(m[1]), Util.esc(m[2])) });
      pos = m.index + m[0].length;
    }
    plainChars(markup.slice(pos));
    return out;
  }

  // 후리가나 문장의 gloss 단어를 <span class="gl" data-g="{prefix}.{i}">로 감싼다 (gloss가 빈 배열이어도 글자 단위 span은 만든다).
  // 단어가 후리가나 묶음의 일부만 덮으면 묶음 전체로 넓힌다. 찾지 못한 단어는 건너뛴다.
  function glossHtml(markup, gloss, prefix) {
    const us = units(markup);
    const starts = [];
    let plain = '';
    us.forEach((u) => { starts.push(plain.length); plain += u.plain; });
    const wrapAt = new Map();   // 시작 단위 index → { end 단위 index(포함), g }
    let cursor = 0;
    let lastUnit = -1;
    gloss.forEach((g, gi) => {
      const at = plain.indexOf(g.t, cursor);
      if (at < 0) return;
      cursor = at + g.t.length;
      let a = 0;
      while (a + 1 < us.length && starts[a + 1] <= at) a++;
      let b = a;
      while (b + 1 < us.length && starts[b + 1] < at + g.t.length) b++;
      if (a <= lastUnit) return;   // 앞 단어와 겹치면 건너뜀
      wrapAt.set(a, { end: b, gi });
      lastUnit = b;
    });
    // 글자 단위마다 위치(data-p)를 달아 둔다 — 재생 중 지금 읽는 단어 표시에 쓴다 (QuestionView)
    const unit = (k) => `<span class="u" data-p="${starts[k]}">${us[k].html}</span>`;
    let html = '';
    for (let i = 0; i < us.length; i++) {
      const w = wrapAt.get(i);
      if (!w) { html += unit(i); continue; }
      let inner = '';
      for (let k = i; k <= w.end; k++) inner += unit(k);
      html += `<span class="gl" data-g="${prefix}.${w.gi}">${inner}</span>`;
      i = w.end;
    }
    return html;
  }

  const deckWord = (g) => (typeof Vocab !== 'undefined' ? Vocab.word(`${g.w}|${g.r}`) : null);
  const grammarPoint = (g) => (typeof Grammar !== 'undefined' && Grammar.data ? Grammar.point(g.w) : null);

  function close() {
    if (pop) { pop.remove(); pop = null; }
    document.querySelectorAll('.gl.active').forEach((el) => el.classList.remove('active'));
  }

  function open(el, g, back) {
    close();
    el.classList.add('active');
    const w = deckWord(g);
    const gp = grammarPoint(g);
    const hasKanji = /[一-龯々〆ヵヶ]/.test(g.w);
    const head = hasKanji && !g.w.startsWith('〜') ? Util.ruby(Util.esc(g.w), Util.esc(g.r)) : Util.esc(g.w);
    pop = document.createElement('div');
    pop.className = 'dict-pop';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `
      <div class="dict-head"><span class="dict-word" lang="ja">${head}</span>
        ${hasKanji ? `<span class="dict-reading" lang="ja">${Util.esc(g.r)}</span>` : ''}
        ${w ? '<button class="btn-mini" data-dict="audio" title="발음">▶</button>' : ''}</div>
      <p class="dict-meaning">${Util.esc(g.m)}</p>
      ${g.t !== g.w ? `<p class="dict-form dim small" lang="ja">문장 속: ${Util.esc(g.t)}</p>` : ''}
      ${w ? `<p class="dict-deck small"><span class="in-deck">단어장에 있음 · ${w.level}</span>
        <button class="link small" data-dict="deck">단어장에서 보기</button></p>` : ''}
      ${gp ? `<p class="dict-deck small"><span class="in-deck">문형 · ${gp.level}</span>
        <button class="link small" data-dict="grammar">문형 사전에서 보기</button></p>` : ''}`;
    document.body.appendChild(pop);
    const r = el.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const left = Math.min(Math.max(8, r.left + window.scrollX), window.scrollX + document.documentElement.clientWidth - pw - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;
    if (gp) {
      pop.querySelector('[data-dict="grammar"]').addEventListener('click', () => {
        close();
        GrammarPoints.showDetail(gp.key, back || App.showHome);
      });
    }
    if (w) {
      pop.querySelector('[data-dict="audio"]').addEventListener('click', () => Clip.play(Vocab.wordAudio(w)));
      pop.querySelector('[data-dict="deck"]').addEventListener('click', () => {
        close();
        Deck.showDetail(w.key, back || App.showHome);
      });
      Clip.play(Vocab.wordAudio(w));
    }
  }

  // container 안의 .gl 단어를 누르면 사전 창. getEntry(data-g 값) → gloss 항목, back: 단어장 상세에서 돌아올 화면
  function bind(container, getEntry, back) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const el = e.target.closest('.gl');
      if (!el) return;
      e.stopPropagation();
      if (el.classList.contains('active')) { close(); return; }
      const g = getEntry(el.dataset.g);
      if (g) open(el, g, back);
    });
  }

  document.addEventListener('click', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('.gl')) close(); });
  window.addEventListener('keydown', (e) => { if (pop && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);

  return { units, glossHtml, bind, close };
})();
