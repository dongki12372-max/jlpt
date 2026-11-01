// ============================================================
// 유형별 연습: 유형 선택 → 문항 풀이(재생 컨트롤·즉시 채점) → 해설 → 결과
//   단축키: 1~4 답 선택, Space 재생/일시정지, R 다시 듣기, Enter 다음
// ============================================================
const Practice = (() => {
  // 세션 설정 (Phase 5에서 progress.json 설정으로 옮긴다)
  const prefs = { furigana: true, rate: null, order: 'seq' };

  let session = null;   // { level, type, list, idx, results: [{id, correct}] }

  const cfg = () => App.cfg;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function applyFurigana() {
    document.body.classList.toggle('no-furigana', !prefs.furigana);
  }

  // ---------- 유형 선택 ----------
  function showSetup(level) {
    const qs = App.questions(level);
    const cards = App.levelTypes(level).map((t) => {
      const n = qs.filter((q) => q.type === t).length;
      const tc = cfg().types[t];
      return `
        <button class="type-card" data-type="${t}" ${n ? '' : 'disabled'}>
          <span class="type-ja" lang="ja">${tc.label_ja}</span>
          <span class="type-ko">${tc.label_ko}</span>
          <span class="dim">${n}문항</span>
        </button>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 유형별 연습</span>
      </div>
      <h2>유형 선택</h2>
      <div class="segmented" role="radiogroup">
        <button data-order="seq" class="${prefs.order === 'seq' ? 'active' : ''}">순서대로</button>
        <button data-order="random" class="${prefs.order === 'random' ? 'active' : ''}">무작위</button>
      </div>
      <div class="type-grid">${cards}</div>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    $$('[data-order]').forEach((b) => b.addEventListener('click', () => {
      prefs.order = b.dataset.order;
      $$('[data-order]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    $$('[data-type]').forEach((b) => b.addEventListener('click', () => start(level, b.dataset.type)));
  }

  function start(level, type) {
    const list = App.questions(level).filter((q) => q.type === type);
    session = {
      level, type,
      list: prefs.order === 'random' ? Util.shuffle(list) : list,
      idx: 0,
      results: [],
    };
    showQuestion();
  }

  // ---------- 문항 ----------
  function showQuestion() {
    const q = session.list[session.idx];
    const tc = cfg().types[q.type];
    const info = App.audioInfo(q);
    if (prefs.rate === null) prefs.rate = cfg().defaultPlaybackRate;
    let answered = null;   // 고른 번호
    let lineEls = [];      // 해설의 대사 줄 (재생 위치 강조용)

    const scene = q.scene ? `
      <section class="scene card">
        ${q.scene.image ? `<div class="svg-box scene-img" data-img="${Util.esc(q.scene.image)}"></div>` : ''}
        <p>${Util.esc(q.scene.text_ko)}</p>
      </section>` : '';

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 유형 선택</button>
        <span class="crumb">${q.level} · <span lang="ja">${tc.label_ja}</span> ${tc.label_ko}</span>
        <span class="pos">${session.idx + 1} / ${session.list.length}</span>
      </div>

      <section class="player card">
        <button class="btn-icon" data-act="toggle" title="재생/일시정지 (Space)">▶</button>
        <button class="btn-icon" data-act="restart" title="처음부터 다시 듣기 (R)">↺</button>
        <div class="progress">
          <div class="bar"><div class="fill"></div><div class="reading-zone hidden"></div></div>
          <span class="time">0:00 / 0:00</span>
        </div>
        <div class="rates">
          ${cfg().playbackRates.map((r) => `<button class="rate ${r === prefs.rate ? 'active' : ''}" data-rate="${r}">${r.toFixed(1)}×</button>`).join('')}
        </div>
      </section>
      <div class="player-extra">
        <button class="skip-reading hidden" data-act="skip">선택지 읽는 시간 건너뛰기 ⏭</button>
        <p class="error hidden" data-el="audio-error">음성 파일이 없습니다. <code>tools/build_audio.py</code>를 실행하세요.</p>
      </div>

      ${scene}
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

    Player.load(App.audioUrl(q));
    Player.setRate(prefs.rate);
    Player.play();

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
      // 선택지 읽는 시간 안에 있을 때만 건너뛰기 버튼 (연습 모드 전용)
      skipBtn.classList.toggle('hidden', !(rd && t >= rd[0] && t < rd[1] - 0.3));
      highlightLine(t);
    }

    playBtn.addEventListener('click', () => Player.toggle());
    $('[data-act="restart"]').addEventListener('click', () => Player.restart());
    skipBtn.addEventListener('click', () => { Player.seek(info.reading[1]); Player.play(); });
    $$('[data-rate]').forEach((b) => b.addEventListener('click', () => {
      prefs.rate = Number(b.dataset.rate);
      Player.setRate(prefs.rate);
      $$('[data-rate]').forEach((x) => x.classList.toggle('active', x === b));
    }));
    $('[data-act="back"]').addEventListener('click', () => showSetup(session.level));

    // ---- 선택지 ----
    const imgOptions = q.options.every((o) => o.image);
    function renderOptions() {
      const box = $('[data-el="options"]');
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
      session.results.push({ id: q.id, correct: n === q.answer });
      renderOptions();
      renderResult();
    }

    // ---- 채점·해설 ----
    function renderResult() {
      const ok = answered === q.answer;
      const last = session.idx === session.list.length - 1;
      const canReplay = q.type !== 'hatsuwa' && info && info.lines.length;
      const lines = q.script.split('\n').map((row, i) => {
        const cut = row.indexOf('：');
        const spk = row.slice(0, cut), txt = row.slice(cut + 1);
        return `<li class="line ${canReplay ? 'clickable' : ''}" data-line="${i}">
                  <span class="spk">${Util.esc(Util.SPEAKER_LABEL[spk] || spk)}</span>
                  <span class="txt">${Util.furigana(txt)}</span>
                </li>`;
      }).join('');
      const vocab = q.vocab.map((v) => `
        <tr><td lang="ja">${Util.esc(v.word)}</td><td lang="ja" class="dim">${Util.esc(v.reading)}</td><td>${Util.esc(v.meaning_ko)}</td></tr>`).join('');

      $('[data-el="result"]').innerHTML = `
        <div class="verdict ${ok ? 'ok' : 'ng'}">
          ${ok ? '정답입니다' : `오답입니다 — 정답은 ${q.answer}번`}
        </div>
        <div class="next-row">
          <button class="primary" data-act="next">${last ? '결과 보기' : '다음 문제'} → <span class="kbd">Enter</span></button>
        </div>
        <section class="explain card">
          <div class="explain-head">
            <h3>스크립트</h3>
            <label class="switch"><input type="checkbox" data-el="furi" ${prefs.furigana ? 'checked' : ''}> 후리가나</label>
          </div>
          <ol class="script" lang="ja">${lines}</ol>
          ${canReplay ? '<p class="hint dim">대사를 누르면 그 부분만 다시 들을 수 있습니다.</p>' : ''}
          <h3>해설</h3>
          <p>${Util.esc(q.explanation_ko)}</p>
          ${q.vocab.length ? `<h3>핵심 단어</h3><table class="table vocab"><tbody>${vocab}</tbody></table>` : ''}
        </section>`;

      $('[data-act="next"]').addEventListener('click', next);
      $('[data-el="furi"]').addEventListener('change', (e) => { prefs.furigana = e.target.checked; applyFurigana(); });
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

    function next() {
      if (session.idx < session.list.length - 1) {
        session.idx += 1;
        showQuestion();
      } else {
        showDone();
      }
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
      } else if (e.key === 'Enter' && answered !== null) {
        e.preventDefault();
        next();
      } else if (e.key === 'Escape') {
        showSetup(session.level);
      }
    }

    applyFurigana();
    renderOptions();
    const sceneBox = $('.scene');
    if (sceneBox) loadImages(sceneBox);
  }

  // SVG를 인라인으로 넣어 currentColor가 테마 글자색을 따르게 한다
  function loadImages(container) {
    container.querySelectorAll('[data-img]').forEach(async (el) => {
      try {
        el.innerHTML = await window.jlpt.readImage(el.dataset.img);
      } catch (e) {
        el.textContent = '그림 없음';
      }
    });
  }

  // ---------- 결과 ----------
  function showDone() {
    const { results, list, level, type } = session;
    const correct = results.filter((r) => r.correct).length;
    const tc = cfg().types[type];
    const rows = list.map((q, i) => {
      const r = results.find((x) => x.id === q.id);
      return `<li class="${r && r.correct ? 'ok' : 'ng'}"><span class="mark">${r && r.correct ? '○' : '×'}</span> ${i + 1}. ${q.id}</li>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="back">← 유형 선택</button>
        <span class="crumb">${level} · <span lang="ja">${tc.label_ja}</span> ${tc.label_ko}</span>
      </div>
      <section class="card done">
        <h2>${correct} / ${list.length} 정답</h2>
        <ul class="result-list">${rows}</ul>
        <div class="next-row">
          <button class="secondary" data-act="back">유형 선택</button>
          <button class="primary" data-act="again">다시 풀기</button>
        </div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Enter') { e.preventDefault(); start(level, type); } else if (e.key === 'Escape') showSetup(level); } });

    $$('[data-act="back"]').forEach((b) => b.addEventListener('click', () => showSetup(level)));
    $('[data-act="again"]').addEventListener('click', () => start(level, type));
  }

  return { showSetup };
})();
