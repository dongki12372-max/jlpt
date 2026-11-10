// ============================================================
// 오늘의 학습: 레벨마다 하루 분량을 정해 단어장·청해·문자어휘·문형·문법을 골고루 하게 한다 (홈의 레벨 탭 아래 카드)
//   분량: 문제는 영역별 문항 수, 문형은 퀴즈로 볼 문형 수 (settings.daily[레벨], 기본값 config.daily.questions, 0 = 빼기),
//         단어장은 그날의 복습 + 새 카드 (settings.daily[레벨].words = false면 빼기)
//   진도는 따로 적지 않고 기록에서 센다 — 오늘(새벽 4시부터) 푼 그 레벨 문항 수. 유형별 연습·오답노트에서 푼 것도 들어간다.
//         문형은 오늘 퀴즈로 본 문형 수 (문형 기록의 quizAt).
//   복습은 분량 안에서 저절로 된다 — 고를 때(pick) 오늘 복습할 오답노트 문항(Util.isDue, 분량의 reviewShare까지)이 먼저,
//         그다음 유형마다 고르게 안 푼 문항 → 오래전에 푼 문항. 복습 날이 아직 안 된 오답노트 문항은 맨 뒤, 오늘 푼 문항은 다시 내지 않는다.
//         문형(pickPoints)도 오늘 복습할 약한 문형 → 처음 보는 문형 → 퀴즈로 본 지 오래된 문형.
//   분량을 다 채운 날은 sections.plan.studyDays에 '{날짜} {레벨}'로 남긴다 (기기 간 합집합) → 연속 일수·최근 날 점
// ============================================================
const Daily = (() => {
  const cfg = window.APP_CONFIG.daily;
  const sections = window.APP_CONFIG.sections;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // 단계: 단어장 + 문제 영역 (config.sectionOrder 순서), 문형 퀴즈는 문법 문제 앞
  const QUESTION_PARTS = {
    listening: { mod: () => Listening, run: (o) => Practice.run(o) },
    vocab: { mod: () => Vocab, run: (o) => VocabPractice.run(o) },
    grammar: { mod: () => Grammar, run: (o) => GrammarPractice.run(o) },
  };
  const PARTS = ['words', ...window.APP_CONFIG.sectionOrder.filter((id) => id in QUESTION_PARTS).flatMap((id) => (id === 'grammar' ? ['points', id] : [id]))];
  const label = (part) => (part === 'words' ? '단어장' : part === 'points' ? '문형' : sections[part].label_ko);
  const available = (part, level) => {
    if (part === 'words') return !!sections.vocab.enabled && Vocab.words(level).length > 0;
    if (part === 'points') return !!sections.grammar.enabled && Grammar.points(level).length > 0;
    return !!sections[part].enabled && QUESTION_PARTS[part].mod().questions(level).length > 0;
  };

  // ---------- 분량 (레벨마다) ----------
  const saved = (level) => Storage.getSetting('daily', level, {});
  const amounts = (level) => ({ words: true, ...cfg.questions, ...saved(level) });
  const setAmount = (level, part, v) => Storage.setSetting('daily', level, { ...saved(level), [part]: v });
  const planned = (part, level) => available(part, level) && (part === 'words' ? amounts(level).words !== false : amounts(level)[part] > 0);

  // ---------- 오늘 진도 ----------
  const answeredToday = (mod, q, start) => Util.stamp(mod.record(q)) >= start;
  const pointRec = (p) => Grammar.pointRecord(p.key);
  const quizAt = (p) => (pointRec(p) || {}).quizAt || 0;   // 그 문형을 퀴즈로 마지막에 본 시각
  // 남은 분량 중 복습으로 나올 수 → 「복습 N」
  const reviewNote = (left, due) => (Math.min(left, due) ? `복습 ${Math.min(left, due)}` : '');

  // { part, done, total, left, complete, unit, note } — 단어장은 카드 장수, 문제는 문항 수, 문형은 개수
  function partState(part, level, now) {
    const start = Srs.dayStart(now);
    if (part === 'points') {
      const rest = Grammar.points(level).filter((p) => quizAt(p) < start);
      const all = Grammar.points(level).length;
      const total = Math.min(amounts(level).points, all);
      const n = all - rest.length;
      const left = Math.max(0, total - n);
      const due = rest.filter((p) => Util.isDue(pointRec(p), now)).length;
      return { part, done: Math.min(n, total), total, left, complete: n >= total, unit: '개', note: reviewNote(left, due) };
    }
    if (part === 'words') {
      const c = Vocab.todayCounts(level, now);
      const left = c.review + c.learning + c.fresh;
      const end = Srs.addDays(start, 1);
      // 오늘 보고 내일 이후로 넘어간 카드
      const done = Vocab.scopeWords(level).flatMap(Vocab.cardIds).map(Vocab.card).filter((x) => x && x.at >= start && x.due >= end).length;
      const note = left ? `복습 ${c.review + c.learning} · 새 카드 ${c.fresh}` : done ? '' : '오늘 볼 카드 없음';
      return { part, done, total: done + left, left, complete: left === 0, unit: '장', note };
    }
    const mod = QUESTION_PARTS[part].mod();
    const qs = mod.questions(level);
    const total = Math.min(amounts(level)[part], qs.length);
    const rest = qs.filter((q) => !answeredToday(mod, q, start));
    const n = qs.length - rest.length;
    const left = Math.max(0, total - n);
    const due = Math.min(rest.filter((q) => Util.isDue(mod.record(q), now)).length, Math.floor(total * cfg.reviewShare));
    return { part, done: Math.min(n, total), total, left, complete: n >= total, unit: '문항', note: reviewNote(left, due) };
  }
  const plan = (level, now) => PARTS.filter((p) => planned(p, level)).map((p) => partState(p, level, now));

  // ---------- 문항 고르기 ----------
  // 오늘 안 푼 문항에서 n개. 유형별로 오늘 푼 수가 적은 유형부터 (같으면 안 푼 문항이 많이 남은 유형) 하나씩.
  function pick(part, level, n, now = Util.now()) {
    const start = Srs.dayStart(now);
    const mod = QUESTION_PARTS[part].mod();
    const types = mod.levelTypes(level);
    const rec = (q) => mod.record(q);
    const queue = {};
    const count = {};
    for (const t of types) {
      const ofType = mod.questions(level).filter((q) => q.type === t);
      const rest = ofType.filter((q) => !answeredToday(mod, q, start));
      count[t] = ofType.length - rest.length;
      // 안 푼 문항(문제 은행 순서) → 푼 지 오래된 문항 → 복습 날이 아직 안 된 오답노트 문항 (그날 다시 나온다)
      const waiting = (q) => ((rec(q) || {}).review && !Util.isDue(rec(q), now) ? 1 : 0);
      queue[t] = rest.map((q, i) => ({ q, i }))
        .sort((a, b) => waiting(a.q) - waiting(b.q) || Util.stamp(rec(a.q)) - Util.stamp(rec(b.q)) || a.i - b.i).map((x) => x.q);
    }
    const out = [];
    const take = (q) => { queue[q.type] = queue[q.type].filter((x) => x !== q); count[q.type] += 1; out.push(q); };

    // 오늘 복습할 오답노트 문항 먼저 (복습 날이 오래 지난 것부터, 분량의 reviewShare까지)
    const due = types.flatMap((t) => queue[t]).filter((q) => Util.isDue(rec(q), now))
      .sort((a, b) => (rec(a).due || 0) - (rec(b).due || 0) || Util.stamp(rec(a)) - Util.stamp(rec(b)));
    due.slice(0, Math.floor(n * cfg.reviewShare)).forEach(take);

    const unsolved = (t) => queue[t].filter((q) => !rec(q)).length;
    while (out.length < n) {
      const t = types.filter((x) => queue[x].length).sort((a, b) => count[a] - count[b] || unsolved(b) - unsolved(a) || types.indexOf(a) - types.indexOf(b))[0];
      if (!t) break;
      take(queue[t][0]);
    }
    // 푸는 순서는 실전처럼 유형 순서대로
    return out.map((q, i) => ({ q, i })).sort((a, b) => types.indexOf(a.q.type) - types.indexOf(b.q.type) || a.i - b.i).map((x) => x.q);
  }
  // 오늘 퀴즈로 안 본 문형에서 n개: 오늘 복습할 약한 문형(복습 날이 오래 지난 것부터) → 기록 없는 문형(문형 사전 순서)
  //   → 퀴즈로 본 지 오래된 문형 → 복습 날이 아직 안 된 약한 문형
  function pickPoints(level, n, now = Util.now()) {
    const start = Srs.dayStart(now);
    const rank = (p) => { const r = pointRec(p); return Util.isDue(r, now) ? 0 : !r ? 1 : r.review ? 3 : 2; };
    return Grammar.points(level).filter((p) => quizAt(p) < start).map((p, i) => ({ p, i, k: rank(p) }))
      .sort((a, b) => a.k - b.k || (a.k === 0 ? (pointRec(a.p).due || 0) - (pointRec(b.p).due || 0) : quizAt(a.p) - quizAt(b.p)) || a.i - b.i)
      .slice(0, n).map((x) => x.p);
  }

  // ---------- 다 채운 날 ----------
  function store() {
    const s = Storage.section('plan');
    s.studyDays = s.studyDays || [];
    return s;
  }
  const dayId = (level, t) => `${Srs.dayKey(t)} ${level}`;
  const doneOn = (level, t) => store().studyDays.includes(dayId(level, t));
  function markDone(level, now) {
    if (doneOn(level, now)) return;
    store().studyDays.push(dayId(level, now));
    Storage.save();
  }
  function check(level, now = Util.now()) {
    const parts = plan(level, now);
    if (parts.length && parts.every((s) => s.complete)) markDone(level, now);
  }
  // 마지막 문항을 풀고 홈으로 돌아오지 않은 채 닫아도 남도록, 기록이 저장될 때마다 지금 레벨을 다 채웠는지 본다
  let ready = false;     // 영역 데이터를 다 읽은 뒤(첫 홈 화면)부터
  let pending = false;
  Storage.onSave(() => {
    if (!ready || pending) return;
    pending = true;
    setTimeout(() => { pending = false; check(App.state.level); }, 0);
  });
  // 연속 일수 (오늘 아직 못 채웠으면 어제까지 이어진 날 수)
  function streak(level, now) {
    let t = Srs.dayStart(now);
    if (!doneOn(level, t)) t = Srs.addDays(t, -1);
    let n = 0;
    while (doneOn(level, t)) { n += 1; t = Srs.addDays(t, -1); }
    return n;
  }

  // ---------- 시작 ----------
  const amountText = (s) => `${label(s.part)} ${s.left}${s.unit}`;
  // 한 단계를 연다. 끝난 화면에는 그다음 남은 단계로 가는 버튼을 붙인다.
  function start(part, level) {
    const now = Util.now();
    const st = partState(part, level, now);
    const after = plan(level, now).filter((s) => !s.complete && PARTS.indexOf(s.part) > PARTS.indexOf(part))[0];
    const next = after ? { label: `다음 · ${amountText(after)}`, go: () => start(after.part, level) } : null;
    if (part === 'words') {
      if (st.left) Deck.study(level, { back: App.showHome, backLabel: '← 홈', next });
      return;
    }
    if (part === 'points') {
      const points = pickPoints(level, st.left, now);
      if (points.length) GrammarQuiz.run(level, points, null, { title: '오늘의 학습 · 문형', back: App.showHome, backLabel: '← 홈', next });
      return;
    }
    const list = pick(part, level, st.left, now);
    if (!list.length) return;
    QUESTION_PARTS[part].run({
      level, list, title: `오늘의 학습 · ${label(part)}`, back: App.showHome, backLabel: '← 홈',
      again: next ? next.go : null, againLabel: next ? next.label : undefined,
    });
  }

  // ---------- 홈 카드 ----------
  function homeHtml(level) {
    const now = Util.now();
    ready = true;
    check(level, now);
    const parts = plan(level, now);
    if (!parts.length) {
      return `
        <section class="card daily" data-el="daily">
          <div class="daily-head"><h2>오늘의 학습 <span class="dim">${level}</span></h2></div>
          <p class="dim">${level} 하루 분량이 정해져 있지 않습니다. <button class="link" data-act="daily-setup">분량 정하기</button></p>
        </section>`;
    }
    const all = parts.every((s) => s.complete);
    const first = parts.find((s) => !s.complete);
    const started = parts.some((s) => s.done > 0);
    const today = Srs.dayStart(now);
    const dots = Array.from({ length: cfg.weekDays }, (_, i) => Srs.addDays(today, i - cfg.weekDays + 1))
      .map((t) => `<span class="day-dot ${doneOn(level, t) ? 'on' : ''} ${t === today ? 'today' : ''}" title="${Srs.dayKey(t)}"></span>`).join('');
    const rows = parts.map((s) => `
      <li>
        <button class="daily-part ${s.complete ? 'done' : ''}" data-daily="${s.part}" ${s.complete ? 'disabled' : ''}>
          <span class="mark">${s.complete ? '✓' : ''}</span>
          <span class="name">${Util.esc(label(s.part))}</span>
          <span class="note dim small">${s.note}</span>
          <span class="count" data-el="daily-count">${s.done} / ${s.total}${s.unit === '문항' ? '' : s.unit}</span>
        </button>
      </li>`).join('');
    return `
      <section class="card daily ${all ? 'complete' : ''}" data-el="daily">
        <div class="daily-head">
          <h2>오늘의 학습 <span class="dim">${level}</span></h2>
          <span class="daily-week" aria-label="최근 ${cfg.weekDays}일">${dots}</span>
          <span class="daily-streak">연속 <strong data-el="daily-streak">${streak(level, now)}</strong>일</span>
        </div>
        <ul class="daily-parts">${rows}</ul>
        <div class="next-row left">
          ${all ? '<span class="daily-done" data-el="daily-done">오늘 분량을 모두 마쳤습니다</span>'
    : `<button class="primary" data-act="daily-next">${started ? '이어서' : '시작'} · ${amountText(first)}</button>`}
          <button class="link" data-act="daily-setup">분량 바꾸기</button>
        </div>
      </section>`;
  }
  function bindHome(root, level) {
    const box = root.querySelector('[data-el="daily"]');
    if (!box) return;
    box.querySelectorAll('[data-daily]:not(:disabled)').forEach((b) => b.addEventListener('click', () => start(b.dataset.daily, level)));
    const next = box.querySelector('[data-act="daily-next"]');
    if (next) next.addEventListener('click', () => start(plan(level, Util.now()).find((s) => !s.complete).part, level));
    box.querySelector('[data-act="daily-setup"]').addEventListener('click', () => showSetup(level));
  }

  // ---------- 분량 바꾸기 (레벨마다) ----------
  function showSetup(level) {
    const a = amounts(level);
    const rows = PARTS.filter((p) => available(p, level)).map((p) => {
      if (p === 'words') {
        return `
          <label class="row">
            <span>단어장 <span class="dim small">오늘 복습 + 새 카드 ${Vocab.prefs.newPerDay}장</span></span>
            <select data-amount="words">
              <option value="1" ${a.words !== false ? 'selected' : ''}>하기</option>
              <option value="0" ${a.words === false ? 'selected' : ''}>빼기</option>
            </select>
          </label>`;
      }
      const isPoints = p === 'points';
      const max = isPoints ? Grammar.points(level).length : QUESTION_PARTS[p].mod().questions(level).length;
      const opts = [...new Set([...cfg.questionOptions, a[p]])].sort((x, y) => x - y);
      return `
        <label class="row">
          <span>${Util.esc(label(p))} <span class="dim small">${isPoints ? `퀴즈 · 문형 ${max}개 중` : `문제 ${max}개 중`}</span></span>
          <select data-amount="${p}">
            ${opts.map((n) => `<option value="${n}" ${n === a[p] ? 'selected' : ''}>${n ? `${n}${isPoints ? '개' : '문항'}` : '빼기'}</option>`).join('')}
          </select>
        </label>`;
    }).join('');

    App.setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">${level} · 하루 분량</span>
      </div>
      <section class="card settings" data-el="daily-setup">
        <h2>${level} 하루 분량</h2>
        ${rows}
        <p class="dim small saved" data-el="saved"></p>
      </section>
      <p class="dim small">분량은 레벨마다 따로 정합니다. 복습은 이 분량 안에서 저절로 됩니다 — 틀린 문항과 문형은 ${window.APP_CONFIG.reviewIntervalsDays.join('일 → ')}일 뒤에 다시 나오고,
        그날 복습할 것이 먼저, 남은 자리에 안 푼 문항 → 오래전에 푼 문항이 유형마다 고르게 나옵니다. 틀린 문항의 단어는 단어장 복습에 들어갑니다.</p>
      <p class="dim small">유형별 연습이나 오답노트에서 푼 문항도 오늘 분량에 들어갑니다. 하루 새 카드 수(레벨마다 따로 셉니다)는 설정 → 문자·어휘에서 바꿉니다.</p>
    `, { onKey: (e) => { if (e.key === 'Escape') App.showHome(); } });

    $('[data-act="home"]').addEventListener('click', App.showHome);
    $$('[data-amount]').forEach((sel) => sel.addEventListener('change', () => {
      const p = sel.dataset.amount;
      setAmount(level, p, p === 'words' ? sel.value === '1' : Number(sel.value));
      $('[data-el="saved"]').textContent = '저장했습니다.';
    }));
  }

  return { PARTS, amounts, setAmount, plan, pick, pickPoints, streak, start, homeHtml, bindHome, showSetup };
})();
