// ============================================================
// 청해(聴解) 영역: 데이터 접근 도우미, 홈 화면의 모드·요약, App에 등록
// ============================================================
const Listening = (() => {
  const SECTION = 'listening';
  const cfg = window.APP_CONFIG.sections[SECTION];
  let data = null;   // { questions: {n5: […]}, manifest: {id: {...}} }

  async function load() {
    data = await window.jlpt.loadSection(SECTION);
  }

  const questions = (level) => data.questions[level.toLowerCase()] || [];
  const levelTypes = (level) => cfg.typeOrder.filter((t) => t in cfg.levels[level].exam);
  const audioUrl = (q) => `../../audio/${SECTION}/${q.level.toLowerCase()}/${q.id}.mp3`;
  const audioInfo = (q) => data.manifest[q.id] || null;
  const readImage = (name) => window.jlpt.readImage(SECTION, name);

  // ---------- 홈 ----------
  function modes(level) {
    return [
      { id: 'practice', title: '유형별 연습', desc: '유형을 골라 한 문제씩 풀고 바로 해설 확인', enabled: true, open: () => Practice.showSetup(level) },
      { id: 'exam', title: '실전 모의', desc: '준비 중', enabled: false },
      { id: 'review', title: '오답노트', desc: '준비 중', enabled: false },
    ];
  }

  function summary(level) {
    const qs = questions(level);
    const rows = levelTypes(level).map((t) => {
      const ofType = qs.filter((q) => q.type === t);
      const withAudio = ofType.filter((q) => audioInfo(q)).length;
      return `
        <tr>
          <td><span lang="ja">${cfg.types[t].label_ja}</span> <span class="dim">${cfg.types[t].label_ko}</span></td>
          <td class="num">${ofType.length}</td>
          <td class="num">${cfg.levels[level].exam[t]}</td>
          <td class="num ${withAudio < ofType.length ? 'warn' : ''}">${withAudio} / ${ofType.length}</td>
        </tr>`;
    }).join('');
    return `
      <section class="card">
        <h2>${level} 청해 문제 은행</h2>
        <table class="table">
          <thead><tr><th>유형</th><th class="num">문항</th><th class="num">실전 구성</th><th class="num">음성</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }

  App.registerSection(SECTION, { load, modes, summary });

  return { SECTION, cfg, questions, levelTypes, audioUrl, audioInfo, readImage };
})();
