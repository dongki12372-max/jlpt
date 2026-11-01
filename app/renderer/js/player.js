// ============================================================
// 오디오 재생: 재생/일시정지, 처음부터, 속도(피치 유지), 구간 재생, 변화 알림
//   실전 모의의 재생 제한은 exam.js가 이 위에서 버튼을 숨기는 방식으로 처리한다.
// ============================================================
const Player = (() => {
  const audio = new Audio();
  audio.preservesPitch = true;

  let stopAt = null;   // 구간 재생 끝 시각 (초)
  let rafId = 0;
  let stopTimer = 0;
  const listeners = new Set();
  const errorListeners = new Set();

  const emit = () => listeners.forEach((fn) => fn());

  // 구간 끝 확인은 타이머로 한다. requestAnimationFrame은 창이 가려지면 멈추므로 화면 갱신에만 쓴다.
  // (창이 뒤에 있어도 타이머가 느려지지 않도록 main.js에서 backgroundThrottling을 끈다)
  function checkStop() {
    clearTimeout(stopTimer);
    if (stopAt === null || audio.paused) return;
    if (audio.currentTime >= stopAt) {
      stopAt = null;
      audio.pause();
      return;
    }
    const ms = ((stopAt - audio.currentTime) / (audio.playbackRate || 1)) * 1000;
    stopTimer = setTimeout(checkStop, Math.min(Math.max(ms, 5), 250));
  }

  function tick() {
    emit();
    if (!audio.paused) rafId = requestAnimationFrame(tick);
  }

  audio.addEventListener('play', () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(tick); checkStop(); });
  ['seeked', 'ratechange', 'timeupdate'].forEach((ev) => audio.addEventListener(ev, checkStop));
  ['pause', 'ended', 'loadedmetadata', 'ratechange', 'seeked'].forEach((ev) => audio.addEventListener(ev, emit));
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) errorListeners.forEach((fn) => fn()); });

  return {
    load(src) {
      stopAt = null;
      audio.src = src;
      audio.load();
    },
    play() {
      return audio.play().catch(() => {});
    },
    pause() { audio.pause(); },
    toggle() { return audio.paused ? this.play() : (audio.pause(), undefined); },
    restart() {
      stopAt = null;
      audio.currentTime = 0;
      return this.play();
    },
    // start~end 구간만 재생 (해설의 대사 다시 듣기)
    playSegment(start, end) {
      audio.currentTime = start;
      stopAt = end;
      const p = this.play();
      checkStop();   // 이미 재생 중이면 play 이벤트가 오지 않는다
      return p;
    },
    seek(t) { audio.currentTime = t; },
    setRate(r) {
      audio.defaultPlaybackRate = r;  // src가 바뀌어도 유지되도록
      audio.playbackRate = r;
    },
    stop() {
      stopAt = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
    get currentTime() { return audio.currentTime; },
    get duration() { return Number.isFinite(audio.duration) ? audio.duration : 0; },
    get paused() { return audio.paused; },
    get rate() { return audio.playbackRate; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onError(fn) { errorListeners.add(fn); return () => errorListeners.delete(fn); },
  };
})();
