// ============================================================
// 개발용 스모크 테스트 — 문자·어휘 영역 (단어장 SRS, 문제 연습·실전·오답노트, 청해 연동)
//   SMOKE_OUT=<출력 폴더> npx electron tools/smoke_vocab.js
//   SMOKE_PERSIST=write|read  : 앱을 껐다 켜도 카드 기록이 남는지 (같은 JLPT_USER_DATA로 두 번 실행)
// 가짜 시계(Util.setClockOffset)로 날짜를 앞당겨 복습 예정을 확인한다. 앱 코드는 건드리지 않는다.
// ============================================================
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = process.env.SMOKE_OUT || path.join(__dirname, '..', 'smoke-out');
fs.mkdirSync(OUT, { recursive: true });
if (!process.env.JLPT_USER_DATA) {
  process.env.JLPT_USER_DATA = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jlpt-smoke-vocab-'));
}
require('./test_host.js');

const consoleErrors = [];
const checks = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

app.on('browser-window-created', (_e, win) => {
  const wc = win.webContents;
  wc.on('console-message', (_ev, level, message, line, source) => {
    if (level < 2) return;
    consoleErrors.push(`${message} (${path.basename(source || '')}:${line})`);
  });
  wc.once('did-finish-load', () => {
    run(win).catch((e) => { check('스모크 테스트 실행', false, e.stack); }).finally(finish);
  });
});

function finish() {
  check('콘솔 오류·경고 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
  const failed = checks.filter((c) => !c.ok);
  fs.writeFileSync(path.join(OUT, 'result-vocab.json'), JSON.stringify({ checks, consoleErrors }, null, 2));
  console.log(`\n${checks.length - failed.length}/${checks.length} 통과 · 스크린샷: ${OUT}`);
  app.exit(failed.length ? 1 : 0);
}

async function run(win) {
  const wc = win.webContents;
  const js = (code) => Promise.race([
    wc.executeJavaScript(code),
    sleep(15000).then(() => { throw new Error(`executeJavaScript 15초 응답 없음: ${code.slice(0, 120)}`); }),
  ]);
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  const exists = (sel) => js(`!!document.querySelector(${JSON.stringify(sel)})`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const key = async (keyCode) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode });
    wc.sendInputEvent({ type: 'keyUp', keyCode });
    await sleep(150);
  };
  const shot = async (name) => { await sleep(400); fs.writeFileSync(path.join(OUT, `${name}.png`), (await wc.capturePage()).toPNG()); };
  const setClock = (ms) => js(`Util.setClockOffset(${ms}); true`);
  const h = { js, click, exists, text, key, shot, setClock, win };

  await sleep(800);

  if (process.env.SMOKE_PERSIST === 'write') {
    await js(`(() => { const w = Vocab.words('N5')[0]; Vocab.answerCard(w.key + '#meaning', 3, Util.now()); Vocab.answerCard(w.key + '#meaning', 4, Util.now()); return true; })()`);
    await sleep(800);
    check('카드 기록 쓰고 종료', (await js(`Vocab.card(Vocab.words('N5')[0].key + '#meaning').state`)) === 'review');
    return;
  }
  if (process.env.SMOKE_PERSIST === 'read') {
    const c = await js(`Vocab.card(Vocab.words('N5')[0].key + '#meaning')`);
    check('앱을 다시 켜도 카드 기록 유지', c && c.state === 'review' && c.interval === 4 && c.reps === 2, JSON.stringify(c));
    check('앱을 다시 켜도 청해 기록 영역과 분리', !!(await js('Storage.data.sections.vocab')) && (await js('Object.keys(Storage.data.sections)')).includes('vocab'));
    return;
  }

  const tabs = await js('Array.from(document.querySelectorAll("[data-section]")).map(b => b.dataset.section + (b.disabled ? ":off" : ":on"))');
  check('영역 탭: 청해·문자어휘·문법 활성', tabs.join(',') === 'listening:on,vocab:on,grammar:on', tabs.join(','));
  await click('[data-section="vocab"]');
  await sleep(200);
  check('문자·어휘 홈: 단어장 모드', await exists('.mode-card[data-mode="deck"]:not(:disabled)'));
  check('문자·어휘 홈: 단어장 요약 표', await exists('[data-el="vocab-summary"]'));
  await shot('v01-home');

  await deckTests(h);
  await srsClockTests(h);
  await listTests(h);
  await questionTests(h);
  await examTests(h);
  await reviewTests(h);
  await quizDeckTests(h);
  await listeningLinkTests(h);
}

