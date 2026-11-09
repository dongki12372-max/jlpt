#!/bin/sh
# ============================================================
# 웹 버전 올리기 (GitHub Pages): 앱 화면·데이터·음성을 .web-deploy/에 모아 gh-pages 브랜치로 push
#   tools/deploy_web.sh            검사 → 모으기 → commit → push
#   tools/deploy_web.sh --no-push  모으기·commit까지만 (로컬 확인용)
#   main 브랜치에는 audio/를 올리지 않고, 음성은 gh-pages 브랜치에만 들어간다.
#   .web-deploy/는 gh-pages 브랜치의 작업 폴더라 지우지 않으면 다음부터 바뀐 파일만 올라간다.
# ============================================================
set -e
cd "$(dirname "$0")/.."
OUT=.web-deploy
PUSH=1
[ "$1" = "--no-push" ] && PUSH=0

.venv/bin/python tools/validate.py
.venv/bin/python tools/validate_vocab.py
.venv/bin/python tools/validate_grammar.py
for f in audio/listening/manifest.json audio/vocab/manifest.json audio/grammar/manifest.json; do
  [ -f "$f" ] || { echo "$f 가 없습니다. 음성을 먼저 만드세요 (README 「음성 다시 만들기」)."; exit 1; }
done

REMOTE=$(git remote get-url origin)
if [ ! -d "$OUT/.git" ]; then
  if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
    git clone -q --branch gh-pages --single-branch "$REMOTE" "$OUT"
  else
    git init -q -b gh-pages "$OUT"
    git -C "$OUT" remote add origin "$REMOTE"
  fi
fi
git -C "$OUT" config user.name "$(git config user.name)"
git -C "$OUT" config user.email "$(git config user.email)"

# 앱과 같은 폴더 구조 (app/renderer/index.html → ../config.js, ../../data, ../../audio)
mkdir -p "$OUT/app"
rsync -a --delete app/renderer/ "$OUT/app/renderer/"
cp app/config.js "$OUT/app/config.js"
rsync -a --delete data/ "$OUT/data/"
rsync -a --delete --exclude _check --exclude '.DS_Store' audio/ "$OUT/audio/"
cat > "$OUT/index.html" <<'EOF'
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=app/renderer/index.html">
  <title>JLPT 청해 연습</title>
</head>
<body style="background:#121417;color:#e6e8eb;font-family:sans-serif">
  <a href="app/renderer/index.html" style="color:#5b9dff">JLPT 청해 연습 열기</a>
</body>
</html>
EOF
touch "$OUT/.nojekyll"   # Jekyll이 _intro_*.mp3 같은 _로 시작하는 파일을 빼지 않게

VERSION=$(node -p "require('./package.json').version")
HEAD=$(git rev-parse --short HEAD)
git -C "$OUT" add -A
if git -C "$OUT" diff --cached --quiet; then
  echo "바뀐 파일이 없습니다."
else
  git -C "$OUT" commit -q -m "웹 버전 ${VERSION} (${HEAD})"
  echo "commit: 웹 버전 ${VERSION} (${HEAD})"
fi
[ "$PUSH" = 1 ] || exit 0
git -C "$OUT" -c http.postBuffer=524288000 push -u origin gh-pages
