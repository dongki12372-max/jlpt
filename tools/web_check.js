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

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
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
  await click('button.opt');
  ok(await waitFor('.script .line'), `[${vp.name}] 청해 해설 스크립트`);
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

  // 설정
  await js('App.showSettings()');
  ok(await waitFor('[data-act="export"]') && await waitFor('[data-act="import"]'), `[${vp.name}] 설정: 기록 내보내기·가져오기`);
  await screen('settings');
  win.destroy();
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
  } catch (e) {
    failed++;
    console.log('✗ 예외:', e.stack || e);
  }
  console.log(`${passed}/${passed + failed} 통과 · 스크린샷: ${OUT}`);
  server.close();
  app.exit(failed ? 1 : 0);
});
