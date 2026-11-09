// ============================================================
// 데이터·기록 읽기 (window.jlpt): 데이터·음성은 리포와 같은 폴더 구조로 함께 올리고 fetch로 읽는다 (tools/deploy_web.sh).
//   기록은 이 브라우저의 localStorage — 기기 사이는 sync.js(동기화 코드)나 설정 화면의 내보내기·가져오기로 맞춘다.
// ============================================================
(() => {
  const KEY = 'jlpt-progress';
  const LEVEL_KEYS = Object.keys(window.APP_CONFIG.levels).map((l) => l.toLowerCase());
  const DATA = '../../data';
  const AUDIO = '../../audio';

  async function getJson(url, fallback) {
    try {
      const r = await fetch(url);
      return r.ok ? await r.json() : fallback;
    } catch (e) { return fallback; }
  }
  const perLevel = async (dir) =>
    Object.fromEntries(await Promise.all(LEVEL_KEYS.map(async (k) => [k, await getJson(`${dir}/${k}.json`, [])])));

  // 영역별 데이터: { questions, manifest } 등 — 각 영역 index.js의 load()가 쓴다
  const LOADERS = {
    listening: async () => ({
      questions: await perLevel(`${DATA}/listening/questions`),
      manifest: await getJson(`${AUDIO}/listening/manifest.json`, {}),
    }),
    vocab: async () => ({
      words: await perLevel(`${DATA}/vocab/words`),
      questions: await perLevel(`${DATA}/vocab/questions`),
      manifest: await getJson(`${AUDIO}/vocab/manifest.json`, {}),
    }),
    grammar: async () => ({
      points: await perLevel(`${DATA}/grammar/points`),
      questions: await perLevel(`${DATA}/grammar/questions`),
      manifest: await getJson(`${AUDIO}/grammar/manifest.json`, {}),
    }),
  };

  // 브라우저가 저장 공간이 부족할 때 기록을 지우지 않도록 요청 (지원하는 브라우저만)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  window.jlpt = {
    web: true,
    loadSection: async (section) => {
      if (!Object.prototype.hasOwnProperty.call(LOADERS, section)) throw new Error('알 수 없는 영역: ' + section);
      return LOADERS[section]();
    },
    readImage: async (section, name) => {
      if (!/^[a-z0-9-]+\.svg$/.test(String(name))) throw new Error('잘못된 그림 파일명: ' + name);
      const r = await fetch(`${DATA}/${section}/images/${name}`);
      if (!r.ok) throw new Error('그림을 읽지 못했습니다: ' + name);
      return r.text();
    },
    loadProgress: async () => {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        // 깨진 기록은 지우지 않고 옆에 보관한 뒤 빈 기록으로 시작한다
        localStorage.setItem(`${KEY}.broken-${Date.now()}`, raw);
        return null;
      }
    },
    saveProgress: async (data) => {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    },
  };
})();