// ---------- 단어장: 학습 화면 ----------
async function deckTests({ js, click, exists, text, key, shot, setClock }) {
  await setClock(0);
  await click('[data-level="N5"]');
  await click('[data-mode="deck"]');
  await sleep(200);
  const perDay = await js('Vocab.prefs.newPerDay');
  check('단어장 홈: 새 카드 수 = 하루 새 카드 수', Number(await text('[data-el="new"]')) === perDay, `${await text('[data-el="new"]')} / ${perDay}`);
  check('단어장 홈: 오늘 복습 0', Number(await text('[data-el="due"]')) === 0);
  await shot('v02-deck-home');

  await click('[data-act="start"]');
  await sleep(500);
  const first = await js('(() => { const el = document.querySelector(".flash"); return { id: el.dataset.card, kind: el.dataset.kind }; })()');
  const w0 = await js(`Vocab.words('N5')[0].key`);
  check('첫 카드 = 첫 단어의 뜻 카드', first.id === `${w0}#meaning` && first.kind === 'meaning', first.id);
  const clip = await js('({ src: Clip.src, paused: Clip.paused })');
  check('뜻 카드 앞면: 단어 음성 자동 재생', clip.src.includes('/audio/vocab/words/') && !clip.paused, JSON.stringify(clip));
  check('앞면: 뒷면 숨김', await exists('[data-el="back"].hidden'));
  await shot('v03-card-front');
  await key('Space');
  await sleep(300);
  check('Space로 뒤집기: 읽기·뜻·예문 표시', (await exists('[data-el="back"]:not(.hidden)')) && (await exists('.flash .example')) && (await exists('.rate-row:not(.hidden)')));
  const previews = await js('Array.from(document.querySelectorAll(".rate-btn")).map(b => b.children[1].textContent)');
  check('평가 버튼 다음 간격: 다시 1분 · 어려움 1분 · 알맞음 10분 · 쉬움 4일', previews.join(',') === '1분,1분,10분,4일', previews.join(','));
  await shot('v04-card-back');
  await click('[data-act="example-audio"]');
  await sleep(300);
  check('예문 ▶: 예문 음성 재생', (await js('Clip.src')).includes('/audio/vocab/examples/'));
  await key('3');
  await sleep(300);
  const c0 = await js(`Vocab.card(${JSON.stringify(first.id)})`);
  check('알맞음(새 카드) → 학습 단계 2, 10분 뒤', c0.state === 'learning' && c0.step === 1 && Math.abs(c0.due - Date.now() - 10 * MIN) < 5000, JSON.stringify(c0));
  const second = await js('document.querySelector(".flash").dataset.card');
  check('다음 카드 = 다음 새 카드 (학습 단계 카드는 아직 예정 전)', second !== first.id && second.endsWith('#meaning'), second);

  // 새 카드를 하루 한도까지 (모두 쉬움 → 바로 복습 카드)
  for (let i = 1; i < perDay; i++) {
    const kind = await js('(document.querySelector(".flash") || {}).dataset?.kind');
    if (!kind) break;
    await key('Space');
    await key('4');
  }
  await sleep(300);
  // 남은 것은 10분 뒤 학습 단계 카드 1장 → 학습 단계 앞당김(learnAheadMinutes)으로 보여 준다
  const ahead = await js('(document.querySelector(".flash") || {}).dataset?.card || ""');
  check('새 카드를 다 보면 곧 올 학습 단계 카드를 앞당겨 보여 줌', ahead === first.id, ahead);
  await key('Space');
  await key('3');
  await sleep(300);
  check('오늘 학습 끝 화면', await exists('[data-el="deck-done"]'));
  await shot('v05-deck-done');
  const counts = await js('Vocab.todayCounts("N5", Util.now())');
  check('하루 새 카드 한도 도달 → 새 카드 0', counts.fresh === 0, JSON.stringify(counts));
  check('오늘 시작한 새 카드 수 기록', (await js('Vocab.store().daily.newDone')) === perDay);
  const rcard = await js(`Vocab.newCandidates("N5", Util.now()).filter(id => id.endsWith('#reading'))`);
  check('같은 날에는 읽기 카드가 새 카드로 나오지 않음', rcard.length === 0, `${rcard.length}장`);

  // 다음 날 (새벽 4시 경계 넘김): 새 카드 한도 회복, 읽기 카드가 새 카드 후보에
  const nextDay = await js('Srs.addDays(Srs.dayStart(Date.now()), 1) + 5 * 60 * 1000 - Date.now()');
  await setClock(nextDay);
  const c2 = await js('Vocab.todayCounts("N5", Util.now())');
  check('다음 날: 새 카드 한도 회복, 어제 시작한 카드 복습 예정', c2.fresh === perDay && c2.review >= 1, JSON.stringify(c2));
  const cands = await js('Vocab.newCandidates("N5", Util.now()).slice(0, 40)');
  check('다음 날: 어제 뜻 카드를 시작한 단어의 읽기 카드가 새 카드 후보', cands.some((id) => id.endsWith('#reading')), cands.filter((id) => id.endsWith('#reading')).slice(0, 3).join(', '));
  check('연속 학습일 1', (await js('Vocab.streak(Util.now())')) === 1);
  await setClock(0);
  await click('[data-act="back"]');
}

