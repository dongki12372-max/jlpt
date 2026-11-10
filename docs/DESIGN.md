# 영역(section) 구조와 데이터 설계

청해 이후에 문자·어휘(SRS 단어장 + JLPT 형식 문제)와 문법(빈칸, ★ 배열, 글의 문법)을 같은 앱에 추가할 수 있도록 정한 구조다. 지금 구현된 영역은 청해(`listening`), 문자·어휘(`vocab`), 문법(`grammar`, 5장)이다.

## 1. 영역 구조

| 위치 | 규칙 |
|---|---|
| `app/config.js` | `levels`(전 영역 공통), `sectionOrder`, `sections.{영역}` (`label_ko`, `label_ja`, `enabled` + 영역 전용 설정). 청해의 유형·실전 구성·타이밍은 `sections.listening` 안에 있다. `reviewIntervalsDays`(오답노트 복습 간격)는 전 영역 공통 |
| `data/{영역}/` | 영역 데이터. 청해: `questions/{n5,n4,n3}.json`, `schema.json`, `intros.json`, `images/` |
| `audio/{영역}/` | 생성 음성과 `manifest.json` (git 제외). 청해: `audio/listening/{level}/{id}.mp3` |
| `app/renderer/js/web.js` | `LOADERS.{영역}`이 그 영역 데이터를 fetch로 읽는다 (`window.jlpt.loadSection`, `readImage`). 기록은 localStorage (`loadProgress`·`saveProgress`). 예전 Electron 앱의 main.js·preload.js는 0.4.0 뒤에 없앴다 |
| `app/renderer/js/{영역}/` | 영역 모듈. `index.js`가 `App.registerSection(id, { load, modes, summary })`로 등록하고, 화면 파일(`practice.js` 등)을 둔다 |
| `app/renderer/js/` 바로 아래 | 영역 공통: `app.js`(홈·화면 전환), `player.js`, `util.js`, `boot.js`, (Phase 5) `storage.js` |
| `tools/` | `validate.py`, `build_audio.py`는 청해 전용 (`load_listening_config()`). 문자·어휘는 `validate_vocab.py`, `build_vocab_audio.py`, `check_vocab_tts.py`, `merge_words.py`, `merge_questions.py`, `import_listening_vocab.py` (공통 `vocab_common.py`) |

**새 영역을 켜는 순서**: `data/{영역}/` 데이터 → `web.js`에 로더 → `js/{영역}/index.js`에서 등록 → `index.html`에 스크립트 추가 → `config.sections.{영역}.enabled = true`.

홈 화면은 영역 탭 → 레벨 탭(N5·N4·N3) → 오늘의 학습(그 레벨, 전 영역 공통 — `js/daily.js`) → 그 영역의 모드 버튼 → 영역 요약 순서다. `enabled=false`이거나 모듈이 없는 영역은 탭에 '준비 중'으로 비활성 표시된다.

## 2. progress.json (Phase 4·5에서 구현)

`app.getPath('userData')/progress.json` 파일 하나. 기록은 영역별로 나뉘고, 문항 키는 그 영역 안에서만 유일하면 된다.

```json
{
  "version": 1,
  "settings": {
    "common":    { "furigana": true },
    "listening": { "playbackRate": 1.0, "answerSeconds": 12 }
  },
  "sections": {
    "listening": {
      "items": {
        "n3-point-001": {
          "attempts": 3,
          "lastCorrect": false,
          "streak": 0,
          "lastAt": "2026-11-02T09:12:00+09:00",
          "review": true,
          "reviewManual": false
        }
      },
      "exams": [
        {
          "at": "2026-11-02T10:00:00+09:00",
          "level": "N3",
          "total": 28,
          "correct": 20,
          "score": 43,
          "full": true,
          "seconds": 2380,
          "byType": { "kadai": { "total": 6, "correct": 5 } },
          "answers": [ { "id": "n3-kadai-001", "chosen": 3, "correct": true } ]
        }
      ]
    }
  }
}
```

