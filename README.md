# JLPT 청해 연습

JLPT 청해(聴解), 문자·어휘(文字・語彙), 문법(文法)을 연습하는 웹 앱입니다: **https://dongki12372-max.github.io/jlpt/** (GitHub Pages). N5·N4·N3 레벨별로 실제 시험의 문제 유형과 진행 방식을 재현하고, 풀면 바로 채점하고 해설을 보여 줍니다. 폰·컴퓨터 어느 브라우저에서나 열리고, 동기화 코드로 기기 사이 진도를 맞춥니다. (앱 이름은 `app/config.js`의 `appName`. 예전 맥 앱(Electron dmg)은 0.4.0을 마지막으로 그만두었습니다.)

### 청해

- **유형별 연습**: 과제이해·포인트이해·개요이해(N3)·발화표현·즉시응답. 재생 속도 0.8~1.2배, 다시 듣기, 대사 한 줄씩 다시 듣기, 후리가나 스크립트·한국어 해설·핵심 단어.
- **스크립트 공부**: 대사마다 한국어 해석(켜고 끄기), 단어를 누르면 사전 창(사전형·읽기·뜻, 단어장 단어면 ▶ 발음·단어장에서 보기), 재생하면 지금 읽는 단어가 초록색으로 표시, 답한 뒤 선택지 해석.
- **전화 대화**: 전화·음성 메시지 문항은 전화 너머 화자의 목소리를 전화 음질로 들려줍니다.
- **실전 모의**: 실제 순서대로 지시문 → 문항 음성 → 답 고르는 시간이 자동으로 이어지고, 한 번만 들을 수 있습니다. 결과는 60점 만점 환산 점수(참고값)와 유형별 정답률로 보여 줍니다.
- **오답노트**: 틀린 문항을 모아 다시 풀고, 연속 2번 맞히면 자동으로 빠집니다.
- **문제 은행**: N5 48문항, N4 56문항, N3 56문항 (레벨별 실전 모의 2회분). 모든 문항은 오리지널입니다.

### 문자·어휘
- **단어장 (SRS)**: N5 752 · N4 660 · N3 1,783단어. 단어마다 읽기 카드·뜻 카드, 「다시/어려움/알맞음/쉬움」 평가로 다음 복습일이 정해집니다 (SM-2 단순화, 하루 새 카드 수는 설정). 모든 단어와 예문에 음성.
- **객관식 퀴즈 (단어장)**: 뜻 고르기·단어 고르기·읽기 고르기·섞어서, 범위(전체·학습한 단어·약한 단어)와 문항 수(10·20·50). 오답 선택지는 같은 범위·같은 품사 단어에서 뜻·읽기가 겹치지 않게 고르고, 틀린 단어는 단어장 오늘 복습으로 들어갑니다.
- **유형별 연습**: 漢字読み·表記·文脈規定·言い換え類義·用法(N4·N3). 답하면 완성 문장(▶ 음성), 해설, 오답 선택지마다 왜 틀렸는지, 이 문항의 단어 카드.
- **실전 모의**: 레벨별 구성·시간(N5 20분 · N4 25분 · N3 30분), 문항 자유 이동·답 바꾸기, 시간이 끝나면 자동 제출. 실전 중에는 후리가나가 꺼집니다.
- **단어장 연동**: 문제에서 틀린 단어는 단어장의 오늘 복습으로 들어갑니다. 청해 해설의 단어 목록에도 「단어장에 있음」과 ▶ 단어 음성이 붙습니다.
- **문제 은행**: 레벨별 실전 모의 3회분 (N5 63 · N4 84 · N3 105문항).

### 문법
- **문형 사전**: N5·N4·N3 문형마다 뜻, 접속, 설명, 예문 2개(▶ 음성·해석), 비슷한 문형, 이 문형이 나오는 문제. 레벨·상태·검색 필터.
- **문형 퀴즈 (객관식)**: 뜻 고르기·문형 고르기·섞어서, 범위(이 레벨·아래 레벨까지·약한 문형)와 문항 수. 틀린 문형은 「약한 문형」이 되고 연속 2번 맞히면 풀립니다.
- **유형별 연습**: 文法形式の判断(빈칸)·文の組み立て(조각을 눌러 순서대로 놓고 ★ 자리로 채점)·文章の文法(글의 빈칸). 해설에 완성 문장(▶ 음성·해석), 선택지마다 틀린 이유, 이 문항의 문형.
- **실전 모의**: 레벨별 구성·시간(N5 15분 · N4 20분 · N3 25분 — 실제 시험은 독해와 합쳐 재므로 문법 몫만), 자유 이동·답 바꾸기·자동 제출. **오답노트**도 같은 방식.
- 청해 스크립트의 문법 표현(〜ておく 등)을 누르면 사전 창에서 「문형 사전에서 보기」로 이어집니다.

## 쓰는 법 · 기록

주소: **https://dongki12372-max.github.io/jlpt/** (폰은 브라우저 메뉴의 「홈 화면에 추가」로 앱처럼 열 수 있습니다)

