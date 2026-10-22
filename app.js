/* ===========================================================
   学习副本 · Study Dungeon
   零依赖 · 纯前端 · 数据存在浏览器 localStorage
   -----------------------------------------------------------
   想改任务 / 奖励 / 商店价格？全部在下面 CONFIG 里，改完刷新即可。
   =========================================================== */
(function () {
  'use strict';

  /* =========================================================
     一、配置区（最常改的就是这里）
     ========================================================= */

  const CONFIG = {
    // 每天几点算「换日」。凌晨 4 点，熬夜学习不会断签。
    studyDayStartHour: 4,

    // 每天抽几个日常
    dailyCount: 3,

    /* ── 任务等级 ───────────────────────────────────────────
       任务的 XP / 金币不再手填，由等级决定。定价逻辑：
         · 低门槛高频为主：low 每单位时间的经验最高，
           这样 5 分钟也能开始，不会被"今天没时间"劝退。
         · 越往上绝对值越大，而且金币占比更高（0.40 → 0.53），
           因为金币能换真东西——硬仗值得打。
         · 日常池 6 个任务平均 34 XP / 15 币，一天 3 个 ≈ 100 XP / 46 币；
           一杯奶茶 250 币 ≈ 攒 5 天，升到满级约 5 周。
           改等级数值等于改整个经济，改之前先按这条算一遍。
       ──────────────────────────────────────────────────── */
    grades: {
      low:     { label: 'low',      name: '小试', xp: 10,  coins: 4 },   // ≈ 5 分钟
      high:    { label: 'high',     name: '推进', xp: 28,  coins: 12 },  // ≈ 20 分钟
      max:     { label: 'max',      name: '硬仗', xp: 65,  coins: 30 },  // ≈ 45 分钟
      astra:   { label: 'astra',    name: '突破', xp: 150, coins: 75 },  // ≈ 2 小时
      genshin: { label: '原神牛逼', name: '传说', xp: 380, coins: 200 }, // 里程碑
    },
    gradeOrder: ['low', 'high', 'max', 'astra', 'genshin'],

    // 预置任务池：每天从里面抽 dailyCount 条。
    // 在界面里保存过「以后每天也用这套」之后，会改用你自己那套（customDaily），这里就不再参与。
    daily: [
      { id: 'review',   title: '复习昨天的笔记 / 卡片',           minutes: 5,  grade: 'low',  quick: true },
      { id: 'question', title: '把今天没懂的地方列成问题清单',       minutes: 5,  grade: 'low',  quick: true },
      { id: 'drill',    title: '做 5 道题 / 过 10 张卡片',         minutes: 12, grade: 'high' },
      { id: 'read',     title: '精读一个小节，不许跳读',           minutes: 20, grade: 'high' },
      { id: 'pomodoro', title: '无干扰专注 25 分钟（手机放远）',     minutes: 25, grade: 'max' },
      { id: 'feynman',  title: '用自己的话讲清一个概念并写下来',     minutes: 15, grade: 'max' },
    ],

    // 周常：kind = count（完成几个日常）| minutes（累计专注分钟）
    // freeze 是开的宝箱里额外给的冻结卡，跟日常的 XP+金币 拉开区别
    weekly: [
      { id: 'w-count', title: '本周完成 10 个日常任务', kind: 'count',   target: 10,  xp: 150, coins: 70, freeze: 1 },
      { id: 'w-focus', title: '本周累计专注 150 分钟',   kind: 'minutes', target: 150, xp: 180, coins: 80 },
    ],

    // 等级表：xp 是「进入该等级所需的累计经验」，title 是称号
    levels: [
      { xp: 0,    title: '新手村民' },
      { xp: 100,  title: '见习冒险者' },
      { xp: 260,  title: '熟练学徒' },
      { xp: 480,  title: '手艺工' },
      { xp: 760,  title: '老练行者' },
      { xp: 1120, title: '副本常客' },
      { xp: 1560, title: '精英' },
      { xp: 2100, title: '大宗师' },
      { xp: 2760, title: '传说' },
      { xp: 3560, title: '通缉令本人' },
    ],

    // 商店：换成你真想要的东西，价格按「几天能攒到」自己定。
    // effect: 'freeze' 表示买的是冻结卡，不记录兑换历史。
    shop: [
      { id: 'slack',      name: '摸鱼 30 分钟',              cost: 60,   emoji: '🛋' },
      { id: 'episode',    name: '安心看一集番',              cost: 150,  emoji: '📺' },
      { id: 'milk-tea',   name: '一杯奶茶 / 咖啡',           cost: 250,  emoji: '🥤' },
      { id: 'game-hour',  name: '打一小时游戏（无罪恶感）',   cost: 400,  emoji: '🎮' },
      { id: 'lazy-night', name: '一整个摆烂的晚上',           cost: 700,  emoji: '🌙' },
      { id: 'book',       name: '买一本想要的书',             cost: 1500, emoji: '📚' },
      { id: 'freeze',     name: '连胜冻结卡 ×1',             cost: 200,  emoji: '❄️', effect: 'freeze' },
    ],

    // 断签时有没有保命机制：初始送几张冻结卡
    freezesAtStart: 2,

    // 热力图的星期起点（1 = 周一）
    weekStartsOn: 1,
  };

  // 演示模式用的样例任务池（默认池是空的，不能让 demo 也空着）
  const DEMO_POOL = [
    { id: 'd-review', title: '复习昨天的笔记 / 卡片', minutes: 5, grade: 'low', quick: true },
    { id: 'd-question', title: '把今天没懂的地方列成问题清单', minutes: 5, grade: 'low', quick: true },
    { id: 'd-drill', title: '做 5 道题 / 过 10 张卡片', minutes: 12, grade: 'high' },
    { id: 'd-read', title: '精读一个小节，不许跳读', minutes: 20, grade: 'high' },
    { id: 'd-pomodoro', title: '无干扰专注 25 分钟（手机放远）', minutes: 25, grade: 'max' },
  ];

  /* =========================================================
     二、小工具
     ========================================================= */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));
  const DAY_MS = 86400000;

  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  function esc(str) {
    return String(str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function keyOf(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // 用中午 12 点构造，避开夏令时/时区把日期推歪
  function dateOf(key) {
    const p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0);
  }

  function addDays(key, n) {
    const d = dateOf(key);
    d.setDate(d.getDate() + n);
    return keyOf(d);
  }

  // 「学习日」：凌晨 4 点之前算前一天
  function todayKey() {
    const now = new Date();
    if (now.getHours() < CONFIG.studyDayStartHour) now.setDate(now.getDate() - 1);
    return keyOf(now);
  }

  function weekStartKey(key) {
    const d = dateOf(key);
    const dow = d.getDay();                    // 0=周日
    const shift = ((dow - CONFIG.weekStartsOn) + 7) % 7;
    return addDays(key, -shift);
  }

  function fmtMin(m) {
    m = Math.max(0, Math.round(m || 0));
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' 小时' + (r ? ' ' + r + ' 分' : '');
  }

  function fmtClock(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(t / 60), s = t % 60;
    return pad2(m) + ':' + pad2(s);
  }

  function shortDate(key) {
    return (key || '').slice(5).replace('-', '/');
  }

  const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* =========================================================
     三、状态
     ========================================================= */

  const DEMO = /[?&]demo=1/.test(location.search);
  // 存档版本：换 key 等于开新档（旧档还留在 localStorage 里，随时能捞回来）
  const KEY = DEMO ? 'study.dungeon.demo.v2' : 'study.dungeon.v2';

  function emptyState() {
    return {
      v: 1,
      player: { xp: 0, coins: 0, streak: 0, best: 0, freezes: CONFIG.freezesAtStart, lastDay: null, frozen: [] },
      customDaily: [],     // 自己定的每日任务；非空时每天直接用这套，不随机抽
      shop: [],            // 自定义商品；空则用 CONFIG.shop
      ai: { base: '', model: '', key: '' },  // OpenAI 兼容接口，留空走本地规则
      days: {},            // 'YYYY-MM-DD' -> { quests: {id: {minutes, note, at}}, running: {id: startMs}, list? }
      claims: {},          // 'weekStart|weeklyId' -> 领取时间戳
      redemptions: [],     // { id, name, emoji, cost, at, usedAt }
      settings: { sound: true, boot: true },
      createdAt: Date.now(),
    };
  }

  function migrate(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    const s = Object.assign(base, raw);
    s.player = Object.assign(base.player, raw.player || {});
    s.player.xp = Math.max(0, Math.round(Number(s.player.xp) || 0));
    s.player.coins = Math.max(0, Math.round(Number(s.player.coins) || 0));
    s.player.streak = Math.max(0, Math.round(Number(s.player.streak) || 0));
    s.player.best = Math.max(0, Math.round(Number(s.player.best) || 0));
    s.player.freezes = Math.max(0, Math.round(Number(s.player.freezes) || 0));
    if (!Array.isArray(s.player.frozen)) s.player.frozen = [];
    s.days = raw.days && typeof raw.days === 'object' ? raw.days : {};
    s.customDaily = Array.isArray(raw.customDaily) ? raw.customDaily : [];
    s.shop = Array.isArray(raw.shop) ? raw.shop : [];
    s.ai = Object.assign({ base: '', model: '', key: '' }, raw.ai || {});
    s.claims = raw.claims && typeof raw.claims === 'object' ? raw.claims : {};
    s.redemptions = Array.isArray(raw.redemptions) ? raw.redemptions : [];
    s.settings = Object.assign(base.settings, raw.settings || {});
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* 忽略损坏的存档 */ }
    const s = emptyState();
    if (DEMO) {
      try { seedDemo(s); } catch (e) { /* 演示数据生成失败就用空档，别把整个应用拖死 */ }
    }
    return s;
  }

  // ── 云同步状态（声明必须早于 loadSync() 调用，否则 TDZ 会把整个脚本打死）──
  const SYNC_KEY = 'study.dungeon.sync.v1';
  let sync = { on: false, base: '', token: '', rev: 0, at: 0, dirty: false };
  let syncTimer = null;
  let syncing = false;
  let pendingRemote = null;

  let S = load();
  loadSync();

  // ── 云同步（配置单独存，不混进存档）. 服务端见 sync/server.py
  function loadSync() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      if (raw) sync = Object.assign(sync, JSON.parse(raw));
    } catch (e) { /* 忽略 */ }
    if (!sync.base && /^https?:$/.test(location.protocol) && location.pathname.indexOf('/study') === 0) {
      sync.base = location.origin + '/study/api';
    }
    // 演示模式的存档是假的，绝不能推到真服务器上去
    if (DEMO) sync.on = false;
  }

  function saveSync() {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* 忽略 */ }
    updateSyncUI();
  }

  function saveLocalOnly() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      toast('存档写入失败，可能是浏览器存储被禁用了', 'blue');
    }
  }

  function save() {
    saveLocalOnly();
    markDirty();
    schedulePush();
  }

  // 本地有没传上去的改动。拉取/覆盖前必须先问，否则离线做的东西会被服务器版本盖掉
  function markDirty() {
    if (!sync.on || !sync.base || !sync.token) return;
    if (sync.dirty) return;
    sync.dirty = true;
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* 忽略 */ }
  }

  function clearDirty() {
    if (!sync.dirty) return;
    sync.dirty = false;
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (e) { /* 忽略 */ }
  }

  function hasAnyData() {
    return Object.keys(S.days || {}).length > 0 || S.player.xp > 0 || S.player.coins > 0;
  }

  function schedulePush() {
    if (!sync.on || !sync.base || !sync.token || syncing) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      syncPush(true).catch(function () { /* 离线就算了 */ });
    }, 800);
  }

  function syncHeaders(json) {
    const h = { 'X-Study-Token': sync.token };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  // 推送前剥掉 API Key：key 只留在设备上，不进服务器、也不跟着同步走
  function syncPayload() {
    let payload;
    try { payload = JSON.parse(JSON.stringify(S)); } catch (e) { payload = S; }
    if (payload && payload.ai) payload.ai.key = '';
    return payload;
  }

  function adoptRemote(remote) {
    const keepKey = (S.ai && S.ai.key) || '';
    S = migrate(remote.data);
    if (S.ai && keepKey) S.ai.key = keepKey;  // 服务器上没存 key，别把本机的冲掉
    sync.rev = Number(remote.rev) || 0;
    sync.at = Number(remote.updatedAt) || Date.now();
    sync.dirty = false;
    saveSync();
    saveLocalOnly();
    renderAll();
  }

  // 两边都有新东西：不替用户做决定，弹个面板让他选
  function openSyncConflict(remote) {
    pendingRemote = remote;
    const box = $('#sync-cmp');
    if (box) {
      const d = new Date(Number(remote.updatedAt) || Date.now());
      box.innerHTML =
        '<span>本机　rev ' + (Number(sync.rev) || 0) + (sync.dirty ? ' · 有改动还没传' : '') + '</span>' +
        '<span>服务器　rev ' + (Number(remote.rev) || 0) + ' · ' +
        (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + '</span>';
    }
    openModal('#modal-sync');
  }

  async function syncPull(silent) {
    if (!sync.on || !sync.base || !sync.token) return false;
    const res = await fetch(sync.base + '/state', { headers: syncHeaders(false), cache: 'no-store' });
    if (res.status === 401) { toast('同步口令不对', 'blue'); return false; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const remote = await res.json();
    if (!remote || !remote.data) {
      if (!silent) toast('服务器上还没有进度', 'blue');
      return false;
    }
    if (Number(remote.rev) > Number(sync.rev || 0)) {
      if (sync.dirty) { openSyncConflict(remote); return false; }
      adoptRemote(remote);
      if (!silent) toast('已拉取服务器进度', 'gold');
      return true;
    }
    if (!silent) toast('已经是最新的了');
    return false;
  }

  async function syncPush(silent, force) {
    if (!sync.on || !sync.base || !sync.token) return false;
    syncing = true;
    try {
      const res = await fetch(sync.base + '/state', {
        method: 'PUT',
        headers: syncHeaders(true),
        body: JSON.stringify({ rev: Number(sync.rev) || 0, data: syncPayload(), force: !!force }),
      });
      if (res.status === 401) { toast('同步口令不对', 'blue'); return false; }
      if (res.status === 409) {
        const cur = await res.json();
        if (!silent) {
          // 手动上传：问一句要不要覆盖
          if (cur && cur.data && confirm('服务器上已有别的设备的进度（rev ' + cur.rev + '）。\n\n用本机这份覆盖它？')) {
            return await syncPush(false, true);
          }
          return false;
        }
        // 自动同步撞冲突：绝不静默覆盖，弹面板让人选
        if (cur && cur.data) openSyncConflict(cur);
        return false;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ok = await res.json();
      sync.rev = Number(ok.rev) || 0;
      sync.at = Number(ok.updatedAt) || Date.now();
      sync.dirty = false;
      saveSync();
      if (!silent) toast('已上传到服务器', 'gold');
      return true;
    } finally {
      syncing = false;
      updateSyncUI();
    }
  }

  async function syncBoot(first) {
    if (!sync.on || !sync.base || !sync.token) return;
    try {
      const res = await fetch(sync.base + '/state', { headers: syncHeaders(false), cache: 'no-store' });
      if (!res.ok) return;
      const remote = await res.json();

      if (remote && remote.data && Number(remote.rev) > Number(sync.rev || 0)) {
        // 本机有没上传的改动（比如离线做的），或者刚开同步两边都有数据：不替用户决定
        if (sync.dirty || (first && hasAnyData() && !sync.rev)) {
          openSyncConflict(remote);
          return;
        }
        adoptRemote(remote);
        toast('已从服务器同步进度', 'gold');
        return;
      }

      // 服务器是空的（或者本机从没同步过）：把本机推上去
      if (!remote || !remote.data) {
        if (hasAnyData()) await syncPush(true);
        return;
      }
      if (!sync.rev) adoptRemote(remote);
    } catch (e) { /* 离线就静默 */ }
  }

  function updateSyncUI() {
    const sw = $('#sw-sync');
    if (sw) sw.setAttribute('aria-checked', sync.on ? 'true' : 'false');
    const b = $('#sync-base');
    const t = $('#sync-token');
    if (b) b.value = sync.base || '';
    if (t) t.value = sync.token || '';

    const st = $('#sync-status');
    if (!st) return;
    if (!sync.on) { st.textContent = '未开启'; return; }
    if (!sync.base || !sync.token) { st.textContent = '填好地址和口令'; return; }
    if (sync.dirty) { st.textContent = '有改动还没传上去'; return; }
    if (!sync.at) { st.textContent = '还没同步过'; return; }
    const d = new Date(sync.at);
    st.textContent = '已同步 · ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' · rev ' + sync.rev;
  }

  // 只刷新状态文字：输入框里打字时不能整体回填，否则光标会跳
  function updateSyncStatusOnly() {
    const st = $('#sync-status');
    if (!st) return;
    if (!sync.on) { st.textContent = '未开启'; return; }
    if (!sync.base || !sync.token) { st.textContent = '填好地址和口令'; return; }
    if (sync.dirty) { st.textContent = '有改动还没传上去'; return; }
    if (!sync.at) { st.textContent = '还没同步过'; return; }
    const d = new Date(sync.at);
    st.textContent = '已同步 · ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' · rev ' + sync.rev;
  }


  /* =========================================================
     四、游戏规则
     ========================================================= */

  // 标题反查（自定义任务的 id 也能查到）
  function questTitle(id) {
    const q = CONFIG.daily.concat(CONFIG.weekly).filter((x) => x.id === id)[0];
    if (q) return q.title;
    for (const k in S.days) {
      const l = S.days[k].list;
      if (!l) continue;
      for (let i = 0; i < l.length; i++) if (l[i].id === id) return l[i].title;
    }
    return id;
  }

  function normalizeQuest(q) {
    return {
      id: q.id,
      title: String(q.title || ''),
      minutes: clamp(Number(q.minutes) || 10, 1, 300),
      grade: CONFIG.grades[q.grade] ? q.grade : 'high',
      quick: !!q.quick,
    };
  }

  // 从池子里按日期稳定抽几个（同一天刷新不会变）
  function pickQuests(pool, key) {
    if (!pool.length) return [];
    const n = Math.min(CONFIG.dailyCount, pool.length);
    const seed = Math.floor(dateOf(key).getTime() / DAY_MS) ^ 0x9e3779b9;
    const rnd = mulberry32(seed);

    const picks = [];
    const quicks = pool.filter((q) => q.quick);
    if (quicks.length) picks.push(quicks[Math.floor(rnd() * quicks.length)]);

    const rest = pool.filter((q) => picks.indexOf(q) === -1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
    }
    while (picks.length < n && rest.length) picks.push(rest.pop());

    for (let i = picks.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = picks[i]; picks[i] = picks[j]; picks[j] = t;
    }
    return picks.map(normalizeQuest);
  }

  function dailyQuests(key) {
    // 自己定过任务 → 每天就是这套，不随机；没定过 → 用 CONFIG.daily（默认是空的）
    if (S.customDaily && S.customDaily.length) return S.customDaily.map(normalizeQuest);
    return pickQuests(CONFIG.daily, key);
  }

  function ensureDay(key) {
    if (!S.days[key]) S.days[key] = { quests: {}, running: {} };
    const d = S.days[key];
    if (!d.quests) d.quests = {};
    if (!d.running) d.running = {};
    return d;
  }

  // 今日任务表：界面里编辑过就用编辑后的，否则按日期从池子里抽
  function todayQuests(key) {
    const d = S.days[key];
    if (d && Array.isArray(d.list) && d.list.length) return d.list;
    return dailyQuests(key);
  }

  // 商城：自己改过就用自己那套
  function shopItems() {
    return (S.shop && S.shop.length) ? S.shop : CONFIG.shop;
  }

  // 任务的等级：新任务直接看 q.grade，老存档（存过 xp/coins 的）按经验反推
  function gradeOf(q) {
    if (q && q.grade && CONFIG.grades[q.grade]) return q.grade;
    const xp = Number(q && q.xp) || 0;
    if (xp >= 400) return 'genshin';
    if (xp >= 150) return 'astra';
    if (xp >= 60) return 'max';
    if (xp >= 20) return 'high';
    return 'low';
  }

  // 等级 → 实际产出
  function rewardOf(q) {
    const g = CONFIG.grades[gradeOf(q)] || CONFIG.grades.low;
    return { xp: g.xp, coins: g.coins };
  }

  function gradeChip(grade) {
    const key = CONFIG.grades[grade] ? grade : 'low';
    return '<span class="grade g-' + key + '">' + esc(CONFIG.grades[key].label) + '</span>';
  }

  // 当前任务表里已经完成的个数（删掉的任务不计入分母）
  function listedDone(key) {
    const d = S.days[key];
    if (!d || !d.quests) return 0;
    return todayQuests(key).filter((q) => d.quests[q.id]).length;
  }

  function doneCount(key) {
    const d = S.days[key];
    return d && d.quests ? Object.keys(d.quests).length : 0;
  }

  function dayMinutes(key) {
    const d = S.days[key];
    if (!d || !d.quests) return 0;
    let m = 0;
    for (const id in d.quests) m += d.quests[id].minutes || 0;
    return m;
  }

  function levelInfo(xp) {
    const L = CONFIG.levels;
    let i = 0;
    while (i + 1 < L.length && xp >= L[i + 1].xp) i++;
    const cur = L[i], next = L[i + 1];
    const got = xp - cur.xp;
    const need = next ? next.xp - cur.xp : 0;
    return {
      lv: i + 1,
      title: cur.title,
      tier: Math.min(5, Math.floor(i / 2) + 1),
      got: got,
      need: need,
      pct: next ? clamp((got / need) * 100, 0, 100) : 100,
      isMax: !next,
    };
  }

  /**
   * 连胜结算：把「完成日」到「今天」之间漏掉的日子补上。
   * 有冻结卡就扣一张并记为补签，没有就断连胜。
   * 幂等：已补签的日期记录在 frozen 里，不会重复扣卡。
   */
  function reconcileStreak() {
    const p = S.player;
    const today = todayKey();
    if (!p.lastDay) return [];
    if (p.lastDay === today) return [];

    const used = [];
    let cursor = p.lastDay;
    while (true) {
      const next = addDays(cursor, 1);
      if (next >= today) break;             // 今天还没过完，不算断
      if (p.frozen.indexOf(next) !== -1) { cursor = next; continue; }
      if (p.freezes > 0) {
        p.freezes--;
        p.frozen.push(next);
        used.push(next);
        cursor = next;
        continue;
      }
      p.streak = 0;
      p.lastDay = null;
      break;
    }
    return used;
  }

  function completeQuest(q, minutes, note) {
    const key = todayKey();
    const day = ensureDay(key);
    if (day.quests[q.id]) return false;

    day.quests[q.id] = { minutes: minutes, note: note, at: Date.now() };
    delete day.running[q.id];

    const p = S.player;
    const r = rewardOf(q);
    p.xp += r.xp;
    p.coins += r.coins;

    if (p.lastDay !== key) {
      p.streak = p.lastDay ? p.streak + 1 : 1;
      p.lastDay = key;
    }
    if (p.streak > p.best) p.best = p.streak;
    return true;
  }

  function weeklyStat(w, weekStart) {
    let count = 0, minutes = 0;
    for (let i = 0; i < 7; i++) {
      const k = addDays(weekStart, i);
      const d = S.days[k];
      if (!d || !d.quests) continue;
      for (const id in d.quests) {
        count++;
        minutes += d.quests[id].minutes || 0;
      }
    }
    const raw = w.kind === 'count' ? count : minutes;
    return { count: count, minutes: minutes, raw: raw, value: Math.min(raw, w.target) };
  }

  function readyWeeklies() {
    const wk = weekStartKey(todayKey());
    return CONFIG.weekly.filter((w) => {
      if (S.claims[wk + '|' + w.id]) return false;
      return weeklyStat(w, wk).raw >= w.target;
    }).map((w) => w.id);
  }

  /* =========================================================
     五、渲染
     ========================================================= */

  function renderAll() {
    editing = false;
    editList = [];
    renderMeta();
    renderHud();
    renderDaily();
    renderWeekly();
    renderHeatmap();
    renderHeatStats();
    renderShop();
    renderNotes();
    tickTimers();
  }

  function applyGrid() {
    document.body.classList.toggle('no-grid', S.settings.grid === false);
  }

  // 环境光随时段变：凌晨偏暖、白天偏冷、傍晚偏红、深夜偏紫
  function applyPhase() {    const h = new Date().getHours();
    let phase = 'night';
    if (h >= 4 && h < 9) phase = 'dawn';
    else if (h >= 9 && h < 17) phase = 'day';
    else if (h >= 17 && h < 21) phase = 'dusk';
    if (document.body.getAttribute('data-phase') !== phase) {
      document.body.setAttribute('data-phase', phase);
    }
  }

  function renderMeta() {
    applyPhase();
    const t = todayKey();
    const d = dateOf(t);
    const label = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + WEEK_CN[d.getDay()];

    // 第几天：从最早有记录的那天算起，给一点「我坚持了多久」的所有权感
    const keys = Object.keys(S.days || {}).sort();
    const first = keys[0];
    let dayN = 1;
    if (first) {
      dayN = Math.max(1, Math.round((dateOf(t) - dateOf(first)) / 86400000) + 1);
    }

    const parts = [label, '第 ' + dayN + ' 天'];
    if (DEMO) parts.push('演示模式');
    $('#today-label').textContent = parts.join(' · ');
  }

  function setText(sel, val) {
    const el = $(sel);
    if (el) el.textContent = val;
  }

  function renderHud() {
    const p = S.player;
    const info = levelInfo(p.xp);

    setText('#lv-num', info.lv);
    const titleEl = $('#lv-title');
    if (titleEl) {
      titleEl.textContent = info.title;
      titleEl.className = 'lv-title tier-' + info.tier;
    }
    const fill = $('#xp-fill');
    if (fill) fill.style.width = info.pct.toFixed(1) + '%';
    setText('#xp-text', info.isMax ? 'MAX · ' + p.xp + ' XP' : info.got + ' / ' + info.need + ' XP');

    setText('#stat-coins', p.coins);
    setText('#stat-freeze', p.freezes);
    setText('#streak-num', p.streak);

    const box = $('#streak-box');
    if (box) {
      box.classList.toggle('hot', p.streak > 0);
      box.title = '当前连胜 ' + p.streak + ' 天 · 最高 ' + p.best + ' 天';
    }

    renderTodayStrip();
    updateCountdown();
  }

  // 今日进度：一排小点 + 一句话。比原来的「2/3」方框更能一眼看出还剩几个
  function renderTodayStrip() {
    const key = todayKey();
    const day = S.days[key] || {};
    const qs = todayQuests(key);
    const done = listedDone(key);

    const pips = $('#daily-pips');
    if (pips) {
      pips.innerHTML = qs.map(function (q) {
        const hit = (day.quests || {})[q.id];
        return '<i class="' + (hit ? 'on' : '') + '"></i>';
      }).join('');
    }

    let text;
    if (!qs.length) text = '还没有任务';
    else if (done >= qs.length) text = '今日通关 ✓';
    else if (done > 0) text = '还差 ' + (qs.length - done) + ' 个 · 连胜已保住';
    else text = '完成 1 个就保连胜';
    setText('#today-hint', text);

    // 背景进度光：亮度 = 今日完成比例（任意任务数都适用）
    // 开根号压一下，让「开始做」比「收尾」更亮一点，否则 6 个任务时每完成一个几乎看不出来
    const ratio = qs.length ? Math.pow(done / qs.length, 0.72) : 0;
    document.documentElement.style.setProperty('--done', ratio.toFixed(3));
  }

  // 距下一个「凌晨 4 点」还有多久
  function updateCountdown() {
    const el = $('#reset-count');
    if (!el) return;
    const now = new Date();
    const next = new Date(now);
    next.setHours(CONFIG.studyDayStartHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    let s = Math.max(0, Math.floor((next - now) / 1000));
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    el.textContent = pad2(h) + ':' + pad2(m) + ':' + pad2(sec);

    const box = $('#reset-box');
    if (box) box.classList.toggle('warn', h < 1);
  }

  function renderDaily() {
    const key = todayKey();
    const day = S.days[key] || { quests: {}, running: {} };
    const quests = todayQuests(key);
    const list = $('#daily-list');

    const btnEdit = $('#btn-edit-daily');
    const bar = $('#daily-edit-bar');
    if (btnEdit) btnEdit.hidden = editing;
    if (bar) bar.hidden = !editing;

    // 今天这套值多少：个数 · 预计时长 · 预计 XP
    const totalEl = $('#daily-total');
    if (totalEl) {
      if (editing || !quests.length) {
        totalEl.textContent = '';
      } else {
        let mins = 0;
        let xp = 0;
        quests.forEach(function (q) { mins += q.minutes; xp += rewardOf(q).xp; });
        totalEl.textContent = quests.length + ' 个 · ≈' + mins + ' 分钟 · +' + xp + ' XP';
      }
    }

    // ── 编辑态 ──
    if (editing) {
      const bonusEl = $('#edit-bonus-hint');
      if (bonusEl) {
        const claimed = S.days[key] && S.days[key].editBonus;
        const g = CONFIG.grades.high;
        bonusEl.textContent = claimed ? '' : '今天还没编辑过 · 保存 +' + g.xp + ' XP · +' + g.coins + ' 币';
      }

      list.innerHTML = editList.map(function (q, i) {
        const done = (day.quests || {})[q.id];
        const grade = gradeOf(q);
        const r = CONFIG.grades[grade] || CONFIG.grades.low;

        const chips = CONFIG.gradeOrder.map(function (g) {
          const meta = CONFIG.grades[g];
          return '<button class="g-chip g-' + g + (g === grade ? ' is-on' : '') + '" type="button"' +
            ' data-grade="' + g + '" data-grow="' + i + '">' + esc(meta.label) + '</button>';
        }).join('');

        return '<li class="quest-edit g-' + grade + '">' +
          '<input class="qe-title" type="text" maxlength="48" value="' + esc(q.title) + '" placeholder="任务内容，按产出写，别写「学 2 小时」">' +
          '<div class="g-pick">' + chips + '</div>' +
          '<div class="qe-row">' +
            '<label class="qe-min">分钟<input type="number" min="1" max="300" value="' + q.minutes + '"></label>' +
            '<span class="ge-reward" id="ge-reward-' + i + '">+' + r.xp + ' XP · +' + r.coins + ' 币</span>' +
            (done
              ? '<span class="qe-done">已完成</span>'
              : '<button class="qe-del" type="button" data-daily-del="' + i + '" title="删除这个任务">×</button>') +
          '</div>' +
        '</li>';
      }).join('');
      return;
    }

    // ── 空任务表：先把人请进编辑器 ──
    if (!quests.length) {
      list.innerHTML = '<li class="quest-empty">' +
        '<b>今天还没有任务</b>' +
        '<span>先写一条。建议从 5 分钟能做完的开始——先让它跑起来，再谈强度。</span>' +
        '<button class="btn primary" type="button" data-open-edit>写第一条任务</button>' +
      '</li>';
      return;
    }

    // ── 正常态 ──
    const nDone = listedDone(key);
    let clearHtml = '';
    if (quests.length && nDone >= quests.length) {
      let mins = 0;
      let xp = 0;
      quests.forEach(function (q) {
        const d = (day.quests || {})[q.id];
        if (!d) return;
        mins += d.minutes || 0;
        xp += rewardOf(q).xp;
      });
      clearHtml = '<li class="quest-clear">' +
        '<span class="qc-mark" aria-hidden="true">✓</span>' +
        '<span class="qc-main"><b>今日通关</b>' +
          '<em>' + quests.length + ' 个 · ' + fmtMin(mins) + ' · +' + xp + ' XP</em></span>' +
        '<span class="qc-next">明天 04:00 刷新</span>' +
      '</li>';
    }

    list.innerHTML = clearHtml + quests.map(function (q) {
      const done = (day.quests || {})[q.id];
      const startedAt = (day.running || {})[q.id];
      const grade = gradeOf(q);
      const cls = 'quest g-' + grade + (done ? ' is-done' : (startedAt ? ' is-running' : ''));
      const r = rewardOf(q);

      // 做完的收成一行（除非正在补笔记），列表会随一天推进慢慢变轻
      if (done && noting !== q.id) {
        return '<li class="' + cls + ' compact" data-qid="' + q.id + '">' +
          '<div class="tick">✓</div>' +
          '<div class="body">' +
            '<div class="qtitle">' + esc(q.title) + '</div>' +
            (done.note ? '<div class="done-note">' + esc(done.note) + '</div>' : '') +
          '</div>' +
          '<div class="actions">' +
            '<span class="timer">' + fmtMin(done.minutes) + '</span>' +
            (done.note ? '' : '<button class="note-add compact-add" type="button" data-note="' + q.id + '" title="记一句">＋记</button>') +
          '</div>' +
        '</li>';
      }

      let actions;
      if (done) {
        actions = '<span class="timer">' + fmtMin(done.minutes) + '</span>';
      } else if (startedAt) {
        actions =
          '<span class="timer" data-timer="' + startedAt + '">00:00</span>' +
          '<button class="btn ghost" type="button" data-stop="' + q.id + '">放弃</button>' +
          '<button class="btn primary" type="button" data-done="' + q.id + '">完成</button>';
      } else {
        actions =
          '<button class="btn ghost" type="button" data-start="' + q.id + '">计时</button>' +
          '<button class="btn primary" type="button" data-done="' + q.id + '">完成</button>';
      }

      let note = '';
      if (done) {
        if (noting === q.id) {
          note = '<input class="note-input" id="note-input" type="text" maxlength="120" value="' +
            esc(done.note || '') + '" placeholder="今天学了什么？卡在哪？（回车保存，空的也行）">';
        } else if (done.note) {
          note = '<div class="done-note">' + esc(done.note) + '</div>';
        }
      }

      return '<li class="' + cls + '" data-qid="' + q.id + '">' +
        '<div class="tick">' + (done ? '✓' : '·') + '</div>' +
        '<div class="body">' +
          '<div class="qtitle">' + esc(q.title) + '</div>' +
          '<div class="qmeta">' +
            '≈' + q.minutes + ' 分钟' +
            '<span class="sep">·</span>' + gradeChip(grade) +
            '<span class="sep">·</span><span class="xp">+' + r.xp + ' XP</span>' +
            '<span class="sep">·</span><span class="coin">+' + r.coins + ' 币</span>' +
            (q.quick ? '<span class="quick-tag">最小行动</span>' : '') +
          '</div>' +
          note +
        '</div>' +
        '<div class="actions">' + actions + '</div>' +
      '</li>';
    }).join('');
  }

  function weeklyRewardHtml(w) {
    const bits = ['<span class="xp">+' + w.xp + ' XP</span>', '<span class="coin">+' + w.coins + ' 币</span>'];
    if (w.freeze) bits.push('<span class="ice">❄ ' + w.freeze + '</span>');
    return bits.join(' · ');
  }

  function renderWeekly() {
    const wk = weekStartKey(todayKey());
    $('#week-range').textContent = shortDate(wk) + ' – ' + shortDate(addDays(wk, 6));

    let hasReady = false;

    $('#weekly-list').innerHTML = CONFIG.weekly.map((w) => {
      const st = weeklyStat(w, wk);
      const finished = st.raw >= w.target;
      const claimed = !!S.claims[wk + '|' + w.id];
      const pct = clamp((st.value / w.target) * 100, 0, 100);
      const unit = w.kind === 'count' ? ' 个' : ' 分钟';

      // 达成未领 = 一个宝箱。日常是「完成即结算」，周常留一个「领取」动作
      if (finished && !claimed) {
        hasReady = true;
        return '<li class="weekly finished">' +
          '<div class="weekly-top">' +
            '<span class="weekly-title">' + esc(w.title) + '</span>' +
            '<span class="weekly-reward">' + weeklyRewardHtml(w) + '</span>' +
          '</div>' +
          '<button class="chest" type="button" data-claim="' + w.id + '">' +
            '<span class="chest-icon" aria-hidden="true">🎁</span>' +
            '<span class="chest-main">' +
              '<b>周常达成</b>' +
              '<em>' + Math.min(st.raw, w.target) + ' / ' + w.target + unit + ' · 点开领取</em>' +
            '</span>' +
            '<span class="chest-open">开启</span>' +
          '</button>' +
        '</li>';
      }

      const tail = claimed
        ? '<span class="claimed-tag">已领取</span>'
        : '<span class="weekly-gap">差 ' + (w.target - st.raw) + unit + '</span>';

      return '<li class="weekly' + (claimed ? ' finished' : '') + '">' +
        '<div class="weekly-top">' +
          '<span class="weekly-title">' + esc(w.title) + '</span>' +
          '<span class="weekly-reward">' + weeklyRewardHtml(w) + '</span>' +
        '</div>' +
        '<div class="progress"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<div class="weekly-foot">' +
          '<span class="weekly-count">' + Math.min(st.raw, w.target) + ' / ' + w.target + unit + '</span>' +
          tail +
        '</div>' +
      '</li>';
    }).join('');

    const dot = $('#week-dot');
    if (dot) dot.hidden = !hasReady;
  }

  function renderHeatmap() {
    const today = todayKey();
    const lastWeek = weekStartKey(today);
    const firstWeek = addDays(lastWeek, -15 * 7);
    const cols = [];

    for (let w = 0; w < 16; w++) {
      const colStart = addDays(firstWeek, w * 7);
      let cells = '';
      for (let i = 0; i < 7; i++) {
        const k = addDays(colStart, i);
        if (k > today) { cells += '<i class="cell blank"></i>'; continue; }
        let cls = 'cell';
        if (S.player.frozen.indexOf(k) !== -1) {
          cls += ' ice';
        } else {
          const m = dayMinutes(k);
          if (m <= 0) cls += ' lv0';
          else if (m < 10) cls += ' lv1';
          else if (m < 25) cls += ' lv2';
          else if (m < 50) cls += ' lv3';
          else cls += ' lv4';
        }
        if (k === today) cls += ' today';
        const m = dayMinutes(k);
        const label = shortDate(k) + ' · ' + (m ? fmtMin(m) + ' · ' + doneCount(k) + ' 个任务' : '没有记录');
        cells += '<i class="' + cls + '" title="' + esc(label) + '"></i>';
      }
      cols.push('<div class="heat-col">' + cells + '</div>');
    }
    $('#heatmap').innerHTML = cols.join('');
  }

  function sumStats(pred) {
    let n = 0, m = 0;
    for (const k in S.days) {
      if (pred && !pred(k)) continue;
      const d = S.days[k];
      if (!d || !d.quests) continue;
      for (const id in d.quests) {
        n++;
        m += d.quests[id].minutes || 0;
      }
    }
    return { n: n, m: m };
  }

  function renderHeatStats() {
    const today = todayKey();
    const wk = weekStartKey(today);
    const month = today.slice(0, 7);
    const week = sumStats((k) => k >= wk && k <= today);
    const mo = sumStats((k) => k.slice(0, 7) === month);
    const all = sumStats();

    const row = (label, s) =>
      '<div><span class="hs-label">' + label + '</span><b>' + s.n + ' 个 · ' + fmtMin(s.m) + '</b></div>';

    $('#heat-stats').innerHTML = row('本周', week) + row('本月', mo) + row('累计', all);
  }

  function renderShop() {
    const p = S.player;
    const items = shopItems();
    const can = items.filter((it) => p.coins >= it.cost).length;

    setText('#shop-coins', p.coins);
    setText('#shop-coins-modal', p.coins);
    setText('#shop-summary', '共 ' + items.length + ' 件 · ' +
      (can ? can + ' 件买得起' : '都还买不起'));

    const list = $('#shop-list');
    if (list) {
      list.innerHTML = items.map((it) => {
        const ok = p.coins >= it.cost;
        return '<li class="shop-item' + (ok ? '' : ' is-locked') + '">' +
          '<span class="s-name">' + (it.emoji ? it.emoji + ' ' : '') + esc(it.name) + '</span>' +
          '<span class="s-right">' +
            '<span class="s-cost">' + it.cost + '</span>' +
            '<button class="s-buy" type="button" data-buy="' + it.id + '"' + (ok ? '' : ' disabled') + '>' +
              (ok ? '兑换' : '不够') +
            '</button>' +
          '</span>' +
        '</li>';
      }).join('');
    }

    updateBagBadge();
  }

  /* ── 仓库：兑换来的奖励先囤着，想用再点用掉 ── */

  function bagList() {
    return (S.redemptions || []).filter((r) => !r.usedAt);
  }

  function updateBagBadge() {
    const n = bagList().length;
    $$('.bag-count').forEach((el) => { el.textContent = n; });
  }

  function renderBag() {
    const unused = bagList();
    const used = (S.redemptions || []).filter((r) => r.usedAt).sort((a, b) => b.usedAt - a.usedAt);

    const sub = $('#bag-sub');
    if (sub) {
      sub.textContent = unused.length
        ? '存着 ' + unused.length + ' 件还没用。想用的时候再点——攒着不会过期。'
        : '仓库空着。去商店兑换点真东西，兑换后会先存在这里。';
    }

    const grouped = [];
    const map = {};
    unused.forEach((r) => {
      if (!map[r.id]) {
        map[r.id] = { id: r.id, name: r.name, emoji: r.emoji || '', cost: r.cost || 0, count: 0, lastAt: 0 };
        grouped.push(map[r.id]);
      }
      map[r.id].count++;
      map[r.id].lastAt = Math.max(map[r.id].lastAt, r.at || 0);
    });

    const box = $('#bag-list');
    if (box) {
      if (!grouped.length) {
        box.innerHTML = '<p class="bag-empty">这里会堆着你兑换的奖励：奶茶、番剧、一整个摆烂的晚上。<br>兑换之后先存着，想用的时候再来点「用掉」。</p>';
      } else {
        box.innerHTML = grouped.map((g) => {
          const d = g.lastAt ? new Date(g.lastAt) : null;
          const when = d ? (d.getMonth() + 1) + '/' + d.getDate() : '';
          const meta = g.count > 1 ? '×' + g.count + (when ? ' · 最近 ' + when : '') : (when ? when + ' 兑换' : '');
          return '<div class="bag-item">' +
            '<span class="bi-emoji">' + esc(g.emoji) + '</span>' +
            '<div class="bi-main">' +
              '<b>' + esc(g.name) + '</b>' +
              '<span>' + meta + '</span>' +
            '</div>' +
            '<button class="bi-use" type="button" data-use="' + g.id + '">用掉一个</button>' +
          '</div>';
        }).join('');
      }
    }

    const hist = $('#bag-done');
    if (hist) {
      if (!used.length) {
        hist.innerHTML = '';
      } else {
        hist.innerHTML = '<h4>已经享受过的</h4><ul>' +
          used.slice(0, 5).map((r) => {
            const d = new Date(r.usedAt);
            return '<li><span>' + esc(r.emoji ? r.emoji + ' ' + r.name : r.name) + '</span><span>' +
              (d.getMonth() + 1) + '/' + d.getDate() + '</span></li>';
          }).join('') +
        '</ul>';
      }
    }
  }

  function openBag() {
    const shop = $('#modal-shop');
    if (shop) shop.hidden = true;
    renderBag();
    openModal('#modal-bag');
  }

  function useReward(id) {
    const pick = (S.redemptions || [])
      .filter((r) => r.id === id && !r.usedAt)
      .sort((a, b) => (a.at || 0) - (b.at || 0))[0];
    if (!pick) return;
    pick.usedAt = Date.now();
    save();
    renderBag();
    updateBagBadge();
    ding();
    toast('用掉「' + pick.name + '」· 现在就去享受，别边用边学', 'gold');
  }

  let notesOpen = false;

  function toggleNotes() {
    notesOpen = !notesOpen;
    const list = $('#notes-list');
    const btn = $('#btn-notes');
    if (list) list.hidden = !notesOpen;
    if (btn) {
      btn.setAttribute('aria-expanded', notesOpen ? 'true' : 'false');
      btn.classList.toggle('open', notesOpen);
    }
  }

  function renderNotes() {
    const all = [];
    for (const k in S.days) {
      const d = S.days[k];
      if (!d || !d.quests) continue;
      for (const id in d.quests) {
        const rec = d.quests[id];
        if (rec && rec.note && rec.note.trim()) all.push({ key: k, note: rec.note, at: rec.at || dateOf(k).getTime() });
      }
    }
    all.sort((a, b) => b.at - a.at);

    setText('#notes-count', all.length ? all.length + ' 条' : '还没有');

    const list = $('#notes-list');
    if (list) list.hidden = !notesOpen;

    if (!all.length) {
      list.innerHTML = '<li class="empty">还没有笔记。不想写就别写，不影响任何奖励。</li>';
      return;
    }
    list.innerHTML = all.slice(0, 12).map((n) =>
      '<li><div class="n-text">' + esc(n.note) + '</div>' +
      '<div class="n-meta">' + shortDate(n.key) + '</div></li>'
    ).join('');
  }

  /* =========================================================
     六、交互
     ========================================================= */

  let editing = false;     // 今日任务编辑态
  let editList = [];       // 编辑中的草稿
  let noting = null;       // 正在补笔记的任务 id

  function toast(msg, kind) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  let audioCtx = null;
  function ding(up) {
    if (!S.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const base = up ? [784, 1175, 1568] : [880, 1320];
      base.forEach((f, i) => {
        const t0 = audioCtx.currentTime + i * 0.065;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.09, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.34);
      });
    } catch (e) { /* 静默失败 */ }
  }

  function openModal(sel) {
    const m = $(sel);
    if (!m) return;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal(m) {
    if (!m) return;
    if (m.id === 'modal-ai') stopVoice();
    m.hidden = true;
    if (!$$('.modal').some((x) => !x.hidden)) document.body.style.overflow = '';
  }

  /* ── 完成任务：立刻结算，奖励飞向 HUD ── */

  function completeInstant(qid, btnEl) {
    const key = todayKey();
    const day = S.days[key];
    if (day && day.quests && day.quests[qid]) return;

    const list = todayQuests(key);
    const q = list.filter((x) => x.id === qid)[0];
    if (!q) return;
    const r = rewardOf(q);

    const rowEl = btnEl ? btnEl.closest('.quest') : null;
    const rowRect = rowEl ? rowEl.getBoundingClientRect() : null;
    const fromRect = btnEl ? btnEl.getBoundingClientRect() : rowRect;

    const startedAt = day && day.running ? day.running[qid] : null;
    let minutes = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : (q.minutes || 1);
    minutes = clamp(minutes, 1, 600);

    const coinsBefore = S.player.coins;
    const lvBefore = levelInfo(S.player.xp).lv;
    const readyBefore = readyWeeklies().join(',');
    const usedFreezes = reconcileStreak();
    const doneBefore = listedDone(key);
    const total = list.length;

    if (!completeQuest(q, minutes, '')) return;
    save();

    // 立刻：这一行变已完成，周常 / 热力图同时动起来
    renderDaily();
    renderWeekly();
    renderHeatmap();
    renderHeatStats();
    renderTodayStrip();

    const newRow = document.querySelector('#daily-list [data-qid="' + qid + '"]');
    if (newRow) {
      newRow.classList.add('just-done');
      setTimeout(() => newRow.classList.remove('just-done'), 700);
    }

    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!calm) {
      if (rowRect) floatReward(rowRect, r.xp, r.coins);
      flyOrbs(fromRect, $('#xpbar'), 'xp', 5);
      flyOrbs(fromRect, $('#stat-coins'), 'coin', 4);
    }

    ding();
    try { if (navigator.vibrate) navigator.vibrate(24); } catch (e) { /* 忽略 */ }

    // 奖励落到 HUD：经验条开始涨、金币数字开始滚
    setTimeout(() => {
      renderHud();
      renderShop();
      const coinEl = $('#stat-coins');
      if (coinEl) {
        coinEl.textContent = coinsBefore;
        countUp(coinEl, coinsBefore, S.player.coins, 560);
        pulse(coinEl, 'hit');
      }
      pulse($('#xpbar'), 'hit');
      pulse($('#streak-box'), 'hit');
    }, calm ? 0 : 720);

    const lvAfter = levelInfo(S.player.xp).lv;

    if (usedFreezes.length) toast('❄ 用掉 ' + usedFreezes.length + ' 张冻结卡补签，连胜保住了');

    if (lvAfter > lvBefore) {
      setTimeout(() => {
        flashLevel();
        showLevelUp();
        ding(true);
      }, calm ? 60 : 800);
    }

    if (readyWeeklies().join(',') !== readyBefore) {
      setTimeout(() => toast('周常达成，去上面领奖励', 'blue'), 960);
    }

    if (doneBefore + 1 >= total) {
      setTimeout(() => toast('今日全清 · 连胜 ' + S.player.streak + ' 天', 'gold'), 1080);
    }
  }

  /* ── 升级：全屏结算 ── */

  let luTimer = null;

  function showLevelUp() {
    const el = $('#levelup');
    if (!el) return;
    const info = levelInfo(S.player.xp);

    setText('#lu-lv', info.lv);
    setText('#lu-title', info.title);
    setText('#lu-sub', info.isMax
      ? '满级 · 你已经没什么可升的了'
      : '距下一级还差 ' + Math.max(0, info.need - info.got) + ' XP');

    el.hidden = false;
    el.classList.remove('out', 'on');
    void el.offsetWidth;          // 强制重排，让动画能重播
    el.classList.add('on');

    if (luTimer) clearTimeout(luTimer);
    luTimer = setTimeout(closeLevelUp, 2600);
  }

  function closeLevelUp() {
    const el = $('#levelup');
    if (!el || el.hidden) return;
    if (luTimer) { clearTimeout(luTimer); luTimer = null; }
    el.classList.remove('on');
    el.classList.add('out');
    setTimeout(function () {
      el.hidden = true;
      el.classList.remove('out');
    }, 300);
  }

  /* ── 爽感小零件 ── */

  function floatReward(rect, xp, coins) {
    const box = document.createElement('div');
    box.className = 'float-reward';
    box.style.left = (rect.left + rect.width / 2) + 'px';
    box.style.top = (rect.top + rect.height * 0.45) + 'px';
    box.innerHTML = '<span class="fx">+' + xp + ' XP</span><span class="fc">+' + coins + ' 币</span>';
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1200);
  }

  function flyOrbs(fromRect, target, kind, n) {
    if (!fromRect || !target) return;
    const tr = target.getBoundingClientRect();
    const tx = tr.left + tr.width / 2;
    const ty = tr.top + tr.height / 2;

    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      el.className = 'orb ' + kind;
      const sx = fromRect.left + fromRect.width * (0.35 + Math.random() * 0.3);
      const sy = fromRect.top + fromRect.height * (0.4 + Math.random() * 0.2);
      el.style.left = sx + 'px';
      el.style.top = sy + 'px';
      document.body.appendChild(el);

      const dx = tx - sx;
      const dy = ty - sy;
      const lift = -(26 + Math.random() * 46);
      const anim = el.animate([
        { transform: 'translate(-50%, -50%) scale(.25)', opacity: 0 },
        {
          transform: 'translate(calc(-50% + ' + (dx * 0.45).toFixed(1) + 'px), calc(-50% + ' +
            (dy * 0.3 + lift).toFixed(1) + 'px)) scale(1.25)',
          opacity: 1,
          offset: 0.45,
        },
        {
          transform: 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' +
            dy.toFixed(1) + 'px)) scale(.4)',
          opacity: 0.85,
        },
      ], {
        duration: 540 + Math.random() * 150,
        delay: i * 45,
        easing: 'cubic-bezier(.4, 0, .3, 1)',
        fill: 'both',
      });
      anim.onfinish = function () { el.remove(); };
    }
  }

  function countUp(el, from, to, dur) {
    if (!el || from === to) { if (el) el.textContent = to; return; }
    const span = Math.max(160, dur || 520);
    const start = performance.now();
    function frame(now) {
      const k = Math.min(1, (now - start) / span);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    // 保险：切标签页时 rAF 会被节流，到点直接把最终值落上去
    setTimeout(() => { el.textContent = to; }, span + 80);
  }

  function pulse(el, cls) {
    if (!el) return;
    const name = cls || 'hit';
    el.classList.remove(name);
    void el.offsetWidth;
    el.classList.add(name);
    setTimeout(() => el.classList.remove(name), 700);
  }

  function flashLevel() {
    const d = document.createElement('div');
    d.className = 'lvl-flash';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1050);
  }

  /* ── 编辑今日任务 ── */

  function startEditDaily() {
    editing = true;
    noting = null;
    editList = todayQuests(todayKey()).map((q) => ({
      id: q.id,
      title: q.title,
      minutes: q.minutes,
      grade: gradeOf(q),
      quick: !!q.quick,
    }));
    // 一条都没有时，先给一个空行，别让人对着空白发呆
    if (!editList.length) {
      editList.push({ id: newQuestId(), title: '', minutes: 5, grade: 'low', quick: false });
    }
    const def = $('#edit-default');
    if (def) def.checked = !(S.customDaily && S.customDaily.length);
    renderDaily();
  }

  let questSeq = 0;

  function newQuestId() {
    questSeq++;
    return 'c' + Date.now().toString(36) + questSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  function syncEditFromDOM() {
    $$('#daily-list .quest-edit').forEach((row, i) => {
      const q = editList[i];
      if (!q) return;
      const title = row.querySelector('.qe-title');
      const min = row.querySelector('.qe-min input');
      if (title) q.title = title.value;
      if (min) q.minutes = clamp(Math.round(Number(min.value)) || 1, 1, 300);
    });
  }

  // 点等级只换这一行的选中态和奖励预览，不重绘（不然标题输入框会失焦）
  function setEditGrade(i, grade) {
    const q = editList[i];
    if (!q || !CONFIG.grades[grade]) return;
    q.grade = grade;

    const row = $$('#daily-list .quest-edit')[i];
    if (!row) return;
    CONFIG.gradeOrder.forEach((g) => row.classList.toggle('g-' + g, g === grade));
    row.querySelectorAll('.g-chip').forEach((el) => {
      el.classList.toggle('is-on', el.getAttribute('data-grade') === grade);
    });
    const out = row.querySelector('.ge-reward');
    const meta = CONFIG.grades[grade];
    if (out) out.textContent = '+' + meta.xp + ' XP · +' + meta.coins + ' 币';
  }

  function addEditRow() {
    syncEditFromDOM();
    editList.push({
      id: newQuestId(),
      title: '',
      minutes: 10,
      grade: 'high',
      quick: false,
    });
    renderDaily();
    const inputs = $$('#daily-list .qe-title');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function delEditRow(i) {
    syncEditFromDOM();
    editList.splice(i, 1);
    renderDaily();
  }

  function cancelEditDaily() {
    editing = false;
    editList = [];
    renderDaily();
  }

  function saveEditDaily() {
    syncEditFromDOM();
    const clean = [];
    editList.forEach((q) => {
      const title = String(q.title || '').trim().slice(0, 48);
      if (!title) return;
      clean.push({
        id: q.id,
        title: title,
        minutes: clamp(Math.round(q.minutes) || 1, 1, 300),
        grade: CONFIG.grades[q.grade] ? q.grade : 'low',
        quick: !!q.quick,
      });
    });
    if (!clean.length) {
      toast('至少留一个任务，不然今天没得打', 'blue');
      return;
    }
    const day = ensureDay(todayKey());
    const def = $('#edit-default');
    if (def && def.checked) {
      S.customDaily = clean;
      day.list = null;
    } else {
      day.list = clean;
    }
    day.edited = true;

    // 每天第一次编辑任务，给一份 high 奖励
    const saveBtn = $('[data-daily-save]');
    const fromRect = saveBtn ? saveBtn.getBoundingClientRect() : null;
    const coinsBefore = S.player.coins;
    const lvBefore = levelInfo(S.player.xp).lv;
    const bonus = grantEditBonus(day);

    editing = false;
    editList = [];
    save();
    renderAll();
    toast(def && def.checked ? '已设为每天的固定任务' : '今日任务已更新');

    if (bonus) playEditBonus(bonus, fromRect, coinsBefore, lvBefore);
  }

  function grantEditBonus(day) {
    if (day.editBonus) return null;
    const g = CONFIG.grades.high;
    day.editBonus = Date.now();
    S.player.xp += g.xp;
    S.player.coins += g.coins;
    return { xp: g.xp, coins: g.coins };
  }

  function playEditBonus(bonus, fromRect, coinsBefore, lvBefore) {
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () {
      if (!calm && fromRect) {
        floatReward(fromRect, bonus.xp, bonus.coins);
        flyOrbs(fromRect, $('#xpbar'), 'xp', 4);
        flyOrbs(fromRect, $('#stat-coins'), 'coin', 3);
      }
      ding();
      toast('编辑奖励 +' + bonus.xp + ' XP · +' + bonus.coins + ' 币', 'gold');

      setTimeout(function () {
        renderHud();
        renderShop();
        const coinEl = $('#stat-coins');
        if (coinEl) {
          coinEl.textContent = coinsBefore;
          countUp(coinEl, coinsBefore, S.player.coins, 520);
          pulse(coinEl, 'hit');
        }
        pulse($('#xpbar'), 'hit');
        if (levelInfo(S.player.xp).lv > lvBefore) {
          flashLevel();
          setTimeout(showLevelUp, 220);
        }
      }, calm ? 0 : 640);
    }, 240);
  }

  /* ── 完成后补一句笔记（可选） ── */

  function startNote(qid) {
    noting = qid;
    renderDaily();
    setTimeout(function () {
      const el = $('#note-input');
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* 忽略 */ }
    }, 30);
  }

  function saveNote() {
    if (!noting) return;
    const el = $('#note-input');
    const qid = noting;
    if (!el) { noting = null; return; }

    noting = null;
    const val = el.value.trim().slice(0, 120);
    const day = S.days[todayKey()];
    if (day && day.quests && day.quests[qid]) {
      day.quests[qid].note = val;
      save();
      renderNotes();
    }
    // 只换掉这一行里的笔记部分：整表重绘会把用户正要点的按钮连同点击一起吞掉
    applyNoteRow(qid, val);
  }

  function applyNoteRow(qid, val) {
    const row = document.querySelector('#daily-list [data-qid="' + qid + '"]');
    if (!row) return;
    const body = row.querySelector('.body');
    if (!body) return;

    const old = body.querySelector('#note-input, .done-note, .note-add');
    if (old) old.remove();

    if (val) {
      const div = document.createElement('div');
      div.className = 'done-note';
      div.textContent = val;
      body.appendChild(div);
    } else {
      const btn = document.createElement('button');
      btn.className = 'note-add';
      btn.type = 'button';
      btn.setAttribute('data-note', qid);
      btn.textContent = '＋ 顺手记一句（可选）';
      body.appendChild(btn);
    }
  }

  function startTimer(qid) {
    const key = todayKey();
    const day = ensureDay(key);
    day.running[qid] = Date.now();
    save();
    renderDaily();
    tickTimers();
  }

  function stopTimer(qid) {
    const key = todayKey();
    const day = S.days[key];
    if (day && day.running) delete day.running[qid];
    save();
    renderDaily();
  }

  function claimWeekly(wid, fromRect) {
    const w = CONFIG.weekly.filter((x) => x.id === wid)[0];
    if (!w) return;
    const wk = weekStartKey(todayKey());
    const flag = wk + '|' + w.id;
    if (S.claims[flag]) return;
    if (weeklyStat(w, wk).raw < w.target) return;

    S.claims[flag] = Date.now();
    S.player.xp += w.xp;
    S.player.coins += w.coins;
    if (w.freeze) S.player.freezes += w.freeze;

    const lvBefore = levelInfo(S.player.xp - w.xp).lv;
    save();
    renderAll();
    ding();

    const lvAfter = levelInfo(S.player.xp).lv;
    if (fromRect) {
      floatReward(fromRect, w.xp, w.coins);
      flyOrbs(fromRect, $('#xpbar'), 'xp', 4);
      flyOrbs(fromRect, $('#stat-coins'), 'coin', 3);
    }
    toast('+' + w.xp + ' XP · +' + w.coins + ' 币' + (w.freeze ? ' · ❄' + w.freeze : ''), 'gold');
    if (lvAfter > lvBefore) setTimeout(showLevelUp, 400);
  }

  function buy(itemId) {
    const it = shopItems().filter((x) => x.id === itemId)[0];
    if (!it) return;
    if (S.player.coins < it.cost) return;

    if (it.effect === 'freeze') {
      if (!confirm('花 ' + it.cost + ' 金币买 1 张冻结卡？')) return;
      S.player.coins -= it.cost;
      S.player.freezes += 1;
      save();
      renderAll();
      ding();
      toast('❄ 冻结卡 +1（现在有 ' + S.player.freezes + ' 张）', 'blue');
      return;
    }

    if (!confirm('兑换「' + it.name + '」要花 ' + it.cost + ' 金币。\n\n兑换后先进仓库，想用的时候再去仓库点「用掉」。')) return;
    S.player.coins -= it.cost;
    S.redemptions.push({
      id: it.id,
      name: it.name,
      emoji: it.emoji || '',
      cost: it.cost,
      at: Date.now(),
      usedAt: null,
    });
    save();
    renderHud();
    renderShop();
    ding();
    toast('已存入仓库：' + it.name, 'gold');
  }

  /* ── 编辑商城 ── */

  let shopDraft = [];

  function openShopEdit() {
    shopDraft = shopItems().map((it) => ({
      id: it.id,
      name: it.name,
      emoji: it.emoji || '',
      cost: it.cost,
      effect: it.effect || '',
    }));
    renderShopEdit();
    openModal('#modal-shop-edit');
  }

  function renderShopEdit() {
    $('#shop-edit-list').innerHTML = shopDraft.map((it, i) =>
      '<div class="shop-edit-row">' +
        '<input class="se-emoji" type="text" maxlength="2" value="' + esc(it.emoji) + '" aria-label="图标">' +
        '<input class="se-name" type="text" maxlength="18" value="' + esc(it.name) + '" placeholder="商品名">' +
        '<label class="se-cost">金币<input type="number" min="1" max="99999" value="' + it.cost + '"></label>' +
        (it.effect === 'freeze' ? '<span class="se-tag">冻结卡</span>' : '') +
        '<button class="qe-del" type="button" data-shop-del="' + i + '" title="删掉">×</button>' +
      '</div>'
    ).join('');
  }

  function syncShopFromDOM() {
    $$('#shop-edit-list .shop-edit-row').forEach((row, i) => {
      const it = shopDraft[i];
      if (!it) return;
      const emoji = row.querySelector('.se-emoji');
      const name = row.querySelector('.se-name');
      const cost = row.querySelector('.se-cost input');
      if (emoji) it.emoji = emoji.value.trim().slice(0, 2);
      if (name) it.name = name.value.trim().slice(0, 18);
      if (cost) it.cost = clamp(Math.round(Number(cost.value)) || 1, 1, 99999);
    });
  }

  function addShopRow() {
    syncShopFromDOM();
    shopDraft.push({
      id: 's' + Date.now().toString(36) + Math.floor(Math.random() * 999).toString(36),
      name: '',
      emoji: '🎁',
      cost: 100,
      effect: '',
    });
    renderShopEdit();
  }

  function delShopRow(i) {
    syncShopFromDOM();
    shopDraft.splice(i, 1);
    renderShopEdit();
  }

  function saveShopEdit() {
    syncShopFromDOM();
    const clean = shopDraft
      .filter((it) => String(it.name || '').trim())
      .map((it) => ({
        id: it.id,
        name: it.name.trim(),
        emoji: it.emoji || '',
        cost: it.cost,
        effect: it.effect || '',
      }));
    if (!clean.length) {
      toast('至少留一个商品', 'blue');
      return;
    }
    S.shop = clean;
    save();
    closeModal($('#modal-shop-edit'));
    renderAll();
    toast('商城已更新');
  }

  /* ── AI 拆任务 ── */

  let aiPool = null;

  const AI_SYSTEM =
    '你是一个学习任务拆解器。把用户这段话拆成 1-6 个「今天能做完」的具体任务。要求：' +
    'title 不超过 24 个字，按产出写（不要写「学 2 小时」这种），具体到能立刻开始；' +
    'grade 只能是 low/high/max/astra 之一（low≈5 分钟、high≈20 分钟、max≈45 分钟、astra≈2 小时）；' +
    'minutes 是预估分钟数（1-300 的整数）。只输出 JSON，不要解释，格式：' +
    '{"tasks":[{"title":"...","grade":"high","minutes":20}]}';

  function gradeRank(g) {
    return { low: 0, high: 1, max: 2, astra: 3, genshin: 4 }[g] || 0;
  }

  function guessMinutes(t) {
    let m = 0;
    const h = t.match(/(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|h)/i);
    if (h) m = Math.round(Number(h[1]) * 60);
    const mi = t.match(/(\d+)\s*分钟/);
    if (mi) m = Math.max(m, Number(mi[1]));
    if (!m) {
      if (/(真题|试卷|一套卷|模拟|考试|全书|整本)/.test(t)) m = 120;
      else if (/(章|单元|推导|证明)/.test(t)) m = 60;
      else if (/(写|总结|输出|讲|复述)/.test(t)) m = 30;
      else if (/(背|单词|默写|公式)/.test(t)) m = 20;
      else if (/(复习|整理|笔记|错题)/.test(t)) m = 15;
      else m = 20;
    }
    return clamp(m, 1, 300);
  }

  function guessGrade(t, minutes) {
    let g = 'high';
    if (/(真题|试卷|一套卷|模拟考|考试|全书|整本)/.test(t)) g = 'astra';
    else if (/(章|单元|推导|证明|论文|大作业)/.test(t)) g = 'max';
    else if (/(背|默写|单词|公式|复习|整理|笔记|错题|看|读|视频)/.test(t)) g = 'high';
    else if (/(打开|看一眼|翻|浏览)/.test(t)) g = 'low';

    const byTime = minutes >= 90 ? 'astra' : minutes >= 45 ? 'max' : minutes >= 15 ? 'high' : 'low';
    return gradeRank(byTime) > gradeRank(g) ? byTime : g;
  }

  // 本地规则：不联网也能把一段话拆成任务
  function parseLocal(text) {
    const segs = String(text).split(/[，,。；;\n、]+|然后|接着|还要|另外|以及/);
    const out = [];
    const seen = {};
    segs.forEach((seg) => {
      const t = seg.trim()
        .replace(/^(今天|今晚|上午|下午|晚上|早上|中午|我要|我打算|计划|需要|得)+/, '')
        .replace(/^(把|去|再)+/, '')
        .trim();
      if (t.length < 2) return;
      const key = t.slice(0, 5);
      if (seen[key]) return;
      seen[key] = 1;
      const minutes = guessMinutes(t);
      out.push({ title: t.slice(0, 24), minutes: minutes, grade: guessGrade(t, minutes) });
    });
    return out.slice(0, 6);
  }

  async function aiParseRemote(text) {
    const ai = S.ai || {};
    if (!ai.key) return null;
    const base = (ai.base || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
    const model = ai.model || 'deepseek-chat';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ai.key,
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: AI_SYSTEM },
            { role: 'user', content: text },
          ],
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const msg = data && data.choices && data.choices[0] && data.choices[0].message;
      const body = String((msg && msg.content) || '')
        .replace(/^\s*```(?:json)?/i, '')
        .replace(/```\s*$/, '')
        .trim();
      const parsed = JSON.parse(body);
      const arr = Array.isArray(parsed) ? parsed : parsed.tasks;
      if (!Array.isArray(arr)) throw new Error('格式不对');
      return arr
        .filter((x) => x && String(x.title || '').trim())
        .slice(0, 6)
        .map((x) => ({
          title: String(x.title).trim().slice(0, 24),
          minutes: clamp(Math.round(Number(x.minutes)) || 20, 1, 300),
          grade: CONFIG.grades[x.grade] ? x.grade : 'high',
        }));
    } finally {
      clearTimeout(timer);
    }
  }

  async function runAiParse() {
    const input = $('#ai-input');
    const text = (input.value || '').trim();
    if (text.length < 2) {
      toast('先写一句今天想干什么', 'blue');
      input.focus();
      return;
    }

    const btn = $('#ai-run');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '拆解中…';

    let tasks = null;
    let via = 'local';
    try {
      if (S.ai && S.ai.key) {
        tasks = await aiParseRemote(text);
        via = 'ai';
      }
    } catch (e) {
      tasks = null;
      toast('AI 接口没通，改用本地规则', 'blue');
    }

    if (!tasks || !tasks.length) {
      tasks = parseLocal(text);
      via = 'local';
    }

    btn.disabled = false;
    btn.textContent = old;

    if (!tasks.length) {
      $('#ai-list').innerHTML = '<p class="ai-empty">没拆出任务，换句话试试。</p>';
      $('#ai-apply').hidden = true;
      return;
    }

    aiPool = tasks;
    $('#ai-note').textContent = via === 'ai' ? '· AI 拆的' : '· 本地规则拆的';
    renderAiPreview();
  }

  function renderAiPreview() {
    const g = CONFIG.grades;
    $('#ai-list').innerHTML = aiPool.map((t) =>
      '<div class="ai-row">' +
        '<span class="grade g-' + t.grade + '">' + esc(g[t.grade].label) + '</span>' +
        '<b>' + esc(t.title) + '</b>' +
        '<span class="ai-min">' + t.minutes + ' 分钟</span>' +
      '</div>'
    ).join('');
    const apply = $('#ai-apply');
    apply.hidden = false;
    apply.textContent = '把这 ' + aiPool.length + ' 个加进今天';
  }

  function applyAiTasks() {
    if (!aiPool || !aiPool.length) return;

    const key = todayKey();
    const day = ensureDay(key);
    const current = todayQuests(key).slice();
    const seen = {};
    current.forEach((q) => { seen[String(q.title).trim()] = 1; });

    let added = 0;
    let skipped = 0;
    aiPool.forEach((t) => {
      const title = String(t.title || '').trim();
      if (!title || seen[title]) { skipped++; return; }
      seen[title] = 1;
      current.push({ id: newQuestId(), title: title, minutes: t.minutes, grade: t.grade, quick: false });
      added++;
    });

    if (!added) {
      toast('这些任务今天已经有了', 'blue');
      return;
    }

    day.list = current;
    save();
    closeModal($('#modal-ai'));
    renderAll();
    toast('加了 ' + added + ' 个任务' + (skipped ? '，跳过 ' + skipped + ' 个重复的' : ''));
  }

  /* ── 语音输入（Web Speech API，需要安全上下文） ── */

  let recog = null;
  let recogBase = '';

  function micSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function setMicUI(on) {
    const btn = $('#ai-mic');
    const label = $('#ai-mic-label');
    if (btn) btn.classList.toggle('is-rec', !!on);
    if (label) label.textContent = on ? '正在听…' : '语音输入';
  }

  function stopVoice() {
    if (!recog) return;
    try { recog.stop(); } catch (e) { /* 忽略 */ }
    recog = null;
    setMicUI(false);
  }

  function toggleVoice() {
    if (recog) { stopVoice(); return; }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('这个浏览器不支持语音识别，手打吧', 'blue');
      return;
    }
    if (!window.isSecureContext) {
      toast('http 页面拿不到麦克风：要用 https 或本机 localhost 打开', 'blue');
      return;
    }

    const input = $('#ai-input');
    recogBase = input.value.trim();

    let r;
    try {
      r = new SR();
    } catch (e) {
      toast('麦克风起不来', 'blue');
      return;
    }
    r.lang = 'zh-CN';
    r.continuous = false;
    r.interimResults = true;

    r.onresult = function (e) {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      const sep = recogBase && !/[，。！？,.\s]$/.test(recogBase) ? '，' : '';
      input.value = recogBase + sep + txt;
    };

    r.onerror = function (e) {
      const map = {
        'not-allowed': '麦克风被拒绝了，去浏览器设置里放开',
        'no-speech': '没听到声音，再试一次',
        'audio-capture': '找不到麦克风',
        network: '语音服务连不上（需要联网）',
      };
      toast(map[e.error] || ('语音出错：' + e.error), 'blue');
      recog = null;
      setMicUI(false);
    };

    r.onend = function () {
      recog = null;
      setMicUI(false);
    };

    recog = r;
    setMicUI(true);
    try {
      r.start();
    } catch (e) {
      recog = null;
      setMicUI(false);
      toast('麦克风起不来', 'blue');
    }
  }

  function openAi() {
    aiPool = null;
    $('#ai-list').innerHTML = '';
    $('#ai-apply').hidden = true;
    $('#ai-run').disabled = false;
    $('#ai-run').textContent = '拆成任务';
    $('#ai-note').textContent = (S.ai && S.ai.key) ? '· 会走你配的 AI 接口' : '· 本地规则（可在设置里接 AI）';

    const mic = $('#ai-mic');
    if (mic) mic.hidden = !micSupported();
    setMicUI(false);

    openModal('#modal-ai');
    setTimeout(() => { try { $('#ai-input').focus(); } catch (e) { /* 忽略 */ } }, 90);
  }

  /* ── 战报 ── */

  function buildReport() {
    const today = todayKey();
    const month = today.slice(0, 7);
    const mLabel = today.slice(0, 4) + ' 年 ' + Number(today.slice(5, 7)) + ' 月';

    let quests = 0, minutes = 0, activeDays = 0;
    const tally = {};
    const notes = [];

    for (const k in S.days) {
      if (k.slice(0, 7) !== month) continue;
      const d = S.days[k];
      if (!d || !d.quests) continue;
      const n = Object.keys(d.quests).length;
      if (n) activeDays++;
      for (const id in d.quests) {
        const rec = d.quests[id];
        quests++;
        minutes += rec.minutes || 0;
        tally[id] = (tally[id] || 0) + 1;
        if (rec.note && rec.note.trim()) notes.push({ key: k, note: rec.note, at: rec.at || dateOf(k).getTime() });
      }
    }

    // 本月最长连续（冻结日算保住）
    let run = 0, best = 0;
    let cur = month + '-01';
    while (cur <= today) {
      const has = doneCount(cur) > 0 || S.player.frozen.indexOf(cur) !== -1;
      if (has) { run++; if (run > best) best = run; } else run = 0;
      cur = addDays(cur, 1);
    }

    const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a]).slice(0, 3)
      .map((id) => ({ title: questTitle(id), n: tally[id] }));

    notes.sort((a, b) => a.at - b.at);

    // 全站累计
    let allQuests = 0, allMinutes = 0;
    for (const k in S.days) {
      const d = S.days[k];
      if (!d || !d.quests) continue;
      for (const id in d.quests) {
        allQuests++;
        allMinutes += d.quests[id].minutes || 0;
      }
    }

    if (!quests) {
      return '<p class="report-empty">' +
        '这个月还没有记录。<br>先去做那个 5 分钟的任务，战报从今天开始写。' +
        '</p>';
    }

    let html = '<div class="report-grid">' +
      '<div class="report-cell"><b>' + quests + '</b><span>完成任务</span></div>' +
      '<div class="report-cell"><b>' + fmtMin(minutes) + '</b><span>专注时长</span></div>' +
      '<div class="report-cell"><b>' + activeDays + ' 天</b><span>出勤天数</span></div>' +
      '<div class="report-cell"><b>' + best + ' 天</b><span>最长连续</span></div>' +
    '</div>';

    if (notes.length >= 2) {
      const first = notes[0], last = notes[notes.length - 1];
      html += '<div class="report-list"><h4>这个月的第一条</h4>' +
        '<div class="report-quote">' + esc(first.note) + '<br><span style="color:#7c6fa6;font-size:11px">' + shortDate(first.key) + '</span></div>' +
        '<h4 style="margin-top:8px">最近一条</h4>' +
        '<div class="report-quote">' + esc(last.note) + '<br><span style="color:#7c6fa6;font-size:11px">' + shortDate(last.key) + '</span></div></div>';
    } else if (notes.length === 1) {
      html += '<div class="report-quote">' + esc(notes[0].note) + '</div>';
    }

    if (top.length) {
      html += '<div class="report-list"><h4>刷得最多的副本</h4><ul>' +
        top.map((t) => '<li>' + esc(t.title) + ' × ' + t.n + '</li>').join('') +
        '</ul></div>';
    }

    html += '<div class="report-list"><h4>累计</h4><ul>' +
      '<li>总任务 ' + allQuests + ' 个 · 总时长 ' + fmtMin(allMinutes) + '</li>' +
      '<li>当前连胜 ' + S.player.streak + ' 天 · 最高 ' + S.player.best + ' 天</li>' +
      '</ul></div>';

    html += '<p style="margin:0;font-size:11.5px;color:#646e7f">' + mLabel + ' · 战斗记录</p>';

    return html;
  }

  function openReport() {
    $('#report-title').textContent = '战报';
    $('#report-body').innerHTML = buildReport();
    openModal('#modal-report');
  }

  /* ── 备份 ── */

  function exportBackup() {
    const data = JSON.stringify(S, null, 2);
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'study-dungeon-' + todayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('备份已导出');
    } catch (e) {
      toast('导出失败，试试用 Chrome / Edge 打开', 'blue');
    }
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const raw = JSON.parse(String(reader.result));
        if (!raw || !raw.player || !raw.days) throw new Error('格式不对');
        S = migrate(raw);
        save();
        renderAll();
        const days = Object.keys(S.days || {}).length;
        const lv = levelInfo(S.player.xp).lv;
        toast('已导入：Lv.' + lv + ' · ' + S.player.coins + ' 金币 · ' + days + ' 天记录');
      } catch (e) {
        toast('这个文件看起来不像是备份', 'blue');
      }
    };
    reader.readAsText(file);
  }

  /* =========================================================
     七、事件绑定
     ========================================================= */

  document.addEventListener('click', function (e) {
    const t = e.target;

    if (t.closest('[data-close]')) {
      const m = t.closest('.modal');
      if (m) closeModal(m);
      return;
    }
    if (t.classList && t.classList.contains('modal')) {
      closeModal(t);
      return;
    }

    const act = function (name) {
      const el = t.closest('[' + name + ']');
      return el ? el.getAttribute(name) : null;
    };

    const startId = act('data-start');
    if (startId) { startTimer(startId); return; }

    const stopId = act('data-stop');
    if (stopId) { stopTimer(stopId); return; }

    const doneId = act('data-done');
    if (doneId) { completeInstant(doneId, t.closest('button')); return; }

    const noteId = act('data-note');
    if (noteId) { startNote(noteId); return; }

    const delIdx = act('data-daily-del');
    if (delIdx !== null) { delEditRow(Number(delIdx)); return; }

    const gradeEl = t.closest('[data-grade]');
    if (gradeEl) {
      setEditGrade(Number(gradeEl.getAttribute('data-grow')), gradeEl.getAttribute('data-grade'));
      return;
    }

    if (t.closest('#btn-edit-daily')) { startEditDaily(); return; }
    if (t.closest('[data-open-edit]')) { startEditDaily(); return; }
    if (t.closest('[data-daily-add]')) { addEditRow(); return; }
    if (t.closest('[data-daily-save]')) { saveEditDaily(); return; }
    if (t.closest('[data-daily-cancel]')) { cancelEditDaily(); return; }

    if (t.closest('#btn-ai')) { openAi(); return; }
    if (t.closest('#ai-run')) { runAiParse(); return; }
    if (t.closest('#ai-mic')) { toggleVoice(); return; }
    if (t.closest('#ai-apply')) { applyAiTasks(); return; }

    if (t.closest('#btn-shop-edit')) { openShopEdit(); return; }
    if (t.closest('#shop-add')) { addShopRow(); return; }
    if (t.closest('#shop-save')) { saveShopEdit(); return; }
    const shopDel = act('data-shop-del');
    if (shopDel !== null) { delShopRow(Number(shopDel)); return; }

    const claimId = act('data-claim');
    if (claimId) {
      const chest = t.closest('.chest');
      if (chest && !chest.classList.contains('opening')) {
        // 先摇一下箱子，再结算
        const rect = chest.getBoundingClientRect();
        chest.classList.add('opening');
        setTimeout(function () { claimWeekly(claimId, rect); }, 430);
      } else if (!chest) {
        claimWeekly(claimId);
      }
      return;
    }

    const buyId = act('data-buy');
    if (buyId) { buy(buyId); return; }

    const useId = act('data-use');
    if (useId) { useReward(useId); return; }

    if (t.closest('#btn-shop')) { openModal('#modal-shop'); return; }
    if (t.closest('#btn-notes')) { toggleNotes(); return; }
    if (t.closest('[data-bag]')) { openBag(); return; }
    if (t.closest('#btn-report')) { openReport(); return; }
    if (t.closest('#btn-settings')) { syncSettingsUI(); openModal('#modal-settings'); return; }
    if (t.closest('#btn-export')) { exportBackup(); return; }
    if (t.closest('#btn-import')) { $('#file-import').click(); return; }

    if (t.closest('#btn-reset')) {
      if (!confirm('确定清空全部记录？等级、金币、连胜、笔记都会没。\n\n建议先导出备份。')) return;
      try { localStorage.removeItem(KEY); } catch (err) {}
      S = emptyState();
      save();
      closeModal($('#modal-settings'));
      renderAll();
      toast('已重置，新的赛季开始了');
      return;
    }

    if (t.closest('#sync-up')) { syncPush(false).catch(function () { toast('连不上服务器', 'blue'); }); return; }
    if (t.closest('#sync-down')) { syncPull(false).catch(function () { toast('连不上服务器', 'blue'); }); return; }

    if (t.closest('#sync-keep-local')) {
      closeModal($('#modal-sync'));
      syncPush(false, true)
        .then(function (ok) { if (ok) toast('已用本机版本覆盖服务器', 'gold'); })
        .catch(function () { toast('连不上服务器', 'blue'); });
      return;
    }
    if (t.closest('#sync-take-remote')) {
      closeModal($('#modal-sync'));
      if (pendingRemote) {
        adoptRemote(pendingRemote);
        pendingRemote = null;
        toast('已切到服务器版本', 'gold');
      }
      return;
    }

    if (t.closest('#sw-sync')) {
      if (DEMO) { toast('演示模式不参与同步', 'blue'); return; }
      if (!sync.on) {
        const baseEl = $('#sync-base');
        const tokenEl = $('#sync-token');
        sync.base = (baseEl ? baseEl.value.trim() : '').replace(/\/+$/, '');
        sync.token = tokenEl ? tokenEl.value.trim() : '';
        if (!sync.base || !sync.token) {
          toast('先填服务器地址和口令', 'blue');
          return;
        }
        sync.on = true;
        saveSync();
        toast('云同步已开启，正在对齐服务器…', 'gold');
        syncBoot(true);
      } else {
        sync.on = false;
        saveSync();
        toast('已关闭云同步，之后只存本机');
      }
      return;
    }

    if (t.closest('#sw-boot')) {
      S.settings.boot = S.settings.boot === false;
      save();
      syncSettingsUI();
      toast(S.settings.boot ? '下次打开会放启动画面' : '已关掉启动画面', 'blue');
      return;
    }

    if (t.closest('#sw-grid')) {
      S.settings.grid = S.settings.grid === false;
      save();
      applyGrid();
      syncSettingsUI();
      return;
    }

    if (t.closest('#sw-sound')) {
      S.settings.sound = !S.settings.sound;
      save();
      syncSettingsUI();
      if (S.settings.sound) ding();
      return;
    }
  });

  document.addEventListener('input', function (e) {
    const id = e.target && e.target.id;

    if (id === 'sync-base' || id === 'sync-token') {
      if (id === 'sync-base') sync.base = e.target.value.trim().replace(/\/+$/, '');
      else sync.token = e.target.value.trim();
      try { localStorage.setItem(SYNC_KEY, JSON.stringify(sync)); } catch (err) { /* 忽略 */ }
      updateSyncStatusOnly();
      return;
    }

    if (id !== 'ai-base' && id !== 'ai-model' && id !== 'ai-key') return;
    if (!S.ai) S.ai = { base: '', model: '', key: '' };
    const field = id === 'ai-base' ? 'base' : (id === 'ai-model' ? 'model' : 'key');
    S.ai[field] = e.target.value.trim();
    save();
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'file-import' && e.target.files && e.target.files[0]) {
      importBackup(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.addEventListener('keydown', function (e) {
    // 笔记输入框：回车保存，Esc 放弃
    if (e.target && e.target.id === 'note-input') {
      if (e.key === 'Enter') { e.preventDefault(); saveNote(); }
      else if (e.key === 'Escape') { e.preventDefault(); noting = null; renderDaily(); }
      return;
    }
    if (e.target && e.target.classList && e.target.classList.contains('qe-title') && e.key === 'Enter') {
      e.preventDefault();
      addEditRow();
      return;
    }
    if (e.key === 'Escape') {
      const lu = $('#levelup');
      if (lu && !lu.hidden) { closeLevelUp(); return; }
      $$('.modal').forEach((m) => { if (!m.hidden) closeModal(m); });
    }
  });

  document.addEventListener('focusout', function (e) {
    if (e.target && e.target.id === 'note-input') {
      setTimeout(function () { if (noting) saveNote(); }, 0);
    }
  });

  (function initLevelUp() {
    const el = $('#levelup');
    if (el) el.addEventListener('click', closeLevelUp);
  })();

  function syncSettingsUI() {
    const sw = $('#sw-sound');
    if (sw) sw.setAttribute('aria-checked', S.settings.sound ? 'true' : 'false');

    const swb = $('#sw-boot');
    if (swb) swb.setAttribute('aria-checked', S.settings.boot === false ? 'false' : 'true');

    const swg = $('#sw-grid');
    if (swg) swg.setAttribute('aria-checked', S.settings.grid === false ? 'false' : 'true');

    const ai = S.ai || {};
    const base = $('#ai-base');
    const model = $('#ai-model');
    const key = $('#ai-key');
    if (base) base.value = ai.base || '';
    if (model) model.value = ai.model || '';
    if (key) key.value = ai.key || '';

    updateSyncUI();
  }

  /* ── 计时器心跳 ── */
  function tickTimers() {
    updateCountdown();
    const nodes = $$('[data-timer]');
    if (!nodes.length) return;
    const now = Date.now();
    nodes.forEach((el) => {
      el.textContent = fmtClock(now - Number(el.getAttribute('data-timer')));
    });
  }
  setInterval(tickTimers, 1000);

  /* =========================================================
     八、启动
     ========================================================= */

  // 演示模式用的样例任务池（默认池是空的，不能让 demo 也空着）
  function seedDemo(st) {
    const notes = [
      '看完了第三章的极限定义，ε-δ 还是绕，但至少能照葫芦画瓢了。',
      '背了 20 个词，其中 6 个以前见过还是错的。',
      '今天只做了 5 分钟，但没断——比上周强。',
      '把昨天的题重做了一遍，第二遍居然还是卡在同一步。',
      '看视频觉得懂了，自己写的时候一个字写不出。',
      '终于把这节推导顺下来了，卡点在换元。',
      '状态很差，只复习了卡片。允许自己低电量。',
      '发现之前记的笔记全是抄书，难怪没用。',
    ];
    const today = todayKey();
    let xp = 0, coins = 0;

    for (let i = 74; i >= 1; i--) {
      if (Math.random() < 0.27) continue;
      const k = addDays(today, -i);
      const qs = pickQuests(DEMO_POOL, k);
      const n = 1 + Math.floor(Math.random() * Math.min(3, qs.length));
      const day = { quests: {}, running: {}, list: qs };
      for (let j = 0; j < n; j++) {
        const q = qs[j];
        const r = rewardOf(q);
        const note = Math.random() < 0.7 ? notes[Math.floor(Math.random() * notes.length)] : '';
        day.quests[q.id] = { minutes: q.minutes, note: note, at: dateOf(k).getTime() };
        xp += r.xp; coins += r.coins;
      }
      st.days[k] = day;
    }

    const tq = pickQuests(DEMO_POOL, today);
    const tday = { quests: {}, running: {}, list: tq };
    const tr = rewardOf(tq[0]);
    tday.quests[tq[0].id] = { minutes: tq[0].minutes, note: notes[0], at: Date.now() - 3600000 };
    xp += tr.xp; coins += tr.coins;
    if (tq[1]) tday.running[tq[1].id] = Date.now() - 4 * 60 * 1000;
    st.days[today] = tday;

    let streak = 0, cur = today;
    while (st.days[cur] && st.days[cur].quests && Object.keys(st.days[cur].quests).length) {
      streak++;
      cur = addDays(cur, -1);
    }

    st.player.xp = xp;
    st.player.coins = Math.max(0, coins - 400);
    st.player.freezes = 1;
    st.player.streak = streak;
    st.player.best = streak + 3;
    st.player.lastDay = today;

    // 仓库里留几件，演示一下可储存的奖励
    st.redemptions = [
      { id: 'milk-tea', name: '一杯奶茶 / 咖啡', emoji: '🥤', cost: 250, at: Date.now() - 2 * DAY_MS, usedAt: null },
      { id: 'episode', name: '安心看一集番', emoji: '📺', cost: 150, at: Date.now() - 5 * DAY_MS, usedAt: null },
      { id: 'episode', name: '安心看一集番', emoji: '📺', cost: 150, at: Date.now() - 9 * DAY_MS, usedAt: Date.now() - 8 * DAY_MS },
    ];
  }

  /* ── 启动画面 ── */

  const BOOT_TIPS = ['正在加载任务池', '正在读取昨天的笔记', '正在计算连胜与冻结卡', '正在生成今日副本'];

  let booting = false;
  let bootDone = false;

  function initBoot() {
    const el = $('#boot');
    if (!el) return;

    if (S.settings && S.settings.boot === false) { el.remove(); return; }

    // 一个标签页里只放一次：刷新不重播，新开窗口才放
    let seen = false;
    try { seen = sessionStorage.getItem('boot.seen') === '1'; } catch (e) { /* 隐私模式下算了 */ }
    if (seen) { el.remove(); return; }
    try { sessionStorage.setItem('boot.seen', '1'); } catch (e) { /* 忽略 */ }

    document.body.classList.add('booting');
    el.addEventListener('click', onBootTap);
    setTimeout(function () {
      try { $('#boot-start').focus(); } catch (e) { /* 忽略 */ }
    }, 60);
  }

  function onBootTap() {
    if (bootDone) return;
    if (booting) { finishBoot(); return; }  // 加载中再点一下 = 跳过
    runBootLoad();
  }

  function runBootLoad() {
    if (booting || bootDone) return;
    booting = true;

    const start = $('#boot-start');
    const tap = $('#boot-tap');
    const load = $('#boot-load');
    if (start) start.hidden = true;
    if (tap) tap.hidden = true;
    if (load) load.hidden = false;

    const fillL = $('#boot-fill-l');
    const fillR = $('#boot-fill-r');
    const pct = $('#boot-pct');
    const tip = $('#boot-tip');

    let p = 0;
    let lastTip = -1;

    function tick() {
      if (bootDone) return;
      const r = Math.random();
      // 装模作样：偶尔停一下，偶尔跳一大格
      p += r < 0.14 ? 0 : (r < 0.55 ? 3 : 8);
      if (p > 100) p = 100;
      if (fillL) fillL.style.width = p + '%';
      if (fillR) fillR.style.width = p + '%';
      if (pct) pct.textContent = p + '%';

      const idx = Math.min(BOOT_TIPS.length - 1, Math.floor(p / 26));
      if (idx !== lastTip) {
        lastTip = idx;
        if (tip) tip.textContent = BOOT_TIPS[idx] + '…';
      }

      if (p >= 100) { setTimeout(finishBoot, 430); return; }
      setTimeout(tick, 45 + Math.random() * 135);
    }

    setTimeout(tick, 240);
  }

  function finishBoot() {
    const el = $('#boot');
    if (!el || bootDone) return;
    bootDone = true;
    el.classList.add('boot-out');
    document.body.classList.remove('booting');
    setTimeout(function () { el.remove(); }, 720);
  }

  // ── PWA：装到主屏幕 + 离线可用 ──
  // 注意：浏览器只在安全上下文里给注册，http://局域网IP 会被拒，需要 https 或 localhost
  function initSW() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    try {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 忽略 */ });
    } catch (e) { /* 忽略 */ }
  }

  function boot() {
    const used = reconcileStreak();    save();
    renderAll();
    syncSettingsUI();

    if (DEMO) {
      toast('演示模式：随便点，不会动你的真实存档', 'blue');
    } else if (used.length) {
      toast('❄ 用掉 ' + used.length + ' 张冻结卡补签，连胜保住了');
    }

    initBoot();
    applyGrid();
    updateSyncUI();
    syncBoot();
    initSW();
  }

  boot();
})();
