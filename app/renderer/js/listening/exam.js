// ============================================================
// 청해 · 실전 모의
//   시작 화면(구성 확인) → [유형마다 지시문 음성 → 문항 음성 → 답 고르는 시간] 자동 진행 → 결과
//   일시정지·다시 듣기·속도 조절 없음. 정답은 끝날 때까지 보여 주지 않는다.
//   문항 수가 config보다 적으면 있는 만큼만 출제하고 시작 화면에 부족분을 표시한다.
//   단축키: 1~4 답 선택(답 고르는 시간이 끝날 때까지 바꿀 수 있음), Esc 중단
// ============================================================
const Exam = (() => {
  const cfg = () => Listening.cfg;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let run = null;      // 진행 중인 시험
  let result = null;   // 마지막 결과 (해설 보기에서 돌아오기용)

  // ---------- 구성 ----------
  function compose(level) {
    const exam = cfg().levels[level].exam;
    const parts = Listening.levelTypes(level).map((type, i) => {
      const pool = Listening.questions(level).filter((q) => q.type === type);
      const want = exam[type];
      return { type, no: i + 1, want, have: pool.length, questions: Util.shuffle(pool).slice(0, want) };
    });
    return parts;
  }

  // ---------- 시작 화면 ----------
  function showStart(level) {
    const parts = compose(level);
    const total = parts.reduce((s, p) => s + p.questions.length, 0);
    const want = parts.reduce((s, p) => s + p.want, 0);
    const short = parts.filter((p) => p.have < p.want);
    const rows = parts.map((p) => {
      const tc = cfg().types[p.type];
      return `
        <tr>
          <td>問題${p.no}</td>
          <td><span lang="ja">${tc.label_ja}</span> <span class="dim">${tc.label_ko}</span></td>
          <td class="num ${p.have < p.want ? 'warn' : ''}">${p.questions.length}${p.have < p.want ? ` / ${p.want}` : ''}</td>
        </tr>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 청해 실전 모의</span>
      </div>
      <section class="card">
        <h2>시험 구성</h2>
        <table class="table">
          <thead><tr><th>문제</th><th>유형</th><th class="num">문항</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td></td><td>합계</td><td class="num">${total}${short.length ? ` / ${want}` : ''}</td></tr></tfoot>
        </table>
        ${short.length ? `<p class="notice">문제 은행이 부족해 ${want}문항 중 ${total}문항만 출제합니다. 문항을 추가하면 실전과 같은 구성이 됩니다.</p>` : ''}
        <ul class="rules dim">
          <li>실제 시험처럼 음성은 한 번만 재생되고, 일시정지·다시 듣기·속도 조절을 할 수 없습니다.</li>
          <li>각 문항 음성이 끝나면 답 고르는 시간 ${Listening.prefs.answerSeconds}초가 주어집니다. 그 안에서는 답을 바꿀 수 있습니다.</li>
          <li>정답은 시험이 끝난 뒤 결과 화면에서 확인합니다. 결과는 기록에 저장되고 틀린 문항은 오답노트에 들어갑니다. 실제 시험 시간은 ${cfg().levels[level].examMinutes}분입니다.</li>
        </ul>
        <div class="next-row">
          <button class="primary" data-act="begin" ${total ? '' : 'disabled'}>시작 <span class="kbd">Enter</span></button>
        </div>
      </section>
    `, { onKey: (e) => {
      if (e.key === 'Enter' && total) { e.preventDefault(); begin(level, parts); } else if (e.key === 'Escape') App.showHome();
    } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    $('[data-act="begin"]').addEventListener('click', () => begin(level, parts));
  }

  // ---------- 진행 ----------
  function begin(level, parts) {
    const items = [];
    parts.forEach((p) => p.questions.forEach((q, i) => items.push({ q, part: p, num: i + 1 })));
    run = { level, parts, items, idx: -1, answers: {}, startedAt: Date.now(), timer: 0, wait: 0 };

    App.setScreen(`
      <div class="topbar exam-top">
        <span class="crumb">${level} · 청해 실전 모의</span>
        <span class="pos" data-el="pos"></span>
        <span class="elapsed dim" data-el="elapsed">0:00</span>
        <button class="link danger" data-act="abort">중단</button>
      </div>
      <section class="exam-head card">
        <div class="exam-title"><span data-el="part" lang="ja"></span> <span class="dim" data-el="part-ko"></span></div>
        <div class="exam-num" data-el="num" lang="ja"></div>
        <div class="exam-status" data-el="status" data-phase="intro"></div>
        <div class="countdown"><div class="fill" data-el="cd"></div></div>
        <p class="error hidden" data-el="audio-error">음성 파일이 없어 건너뜁니다.</p>
      </section>
      <div data-el="scene"></div>
      <section class="options" data-el="options"></section>
    `, { onKey, onLeave: stopAll });

    const offEnded = Player.onEnded(() => run && run.onEnded && run.onEnded());
    const offError = Player.onError(() => {
      $('[data-el="audio-error"]').classList.remove('hidden');
      if (run && run.onEnded) run.onEnded();
    });
    run.offs = [offEnded, offError];
    run.clock = setInterval(() => {
      const el = $('[data-el="elapsed"]');
      if (el) el.textContent = Util.fmtTime((Date.now() - run.startedAt) / 1000);
    }, 500);
    $('[data-act="abort"]').addEventListener('click', abort);
    Player.setRate(1.0);   // 실전은 항상 1.0배
    nextItem();
  }

  function stopAll() {
    if (!run) return;
    clearInterval(run.timer);
    clearInterval(run.clock);
    clearTimeout(run.wait);
    (run.offs || []).forEach((off) => off());
    run.onEnded = null;
  }

  function setStatus(phase, text) {
    const el = $('[data-el="status"]');
    el.dataset.phase = phase;
    el.textContent = text;
  }

  function play(src, onEnded) {
    run.onEnded = () => { run.onEnded = null; onEnded(); };
    $('[data-el="audio-error"]').classList.add('hidden');
    Player.load(src);
    Player.play();
  }

  function nextItem() {
    run.idx += 1;
    if (run.idx >= run.items.length) { finish(); return; }
    const item = run.items[run.idx];
    const tc = cfg().types[item.part.type];
    $('[data-el="pos"]').textContent = `${run.idx + 1} / ${run.items.length}`;
    $('[data-el="part"]').textContent = `問題${item.part.no}　${tc.label_ja}`;
    $('[data-el="part-ko"]').textContent = tc.label_ko;
    setCountdown(0);

    if (item.num === 1) {
      // 유형 첫 문항 앞: 지시문
      $('[data-el="num"]').textContent = '';
      $('[data-el="scene"]').innerHTML = '';
      $('[data-el="options"]').innerHTML = '';
      setStatus('intro', '지시문 재생 중');
      const lv = run.level.toLowerCase();
      play(`../../audio/${Listening.SECTION}/${lv}/_intro_${item.part.type}.mp3`, () => startQuestion(item));
    } else {
      startQuestion(item);
    }
  }

  function startQuestion(item) {
    const q = item.q;
    $('[data-el="num"]').textContent = `${item.num}番`;
    $('[data-el="scene"]').innerHTML = QuestionView.sceneHtml(q);
    const sceneBox = $('[data-el="scene"] .scene');
    if (sceneBox) QuestionView.loadImages(sceneBox);
    renderOptions(item);
    setStatus('audio', '음성 재생 중');
    play(Listening.audioUrl(q), () => answerTime(item));
  }

  function renderOptions(item) {
    const q = item.q;
    const box = $('[data-el="options"]');
    const imgOptions = q.options.every((o) => o.image);
    const chosen = run.answers[q.id];
    box.dataset.qid = q.id;
    box.classList.toggle('grid', imgOptions);
    box.innerHTML = q.options.map((o, i) => {
      const n = i + 1;
      const text = !q.spokenOptions && !imgOptions
        ? `<span class="opt-text" lang="ja">${Util.furigana(o.furigana || o.text)}</span>` : '';
      const img = imgOptions ? `<div class="svg-box" data-img="${Util.esc(o.image)}"></div>` : '';
      return `<button class="opt ${n === chosen ? 'selected' : ''} ${q.spokenOptions ? 'num-only' : ''}" data-n="${n}">
                <span class="num">${n}</span>${img}${text}
              </button>`;
    }).join('');
    QuestionView.loadImages(box);
    box.querySelectorAll('button.opt').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.n))));
  }

  function choose(n) {
    const item = run && run.items[run.idx];
    const phase = $('[data-el="status"]').dataset.phase;
    if (!item || phase === 'intro' || phase === 'gap' || n < 1 || n > item.q.options.length) return;
    run.answers[item.q.id] = n;
    $$('[data-el="options"] .opt').forEach((b) => b.classList.toggle('selected', Number(b.dataset.n) === n));
  }

  function setCountdown(ratio) {
    const el = $('[data-el="cd"]');
    if (el) el.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  function answerTime(item) {
    const sec = Listening.prefs.answerSeconds;
    const end = Date.now() + sec * 1000;
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      setStatus('answer', `답을 고르세요 · ${Math.ceil(left / 1000)}초`);
      setCountdown(left / (sec * 1000));
      if (left <= 0) {
        clearInterval(run.timer);
        setStatus('gap', run.answers[item.q.id] ? '다음 문항으로' : '무응답으로 넘어갑니다');
        run.wait = setTimeout(nextItem, cfg().examGapSeconds * 1000);
      }
    };
    clearInterval(run.timer);
    run.timer = setInterval(tick, 100);
    tick();
  }

  function abort() {
    if (!window.confirm('실전 모의를 중단할까요? 지금까지의 답은 저장되지 않습니다.')) return;
    const level = run.level;
    stopAll();
    run = null;
    showStart(level);
  }

  function onKey(e) {
    if (e.key === ' ') {
      e.preventDefault();   // 실전에서는 재생 제어 없음 (버튼이 눌리지 않게만 막는다)
    } else if (/^[1-4]$/.test(e.key)) {
      choose(Number(e.key));
    } else if (e.key === 'Escape') {
      abort();
    }
  }

  // ---------- 결과 ----------
  function finish() {
    const { level, items, answers, startedAt } = run;
    stopAll();
    run = null;
    const rows = items.map((it) => ({
      item: it,
      chosen: answers[it.q.id] || 0,
      correct: answers[it.q.id] === it.q.answer,
    }));
    result = { level, rows, seconds: Math.round((Date.now() - startedAt) / 1000) };
    saveRecord(result);
    showResult();
  }

  // 기록 저장: 문항별 풀이(무응답은 오답으로) + 실전 모의 기록 (docs/DESIGN.md 2장)
  function saveRecord({ level, rows, seconds }) {
    rows.forEach((r) => Listening.recordAnswer(r.item.q, r.correct));
    const correct = rows.filter((r) => r.correct).length;
    const byType = {};
    rows.forEach((r) => {
      const t = r.item.part.type;
      byType[t] = byType[t] || { total: 0, correct: 0 };
      byType[t].total += 1;
      if (r.correct) byType[t].correct += 1;
    });
    const official = Object.values(cfg().levels[level].exam).reduce((a, b) => a + b, 0);
    Storage.addExam(Listening.SECTION, {
      at: new Date().toISOString(),
      level,
      total: rows.length,
      correct,
      score: Math.round((correct / rows.length) * cfg().examScoreMax),
      full: rows.length === official,
      seconds,
      byType,
      answers: rows.map((r) => ({ id: r.item.q.id, chosen: r.chosen, correct: r.correct })),
    });
  }

  function showResult() {
    const { level, rows, seconds } = result;
    const correct = rows.filter((r) => r.correct).length;
    const score = Math.round((correct / rows.length) * cfg().examScoreMax);
    const max = cfg().examScoreMax, pass = cfg().passMark;

    const byType = Listening.levelTypes(level).map((t) => {
      const rs = rows.filter((r) => r.item.part.type === t);
      if (!rs.length) return '';
      const c = rs.filter((r) => r.correct).length;
      const tc = cfg().types[t];
      return `<tr><td><span lang="ja">${tc.label_ja}</span> <span class="dim">${tc.label_ko}</span></td>
                  <td class="num">${c} / ${rs.length}</td><td class="num">${Math.round((c / rs.length) * 100)}%</td></tr>`;
    }).join('');

    const list = rows.map((r, i) => `
      <li class="${r.correct ? 'ok' : 'ng'}">
        <span class="mark">${r.correct ? '○' : '×'}</span>
        <span lang="ja">問題${r.item.part.no} ${r.item.num}番</span>
        <span class="dim">${r.chosen ? `${r.chosen}번 선택` : '무응답'}${r.correct ? '' : ` · 정답 ${r.item.q.answer}번`}</span>
        <button class="link" data-review="${i}">해설</button>
      </li>`).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 청해 실전 모의 결과</span>
        <span class="pos dim">소요 ${Util.fmtTime(seconds)}</span>
      </div>
      <section class="card score-card">
        <div class="score-line">
          <span class="score" data-el="score">${score}</span><span class="dim"> / ${max}점</span>
          <span class="score-sub">${correct} / ${rows.length} 정답</span>
          <span class="badge ${score >= pass ? 'ok' : 'ng'}">${score >= pass ? '기준점 이상' : '기준점 미달'}</span>
        </div>
        <div class="score-bar">
          <div class="fill ${score >= pass ? 'ok' : 'ng'}" data-el="score-fill"></div>
          <div class="pass-mark" data-el="pass-mark"><span>기준점 ${pass}</span></div>
        </div>
        <p class="dim small">환산 점수는 정답률 × ${max}로 계산한 참고값이며, 실제 JLPT 척도 점수(등화 처리)와 다릅니다.</p>
      </section>
      <section class="card">
        <h2>유형별 정답률</h2>
        <table class="table"><tbody>${byType}</tbody></table>
      </section>
      <section class="card">
        <h2>문항별 결과</h2>
        <ul class="exam-list">${list}</ul>
      </section>
      <div class="next-row">
        <button class="secondary" data-act="home">홈</button>
        <button class="primary" data-act="again">다시 응시</button>
      </div>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    $('[data-el="score-fill"]').style.width = `${(score / max) * 100}%`;
    $('[data-el="pass-mark"]').style.left = `${(pass / max) * 100}%`;
    $$('[data-act="home"]').forEach((b) => b.addEventListener('click', App.showHome));
    $('[data-act="again"]').addEventListener('click', () => showStart(level));
    $$('[data-review]').forEach((b) => b.addEventListener('click', () => review(Number(b.dataset.review))));
  }

  // 결과 → 문항별 해설 (연습 문항 화면 재사용, 고른 답으로 바로 해설)
  function review(i) {
    const r = result.rows[i];
    const tc = cfg().types[r.item.part.type];
    const last = i === result.rows.length - 1;
    QuestionView.show(r.item.q, {
      crumb: `${result.level} · 실전 <span lang="ja">問題${r.item.part.no} ${r.item.num}番 · ${tc.label_ja}</span>`,
      pos: `${i + 1} / ${result.rows.length}`,
      backLabel: '← 결과',
      onBack: showResult,
      answered: r.chosen,
      blankLabel: '무응답',
      autoplay: false,
      nextLabel: last ? '결과로' : '다음 문항 해설',
      onNext: () => (last ? showResult() : review(i + 1)),
    });
  }

  return { showStart };
})();