- 폰(폴드 접은 화면 포함)과 펼친 화면·컴퓨터 화면에 맞춰 레이아웃이 바뀝니다.
- 유형별 연습 순서 **「이어서」**(기본): 그 유형에서 마지막으로 푼 문항 다음부터 시작하고, 끝까지 가면 앞 문항이 이어집니다 (유형 카드에 「다음 N번부터」). 「처음부터」「무작위」도 고를 수 있고, 동기화를 켜면 다른 기기에서 푼 것도 반영됩니다.
- 연습·오답노트·퀴즈의 선택지 아래 **「모름」**(키 `0`): 모르는 문항은 찍지 말고 누르면 오답으로 기록되고(오답노트·약한 문형·단어장 복습) 정답과 해설이 나옵니다. 실전 모의에는 없고, 비워 두면 무응답입니다.
- **기기 간 동기화**: 설정 → 기기 간 동기화 → 「동기화 켜기」로 20자 코드를 만들고, 다른 기기(폰·다른 브라우저)에서 그 코드를 넣으면 기록이 자동으로 합쳐집니다 (계정 없음, Firebase Firestore 프로젝트 `jlptn3-ec3e8`, `app/config.js`의 `sync`, 코드는 `js/sync.js`). 같은 문항·카드는 나중에 바뀐 기록이 남고, 인터넷이 없을 때는 그 기기에 저장했다가 연결되면 맞춥니다. Firestore 규칙은 `sync/{20자 이상 코드}` 경로만 읽기·쓰기 허용.
- 동기화를 켜지 않으면 풀이 기록은 브라우저마다 따로 저장됩니다(localStorage). 설정 → 기록 → **내보내기**로 파일을 받고, 다른 기기에서 **가져오기**를 누르면 그 기기 기록과 합쳐집니다 (같은 문항은 나중 기록이 남음).
- 음성은 그때그때 인터넷으로 받습니다.
- 올리기: `npm run web:deploy` (`tools/deploy_web.sh` — 검사 → `.web-deploy/`에 화면·데이터·음성 모으기 → `gh-pages` 브랜치 push). main 브랜치에는 여전히 `audio/`가 들어가지 않습니다.
- 확인: `npm run web:check` (리포를 http로 띄워 폰·폴드 화면 크기로 주요 화면을 눌러 보고, 가로 넘침·기록 저장·가져오기를 검사).

## 개발 환경

필요한 것: Node.js 22 이상, Python 3.13, ffmpeg (`brew install ffmpeg`).

```sh
npm install                                   # Electron (자동 테스트용 브라우저)
python3 -m venv .venv
.venv/bin/pip install -r tools/requirements.txt   # edge-tts, pydub, jsonschema
npm start                                     # 로컬에서 열기 (http://127.0.0.1:8000/…, tools/serve.js)
npm run smoke                                 # 스모크 테스트 (smoke:listening·vocab·grammar — tools/test_host.js가 웹 앱을 Electron 창으로 띄움)
npm run web:check                             # 폰·폴드 화면 폭, 기록 저장·가져오기, 동기화(가짜 서버)
```

`audio/`는 git에 올리지 않습니다. 처음 받았을 때는 아래 「음성 다시 만들기」로 생성합니다.

## 문항 추가하는 방법

문항은 `data/listening/questions/{n5,n4,n3}.json`에 레벨별로 들어 있습니다. 형식은 `data/listening/schema.json`과 기존 문항을 따르고, 작성 규칙은 `docs/DESIGN.md`와 아래를 지킵니다.

1. 문항을 씁니다. id는 `{레벨}-{유형}-{3자리 번호}` (예: `n4-point-015`).
   - `script`는 대사와 글자까지 같게, 모든 한자에 `{漢字|かんじ}` 후리가나.
   - 선택지에 한자가 있으면 `furigana` 필수.
   - `vocab`의 `kind`: `word`(사전형) / `expression`(인사말·관용 표현) / `grammar`(〜로 시작).
   - TTS가 잘못 읽을 만한 곳만 `ttsText`(읽기는 후리가나와 같아야 함).
   - `scriptKo`(줄마다 해석), `gloss`(줄마다 단어: 문장 속 모양 t·사전형 w·읽기 r·뜻 m, 줄 안 순서대로), `optionsKo`(선택지 해석) 필수. 따로 쓴 해석은 `tools/merge_annotations.py <파일>`로 넣을 수 있습니다.
   - 전화 대화면 `phone`: 전화 너머 화자 목록 (예: `["F"]`).
   - 그림 선택지는 `data/listening/images/{id}-opt{1..4}.svg` (흑백 선화, `viewBox="0 0 240 180"`, `stroke="currentColor"`, 글자는 숫자만).
2. 검사합니다: `.venv/bin/python tools/validate.py` — 실패하면 음성 생성으로 넘어가지 않습니다.
   - 따로 쓴 배치 파일은 `validate.py --batch <파일>`로 검사한 뒤 `tools/merge_batch.py <파일>`로 붙일 수 있습니다 (기존 서식 유지).
3. 음성을 만듭니다: 아래 「음성 다시 만들기」.
4. 앱에서 확인합니다: `npm run smoke` (앱을 띄워 전 레벨·유형을 자동으로 눌러 봄), 올리기 `npm run web:deploy`.

