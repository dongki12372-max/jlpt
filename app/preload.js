// ============================================================
// preload — 렌더러에 안전한 IPC만 노출 (contextIsolation)
//   fs 접근은 메인 프로세스에서만 한다.
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jlpt', {
  // { questions: {n5:[…], n4:[…], n3:[…]}, manifest: {id: {...}} }
  loadData: () => ipcRenderer.invoke('data:load'),
  // data/images/의 SVG 원문
  readImage: (name) => ipcRenderer.invoke('data:image', name),
});
