// ============================================================
// 문자·어휘(文字・語彙) 영역: 데이터 접근, 단어 카드 대기열, 설정, 홈 화면의 모드·요약, App에 등록
//
//   기록 (progress.json sections.vocab):
//     cards:       { '{단어 key}#reading' | '{단어 key}#meaning': SRS 카드 (srs.js) }
//     daily:       { day: 'YYYY-MM-DD', newDone, byLevel: {N5: n} }   오늘 시작한 새 카드 수 (전체, 단어 레벨별)
//     studyDays:   ['YYYY-MM-DD', …]                 공부한 날 (연속 학습일)
//     priorityNew: ['단어 key', …]                    문제에서 틀린 새 단어 (새 카드 대기열 맨 앞)
//     items, exams: 문제 풀이 기록 (청해와 같은 형식)
//   기록의 기준은 단어 id가 아니라 key(단어|읽기)다 — 데이터의 id·순서가 바뀌어도 유지된다.
// ============================================================
const Vocab = (() => {
  const SECTION = 'vocab';
  const cfg = window.APP_CONFIG.sections[SECTION];
  const LEVELS = Object.keys(window.APP_CONFIG.levels);   // N5, N4, N3 (쉬운 순)
  let data = null;    // { words: {n5: […]}, questions: {n5: […]}, manifest }
  let byKey = new Map();

  const prefs = {
    get furigana() { return Storage.getSetting('common', 'furigana', true); },
    set furigana(v) { Storage.setSetting('common', 'furigana', !!v); },
    get newPerDay() { return Storage.getSetting(SECTION, 'newPerDay', cfg.srs.newPerDay); },
    set newPerDay(v) { Storage.setSetting(SECTION, 'newPerDay', v); },
    // 학습 범위: 'level' 한 레벨만 / 'cumulative' 아래 레벨까지
    get scope() { return Storage.getSetting(SECTION, 'scope', 'level'); },
    set scope(v) { Storage.setSetting(SECTION, 'scope', v); },
    get order() { return Storage.getSetting(SECTION, 'order', 'resume'); },
    set order(v) { Storage.setSetting(SECTION, 'order', v); },
    get unsolvedFirst() { return Storage.getSetting(SECTION, 'unsolvedFirst', true); },
    set unsolvedFirst(v) { Storage.setSetting(SECTION, 'unsolvedFirst', !!v); },
  };

  async function load() {
    data = await window.jlpt.loadSection(SECTION);
    byKey = new Map();
    for (const lv of LEVELS) for (const w of words(lv)) byKey.set(w.key, w);
  }

  // ---------- 데이터 ----------
  const words = (level) => (data && data.words[level.toLowerCase()]) || [];
  const word = (key) => byKey.get(key) || null;
  const scopeLevels = (level, scope = prefs.scope) =>
    (scope === 'cumulative' ? LEVELS.slice(0, LEVELS.indexOf(level) + 1) : [level]);
  const scopeWords = (level, scope) => scopeLevels(level, scope).flatMap(words);
  const hasKanji = (s) => /[一-龯々〆ヵヶ]/.test(s);
  const audioUrl = (kind, id) => `../../audio/${SECTION}/${kind}/${id}.mp3`;
  const wordAudio = (w) => audioUrl('words', w.id);
  const exampleAudio = (w) => audioUrl('examples', w.id);
  const hasAudio = (kind, id) => !!(data.manifest && data.manifest[`${kind}/${id}`]);

  // ---------- 카드 ----------
  // 가나로만 쓰는 단어는 뜻 카드 한 장, 나머지는 뜻 카드 + 읽기 카드
  const cardIds = (w) => (hasKanji(w.word) ? [`${w.key}#meaning`, `${w.key}#reading`] : [`${w.key}#meaning`]);
  const splitCard = (id) => { const i = id.lastIndexOf('#'); return { key: id.slice(0, i), kind: id.slice(i + 1) }; };

  function store() {
    const s = Storage.section(SECTION);
    s.cards = s.cards || {};
    s.studyDays = s.studyDays || [];
    s.priorityNew = s.priorityNew || [];
    s.daily = s.daily || { day: '', newDone: 0 };
    return s;
  }
  const card = (id) => store().cards[id] || null;

  // 하루 새 카드 수는 레벨마다 따로 센다 (단어의 레벨 기준, 누적 범위면 범위 안 레벨을 합쳐서) — 오늘의 학습이 레벨별이라
  function newDoneToday(level, now) {
    const d = store().daily;
    if (d.day !== Srs.dayKey(now)) return 0;
    if (!d.byLevel) return d.newDone;   // 레벨별로 세기 전에 남긴 오늘 기록
    return scopeLevels(level).reduce((n, lv) => n + (d.byLevel[lv] || 0), 0);
  }
  const newRemaining = (level, now) => Math.max(0, prefs.newPerDay - newDoneToday(level, now));

  // 새 카드 후보 (순서대로). 읽기 카드는 같은 단어의 뜻 카드를 전날까지 시작했을 때만 (같은 날 둘 다 나오지 않게)
  function newCandidates(level, now) {
    const today = Srs.dayKey(now);
    const s = store();
    const scope = scopeWords(level);
    const inScope = new Set(scope.map((w) => w.key));
    const ordered = [...s.priorityNew.filter((k) => inScope.has(k)).map(word).filter(Boolean),
      ...scope.filter((w) => !s.priorityNew.includes(w.key))];
    const out = [];
    for (const w of ordered) {
      const [m, r] = cardIds(w);
      if (!s.cards[m]) out.push(m);
      else if (r && !s.cards[r] && s.cards[m].introduced && s.cards[m].introduced < today) out.push(r);
    }
    return out;
  }

  // 학습 중·복습 카드 중 시각 t까지 예정된 것
  function dueCards(level, t) {
    const s = store();
    const out = [];
    for (const w of scopeWords(level)) {
      for (const id of cardIds(w)) {
        const c = s.cards[id];
        if (c && c.due <= t) out.push({ id, c });
      }
    }
    return out.sort((a, b) => a.c.due - b.c.due);
  }

  // 다음에 보여 줄 카드: 예정된 학습 단계 → 예정된 복습 → 새 카드 → (앞당겨) 곧 올 학습 단계
  function nextCard(level, now) {
    const due = dueCards(level, now);
    const learning = due.find((x) => x.c.state !== 'review');
    if (learning) return { id: learning.id, isNew: false };
    if (due.length) return { id: due[0].id, isNew: false };
    if (newRemaining(level, now) > 0) {
      const n = newCandidates(level, now)[0];
      if (n) return { id: n, isNew: true };
    }
    const ahead = dueCards(level, now + cfg.srs.learnAheadMinutes * Srs.MIN).find((x) => x.c.state !== 'review');
    if (ahead) return { id: ahead.id, isNew: false };
    return null;
  }

  // 오늘 남은 카드 수 (홈·학습 화면 표시)
  function todayCounts(level, now) {
    const end = Srs.addDays(Srs.dayStart(now), 1);
    const due = dueCards(level, end - 1);
    return {
      learning: due.filter((x) => x.c.state !== 'review').length,
      review: due.filter((x) => x.c.state === 'review').length,
      fresh: Math.min(newRemaining(level, now), newCandidates(level, now).length),
    };
  }

  function answerCard(id, rating, now) {
    const s = store();
    const prev = s.cards[id] || null;
    s.cards[id] = Srs.rate(prev, rating, now);
    const today = Srs.dayKey(now);
    if (!prev) {
      if (s.daily.day !== today) s.daily = { day: today, newDone: 0 };
      s.daily.newDone += 1;
      const w = word(splitCard(id).key);
      s.daily.byLevel = s.daily.byLevel || {};
      if (w) s.daily.byLevel[w.level] = (s.daily.byLevel[w.level] || 0) + 1;
      // 틀려서 앞당긴 단어는 카드를 모두 시작하면 대기열 앞에서 뺀다
      if (w && cardIds(w).every((c) => s.cards[c])) s.priorityNew = s.priorityNew.filter((k) => k !== w.key);
    }
    if (!s.studyDays.includes(today)) {
      s.studyDays.push(today);
      if (s.studyDays.length > 800) s.studyDays.splice(0, s.studyDays.length - 800);
    }
    Storage.save();
    return s.cards[id];
  }

  // 문제에서 틀린 단어 → 오늘 다시 볼 카드로. 시작한 카드는 지금 예정으로 당기고, 시작하지 않은 카드가 있으면 새 카드 맨 앞
  function pullWords(keys, now) {
    const s = store();
    for (const key of keys) {
      const w = word(key);
      if (!w) continue;
      let fresh = false;
      for (const id of cardIds(w)) {
        const c = s.cards[id];
        if (!c) fresh = true;
        else if (c.due > now) { c.due = now; c.at = now; }
      }
      if (fresh) s.priorityNew = [key, ...s.priorityNew.filter((k) => k !== key)];
    }
    Storage.save();
  }

  // 객관식 퀴즈 결과 → 단어장 (뜻·단어 고르기는 뜻 카드, 읽기 고르기는 읽기 카드)
  //   맞힘: 지금 예정인 카드 → 「알맞음」으로 복습 처리 / 새 카드 → 바로 복습 카드로 시작 (하루 새 카드 수에는 넣지 않음)
  //         / 아직 예정이 아닌 카드 → 그대로 (보기에서 고르기는 떠올리기보다 쉬워서 일찍 맞혀도 간격을 늘리지 않음)
  //   틀림: 시작한 카드 → 「다시」 / 새 카드 → 새 카드 대기열 맨 앞 (pullWords)
  //   단어별 퀴즈 기록은 store().quiz[key] = { n, right, last }
  //   반환: { effect: 'reviewed'|'introduced'|'kept'|'again'|'pulled', card }
  function quizAnswer(w, format, correct, now) {
    const s = store();
    s.quiz = s.quiz || {};
    const qr = s.quiz[w.key] = s.quiz[w.key] || { n: 0, right: 0 };
    qr.n += 1;
    if (correct) qr.right += 1;
    qr.last = !!correct;
    const id = format === 'reading' && hasKanji(w.word) ? `${w.key}#reading` : `${w.key}#meaning`;
    const c = s.cards[id];
    let effect;
    if (correct && !c) {
      s.cards[id] = Srs.introduce(now);
      if (cardIds(w).every((x) => s.cards[x])) s.priorityNew = s.priorityNew.filter((k) => k !== w.key);
      effect = 'introduced';
    } else if (correct && c.due <= now) {
      answerCard(id, 3, now);
      effect = 'reviewed';
    } else if (correct) {
      effect = 'kept';
    } else if (c) {
      answerCard(id, 1, now);
      effect = 'again';
    } else {
      pullWords([w.key], now);
      effect = 'pulled';
    }
    const today = Srs.dayKey(now);
    if (!s.studyDays.includes(today)) s.studyDays.push(today);
    Storage.save();
    return { effect, card: s.cards[id] || null };
  }
  const quizRecord = (w) => (store().quiz || {})[w.key] || null;

  // 단어 상태: new 새 단어 / learning 학습 중 / review 복습 / weak 약한 단어
  function wordState(w) {
    const cs = cardIds(w).map(card).filter(Boolean);
    if (!cs.length) return 'new';
    if (cs.some(Srs.isWeak)) return 'weak';
    if (cs.some((c) => c.state !== 'review')) return 'learning';
    return 'review';
  }
  const STATE_LABEL = { new: '새 단어', learning: '학습 중', review: '복습', weak: '약한 단어' };

  // 연속 학습일 (오늘 아직 안 했으면 어제까지 이어진 날 수)
  function streak(now) {
    const days = new Set(store().studyDays);
    let t = Srs.dayStart(now);
    if (!days.has(Srs.dayKey(t))) t = Srs.addDays(t, -1);
    let n = 0;
    while (days.has(Srs.dayKey(t))) { n += 1; t = Srs.addDays(t, -1); }
    return n;
  }

  // ---------- 문제 (Phase 12) ----------
  const questions = (level) => (data && data.questions[level.toLowerCase()]) || [];
  const levelTypes = (level) => cfg.typeOrder.filter((t) => t in cfg.levels[level].exam);
  const record = (q) => Storage.item(SECTION, q.id);
  const reviewList = (level) => questions(level).filter((q) => (record(q) || {}).review);
  const dueList = (level, now = Util.now()) => reviewList(level).filter((q) => Util.isDue(record(q), now));   // 오늘 복습할 오답노트 문항
  const exams = (level) => Storage.section(SECTION).exams.filter((e) => e.level === level);

  // ---------- 홈 ----------
  function modes(level) {
    const now = Util.now();
    const c = todayCounts(level, now);
    const hasQ = typeof VocabPractice !== 'undefined' && questions(level).length > 0;
    const nReview = reviewList(level).length;
    return [
      { id: 'deck', title: '단어장', desc: `오늘 복습 ${c.review + c.learning} · 새 카드 ${c.fresh}`, enabled: words(level).length > 0, open: () => Deck.showHome(level) },
      { id: 'practice', title: '유형별 연습', desc: hasQ ? '유형을 골라 풀고 바로 해설 확인' : '준비 중', enabled: hasQ, open: () => VocabPractice.showSetup(level) },
      { id: 'exam', title: '실전 모의', desc: hasQ ? `${cfg.levels[level].examMinutes}분 · 자유 이동·제출` : '준비 중', enabled: hasQ, open: () => VocabExam.showStart(level) },
      { id: 'review', title: '오답노트', desc: !hasQ ? '준비 중' : Util.reviewDesc(nReview, dueList(level, now).length), enabled: hasQ, open: () => VocabReview.show(level) },
    ];
  }

  function summary(level) {
    const now = Util.now();
    const rows = LEVELS.map((lv) => {
      const ws = words(lv);
      const learned = ws.filter((w) => wordState(w) !== 'new').length;
      const weak = ws.filter((w) => wordState(w) === 'weak').length;
      return `<tr class="${lv === level ? 'current' : ''}"><td>${lv}</td><td class="num">${learned} / ${ws.length}</td><td class="num">${weak}</td></tr>`;
    }).join('');
    const qs = questions(level);
    const qRows = qs.length ? levelTypes(level).map((t) => {
      const ofType = qs.filter((q) => q.type === t);
      const solved = ofType.filter((q) => record(q));
      const right = solved.filter((q) => record(q).lastCorrect).length;
      return `<tr><td><span lang="ja">${cfg.types[t].label_ja}</span> <span class="dim">${cfg.types[t].label_ko}</span></td>
        <td class="num">${solved.length ? `${Math.round((right / solved.length) * 100)}%` : '<span class="dim">—</span>'}</td>
        <td class="num">${solved.length} / ${ofType.length}</td><td class="num">${cfg.levels[level].exam[t]}</td></tr>`;
    }).join('') : '';
    const last = exams(level).slice(-1)[0];
    return `
      <section class="card">
        <h2>단어장</h2>
        <p>연속 학습 <strong data-el="streak">${streak(now)}</strong>일</p>
        <table class="table" data-el="vocab-summary">
          <thead><tr><th>레벨</th><th class="num">학습한 단어 / 전체</th><th class="num">약한 단어</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      ${qs.length ? `
      <section class="card">
        <h2>${level} 문자·어휘 문제</h2>
        <p class="last-exam">최근 실전 모의: ${last ? `<span data-el="last-exam">${last.correct} / ${last.total}</span> 정답 (${Math.round((last.correct / last.total) * 100)}%)` : '<span class="dim">아직 응시하지 않았습니다</span>'}</p>
        <table class="table" data-el="summary">
          <thead><tr><th>유형</th><th class="num">정답률</th><th class="num">푼 문항</th><th class="num">실전 구성</th></tr></thead>
          <tbody>${qRows}</tbody>
        </table>
      </section>` : ''}`;
  }

  // ---------- 설정 화면 항목 ----------
  const settings = {
    render() {
      return `
        <label class="row">
          <span>하루 새 카드 수 <span class="dim small">(레벨마다)</span></span>
          <select data-setting="newPerDay">
            ${cfg.srs.newPerDayOptions.map((n) => `<option value="${n}" ${n === prefs.newPerDay ? 'selected' : ''}>${n}장</option>`).join('')}
          </select>
        </label>
        <label class="row">
          <span>단어장 학습 범위</span>
          <select data-setting="scope">
            <option value="level" ${prefs.scope === 'level' ? 'selected' : ''}>고른 레벨만</option>
            <option value="cumulative" ${prefs.scope === 'cumulative' ? 'selected' : ''}>아래 레벨까지 누적</option>
          </select>
        </label>`;
    },
    bind(root, saved) {
      root.querySelector('[data-setting="newPerDay"]').addEventListener('change', (e) => { prefs.newPerDay = Number(e.target.value); saved(); });
      root.querySelector('[data-setting="scope"]').addEventListener('change', (e) => { prefs.scope = e.target.value; saved(); });
    },
  };

  App.registerSection(SECTION, { load, modes, summary, settings });

  return {
    SECTION, cfg, prefs, LEVELS, words, word, scopeLevels, scopeWords, hasKanji, wordAudio, exampleAudio, audioUrl, hasAudio,
    cardIds, splitCard, card, store, newCandidates, dueCards, nextCard, todayCounts, answerCard, pullWords, quizAnswer, quizRecord,
    wordState, STATE_LABEL, streak, newRemaining,
    questions, levelTypes, record, reviewList, dueList, exams,
    get data() { return data; },
  };
})();
