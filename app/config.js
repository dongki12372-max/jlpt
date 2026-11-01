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
        playbackRates: [0.8, 0.9, 1.0, 1.1, 1.2],  // 연습 모드 재생 속도
        defaultPlaybackRate: 1.0,

        examScoreMax: 60,                          // 실전 모의 환산 점수 만점 (정답률 × 60)
        passMark: 19,                              // 기준점 표시선
      },
      vocab:   { label_ko: '문자·어휘', label_ja: '文字・語彙', enabled: false },
      grammar: { label_ko: '문법',     label_ja: '文法',     enabled: false },
    },

    reviewClearStreak: 2,                          // 오답노트에서 자동 제거되는 연속 정답 수 (전 영역 공통)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  else root.APP_CONFIG = config;
})(typeof window !== 'undefined' ? window : globalThis);
