// ============================================================
// 앱 뼈대: 화면 전환, 키보드 라우팅, 홈(영역 → 레벨 → 모드)
//   영역 모듈은 App.registerSection(id, module)로 등록한다 (js/{영역}/index.js).
//   module = {
//     load():            영역 데이터 읽기 (Promise)
//     modes(level):      [{ id, title, desc, enabled, open() }]  홈의 모드 버튼
//     summary(level):    홈 아래쪽 요약 HTML
//     settings?:         { render(): HTML, bind(root) }  설정 화면의 영역별 항목
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
        <div>
          <h1>${Util.esc(cfg.appName)}</h1>
          <p class="dim">JLPT 연습 · 오프라인</p>
        </div>
        <button class="secondary" data-act="settings">설정</button>
      </header>

      <nav class="section-tabs">${sectionTabs}</nav>

      <nav class="level-tabs">
        ${LEVELS.map((l) => `<button class="tab ${l === level ? 'active' : ''}" data-level="${l}">${cfg.levels[l].label}</button>`).join('')}
      </nav>

      <section class="modes">${modes}</section>

      ${mod.summary(level)}
    `);

    root().querySelector('[data-act="settings"]').addEventListener('click', showSettings);
    root().querySelectorAll('[data-section]:not(:disabled)').forEach((b) =>
      b.addEventListener('click', () => { state.section = b.dataset.section; showHome(); }));
    root().querySelectorAll('[data-level]').forEach((b) =>
      b.addEventListener('click', () => { state.level = b.dataset.level; showHome(); }));
    const opens = Object.fromEntries(mod.modes(level).map((m) => [m.id, m.open]));
    root().querySelectorAll('[data-mode]:not(:disabled)').forEach((b) =>
      b.addEventListener('click', () => opens[b.dataset.mode]()));
  }

  // ---------- 설정 ----------
  function showSettings() {
    const active = cfg.sectionOrder.filter(isActive);
    const sectionBlocks = active.filter((id) => modules[id].settings).map((id) => `
      <section class="card settings">
        <h2>${Util.esc(cfg.sections[id].label_ko)}</h2>
        ${modules[id].settings.render()}
      </section>`).join('');

    setScreen(`
      <div class="topbar">
        <button class="link" data-act="home">← 홈</button>
        <span class="crumb">설정</span>
      </div>
      <section class="card settings">
        <h2>공통</h2>
        <label class="row">
          <span>후리가나 표시</span>
          <input type="checkbox" data-setting="furigana" ${Storage.getSetting('common', 'furigana', true) ? 'checked' : ''}>
        </label>
      </section>
      ${sectionBlocks}
      <section class="card settings">
        <h2>기록</h2>
        <div class="row">
          <span>모든 풀이 기록, 오답노트, 실전 모의 기록, 설정을 지웁니다.</span>
          <button class="secondary danger" data-act="reset">기록 초기화</button>
        </div>
        <p class="dim small saved" data-el="saved"></p>
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') showHome(); } });

    const saved = () => { root().querySelector('[data-el="saved"]').textContent = '저장했습니다.'; };
    root().querySelector('[data-act="home"]').addEventListener('click', showHome);
    root().querySelector('[data-setting="furigana"]').addEventListener('change', (e) => {
      Storage.setSetting('common', 'furigana', e.target.checked);
      saved();
    });
    active.filter((id) => modules[id].settings).forEach((id) => modules[id].settings.bind(root(), saved));
    root().querySelector('[data-act="reset"]').addEventListener('click', async () => {
      if (!window.confirm('모든 기록과 설정을 초기화할까요? 되돌릴 수 없습니다.')) return;
      await Storage.resetAll();
      showSettings();
      root().querySelector('[data-el="saved"]').textContent = '기록을 초기화했습니다.';
    });
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
      await Storage.load();
      await Promise.all(active.map((id) => modules[id].load()));
    } catch (e) {
      root().innerHTML = `<p class="error">데이터를 읽지 못했습니다: ${Util.esc(e.message)}</p>`;
      return;
    }
    showHome();
  }

  return { init, registerSection, setScreen, showHome, showSettings, cfg, state };
})();