실전 모의 문항 수·답 고르는 시간 같은 숫자는 `app/config.js`에서만 바꿉니다. 앱 이름도 `app/config.js`의 `appName` 한 곳에서 정합니다.

## 문자·어휘 데이터

- 단어: `data/vocab/words/{n5,n4,n3}.json` (한 줄에 한 단어, 형식은 `data/vocab/schema-words.json`). 기록은 `key`(단어|읽기) 기준이라 id나 순서가 바뀌어도 유지됩니다.
- 문제: `data/vocab/questions/{n5,n4,n3}.json` (`data/vocab/schema-questions.json`). 후리가나 `{漢字|かな}`, 밑줄 `[[ ]]`, 빈칸 `（　）`.
- 검사: `.venv/bin/python tools/validate_vocab.py` (후리가나가 답을 알려 주지 않는지, targets가 단어 데이터에 있고 레벨 이하인지, 선택지 형태, 정답 분포 등).
- 배치로 추가: 단어는 `tools/merge_words.py <배치>`, 문제는 `tools/merge_questions.py <배치>` (검사를 통과해야 합쳐짐).
- 청해 문항의 vocab(word·expression)은 `tools/import_listening_vocab.py`로 단어 데이터와 출처를 맞춥니다.
- 음성: `.venv/bin/python tools/build_vocab_audio.py` (단어·예문·문항 완성 문장, 바뀐 것만). 읽기가 틀릴 만한 곳은 `tools/check_vocab_tts.py --fix-words --fix-examples`가 찾아 `ttsText`를 넣습니다 (MFCC+DTW 비교, librosa 필요).

## 문법 데이터

- 문형: `data/grammar/points/{n5,n4,n3}.json` (한 줄에 문형 하나, `data/grammar/schema-points.json`). 기록은 `key`(= 문형 표기) 기준.
- 문제: `data/grammar/questions/{n5,n4,n3}.json` (`data/grammar/schema-questions.json`). 빈칸 `（　）`, 문장 만들기 자리 `［＿］`·`［★］`, 글의 빈칸 `［1］`…
- 작성 규칙: `docs/DESIGN.md` 5장. 검사 `.venv/bin/python tools/validate_grammar.py`, 배치 합치기 `tools/merge_grammar.py points|questions <배치>`.
- 음성: `.venv/bin/python tools/build_grammar_audio.py` (예문·완성 문장, 바뀐 것만), 읽기 의심 확인 `tools/check_grammar_tts.py [--fix]`.

## 음성 다시 만들기

음성은 개발할 때만 edge-tts(인터넷 필요)로 만들고, 앱에는 결과 mp3만 들어갑니다.

```sh
.venv/bin/python tools/build_audio.py                  # 바뀐 문항만 (내용 해시로 판단)
.venv/bin/python tools/build_audio.py --level n3       # 한 레벨
.venv/bin/python tools/build_audio.py --id n3-kadai-001
.venv/bin/python tools/build_audio.py --force          # 전부 다시
```

- 결과: `audio/listening/{레벨}/{id}.mp3`, 유형별 지시문 `_intro_{유형}.mp3`, 구간 시각과 단어별 시각(edge-tts WordBoundary) `audio/listening/manifest.json`.
- 화자 음성(N·M·F·M2·F2)과 쉼 길이는 `tools/voices.json`. 값을 바꾸면 그 화자를 쓰는 문항만 다시 생성됩니다. 화자 후보 비교 샘플은 `tools/voice_compare.py`.
- 지시문 문구는 `data/listening/intros.json`.

## 구조

```
app/            웹 앱 (config.js · renderer/)
  renderer/js/          공통: app.js(홈·화면 전환) player.js storage.js util.js dict.js web.js(데이터·기록 읽기) sync.js(기기 간 동기화)
  renderer/js/listening/ 청해: index.js practice.js exam.js review.js question-view.js
  renderer/js/vocab/     문자·어휘: index.js srs.js deck.js quiz.js question-view.js practice.js exam.js
  renderer/js/grammar/   문법: index.js points.js(문형 사전·퀴즈) question-view.js practice.js exam.js
data/listening/ 청해 문제 은행·스키마·지시문·그림
data/vocab/     단어·문제·스키마
data/grammar/   문형·문제·스키마
audio/          생성 음성 (git 제외): listening/, vocab/{words,examples,questions}/, grammar/{examples,questions}/
tools/          validate.py build_audio.py merge_batch.py voice_compare.py smoke_app.js web_check.js deploy_web.sh
                validate_grammar.py merge_grammar.py build_grammar_audio.py check_grammar_tts.py grammar_common.py smoke_grammar.js
                validate_vocab.py build_vocab_audio.py check_vocab_tts.py merge_words.py merge_questions.py
                import_listening_vocab.py vocab_common.py smoke_vocab.js
docs/           DESIGN.md (영역 구조·기록 형식·단어 데이터), OVERNIGHT_REPORT.md
```

문자·어휘와 문법 영역을 같은 앱에 추가할 수 있게 영역(section) 구조로 되어 있습니다 (`docs/DESIGN.md` 1장).
