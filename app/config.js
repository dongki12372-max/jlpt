// ============================================================
// 앱 전역 설정 — 이름, 레벨, 영역(section)별 규칙과 실전 구성, 타이밍 값.
//   숫자 값은 여기(앱·검증)와 tools/voices.json(음성 쉼)에만 둔다.
//   Node(require)와 렌더러(<script src>) 양쪽에서 읽을 수 있게 UMD 형태로 내보낸다.
//   tools/validate.py, tools/build_audio.py도 node로 이 파일을 읽는다.
// ============================================================
(function (root) {
  const config = {
    appName: 'JLPT 청해 연습',
    appId: 'com.jlpt.listening',

    // 레벨 (전 영역 공통, 홈 화면 탭 순서)
    levels: {
      N5: { label: 'N5' },
      N4: { label: 'N4' },
      N3: { label: 'N3' },
    },

    // 영역: 홈 화면 탭 순서와 활성 여부. enabled=false는 '준비 중'으로 표시한다.
    //   데이터는 data/{영역}/, 음성은 audio/{영역}/, 기록은 progress.json의 sections.{영역}
    sectionOrder: ['listening', 'vocab', 'grammar'],
    defaultSection: 'listening',
    sections: {
      listening: {
        label_ko: '청해', label_ja: '聴解', enabled: true,

        // 유형 규칙: 선택지 개수, 선택지를 음성으로 읽는지(화면에서 숨김)
        types: {
          kadai:   { label_ja: '課題理解',   label_ko: '과제이해', optionCount: 4, spokenOptions: false },
          point:   { label_ja: 'ポイント理解', label_ko: '포인트이해', optionCount: 4, spokenOptions: false },
          gaiyou:  { label_ja: '概要理解',   label_ko: '개요이해', optionCount: 4, spokenOptions: true },
          hatsuwa: { label_ja: '発話表現',   label_ko: '발화표현', optionCount: 3, spokenOptions: true },
          sokuji:  { label_ja: '即時応答',   label_ko: '즉시응답', optionCount: 3, spokenOptions: true },
        },
        // 실전 모의의 문제 순서 (문제1 → 마지막)
        typeOrder: ['kadai', 'point', 'gaiyou', 'hatsuwa', 'sokuji'],

        // 레벨별 실전 구성. exam에 없는 유형은 그 레벨에서 출제 금지 (validate.py가 검사).
        //   pointReadingSec: 포인트이해에서 대화 전 선택지 읽는 시간(초, 음성 안의 무음)
        levels: {
          N5: { examMinutes: 30, pointReadingSec: 10, exam: { kadai: 7, point: 6, hatsuwa: 5, sokuji: 6 } },
          N4: { examMinutes: 35, pointReadingSec: 15, exam: { kadai: 8, point: 7, hatsuwa: 5, sokuji: 8 } },
          N3: { examMinutes: 40, pointReadingSec: 20, exam: { kadai: 6, point: 6, gaiyou: 3, hatsuwa: 4, sokuji: 9 } },
        },

        answerSeconds: 12,                         // 답 고르는 시간 기본값 (설정에서 변경 가능)
        answerSecondsOptions: [8, 10, 12, 15, 20], // 설정 화면의 답 고르는 시간 선택지
        examGapSeconds: 1.5,                       // 실전 모의: 답 고르는 시간이 끝난 뒤 다음 음성까지
        playbackRates: [0.8, 0.9, 1.0, 1.1, 1.2],  // 연습 모드 재생 속도
        defaultPlaybackRate: 1.0,

        examScoreMax: 60,                          // 실전 모의 환산 점수 만점 (정답률 × 60)
        passMark: 19,                              // 기준점 표시선
      },
      vocab: {
        label_ko: '문자·어휘', label_ja: '文字・語彙', enabled: true,

        // 문제 유형 (모두 4지선다). 用法은 N4·N3만. instruction = 유형 첫머리 지시문 (공식 문구가 아니라 같은 취지로 새로 씀)
        types: {
          yomi:     { label_ja: '漢字読み',   label_ko: '한자 읽기', instruction: '＿＿＿の　ことばは　ひらがなで　どう　よみますか。1〜4から　いちばん　あう　ものを　えらんで　ください。' },
          hyouki:   { label_ja: '表記',       label_ko: '표기', instruction: '＿＿＿の　ことばを　かんじで　かくと　どれですか。1〜4から　えらんで　ください。' },
          bunmyaku: { label_ja: '文脈規定',   label_ko: '문맥 규정', instruction: '（　　）に　いれる　ことばとして　いちばん　あう　ものを　1〜4から　えらんで　ください。' },
          iikae:    { label_ja: '言い換え類義', label_ko: '유의 표현', instruction: '＿＿＿の　ことばと　だいたい　おなじ　いみの　ものは　どれですか。1〜4から　えらんで　ください。' },
          youhou:   { label_ja: '用法',       label_ko: '용법', instruction: 'つぎの　ことばの　つかいかたが　いちばん　ただしい　ぶんを　1〜4から　えらんで　ください。' },
        },
        typeOrder: ['yomi', 'hyouki', 'bunmyaku', 'iikae', 'youhou'],
        optionCount: 4,
        // 레벨별 실전 구성. exam에 없는 유형은 그 레벨에서 출제 금지 (validate_vocab.py가 검사).
        levels: {
          N5: { examMinutes: 20, exam: { yomi: 7, hyouki: 5, bunmyaku: 6, iikae: 3 } },
          N4: { examMinutes: 25, exam: { yomi: 7, hyouki: 5, bunmyaku: 8, iikae: 4, youhou: 4 } },
          N3: { examMinutes: 30, exam: { yomi: 8, hyouki: 6, bunmyaku: 11, iikae: 5, youhou: 5 } },
        },
        maxSameTargetPerType: 3,                   // 한 레벨에서 같은 단어가 같은 유형의 targets로 나오는 최대 횟수

        // 단어 데이터
        wordTargets: { N5: 700, N4: 650, N3: 1800 },  // 레벨별 신규 단어 목표 수
        exampleLength: { N5: 15, N4: 20, N3: 30 },    // 예문 길이 기준(글자, 안팎) — 1.6배를 넘으면 경고
        meaningMax: 3,                                 // meaning_ko 뜻 개수 최대
        pos: {
          noun: '명사', verb: '동사', 'i-adj': 'い형용사', 'na-adj': 'な형용사',
          adverb: '부사', katakana: '외래어', other: '기타',
        },

        // SRS (SM-2 단순화). 간격 단위: 학습 단계는 분, 복습은 일
        srs: {
          learningStepsMinutes: [1, 10],   // 새 카드·「다시」 뒤 학습 단계
          graduatingIntervalDays: 1,       // 학습 단계를 마친 뒤 첫 간격
          easyIntervalDays: 4,             // 학습 중 「쉬움」이면 바로 이 간격
          startingEase: 2.5,
          minEase: 1.3,
          hardMultiplier: 1.2,             // 「어려움」: 간격 × 1.2
          hardEaseDelta: -0.15,
          easyBonus: 1.3,                  // 「쉬움」: 간격 × 계수 × 1.3
          easyEaseDelta: 0.15,
          againEaseDelta: -0.2,            // 복습 카드 「다시」
          weakLapses: 8,                   // 「다시」를 이 횟수 이상 누른 카드 = 약한 단어
          newPerDay: 20,                   // 하루 새 카드 수 (기본값, 설정에서 변경 가능)
          newPerDayOptions: [10, 20, 30, 50],
          dayStartHour: 4,                 // 하루의 경계 (새벽 4시)
          learnAheadMinutes: 20,           // 남은 카드가 학습 단계뿐이면 이 시간 안에 올 카드를 앞당겨 보여 준다
        },
        // 단어장 객관식 퀴즈 (선택지 수는 위 optionCount)
        quiz: {
          counts: [10, 20, 50],            // 한 번에 풀 문항 수 선택지
          defaultCount: 20,
        },
      },
      grammar: {
        label_ko: '문법', label_ja: '文法', enabled: true,

        // 문제 형식. instruction = 형식 첫머리 지시문 (공식 문구가 아니라 같은 취지로 새로 씀)
        //   bunpou 문법 형식: 문장의 （　）에 들어갈 말 4지선다
        //   narabe 문장 만들기: 조각 4개를 순서대로 놓았을 때 ★ 자리에 오는 조각 (화면에서는 눌러서 배열)
        //   bunshou 글의 문법: 글 하나에 빈칸 ［1］~［n］, 빈칸마다 4지선다 (문항 하나 = 글 하나, 빈칸 수만큼 채점)
        types: {
          bunpou:  { label_ja: '文法形式の判断', label_ko: '문법 형식', instruction: 'つぎの　文の　（　）に　何を　入れますか。1・2・3・4から　いちばん　いい　ものを　一つ　えらんで　ください。' },
          narabe:  { label_ja: '文の組み立て',   label_ko: '문장 만들기', instruction: '★に　入る　ものは　どれですか。ことばを　ならべて　文を　作って　ください。' },
          bunshou: { label_ja: '文章の文法',     label_ko: '글의 문법', instruction: '文章を　読んで、［1］から［n］の　中に　入る　いちばん　いい　ものを　1・2・3・4から　えらんで　ください。' },
        },
        typeOrder: ['bunpou', 'narabe', 'bunshou'],
        optionCount: 4,
        // 레벨별 실전 구성 (bunshou는 빈칸 수 = 글 한 편의 빈칸). 실제 시험은 문법과 독해를 합쳐 N5 40분·N4 55분·N3 70분이라 문법 몫만 잡았다.
        levels: {
          N5: { examMinutes: 15, exam: { bunpou: 9, narabe: 4, bunshou: 4 } },
          N4: { examMinutes: 20, exam: { bunpou: 13, narabe: 4, bunshou: 4 } },
          N3: { examMinutes: 25, exam: { bunpou: 13, narabe: 5, bunshou: 5 } },
        },
        maxSameTargetPerType: 3,                   // 한 레벨에서 같은 문형이 같은 형식의 targets로 나오는 최대 횟수

        // 문형 데이터
        pointTargets: { N5: 70, N4: 90, N3: 110 },  // 레벨별 문형 수 목표
        examplesPerPoint: 2,
        exampleLength: { N5: 18, N4: 24, N3: 32 },  // 예문 길이 기준(글자, 안팎) — 1.6배를 넘으면 경고

        // 문형 객관식 퀴즈
        quiz: {
          counts: [10, 20, 50],
          defaultCount: 20,
        },
      },
    },

    reviewClearStreak: 2,                          // 오답노트에서 자동 제거되는 연속 정답 수 (전 영역 공통)

    // 기기 간 동기화 (js/sync.js) — Firebase 프로젝트의 Firestore. 비어 있으면 설정 화면에 「서버 설정 전」으로 나온다.
    //   apiKey·projectId는 웹 앱에 그대로 들어가는 공개 값이다 (접근 제어는 Firestore 규칙: 20자 코드 경로만 허용).
    sync: {
      projectId: '',
      apiKey: '',
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.APP_CONFIG = config;
})(typeof window !== 'undefined' ? window : globalThis);
