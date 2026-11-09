// ============================================================
// 공용 도우미: HTML 이스케이프, 후리가나 표기 → <ruby>, 시간 표시, 섞기, 현재 시각(테스트용 시계)
// ============================================================
const Util = (() => {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  // {漢字|かんじ} → <ruby>漢字<rt>かんじ</rt></ruby> (이스케이프 먼저, 중괄호·|는 영향 없음)
  const furigana = (markup) =>
    esc(markup).replace(/\{([^{}|]+)\|([^{}|]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');

  const fmtTime = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const SPEAKER_LABEL = { M: '男', F: '女', M2: '男2', F2: '女2', N: 'ナレーション' };

  // 현재 시각 (ms). 테스트(smoke)가 clockOffset으로 날짜를 앞당겨 SRS 복습 예정을 확인한다.
  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;
  const setClockOffset = (ms) => { clockOffset = ms; };

  // 문항 화면 상단의 위치 표시. opts.onPrev·onSkip이 있으면 「‹ 이전」「건너뛰기 ›」 버튼을 붙인다 (연습·오답노트)
  const stepNav = (opts, answered) => {
    if (!opts.onPrev && !opts.onSkip) return `<span class="pos">${esc(opts.pos || '')}</span>`;
    return `<span class="pos step-nav">
      <button class="step" data-act="step-prev" title="이전 문항 (←)" ${opts.onPrev ? '' : 'disabled'}>‹ 이전</button>
      <span>${esc(opts.pos || '')}</span>
      <button class="step" data-act="step-skip" title="다음 문항 (→)">${answered === null ? '건너뛰기' : '다음'} ›</button>
    </span>`;
  };
  const bindStepNav = (root, opts) => {
    const prev = root.querySelector('[data-act="step-prev"]');
    const skip = root.querySelector('[data-act="step-skip"]');
    if (prev && opts.onPrev) prev.addEventListener('click', opts.onPrev);
    if (skip && opts.onSkip) skip.addEventListener('click', opts.onSkip);
  };
  // ← → 키 (처리했으면 true)
  const stepKey = (e, opts) => {
    if (e.key === 'ArrowLeft' && opts.onPrev) { opts.onPrev(); return true; }
    if (e.key === 'ArrowRight' && opts.onSkip) { opts.onSkip(); return true; }
    return false;
  };

  // 연습 결과: 문항 한 줄 (r 없음 = 건너뜀, label은 HTML) · 머리 (정답 / 푼 문항 · 건너뜀)
  const resultRow = (r, label) => {
    const [cls, mark] = !r ? ['skip', '–'] : r.correct ? ['ok', '○'] : ['ng', '×'];
    return `<li class="${cls}"><span class="mark">${mark}</span> ${label}</li>`;
  };
  const resultHead = (list, results) => {
    const done = list.filter((q) => results[q.id]);
    const correct = done.filter((q) => results[q.id].correct).length;
    const skipped = list.length - done.length;
    return `<h2>${correct} / ${done.length} 정답</h2>${skipped ? `<p class="dim">건너뛴 문항 ${skipped}개 (기록에 남지 않음)</p>` : ''}`;
  };

  // 「모름」 버튼: 모르는 문항을 찍지 않고 넘긴다 → 답 0(오답)으로 기록하고 정답·해설을 보여 준다. 키 0
  const dontKnow = (box, answered, onPick) => {
    if (answered !== null || !box) return;
    box.insertAdjacentHTML('beforeend', '<button class="dontknow" data-act="dontknow" title="모르면 찍지 말고 (0)">모름 <span class="kbd">0</span></button>');
    box.querySelector('[data-act="dontknow"]').addEventListener('click', onPick);
  };
  // 채점 문구. 답 0 = 모름 (실전 모의 해설에서는 blank = '무응답')
  const verdictText = (answered, answer, blank = '모름') => (answered === answer ? '정답입니다'
    : answered === 0 ? `${blank} — 정답은 ${answer}번` : `오답입니다 — 정답은 ${answer}번`);

  // 유형별 연습 「이어서」: 지난번에 마지막으로 푼 문항(기록 at, 없으면 lastAt) 다음 자리. 다 돌면 처음으로 (기록 없으면 0)
  const resumeIndex = (list, recordOf) => {
    const stamp = (r) => (r ? r.at || Date.parse(r.lastAt || '') || 0 : 0);
    let last = -1;
    let best = 0;
    list.forEach((q, i) => { const s = stamp(recordOf(q)); if (s > best) { best = s; last = i; } });
    return list.length ? (last + 1) % list.length : 0;
  };
  // 문항 순서: resume = 이어서(그 자리부터 돌아서 앞 문항은 뒤로), seq = 처음부터, random = 무작위
  const orderList = (list, order, recordOf) => {
    if (order === 'random') return shuffle(list);
    if (order !== 'resume') return list.slice();
    const k = resumeIndex(list, recordOf);
    return list.slice(k).concat(list.slice(0, k));
  };
  const orderButtons = (order) => `<div class="segmented" role="radiogroup">
      <button data-order="resume" class="${order === 'resume' ? 'active' : ''}" title="지난번에 푼 문항 다음부터">이어서</button>
      <button data-order="seq" class="${order === 'seq' ? 'active' : ''}">처음부터</button>
      <button data-order="random" class="${order === 'random' ? 'active' : ''}">무작위</button>
    </div>`;
  // 유형 카드에 붙이는 「다음 N번부터」 (이어서일 때, 푼 적이 있을 때만)
  const resumeNote = (list, order, recordOf) => {
    if (order !== 'resume' || !list.some(recordOf)) return '';
    return ` · <span class="resume-from">다음 ${resumeIndex(list, recordOf) + 1}번부터</span>`;
  };

  return {
    esc, furigana, fmtTime, shuffle, SPEAKER_LABEL, now, setClockOffset, stepNav, bindStepNav, stepKey, resultRow, resultHead, dontKnow, verdictText,
    resumeIndex, orderList, orderButtons, resumeNote,
  };
})();
