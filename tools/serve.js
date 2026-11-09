// ============================================================
// 로컬에서 웹 앱 열기: 리포 폴더를 http로 띄운다 (npm start). 브라우저로 출력된 주소를 연다.
//   PORT=8000 npm start 로 포트 변경. 배포는 tools/deploy_web.sh.
// ============================================================
const { createStaticServer } = require('./static_server');

const PORT = Number(process.env.PORT || 8000);
createStaticServer().listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/app/renderer/index.html`));
