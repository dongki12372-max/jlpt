// ============================================================
// 개발용 스모크 테스트 — 오늘의 학습 (홈 카드, 문항 고르기, 단계 이어 가기, 다 채운 날·연속 일수, 레벨별 분량)
//   SMOKE_OUT=<출력 폴더> npx electron tools/smoke_daily.js
// 분량은 app/config.js의 daily에서 읽는다. 앱 코드는 건드리지 않는다.
// ============================================================
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('../app/config.js');

const OUT = process.env.SMOKE_OUT || path.join(__dirname, '..', 'smoke-out');
fs.mkdirSync(OUT, { recursive: true });
if (!process.env.JLPT_USER_DATA) {
  process.env.JLPT_USER_DATA = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jlpt-smoke-daily-'));
}
require('./test_host.js');

const consoleErrors = [];
const checks = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  fs.writeFileSync(path.join(OUT, 'result-daily.json'), JSON.stringify({ checks, consoleErrors }, null, 2));
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
  const text = (sel) => js(`((document.querySelector(${JSON.stringify(sel)}) || {}).textContent || '').replace(/\\s+/g, ' ').trim()`);
  const shot = async (name) => { await sleep(400); fs.writeFileSync(path.join(OUT, `daily-${name}.png`), (await wc.capturePage()).toPNG()); };
  const home = async (level) => { await js(`App.state.level = ${JSON.stringify(level)}; App.showHome(); true`); await sleep(150); };
  const count = (part) => text(`[data-daily="${part}"] [data-el="daily-count"]`);
  const parts = () => js(`[...document.querySelectorAll('[data-daily]')].map((b) => b.dataset.daily + (b.disabled ? '(done)' : '')).join(',')`);
  const setAmount = async (part, value) => {
    await js(`(() => { const s = document.querySelector('[data-amount="${part}"]'); s.value = '${value}'; s.dispatchEvent(new Event('change')); return true; })()`);
    await sleep(80);
  };

  const D = config.daily.questions;
  const newPerDay = config.sections.vocab.srs.newPerDay;
  const DAY = 24 * 60 * 60 * 1000;

  await sleep(800);

  // ---------- 홈 카드 ----------
  check('홈에 오늘의 학습 카드', await exists('[data-el="daily"]') && (await text('.daily-head h2')) === '오늘의 학습 N5', await text('.daily-head h2'));
  check('단계 4개 (단어장·청해·문자어휘·문법)', (await parts()) === 'words,listening,vocab,grammar', await parts());
  check('처음 분량', (await count('words')) === `0 / ${newPerDay}장` && (await count('listening')) === `0 / ${D.listening}`
    && (await count('vocab')) === `0 / ${D.vocab}` && (await count('grammar')) === `0 / ${D.grammar}`,
  [await count('words'), await count('listening'), await count('vocab'), await count('grammar')].join(' | '));
  check('시작 버튼은 첫 단계', (await text('[data-act="daily-next"]')) === `시작 · 단어장 ${newPerDay}장`, await text('[data-act="daily-next"]'));
  check('연속 0일 · 최근 날 점', (await text('[data-el="daily-streak"]')) === '0'
    && (await js(`document.querySelectorAll('.day-dot').length`)) === config.daily.weekDays && (await js(`document.querySelectorAll('.day-dot.on').length`)) === 0);
  await shot('home');
  await click('[data-section="grammar"]');
  await sleep(150);
  check('다른 영역 탭에서도 같은 카드', (await parts()) === 'words,listening,vocab,grammar');

  // ---------- 문항 고르기: 유형마다 고르게 ----------
  for (const part of ['listening', 'vocab', 'grammar']) {
    const r = await js(`(() => {
      const mod = { listening: Listening, vocab: Vocab, grammar: Grammar }.${part};
      const types = mod.levelTypes('N5');
      const list = Daily.pick('${part}', 'N5', ${D[part]});
      const per = types.map((t) => list.filter((q) => q.type === t).length);
      const order = list.map((q) => types.indexOf(q.type));
      return { n: list.length, uniq: new Set(list.map((q) => q.id)).size, per, sorted: order.every((x, i) => !i || order[i - 1] <= x) };
    })()`);
    const spread = Math.max(...r.per) - Math.min(...r.per);
    check(`${part}: ${D[part]}문항을 유형마다 고르게`, r.n === D[part] && r.uniq === r.n && spread <= 1 && r.sorted, JSON.stringify(r));
  }

  // ---------- 청해 → 문자·어휘 → 문법 이어 가기 ----------
  const dontKnowAll = async () => {
    for (let i = 0; i < 8 && await exists('[data-act="dontknow"]'); i++) { await click('[data-act="dontknow"]'); await sleep(80); }
  };
  await click('[data-daily="listening"]');
  await sleep(300);
  check('청해 단계 시작', (await text('.topbar .pos')).includes(`1 / ${D.listening}`) && (await text('[data-act="back"]')) === '← 홈', `${await text('.topbar .pos')} | ${await text('[data-act="back"]')}`);
  const firstListening = await js(`Daily.pick('listening', 'N5', ${D.listening})[0].id`);
  for (let i = 0; i < D.listening; i++) {
    await dontKnowAll();
    await sleep(100);
    await click('[data-act="next"]');
    await sleep(200);
  }
  check('청해 결과 → 다음 단계 버튼', (await text('[data-act="again"]')) === `다음 · 문자·어휘 ${D.vocab}문항` && (await text('.crumb')).includes('오늘의 학습'), await text('[data-act="again"]'));
  check('오늘 푼 문항은 다시 고르지 않음', (await js(`Daily.pick('listening', 'N5', 50).length`)) === (await js(`Listening.questions('N5').length`)) - D.listening
    && !(await js(`Daily.pick('listening', 'N5', 50).some((q) => q.id === ${JSON.stringify(firstListening)})`)));
  await click('[data-act="again"]');
  await sleep(300);
  check('문자·어휘 단계 시작', (await text('.topbar .pos')).includes(`1 / ${D.vocab}`) && await exists('[data-el="options"][data-qid]'), await text('.topbar .pos'));
  let vocabWrong = null;
  for (let i = 0; i < D.vocab; i++) {
    const q = await js(`(() => { const id = document.querySelector('[data-el=options]').dataset.qid; return { id, answer: Vocab.questions('N5').find((x) => x.id === id).answer }; })()`);
    if (i === 0) { vocabWrong = q.id; await click(`button.opt[data-n="${q.answer % 4 + 1}"]`); } else await click(`button.opt[data-n="${q.answer}"]`);
    await sleep(100);
    await click('[data-act="next"]');
    await sleep(150);
  }
  check('문자·어휘 결과 → 다음 단계 버튼', (await text('[data-act="again"]')) === `다음 · 문법 ${D.grammar}문항`, await text('[data-act="again"]'));
  await click('[data-act="again"]');
  await sleep(300);
  check('문법 단계 시작', (await text('.topbar .pos')).includes(`1 / ${D.grammar}`) && await exists('.gq'), await text('.topbar .pos'));
  for (let i = 0; i < D.grammar; i++) {
    await dontKnowAll();
    await sleep(100);
    await click('[data-act="next"]');
    await sleep(150);
  }
  check('마지막 단계 결과에는 다음 버튼 없음', await exists('[data-el="grammar-done"]') && !(await exists('[data-act="again"]')));
  await click('[data-act="back"]');
  await sleep(200);
  check('홈: 문제 3단계 끝, 단어장 남음', (await parts()) === 'words,listening(done),vocab(done),grammar(done)', await parts());
  check('홈: 채운 분량 표시', (await count('listening')) === `${D.listening} / ${D.listening}` && (await count('vocab')) === `${D.vocab} / ${D.vocab}` && (await count('grammar')) === `${D.grammar} / ${D.grammar}`);
  check('아직 다 채우지 않음', !(await exists('[data-el="daily-done"]')) && (await text('[data-act="daily-next"]')) === `이어서 · 단어장 ${newPerDay}장`, await text('[data-act="daily-next"]'));
  await shot('progress');

  // ---------- 단어장 단계 → 다 채운 날 ----------
  await js(`(() => { for (let i = 0; i < ${newPerDay - 1}; i++) { const n = Vocab.nextCard('N5', Util.now()); Vocab.answerCard(n.id, 4, Util.now()); } return true; })()`);
  await home('N5');
  check('단어장 진도', (await count('words')) === `${newPerDay - 1} / ${newPerDay}장`, await count('words'));
  await click('[data-act="daily-next"]');
  await sleep(300);
  check('단어장 단계 시작', await exists('.flash') && (await text('[data-act="back"]')) === '← 홈', await text('[data-act="back"]'));
  await click('[data-act="flip"]');
  await sleep(100);
  await click('[data-rate="4"]');
  await sleep(200);
  check('단어장 끝 화면 → 홈으로', await exists('[data-el="deck-done"]') && (await text('[data-el="deck-done"] [data-act="back"]')) === '홈으로' && !(await exists('[data-act="next"]')));
  await sleep(100);
  check('홈으로 돌아오기 전에도 다 채운 날로 남음', (await js(`JSON.stringify((Storage.data.sections.plan || {}).studyDays || [])`)).includes(' N5'));
  await click('[data-el="deck-done"] [data-act="back"]');
  await sleep(200);
  check('오늘 분량 끝', await exists('[data-el="daily-done"]') && !(await exists('[data-act="daily-next"]')) && (await parts()) === 'words(done),listening(done),vocab(done),grammar(done)', await parts());
  check('연속 1일 · 오늘 점', (await text('[data-el="daily-streak"]')) === '1' && await exists('.day-dot.today.on'));
  check('다 채운 날 기록 (sections.plan.studyDays)', (await js(`JSON.stringify(Storage.data.sections.plan.studyDays)`)) === JSON.stringify([`${await js('Srs.dayKey(Util.now())')} N5`]),
    await js(`JSON.stringify(Storage.data.sections.plan.studyDays)`));
  await shot('complete');

  // ---------- 레벨마다 따로 ----------
  await click('[data-level="N4"]');
  await sleep(200);
  check('N4는 따로: 문제 0, 연속 0일', (await count('listening')) === `0 / ${D.listening}` && (await count('vocab')) === `0 / ${D.vocab}` && (await text('[data-el="daily-streak"]')) === '0'
    && !(await exists('[data-el="daily-done"]')), `${await count('listening')} | ${await text('[data-el="daily-streak"]')}`);
  check('N4 새 카드도 따로 (N5에서 다 써도 그대로)', (await count('words')) === `0 / ${newPerDay}장` && (await js(`JSON.stringify(Vocab.store().daily.byLevel)`)) === JSON.stringify({ N5: newPerDay }),
    `${await count('words')} | ${await js(`JSON.stringify(Vocab.store().daily)`)}`);
  await js(`Vocab.prefs.scope = 'cumulative'; true`);
  await home('N4');
  check('누적 범위(N5·N4)면 합쳐서 셈 (N5에서 본 카드 포함)', (await count('words')) === `${newPerDay} / ${newPerDay}장` && (await parts()).startsWith('words(done)'), await count('words'));
  await js(`Vocab.prefs.scope = 'level'; true`);
  await js(`Listening.recordAnswer(Listening.questions('N4')[0], true); true`);
  await home('N4');
  check('유형별 연습에서 푼 문항도 들어감', (await count('listening')) === `1 / ${D.listening}`, await count('listening'));

  // ---------- 분량 바꾸기 ----------
  await click('[data-act="daily-setup"]');
  await sleep(150);
  check('분량 화면', await exists('[data-el="daily-setup"]') && (await text('.crumb')) === 'N4 · 하루 분량' && (await js(`document.querySelectorAll('[data-amount]').length`)) === 4);
  await shot('setup');
  await setAmount('listening', 3);
  await setAmount('grammar', 0);
  check('바꾸면 바로 저장', (await text('[data-el="saved"]')) === '저장했습니다.' && (await js(`Daily.amounts('N4').listening`)) === 3);
  await click('[data-act="home"]');
  await sleep(150);
  check('N4 분량 반영 (청해 3문항, 문법 빼기)', (await count('listening')) === '1 / 3' && (await parts()) === 'words,listening,vocab', `${await count('listening')} | ${await parts()}`);
  check('N5 분량은 그대로', (await js(`Daily.amounts('N5').listening`)) === D.listening && (await js(`Daily.amounts('N5').grammar`)) === D.grammar);
  await js(`['listening', 'vocab'].forEach((p) => Daily.setAmount('N4', p, 0)); Daily.setAmount('N4', 'words', false); true`);
  await home('N4');
  check('분량이 없으면 안내', (await parts()) === '' && (await text('[data-el="daily"]')).includes('정해져 있지 않습니다'), await text('[data-el="daily"]'));

  // ---------- 다음 날 ----------
  await js(`Util.setClockOffset(${DAY}); true`);
  await home('N5');
  check('다음 날: 분량 다시 0', (await count('listening')) === `0 / ${D.listening}` && (await count('vocab')) === `0 / ${D.vocab}` && !(await exists('[data-el="daily-done"]')), await count('listening'));
  check('다음 날: 연속 일수는 어제까지', (await text('[data-el="daily-streak"]')) === '1' && !(await exists('.day-dot.today.on')) && (await js(`document.querySelectorAll('.day-dot.on').length`)) === 1);
  const cap = Math.floor(D.listening * config.daily.reviewShare);
  const mix = await js(`(() => {
    const list = Daily.pick('listening', 'N5', ${D.listening});
    return { wrong: list.filter((q) => (Listening.record(q) || {}).review).length, fresh: list.filter((q) => !Listening.record(q)).length };
  })()`);
  check(`틀렸던 문항은 분량의 절반까지 (${cap}) + 나머지는 안 푼 문항`, mix.wrong === cap && mix.fresh === D.listening - cap, JSON.stringify(mix));
  check('어제 틀린 어휘 문항이 다시 나옴', await js(`Daily.pick('vocab', 'N5', ${D.vocab}).some((q) => q.id === ${JSON.stringify(vocabWrong)})`));
  await js(`Util.setClockOffset(${2 * DAY}); true`);
  await home('N5');
  check('하루 거르면 연속 0일', (await text('[data-el="daily-streak"]')) === '0');
  await js(`Util.setClockOffset(0); true`);

  // ---------- 기기 간 합치기 ----------
  const merged = await js(`JSON.stringify(Storage.merge(
    { sections: { plan: { studyDays: ['2026-01-01 N5', '2026-01-02 N5'] } }, settings: { common: {} }, updatedAt: 1 },
    { sections: { plan: { studyDays: ['2026-01-02 N5', '2026-01-02 N3'] } }, settings: { common: {}, daily: { N3: { listening: 10 } } }, updatedAt: 2 },
  ))`);
  const m = JSON.parse(merged);
  check('동기화: 다 채운 날은 합집합, 분량 설정 유지', m.sections.plan.studyDays.length === 3 && m.settings.daily.N3.listening === 10, merged.slice(0, 200));
  const md = await js(`JSON.stringify(Storage.merge(
    { sections: { vocab: { daily: { day: '2026-01-02', newDone: 20, byLevel: { N5: 20 } } } }, settings: { common: {} }, updatedAt: 1 },
    { sections: { vocab: { daily: { day: '2026-01-02', newDone: 12, byLevel: { N5: 5, N3: 7 } } } }, settings: { common: {} }, updatedAt: 2 },
  ).sections.vocab.daily)`);
  check('동기화: 레벨별 새 카드 수는 레벨마다 큰 쪽', md === JSON.stringify({ day: '2026-01-02', newDone: 20, byLevel: { N5: 20, N3: 7 } }), md);

  // ---------- 폰 화면 폭 ----------
  win.setContentSize(384, 860);
  await sleep(300);
  await home('N5');
  let over = await js('document.documentElement.scrollWidth - window.innerWidth');
  check('폰 폭: 홈 가로 넘침 없음', over <= 0, `${over}`);
  await shot('phone-home');
  await home('N3');
  await shot('phone-home-n3');
  await click('[data-act="daily-setup"]');
  await sleep(150);
  over = await js('document.documentElement.scrollWidth - window.innerWidth');
  check('폰 폭: 분량 화면 가로 넘침 없음', over <= 0, `${over}`);
  await shot('phone-setup');
}