// ---------- SRS 간격 규칙 (가짜 시계) ----------
async function srsClockTests({ js, setClock }) {
  const S = await js('APP_CONFIG.sections.vocab.srs');
  const id = await js(`Vocab.cardIds(Vocab.words('N5').find(w => Vocab.hasKanji(w.word) && !Vocab.card(w.key + '#reading')))[1]`);
  const t0 = await js('Srs.dayStart(Date.now()) + 10 * 60 * 60 * 1000');   // 오늘 오전 10시 기준
  const base = await js('Date.now()');
  // 평가 시각은 가짜 시계 값을 그대로 넘긴다 (Util.now()는 호출 사이에 몇 ms씩 흐른다)
  let T = 0;
  const at = async (ms) => { T = ms; await setClock(ms - base); return ms; };
  const rate = (n) => js(`Vocab.answerCard(${JSON.stringify(id)}, ${n}, ${T})`);
  const isDue = (ms) => js(`(() => { const c = Vocab.card(${JSON.stringify(id)}); return c.due <= ${ms}; })()`);
  const day = (n) => js(`Srs.addDays(Srs.dayStart(${t0}), ${n})`);

  await at(t0);
  let c = await rate(3);
  check('새 카드 알맞음 → 10분 뒤', c.state === 'learning' && c.due === t0 + S.learningStepsMinutes[1] * MIN);
  await at(t0 + 10 * MIN);
  c = await rate(3);
  const d1 = await day(1);
  check('학습 단계를 마치면 복습 카드, 1일 뒤', c.state === 'review' && c.interval === 1 && c.due === d1, `interval ${c.interval}`);
  check('1일 뒤 전에는 예정 아님', !(await isDue(d1 - MIN)));
  await at(d1 + 6 * 60 * MIN);   // 다음 날 오전 10시
  check('1일 뒤: 복습 예정', await isDue(d1 + 6 * 60 * MIN));
  c = await rate(3);
  const d3 = await day(1 + 3);
  check('복습 알맞음: 간격 1 × 계수 2.5 → 3일 뒤', c.interval === Math.round(1 * S.startingEase) && c.interval === 3 && c.due === d3, `interval ${c.interval}`);
  await at(d3 + 6 * 60 * MIN);
  check('3일 뒤: 복습 예정', await isDue(d3 + 6 * 60 * MIN));
  c = await rate(4);
  const want10 = Math.round(3 * S.startingEase * S.easyBonus);
  const d10 = await day(1 + 3 + want10);
  check('복습 쉬움: 간격 3 × 2.5 × 1.3 → 10일 뒤, 계수 +0.15', c.interval === want10 && want10 === 10 && c.due === d10 && Math.abs(c.ease - (S.startingEase + S.easyEaseDelta)) < 1e-9, `interval ${c.interval}, ease ${c.ease}`);
  check('10일 뒤 전날에는 예정 아님', !(await isDue(d10 - 6 * 60 * MIN)));
  await at(d10 + 6 * 60 * MIN);
  check('10일 뒤: 복습 예정', await isDue(d10 + 6 * 60 * MIN));
  c = await rate(2);
  check('복습 어려움: 간격 × 1.2, 계수 −0.15', c.interval === Math.round(10 * S.hardMultiplier) && Math.abs(c.ease - (S.startingEase + S.easyEaseDelta + S.hardEaseDelta)) < 1e-9, `interval ${c.interval}, ease ${c.ease}`);
  const t5 = c.due + 6 * 60 * MIN;
  await at(t5);
  const easeBefore = c.ease;
  c = await rate(1);
  check('복습 다시: 계수 −0.2, 다시 학습 단계(1분), 다시 횟수 +1', c.state === 'relearning' && c.step === 0 && c.due === t5 + MIN && Math.abs(c.ease - (easeBefore + S.againEaseDelta)) < 1e-9 && c.lapses === 1, JSON.stringify(c));
  await at(t5 + MIN);
  c = await rate(3);
  await at(t5 + 11 * MIN);
  c = await rate(3);
  check('다시 학습 단계를 마치면 1일 뒤 복습', c.state === 'review' && c.interval === 1, `interval ${c.interval}`);

  // 계수 하한, 약한 단어
  const weak = await js(`(() => { const id = ${JSON.stringify(id)}; let c = Vocab.card(id); for (let i = 0; i < 12; i++) { c = Srs.rate({ ...c, state: 'review', interval: 3 }, 1, Util.now()); } return c; })()`);
  check('계수는 최소값 아래로 내려가지 않음', weak.ease === S.minEase, `ease ${weak.ease}`);
  check(`다시 ${S.weakLapses}번 이상 = 약한 단어`, await js(`Srs.isWeak({ lapses: ${S.weakLapses} }) && !Srs.isWeak({ lapses: ${S.weakLapses - 1} })`));

  // 하루 경계: 새벽 3시는 전날
  const k = await js(`(() => { const d = new Date(${t0}); d.setHours(3, 0, 0, 0); const a = Srs.dayKey(d.getTime()); d.setHours(4, 0, 0, 0); const b = Srs.dayKey(d.getTime()); return [a, b]; })()`);
  check('하루의 경계는 새벽 4시 (3시는 전날)', k[0] !== k[1], k.join(' / '));
  await setClock(0);
}

