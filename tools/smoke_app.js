// ============================================================
// 개발용 스모크 테스트: 앱을 실제로 띄워 화면을 눌러 보고, 확인 결과와 스크린샷을 남긴다.
//   SMOKE_OUT=<출력 폴더> npx electron tools/smoke_app.js
// 앱 코드(app/main.js)는 건드리지 않고 바깥에서 창을 조작한다.
// ============================================================
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = process.env.SMOKE_OUT || path.join(__dirname, '..', 'smoke-out');
fs.mkdirSync(OUT, { recursive: true });

require('../app/main.js');

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
    if (message.includes('example.com')) return;  // 네트워크 차단 확인용 요청이 남기는 CSP 메시지 (의도된 차단)
    consoleErrors.push(`${message} (${path.basename(source || '')}:${line})`);
  });
  wc.once('did-finish-load', () => {
    run(win).catch((e) => { check('스모크 테스트 실행', false, e.stack); }).finally(finish);
  });
});

function finish() {
  check('콘솔 오류·경고 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
  const failed = checks.filter((c) => !c.ok);
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, consoleErrors }, null, 2));
  console.log(`\n${checks.length - failed.length}/${checks.length} 통과 · 스크린샷: ${OUT}`);
  app.exit(failed.length ? 1 : 0);
}

