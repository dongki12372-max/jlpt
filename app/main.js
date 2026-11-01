// ============================================================
// Electron 메인 프로세스
//   - 렌더러(index.html) 로드, 앱 이름은 config.js의 appName
//   - IPC: 문제 은행·manifest 읽기, 그림(SVG) 읽기
//   - 오프라인 앱: file:// 외 요청은 모두 차단
// ============================================================
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const AUDIO_DIR = path.join(ROOT, 'audio');
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

// 문제 은행(레벨별) + 음성 manifest
ipcMain.handle('data:load', () => {
  const questions = {};
  for (const key of LEVEL_KEYS) {
    questions[key] = readJson(path.join(DATA_DIR, 'questions', `${key}.json`), []);
  }
  const manifest = readJson(path.join(AUDIO_DIR, 'manifest.json'), {});
  return { questions, manifest };
});

// 그림: currentColor가 테마를 따르도록 SVG 원문을 넘겨 인라인으로 넣는다
ipcMain.handle('data:image', (_e, name) => {
  if (!/^[a-z0-9-]+\.svg$/.test(String(name))) throw new Error('잘못된 그림 파일명: ' + name);
  return fs.readFileSync(path.join(DATA_DIR, 'images', name), 'utf8');
});
