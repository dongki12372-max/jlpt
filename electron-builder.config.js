// electron-builder 설정 — 앱 이름·id는 app/config.js 한 곳에서만 정의한다.
const config = require('./app/config');

module.exports = {
  appId: config.appId,
  // 번들·실행 파일 이름은 ASCII로 — 한글 productName이면 패키징된 앱이 시작하자마자 죽는다(SIGTRAP, Helper 이름까지 한글이 됨).
  // 화면에 보이는 이름(Dock·메뉴·창 제목·userData 폴더)은 config.appName 그대로.
  productName: 'JLPT Listening',
  afterPack: 'build/afterPack.js',
  directories: { output: 'dist' },
  files: [
    'package.json',
    'app/**',
    'data/**',
    '!data/**/schema.json',
    'audio/**',
    '!audio/**/_compare/**',
  ],
  mac: {
    target: [{ target: 'dmg', arch: 'universal' }],
    category: 'public.app-category.education',
    identity: null,
    extendInfo: { CFBundleDisplayName: config.appName },  // CFBundleName은 Helper 찾기에 쓰여서 바꾸면 안 됨
  },
};