- **items**: 문항별 기록. 공통 필드는 `attempts`, `lastCorrect`, `streak`(연속 정답 수), `lastAt`이다. 영역마다 필드를 더 붙일 수 있다. 예를 들어 단어장은 SRS 상태(`srs: { due, interval, ease }`)를 둔다.
- **오답노트는 별도 목록이 아니라 `items[*].review` 플래그**다. 틀리면 `true`가 되고 복습 일정이 붙는다 — `stage`(맞힌 복습 횟수, 0부터)와 `due`(다음 복습 날의 시작, ms). 간격은 `config.reviewIntervalsDays`(1 · 3 · 7일): 틀리면 `stage = 0`, `due` = 내일. `due`가 된 뒤에 맞히면 `stage`가 하나 오르고 `due`는 그날부터 다음 간격 뒤, 마지막 간격까지 맞히면 `review = false`(`stage`·`due` 삭제). `due` 전에 맞힌 것은 일정을 바꾸지 않고, 틀리면 언제든 처음으로 돌아간다. 하루의 경계는 단어장과 같은 새벽 4시(`Srs.dayStart`). `due`가 없는 옛 기록은 바로 복습할 것으로 본다(`Util.isDue`). 수동으로 빼면 `false`가 되고 `reviewManual: true`를 남긴다. 영역별 오답노트는 해당 영역 `items`를 거르기만 하면 되고(`reviewList`), 그중 오늘 복습할 것은 `dueList`다. 문법의 약한 문형(`point:{key}`)도 같은 일정이다(`Grammar.duePoints`).
- **틀린 문항 → 단어장**: 문자·어휘 문항은 `targets`, 청해 문항은 `vocab`의 `kind: word` 단어를 `Vocab.pullWords`로 당긴다 (시작한 카드는 지금 예정으로, 아직 안 본 단어는 새 카드 맨 앞).
- **exams**: 실전 모의 기록. `full`은 config의 정식 문항 수로 출제했는지(문제 은행이 부족하면 false), `seconds`는 소요 시간이다. `answers`가 있어서 나중에 기록 화면에서 문항별 해설로 다시 들어갈 수 있다. `byType`의 키는 영역마다 다르다(청해는 유형, 문법은 문제 형식).
- **settings**: `common`은 전 영역 공통(후리가나 표시 등), 나머지는 영역 키 아래에 둔다. 청해는 `playbackRate`(연습 기본 속도), `answerSeconds`, `order`(seq/random), `unsolvedFirst`.
- 실전 모의의 답도 `items`에 기록한다(무응답은 오답). 저장은 임시 파일에 쓴 뒤 바꿔 넣고, 깨진 파일은 `progress.json.broken-<시각>`으로 보관한 뒤 빈 기록으로 시작한다.
- 테스트는 `JLPT_USER_DATA` 환경 변수로 저장 위치를 바꿔 실제 기록을 건드리지 않는다.
- **오늘의 학습** (`js/daily.js`): 진도는 따로 저장하지 않고 `items[*].at`(문항)·카드의 `at`·`due`(단어장)에서 오늘(새벽 4시부터) 한 양을 센다. 저장하는 것은 두 가지뿐이다 — 레벨별 분량 `settings.daily.{N5|N4|N3} = { words, listening, vocab, points, grammar }`(없으면 `config.daily`), 분량을 다 채운 날 `sections.plan.studyDays = ['YYYY-MM-DD N5', …]`(영역이 아닌 기록용 키, 기기 간 합집합). 단어장의 하루 새 카드 수는 `sections.vocab.daily.byLevel`로 단어 레벨마다 센다. `points`는 문형 퀴즈 단계로, 오늘 퀴즈로 본 문형을 `point:{key}` 기록의 `quizAt`으로 센다. 복습은 따로 단계를 두지 않고 분량 안에서 한다 — `Daily.pick`·`pickPoints`가 오늘 복습할 것(`Util.isDue`)을 먼저 고르고(`config.daily.reviewShare`까지), 복습 날이 아직 안 된 오답노트 문항은 맨 뒤로 미룬다.
- 영역 키가 없으면 빈 기록으로 본다. 그래서 새 영역을 추가할 때 마이그레이션이 필요 없다. 구조를 바꿀 때만 `version`을 올린다.

## 3. 단어 데이터 형식 (청해 vocab → 단어장)

