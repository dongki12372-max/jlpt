// ============================================================
// 테스트용 호스트: 리포 폴더를 http로 띄우고 Electron 창 하나로 웹 버전(app/renderer/index.html)을 연다.
//   스모크 테스트(smoke_app·smoke_vocab·smoke_grammar)가 require로 불러 쓴다 — 창이 열리면 'browser-window-created'.
//   기록은 이 창의 localStorage. JLPT_USER_DATA 폴더를 Electron userData로 써서, 같은 폴더로 다시 실행하면 기록이 남는다.
// ============================================================
const { app, BrowserWindow } = require('electron');
const { createStaticServer } = require('./static_server');

if (process.env.JLPT_USER_DATA) app.setPath('userData', process.env.JLPT_USER_DATA);
app.on('window-all-closed', () => {});
// 테스트는 소리를 내지 않는다 (재생·끝남 이벤트는 그대로)
app.commandLine.appendSwitch('mute-audio');

function serve() {
  // 같은 userData로 다시 실행할 때 localStorage(출처별)가 이어지도록 포트를 고정한다
  return new Promise((resolve) => { const server = createStaticServer(); server.listen(Number(process.env.TEST_PORT || 47321), '127.0.0.1', () => resolve(server)); });
}

app.whenReady().then(async () => {
  const server = await serve();
  const win = new BrowserWindow({
    width: 1000, height: 880,
    webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.loadURL(`http://127.0.0.1:${server.address().port}/app/renderer/index.html`);
});
