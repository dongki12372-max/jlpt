// ============================================================
// 앱 뼈대: 화면 전환, 키보드 라우팅, 홈(영역 → 레벨 → 모드)
//   영역 모듈은 App.registerSection(id, module)로 등록한다 (js/{영역}/index.js).
//   module = {
//     load():            영역 데이터 읽기 (Promise)
//     modes(level):      [{ id, title, desc, enabled, open() }]  홈의 모드 버튼
//     summary(level):    홈 아래쪽 요약 HTML
//   }
//   config.sections에서 enabled=false이거나 모듈이 없는 영역은 '준비 중'으로 표시한다.
// ============================================================
const App = (() => {
  const cfg = window.APP_CONFIG;
  const LEVELS = Object.keys(cfg.levels);   // ['N5', 'N4', 'N3']
  const modules = {};
  const state = { section: cfg.defaultSection, level: LEVELS[0] };

  let keyHandler = null;
  let cleanup = null;

  const root = () => document.getElementById('app');

  function registerSection(id, module) {
    modules[id] = module;
  }
  const isActive = (id) => !!(cfg.sections[id] && cfg.sections[id].enabled && modules[id]);

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

  // ---------- 홈 ----------
  function showHome() {
    const { section, level } = state;
    const mod = modules[section];

    const sectionTabs = cfg.sectionOrder.map((id) => {
      const s = cfg.sections[id];
      const active = isActive(id);
      return `
        <button class="section-tab ${id === section ? 'active' : ''}" data-section="${id}" ${active ? '' : 'disabled'}>
          <span class="section-ko">${Util.esc(s.label_ko)}</span>
          <span class="section-ja" lang="ja">${Util.esc(s.label_ja)}</span>
          ${active ? '' : '<span class="soon">준비 중</span>'}
        </button>`;
    }).join('');

    const modes = mod.modes(level).map((m) => `
      <button class="mode-card" data-mode="${m.id}" ${m.enabled ? '' : 'disabled'}>
        <span class="mode-title">${Util.esc(m.title)}</span>
        <span class="mode-desc">${Util.esc(m.desc)}</span>
      </button>`).join('');

    setScreen(`
      <header class="app-header">
        <h1>${Util.esc(cfg.appName)}</h1>
        <p class="dim">JLPT 연습 · 오프라인</p>
      </header>

      <nav class="section-tabs">${sectionTabs}</nav>

      <nav class="level-tabs">
        ${LEVELS.map((l) => `<button class="tab ${l === level ? 'active' : ''}" data-level="${l}">${cfg.levels[l].label}</button>`).join('')}
      </nav>

      <section class="modes">${modes}</section>

      ${mod.summary(level)}
    `);

    root().querySelectorAll('[data-section]:not(:disabled)').forEach((b) =>
      b.addEventListener('click', () => { state.section = b.dataset.section; showHome(); }));
    root().querySelectorAll('[data-level]').forEach((b) =>
      b.addEventListener('click', () => { state.level = b.dataset.level; showHome(); }));
    const opens = Object.fromEntries(mod.modes(level).map((m) => [m.id, m.open]));
    root().querySelectorAll('[data-mode]:not(:disabled)').forEach((b) =>
      b.addEventListener('click', () => opens[b.dataset.mode]()));
  }

  // ---------- 시작 ----------
  async function init() {
    document.title = cfg.appName;
    const active = cfg.sectionOrder.filter(isActive);
    if (!active.length) {
      root().innerHTML = '<p class="error">활성화된 영역이 없습니다 (config.sections).</p>';
      return;
    }
    if (!isActive(state.section)) state.section = active[0];
    try {
      await Promise.all(active.map((id) => modules[id].load()));
    } catch (e) {
      root().innerHTML = `<p class="error">데이터를 읽지 못했습니다: ${Util.esc(e.message)}</p>`;
      return;
    }
    showHome();
  }

  return { init, registerSection, setScreen, showHome, cfg, state };
})();
