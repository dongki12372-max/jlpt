// ============================================================
// 앱 뼈대: 화면 전환, 키보드 라우팅, 홈(영역 → 레벨 → 오늘의 학습(js/daily.js) → 모드)
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
  let screen = '';   // 'home' | 'settings' | '' — 동기화로 기록이 바뀌면 이 화면들만 다시 그린다

  const root = () => document.getElementById('app');

  function registerSection(id, module) {
    modules[id] = module;
  }
  const isActive = (id) => !!(cfg.sections[id] && cfg.sections[id].enabled && modules[id]);

  // ---------- 화면 전환 ----------
  // onKey: 이 화면의 키보드 처리, onLeave: 화면을 떠날 때 정리
  function setScreen(html, { onKey = null, onLeave = null } = {}) {
    if (cleanup) cleanup();
    screen = '';
    Player.stop();
    if (typeof Dict !== 'undefined') Dict.close();
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
          <p class="dim">JLPT 연습</p>
        </div>
        <button class="secondary" data-act="settings">설정</button>
      </header>

      <nav class="section-tabs">${sectionTabs}</nav>

      <nav class="level-tabs">
        ${LEVELS.map((l) => `<button class="tab ${l === level ? 'active' : ''}" data-level="${l}">${cfg.levels[l].label}</button>`).join('')}
      </nav>

      ${Daily.homeHtml(level)}

      <section class="modes">${modes}</section>

      ${mod.summary(level)}
    `);

    screen = 'home';
    Daily.bindHome(root(), level);
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
      <section class="card settings" data-el="sync">${syncHtml()}</section>
      <section class="card settings">
        <h2>기록</h2>
        <div class="row">
          <span>기록을 파일로 저장하거나, 저장한 파일의 기록을 이 기기 기록과 합칩니다 (같은 문항은 나중 기록이 남음).</span>
          <span class="row-btns">
            <button class="secondary" data-act="export">내보내기</button>
            <button class="secondary" data-act="import">가져오기</button>
            <input type="file" accept=".json,application/json" data-el="import-file" hidden>
          </span>
        </div>
        <div class="row">
          <span>모든 풀이 기록, 오답노트, 실전 모의 기록, 설정을 지웁니다.</span>
          <button class="secondary danger" data-act="reset">기록 초기화</button>
        </div>
        <p class="dim small saved" data-el="saved"></p>
      </section>
    `, { onKey: (e) => { if (e.key === 'Escape') showHome(); } });

    screen = 'settings';
    bindSync();
    const saved = () => { root().querySelector('[data-el="saved"]').textContent = '저장했습니다.'; };
    root().querySelector('[data-act="home"]').addEventListener('click', showHome);
    root().querySelector('[data-setting="furigana"]').addEventListener('change', (e) => {
      Storage.setSetting('common', 'furigana', e.target.checked);
      saved();
    });
    active.filter((id) => modules[id].settings).forEach((id) => modules[id].settings.bind(root(), saved));
    root().querySelector('[data-act="export"]').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(Storage.data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      a.download = `jlpt-기록-${ymd}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    const fileInput = root().querySelector('[data-el="import-file"]');
    root().querySelector('[data-act="import"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const raw = JSON.parse(await file.text());
        if (!window.confirm('이 파일의 기록을 지금 기록과 합칠까요?')) return;
        await Storage.importMerge(raw);
        showSettings();
        root().querySelector('[data-el="saved"]').textContent = '기록을 가져왔습니다.';
      } catch (e) {
        root().querySelector('[data-el="saved"]').textContent = `가져오지 못했습니다: ${e.message}`;
      }
    });
    root().querySelector('[data-act="reset"]').addEventListener('click', async () => {
      const synced = Sync.enabled();
      if (!window.confirm(`모든 기록과 설정을 초기화할까요? 되돌릴 수 없습니다.${synced ? '\n동기화 중인 다른 기기의 기록도 함께 지워집니다.' : ''}`)) return;
      const keep = Storage.data.settings.sync;
      await Storage.resetAll();
      if (keep) { Storage.data.settings.sync = keep; await Sync.overwriteRemote(); Storage.save({ quiet: true }); }
      showSettings();
      root().querySelector('[data-el="saved"]').textContent = '기록을 초기화했습니다.';
    });
  }

  // ---------- 기기 간 동기화 (설정 화면) ----------
  function syncStatusText() {
    const st = Sync.state;
    if (st.status === 'syncing') return '동기화 중…';
    if (st.status === 'offline') return `인터넷에 연결되지 않아 이 기기에만 저장 중 (연결되면 자동으로 맞춥니다)`;
    if (st.status === 'error') return `동기화 실패: ${Util.esc(st.error)}`;
    return Sync.lastSync ? `마지막 동기화 ${new Date(Sync.lastSync).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
  }
  function syncHtml() {
    if (!Sync.available()) {
      return `<h2>기기 간 동기화</h2><p class="dim">동기화 서버가 아직 설정되지 않았습니다 (config.sync).</p>`;
    }
    if (!Sync.enabled()) {
      return `
        <h2>기기 간 동기화</h2>
        <p>폰·컴퓨터·맥 앱에서 같은 진도로 이어서 풀 수 있습니다. 계정 없이 <b>동기화 코드</b> 하나로 연결합니다.</p>
        <div class="row"><span>처음이면: 이 기기에서 코드를 만듭니다 (지금 기록을 올립니다).</span>
          <button class="primary" data-act="sync-create">동기화 켜기</button></div>
        <div class="row sync-join"><span>다른 기기에서 만든 코드가 있으면:</span>
          <span class="row-btns"><input type="text" data-el="sync-code" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false">
          <button class="secondary" data-act="sync-join">연결</button></span></div>
        <p class="small" data-el="sync-msg"></p>`;
    }
    return `
      <h2>기기 간 동기화 <span class="badge ok">켜짐</span></h2>
      <p>다른 기기의 설정 → 기기 간 동기화에서 이 코드를 넣으세요. <b>코드를 아는 사람은 기록을 볼 수 있으니</b> 다른 사람에게 알려 주지 마세요.</p>
      <p class="sync-code" lang="en" data-el="sync-code-show">${Sync.showCode(Sync.code())}</p>
      <div class="next-row left">
        <button class="secondary" data-act="sync-copy">코드 복사</button>
        <button class="secondary" data-act="sync-now">지금 동기화</button>
        <button class="link danger" data-act="sync-off">이 기기에서 끄기</button>
      </div>
      <p class="dim small" data-el="sync-status">${syncStatusText()}</p>`;
  }
  function bindSync() {
    const box = root().querySelector('[data-el="sync"]');
    if (!box) return;
    const msg = (t, cls = '') => { const el = box.querySelector('[data-el="sync-msg"]'); if (el) { el.textContent = t; el.className = `small ${cls}`; } };
    const rerender = () => { box.innerHTML = syncHtml(); bindSync(); };
    const on = (act, fn) => { const b = box.querySelector(`[data-act="${act}"]`); if (b) b.addEventListener('click', fn); };
    on('sync-create', async (e) => {
      e.target.disabled = true;
      msg('만드는 중…');
      try { await Sync.create(); rerender(); } catch (err) { msg(`실패: ${err.message}`, 'error'); e.target.disabled = false; }
    });
    on('sync-join', async (e) => {
      e.target.disabled = true;
      msg('연결 중…');
      try { await Sync.join(box.querySelector('[data-el="sync-code"]').value); rerender(); } catch (err) { msg(err.message, 'error'); e.target.disabled = false; }
    });
    on('sync-copy', async () => {
      try { await navigator.clipboard.writeText(Sync.showCode(Sync.code())); box.querySelector('[data-el="sync-status"]').textContent = '코드를 복사했습니다.'; } catch (err) { /* 복사가 막힌 환경: 코드를 직접 보고 옮긴다 */ }
    });
    on('sync-now', () => Sync.syncNow());
    on('sync-off', () => {
      if (!window.confirm('이 기기에서 동기화를 끌까요? 기록은 이 기기에 그대로 남고, 코드를 다시 넣으면 이어서 쓸 수 있습니다.')) return;
      Sync.disable();
      rerender();
    });
  }
  // 동기화 상태가 바뀌면 설정 화면 글자를, 다른 기기 기록이 들어오면 홈·설정 화면을 다시 그린다
  Sync.onChange((st, changedLocal) => {
    if (changedLocal && screen === 'home') { showHome(); return; }
    if (screen !== 'settings') return;
    const el = root().querySelector('[data-el="sync-status"]');
    if (el) el.textContent = syncStatusText();
  });

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
      // 동기화가 켜져 있으면 다른 기기 기록을 먼저 받는다 (인터넷이 느리거나 없으면 4초만 기다리고 시작)
      if (Sync.enabled()) await Promise.race([Sync.syncNow(), new Promise((r) => setTimeout(r, 4000))]);
      await Promise.all(active.map((id) => modules[id].load()));
    } catch (e) {
      root().innerHTML = `<p class="error">데이터를 읽지 못했습니다: ${Util.esc(e.message)}</p>`;
      return;
    }
    showHome();
  }

  return { init, registerSection, setScreen, showHome, showSettings, cfg, state };
})();
