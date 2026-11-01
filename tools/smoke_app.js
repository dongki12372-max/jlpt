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
  const shot = async (name) => { await sleep(400); fs.writeFileSync(path.join(OUT, `${name}.png`), (await wc.capturePage()).toPNG()); };
  const player = () => js('({ t: Player.currentTime, paused: Player.paused, rate: Player.rate, d: Player.duration })');

  await sleep(600);
  // SMOKE_EXAM_REALTIME=N5: 실전 모의 한 회를 실제 시간 그대로 진행해 끊김을 잰다 (다른 확인은 건너뜀)
  if (process.env.SMOKE_EXAM_REALTIME) {
    await examRealtime(process.env.SMOKE_EXAM_REALTIME, { js, click, exists });
    return;
  }
  check('홈 화면', await exists('.mode-card[data-mode="practice"]'), await text('h1'));
  check('창 제목 = config.appName', (await js('document.title')) === (await js('APP_CONFIG.appName')));
  const tabs = await js('Array.from(document.querySelectorAll("[data-section]")).map(b => b.dataset.section + (b.disabled ? ":off" : ":on"))');
  check('영역 탭: 청해만 활성, 나머지 준비 중', tabs.join(',') === 'listening:on,vocab:off,grammar:off', tabs.join(','));
  const blocked = await js(`fetch('https://example.com').then(() => 'reached').catch(() => 'blocked')`);
  check('외부 네트워크 요청 차단', blocked === 'blocked', blocked);
  await shot('01-home');

  const levels = await js('Object.keys(APP_CONFIG.levels)');
  for (const level of levels) {
    await click(`[data-level="${level}"]`);
    await click('[data-mode="practice"]');
    if (level === 'N3') await shot('02-setup-N3');
    const types = await js(`Listening.levelTypes(${JSON.stringify(level)})`);

    for (const type of types) {
      const tag = `${level} ${type}`;
      await click(`[data-type="${type}"]`);
      await sleep(1200);
      const p0 = await player();
      check(`${tag}: 음성 자동 재생`, !p0.paused && p0.t > 0 && p0.d > 0, `t=${p0.t.toFixed(2)} / ${p0.d.toFixed(1)}`);

      const q = await js('(() => { const n = document.querySelectorAll("[data-el=options] .opt").length; const spoken = !!document.querySelector(".opt.num-only"); return { n, spoken }; })()');
      const qdata = await js(`(() => { const lv = ${JSON.stringify(level)}.toLowerCase(); const qs = Listening.questions(${JSON.stringify(level)}).filter(q => q.type === ${JSON.stringify(type)}); return qs.map(q => ({ id: q.id, answer: q.answer, spoken: q.spokenOptions, info: Listening.audioInfo(q), n: q.options.length })); })()`);
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

  // 창이 숨겨진 상태에서도 구간 재생이 끝에서 멈추는지 (requestAnimationFrame이 멈추는 상황)
  const seg = await js('(() => { const q = Listening.questions("N5").find(x => x.type === "kadai"); return Listening.audioInfo(q).lines[1]; })()');
  win.hide();
  await sleep(300);
  await js(`Player.playSegment(${seg[0]}, ${seg[1]})`);
  await sleep(((seg[1] - seg[0]) / 1.2) * 1000 + 700);
  const ph = await player();
  win.show();
  check('창을 숨겨도 구간 끝에서 멈춤', ph.paused && Math.abs(ph.t - seg[1]) < 0.3, `${ph.t.toFixed(2)} (끝 ${seg[1]}, ${ph.paused ? '멈춤' : '재생 중'})`);

  await examTests(win, { js, click, exists, text, key, shot, player });
}

// ---------- 실전 모의 ----------
// 음성은 끝 근처로 건너뛰고, 답 고르는 시간·간격은 테스트 동안만 줄여서 처음부터 끝까지 진행한다.
async function examTests(win, { js, click, exists, text, key, shot, player }) {
  const orig = await js('({ a: Listening.cfg.answerSeconds, g: Listening.cfg.examGapSeconds })');
  await js('Listening.cfg.answerSeconds = 1; Listening.cfg.examGapSeconds = 0.2;');

  for (const level of await js('Object.keys(APP_CONFIG.levels)')) {
    const tag = `실전 ${level}`;
    await click('[data-act="back"]');
    await js('App.showHome()');
    await click(`[data-level="${level}"]`);
    await click('[data-mode="exam"]');
    await sleep(200);
    const types = await js(`Listening.levelTypes(${JSON.stringify(level)})`);
    const startRows = await js('document.querySelectorAll(".table tbody tr").length');
    const total = await js(`Listening.questions(${JSON.stringify(level)}).length`);
    check(`${tag}: 시작 화면 구성 ${types.length}유형, 문항 부족 안내`, startRows === types.length && await exists('.notice'));
    if (level === 'N3') await shot('07-exam-start-N3');

    await click('[data-act="begin"]');
    await sleep(300);
    check(`${tag}: 재생 컨트롤 없음 (일시정지·다시 듣기·속도·건너뛰기)`,
      !(await exists('[data-act="toggle"], [data-act="restart"], [data-rate], [data-act="skip"]')));

    const srcs = [];
    const answered = {};
    let expectCorrect = 0, order = 0, spaceChecked = false, changedChecked = null, shotTaken = false;
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      if (await exists('.score-card')) break;
      const s = await js(`(() => ({ phase: document.querySelector("[data-el=status]").dataset.phase,
        qid: (document.querySelector("[data-el=options]") || {}).dataset?.qid || "",
        src: Player.src, t: Player.currentTime, d: Player.duration, paused: Player.paused }))()`);
      const name = s.src.split('/').pop();
      if (name && srcs[srcs.length - 1] !== name) srcs.push(name);

      if (s.phase === 'audio' && !spaceChecked && !s.paused && s.t > 0.3) {
        await key('Space');
        spaceChecked = !(await player()).paused;
        check(`${tag}: Space로 멈추지 않음`, spaceChecked);
        spaceChecked = true;
      }
      if ((s.phase === 'audio' || s.phase === 'answer') && s.qid && !(s.qid in answered)) {
        const q = await js(`Listening.questions(${JSON.stringify(level)}).find(x => x.id === ${JSON.stringify(s.qid)})`);
        const wrong = q.answer % q.options.length + 1;
        if (order === 0) {
          await key(String(wrong));          // 처음엔 오답 → 바꿔서 정답 (답 바꾸기 확인)
          await key(String(q.answer));
          changedChecked = q.answer;
        } else {
          await click(`[data-el="options"] .opt[data-n="${order % 2 === 0 ? q.answer : wrong}"]`);
        }
        answered[s.qid] = true;
        if (order % 2 === 0) expectCorrect += 1;
        order += 1;
        if (level === 'N3' && !shotTaken && s.phase === 'audio') { shotTaken = true; await shot('08-exam-question-N3'); }
      }
      if (!s.paused && s.d > 0 && s.t < s.d - 0.5) await js(`Player.seek(${s.d - 0.3})`);
      await sleep(150);
    }

    const done = await exists('.score-card');
    check(`${tag}: 끝까지 자동 진행`, done, `${order}/${total}문항 응답`);
    if (!done) continue;
    const intros = srcs.filter((x) => x.startsWith('_intro_')).map((x) => x.replace('_intro_', '').replace('.mp3', ''));
    let structureOk = intros.join(',') === types.join(',') && srcs[0].startsWith('_intro_');
    // 지시문 뒤에는 그 유형 문항만 이어진다
    let cur = null;
    for (const x of srcs) {
      if (x.startsWith('_intro_')) cur = x.slice(7, -4);
      else if (!x.includes(`-${cur}-`)) structureOk = false;
    }
    check(`${tag}: 실제 순서 (유형마다 지시문 → 그 유형 문항)`, structureOk, srcs.join(' '));
    check(`${tag}: 전 문항 재생`, srcs.filter((x) => !x.startsWith('_intro_')).length === total);

    const score = Number(await text('[data-el="score"]'));
    const expectScore = Math.round((expectCorrect / total) * 60);
    check(`${tag}: 채점·환산 점수`, score === expectScore && (await text('.score-sub')).startsWith(`${expectCorrect} / ${total}`),
      `${score}점 (예상 ${expectScore}), ${expectCorrect}/${total}`);
    check(`${tag}: 유형별 정답률 ${types.length}줄`, (await js('document.querySelectorAll(".card .table tbody tr").length')) === types.length);
    check(`${tag}: 처음 문항 답 바꾸기 반영`, await js('document.querySelector(".exam-list li").classList.contains("ok")'));
    if (level === 'N3') await shot('09-exam-result-N3');

    await click('[data-review="0"]');
    await sleep(300);
    check(`${tag}: 결과 → 해설 보기`, (await exists('.verdict')) && (await exists('.explain .script')));
    if (level === 'N3') await shot('10-exam-review-N3');
    await click('[data-act="back"]');
    await sleep(200);
    check(`${tag}: 해설 → 결과로 돌아오기`, await exists('.score-card'));
  }

  await js(`Listening.cfg.answerSeconds = ${orig.a}; Listening.cfg.examGapSeconds = ${orig.g};`);
}