async function run(win) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code);
  const click = (sel) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  const exists = (sel) => js(`!!document.querySelector(${JSON.stringify(sel)})`);
  const text = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const key = async (keyCode) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode });
    wc.sendInputEvent({ type: 'keyUp', keyCode });
    await sleep(150);
  };
  const shot = async (name) => fs.writeFileSync(path.join(OUT, `${name}.png`), (await wc.capturePage()).toPNG());
  const player = () => js('({ t: Player.currentTime, paused: Player.paused, rate: Player.rate, d: Player.duration })');

  await sleep(600);
  check('홈 화면', await exists('.mode-card[data-mode="practice"]'), await text('h1'));
  check('창 제목 = config.appName', (await js('document.title')) === (await js('APP_CONFIG.appName')));
  const blocked = await js(`fetch('https://example.com').then(() => 'reached').catch(() => 'blocked')`);
  check('외부 네트워크 요청 차단', blocked === 'blocked', blocked);
  await shot('01-home');

  const levels = await js('Object.keys(APP_CONFIG.levels)');
  for (const level of levels) {
    await click(`[data-level="${level}"]`);
    await click('[data-mode="practice"]');
    if (level === 'N3') await shot('02-setup-N3');
    const types = await js(`App.levelTypes(${JSON.stringify(level)})`);

    for (const type of types) {
      const tag = `${level} ${type}`;
      await click(`[data-type="${type}"]`);
      await sleep(1200);
      const p0 = await player();
      check(`${tag}: 음성 자동 재생`, !p0.paused && p0.t > 0 && p0.d > 0, `t=${p0.t.toFixed(2)} / ${p0.d.toFixed(1)}`);

      const q = await js('(() => { const n = document.querySelectorAll("[data-el=options] .opt").length; const spoken = !!document.querySelector(".opt.num-only"); return { n, spoken }; })()');
      const qdata = await js(`(() => { const lv = ${JSON.stringify(level)}.toLowerCase(); const qs = App.questions(${JSON.stringify(level)}).filter(q => q.type === ${JSON.stringify(type)}); return qs.map(q => ({ id: q.id, answer: q.answer, spoken: q.spokenOptions, info: App.audioInfo(q), n: q.options.length })); })()`);
      const first = qdata[0];
      check(`${tag}: 선택지 ${first.n}개, 음성 선택지면 번호만`, q.n === first.n && q.spoken === first.spoken);

      // 포인트이해: 선택지 읽는 시간 건너뛰기
      if (first.info && first.info.reading) {
        const [rs, re] = first.info.reading;
        await js(`Player.seek(${rs + 0.5})`);
        await sleep(400);
        const visible = await js('!document.querySelector("[data-act=skip]").classList.contains("hidden")');
        if (level === 'N3') await shot('03-point-reading');
        await click('[data-act="skip"]');
        await sleep(300);
        const p1 = await player();
        check(`${tag}: 읽기 시간 건너뛰기`, visible && p1.t >= re - 0.05, `버튼 ${visible ? '보임' : '안 보임'}, ${p1.t.toFixed(2)} ≥ ${re}`);
      }

      // 첫 문항: 일부러 오답 (클릭)
      const wrong = first.answer % first.n + 1;
      await click(`button.opt[data-n="${wrong}"]`);
      await sleep(200);
      const v1 = await js('(() => { const v = document.querySelector(".verdict"); return v ? v.className : ""; })()');
      const marks = await js('({ correct: document.querySelectorAll(".opt.correct").length, wrong: document.querySelectorAll(".opt.wrong").length })');
      check(`${tag}: 오답 표시`, v1.includes('ng') && marks.correct === 1 && marks.wrong === 1);
      check(`${tag}: 해설 패널 (스크립트·해설·단어)`, await exists('.explain .script .line') && (await text('.explain')).length > 50);
      if (first.spoken) {
        const shown = await js('document.querySelectorAll(".opt .opt-text").length');
        check(`${tag}: 답한 뒤 음성 선택지 글자 공개`, shown === first.n);
      }

      // 대사 한 줄 다시 듣기 (가장 짧은 줄)
      if (first.info && first.info.lines.length && type !== 'hatsuwa') {
        const segs = first.info.lines;
        let i = 0;
        segs.forEach((s, k) => { if (s[1] - s[0] < segs[i][1] - segs[i][0]) i = k; });
        const [ls, le] = segs[i];
        await click(`.script .line[data-line="${i}"]`);
        await sleep(250);
        const pa = await player();
        await sleep(((le - ls) / pa.rate) * 1000 + 600);
        const pb = await player();
        check(`${tag}: 대사 ${i + 1} 구간만 재생`, !pa.paused && pa.t >= ls - 0.05 && pb.paused && Math.abs(pb.t - le) < 0.3,
          `시작 ${pa.t.toFixed(2)}(${ls}, ${pa.paused ? '멈춤' : '재생'}) → ${pb.t.toFixed(2)}(${le}, ${pb.paused ? '멈춤' : '재생'}), 속도 ${pa.rate}`);
      }
      if (level === 'N3' && (type === 'kadai' || type === 'hatsuwa' || type === 'gaiyou')) await shot(`04-answered-N3-${type}`);

      // 다음 문항: 키보드로 정답 → Enter로 결과
      await key('Enter');
      await sleep(600);
      const second = qdata[1];
      await key(String(second.answer));
      const v2 = await js('(() => { const v = document.querySelector(".verdict"); return v ? v.className : ""; })()');
      check(`${tag}: 키보드로 정답 선택`, v2.includes('ok'));
      await key('Enter');
      await sleep(300);
      const done = await text('.done h2');
      check(`${tag}: 결과 화면 1/2`, done.startsWith('1 / 2'), done);
      if (level === 'N3' && type === 'sokuji') await shot('05-done');
      await click('[data-act="back"]');
      await sleep(200);
    }
    await click('[data-act="home"]');
    await sleep(200);
  }

  // 속도·후리가나·Space
  await click('[data-level="N5"]');
  await click('[data-mode="practice"]');
  await click('[data-type="kadai"]');
  await sleep(800);
  await click('[data-rate="1.2"]');
  await key('Space');
  const ps = await player();
  check('Space로 일시정지', ps.paused);
  await key('Space');
  await key('1');
  await click('[data-el="furi"]');
  const noFuri = await js('document.body.classList.contains("no-furigana")');
  check('후리가나 토글', noFuri);
  await key('Enter');
  await sleep(800);
  const p2 = await player();
  check('속도 1.2배가 다음 문항에도 유지', Math.abs(p2.rate - 1.2) < 1e-6 && !p2.paused, `rate=${p2.rate}`);
  await key('R');
  await sleep(300);
  const p3 = await player();
  check('R로 처음부터', p3.t < 1 && !p3.paused, `t=${p3.t.toFixed(2)}`);
  await key('2');
  await shot('06-N5-no-furigana');
}
