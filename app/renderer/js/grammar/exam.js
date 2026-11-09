// ============================================================
// 문법 · 실전 모의
//   config 구성대로 형식 순서로 무작위 출제 (bunshou는 빈칸 수가 실전 수와 같은 글 한 편), 전체 타이머(examMinutes).
//   한 회 안에서 같은 문형을 묻는 문항은 되도록 함께 내지 않는다. 문항 번호 목록으로 자유 이동, 답 바꾸기 가능.
//   번호는 채점 단위(bunshou는 빈칸마다)로 매기고, bunshou 글 하나는 한 화면에 보여 준다.
//   「제출」 또는 시간 종료 시 자동 제출 → 결과(정답 수, 형식별 정답률, 걸린 시간) → 문항별 해설.
//   단축키: 1~4 답(bunshou는 아직 안 고른 첫 빈칸, narabe는 조각 놓기), Backspace 조각 빼기, ←/→ 이전·다음
// ============================================================
const GrammarExam = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const cfg = () => Grammar.cfg;
  const QV = () => GrammarQuestionView;

  const conflict = (a, b) => Grammar.targetsOf(a).some((t) => Grammar.targetsOf(b).includes(t));

  function compose(level) {
    let best = null;
    for (let i = 0; i < 30; i++) {
      const parts = composeOnce(level);
      const qs = parts.flatMap((p) => p.items);
      let n = 0;
      for (let a = 0; a < qs.length; a++) for (let b = a + 1; b < qs.length; b++) if (conflict(qs[a], qs[b])) n++;
      if (!best || n < best.n) best = { parts, n };
      if (n === 0) break;
    }
    return best.parts;
  }

  function composeOnce(level) {
    const exam = cfg().levels[level].exam;
    const chosen = [];
    return Grammar.levelTypes(level).map((t) => {
      const pool = Util.shuffle(Grammar.questions(level).filter((q) => q.type === t));
      const want = t === 'bunshou' ? 1 : exam[t];   // bunshou는 글 한 편
      const items = [];
      for (const q of pool) {
        if (items.length >= want) break;
        if (!chosen.some((c) => conflict(c, q))) { items.push(q); chosen.push(q); }
      }
      for (const q of pool) {
        if (items.length >= want) break;
        if (!items.includes(q)) { items.push(q); chosen.push(q); }
      }
      return { type: t, want: exam[t], items, count: items.reduce((s, q) => s + Grammar.itemCount(q), 0) };
    });
  }

  function showStart(level) {
    const parts = compose(level);
    const want = parts.reduce((s, p) => s + p.want, 0);
    const total = parts.reduce((s, p) => s + p.count, 0);
    const rows = parts.map((p) => `<tr><td><span lang="ja">${cfg().types[p.type].label_ja}</span> <span class="dim">${cfg().types[p.type].label_ko}</span></td>
      <td class="num ${p.count < p.want ? 'warn' : ''}">${p.count}</td><td class="num">${p.want}</td></tr>`).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문법 · 실전 모의</span>
      </div>
      <section class="card">
        <h2>${level} 문법 실전 모의 · ${cfg().levels[level].examMinutes}분</h2>
        <table class="table"><thead><tr><th>형식</th><th class="num">출제</th><th class="num">실전 구성</th></tr></thead><tbody>${rows}</tbody></table>
        ${total < want ? `<p class="notice">${want}문항 중 ${total}문항만 출제 (문제 은행 부족)</p>` : ''}
        <ul class="dim small">
          <li>문항 사이를 자유롭게 오가고 답을 바꿀 수 있습니다. 시간이 끝나면 자동으로 제출합니다.</li>
          <li>문장 만들기는 조각을 눌러 순서대로 놓습니다. ★ 자리에 놓인 조각으로 채점합니다.</li>
          <li>실제 시험은 문법과 독해를 합쳐 시간을 재므로, 여기서는 문법 몫의 시간만 잡았습니다.</li>
        </ul>
        <div class="next-row"><button class="primary" data-act="begin" ${total ? '' : 'disabled'}>시작 <span class="kbd">Enter</span></button></div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); else if (e.key === 'Enter' && total) { e.preventDefault(); begin(level, parts, want); } } });
    $('[data-act="home"]').addEventListener('click', App.showHome);
    $('[data-act="begin"]').addEventListener('click', () => begin(level, parts, want));
  }

  // 문항 하나의 답: bunpou 번호, narabe { placed }, bunshou 빈칸별 배열
  const emptyAnswer = (q) => (q.type === 'bunshou' ? new Array(q.items.length).fill(0) : q.type === 'narabe' ? [0, 0, 0, 0] : 0);
  const chosenOf = (q, a) => (q.type === 'narabe' ? a[QV().starIndex(q)] : a);
  const answeredUnits = (q, a) => (q.type === 'bunshou' ? a.filter(Boolean).length : q.type === 'narabe' ? (a.includes(0) ? 0 : 1) : (a ? 1 : 0));

  function begin(level, parts, want) {
    const list = parts.flatMap((p) => p.items);
    const answers = list.map(emptyAnswer);
    // 번호: 문항마다 시작 번호 (bunshou는 빈칸 수만큼)
    const firstNo = [];
    list.reduce((no, q, i) => { firstNo[i] = no; return no + Grammar.itemCount(q); }, 1);
    const t0 = Util.now();
    const limit = cfg().levels[level].examMinutes * 60 * 1000;
    let idx = 0;
    let timer = 0;
    let finished = false;
    let arr = null;

    App.setScreen(`
      <div class="topbar exam-top">
        <button class="link" data-act="abort">← 그만두기</button>
        <span class="crumb">${level} · 문법 · 실전 모의</span>
        <span class="timer" data-el="timer"></span>
        <button class="primary" data-act="submit">제출</button>
      </div>
      <nav class="qnav" data-el="nav"></nav>
      <section class="card vq gq exam-q" data-el="q"></section>
      <section class="gitems" data-el="items"></section>
      <div class="next-row">
        <button class="secondary" data-act="prev">← 이전</button>
        <button class="secondary" data-act="next">다음 →</button>
      </div>
    `, { onKey, onLeave: () => { clearInterval(timer); document.body.classList.remove('exam-mode'); } });

    document.body.classList.add('exam-mode');
    QV().applyPrefs();
    $('[data-act="abort"]').addEventListener('click', () => { if (window.confirm('실전 모의를 그만둘까요? 기록은 남지 않습니다.')) showStart(level); });
    $('[data-act="submit"]').addEventListener('click', () => {
      const units = list.reduce((s, q) => s + Grammar.itemCount(q), 0);
      const left = units - list.reduce((s, q, i) => s + answeredUnits(q, answers[i]), 0);
      if (left && !window.confirm(`안 푼 문항이 ${left}개 있습니다. 제출할까요?`)) return;
      submit(false);
    });
    $('[data-act="prev"]').addEventListener('click', () => go(idx - 1));
    $('[data-act="next"]').addEventListener('click', () => go(idx + 1));

    function renderNav() {
      let html = '';
      let lastType = null;
      list.forEach((q, i) => {
        if (q.type !== lastType) {
          html += `<span class="qnav-type" lang="ja">${cfg().types[q.type].label_ja}</span>`;
          lastType = q.type;
        }
        const n = Grammar.itemCount(q);
        const label = n > 1 ? `${firstNo[i]}–${firstNo[i] + n - 1}` : `${firstNo[i]}`;
        const done = answeredUnits(q, answers[i]) === n;
        html += `<button class="qnav-btn ${n > 1 ? 'wide' : ''} ${done ? 'answered' : 'unanswered'} ${i === idx ? 'current' : ''}" data-go="${i}">${label}</button>`;
      });
      $('[data-el="nav"]').innerHTML = html;
      $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
    }

    function renderQ() {
      const q = list[idx];
      const a = answers[idx];
      const n = Grammar.itemCount(q);
      $('[data-el="q"]').dataset.qid = q.id;
      $('[data-el="q"]').innerHTML = `
        ${QV().headHtml(q)}
        <p class="qno">${n > 1 ? `${firstNo[idx]}–${firstNo[idx] + n - 1}` : firstNo[idx]}.</p>
        ${QV().bodyHtml(q)}
        ${q.type === 'narabe' ? '<div class="chips" data-el="chips"></div>' : ''}
        ${q.type === 'bunpou' ? `<section class="options" data-el="options">${QV().optionsHtml(q.options, q.answer, null, { chosen: a })}</section>` : ''}`;
      $('[data-el="items"]').innerHTML = q.type === 'bunshou' ? QV().itemsHtml(q, a, { graded: false }) : '';
      if (q.type === 'bunpou') $$('[data-el="options"] .opt').forEach((b) => b.addEventListener('click', () => chooseBunpou(Number(b.dataset.n))));
      if (q.type === 'narabe') arr = QV().arrange($('[data-el="q"]'), q, a, { onChange: () => renderNav() });
      if (q.type === 'bunshou') {
        QV().fillGaps(q, a, false);
        $$('[data-el="items"] .opt').forEach((b) => b.addEventListener('click', () => chooseItem(Number(b.dataset.item), Number(b.dataset.n))));
      }
      $('[data-act="prev"]').disabled = idx === 0;
      $('[data-act="next"]').disabled = idx === list.length - 1;
    }

    function go(i) {
      if (i < 0 || i >= list.length) return;
      idx = i;
      renderNav();
      renderQ();
      window.scrollTo(0, 0);
    }
    function chooseBunpou(n) {
      answers[idx] = n;
      renderNav();
      renderQ();
    }
    function chooseItem(i, n) {
      answers[idx][i] = n;
      renderNav();
      const y = window.scrollY;
      renderQ();
      window.scrollTo(0, y);
    }

    function tick() {
      const left = limit - (Util.now() - t0);
      const el = $('[data-el="timer"]');
      if (el) {
        el.textContent = `남은 시간 ${Util.fmtTime(Math.max(0, left) / 1000)}`;
        el.classList.toggle('warn', left < 60 * 1000);
      }
      if (left <= 0) submit(true);
    }

    function submit(timedOut) {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      const seconds = Math.min(limit, Util.now() - t0) / 1000;
      const byType = {};
      let total = 0;
      let correct = 0;
      const recAnswers = list.map((q, i) => {
        const a = answers[i];
        const b = byType[q.type] = byType[q.type] || { total: 0, correct: 0 };
        if (q.type === 'bunshou') {
          const marks = q.items.map((it, k) => a[k] === it.answer);
          marks.forEach((m, k) => Grammar.recordAnswer(q, k, m));
          b.total += marks.length;
          b.correct += marks.filter(Boolean).length;
          total += marks.length;
          correct += marks.filter(Boolean).length;
          return { id: q.id, chosen: a.slice(), correct: marks };
        }
        const c = chosenOf(q, a);
        const ok = c === q.answer;
        Grammar.recordAnswer(q, null, ok);
        b.total += 1;
        b.correct += ok ? 1 : 0;
        total += 1;
        correct += ok ? 1 : 0;
        return q.type === 'narabe' ? { id: q.id, chosen: c, placed: a.slice(), correct: ok } : { id: q.id, chosen: c, correct: ok };
      });
      const rec = {
        at: new Date(Util.now()).toISOString(), level, total, correct,
        full: total === want, seconds: Math.round(seconds), timedOut, byType, answers: recAnswers,
      };
      Storage.addExam(Grammar.SECTION, rec);
      showResult(level, list, rec);
    }

    function onKey(e) {
      const q = list[idx];
      if (/^[1-4]$/.test(e.key)) {
        const n = Number(e.key);
        if (q.type === 'bunpou') chooseBunpou(n);
        else if (q.type === 'narabe') arr.place(n);
        else { const i = answers[idx].indexOf(0); if (i >= 0) chooseItem(i, n); }
      } else if (e.key === 'Backspace' && q.type === 'narabe') { e.preventDefault(); arr.removeLast(); }
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(idx + 1); }
    }

    renderNav();
    renderQ();
    tick();
    timer = setInterval(tick, 250);
  }

  function showResult(level, list, rec) {
    const rows = Grammar.levelTypes(level).filter((t) => rec.byType[t]).map((t) => {
      const b = rec.byType[t];
      return `<tr><td><span lang="ja">${cfg().types[t].label_ja}</span> <span class="dim">${cfg().types[t].label_ko}</span></td>
        <td class="num">${b.correct} / ${b.total}</td><td class="num">${Math.round((b.correct / b.total) * 100)}%</td></tr>`;
    }).join('');
    const items = list.map((q, i) => {
      const a = rec.answers[i];
      const ok = Array.isArray(a.correct) ? a.correct.every(Boolean) : a.correct;
      const sub = Array.isArray(a.correct) ? `${a.correct.filter(Boolean).length} / ${a.correct.length}` : a.chosen ? `${a.chosen}번` : '무응답';
      return `<li class="${ok ? 'ok' : 'ng'}"><button class="link" data-review="${i}">
        <span class="mark">${ok ? '○' : '×'}</span> ${i + 1}. <span lang="ja">${Util.esc(GrammarPractice.preview(q))}</span>
        <span class="dim small">${sub}</span></button></li>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문법 · 실전 모의 결과</span>
      </div>
      <section class="card score-card gexam-result">
        <div class="score-big"><span data-el="score">${rec.correct}</span> / ${rec.total}</div>
        <p class="score-sub">${rec.correct} / ${rec.total} 정답 · ${Math.round((rec.correct / rec.total) * 100)}% · 걸린 시간 <span data-el="elapsed">${Util.fmtTime(rec.seconds)}</span>${rec.timedOut ? ' (시간 종료로 자동 제출)' : ''}</p>
        <p class="dim small">문법은 실제 시험에서 문자·어휘와 합쳐 「언어지식」 점수가 됩니다. 지금은 정답률만 보여 줍니다.</p>
        <table class="table"><thead><tr><th>형식</th><th class="num">정답</th><th class="num">정답률</th></tr></thead><tbody>${rows}</tbody></table>
      </section>
      <section class="card">
        <h3>문항별 해설</h3>
        <ol class="exam-list plain">${items}</ol>
        ${rec.correct < rec.total ? '<p class="dim small">틀린 문항은 오답노트에, 그 문형은 약한 문형에 들어갔습니다.</p>' : ''}
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    document.body.classList.remove('exam-mode');
    $('[data-act="home"]').addEventListener('click', App.showHome);
    $$('[data-review]').forEach((b) => b.addEventListener('click', () => showReviewAt(level, list, rec, Number(b.dataset.review))));
  }

  function showReviewAt(level, list, rec, i) {
    const a = rec.answers[i];
    GrammarQuestionView.show(list[i], {
      crumb: `${level} · 실전 모의 해설`, pos: `${i + 1} / ${list.length}`, backLabel: '← 결과',
      onBack: () => showResult(level, list, rec),
      answered: Array.isArray(a.chosen) ? a.chosen : a.chosen || 0,
      blankLabel: '무응답',
      nextLabel: i < list.length - 1 ? '다음 문항 해설' : '결과로',
      onNext: () => (i < list.length - 1 ? showReviewAt(level, list, rec, i + 1) : showResult(level, list, rec)),
    });
  }

  return { showStart, compose, conflict };
})();
