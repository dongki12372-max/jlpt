# JLPT 청해 연습

JLPT 청해(聴解)만 연습하는 오프라인 macOS 앱입니다. N5·N4·N3 레벨별로 실제 시험의 문제 유형과 진행 방식을 재현하고, 풀면 바로 채점하고 스크립트와 해설을 보여 줍니다. 앱을 쓰는 동안에는 인터넷에 접속하지 않습니다.

- **유형별 연습**: 과제이해·포인트이해·개요이해(N3)·발화표현·즉시응답. 재생 속도 0.8~1.2배, 다시 듣기, 대사 한 줄씩 다시 듣기, 후리가나 스크립트·한국어 해설·핵심 단어.
- **실전 모의**: 실제 순서대로 지시문 → 문항 음성 → 답 고르는 시간이 자동으로 이어지고, 한 번만 들을 수 있습니다. 결과는 60점 만점 환산 점수(참고값)와 유형별 정답률로 보여 줍니다.
- **오답노트**: 틀린 문항을 모아 다시 풀고, 연속 2번 맞히면 자동으로 빠집니다.
- **문제 은행**: N5 48문항, N4 56문항, N3 56문항 (레벨별 실전 모의 2회분). 모든 문항은 오리지널입니다.

## 설치

1. `dist/` 폴더의 `JLPT Listening-<버전>-universal.dmg`를 엽니다.
2. `JLPT Listening` 앱을 `Applications` 폴더로 끌어 놓습니다. (번들 파일 이름은 영문이고, Dock·메뉴·창 제목에는 「JLPT 청해 연습」으로 나옵니다. 번들 이름이 한글이면 Electron이 시작하지 못해서 이렇게 나눴습니다.)
3. 처음 실행할 때 「확인되지 않은 개발자」 경고가 나오면, Finder에서 앱을 **오른쪽 클릭 → 열기 → 열기**를 누릅니다. (Apple 개발자 인증서 없이 자체 서명한 앱이라 한 번은 이렇게 열어야 합니다.)

풀이 기록과 설정은 `~/Library/Application Support/JLPT 청해 연습/progress.json`에 저장됩니다. 앱의 설정 화면에서 초기화할 수 있습니다.

## 개발 환경

필요한 것: Node.js 22 이상, Python 3.13, ffmpeg (`brew install ffmpeg`).

```sh
npm install                                   # Electron, electron-builder
python3 -m venv .venv
.venv/bin/pip install -r tools/requirements.txt   # edge-tts, pydub, jsonschema
npm start                                     # 개발 모드로 실행
```

`audio/`는 git에 올리지 않습니다. 처음 받았을 때는 아래 「음성 다시 만들기」로 생성합니다.

## 문항 추가하는 방법

문항은 `data/listening/questions/{n5,n4,n3}.json`에 레벨별로 들어 있습니다. 형식은 `data/listening/schema.json`과 기존 문항을 따르고, 작성 규칙은 `docs/DESIGN.md`와 아래를 지킵니다.

1. 문항을 씁니다. id는 `{레벨}-{유형}-{3자리 번호}` (예: `n4-point-015`).
   - `script`는 대사와 글자까지 같게, 모든 한자에 `{漢字|かんじ}` 후리가나.
   - 선택지에 한자가 있으면 `furigana` 필수.
   - `vocab`의 `kind`: `word`(사전형) / `expression`(인사말·관용 표현) / `grammar`(〜로 시작).
   - TTS가 잘못 읽을 만한 곳만 `ttsText`(읽기는 후리가나와 같아야 함).
   - 그림 선택지는 `data/listening/images/{id}-opt{1..4}.svg` (흑백 선화, `viewBox="0 0 240 180"`, `stroke="currentColor"`, 글자는 숫자만).
2. 검사합니다: `.venv/bin/python tools/validate.py` — 실패하면 음성 생성으로 넘어가지 않습니다.
   - 따로 쓴 배치 파일은 `validate.py --batch <파일>`로 검사한 뒤 `tools/merge_batch.py <파일>`로 붙일 수 있습니다 (기존 서식 유지).
3. 음성을 만듭니다: 아래 「음성 다시 만들기」.
4. 앱에서 확인합니다: `npm run smoke` (앱을 띄워 전 레벨·유형을 자동으로 눌러 봄).

실전 모의 문항 수·답 고르는 시간 같은 숫자는 `app/config.js`에서만 바꿉니다. 앱 이름도 `app/config.js`의 `appName` 한 곳에서 정합니다.

## 음성 다시 만들기

음성은 개발할 때만 edge-tts(인터넷 필요)로 만들고, 앱에는 결과 mp3만 들어갑니다.

```sh
.venv/bin/python tools/build_audio.py                  # 바뀐 문항만 (내용 해시로 판단)
.venv/bin/python tools/build_audio.py --level n3       # 한 레벨
.venv/bin/python tools/build_audio.py --id n3-kadai-001
.venv/bin/python tools/build_audio.py --force          # 전부 다시
```

- 결과: `audio/listening/{레벨}/{id}.mp3`, 유형별 지시문 `_intro_{유형}.mp3`, 구간 시각 `audio/listening/manifest.json`.
- 화자 음성(N·M·F·M2·F2)과 쉼 길이는 `tools/voices.json`. 값을 바꾸면 그 화자를 쓰는 문항만 다시 생성됩니다. 화자 후보 비교 샘플은 `tools/voice_compare.py`.
- 지시문 문구는 `data/listening/intros.json`.

## 빌드 (.dmg)

```sh
npm run dist        # dist/에 universal .dmg (Apple Silicon·Intel 공용)
```

빌드 전에 `validate.py`가 통과하고 `audio/`에 전 문항 음성이 있어야 합니다. 서명은 ad-hoc(자체) 서명입니다 (`build/afterPack.js`).

## 구조

```
app/            Electron (main·preload·config·renderer)
  renderer/js/          공통: app.js(홈·화면 전환) player.js storage.js util.js
  renderer/js/listening/ 청해: index.js practice.js exam.js review.js question-view.js
data/listening/ 문제 은행·스키마·지시문·그림
audio/listening/ 생성 음성 (git 제외)
tools/          validate.py build_audio.py merge_batch.py voice_compare.py smoke_app.js
docs/           DESIGN.md (영역 구조·기록 형식·단어 데이터), OVERNIGHT_REPORT.md
```

문자·어휘와 문법 영역을 같은 앱에 추가할 수 있게 영역(section) 구조로 되어 있습니다 (`docs/DESIGN.md` 1장).
