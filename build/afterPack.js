// 빌드 후 macOS 앱을 ad-hoc(자체) 서명 — Apple Silicon에서 서명 없는 앱이 실행되지 않는 문제 방지.
// (OPIc 앱의 afterPack.js를 가져와 고침)
// ⚠️ 유니버설 빌드: x64/arm64 개별(-temp) 앱을 서명하면 병합이 깨진다 → 병합이 끝난 최종 앱만 서명한다.
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (context.appOutDir.includes('-temp')) return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlements = path.join(__dirname, 'entitlements.mac.plist');
  console.log('[afterPack] ad-hoc 서명:', appPath);
  execSync(
    `codesign --force --deep --sign - --options runtime --entitlements "${entitlements}" "${appPath}"`,
    { stdio: 'inherit' }
  );
};