> 구현됨 (Phase 8~13). 실제 형식은 `data/vocab/schema-words.json`, 파일은 `data/vocab/words/{n5,n4,n3}.json`.
> 처음 설계와 달라진 점: 별도 수집 파일(collected.json) 없이 `tools/import_listening_vocab.py`가 청해 vocab과 단어 데이터의
> 출처(`sources`: `wordlist` / `listening:{id}` / `vocab:{id}`)를 맞추고, 단어 데이터에 없는 청해 단어는 초안 목록으로 낸다.
> 단어에는 `id`(`{레벨}-w-0001`, 음성 파일 이름), `pos`, `example`(text·furigana·meaning_ko), `similar`, `ttsText`가 더 있다.
> 기록은 `progress.json`의 `sections.vocab.cards['{key}#reading' | '{key}#meaning']`(SRS 카드), `daily`, `studyDays`,
> `priorityNew`(문제에서 틀린 새 단어), 그리고 문제 풀이 기록 `items`·`exams`(청해와 같은 형식).

처음 설계 (참고):

```json
{
  "key": "牛乳|ぎゅうにゅう",
  "word": "牛乳",
  "reading": "ぎゅうにゅう",
  "meaning_ko": "우유",
  "kind": "word",
  "level": "N5",
  "sources": [ { "section": "listening", "id": "n5-kadai-001" } ]
}
```

- **key** = `단어|읽기`. 같은 한자에 읽기가 다른 단어(空いている すいている / あいている)를 구분한다. 단어장 기록(`progress.json`의 `sections.vocab.items`)의 키로도 쓴다.
- **kind** = `word`(단어장 대상, 사전형) / `expression`(인사말·관용 표현처럼 통째로 외우는 것, 예: お先に失礼します) / `grammar`(〜로 시작하는 문법 패턴, 예: 〜ておく). `grammar`는 단어장에 넣지 않고 문법 영역의 참고 항목으로 넘긴다. 청해 문항의 vocab에도 같은 `kind`가 필수다 (validate.py 검사).
- **level**: 처음 나온 문항들 중 가장 낮은 레벨(N5가 가장 낮음). 단어 자체의 JLPT 레벨과 다를 수 있으므로 단어장 원본에서 고칠 수 있게 한다.
- **sources**: 이 단어가 나온 문항들. 단어 카드에서 원래 청해 문항으로 이동하는 데 쓴다.
- 같은 key가 여러 문항에 나오면 하나로 합치고 `sources`만 늘린다. `meaning_ko`가 서로 다르면 수집 도구가 목록으로 보고한다.

**청해 vocab 작성 규칙** (validate.py):
- `kind` 누락 → 오류
- `grammar`인데 〜로 시작하지 않음, 또는 〜로 시작하는데 `grammar`가 아님 → 오류
- `word`가 활용 어미(ます형 계열, た·て형, ている형)로 끝남 → 경고. た·て형과 ている형은 한자 뒤 오쿠리가나일 때만 본다(あした 같은 명사 제외). ない형은 형용사 사전형(少ない)과 구분할 수 없어서 검사하지 않는다.
- 같은 한자에 읽기가 여럿인 word는 한자로 써서 key가 겹치지 않게 한다 (要る(いる) ≠ いる(居る)).

**현재 청해 vocab 현황 (샘플 26문항)**: 84개 = word 59 + expression 9 + grammar 16. 처음 83개에서 활용형을 사전형으로 정리했고(いりません → 要る, 足りない → 足りる, 空いている → 空く), 着てみる는 着る(word)와 〜てみる(grammar)로 나눴다.

## 5. 문법 영역 (`grammar`)

문형 사전(문형 목록·상세·예문 음성), 문형 객관식 퀴즈, JLPT 형식 문제 세 가지(연습·실전 모의·오답노트)로 이뤄진다. 숫자(실전 구성·시간·문형 목표 수)는 `config.sections.grammar`에만 둔다.

### 5.1 문형 — `data/grammar/points/{n5,n4,n3}.json` (한 줄에 문형 하나, `schema-points.json`)

```json
{"id": "n5-g-001", "key": "〜てから", "pattern": "〜てから", "level": "N5", "meaning_ko": "~하고 나서",
 "connection": "동사 て형 + から", "explanation_ko": "…2~3문장…",
 "examples": [{"text": "…", "furigana": "…", "meaning_ko": "…"}, {…}], "similar": ["〜たあとで"], "tags": ["순서"]}
```

