// ============================================================
// preload — 렌더러에 안전한 IPC만 노출 (contextIsolation)
//   fs 접근은 메인 프로세스에서만 한다.
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jlpt', {
  // 영역 데이터. 청해: { questions: {n5:[…], n4:[…], n3:[…]}, manifest: {id: {...}} }
  loadSection: (section) => ipcRenderer.invoke('section:load', section),
  // data/{영역}/images/의 SVG 원문
  readImage: (section, name) => ipcRenderer.invoke('section:image', section, name),
});
