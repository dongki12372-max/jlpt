// ============================================================
// Electron 메인 프로세스
//   - 렌더러(index.html) 로드, 앱 이름은 config.js의 appName
//   - IPC: 영역(section)별 데이터 읽기, 그림(SVG) 읽기
//   - 오프라인 앱: file:// 외 요청은 모두 차단
// ============================================================
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');     // data/{영역}/
const AUDIO_DIR = path.join(ROOT, 'audio');   // audio/{영역}/
const LEVEL_KEYS = Object.keys(config.levels).map((l) => l.toLowerCase());

app.setName(config.appName);

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 880,
    minWidth: 720,
    minHeight: 600,
    title: config.appName,
    backgroundColor: '#121417',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',  // 문항 음성 자동 재생
      backgroundThrottling: false,                 // 창이 가려져도 구간 재생·답 타이머가 느려지지 않게
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  // 앱 실행 중에는 외부 네트워크 요청을 하지 않는다
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !/^(file|devtools|data|blob):/.test(details.url) });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- 데이터 읽기 ----------
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

// 영역별 데이터 로더. 새 영역은 여기에 로더를 추가하고 config.sections에서 enabled로 켠다.
const SECTION_LOADERS = {
  // 청해: 문제 은행(레벨별) + 음성 manifest
  listening: () => {
    const questions = {};
    for (const key of LEVEL_KEYS) {
      questions[key] = readJson(path.join(DATA_DIR, 'listening', 'questions', `${key}.json`), []);
    }
    const manifest = readJson(path.join(AUDIO_DIR, 'listening', 'manifest.json'), {});
    return { questions, manifest };
  },
};

function checkSection(section) {
  if (!Object.prototype.hasOwnProperty.call(SECTION_LOADERS, section)) throw new Error('알 수 없는 영역: ' + section);
}

ipcMain.handle('section:load', (_e, section) => {
  checkSection(section);
  return SECTION_LOADERS[section]();
});

// 그림: currentColor가 테마를 따르도록 SVG 원문을 넘겨 인라인으로 넣는다 (data/{영역}/images/)
ipcMain.handle('section:image', (_e, section, name) => {
  checkSection(section);
  if (!/^[a-z0-9-]+\.svg$/.test(String(name))) throw new Error('잘못된 그림 파일명: ' + name);
  return fs.readFileSync(path.join(DATA_DIR, section, 'images', name), 'utf8');
});
