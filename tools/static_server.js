// ============================================================
// 리포 폴더를 http로 내보내는 작은 서버 (npm start · 스모크 테스트 · web_check 공용)
//   음성 탐색(seek)이 되도록 Range 요청(206)을 지원한다 — GitHub Pages와 같게.
//   extra(req, res)가 true를 돌려주면 그 요청은 extra가 처리한 것 (테스트용 가짜 서버 등)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.png': 'image/png' };

function createStaticServer(extra = null) {
  return http.createServer((req, res) => {
    if (extra && extra(req, res)) return;
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p === ROOT || p === ROOT + path.sep) { res.writeHead(302, { Location: '/app/renderer/index.html' }); res.end(); return; }
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    const size = fs.statSync(p).size;
    const type = TYPES[path.extname(p)] || 'application/octet-stream';
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0;
    let end = size - 1;
    if (m) {
      if (m[1]) start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), size - 1);
      if (!m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size });
    }
    fs.createReadStream(p, { start, end }).on('error', () => res.destroy()).pipe(res);
  });
}

module.exports = { createStaticServer, ROOT };
