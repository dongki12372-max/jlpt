// ============================================================
// 청해 · 문항 화면 (연습 풀이와 실전 모의 결과의 해설 보기가 같이 쓴다)
//   재생 컨트롤·속도, 선택지, 즉시 채점, 해설 패널(후리가나·대사 구간 다시 듣기·단어)
//   단축키: 1~4 답 선택, Space 재생/일시정지, R 다시 듣기, Enter 다음, Esc 뒤로
//
//   QuestionView.show(q, {
//     crumb, pos,               상단 표시 (crumb는 HTML)
//     backLabel, onBack,        뒤로 가기
//     answered,                 undefined: 풀기 전 / 1~4: 고른 답으로 바로 해설 / 0: 무응답으로 해설
//     autoplay,                 문항을 열 때 자동 재생
//     onAnswer(n, correct),     답을 골랐을 때 (풀기 전 상태에서만)
//     nextLabel, onNext,        해설 아래 '다음' 버튼
//   })
// ============================================================
const QuestionView = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const prefs = () => Listening.prefs;

  function applyFurigana() {
    document.body.classList.toggle('no-furigana', !prefs().furigana);
  }

  // SVG를 인라인으로 넣어 currentColor가 테마 글자색을 따르게 한다
  function loadImages(container) {
    container.querySelectorAll('[data-img]').forEach(async (el) => {
      try {
        el.innerHTML = await Listening.readImage(el.dataset.img);
      } catch (e) {
        el.textContent = '그림 없음';
      }
    });
  }

  function sceneHtml(q) {
    if (!q.scene) return '';
    return `
      <section class="scene card">
        ${q.scene.image ? `<div class="svg-box scene-img" data-img="${Util.esc(q.scene.image)}"></div>` : ''}
        <p>${Util.esc(q.scene.text_ko)}</p>
      </section>`;
  }

  function show(q, opts) {
    const cfg = Listening.cfg;
    const info = Listening.audioInfo(q);
    let answered = opts.answered === undefined ? null : opts.answered;   // null: 풀기 전, 0: 무응답
    let lineEls = [];

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">${Util.esc(opts.backLabel)}</button>
        <span class="crumb">${opts.crumb}</span>
        <span class="pos">${Util.esc(opts.pos || '')}</span>
      </div>

      <section class="player card">
        <button class="btn-icon" data-act="toggle" title="재생/일시정지 (Space)">▶</button>
        <button class="btn-icon" data-act="restart" title="처음부터 다시 듣기 (R)">↺</button>
        <div class="progress">
          <div class="bar"><div class="fill"></div><div class="reading-zone hidden"></div></div>
          <span class="time">0:00 / 0:00</span>
        </div>
        <div class="rates">
          ${cfg.playbackRates.map((r) => `<button class="rate ${r === prefs().rate ? 'active' : ''}" data-rate="${r}">${r.toFixed(1)}×</button>`).join('')}
        </div>
      </section>
      <div class="player-extra">
        <button class="skip-reading hidden" data-act="skip">선택지 읽는 시간 건너뛰기 ⏭</button>
        <p class="error hidden" data-el="audio-error">음성 파일이 없습니다. <code>tools/build_audio.py</code>를 실행하세요.</p>
      </div>

      ${sceneHtml(q)}
      <section class="options" data-el="options"></section>
      <section data-el="result"></section>
    `, { onKey, onLeave: () => { offChange(); offError(); } });

    // ---- 재생 ----
    const playBtn = $('[data-act="toggle"]');
    const fill = $('.progress .fill');
    const timeEl = $('.progress .time');
    const skipBtn = $('[data-act="skip"]');
    const readingZone = $('.reading-zone');

    const offChange = Player.onChange(updatePlayer);
    const offError = Player.onError(() => $('[data-el="audio-error"]').classList.remove('hidden'));

    Player.load(Listening.audioUrl(q));
    Player.setRate(prefs().rate);
    if (opts.autoplay) Player.play();

    function updatePlayer() {
      const t = Player.currentTime, d = Player.duration;
      playBtn.textContent = Player.paused ? '▶' : '❚❚';
      fill.style.width = d ? `${(t / d) * 100}%` : '0';
      timeEl.textContent = `${Util.fmtTime(t)} / ${Util.fmtTime(d)}`;
      const rd = info && info.reading;
      if (rd && d) {
        readingZone.classList.remove('hidden');
        readingZone.style.left = `${(rd[0] / d) * 100}%`;
        readingZone.style.width = `${((rd[1] - rd[0]) / d) * 100}%`;
      }
      // 선택지 읽는 시간 안에 있을 때만 건너뛰기 버튼 (연습 전용 — 실전 모의 화면에는 없다)
      skipBtn.classList.toggle('hidden', !(rd && t >= rd[0] && t < rd[1] - 0.3));
      highlightLine(t);
    }

    playBtn.addEventListener('click', () => Player.toggle());
    $('[data-act="restart"]').addEventListener('click', () => Player.restart());
    skipBtn.addEventListener('click', () => { Player.seek(info.reading[1]); Player.play(); });
    $$('[data-rate]').forEach((b) => b.addEventListener('click', () => {
      prefs().rate = Number(b.dataset.rate);
      Player.setRate(prefs().rate);
      $$('[data-rate]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    $('[data-act="back"]').addEventListener('click', opts.onBack);

    // ---- 선택지 ----
    const imgOptions = q.options.every((o) => o.image);
    function renderOptions() {
      const box = $('[data-el="options"]');
      box.dataset.qid = q.id;
      box.classList.toggle('grid', imgOptions);
      box.innerHTML = q.options.map((o, i) => {
        const n = i + 1;
        const cls = answered === null ? '' :
          n === q.answer ? 'correct' : n === answered ? 'wrong' : 'dim';
        const showText = !q.spokenOptions || answered !== null;
        const text = showText && !imgOptions
          ? `<span class="opt-text" lang="ja">${Util.furigana(o.furigana || o.text)}</span>` : '';
        const img = imgOptions ? `<div class="svg-box" data-img="${Util.esc(o.image)}"></div>` : '';
        // 답한 뒤 음성 선택지는 그 부분만 다시 들을 수 있다
        const seg = answered !== null && q.spokenOptions && info && info.options[i];
        const replay = seg ? `<button class="mini-play" data-opt-seg="${i}" title="이 선택지 다시 듣기">▶</button>` : '';
        const tag = answered === null ? 'button' : 'div';
        return `<${tag} class="opt ${cls} ${showText ? '' : 'num-only'}" data-n="${n}">
                  <span class="num">${n}</span>${img}${text}${replay}
                </${tag}>`;
      }).join('');
      loadImages(box);
      box.querySelectorAll('button.opt').forEach((b) =>
        b.addEventListener('click', () => answer(Number(b.dataset.n))));
      box.querySelectorAll('[data-opt-seg]').forEach((b) => b.addEventListener('click', () => {
        const [s, e] = info.options[Number(b.dataset.optSeg)];
        Player.playSegment(s, e);
      }));
    }

    function answer(n) {
      if (answered !== null || n < 1 || n > q.options.length) return;
      answered = n;
      if (opts.onAnswer) opts.onAnswer(n, n === q.answer);
      renderOptions();
      renderResult();
    }

    // ---- 채점·해설 ----
    function renderResult() {
      const verdict = answered === q.answer ? ['ok', '정답입니다']
        : answered === 0 ? ['ng', `무응답 — 정답은 ${q.answer}번`]
        : ['ng', `오답입니다 — 정답은 ${q.answer}번`];
      const canReplay = q.type !== 'hatsuwa' && info && info.lines.length;
      const lines = q.script.split('\n').map((row, i) => {
        const cut = row.indexOf('：');
        const spk = row.slice(0, cut), txt = row.slice(cut + 1);
        return `<li class="line ${canReplay ? 'clickable' : ''}" data-line="${i}">
                  <span class="spk">${Util.esc(Util.SPEAKER_LABEL[spk] || spk)}</span>
                  <span class="txt">${Util.furigana(txt)}</span>
                </li>`;
      }).join('');
      // 단어장에 있는 단어(문자·어휘 영역)는 표시하고 ▶ 단어 음성
      const inDeck = (v) => (typeof Vocab !== 'undefined' && v.kind !== 'grammar' ? Vocab.word(`${v.word}|${v.reading}`) : null);
      const vocab = q.vocab.map((v) => {
        const w = inDeck(v);
        const deck = w ? `<button class="btn-mini" data-word-audio="${Util.esc(w.key)}" title="단어 음성">▶</button> <span class="in-deck">단어장에 있음</span>` : '';
        return `
        <tr><td lang="ja">${Util.esc(v.word)}</td><td lang="ja" class="dim">${Util.esc(v.reading)}</td><td>${Util.esc(v.meaning_ko)}</td><td class="num">${deck}</td></tr>`;
      }).join('');

      $('[data-el="result"]').innerHTML = `
        <div class="verdict ${verdict[0]}">${verdict[1]}</div>
        ${opts.onNext ? `
        <div class="next-row">
          <button class="primary" data-act="next">${Util.esc(opts.nextLabel)} → <span class="kbd">Enter</span></button>
        </div>` : ''}
        <section class="explain card">
          <div class="explain-head">
            <h3>스크립트</h3>
            <label class="switch"><input type="checkbox" data-el="furi" ${prefs().furigana ? 'checked' : ''}> 후리가나</label>
          </div>
          <ol class="script" lang="ja">${lines}</ol>
          ${canReplay ? '<p class="hint dim">대사를 누르면 그 부분만 다시 들을 수 있습니다.</p>' : ''}
          <h3>해설</h3>
          <p>${Util.esc(q.explanation_ko)}</p>
          ${q.vocab.length ? `<h3>핵심 단어</h3><table class="table vocab"><tbody>${vocab}</tbody></table>` : ''}
        </section>`;

      if (opts.onNext) $('[data-act="next"]').addEventListener('click', opts.onNext);
      $$('[data-word-audio]').forEach((b) => b.addEventListener('click', () => Clip.play(Vocab.wordAudio(Vocab.word(b.dataset.wordAudio)))));
      $('[data-el="furi"]').addEventListener('change', (e) => { prefs().furigana = e.target.checked; applyFurigana(); });
      lineEls = $$('.script .line');
      if (canReplay) {
        lineEls.forEach((li) => li.addEventListener('click', () => {
          const seg = info.lines[Number(li.dataset.line)];
          if (seg) Player.playSegment(seg[0], seg[1]);
        }));
      }
    }

    // 재생 위치에 해당하는 대사 강조
    function highlightLine(t) {
      if (!lineEls.length || !info || q.type === 'hatsuwa') return;
      lineEls.forEach((li, i) => {
        const seg = info.lines[i];
        li.classList.toggle('playing', !!seg && !Player.paused && t >= seg[0] && t < seg[1]);
      });
    }

    function onKey(e) {
      if (e.key === ' ') {
        e.preventDefault();
        if (document.activeElement) document.activeElement.blur();  // 포커스된 버튼이 keyup으로 눌리지 않게
        Player.toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        Player.restart();
      } else if (/^[1-4]$/.test(e.key)) {
        answer(Number(e.key));
      } else if (e.key === 'Enter' && answered !== null && opts.onNext) {
        e.preventDefault();
        opts.onNext();
      } else if (e.key === 'Escape') {
        opts.onBack();
      }
    }

    applyFurigana();
    renderOptions();
    if (answered !== null) renderResult();
    const sceneBox = $('.scene');
    if (sceneBox) loadImages(sceneBox);
  }

  return { show, sceneHtml, loadImages, applyFurigana };
})();
