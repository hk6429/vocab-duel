/* 健康每日閉環：10 題題組、中斷續答、5/7 週目標。UI 依舊沿用既有出題與進度系統。 */
const VDDailyQuest = (() => {
  const STATE_KEY = 'vd_dailyquest_v1';
  const HISTORY_KEY = 'vd_dailyquest_history_v1';
  const TOTAL = 10;

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch { return fallback; }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function shuffled(items, random) {
    const out = items.slice();
    const rand = random || Math.random;
    for (let index = out.length - 1; index > 0; index--) {
      const pick = Math.floor(rand() * (index + 1));
      [out[index], out[pick]] = [out[pick], out[index]];
    }
    return out;
  }

  function buildPlan(words, opts) {
    const random = opts && opts.random;
    const chosen = [];
    const used = new Set();
    const add = (pool, count, source) => {
      let added = 0;
      for (const word of shuffled(pool, random)) {
        if (!word || used.has(word.word)) continue;
        used.add(word.word);
        chosen.push({ word: word.word, source, level: word.level || '' });
        if (++added === count) break;
      }
    };
    const due = words.filter(word => VDStore.isDue(word.word));
    const weak = words.filter(word => VDStore.isWrong(word.word));
    const fresh = words.filter(word => !VDStore.isSeen(word.word));
    add(due, 5, 'due');
    add(weak, 3, 'weak');
    add(fresh, 2, 'fresh');

    // 分類不足時依學習優先順序補題，最後才從同範圍其他字補齊。
    for (const [pool, source] of [[weak, 'weak'], [due, 'due'], [fresh, 'fresh'], [words, 'scope']]) {
      if (chosen.length >= TOTAL) break;
      add(pool, TOTAL - chosen.length, source);
    }
    return chosen.slice(0, TOTAL);
  }

  function normalizeState(state) {
    state.answers = Array.isArray(state.answers) ? state.answers.slice(0, state.plan.length) : [];
    while (state.answers.length < state.plan.length) state.answers.push(null);
    state.done = state.answers.filter(answer => answer !== null).length;
    return state;
  }

  function load(words, opts) {
    const date = VDStore.today();
    const saved = read(STATE_KEY, null);
    if (saved && saved.date === date && Array.isArray(saved.plan) && saved.plan.length) {
      return normalizeState(saved);
    }
    const state = normalizeState({
      date,
      plan: buildPlan(words, opts),
      answers: [],
      done: 0,
      completedAt: null,
      reward: null
    });
    write(STATE_KEY, state);
    return state;
  }

  function current() {
    const state = read(STATE_KEY, null);
    return state ? normalizeState(state) : null;
  }

  function record(index, correct) {
    const state = current();
    if (!state || state.date !== VDStore.today()) throw new Error('今日任務尚未建立');
    if (!Number.isInteger(index) || index < 0 || index >= state.plan.length) throw new Error('題號無效');
    if (state.answers[index] === null) state.answers[index] = !!correct;
    normalizeState(state);
    write(STATE_KEY, state);
    return state;
  }

  function complete() {
    const state = current();
    if (!state || state.date !== VDStore.today() || state.done < state.plan.length) {
      return { ok: false, newlyCompleted: false, state };
    }
    if (state.completedAt) return { ok: true, newlyCompleted: false, state };
    state.completedAt = Date.now();
    write(STATE_KEY, state);
    const history = read(HISTORY_KEY, {});
    history[state.date] = {
      completed: true,
      correct: state.answers.filter(Boolean).length,
      total: state.plan.length
    };
    write(HISTORY_KEY, history);
    return { ok: true, newlyCompleted: true, state };
  }

  function mondayOf(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    return date;
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function weekInfo(anchor) {
    const start = mondayOf(anchor || VDStore.today());
    const history = read(HISTORY_KEY, {});
    const dates = [];
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = dateKey(date);
      dates.push({ date: key, completed: !!(history[key] && history[key].completed) });
    }
    const days = dates.filter(item => item.completed).length;
    return { days, target: 5, goalMet: days >= 5, bonus: days === 7, dates };
  }

  function progressHtml(state) {
    return `<div class="dq-steps" role="progressbar" aria-label="今日 10 題進度" aria-valuemin="0" aria-valuemax="${state.plan.length}" aria-valuenow="${state.done}">
      ${state.answers.map((answer, index) => `<span class="${answer === true ? 'ok' : answer === false ? 'review' : ''}" aria-label="第 ${index + 1} 題${answer === null ? '未作答' : answer ? '完成' : '待復習'}">${index + 1}</span>`).join('')}
    </div>`;
  }

  function homeCard(words) {
    const state = load(words);
    const week = weekInfo();
    const remaining = Math.max(0, state.plan.length - state.done);
    const finished = !!state.completedAt;
    const verb = finished ? '今日已收工' : state.done ? `繼續第 ${state.done + 1} 題` : '開始今日任務';
    if (localStorage.getItem('vd_classcode')) setTimeout(refreshTogether, 0);
    return `<section class="dq-home wc-card" aria-labelledby="dqHomeTitle">
      <img class="dq-home-art" src="img/ui/h_daily.webp" alt="" loading="eager">
      <div class="dq-home-shade"></div>
      <div class="dq-home-content">
        <span class="dq-kicker">每日章回 · ${week.days}/7 天</span>
        <h2 id="dqHomeTitle">${finished ? '今日 10 題完成' : '今日 10 題'}</h2>
        <p>${finished ? '今天的記憶已經存檔，去探索詞靈或先休息都可以。' : `${remaining} 題・約 5–8 分鐘・到期 5＋弱字 3＋新字 2`}</p>
        ${progressHtml(state)}
        <div class="dq-home-meta"><span>今日獎勵：40 XP／40 字幣／寶箱三選一</span><span>週目標：${week.days}/5 ${week.goalMet ? '已達成' : ''}</span>${localStorage.getItem('vd_classcode') ? '<span id="dqTogether">正在找今天一起學的同學…</span>' : ''}</div>
        <button class="btn dq-primary" onclick="VDApp.go('dailyquest')">${verb} →</button>
      </div>
    </section>`;
  }

  async function refreshTogether() {
    const element = document.getElementById('dqTogether');
    const code = localStorage.getItem('vd_classcode');
    if (!element || !code) return;
    const api = location.hostname === 'vocab-duel.pages.dev' ? '' : 'https://vocab-duel.pages.dev';
    try {
      const response = await fetch(`${api}/api/board?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      const data = await response.json();
      const today = VDStore.today();
      const count = (data.rows || []).filter(row => row.ts && new Date(row.ts).toLocaleDateString('sv-SE') === today).length;
      element.textContent = count ? `今天已有 ${count} 位同學一起學` : '你是今天第一位回來的同學';
    } catch { element.textContent = '今天的班級伙伴稍後再顯示'; }
  }

  function tomorrowTeaser() {
    const teasers = ['明天的文豪：安徒生會帶來一個故事字', '明天的詞靈：一隻字綴守護獸正在接近', '明天的寶箱：藏著一個神秘字'];
    let seed = 0;
    for (const char of VDStore.today()) seed += char.charCodeAt(0);
    return teasers[seed % teasers.length];
  }

  function claimReward(kind, el, words) {
    const result = VDGame.claimHabitReward(kind);
    const state = current();
    if (result.ok && state) {
      state.reward = kind;
      write(STATE_KEY, state);
      VDGame.toast(kind === 'xp' ? '+40 XP' : kind === 'coins' ? '+40 字幣' : '普通寶箱已開啟');
    }
    renderDone(el, words);
  }

  function rewardHtml(state) {
    if (state.reward) {
      const label = { xp: '40 XP', coins: '40 字幣', chest: '普通寶箱' }[state.reward];
      return `<div class="dq-reward-picked">✨ 今日獎勵：${label}</div>`;
    }
    return `<div class="dq-rewards" aria-label="選擇今日獎勵">
      <button class="btn" data-reward="xp">🌟 40 XP</button>
      <button class="btn" data-reward="coins">🪙 40 字幣</button>
      <button class="btn" data-reward="chest">🎁 普通寶箱</button>
    </div>`;
  }

  function renderDone(el, words) {
    const state = current();
    const correct = state.answers.filter(Boolean).length;
    const rescued = state.plan.filter((item, index) => item.source === 'weak' && state.answers[index]).length;
    const fresh = state.plan.filter((item, index) => item.source === 'fresh' && state.answers[index]).length;
    const review = state.answers.filter(answer => answer === false).length;
    const week = weekInfo();
    el.innerHTML = `<div class="dq-done card-done">
      <div class="big">${correct >= 8 ? '🏆' : '🌱'}</div>
      <h2>今天收工，記憶已存檔</h2>
      <p>答對 ${correct}/${state.plan.length}；新熟悉 ${fresh} 字、救回弱字 ${rescued} 個、待復習 ${review} 個。</p>
      ${progressHtml(state)}
      ${rewardHtml(state)}
      <div class="dq-week"><b>本週章回 ${week.days}/7</b><span>${week.goalMet ? '週目標已達成' : `再完成 ${5 - week.days} 天可取得週章`}${week.bonus ? '・七日榮譽章' : ''}</span></div>
      <div class="dq-teaser">🌙 ${tomorrowTeaser()}</div>
      <div class="dq-actions">
        <button class="btn" onclick="VDApp.go('menu')">今天收工</button>
        <button class="btn ghost" id="dqExtra">再練 5 題</button>
      </div>
      <div id="dqInstall"></div>
    </div>`;
    el.querySelectorAll('[data-reward]').forEach(button => {
      button.onclick = () => claimReward(button.dataset.reward, el, words);
    });
    el.querySelector('#dqExtra').onclick = () => {
      const extra = words.filter(word => VDStore.isWrong(word.word) || VDStore.isDue(word.word)).slice(0, 5);
      VDQuiz.startWith((extra.length ? extra : words.slice(0, 5)), el, words);
    };
    if (window.VDInstall) VDInstall.afterDailyComplete(el.querySelector('#dqInstall'));
  }

  function renderQuestion(el, words) {
    const state = load(words);
    if (state.completedAt) { renderDone(el, words); return; }
    const index = state.answers.findIndex(answer => answer === null);
    if (index < 0) {
      const result = complete();
      if (result.newlyCompleted) {
        VDGame.onQuizDone(state.answers.filter(Boolean).length);
        if (window.VDPush) { VDPush.track('daily_complete'); VDPush.markDone(); }
      }
      renderDone(el, words);
      return;
    }
    const target = words.find(word => word.word === state.plan[index].word);
    if (!target) { el.innerHTML = '<div class="card-done"><p>今日題組需要更新，請回首頁再試一次。</p></div>'; return; }
    const question = VDQuiz.questionFor(target, words);
    const startedAt = performance.now();
    const prompt = VDGame.esc(question.prompt);
    const sub = VDGame.esc(question.sub || '');
    const options = question.options || [];
    el.innerHTML = `<div class="dq-session">
      <div class="dq-session-head"><span>今日 10 題</span><b>${index + 1}/${state.plan.length}</b></div>
      ${progressHtml(state)}
      <div class="quiz-prompt">${prompt}${question.type !== 'z2e' ? VDSpeak.btn(question.word) : ''}</div>
      <div class="quiz-sub">${sub}</div>
      ${question.type === 'spell' ? `<div class="spell-row"><input id="dqSpell" class="spell-in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="輸入英文答案"><button class="btn" id="dqSubmit">送出</button></div><button class="btn ghost" id="dqSkip">我還不會，看答案</button>` : `<div class="quiz-opts">${options.map((option, optionIndex) => `<button class="btn opt" data-value="${encodeURIComponent(option)}"><span class="opt-key">${'ABCD'[optionIndex]}</span><span class="opt-text">${VDGame.esc(option)}</span></button>`).join('')}</div>`}
      <div id="dqFeedback" aria-live="polite"></div>
    </div>`;
    let locked = false;
    const answer = correct => {
      if (locked) return;
      locked = true;
      const result = VDStore.record(question.word, correct, undefined, { qtype: question.type, ms: performance.now() - startedAt });
      VDGame.onAnswer(correct, question.type === 'spell' ? 'spell' : 'quiz', 0, { graduated: !!result.graduated });
      record(index, correct);
      const step = el.querySelectorAll('.dq-steps span')[index];
      if (step) {
        step.classList.add(correct ? 'ok' : 'review');
        step.setAttribute('aria-label', `第 ${index + 1} 題${correct ? '完成' : '待復習'}`);
      }
      const progress = el.querySelector('.dq-steps');
      if (progress) progress.setAttribute('aria-valuenow', String(index + 1));
      el.querySelectorAll('button, input').forEach(control => { control.disabled = true; });
      const meaning = question.meaning;
      el.querySelector('#dqFeedback').innerHTML = `<div class="ex-fb ${correct ? 'ok' : 'no'}">
        <div class="ex-verdict">${correct ? '✅ 記住了' : `🌱 這個字會回到復習隊列，正解是 ${VDGame.esc(question.ans)}`}</div>
        <div class="qz-word">${VDGame.esc(question.word)} ${VDSpeak.btn(question.word)}</div>
        <div class="qz-zh">${VDGame.esc(meaning.zh)}</div>
        <div class="qz-ex">${VDGame.esc(meaning.example)}<br><span class="ex-zh">${VDGame.esc(meaning.example_zh)}</span></div>
      </div><button class="btn qz-next" id="dqNext">下一題 →</button>`;
      el.querySelector('#dqNext').disabled = false;
      el.querySelector('#dqNext').onclick = () => renderQuestion(el, words);
    };
    if (question.type === 'spell') {
      const input = el.querySelector('#dqSpell');
      const submit = () => {
        const value = input.value.trim().toLowerCase();
        if (value) answer([question.ans, ...(question.variants || [])].some(item => item.toLowerCase() === value));
      };
      el.querySelector('#dqSubmit').onclick = submit;
      el.querySelector('#dqSkip').onclick = () => answer(false);
      input.onkeydown = event => { if (event.key === 'Enter') submit(); };
      input.focus();
    } else {
      el.querySelectorAll('[data-value]').forEach(button => {
        button.onclick = () => answer(decodeURIComponent(button.dataset.value) === question.ans);
      });
    }
  }

  function start(words, el) {
    load(words);
    if (window.VDPush) VDPush.track('daily_start');
    renderQuestion(el, words);
  }

  return { TOTAL, buildPlan, load, current, record, complete, weekInfo, homeCard, start, claimReward, refreshTogether };
})();

window.VDDailyQuest = VDDailyQuest;
