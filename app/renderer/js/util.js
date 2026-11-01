// ============================================================
// 공용 도우미: HTML 이스케이프, 후리가나 표기 → <ruby>, 시간 표시, 섞기
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

  return { esc, furigana, fmtTime, shuffle, SPEAKER_LABEL };
})();
