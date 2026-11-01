# 영역(section) 구조와 데이터 설계

청해 이후에 문자·어휘(SRS 단어장 + JLPT 형식 문제)와 문법(빈칸, ★ 배열, 글의 문법)을 같은 앱에 추가할 수 있도록 정한 구조다. 지금 구현된 영역은 청해(`listening`) 하나다.

## 1. 영역 구조

| 위치 | 규칙 |
|---|---|
| `app/config.js` | `levels`(전 영역 공통), `sectionOrder`, `sections.{영역}` (`label_ko`, `label_ja`, `enabled` + 영역 전용 설정). 청해의 유형·실전 구성·타이밍은 `sections.listening` 안에 있다. `reviewClearStreak`은 전 영역 공통 |
| `data/{영역}/` | 영역 데이터. 청해: `questions/{n5,n4,n3}.json`, `schema.json`, `intros.json`, `images/` |
| `audio/{영역}/` | 생성 음성과 `manifest.json` (git 제외). 청해: `audio/listening/{level}/{id}.mp3` |
| `app/main.js` | `SECTION_LOADERS.{영역}`이 그 영역 데이터를 읽는다. IPC는 `section:load`, `section:image` |
| `app/renderer/js/{영역}/` | 영역 모듈. `index.js`가 `App.registerSection(id, { load, modes, summary })`로 등록하고, 화면 파일(`practice.js` 등)을 둔다 |
| `app/renderer/js/` 바로 아래 | 영역 공통: `app.js`(홈·화면 전환), `player.js`, `util.js`, `boot.js`, (Phase 5) `storage.js` |
| `tools/` | `validate.py`, `build_audio.py`는 청해 전용 (`load_listening_config()`). 새 영역의 도구는 따로 둔다 (예: `validate_vocab.py`) |

**새 영역을 켜는 순서**: `data/{영역}/` 데이터 → `main.js`에 로더 → `js/{영역}/index.js`에서 등록 → `index.html`에 스크립트 추가 → `config.sections.{영역}.enabled = true`.

홈 화면은 영역 탭 → 레벨 탭(N5·N4·N3) → 그 영역의 모드 버튼 → 영역 요약 순서다. `enabled=false`이거나 모듈이 없는 영역은 탭에 '준비 중'으로 비활성 표시된다.

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
          "byType": { "kadai": { "total": 6, "correct": 5 } },
          "answers": [ { "id": "n3-kadai-001", "chosen": 3, "correct": true } ]
        }
      ]
    }
  }
}
```

- **items**: 문항별 기록. 공통 필드는 `attempts`, `lastCorrect`, `streak`(연속 정답 수), `lastAt`이다. 영역마다 필드를 더 붙일 수 있다. 예를 들어 단어장은 SRS 상태(`srs: { due, interval, ease }`)를 둔다.
- **오답노트는 별도 목록이 아니라 `items[*].review` 플래그**다. 틀리면 `true`가 되고, `streak`이 `reviewClearStreak`(2) 이상이 되면 자동으로 `false`가 된다. 수동으로 빼면 `false`가 되고 `reviewManual: true`를 남긴다. 영역별 오답노트는 해당 영역 `items`를 거르기만 하면 된다.
- **exams**: 실전 모의 기록. `answers`가 있어서 나중에 기록 화면에서 문항별 해설로 다시 들어갈 수 있다. `byType`의 키는 영역마다 다르다(청해는 유형, 문법은 문제 형식).
- **settings**: `common`은 전 영역 공통(후리가나 표시 등), 나머지는 영역 키 아래에 둔다.
- 영역 키가 없으면 빈 기록으로 본다. 그래서 새 영역을 추가할 때 마이그레이션이 필요 없다. 구조를 바꿀 때만 `version`을 올린다.

## 3. 단어 데이터 형식 (청해 vocab → 단어장)

지금은 형식만 정해 둔다. 수집 도구(`tools/collect_vocab.py`)와 단어장은 문자·어휘 영역을 시작할 때 만든다.

**수집 결과**: `data/vocab/collected.json`. 생성물이며, 검토한 뒤 단어장 원본(`data/vocab/{n5,n4,n3}.json`)으로 옮긴다.

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
- **kind** = `word`(단어장 대상) / `phrase`(인사·관용 표현, 예: お先に失礼します) / `grammar`(문법 패턴, 예: 〜ておく). `grammar`는 단어장에 넣지 않고 문법 영역의 참고 항목으로 넘긴다.
- **level**: 처음 나온 문항들 중 가장 낮은 레벨(N5가 가장 낮음). 단어 자체의 JLPT 레벨과 다를 수 있으므로 단어장 원본에서 고칠 수 있게 한다.
- **sources**: 이 단어가 나온 문항들. 단어 카드에서 원래 청해 문항으로 이동하는 데 쓴다.
- 같은 key가 여러 문항에 나오면 하나로 합치고 `sources`만 늘린다. `meaning_ko`가 서로 다르면 수집 도구가 목록으로 보고한다.

**현재 청해 vocab 현황 (샘플 26문항)**: 83개, 모두 서로 다름. 그중 15개가 `〜`로 시작하는 문법 패턴이다. 활용형이나 구로 적은 단어(いりません, おふろに入る)도 있어서, 수집할 때 사전형으로 정리해야 한다.
