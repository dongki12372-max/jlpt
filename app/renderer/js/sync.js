// ============================================================
// 기기 간 동기화 — 계정 없이 「동기화 코드」 하나로 (Firebase Firestore REST, config.sync)
//   한 기기에서 코드를 만들고 다른 기기에서 그 코드를 넣으면, 같은 기록을 서로 합쳐 쓴다.
//   저장 위치: sync/{코드} = { chunks, updatedAt } + sync/{코드}/chunks/{i} = { data: 기록 JSON 조각 }
//   (문서 하나가 1MB를 넘지 않게 나눈다). 코드는 20자(약 100비트)라 코드를 아는 기기만 읽고 쓸 수 있다.
//   동기화 = 받기 → Storage.merge로 합치기 → 합친 결과가 서버와 다르면 올리기.
//   언제: 앱을 열 때, 기록이 바뀌고 몇 초 뒤, 화면으로 돌아왔을 때·떠날 때, 「지금 동기화」.
//   이 기기의 동기화 설정은 Storage.data.settings.sync = { code, lastSync } (서버에 올리지 않는다)
// ============================================================
const Sync = (() => {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 헷갈리는 0·O·1·I 제외
  const CODE_LEN = 20;
  const CHUNK = 300000;      // 조각 하나의 글자 수 (일본어가 섞여도 1MB 아래)
  const DEBOUNCE = 4000;     // 기록이 바뀐 뒤 올리기까지 기다리는 시간(ms)

  const conf = () => window.APP_CONFIG.sync || {};
  const available = () => !!conf().projectId;
  const local = () => Storage.data.settings.sync || null;
  const code = () => (local() || {}).code || null;
  const enabled = () => available() && !!code();

  let timer = 0;
  let running = null;
  let state = { status: 'idle', error: '' };
  const listeners = [];
  const onChange = (fn) => listeners.push(fn);
  const emit = (changedLocal = false) => listeners.forEach((fn) => fn(state, changedLocal));

  // ---------- 코드 ----------
  function newCode() {
    const bytes = new Uint8Array(CODE_LEN);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  }
  const normalizeCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const validCode = (c) => c.length === CODE_LEN && [...c].every((ch) => ALPHABET.includes(ch));
  const showCode = (c) => (c || '').match(/.{1,4}/g)?.join('-') || '';

  // ---------- Firestore REST ----------
  const endpoint = () => conf().endpoint || 'https://firestore.googleapis.com/v1';
  const docUrl = (c, sub = '') => `${endpoint()}/projects/${conf().projectId}/databases/(default)/documents/sync/${c}${sub}${conf().apiKey ? `?key=${conf().apiKey}` : ''}`;

  async function request(url, init) {
    let r;
    try {
      r = await fetch(url, init);
    } catch (e) {
      throw Object.assign(new Error('인터넷에 연결되지 않았습니다'), { offline: true });
    }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`서버 응답 ${r.status}`);
    return r.json();
  }
  const patch = (url, fields) => request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });

  // 서버의 기록 (없으면 null)
  async function getRemote(c) {
    const meta = await request(docUrl(c));
    if (!meta || !meta.fields) return null;
    const n = Number(meta.fields.chunks.integerValue);
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => request(docUrl(c, `/chunks/${i}`))));
    if (parts.some((p) => !p)) throw new Error('서버 기록이 아직 다 올라가지 않았습니다');
    return JSON.parse(parts.map((p) => p.fields.data.stringValue).join(''));
  }

  // 서버에 올릴 기록: 이 기기 전용 설정(settings.sync)은 뺀다
  function shareable(d) {
    const copy = JSON.parse(JSON.stringify(d));
    delete copy.settings.sync;
    return copy;
  }

  async function putRemote(c, d) {
    const s = JSON.stringify(shareable(d));
    const parts = [];
    for (let i = 0; i < s.length; i += CHUNK) parts.push(s.slice(i, i + CHUNK));
    // 조각을 먼저 쓰고 마지막에 개수를 쓴다 (읽는 쪽이 반쯤 쓴 기록을 덜 보게)
    await Promise.all(parts.map((p, i) => patch(docUrl(c, `/chunks/${i}`), { data: { stringValue: p } })));
    await patch(docUrl(c), { chunks: { integerValue: String(parts.length) }, updatedAt: { integerValue: String(d.updatedAt || Date.now()) } });
  }

  // ---------- 동기화 ----------
  function setLocal(v) {
    if (v) Storage.data.settings.sync = v;
    else delete Storage.data.settings.sync;
    Storage.save({ quiet: true });
  }

  // 받기 → 합치기 → 필요하면 올리기. 이미 돌고 있으면 그 결과를 기다린다
  function syncNow() {
    if (!enabled()) return Promise.resolve(false);
    if (running) return running;
    clearTimeout(timer);
    running = (async () => {
      state = { status: 'syncing', error: '' };
      emit();
      let changedLocal = false;
      try {
        const c = code();
        const remote = await getRemote(c);
        if (remote) changedLocal = Storage.mergeIn(remote);
        if (!remote || JSON.stringify(shareable(Storage.data)) !== JSON.stringify(shareable(remote))) {
          await putRemote(c, Storage.data);
        }
        setLocal({ ...local(), lastSync: Date.now() });
        state = { status: 'idle', error: '' };
      } catch (e) {
        state = { status: e.offline ? 'offline' : 'error', error: e.message };
      }
      running = null;
      emit(changedLocal);
      return changedLocal;
    })();
    return running;
  }

  // 기록이 바뀌면 잠시 뒤 동기화 (연달아 바뀌면 한 번만)
  function schedule() {
    if (!enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, DEBOUNCE);
  }

  // 이 기기에서 새 코드로 시작 (지금 기록을 서버에 올린다)
  async function create() {
    const c = newCode();
    setLocal({ code: c });
    await syncNow();
    if (state.status !== 'idle') { setLocal(null); throw new Error(state.error); }
    return c;
  }

  // 다른 기기에서 만든 코드로 연결 (서버 기록과 이 기기 기록을 합친다)
  async function join(input) {
    const c = normalizeCode(input);
    if (!validCode(c)) throw new Error(`동기화 코드는 ${CODE_LEN}자입니다 (영문·숫자)`);
    const remote = await getRemote(c);
    if (!remote) throw new Error('이 코드의 기록이 서버에 없습니다. 코드를 다시 확인해 주세요');
    setLocal({ code: c });
    await syncNow();
    if (state.status !== 'idle') throw new Error(state.error);
    return c;
  }

  function disable() {
    clearTimeout(timer);
    setLocal(null);
    state = { status: 'idle', error: '' };
    emit();
  }

  // 기록 초기화를 다른 기기에도: 합치지 않고 서버 기록을 지금(빈) 기록으로 덮어쓴다
  async function overwriteRemote() {
    if (!enabled()) return;
    try { await putRemote(code(), Storage.data); } catch (e) { state = { status: 'error', error: e.message }; emit(); }
  }

  Storage.onSave(schedule);
  document.addEventListener('visibilitychange', () => {
    if (!enabled()) return;
    syncNow();   // 화면을 떠날 때는 올리고, 돌아오면 다른 기기 기록을 받는다
  });

  return {
    available, enabled, code, showCode, normalizeCode, validCode, syncNow, schedule, create, join, disable, overwriteRemote, onChange,
    get state() { return state; }, get lastSync() { return (local() || {}).lastSync || 0; },
  };
})();
