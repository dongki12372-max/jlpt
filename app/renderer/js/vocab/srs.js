// ============================================================
// 문자·어휘 · SRS 복습 간격 계산 (SM-2 단순화). 화면과 저장은 deck.js, 숫자는 config.sections.vocab.srs.
//
//   카드 = { state: 'learning'|'review'|'relearning', due(ms), interval(일), ease, reps, lapses, step, introduced(날짜 키), at(마지막으로 바뀐 시각 ms, 기기 간 동기화용) }
//   새 카드는 기록이 없다 (cards에 키가 없음). 평가: 1 다시 · 2 어려움 · 3 알맞음 · 4 쉬움
//
//   - 학습 단계(learningStepsMinutes: 1분 → 10분): 알맞음이면 다음 단계, 마지막 단계를 넘기면 복습 카드(1일).
//     쉬움이면 바로 복습 카드(4일). 어려움은 지금 단계를 반복. 다시는 첫 단계로.
//   - 복습: 어려움 간격×1.2·계수−0.15 / 알맞음 간격×계수 / 쉬움 간격×계수×1.3·계수+0.15 /
//     다시 계수−0.2 → 다시 학습 단계(relearning). 계수는 minEase 아래로 내려가지 않는다.
//   - lapses = 「다시」를 누른 횟수 (weakLapses 이상이면 약한 단어).
//   - 복습 예정일은 하루의 경계(새벽 dayStartHour시) 기준: due = 오늘 시작 + 간격(일).
// ============================================================
const Srs = (() => {
  const cfg = () => window.APP_CONFIG.sections.vocab.srs;
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const RATINGS = [
    { n: 1, id: 'again', label: '다시' },
    { n: 2, id: 'hard', label: '어려움' },
    { n: 3, id: 'good', label: '알맞음' },
    { n: 4, id: 'easy', label: '쉬움' },
  ];

  // 하루의 시작(새벽 dayStartHour시, 로컬 시간) — ms
  function dayStart(ms) {
    const d = new Date(ms);
    d.setHours(cfg().dayStartHour, 0, 0, 0);
    if (d.getTime() > ms) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  // 날짜 키 'YYYY-MM-DD' (dayStart 기준)
  function dayKey(ms) {
    const d = new Date(dayStart(ms));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // 오늘 시작 + n일 (서머타임이 없어도 setDate로 날짜 단위 이동)
  function addDays(startMs, n) {
    const d = new Date(startMs);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  const clampEase = (e) => Math.max(cfg().minEase, Math.round(e * 100) / 100);
  const roundDays = (x) => Math.max(1, Math.round(x));

  function graduate(card, days, now) {
    card.state = 'review';
    card.interval = days;
    card.step = 0;
    card.due = addDays(dayStart(now), days);
  }

  // 평가 결과 카드 (원본은 바꾸지 않는다)
  function rate(prev, rating, now) {
    const c = cfg();
    const card = prev ? { ...prev } : {
      state: 'learning', due: now, interval: 0, ease: c.startingEase, reps: 0, lapses: 0, step: 0, introduced: dayKey(now),
    };
    const steps = c.learningStepsMinutes;
    card.at = now;
    card.reps += 1;
    if (rating === 1) card.lapses += 1;

    if (card.state === 'learning' || card.state === 'relearning') {
      if (rating === 1) {
        card.step = 0;
        card.due = now + steps[0] * MIN;
      } else if (rating === 2) {
        card.due = now + steps[Math.min(card.step, steps.length - 1)] * MIN;
      } else if (rating === 3) {
        card.step += 1;
        if (card.step >= steps.length) graduate(card, c.graduatingIntervalDays, now);
        else card.due = now + steps[card.step] * MIN;
      } else {
        graduate(card, c.easyIntervalDays, now);
      }
      return card;
    }

    // 복습 카드
    if (rating === 1) {
      card.ease = clampEase(card.ease + c.againEaseDelta);
      card.state = 'relearning';
      card.step = 0;
      card.due = now + steps[0] * MIN;
      return card;
    }
    let days;
    if (rating === 2) {
      days = roundDays(card.interval * c.hardMultiplier);
      card.ease = clampEase(card.ease + c.hardEaseDelta);
    } else if (rating === 3) {
      days = roundDays(card.interval * card.ease);
    } else {
      days = roundDays(card.interval * card.ease * c.easyBonus);
      card.ease = clampEase(card.ease + c.easyEaseDelta);
    }
    card.interval = days;
    card.due = addDays(dayStart(now), days);
    return card;
  }

  // 버튼에 보여 줄 다음 간격 ("1분", "10분", "1일", "3일", "2.1개월")
  function preview(prev, rating, now) {
    const card = rate(prev, rating, now);
    if (card.state !== 'review') return `${Math.max(1, Math.round((card.due - now) / MIN))}분`;
    const d = card.interval;
    if (d < 31) return `${d}일`;
    if (d < 365) return `${(d / 30).toFixed(1)}개월`;
    return `${(d / 365).toFixed(1)}년`;
  }

  const isWeak = (card) => !!card && card.lapses >= cfg().weakLapses;

  // 객관식 퀴즈에서 맞힌 새 단어: 학습 단계를 건너뛰고 바로 복습 카드 (graduatingIntervalDays일 뒤)
  function introduce(now) {
    const card = { state: 'learning', due: now, interval: 0, ease: cfg().startingEase, reps: 1, lapses: 0, step: 0, introduced: dayKey(now), at: now };
    graduate(card, cfg().graduatingIntervalDays, now);
    return card;
  }

  return { RATINGS, MIN, DAY, dayStart, dayKey, addDays, rate, preview, isWeak, introduce };
})();