// 실전 모의 실제 시간 진행: 음성 길이 합 + 문항 수 × (답 고르는 시간 + 간격)과 실제 소요 시간을 비교한다.
async function examRealtime(level, { js, click, exists }) {
  await click(`[data-level="${level}"]`);
  await click('[data-mode="exam"]');
  await sleep(200);
  const c = await js('({ a: Listening.cfg.answerSeconds, g: Listening.cfg.examGapSeconds })');
  const t0 = Date.now();
  await click('[data-act="begin"]');
  const segs = [];   // [{ name, start, d }]
  const answered = new Set();
  let maxIdleGap = 0, lastActive = Date.now();
  while (!(await exists('.score-card')) && Date.now() - t0 < 20 * 60000) {
    const s = await js(`(() => ({ phase: document.querySelector("[data-el=status]").dataset.phase,
      qid: (document.querySelector("[data-el=options]") || {}).dataset?.qid || "", src: Player.src, d: Player.duration, paused: Player.paused }))()`);
    const name = s.src.split('/').pop();
    if (name && (!segs.length || segs[segs.length - 1].name !== name)) segs.push({ name, start: Date.now(), d: 0 });
    if (segs.length && s.d) segs[segs.length - 1].d = s.d;
    // 음성도 타이머도 없는 상태가 얼마나 이어지는지 (끊김)
    const active = !s.paused || s.phase === 'answer' || s.phase === 'gap';
    if (active) lastActive = Date.now(); else maxIdleGap = Math.max(maxIdleGap, Date.now() - lastActive);
    if ((s.phase === 'audio' || s.phase === 'answer') && s.qid && !answered.has(s.qid)) {
      answered.add(s.qid);
      const ans = await js(`Listening.questions(${JSON.stringify(level)}).find(x => x.id === ${JSON.stringify(s.qid)}).answer`);
      await click(`[data-el="options"] .opt[data-n="${ans}"]`);
    }
    await sleep(100);
  }
  const actual = (Date.now() - t0) / 1000;
  const nq = segs.filter((x) => !x.name.startsWith('_intro_')).length;
  const expected = segs.reduce((s, x) => s + x.d, 0) + nq * (c.a + c.g);
  const done = await exists('.score-card');
  check(`실전 ${level} 실제 시간: 끝까지 진행`, done, `${nq}문항`);
  check(`실전 ${level} 실제 시간: 소요 ${actual.toFixed(1)}초 ≈ 예상 ${expected.toFixed(1)}초 (차이 3초 이내)`, Math.abs(actual - expected) < 3);
  check(`실전 ${level} 실제 시간: 음성·타이머가 모두 멈춘 구간 최대 ${(maxIdleGap / 1000).toFixed(2)}초 (1초 미만)`, maxIdleGap < 1000);
  check(`실전 ${level} 실제 시간: 전 문항 정답 채점`, done && (await js('document.querySelector(".score-sub").textContent')).startsWith(`${nq} / ${nq}`));
}
