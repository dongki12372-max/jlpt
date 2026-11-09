// ============================================================
// 웹 버전 확인: 리포 폴더를 http로 띄우고 (preload 없이 = web.js 경로) 폰·폴드 화면 크기로 주요 화면을 눌러 본다.
//   - 화면마다 가로 스크롤이 생기지 않는지 (폭 넘침) 검사
//   - 기록이 localStorage에 남는지 (새로고침 뒤), 내보내기 형식을 다시 가져올 수 있는지
//   WEB_OUT=<출력 폴더> npx electron tools/web_check.js   (스크린샷은 WEB_OUT, 기본 smoke-out/web)
// ============================================================
const { app, BrowserWindow, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.WEB_OUT || path.join(ROOT, 'smoke-out', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
// 폴드 접은 화면 · 펼친 화면 · 일반 폰
const VIEWPORTS = [
  { name: 'fold-cover', width: 384, height: 860 },
  { name: 'fold-open', width: 840, height: 760 },
  { name: 'phone-small', width: 360, height: 740 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 앞 창이 닫히며 끊긴 요청 탓에 첫 로드가 실패하는 경우가 있어 몇 번 다시 시도한다
async function load(wc, url) {
  for (let i = 0; ; i++) {
    try { await wc.loadURL(url); return; } catch (e) { if (i >= 3) throw e; await sleep(500); }
  }
}
let passed = 0;
let failed = 0;
const ok = (cond, msg, extra) => {
  if (cond) { passed++; console.log(`✓ ${msg}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); } else { failed++; console.log(`✗ ${msg}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); }
};

// 가짜 Firestore (동기화 테스트): /fs/v1/projects/…/documents/… 의 GET·PATCH만 흉내 낸다
const fsDocs = new Map();
function fakeFirestore(req, res) {
  const key = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/fs\/v1\//, '');
  if (req.method === 'GET') {
    if (!fsDocs.has(key)) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: key, fields: fsDocs.get(key) }));
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    fsDocs.set(key, JSON.parse(body).fields);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: key, fields: fsDocs.get(key) }));
  });
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/fs/')) { fakeFirestore(req, res); return; }
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).on('error', () => res.destroy()).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function runViewport(base, vp) {
  const win = new BrowserWindow({ show: false, width: vp.width, height: vp.height, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code);
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  const waitFor = async (sel, ms = 5000) => {
    for (let t = 0; t < ms; t += 100) { if (await js(`!!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(100); }
    return false;
  };
  const screen = async (name) => {
    await sleep(350);
    const over = await js('document.documentElement.scrollWidth - window.innerWidth');
    ok(over <= 0, `[${vp.name}] ${name}: 가로 넘침 없음`, over > 0 ? { over } : undefined);
    fs.writeFileSync(path.join(OUT, `${vp.name}-${name}.png`), (await wc.capturePage()).toPNG());
  };
  const home = async () => { await js('App.showHome()'); await waitFor('.mode-card'); };

  await load(wc, `${base}/app/renderer/index.html`);
  ok(await waitFor('.mode-card', 15000), `[${vp.name}] 웹 버전 홈이 뜸`);
  ok(await js('window.jlpt.web === true'), `[${vp.name}] preload 없이 web.js 사용`);
  ok(await js(`window.innerWidth`) === vp.width, `[${vp.name}] 화면 폭`, await js('window.innerWidth'));
  await screen('home-listening');

  // 청해 연습 → 문항 → 답 → 해설·사전 창
  await click('[data-mode="practice"]');
  await waitFor('[data-type]');
  await screen('listening-types');
  await click('[data-type]:not(:disabled)');
  ok(await waitFor('.opt'), `[${vp.name}] 청해 문항`);
  await screen('listening-question');
  await js('Player.stop()');
  // 문항 이동: 건너뛰기 → 이전 → 답 → 건너뛰기 → 이전이면 해설부터
  const pos = () => js(`document.querySelector('.step-nav > span').textContent`);
  ok(await js(`document.querySelector('[data-act="step-prev"]').disabled`), `[${vp.name}] 첫 문항은 이전 없음`);
  await click('[data-act="step-skip"]');
  await waitFor('.opt');
  ok((await pos()).startsWith('2 /'), `[${vp.name}] 건너뛰기 → 다음 문항`, await pos());
  await click('[data-act="step-prev"]');
  await waitFor('.opt');
  ok((await pos()).startsWith('1 /') && await js(`!!document.querySelector('button.opt')`), `[${vp.name}] 이전 → 안 푼 문항은 다시 풀기`, await pos());
  await js('Player.stop()');
  await click('button.opt');
  ok(await waitFor('.script .line'), `[${vp.name}] 청해 해설 스크립트`);
  await click('[data-act="step-skip"]');
  await waitFor('.opt');
  await js('Player.stop()');
  await click('[data-act="step-prev"]');
  ok(await waitFor('.script .line') && !(await js(`!!document.querySelector('button.opt')`)), `[${vp.name}] 이전 → 푼 문항은 해설부터`);
  if (vp.name === 'fold-cover') {
    // 나머지를 모두 건너뛰면 결과: 1문항 푼 것으로, 나머지는 –
    for (let i = 0; i < 40 && !(await js(`!!document.querySelector('.done')`)); i++) { await click('[data-act="step-skip"]'); await sleep(60); }
    const head = await js(`document.querySelector('.done h2').textContent + ' | ' + (document.querySelector('.done p.dim') || {}).textContent`);
    ok(/\/ 1 정답/.test(head) && /건너뛴 문항 \d+개/.test(head), `[${vp.name}] 결과: 푼 문항만 채점, 건너뛴 문항 수`, head);
    ok(await js(`document.querySelectorAll('.result-list .skip').length`) > 0, `[${vp.name}] 결과 목록에 건너뜀 표시`);
    await screen('practice-done');
    await home();
    await click('[data-mode="practice"]');
    await waitFor('[data-type]');
    await click('[data-type]:not(:disabled)');
    await waitFor('.opt');
    await js('Player.stop()');
    await click('button.opt');
    await waitFor('.script .line');
  }
  await click('.script .gl');
  ok(await waitFor('.dict-pop'), `[${vp.name}] 사전 창`);
  const pop = await js(`(() => { const r = document.querySelector('.dict-pop').getBoundingClientRect(); return { left: r.left, right: r.right }; })()`);
  ok(pop.left >= 0 && pop.right <= vp.width, `[${vp.name}] 사전 창이 화면 안`, pop);
  await screen('listening-explain');
  await js('Dict.close()');

  // 청해 실전 모의 시작 화면
  await home();
  await click('[data-mode="exam"]');
  await sleep(300);
  await screen('listening-exam-start');

  // 문자·어휘: 홈 → 단어장 → 카드 → 목록
  await home();
  await click('[data-section="vocab"]');
  await waitFor('[data-mode="deck"]');
  await screen('home-vocab');
  await click('[data-mode="deck"]');
  await waitFor('[data-act="start"]');
  await screen('deck-home');
  await click('[data-act="start"]');
  if (await waitFor('[data-act="flip"]')) {
    await click('[data-act="flip"]');
    await waitFor('.rate-btn');
    await screen('deck-card');
  }
  await js('Clip.stop()');
  // 객관식 퀴즈: 형식마다 시작 → 답 → 해설 → 나머지 건너뛰고 결과
  for (const fmt of ['meaning', 'word', 'reading', 'mix']) {
    await home();
    await click('[data-mode="deck"]');
    await waitFor('[data-act="quiz"]');
    await click('[data-act="quiz"]');
    await waitFor('[data-format]');
    await click(`[data-format="${fmt}"]`);
    await click('[data-count="10"]');
    if (fmt === 'meaning') await screen('quiz-setup');
    await click('[data-act="start"]');
    ok(await waitFor('.quiz-q') && await js(`document.querySelectorAll('button.opt').length`) === 4, `[${vp.name}] 퀴즈(${fmt}): 4지선다`);
    if (fmt === 'meaning' || fmt === 'reading') await screen(`quiz-${fmt}`);
    await click('button.opt');
    ok(await waitFor('.word-detail') && await js(`!!document.querySelector('.opt.correct')`), `[${vp.name}] 퀴즈(${fmt}): 채점·단어 해설`);
    if (fmt === 'meaning') await screen('quiz-answered');
    for (let i = 0; i < 15 && !(await js(`!!document.querySelector('[data-el="quiz-done"]')`)); i++) { await click('[data-act="step-skip"]'); await sleep(40); }
    const head = await js(`document.querySelector('[data-el="quiz-done"] h2').textContent`);
    ok(/\/ 1 정답/.test(head), `[${vp.name}] 퀴즈(${fmt}): 결과`, head);
    if (fmt === 'mix') await screen('quiz-done');
    await js('Clip.stop()');
  }
  await home();
  await click('[data-mode="deck"]');
  await waitFor('[data-act="list"]');
  await click('[data-act="list"]');
  ok(await waitFor('.word-row'), `[${vp.name}] 단어 목록`);
  await screen('deck-list');

  // 문자·어휘 연습 → 답 → 해설
  await home();
  await click('[data-mode="practice"]');
  await waitFor('[data-type]');
  await click('[data-type]:not(:disabled)');
  ok(await waitFor('.vq .opt'), `[${vp.name}] 문자·어휘 문항`);
  await screen('vocab-question');
  await click('.vq button.opt');
  await sleep(300);
  await js('Clip.stop()');
  await screen('vocab-explain');

  // 문자·어휘 실전 모의: 시작 → 첫 문항
  await home();
  await click('[data-mode="exam"]');
  await sleep(300);
  await screen('vocab-exam-start');
  if (await click('[data-act="begin"]') || await click('.primary')) {
    await sleep(400);
    await screen('vocab-exam');
  }

  // 문법: 문형 사전·상세·퀴즈, 형식별 문항(답한 뒤 해설까지), 실전 모의
  await home();
  await click('[data-section="grammar"]');
  await waitFor('[data-mode="points"]');
  await screen('home-grammar');
  await click('[data-mode="points"]');
  ok(await waitFor('.point-row'), `[${vp.name}] 문형 사전`);
  await screen('grammar-points');
  await click('.point-row');
  await waitFor('.point-detail');
  await screen('grammar-point-detail');
  await js(`GrammarQuiz.run('N5', Grammar.points('N5').slice(0, 3), 'meaning'); true`);
  await waitFor('.quiz-q');
  await click('button.opt');
  await waitFor('.point-detail');
  await screen('grammar-quiz');
  for (const t of ['bunpou', 'narabe', 'bunshou']) {
    await js(`GrammarPractice.showSetup('N5')`);
    await waitFor(`[data-type="${t}"]`);
    await click(`[data-type="${t}"]`);
    await waitFor('.gq');
    await screen(`grammar-${t}`);
    const id = await js(`document.querySelector('.gq').dataset.qid`);
    if (t === 'bunpou') await js(`document.querySelector('button.opt[data-n="' + Grammar.question(${JSON.stringify(id)}).answer + '"]').click()`);
    if (t === 'narabe') await js(`(async () => { for (const n of Grammar.question(${JSON.stringify(id)}).order) document.querySelector('[data-chip="' + n + '"]').click(); document.querySelector('[data-act="check"]').click(); })()`);
    if (t === 'bunshou') await js(`Grammar.question(${JSON.stringify(id)}).items.forEach((it, i) => document.querySelector('[data-item-box="' + i + '"] button.opt[data-n="' + it.answer + '"]').click())`);
    ok(await waitFor('.explain'), `[${vp.name}] 문법 ${t}: 해설`);
    await screen(`grammar-${t}-explain`);
  }
  await js(`GrammarExam.showStart('N5')`);
  await waitFor('[data-act="begin"]');
  await click('[data-act="begin"]');
  await waitFor('.qnav-btn');
  await screen('grammar-exam');
  await js(`window.confirm = () => true; document.querySelector('[data-act="submit"]').click()`);
  ok(await waitFor('.gexam-result'), `[${vp.name}] 문법 실전 모의 결과`);
  await screen('grammar-exam-result');

  // 설정
  await js('App.showSettings()');
  ok(await waitFor('[data-act="export"]') && await waitFor('[data-act="import"]'), `[${vp.name}] 설정: 기록 내보내기·가져오기`);
  await screen('settings');
  win.destroy();
}

// 기기 간 동기화: 저장소를 따로 쓰는 창 두 개 = 기기 두 대
async function syncTests(base) {
  const open = async (name) => {
    const win = new BrowserWindow({ show: false, width: 400, height: 800, webPreferences: { partition: `sync-${name}-${Date.now()}` } });
    await load(win.webContents, `${base}/app/renderer/index.html`);
    await sleep(1500);
    const js = (code) => win.webContents.executeJavaScript(code);
    // SYNC_REAL=1이면 config.js의 실제 Firebase 프로젝트로, 아니면 가짜 Firestore로
    if (!process.env.SYNC_REAL) await js(`window.APP_CONFIG.sync = { projectId: 'test', endpoint: location.origin + '/fs/v1' }; true`);
    return { win, js };
  };
  const A = await open('a');
  const B = await open('b');
  await A.js(`Storage.recordAnswer('listening', 'n5-kadai-001', false); Vocab.answerCard(Vocab.words('N5')[0].key + '#meaning', 3, Util.now()); true`);
  const code = await A.js('Sync.create()');
  ok(/^[A-Z2-9]{20}$/.test(code) && (await A.js('Sync.state.status')) === 'idle', '동기화: 기기 A에서 코드 만들기', code);
  await B.js(`Storage.recordAnswer('listening', 'n5-kadai-002', true); true`);
  let bad = await B.js(`Sync.join('ABCD').then(() => 'ok', (e) => e.message)`);
  ok(bad.includes('20자'), '동기화: 코드 길이 검사', bad);
  bad = await B.js(`Sync.join('${'A'.repeat(20)}').then(() => 'ok', (e) => e.message)`);
  ok(bad.includes('서버에 없습니다'), '동기화: 없는 코드', bad);
  await B.js(`Sync.join(${JSON.stringify(code.toLowerCase().replace(/(.{4})/g, '$1-'))})`);
  ok(await B.js(`!!Storage.item('listening', 'n5-kadai-001') && !!Storage.item('listening', 'n5-kadai-002')`), '동기화: 기기 B가 연결하면 두 기기 기록이 합쳐짐');
  ok(await B.js(`!!Vocab.card(Vocab.words('N5')[0].key + '#meaning')`), '동기화: 단어 카드도 넘어옴');
  await A.js('Sync.syncNow()');
  ok(await A.js(`!!Storage.item('listening', 'n5-kadai-002')`), '동기화: 기기 A도 B의 기록을 받음');
  // 같은 문항을 두 기기에서: 나중에 푼 쪽이 남는다
  await A.js(`Storage.recordAnswer('listening', 'n5-kadai-003', false); Sync.syncNow()`);
  await sleep(20);
  await B.js(`Sync.syncNow().then(() => { Storage.recordAnswer('listening', 'n5-kadai-003', true); return Sync.syncNow(); })`);
  await A.js('Sync.syncNow()');
  const it = await A.js(`Storage.item('listening', 'n5-kadai-003')`);
  ok(it && it.lastCorrect === true && it.attempts === 2, '동기화: 같은 문항은 나중 기록이 남음', it && { attempts: it.attempts, lastCorrect: it.lastCorrect });
  // 기록이 바뀌면 몇 초 뒤 자동으로 올라감
  await B.js(`Storage.recordAnswer('listening', 'n5-kadai-004', true); true`);
  await sleep(5500);
  await A.js('Sync.syncNow()');
  ok(await A.js(`!!Storage.item('listening', 'n5-kadai-004')`), '동기화: 바뀐 기록은 자동으로 올라감');
  ok(!(await A.js(`JSON.stringify(Storage.data).includes('"sync":{"code"') && false`)), '동기화 설정은 서버에 올리지 않음');
  if (!process.env.SYNC_REAL) {
    const remoteHasCode = [...fsDocs.values()].some((f) => JSON.stringify(f).includes(code));
    ok(!remoteHasCode, '동기화: 서버 기록에 코드가 들어가지 않음');
  } else console.log(`(실제 서버 테스트 코드: ${code})`);
  // 설정 화면
  await A.js('App.showSettings()');
  await sleep(200);
  ok((await A.js(`document.querySelector('[data-el="sync-code-show"]').textContent`)).replace(/-/g, '') === code, '동기화: 설정 화면에 코드 표시');
  // 인터넷이 끊기면
  await A.js(`window.APP_CONFIG.sync.endpoint = 'http://127.0.0.1:1/fs/v1'; Sync.syncNow()`);
  ok((await A.js('Sync.state.status')) === 'offline', '동기화: 인터넷이 없으면 「이 기기에만 저장」 상태', await A.js('Sync.state.status'));
  await A.js(`Sync.disable(); true`);
  ok(!(await A.js('Sync.enabled()')), '동기화 끄기');
  A.win.destroy();
  B.win.destroy();
}

async function storageTests(base) {
  const win = new BrowserWindow({ show: false, width: 400, height: 800 });
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code);
  await load(wc, `${base}/app/renderer/index.html`);
  await sleep(1500);
  await js(`Storage.recordAnswer('listening', 'n5-kadai-001', false)`);
  await sleep(200);
  await wc.reload();
  await sleep(1500);
  const it = await js(`Storage.item('listening', 'n5-kadai-001')`);
  ok(it && it.review === true, '새로고침 뒤에도 기록이 남음 (localStorage)', it && { attempts: it.attempts, review: it.review });
  const exported = await js('JSON.stringify(Storage.data)');
  await js('Storage.resetAll()');
  ok(!(await js(`Storage.item('listening', 'n5-kadai-001')`)), '초기화하면 기록이 지워짐');
  await js(`Storage.replaceAll(JSON.parse(${JSON.stringify(exported)}))`);
  ok((await js(`Storage.item('listening', 'n5-kadai-001')`) || {}).review === true, '내보낸 기록을 가져오면 되살아남');
  const bad = await js(`(() => { try { Storage.replaceAll([1, 2]); return 'accepted'; } catch (e) { return e.message; } })()`);
  ok(bad !== 'accepted', '기록 파일이 아니면 가져오지 않음', bad);
  await js('Storage.resetAll()');
  win.destroy();
}

// 화면 크기마다 창을 닫았다 새로 여니, 창이 하나도 없을 때 앱이 끝나지 않게 한다
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 테스트용 저장소 (실제 브라우저 기록과 무관하지만 매번 깨끗하게)
  await session.defaultSession.clearStorageData();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const vp of VIEWPORTS) await runViewport(base, vp);
    await storageTests(base);
    await syncTests(base);
  } catch (e) {
    failed++;
    console.log('✗ 예외:', e.stack || e);
  }
  console.log(`${passed}/${passed + failed} 통과 · 스크린샷: ${OUT}`);
  server.close();
  app.exit(failed ? 1 : 0);
});
