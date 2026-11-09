// ============================================================
// 개발용 스모크 테스트 — 문법 영역 (문형 사전·퀴즈, 3형식 연습, 오답노트, 실전 모의)
//   SMOKE_OUT=<출력 폴더> npx electron tools/smoke_grammar.js
// 문제 은행 크기와 상관없이 돌도록, 화면에 나온 문항의 정답은 데이터(Grammar API)에서 찾아 누른다. 앱 코드는 건드리지 않는다.
// ============================================================
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = process.env.SMOKE_OUT || path.join(__dirname, '..', 'smoke-out');
fs.mkdirSync(OUT, { recursive: true });
if (!process.env.JLPT_USER_DATA) {
  process.env.JLPT_USER_DATA = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jlpt-smoke-grammar-'));
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
  fs.writeFileSync(path.join(OUT, 'result-grammar.json'), JSON.stringify({ checks, consoleErrors }, null, 2));
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
  const shot = async (name) => { await sleep(400); fs.writeFileSync(path.join(OUT, `grammar-${name}.png`), (await wc.capturePage()).toPNG()); };
  const qid = () => js(`(document.querySelector('.gq') || {}).dataset ? document.querySelector('.gq').dataset.qid : null`);
  const home = async () => { await js(`App.state.section = 'grammar'; App.state.level = 'N5'; App.showHome(); true`); await sleep(150); };

  await sleep(800);

  // ---------- 홈 ----------
  await click('[data-section="grammar"]');
  await sleep(200);
  check('문법 탭 활성', await exists('[data-section="grammar"].active'));
  const modes = await js(`[...document.querySelectorAll('[data-mode]')].map((b) => b.dataset.mode + (b.disabled ? '(off)' : '')).join(',')`);
  check('홈 모드 4개', modes === 'points,practice,exam,review', modes);
  check('홈 요약 표', await exists('[data-el="grammar-points-summary"]'));
  await shot('home');

  // ---------- 문형 사전 ----------
  await click('[data-mode="points"]');
  await sleep(200);
  const nRows = await js(`document.querySelectorAll('.point-row').length`);
  check('문형 목록', nRows === (await js(`Grammar.points('N5').length`)), `${nRows}개`);
  await js(`(() => { const i = document.querySelector('[data-f="q"]'); i.value = 'てから'; i.dispatchEvent(new Event('input')); })()`);
  await sleep(150);
  check('문형 검색', (await js(`[...document.querySelectorAll('.point-row .w')].map((x) => x.textContent).join(',')`)).includes('〜てから'));
  await shot('points-list');
  await click('.point-row');
  await sleep(200);
  check('문형 상세: 문형·뜻·접속·예문 2개', await exists('.point-detail .point-pattern') && await exists('.connection')
    && (await js(`document.querySelectorAll('.point-detail [data-ex]').length`)) === 2);
  const simKey = await js(`(document.querySelector('[data-similar]') || {}).dataset?.similar || ''`);
  if (simKey) {
    await click('[data-similar]');
    await sleep(150);
    check('비슷한 문형으로 이동', (await js(`document.querySelector('.point-detail').dataset.key`)) === simKey, simKey);
    await click('[data-act="back"]');
    await sleep(150);
  }
  await shot('point-detail');

  // ---------- 문형 퀴즈 ----------
  await home();
  await click('[data-mode="points"]');
  await sleep(150);
  await click('[data-act="quiz"]');
  await sleep(150);
  await click('[data-format="meaning"]');
  await click('[data-count="10"]');
  await shot('quiz-setup');
  await click('[data-act="start"]');
  await sleep(200);
  const nOpts = await js(`document.querySelectorAll('button.opt').length`);
  // 문형이 적으면(샘플 단계) 비슷한 문형을 빼고 나서 선택지가 모자랄 수 있다
  check('퀴즈 4지선다', nOpts === 4 || (await js(`Grammar.points('N5').length`)) < 10, `${nOpts}`);
  const quizKey = await js(`document.querySelector('.quiz-q').dataset.key`);
  // 일부러 틀린 답 → 약한 문형
  await js(`(() => { const p = Grammar.point(${JSON.stringify(quizKey)}); const b = [...document.querySelectorAll('button.opt')].find((x) => !x.textContent.startsWith(String(x.dataset.n) + p.meaning_ko)); b.click(); })()`);
  await sleep(150);
  const qState = await js(`Grammar.pointState(Grammar.point(${JSON.stringify(quizKey)}))`);
  check('퀴즈: 채점·문형 해설, 틀리면 약한 문형', await exists('.verdict') && await exists('.point-detail') && qState === 'weak', qState);
  await shot('quiz-answered');
  for (let i = 0; i < 12 && !(await exists('[data-el="gquiz-done"]')); i++) { await click('[data-act="step-skip"]'); await sleep(60); }
  check('퀴즈 결과', /\/ 1 정답/.test(await text('[data-el="gquiz-done"] h2')), await text('[data-el="gquiz-done"] h2'));

  // ---------- 연습: 형식마다 ----------
  const types = await js(`Grammar.levelTypes('N5').filter((t) => Grammar.questions('N5').some((q) => q.type === t))`);
  for (const t of types) {
    await home();
    await js(`Grammar.prefs.order = 'seq'; Grammar.prefs.unsolvedFirst = false; true`);
    await click('[data-mode="practice"]');
    await sleep(150);
    await click(`[data-type="${t}"]`);
    await sleep(250);
    const id = await qid();
    check(`연습 ${t}: 문항 화면`, !!id, id);
    await shot(`practice-${t}`);
    if (t === 'bunpou') {
      await js(`(() => { const q = Grammar.question(${JSON.stringify(id)}); document.querySelector('button.opt[data-n="' + q.answer + '"]').click(); })()`);
      await sleep(200);
      check('bunpou: 정답 → 해설(완성 문장·해석·선택지·문형)', (await text('.verdict')).startsWith('정답')
        && await exists('.explain .full') && await exists('.explain .ko') && await exists('.opt-notes') && await exists('[data-point]'));
      check('bunpou: 기록', (await js(`Storage.item('grammar', ${JSON.stringify(id)}).lastCorrect`)) === true);
      await shot('bunpou-explain');
      await click('[data-point]');
      await sleep(150);
      check('해설 → 문형 사전', await exists('.point-detail'));
      await click('[data-act="back"]');
      await sleep(150);
      check('문형 사전 → 해설로 돌아옴', await exists('.verdict'));
    } else if (t === 'narabe') {
      // 틀린 순서(★ 자리에 정답이 아닌 조각) → 확인
      const q = await js(`Grammar.question(${JSON.stringify(id)})`);
      const star = await js(`GrammarQuestionView.starIndex(Grammar.question(${JSON.stringify(id)}))`);
      const wrong = q.order.slice();
      const other = (star + 1) % 4;
      [wrong[star], wrong[other]] = [wrong[other], wrong[star]];
      check('narabe: 확인은 다 놓기 전엔 꺼짐', await js(`document.querySelector('[data-act="check"]').disabled`));
      for (const n of wrong) { await click(`[data-chip="${n}"]`); await sleep(60); }
      check('narabe: 조각을 누르면 자리에 놓임', (await js(`document.querySelectorAll('.slot.filled').length`)) === 4);
      await click('.slot[data-slot="0"]');
      await sleep(60);
      check('narabe: 놓인 조각을 누르면 빠짐', (await js(`document.querySelectorAll('.slot.filled').length`)) === 3);
      await click(`[data-chip="${wrong[0]}"]`);
      await sleep(60);
      await shot('narabe-placed');
      await click('[data-act="check"]');
      await sleep(200);
      check('narabe: ★ 틀리면 오답 + 바른 순서', (await text('.verdict')).startsWith('오답') && await exists('.order-line'));
      check('narabe: 오답노트', (await js(`Storage.item('grammar', ${JSON.stringify(id)}).review`)) === true);
      await shot('narabe-explain');
    } else if (t === 'bunshou') {
      const q = await js(`Grammar.question(${JSON.stringify(id)})`);
      check('bunshou: 글·빈칸', (await js(`document.querySelectorAll('[data-el="passage"] .gap').length`)) === q.items.length
        && (await js(`document.querySelectorAll('.gitem').length`)) === q.items.length);
      for (let i = 0; i < q.items.length; i++) {
        const n = i === 0 ? (q.items[0].answer % 4) + 1 : q.items[i].answer;   // 첫 빈칸만 틀리게
        await click(`[data-item-box="${i}"] button.opt[data-n="${n}"]`);
        await sleep(100);
      }
      check('bunshou: 빈칸마다 채점·해설', (await js(`document.querySelectorAll('.item-explain').length`)) === q.items.length);
      check('bunshou: 다 풀면 완성 글·해석', await exists('.explain .full') && (await text('.verdict')).includes(`${q.items.length - 1} / ${q.items.length}`));
      check('bunshou: 빈칸별 기록', (await js(`Storage.item('grammar', ${JSON.stringify(id + '#1')}).review`)) === true
        && (await js(`Storage.item('grammar', ${JSON.stringify(id + '#2')}).lastCorrect`)) === true);
      await shot('bunshou-explain');
    }
    // 이전·건너뛰기
    check(`연습 ${t}: 이전·건너뛰기 버튼`, await exists('[data-act="step-skip"]'));
  }

  // ---------- 오답노트 ----------
  await home();
  const nReview = await js(`Grammar.reviewList('N5').length`);
  check('오답노트에 틀린 문항', nReview >= 1, `${nReview}`);
  await click('[data-mode="review"]');
  await sleep(150);
  await shot('review');
  await click('[data-act="all"]');
  await sleep(200);
  check('오답노트 다시 풀기', !!(await qid()));

  // ---------- 실전 모의 ----------
  await home();
  await click('[data-mode="exam"]');
  await sleep(200);
  await shot('exam-start');
  await click('[data-act="begin"]');
  await sleep(250);
  check('실전: 번호 목록·타이머', await exists('.qnav-btn') && (await text('[data-el="timer"]')).startsWith('남은 시간'));
  // 모든 문항에 정답을 넣는다
  const n = await js(`document.querySelectorAll('.qnav-btn').length`);
  for (let i = 0; i < n; i++) {
    await click(`[data-go="${i}"]`);
    await sleep(80);
    const id = await qid();
    const q = await js(`Grammar.question(${JSON.stringify(id)})`);
    if (q.type === 'bunpou') await click(`[data-el="options"] .opt[data-n="${q.answer}"]`);
    else if (q.type === 'narabe') { for (const c of q.order) { await click(`[data-chip="${c}"]`); await sleep(40); } }
    else for (let k = 0; k < q.items.length; k++) { await click(`[data-item-box="${k}"] .opt[data-n="${q.items[k].answer}"]`); await sleep(40); }
    await sleep(60);
    if (i === 0) await shot('exam-q');
    if (q.type === 'narabe' && !(await exists('.exam-q .slot.filled'))) check('실전 narabe 조각 놓기', false);
  }
  check('실전: 모든 번호 답함', (await js(`document.querySelectorAll('.qnav-btn.unanswered').length`)) === 0);
  await js(`window.confirm = () => true; true`);
  await click('[data-act="submit"]');
  await sleep(250);
  const score = await text('.gexam-result .score-big');
  const want = await js(`Grammar.exams('N5').slice(-1)[0].total`);
  check('실전: 전부 정답으로 채점', score.replace(/\s/g, '') === `${want}/${want}`, score);
  await shot('exam-result');
  await click('[data-review="0"]');
  await sleep(200);
  check('실전 결과 → 문항 해설', await exists('.verdict'));

  // ---------- 폰 화면 폭 ----------
  win.setContentSize(384, 860);
  await sleep(300);
  await home();
  await click('[data-mode="practice"]');
  await sleep(150);
  for (const t of types) {
    await js(`GrammarPractice.showSetup('N5')`);
    await sleep(100);
    await click(`[data-type="${t}"]`);
    await sleep(200);
    const over = await js('document.documentElement.scrollWidth - window.innerWidth');
    check(`폰 폭: ${t} 가로 넘침 없음`, over <= 0, `${over}`);
    await shot(`phone-${t}`);
  }
}