- **key = pattern**. 기록·참조(문항 targets, similar)의 키라서 한 번 정하면 바꾸지 않는다. 레벨 사이에도 겹치면 안 된다.
- **pattern**: 〜로 시작 (〜てから, 〜なければならない). 접속 대상이 없는 조사·접속사 하나는 〜 없이 (でも, しかし). 변형은 ／로 (〜ないで／〜ずに). 같은 문형을 접속만 달리 쓰는 것(명사 + の + あとで)은 별도 문형으로 만들지 않고 `connection`에 함께 적는다.
- **level**: 일반적인 JLPT 문형 목록 기준. 같은 문형을 낮은 레벨과 높은 레벨에 둘 다 두지 않는다.
- **meaning_ko**: 짧게, 쉼표로 2개까지 (~하고 나서 / ~해도 된다, ~해도 좋다).
- **connection**: 품사 이름은 한국어로 (동사 て형, い형용사 어간, な형용사·명사 + な 등).
- **explanation_ko**: 2~3문장. 쓰임, 뉘앙스, 헷갈리는 문형과의 차이.
- **examples**: 정확히 2개. 그 레벨에 맞는 쉬운 문장, 길이는 `exampleLength` 안팎. 모든 한자에 후리가나 `{漢字|かな}` (오쿠리가나는 밖에: `{食|た}べる`). 음성이 잘못 읽을 곳만 `ttsText`(가나, 읽기가 후리가나와 같아야 함).
- **similar**: 헷갈리기 쉬운 문형의 key (있으면). 다른 레벨이어도 된다.

### 5.2 문제 — `data/grammar/questions/{n5,n4,n3}.json` (`schema-questions.json`)

공통: 일본어는 자연스럽고 정답이 **하나뿐**이어야 한다. 모든 한자에 후리가나. 선택지에 한자가 있으면 `furigana`. `fullKo`는 완성 문장(글)의 한국어 해석. `targets`는 그 문항이 묻는 문형 key (문항 레벨 이하의 문형만). `explanation_ko`는 2~3문장으로 왜 정답인지, `optionNotes_ko`는 선택지마다 왜 틀렸는지 (정답 자리는 빈 문자열). 실제 JLPT 문제를 옮기지 않고 새로 쓴다.

- **bunpou 文法形式の判断**: `stem`에 빈칸 `（　）` 하나. `fullText` = 빈칸에 정답을 넣은 문장. 대화문은 `A：…\nB：…`. 오답 선택지는 같은 동사의 다른 활용, 비슷한 문형, 다른 조사처럼 그럴듯한 것으로.
- **narabe 文の組み立て**: `stem`에 자리 `［＿］` 3개와 `［★］` 1개(띄어 쓰지 않음, 예: `きのうは［＿］［＿］［★］［＿］読みました。`). `options` = 조각 4개(뒤섞인 순서), `order` = 자리 순서대로 놓이는 선택지 번호, `answer` = ★ 자리의 선택지 번호. `fullText` = 순서대로 넣은 문장. 바른 순서가 하나뿐이어야 한다. `optionNotes_ko` 없음, `explanation_ko`에 어떻게 묶이는지와 순서.
- **bunshou 文章の文法**: 짧은 글(일기·편지·안내·작문, N5 200자·N4 250자·N3 350자 안팎) 하나에 빈칸 `［1］`~`［n］`, n = 그 레벨 실전 수(N5·N4 4, N3 5). `items[i]` = 빈칸 i의 선택지·정답·targets·해설·오답 설명. 글 흐름(접속사, 지시어, 문말 표현, 시제·수수 표현)을 묻는다. `title`은 일본어 제목. `fullKo`는 문단(`\n`) 수를 passage와 맞춘다.

### 5.3 기록

`progress.json`의 `sections.grammar.items`: 문항 id(bunpou·narabe) 또는 `{bunshou id}#{빈칸 번호}`별 풀이 기록(청해·문자어휘와 같은 모양, 오답노트 = `review`). 문형 퀴즈 결과는 `items`의 `point:{key}`. `exams`는 실전 모의 (`byType` 키 = 형식).

### 5.4 도구

`tools/validate_grammar.py`(검사), `tools/merge_grammar.py points|questions <배치>`(검사 통과 시 합치기, 문형 id 자동), `tools/build_grammar_audio.py`(예문·문항 음성), 공통 `tools/grammar_common.py`.
