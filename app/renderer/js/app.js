// ============================================================
// 앱 뼈대: 데이터 로드, 화면 전환, 키보드 라우팅, 홈 화면
// ============================================================
const App = (() => {
  const cfg = window.APP_CONFIG;
  const LEVELS = Object.keys(cfg.levels);   // ['N5', 'N4', 'N3']
  const state = { data: null, level: LEVELS[0] };

  let keyHandler = null;
  let cleanup = null;

  const root = () => document.getElementById('app');

  // ---------- 화면 전환 ----------
  // onKey: 이 화면의 키보드 처리, onLeave: 화면을 떠날 때 정리
  function setScreen(html, { onKey = null, onLeave = null } = {}) {
    if (cleanup) cleanup();
    Player.stop();
    root().innerHTML = html;
    keyHandler = onKey;
    cleanup = onLeave;
    window.scrollTo(0, 0);
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && e.target.type !== 'radio') return;
    if (keyHandler) keyHandler(e);
  });

  // ---------- 데이터 도우미 ----------
  const questions = (level) => state.data.questions[level.toLowerCase()] || [];
  const levelTypes = (level) => cfg.typeOrder.filter((t) => t in cfg.levels[level].exam);
  const audioUrl = (q) => `../../audio/${q.level.toLowerCase()}/${q.id}.mp3`;
  const audioInfo = (q) => state.data.manifest[q.id] || null;

  // ---------- 홈 ----------
  function showHome() {
    const level = state.level;
    const qs = questions(level);
    const rows = levelTypes(level).map((t) => {
      const ofType = qs.filter((q) => q.type === t);
      const withAudio = ofType.filter((q) => audioInfo(q)).length;
      return `
        <tr>
          <td><span lang="ja">${cfg.types[t].label_ja}</span> <span class="dim">${cfg.types[t].label_ko}</span></td>
          <td class="num">${ofType.length}</td>
          <td class="num">${cfg.levels[level].exam[t]}</td>
          <td class="num ${withAudio < ofType.length ? 'warn' : ''}">${withAudio} / ${ofType.length}</td>
        </tr>`;
    }).join('');

    setScreen(`
      <header class="app-header">
        <h1>${Util.esc(cfg.appName)}</h1>
        <p class="dim">JLPT 청해(聴解) 연습 · 오프라인</p>
      </header>

      <nav class="level-tabs">
        ${LEVELS.map((l) => `<button class="tab ${l === level ? 'active' : ''}" data-level="${l}">${l}</button>`).join('')}
      </nav>

      <section class="modes">
        <button class="mode-card" data-mode="practice">
          <span class="mode-title">유형별 연습</span>
          <span class="mode-desc">유형을 골라 한 문제씩 풀고 바로 해설 확인</span>
        </button>
        <button class="mode-card" disabled>
          <span class="mode-title">실전 모의</span>
          <span class="mode-desc">준비 중</span>
        </button>
        <button class="mode-card" disabled>
          <span class="mode-title">오답노트</span>
          <span class="mode-desc">준비 중</span>
        </button>
      </section>

      <section class="card">
        <h2>${level} 문제 은행</h2>
        <table class="table">
          <thead><tr><th>유형</th><th class="num">문항</th><th class="num">실전 구성</th><th class="num">음성</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `);

    root().querySelectorAll('[data-level]').forEach((b) =>
      b.addEventListener('click', () => { state.level = b.dataset.level; showHome(); }));
    root().querySelector('[data-mode="practice"]').addEventListener('click', () => Practice.showSetup(level));
  }

  // ---------- 시작 ----------
  async function init() {
    document.title = cfg.appName;
    try {
      state.data = await window.jlpt.loadData();
    } catch (e) {
      root().innerHTML = `<p class="error">문제 은행을 읽지 못했습니다: ${Util.esc(e.message)}</p>`;
      return;
    }
    showHome();
  }

  return { init, setScreen, showHome, questions, levelTypes, audioUrl, audioInfo, cfg, state };
})();

App.init();