// ---------- 단어 목록·상세·출처 ----------
async function listTests({ js, click, exists, text, key, shot }) {
  await js('App.showHome()');
  await click('[data-section="vocab"]');
  await click('[data-level="N5"]');
  await click('[data-mode="deck"]');
  await click('[data-act="list"]');
  await sleep(300);
  const all = await js('document.querySelectorAll(".word-row").length');
  check('단어 목록 표시', all > 0, `${all}행`);
  await js(`(() => { const s = document.querySelector('[data-f="state"]'); s.value = 'review'; s.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(200);
  const reviewRows = await js('Array.from(document.querySelectorAll(".word-row .st")).map(x => x.textContent)');
  check('상태 거르기: 복습', reviewRows.length > 0 && reviewRows.every((x) => x === '복습'), `${reviewRows.length}행`);
  await js(`(() => { const s = document.querySelector('[data-f="state"]'); s.value = ''; s.dispatchEvent(new Event('change')); const q = document.querySelector('[data-f="q"]'); q.value = '공원'; q.dispatchEvent(new Event('input')); return true; })()`);
  await sleep(200);
  const found = await js('Array.from(document.querySelectorAll(".word-row .w")).map(x => x.textContent)');
  check('검색: 뜻으로 찾기 (공원)', found.includes('公園'), found.join(','));
  await shot('v06-word-list');

  // 청해 출처가 있는 단어 상세 → 청해 문항 해설로
  const lw = await js(`Vocab.words('N5').find(w => w.sources.some(s => s.startsWith('listening:'))).key`);
  await js(`Deck.showDetail(${JSON.stringify(lw)}, () => App.showHome()); true`);
  await sleep(300);
  check('단어 상세: 카드 상태와 나온 문항', (await exists('.word-detail .card-word')) && (await exists('[data-src^="listening:"]')));
  await shot('v07-word-detail');
  await click('[data-src^="listening:"]');
  await sleep(400);
  check('출처 청해 문항 열기 (해설 상태)', (await exists('.explain .script')) && (await exists('.verdict')));
  await js('App.showHome()');
}

// ---------- 문제: 유형별 연습 ----------
async function questionTests({ js, click, exists, text, key, shot }) {
  for (const level of await js('Vocab.LEVELS')) {
    const types = await js(`Vocab.levelTypes(${JSON.stringify(level)}).filter(t => Vocab.questions(${JSON.stringify(level)}).some(q => q.type === t))`);
    if (!types.length) continue;
    await js('App.showHome()');
    await click('[data-section="vocab"]');
    await click(`[data-level="${level}"]`);
    await click('[data-mode="practice"]');
    await sleep(200);
    for (const type of types) {
      const tag = `문제 ${level} ${type}`;
      await js(`(() => { Vocab.prefs.unsolvedFirst = false; Vocab.prefs.order = 'seq'; return true; })()`);
      await click(`[data-type="${type}"]`);
      await sleep(250);
      const qs = await js(`Vocab.questions(${JSON.stringify(level)}).filter(q => q.type === ${JSON.stringify(type)}).map(q => ({ id: q.id, answer: q.answer, targets: q.targets }))`);
      const view = await js(`({ qid: document.querySelector('[data-el=options]').dataset.qid, n: document.querySelectorAll('[data-el=options] .opt').length,
        inst: !!document.querySelector('.instruction'), under: !!document.querySelector('.stem .under'), blank: !!document.querySelector('.stem .blank'), word: !!document.querySelector('.youhou-word') })`);
      const shapeOk = type === 'bunmyaku' ? view.blank : type === 'youhou' ? view.word : view.under;
      check(`${tag}: 지시문·문장(밑줄/빈칸/제시 단어)·선택지 4개`, view.qid === qs[0].id && view.n === 4 && view.inst && shapeOk, JSON.stringify(view));
      if (type === 'yomi') {
        const rubyInUnder = await js('!!document.querySelector(".stem .under ruby")');
        check(`${tag}: 밑줄 한자어에 후리가나 없음`, !rubyInUnder);
      }
      if (type === 'hyouki') {
        check(`${tag}: 선택지에 후리가나 없음`, !(await js('!!document.querySelector("[data-el=options] ruby")')));
      }
      if (level === 'N4' && type === 'youhou') await shot('v08-youhou');
      // 첫 문항 오답 → 단어장으로 당기기
      const q0 = qs[0];
      const wrong = q0.answer % 4 + 1;
      const before = await js(`Vocab.store().priorityNew.length`);
      await key(String(wrong));
      await sleep(200);
      const marks = await js('({ c: document.querySelectorAll(".opt.correct").length, w: document.querySelectorAll(".opt.wrong").length })');
      check(`${tag}: 오답 표시·해설(완성 문장·선택지 설명·단어)`, marks.c === 1 && marks.w === 1 && (await exists('.explain .full')) && (await js('document.querySelectorAll(".opt-notes li").length')) === 4 && (await exists('.mini-card')));
      const pulled = await js(`(() => { const s = Vocab.store(); return ${JSON.stringify(q0.targets)}.every(k => s.priorityNew.includes(k) || Vocab.cardIds(Vocab.word(k)).some(id => s.cards[id] && s.cards[id].due <= Util.now())); })()`);
      check(`${tag}: 틀린 문항의 단어 → 단어장 오늘 대기열`, pulled, `priorityNew ${before} → ${await js('Vocab.store().priorityNew.length')}`);
      check(`${tag}: 오답노트에 들어감`, (await js(`Storage.item('vocab', ${JSON.stringify(q0.id)}).review`)) === true);
      if (level === 'N5' && type === 'yomi') {
        await click('[data-act="full-audio"]');
        await sleep(300);
        check(`${tag}: 완성 문장 ▶ 음성`, (await js('Clip.src')).includes('/audio/vocab/questions/'));
        await key('F');
        await sleep(100);
        const f1 = await js('document.body.classList.contains("no-furigana")');
        await key('F');
        await sleep(100);
        check(`${tag}: F로 후리가나 토글`, f1 !== (await js('document.body.classList.contains("no-furigana")')));
        await shot('v09-question-explain');
      }
      // 나머지: 키보드로 정답
      for (let k = 1; k < qs.length; k++) {
        await key('Enter');
        await sleep(200);
        await key(String(qs[k].answer));
        await sleep(80);
      }
      await key('Enter');
      await sleep(250);
      const done = await text('.done h2');
      check(`${tag}: 결과 ${qs.length - 1} / ${qs.length}`, done.startsWith(`${qs.length - 1} / ${qs.length}`), done);
      await click('[data-act="back"]');
      await sleep(150);
    }
  }
}

// ---------- 실전 모의 ----------
async function examTests({ js, click, exists, text, key, shot, setClock }) {
  for (const level of await js('Vocab.LEVELS')) {
    if (!(await js(`Vocab.questions(${JSON.stringify(level)}).length`))) continue;
    const tag = `실전 ${level}`;
    await setClock(0);
    await js('App.showHome()');
    await click('[data-section="vocab"]');
    await click(`[data-level="${level}"]`);
    await click('[data-mode="exam"]');
    await sleep(200);
    const comp = await js(`(() => { const lv = ${JSON.stringify(level)}; const ex = Vocab.cfg.levels[lv].exam; const qs = Vocab.questions(lv);
      let want = 0, total = 0; for (const t in ex) { want += ex[t]; total += Math.min(ex[t], qs.filter(q => q.type === t).length); } return { want, total }; })()`);
    const notice = await exists('.notice');
    check(`${tag}: 시작 화면 · ${comp.total}문항 · 부족 안내 ${comp.total < comp.want ? '있음' : '없음'}`, notice === (comp.total < comp.want) && (!notice || (await text('.notice')).includes(`${comp.want}문항 중 ${comp.total}문항`)), await text('.notice'));
    const clash = await js(`(() => { let worst = 0; for (let k = 0; k < 20; k++) { const qs = VocabExam.compose(${JSON.stringify(level)}).flatMap(p => p.items);
      let n = 0; for (let i = 0; i < qs.length; i++) for (let j = i + 1; j < qs.length; j++) if (VocabExam.conflict(qs[i], qs[j])) n++; worst = Math.max(worst, n); } return worst; })()`);
    check(`${tag}: 서로 답을 알려 주는 문항이 같은 회에 없음 (20회 구성)`, clash === 0, `최대 ${clash}쌍`);
    await click('[data-act="begin"]');
    await sleep(300);
    check(`${tag}: 후리가나 꺼짐 고정, 타이머·문항 목록`, (await js('document.body.classList.contains("no-furigana")')) && (await exists('[data-el="timer"]')) && (await js('document.querySelectorAll(".qnav-btn").length')) === comp.total);
    if (level === 'N3') await shot('v10-exam');
    // 1번은 오답 → 정답으로 바꾸기, 이후 짝수 번째만 정답, 마지막 1문항은 무응답
    const ids = await js('Array.from(document.querySelectorAll(".qnav-btn")).map((_, i) => i)');
    let expect = 0;
    for (const i of ids) {
      if (i === ids.length - 1) break;
      await click(`[data-go="${i}"]`);
      await sleep(60);
      const q = await js(`(() => { const id = document.querySelector('[data-el=options]').dataset.qid; const q = Vocab.questions(${JSON.stringify(level)}).find(x => x.id === id); return { id, answer: q.answer }; })()`);
      if (i === 0) { await key(String(q.answer % 4 + 1)); await key(String(q.answer)); expect += 1; }
      else if (i % 2 === 0) { await key(String(q.answer)); expect += 1; }
      else await key(String(q.answer % 4 + 1));
    }
    check(`${tag}: 답한 문항 표시, 안 푼 문항 표시`, (await js('document.querySelectorAll(".qnav-btn.answered").length')) === ids.length - 1 && (await js('document.querySelectorAll(".qnav-btn.unanswered").length')) === 1);
    // 이동해서 답 바꾸기 확인
    await click('[data-go="0"]');
    await sleep(60);
    check(`${tag}: 문항 이동 후 고른 답 유지`, await exists('[data-el="options"] .opt.chosen'));
    // 시간 종료 → 자동 제출
    const mins = await js(`Vocab.cfg.levels[${JSON.stringify(level)}].examMinutes`);
    await setClock(mins * 60 * 1000 + 1000);
    await sleep(700);
    const res = await exists('.vexam-result');
    check(`${tag}: 시간 종료 → 자동 제출`, res && (await text('.score-sub')).includes('시간 종료'));
    await setClock(0);
    if (!res) continue;
    check(`${tag}: 채점 ${expect} / ${comp.total} (무응답 오답)`, (await text('.score-sub')).startsWith(`${expect} / ${comp.total}`), await text('.score-sub'));
    check(`${tag}: 걸린 시간 = 제한 시간`, (await text('[data-el="elapsed"]')) === `${mins}:00`, await text('[data-el="elapsed"]'));
    const rec = await js('Storage.section("vocab").exams.slice(-1)[0]');
    check(`${tag}: 기록 저장 (유형별, timedOut)`, rec.level === level && rec.timedOut === true && rec.correct === expect && Object.keys(rec.byType).length > 0);
    if (level === 'N3') await shot('v11-exam-result');
    await click('[data-review="0"]');
    await sleep(250);
    check(`${tag}: 결과 → 해설 (후리가나 설정 복원)`, (await exists('.explain .full')) && !(await js('document.body.classList.contains("exam-mode")')));
    await click('[data-act="back"]');
    await sleep(150);
    check(`${tag}: 해설 → 결과`, await exists('.vexam-result'));
  }
}

// ---------- 오답노트 ----------
async function reviewTests({ js, click, exists, text, key }) {
  const level = 'N4';
  await js('App.showHome()');
  await click('[data-section="vocab"]');
  await click(`[data-level="${level}"]`);
  const desc = await text('[data-mode="review"] .mode-desc');
  const n = await js(`Vocab.reviewList(${JSON.stringify(level)}).length`);
  check('오답노트: 홈에 문항 수', n > 0 && desc.startsWith(`${n}문항`), desc);
  await click('[data-mode="review"]');
  await sleep(200);
  const first = await js(`Vocab.reviewList(${JSON.stringify(level)})[0].id`);
  await click(`[data-remove="${first}"]`);
  await sleep(150);
  check('오답노트: 수동 빼기', !(await js(`Storage.item('vocab', ${JSON.stringify(first)}).review`)) && (await js(`Vocab.reviewList(${JSON.stringify(level)}).length`)) === n - 1);
  // 복습 간격(config.reviewIntervalsDays)마다 맞히면 자동 제거. 날짜는 기록의 복습 날로 맞춘다
  const target = await js(`(() => { const q = Vocab.reviewList(${JSON.stringify(level)})[0]; return q ? { id: q.id, answer: q.answer } : null; })()`);
  if (target) {
    const base = await js('Util.now() - Date.now()');
    const days = await js('APP_CONFIG.reviewIntervalsDays');
    for (let r = 0; r < days.length; r++) {
      await js(`Util.setClockOffset(Storage.item('vocab', ${JSON.stringify(target.id)}).due - Date.now()); true`);
      // 오답노트 다시 풀기 화면을 그 문항 하나로 연다 (VocabReview와 같은 실행 경로)
      await js(`(() => { const q = Vocab.questions(${JSON.stringify(level)}).find(x => x.id === ${JSON.stringify(target.id)});
        VocabPractice.run({ level: ${JSON.stringify(level)}, list: [q], title: '오답노트', back: () => VocabReview.show(${JSON.stringify(level)}), review: true }); return true; })()`);
      await sleep(200);
      await key(String(target.answer));
      await sleep(150);
      if (r === 0) check('오답노트: 복습 날에 맞히면 다음 단계, 아직 남아 있음', (await js(`(() => { const it = Storage.item('vocab', ${JSON.stringify(target.id)}); return it.review && it.stage === 1; })()`)));
    }
    check(`오답노트: 복습 ${days.length}번을 다 맞힘 → 자동으로 빠짐`, !(await js(`Storage.item('vocab', ${JSON.stringify(target.id)}).review`)));
    await js(`Util.setClockOffset(${base}); true`);
  }
}

// ---------- 객관식 퀴즈 → 단어장 반영 ----------
async function quizDeckTests({ js, click, exists, text }) {
  // 아직 아무 카드도 시작하지 않은 N3 단어들로 경우마다 확인 (다른 테스트와 겹치지 않게 뒤쪽 단어)
  const r = await js(`(() => {
    const ws = Vocab.words('N3').filter((w) => Vocab.hasKanji(w.word) && Vocab.cardIds(w).every((id) => !Vocab.card(id))).slice(-5);
    const now = Util.now();
    const out = {};
    // 1) 새 단어를 맞힘 → 뜻 카드가 바로 복습 카드(1일)
    out.introduced = Vocab.quizAnswer(ws[0], 'meaning', true, now);
    // 2) 그 카드를 내일 다시 맞힘 → 복습 완료, 간격이 늘어남
    const tomorrow = Srs.addDays(Srs.dayStart(now), 1) + 3600000;
    out.reviewed = Vocab.quizAnswer(ws[0], 'word', true, tomorrow);
    // 3) 바로 또 맞힘 (아직 예정 아님) → 그대로
    out.keptDue = Vocab.card(ws[0].key + '#meaning').due;
    out.kept = Vocab.quizAnswer(ws[0], 'meaning', true, tomorrow);
    // 4) 시작한 카드를 틀림 → 다시 (relearning, lapses 1)
    out.again = Vocab.quizAnswer(ws[0], 'meaning', false, tomorrow);
    // 5) 새 단어를 틀림 → 새 카드 대기열 맨 앞
    out.pulled = Vocab.quizAnswer(ws[1], 'meaning', false, now);
    out.front = Vocab.store().priorityNew[0] === ws[1].key;
    // 6) 읽기 고르기는 읽기 카드에
    out.reading = Vocab.quizAnswer(ws[2], 'reading', true, now);
    out.readingCard = !!Vocab.card(ws[2].key + '#reading') && !Vocab.card(ws[2].key + '#meaning');
    out.record = Vocab.quizRecord(ws[0]);
    out.newDone = Vocab.store().daily.newDone;
    out.key0 = ws[0].key;
    return out;
  })()`);
  check('퀴즈: 새 단어 맞힘 → 단어장에 복습 카드로 추가 (1일)', r.introduced.effect === 'introduced' && r.introduced.card.state === 'review' && r.introduced.card.interval === 1);
  check('퀴즈: 예정된 카드 맞힘 → 복습 완료, 간격 늘어남', r.reviewed.effect === 'reviewed' && r.reviewed.card.interval > 1, `${r.reviewed.card.interval}일`);
  check('퀴즈: 아직 예정이 아닌 카드 맞힘 → 그대로', r.kept.effect === 'kept' && r.kept.card.due === r.keptDue);
  check('퀴즈: 시작한 카드 틀림 → 다시 (학습 단계, 다시 +1)', r.again.effect === 'again' && r.again.card.state === 'relearning' && r.again.card.lapses === 1);
  check('퀴즈: 새 단어 틀림 → 새 카드 맨 앞', r.pulled.effect === 'pulled' && r.front);
  check('퀴즈: 읽기 고르기 → 읽기 카드', r.reading.effect === 'introduced' && r.readingCard);
  check('퀴즈: 단어별 기록', r.record.n === 4 && r.record.right === 3 && r.record.last === false, JSON.stringify(r.record));
  await js(`Deck.showDetail(${JSON.stringify(r.key0)}, () => App.showHome())`);
  await sleep(200);
  check('단어 상세에 퀴즈 기록', (await text('[data-el="quiz-record"]')).includes('4번 중 3번'));
  // 화면: 답하면 단어장 반영 문구, 결과에 반영 요약
  await js(`Quiz.run('N5', Vocab.words('N5').slice(0, 2), 'meaning'); true`);
  await sleep(200);
  await click('button.opt');
  await sleep(150);
  check('퀴즈 화면: 답하면 단어장 반영 문구', (await text('[data-el="deck-effect"]')).startsWith('단어장:'), await text('[data-el="deck-effect"]'));
  await click('[data-act="next"]');
  await sleep(150);
  await click('button.opt');
  await sleep(150);
  await click('[data-act="next"]');
  await sleep(200);
  check('퀴즈 결과: 단어장 반영 요약', (await text('[data-el="deck-summary"]')).startsWith('단어장 반영'), await text('[data-el="deck-summary"]'));
  await js('Clip.stop(); App.showHome()');
}

// ---------- 청해 해설의 단어장 연동 ----------
async function listeningLinkTests({ js, click, exists }) {
  const q = await js(`(() => { for (const lv of ['N5','N4','N3']) { const q = Listening.questions(lv).find(q => q.vocab.some(v => v.kind !== 'grammar' && Vocab.word(v.word + '|' + v.reading))); if (q) return q.id; } return null; })()`);
  await js(`(() => { const lv = ${JSON.stringify(q)}.slice(0, 2).toUpperCase(); const q = Listening.questions(lv).find(x => x.id === ${JSON.stringify(q)}); QuestionView.show(q, { crumb: '', pos: '', backLabel: '←', onBack: () => App.showHome(), answered: 0, autoplay: false }); return true; })()`);
  await sleep(300);
  check('청해 해설: 단어장에 있는 단어 표시', await exists('.in-deck'));
  await click('[data-word-audio]');
  await sleep(300);
  check('청해 해설: ▶ 단어 음성', (await js('Clip.src')).includes('/audio/vocab/words/'));
  await js('App.showHome()');
}

module.exports = { check, sleep };
