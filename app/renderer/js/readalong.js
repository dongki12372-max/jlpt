// ============================================================
// 따라 읽기 (영역 공통): 문장을 단어 사전(Dict)·해석과 함께 그리고, ▶ 음성(Clip)이 나오는 동안 지금 읽는 단어를 초록색으로 표시
//   ReadAlong.html(key, lines, { cls })   lines = [{ markup: 후리가나 문장, gloss: [{t,w,r,m}], ko: 해석(없어도 됨) }]
//     → <div class="read" data-read="key"> 줄마다 <p class="rl">문장 [▶] <span class="ko">해석</span></p> </div>  (▶는 첫 줄 끝)
//   ReadAlong.bind(container, items, back)   items[key] = { src: 음성 주소, words: 줄마다 [[시작초, 끝초, 시작글자, 끝글자]], lines }
//     ▶를 누르면 재생 + 단어 표시, 단어를 누르면 사전 창 (back: 사전 창에서 단어장·문형 사전으로 갔다가 돌아올 화면)
//   단어 시각(words)이 없으면 재생만 한다.
// ============================================================
const ReadAlong = (() => {
  let run = null;   // 지금 따라가는 재생 { el, src }

  function html(key, lines, { cls = '' } = {}) {
    const body = lines.map((ln, i) => `
      <p class="rl" data-line="${i}"><span class="txt" lang="ja">${Dict.glossHtml(ln.markup, ln.gloss || [], `${key}.${i}`)}</span>${
        i === 0 ? ` <button class="btn-mini" data-read-play="${Util.esc(key)}" title="음성">▶</button>` : ''}${
        ln.ko ? `<span class="ko" lang="ko">${Util.esc(ln.ko)}</span>` : ''}</p>`).join('');
    return `<div class="read ${cls}" data-read="${Util.esc(key)}">${body}</div>`;
  }

  function clear() {
    document.querySelectorAll('.read .u.speaking').forEach((el) => el.classList.remove('speaking'));
  }

  function play(el, item) {
    run = null;
    clear();
    Clip.play(item.src);
    if (!item.words) return;
    const me = run = { el, src: item.src };
    const lineEls = Array.from(el.querySelectorAll('.rl'));
    let shown = '';
    const tick = () => {
      if (run !== me) return;
      if (!el.isConnected || Clip.src !== me.src || Clip.ended) { run = null; clear(); return; }
      const t = Clip.currentTime;
      let key = '';
      if (!Clip.paused) {
        item.words.some((words, i) => {
          const w = words.find((x) => t >= x[0] && t < x[1]);
          if (w) key = `${i}:${w[2]}:${w[3]}`;
          return !!w;
        });
      }
      if (key !== shown) {
        shown = key;
        clear();
        if (key) {
          const [i, cs, ce] = key.split(':').map(Number);
          if (lineEls[i]) {
            lineEls[i].querySelectorAll('.u').forEach((u) => {
              const p = Number(u.dataset.p);
              if (p >= cs && p < ce) u.classList.add('speaking');
            });
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function bind(container, items, back) {
    if (!container) return;
    container.querySelectorAll('[data-read-play]').forEach((b) => b.addEventListener('click', () => {
      const item = items[b.dataset.readPlay];
      if (item) play(b.closest('.read'), item);
    }));
    Dict.bind(container, (g) => {
      const at = g.lastIndexOf('.');
      const at2 = g.lastIndexOf('.', at - 1);
      const item = items[g.slice(0, at2)];
      const line = item && item.lines[Number(g.slice(at2 + 1, at))];
      return line && line.gloss ? line.gloss[Number(g.slice(at + 1))] : null;
    }, back);
  }

  return { html, bind };
})();
