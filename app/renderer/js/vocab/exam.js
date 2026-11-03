// ============================================================
// 문자·어휘 · 실전 모의
//   config 구성대로 유형 순서로 무작위 출제 (서로 답을 알려 주는 문항은 같은 회에 넣지 않음), 전체 타이머(examMinutes). 문항 번호 목록으로 자유 이동, 답 바꾸기 가능.
//   「제출」 또는 시간 종료 시 자동 제출 → 결과(정답 수, 유형별 정답률, 걸린 시간) → 문항별 해설.
//   실전 중에는 후리가나를 끈 상태로 고정 (실제 시험지에는 후리가나가 거의 없다). 결과·해설에서는 설정을 따른다.
//   문제 은행이 부족하면 있는 만큼만 내고 「N문항 중 M문항만 출제」로 표시한다.
//   단축키: 1~4 답, ←/→ 이전·다음 문항, Enter 다음 문항
// ============================================================
const VocabExam = (() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const cfg = () => Vocab.cfg;

  // 한 회 안에서 서로 답을 알려 주는 문항은 함께 내지 않는다:
  //   같은 단어를 묻거나, 한 문항이 묻는 단어(표기·읽기)나 정답이 다른 문항의 화면 글자(문장·선택지)에 보이면 충돌
  const shown = (q) => [q.stem, q.word || '', ...q.options.map((o) => o.text)].join('\n');
  function reveals(q) {
    const out = [];
    for (const key of q.targets) {
      const w = Vocab.word(key);
      if (!w) continue;
      const word = w.word.replace(/^〜/, '');
      if (Vocab.hasKanji(word)) out.push(word);
      if (w.reading.length >= 2) out.push(w.reading);
    }
    const ans = q.options[q.answer - 1].text;
    if (ans.length >= 2) out.push(ans);
    return out;
  }
  const conflict = (a, b) => a.targets.some((t) => b.targets.includes(t))
    || reveals(a).some((x) => shown(b).includes(x)) || reveals(b).some((x) => shown(a).includes(x));

  // 무작위 구성을 몇 번 해 보고 충돌(서로 답을 알려 주는 쌍)이 가장 적은 것을 쓴다
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
    return Vocab.levelTypes(level).map((t) => {
      const pool = Util.shuffle(Vocab.questions(level).filter((q) => q.type === t));
      const items = [];
      for (const q of pool) {
        if (items.length >= exam[t]) break;
        if (!chosen.some((c) => conflict(c, q))) { items.push(q); chosen.push(q); }
      }
      // 충돌을 피해서는 수가 모자라면 남은 문항으로 채운다 (문제 은행이 작을 때)
      for (const q of pool) {
        if (items.length >= exam[t]) break;
        if (!items.includes(q)) { items.push(q); chosen.push(q); }
      }
      return { type: t, want: exam[t], items };
    });
  }

  function showStart(level) {
    const parts = compose(level);
    const want = parts.reduce((s, p) => s + p.want, 0);
    const total = parts.reduce((s, p) => s + p.items.length, 0);
    const rows = parts.map((p) => `<tr><td><span lang="ja">${cfg().types[p.type].label_ja}</span> <span class="dim">${cfg().types[p.type].label_ko}</span></td>
      <td class="num ${p.items.length < p.want ? 'warn' : ''}">${p.items.length}</td><td class="num">${p.want}</td></tr>`).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문자·어휘 · 실전 모의</span>
      </div>
      <section class="card">
        <h2>${level} 문자·어휘 실전 모의 · ${cfg().levels[level].examMinutes}분</h2>
        <table class="table"><thead><tr><th>유형</th><th class="num">출제</th><th class="num">실전 구성</th></tr></thead><tbody>${rows}</tbody></table>
        ${total < want ? `<p class="notice">${want}문항 중 ${total}문항만 출제 (문제 은행 부족)</p>` : ''}
        <ul class="dim small">
          <li>문항 사이를 자유롭게 오가고 답을 바꿀 수 있습니다. 시간이 끝나면 자동으로 제출합니다.</li>
          <li>실전 중에는 후리가나가 꺼집니다.</li>
        </ul>
        <div class="next-row"><button class="primary" data-act="begin" ${total ? '' : 'disabled'}>시작 <span class="kbd">Enter</span></button></div>
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); else if (e.key === 'Enter' && total) { e.preventDefault(); begin(level, parts, want); } } });
    $('[data-act="home"]').addEventListener('click', App.showHome);
    $('[data-act="begin"]').addEventListener('click', () => begin(level, parts, want));
  }

  function begin(level, parts, want) {
    const list = parts.flatMap((p) => p.items);
    const chosen = new Array(list.length).fill(0);
    const t0 = Util.now();
    const limit = cfg().levels[level].examMinutes * 60 * 1000;
    let idx = 0;
    let timer = 0;
    let finished = false;

    App.setScreen(`
      <div class="topbar exam-top">
        <button class="link" data-act="abort">← 그만두기</button>
        <span class="crumb">${level} · 문자·어휘 · 실전 모의</span>
        <span class="timer" data-el="timer"></span>
        <button class="primary" data-act="submit">제출</button>
      </div>
      <nav class="qnav" data-el="nav"></nav>
      <section class="card vq exam-q" data-el="q"></section>
      <div class="next-row">
        <button class="secondary" data-act="prev">← 이전</button>
        <button class="secondary" data-act="next">다음 →</button>
      </div>
    `, { onKey, onLeave: () => { clearInterval(timer); document.body.classList.remove('exam-mode'); } });

    document.body.classList.add('exam-mode', 'no-furigana');
    $('[data-act="abort"]').addEventListener('click', () => { if (window.confirm('실전 모의를 그만둘까요? 기록은 남지 않습니다.')) showStart(level); });
    $('[data-act="submit"]').addEventListener('click', () => {
      const left = chosen.filter((c) => !c).length;
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
        html += `<button class="qnav-btn ${chosen[i] ? 'answered' : 'unanswered'} ${i === idx ? 'current' : ''}" data-go="${i}">${i + 1}</button>`;
      });
      $('[data-el="nav"]').innerHTML = html;
      $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
    }

    function renderQ() {
      const q = list[idx];
      $('[data-el="q"]').innerHTML = `
        <p class="instruction" lang="ja"><span class="type-label">${cfg().types[q.type].label_ja}</span> ${Util.esc(VocabQuestionView.instruction(q.type))}</p>
        <p class="qno">${idx + 1}.</p>
        ${VocabQuestionView.stemHtml(q, { plain: true })}
        <section class="options ${q.type === 'youhou' ? 'sentences' : ''}" data-el="options" data-qid="${Util.esc(q.id)}">
          ${VocabQuestionView.optionsHtml(q, null, { plain: true, chosen: chosen[idx] })}
        </section>`;
      $$('[data-el="options"] .opt').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.n))));
      $('[data-act="prev"]').disabled = idx === 0;
      $('[data-act="next"]').disabled = idx === list.length - 1;
    }

    function go(i) {
      if (i < 0 || i >= list.length) return;
      idx = i;
      renderNav();
      renderQ();
    }

    function choose(n) {
      chosen[idx] = n;
      renderNav();
      renderQ();
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
      const answers = list.map((q, i) => ({ id: q.id, chosen: chosen[i], correct: chosen[i] === q.answer }));
      answers.forEach((a, i) => VocabPractice.record(list[i], a.correct));
      const byType = {};
      list.forEach((q, i) => {
        const b = byType[q.type] = byType[q.type] || { total: 0, correct: 0 };
        b.total += 1;
        if (answers[i].correct) b.correct += 1;
      });
      const rec = {
        at: new Date(Util.now()).toISOString(), level, total: list.length, correct: answers.filter((a) => a.correct).length,
        full: list.length === want, seconds: Math.round(seconds), timedOut, byType, answers,
      };
      Storage.addExam(Vocab.SECTION, rec);
      showResult(level, list, rec);
    }

    function onKey(e) {
      if (/^[1-4]$/.test(e.key)) choose(Number(e.key));
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(idx + 1); }
    }

    renderNav();
    renderQ();
    tick();
    timer = setInterval(tick, 250);
  }

  function showResult(level, list, rec) {
    const rows = Vocab.levelTypes(level).filter((t) => rec.byType[t]).map((t) => {
      const b = rec.byType[t];
      return `<tr><td><span lang="ja">${cfg().types[t].label_ja}</span> <span class="dim">${cfg().types[t].label_ko}</span></td>
        <td class="num">${b.correct} / ${b.total}</td><td class="num">${Math.round((b.correct / b.total) * 100)}%</td></tr>`;
    }).join('');
    const items = list.map((q, i) => {
      const a = rec.answers[i];
      return `<li class="${a.correct ? 'ok' : 'ng'}"><button class="link" data-review="${i}">
        <span class="mark">${a.correct ? '○' : '×'}</span> ${i + 1}. <span lang="ja">${Util.esc(q.type === 'youhou' ? q.word : q.stem.replace(/\[\[|\]\]/g, ''))}</span>
        <span class="dim small">${a.chosen ? `${a.chosen}번` : '무응답'}</span></button></li>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 문자·어휘 · 실전 모의 결과</span>
      </div>
      <section class="card score-card vexam-result">
        <div class="score-big"><span data-el="score">${rec.correct}</span> / ${rec.total}</div>
        <p class="score-sub">${rec.correct} / ${rec.total} 정답 · ${Math.round((rec.correct / rec.total) * 100)}% · 걸린 시간 <span data-el="elapsed">${Util.fmtTime(rec.seconds)}</span>${rec.timedOut ? ' (시간 종료로 자동 제출)' : ''}</p>
        <p class="dim small">문자·어휘는 실제 시험에서 문법과 합쳐 「언어지식」 점수가 됩니다. 지금은 정답률만 보여 줍니다.</p>
        <table class="table"><thead><tr><th>유형</th><th class="num">정답</th><th class="num">정답률</th></tr></thead><tbody>${rows}</tbody></table>
      </section>
      <section class="card">
        <h3>문항별 해설</h3>
        <ol class="exam-list plain">${items}</ol>
        ${rec.correct < rec.total ? '<p class="dim small">틀린 문항은 오답노트에, 그 단어는 단어장 오늘 복습에 들어갔습니다.</p>' : ''}
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    document.body.classList.remove('exam-mode');
    VocabQuestionView.applyFurigana();
    $('[data-act="home"]').addEventListener('click', App.showHome);
    $$('[data-review]').forEach((b) => b.addEventListener('click', () => showReviewAt(level, list, rec, Number(b.dataset.review))));
  }

  function showReviewAt(level, list, rec, i) {
    VocabQuestionView.show(list[i], {
      crumb: `${level} · 실전 모의 해설`, pos: `${i + 1} / ${list.length}`, backLabel: '← 결과',
      onBack: () => showResult(level, list, rec), answered: rec.answers[i].chosen,
      nextLabel: i < list.length - 1 ? '다음 문항 해설' : '결과로',
      onNext: () => (i < list.length - 1 ? showReviewAt(level, list, rec, i + 1) : showResult(level, list, rec)),
    });
  }

  return { showStart, compose, conflict };
})();
