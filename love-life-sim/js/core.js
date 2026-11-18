// 《心动人生》核心规则引擎：时间 / 好感 / 恋爱 / 婚姻 / 育儿 / 结局
// 纯函数与纯数据状态，不依赖 DOM。Node 与浏览器均可加载。
(function (global) {
'use strict';

const D = () => (typeof window !== 'undefined' ? window : globalThis).DATA;

// ---------- 常量 ----------
const START_AGE = 22;
const YEAR_DAYS = 36;        // 1 年 = 36 天（12 月 × 3 天）
const WAKE_MIN = 480;        // 8:00
const SLEEP_MIN = 1380;      // 23:00 钳制
const PREGNANT_DAYS = 27;    // 孕期 9 个月
const MAX_AGE_DAYS = (46 - START_AGE) * YEAR_DAYS; // 46 岁强制结算

const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
const BABY_NAMES = ['豆豆', '糖糖', '小满', '安安', '多多', '念念'];

// ---------- RNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 状态 ----------
function createGame(opt) {
  const seed = opt.seed || Math.floor(Math.random() * 1e9);
  const G = {
    seed,
    day: 0, minutes: WAKE_MIN, age: START_AGE, needSleep: false, ended: false,
    player: {
      name: opt.name || '无名氏', gender: opt.gender || 'M',
      money: 3000, energy: 100, mood: 70, charm: 30, talent: 20,
      careerLevel: 0, careerDays: 0,
      inv: { book: 0, sweet: 0, flower: 0, sportgear: 0, digital: 0, gamemerch: 0 },
      ring: 0, clothesTier: 0,
    },
    npcs: {},
    spouseId: null, marriageDay: -1,
    pregnant: false, dueDay: -1, child: null,
    eventLog: [],
    stats: { chats: 0, dates: 0, gifts: 0 },
  };
  G.rng = mulberry32(seed);
  for (let i = 0; i < D().NPCS.length; i++) {
    const n = D().NPCS[i];
    G.npcs[n.id] = { rel: 0, stage: 'stranger', dates: 0, lastTopic: null, lastInteractDay: -99, cooldownUntil: -1, revealed: false };
  }
  return G;
}

function logEvent(G, type, text) {
  G.eventLog.push({ day: G.day, age: G.age, type, text });
}

// ---------- 时间 ----------
function syncAge(G) { G.age = START_AGE + Math.floor(G.day / YEAR_DAYS); }

function fmtDate(G) {
  const d = G.day % YEAR_DAYS;
  const info = {
    year: Math.floor(G.day / YEAR_DAYS) + 1,
    month: Math.floor(d / 3) + 1,
    day: d % 3 + 1,
    weekday: WEEKDAYS[G.day % 7],
    age: START_AGE + Math.floor(G.day / YEAR_DAYS),
  };
  info.text = `第${info.year}年 ${info.month}月${info.day}日 ${info.weekday}`;
  return info;
}

function addMinutes(G, m) {
  G.minutes += m;
  if (G.minutes >= SLEEP_MIN) { G.minutes = SLEEP_MIN; G.needSleep = true; }
}

function doSleep(G, forced) {
  const events = [];
  G.day += 1;
  G.minutes = WAKE_MIN;
  G.needSleep = false;
  syncAge(G);
  G.player.energy = forced ? 80 : 100;
  if (forced) { G.player.mood = Math.max(10, G.player.mood - 5); events.push({ type: 'forcedSleep', text: '你熬到深夜才睡，头昏昏沉沉的。' }); }
  // 心情回归
  if (G.player.mood < 60) G.player.mood = Math.min(60, G.player.mood + 6);
  else if (G.player.mood > 85) G.player.mood -= 3;

  // 好感衰减：3 天不联系 -1
  for (const id in G.npcs) {
    const st = G.npcs[id];
    if (st.rel >= 40 && G.day - st.lastInteractDay >= 3) st.rel = Math.max(0, st.rel - 1);
  }
  // 夫妻矛盾
  if (G.spouseId && G.npcs[G.spouseId].rel < 40) {
    G.player.mood = Math.max(10, G.player.mood - 8);
    G.npcs[G.spouseId].rel = Math.min(100, G.npcs[G.spouseId].rel + 2);
    events.push({ type: 'quarrel', text: '你和爱人吵了一架，家里的空气很沉。记得多陪陪 TA。' });
  }
  // 分娩
  if (G.pregnant && G.day >= G.dueDay) {
    deliverBaby(G);
    events.push({ type: 'birth', text: `孩子出生了！小名${G.child.name}，哭声特别响亮。` });
  }
  if (!events.length) events.push({ type: 'morning', text: '新的一天开始了。' });
  return { events };
}

// ---------- NPC 查询 ----------
function scheduleZone(npc, hour) {
  const s = npc.schedule;
  for (let i = 0; i < s.length; i++) if (hour >= s[i].from && hour < s[i].to) return s[i].zone;
  return null;
}
function candidates(G) {
  return D().NPCS.filter(n => n.role === 'romance' && n.gender !== G.player.gender);
}
function relOf(G, id) { return G.npcs[id].rel; }
function stageOf(G, id) {
  const st = G.npcs[id];
  if (st.stage === 'lover' || st.stage === 'spouse') return st.stage;
  if (st.rel < 20) return 'stranger';
  if (st.rel < 40) return 'acquaintance';
  if (st.rel < 60) return 'friend';
  if (st.rel < 80) return 'crush';
  return 'closeFriend';
}
const STAGE_LABELS = {
  stranger: '陌生', acquaintance: '熟悉', friend: '朋友', crush: '心动', closeFriend: '亲密',
  lover: '恋人', spouse: '伴侣',
};
function stageLabel(G, id) { return STAGE_LABELS[stageOf(G, id)] || '陌生'; }

function clampRel(st) { st.rel = Math.max(0, Math.min(100, st.rel)); }
function touch(st, G) { st.lastInteractDay = G.day; }

function spend(G, energy, minutes) {
  if (G.player.energy < energy) return false;
  G.player.energy -= energy;
  addMinutes(G, minutes);
  return true;
}

// ---------- 聊天 / 夸赞 / 礼物 ----------
function pickFrom(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function interactChat(G, id, topic) {
  const npc = D().NPCS.find(n => n.id === id);
  const st = G.npcs[id];
  if (!spend(G, 5, 30)) return { ok: false, reason: '太累了，说不出话（体力不足）' };
  G.stats.chats++;
  const isInterest = npc.interests.indexOf(topic) >= 0;
  let delta, text, special = false;
  if (isInterest) {
    delta = 8 + Math.floor(G.rng() * 3);
    text = pickFrom(G.rng, D().INTEREST_LINES[topic]);
    special = true;
  } else {
    delta = 3 + Math.floor(G.rng() * 2);
    text = pickFrom(G.rng, D().TOPICS[topic].neutral);
  }
  const isRepeat = (st.recentTopics || []).indexOf(topic) >= 0;
  if (isRepeat) { delta = Math.ceil(delta * 0.4); text += '（这个话题最近聊过了…）'; }
  if (G.player.mood < 40) delta = Math.ceil(delta / 2);
  delta += Math.floor(G.player.charm / 40);
  st.rel += delta; clampRel(st); touch(st, G);
  st.recentTopics = [topic].concat(st.recentTopics || []).slice(0, 2);
  if (st.rel >= 20 && st.stage === 'stranger' && !st.metLogged) { st.metLogged = true; logEvent(G, 'meet', `你和${npc.name}熟识了起来。`); }
  return { ok: true, delta, text, special };
}

function interactPraise(G, id) {
  const st = G.npcs[id];
  if (!spend(G, 3, 15)) return { ok: false, reason: '太累了（体力不足）' };
  const p = 0.35 + G.player.charm / 200 + st.rel / 400;
  const roll = G.rng();
  let delta, text;
  if (roll < p) { delta = 4 + Math.floor(G.rng() * 3); text = pickFrom(G.rng, D().PRAISE_LINES); }
  else { delta = 1; text = 'TA 礼貌地笑了笑，好像有点不好意思。'; }
  if (G.player.mood < 40) delta = Math.max(1, Math.ceil(delta / 2));
  st.rel += delta; clampRel(st); touch(st, G);
  return { ok: true, delta, text };
}

function buyGift(G, cat) {
  const g = D().GIFTS[cat];
  if (!g || G.player.money < g.price) return { ok: false, reason: '钱不够' };
  G.player.money -= g.price;
  G.player.inv[cat] += 1;
  return { ok: true, cost: g.price };
}
function buyRing(G) {
  if (G.player.ring >= 1) return { ok: true, already: true };
  if (G.player.money < D().RING_PRICE) return { ok: false, reason: '戒指要 2000 元，钱不够' };
  G.player.money -= D().RING_PRICE;
  G.player.ring = 1;
  logEvent(G, 'ring', '你买下了一枚戒指，在心里揣着一个问题。');
  return { ok: true };
}
function giveGift(G, id, cat) {
  const npc = D().NPCS.find(n => n.id === id);
  const st = G.npcs[id];
  if (!G.player.inv[cat]) return { ok: false, reason: '你没有这件礼物（去商场买）' };
  G.player.inv[cat] -= 1;
  G.stats.gifts++;
  let delta, text;
  if (cat === npc.giftPref) {
    delta = 14 + Math.floor(G.rng() * 7);
    text = `「${D().GIFTS[cat].name}！你怎么知道我喜欢这个！」TA 眼睛亮了。`;
  } else {
    delta = 5 + Math.floor(G.rng() * 4);
    text = `TA 收下了${D().GIFTS[cat].name}，客气地道了谢。`;
  }
  st.rel += delta; clampRel(st); touch(st, G);
  return { ok: true, delta, text };
}

// ---------- 约会 ----------
function askDate(G, id) {
  const st = G.npcs[id];
  if (st.stage === 'spouse') return { ok: true };
  if (st.rel < 40) return { ok: false, reason: '好感不足 40，还只是普通关系' };
  if (G.player.energy < 20) return { ok: false, reason: '体力不足' };
  if (G.day < st.cooldownUntil) return { ok: false, reason: 'TA 最近有点忙，过几天再约' };
  return { ok: true };
}
function resolveDate(G, id, spot, choices) {
  const npc = D().NPCS.find(n => n.id === id);
  const st = G.npcs[id];
  const spotData = D().DATE_SPOTS[spot] || D().DATE_SPOTS.cafe;
  if (G.player.money < spotData.cost) return { ok: false, reason: '钱不够' };
  G.player.money -= spotData.cost;
  G.player.energy -= 20;
  addMinutes(G, 120);
  G.player.mood = Math.min(100, G.player.mood + 8);
  let delta = 5;
  const inter = npc.interests;
  for (let i = 0; i < choices.length; i++) {
    // 选项 0 = 贴心安排（命中兴趣 +7，否则 +3）；选项 1 = 随性（+2）
    if (choices[i] === 0) delta += inter.indexOf(spotTopic(spot, i)) >= 0 ? 7 : 3;
    else delta += 2;
  }
  st.rel += delta; clampRel(st); touch(st, G);
  st.dates += 1; G.stats.dates++;
  const text = spotData.lines.join(' ');
  logEvent(G, 'date', `你和${npc.name}在${spotData.name}约会，气氛很好。`);
  return { ok: true, delta, text };
}
function spotTopic(spot, i) {
  // 与地点场景绑定的话题，用于判定是否命中对方兴趣
  const map = { cafe: ['food', 'music'], park: ['travel', 'sports'], cinema: ['games', 'art'] };
  return map[spot][i];
}

// ---------- 表白 / 求婚 ----------
function canConfess(G, id) {
  const st = G.npcs[id];
  if (st.stage !== 'stranger') return { ok: false, reason: '你们已经是恋人了' };
  if (st.rel < 70) return { ok: false, reason: '好感不足 70' };
  if (st.dates < 3) return { ok: false, reason: `约会次数不足（${st.dates}/3）` };
  return { ok: true };
}
function confess(G, id, forcedRoll) {
  const npc = D().NPCS.find(n => n.id === id);
  const st = G.npcs[id];
  const p = 0.35 + st.rel / 250 + G.player.charm / 300;
  const roll = (forcedRoll !== undefined) ? forcedRoll : G.rng();
  if (roll < p) {
    st.stage = 'lover';
    st.rel = Math.min(100, st.rel + 5);
    logEvent(G, 'confess', `你向${npc.name}表白，TA 红着耳朵点了头。你们在一起了！`);
    return { ok: true, success: true, text: `「我也是。」${npc.name}低下头，轻轻牵住了你的手。` };
  }
  st.rel = Math.max(0, st.rel - 15);
  st.cooldownUntil = G.day + 7;
  logEvent(G, 'confessFail', `你向${npc.name}表白，TA 说再给点时间。`);
  return { ok: true, success: false, text: '「对不起……我们再相处看看吧。」气氛有点尴尬。' };
}
function canPropose(G, id) {
  const st = G.npcs[id];
  if (st.stage !== 'lover') return { ok: false, reason: '还不是恋人' };
  if (st.rel < 90) return { ok: false, reason: '好感不足 90' };
  if (G.player.ring < 1) return { ok: false, reason: '需要一枚戒指（商场有售 2000 元）' };
  return { ok: true };
}
function propose(G, id, forcedRoll) {
  const npc = D().NPCS.find(n => n.id === id);
  const st = G.npcs[id];
  const p = st.rel >= 95 ? 0.95 : 0.75;
  const roll = (forcedRoll !== undefined) ? forcedRoll : G.rng();
  if (roll < p) {
    G.player.ring = 0;
    st.stage = 'spouse'; st.rel = 100;
    G.spouseId = id; G.marriageDay = G.day;
    logEvent(G, 'wedding', `你和${npc.name}在亲友的祝福中结了婚。`);
    return { accepted: true, text: `「我愿意。」${npc.name}戴上了戒指，眼里有泪光。婚礼那天，全世界都在为你们发光。` };
  }
  logEvent(G, 'proposeFail', `你向${npc.name}求婚，TA 觉得还需要一点时间。`);
  return { accepted: false, text: '「我还没准备好……再等等我，好吗？」' };
}

// ---------- 生子 / 育儿 ----------
function tryBaby(G) {
  if (!G.spouseId) return { ok: false, reason: '先找个对象结婚吧' };
  if (G.child || G.pregnant) return { ok: false, reason: '已经有小家伙啦' };
  const st = G.npcs[G.spouseId];
  if (st.rel < 60) return { ok: false, reason: '最近感情有点冷淡，先升温一下' };
  if (G.player.money < 2000) return { ok: false, reason: '至少需要 2000 元养育基金' };
  G.pregnant = true;
  G.dueDay = G.day + PREGNANT_DAYS;
  logEvent(G, 'pregnant', '你们决定要一个孩子。');
  return { ok: true, text: '你们认真谈了谈，决定迎接一个新生命。' };
}
function deliverBaby(G, name) {
  const gender = G.rng() < 0.5 ? 'M' : 'F';
  const babyName = name || pickFrom(G.rng, BABY_NAMES);
  G.child = {
    name: babyName, gender, birthDay: G.day,
    stats: { int: 5, eq: 5, fit: 5, happy: 80 },
    flags: [], roundsDone: 0,
  };
  G.pregnant = false;
  logEvent(G, 'birth', `孩子出生了！小名${babyName}。`);
}
function childAgeYears(G) {
  if (!G.child) return -1;
  return Math.floor((G.day - G.child.birthDay) / YEAR_DAYS);
}
function checkMilestone(G) {
  if (!G.child) {
    if (G.day >= MAX_AGE_DAYS) return { type: 'ending' };
    return { type: null };
  }
  const age = childAgeYears(G);
  const c = G.child;
  if (c.roundsDone < D().CHILD_MILESTONE_AGES.length) {
    const next = D().CHILD_MILESTONE_AGES[c.roundsDone];
    if (age >= next) return { type: 'round', age: next };
    return { type: null };
  }
  if (age >= 18) return { type: 'ending' };
  return { type: null };
}
function applyParenting(G, actionIds) {
  const c = G.child;
  if (!c) return { ok: false, reason: '还没有孩子' };
  const acts = D().PARENTING_ACTIONS.filter(a => actionIds.indexOf(a.id) >= 0);
  if (acts.length === 0) return { ok: false, reason: '至少选择一项' };
  const totalCost = acts.reduce((s, a) => s + a.cost, 0);
  if (G.player.money < totalCost) return { ok: false, reason: '钱不够' };
  G.player.money -= totalCost;
  const notes = [];
  for (const a of acts) {
    if (a.fx.special === 'class') {
      const kind = pickFrom(G.rng, D().CLASS_KINDS);
      applyFx(c.stats, kind.fx);
      if (kind.flag && c.flags.indexOf(kind.flag) < 0) c.flags.push(kind.flag);
      notes.push(`报了${kind.name}，TA 学得起劲。`);
    } else {
      applyFx(c.stats, a.fx);
      notes.push(`${a.name}：${a.desc}。`);
    }
  }
  // 本年龄段随机事件
  const age = D().CHILD_MILESTONE_AGES[c.roundsDone];
  const ev = D().CHILD_EVENTS[age];
  let eventText = '';
  if (ev) {
    const roll = G.rng();
    const useA = roll < 0.55;
    const branch = useA ? ev.a : ev.b;
    eventText = branch.text;
    if (branch.fx) applyFx(c.stats, branch.fx);
    if (branch.fx && branch.fx.special === 'talent') {
      const t = pickFrom(G.rng, ['int', 'eq', 'fit']);
      c.stats[t] = Math.min(100, c.stats[t] + 8);
    }
    if (branch.cost) {
      if (G.player.money >= branch.cost) G.player.money -= branch.cost;
      else { c.stats.happy = Math.max(0, c.stats.happy - 3); eventText += '（手头紧，没能好好安置）'; }
    }
    if (age === 15 && !useA) G.player.mood = Math.max(10, G.player.mood - 10);
  }
  c.roundsDone += 1;
  logEvent(G, 'parenting', `孩子${age}岁：${notes.join('')}${eventText}`);
  return { ok: true, effects: notes, eventText, age };
}
function applyFx(stats, fx) {
  for (const k in fx) {
    if (k === 'special') continue;
    stats[k] = Math.max(0, Math.min(100, stats[k] + fx[k]));
  }
}

// ---------- 结局 ----------
function evaluateEnding(G) {
  const married = !!G.spouseId;
  const spouseRel = married ? G.npcs[G.spouseId].rel : 0;
  let childPath = null, childScore = 50;
  if (G.child) {
    const s = G.child.stats, f = G.child.flags;
    if (f.indexOf('art_talent') >= 0 && s.eq >= 65) childPath = 'artist';
    else if (s.fit >= 85) childPath = 'athlete';
    else if (s.int >= 75 && s.happy >= 50) childPath = 'starUni';
    else if (s.eq >= 80) childPath = 'leader';
    else if (s.int >= 60) childPath = 'uni';
    else if (s.happy >= 70) childPath = 'happyOrd';
    else childPath = 'lost';
    childScore = (s.int + s.eq + s.fit + s.happy) / 4;
  }
  const careerScore = (G.player.careerLevel / 4) * 100;
  const wealth = G.player.money >= 30000 ? 100 : G.player.money >= 10000 ? 70 : G.player.money >= 3000 ? 40 : 20;
  const score = Math.round(0.35 * childScore + 0.3 * (married ? spouseRel : 55) + 0.2 * careerScore + 0.15 * wealth);
  let title;
  if (!married) title = '自在人生';
  else if (score >= 80) title = '圆满人生';
  else if (score >= 60) title = '幸福家庭';
  else if (score >= 40) title = '平凡是真';
  else title = '有得有失';
  const lines = [];
  if (G.child) lines.push(`${G.child.name} 18 岁了。${D().CHILD_PATHS[childPath].line}`);
  if (married) lines.push(`你和爱人携手走过了这些年，感情依然温热。`);
  else lines.push('你把一个人的日子也过成了一首自由的歌。');
  return { title, score, childPath, childName: G.child ? G.child.name : null, lines };
}

// ---------- 工作 / 养成 ----------
function doWork(G, forcedRoll) {
  if (G.player.energy < 25) return { ok: false, reason: '累得敲不动键盘了（体力不足）' };
  G.player.energy -= 25;
  addMinutes(G, 240);
  G.player.careerDays += 1;
  const income = D().CAREERS[G.player.careerLevel].income;
  G.player.money += income;
  G.player.mood = Math.max(10, G.player.mood - 3);
  let leveledUp = false;
  if (canLevelUp(G)) {
    const roll = (forcedRoll !== undefined) ? forcedRoll : G.rng();
    if (roll < 0.9) {
      G.player.careerLevel += 1;
      leveledUp = true;
      logEvent(G, 'career', `你升职成了${D().CAREERS[G.player.careerLevel].title}！`);
    }
  }
  return { ok: true, income, leveledUp };
}
function canLevelUp(G) {
  const lv = G.player.careerLevel;
  return lv < D().CAREERS.length - 1 && G.player.careerDays >= (lv + 1) * 15 && G.player.talent >= (lv + 1) * 10;
}
function studyLibrary(G) {
  if (G.player.energy < 15) return { ok: false, reason: '看不进去书了（体力不足）' };
  G.player.energy -= 15;
  addMinutes(G, 120);
  G.player.talent = Math.min(100, G.player.talent + 2);
  G.player.mood = Math.min(100, G.player.mood + 2);
  return { ok: true, text: '你在书架间泡了一下午，感觉脑子清醒了不少。' };
}
function gymTrain(G) {
  if (G.player.energy < 20) return { ok: false, reason: '举不动了（体力不足）' };
  G.player.energy -= 20;
  addMinutes(G, 90);
  G.player.charm = Math.min(100, G.player.charm + 2);
  G.player.mood = Math.min(100, G.player.mood + 3);
  return { ok: true, text: '出了一身汗，整个人都精神了。' };
}
function eatFood(G, place) {
  if (place === 'cafe') {
    if (G.player.money < 50) return { ok: false, reason: '钱不够' };
    G.player.money -= 50;
    G.player.energy = Math.min(100, G.player.energy + 25);
    G.player.mood = Math.min(100, G.player.mood + 3);
    addMinutes(G, 30);
    return { ok: true, text: '一份简餐下肚，能量回升。' };
  }
  G.player.energy = Math.min(100, G.player.energy + 10);
  addMinutes(G, 15);
  return { ok: true, text: '在家随便吃了点，恢复了一点体力。' };
}

// ---------- Galgame 演出：表情与台词脚本 ----------
// 事件 → 立绘表情
function exprForEvent(type, ok) {
  switch (type) {
    case 'chat': return ok ? 'happy' : 'normal';
    case 'praise': return ok ? 'shy' : 'normal';
    case 'gift': return ok ? 'happy' : 'normal';
    case 'confess': return ok ? 'shy' : 'sad';
    case 'quarrel': return 'sad';
    default: return 'normal';
  }
}

// 操作结果 → 台词队列（打字机逐条播放）
function buildScript(kind, r, npcName) {
  const script = [];
  const rng = (typeof r !== 'undefined' && r && r._rng) ? r._rng : Math.random;
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  if (kind === 'greet') {
    const stage = r && r.stage ? r.stage : 'stranger';
    const lines = D().GREETINGS[stage] || D().GREETINGS.stranger;
    script.push({ speaker: npcName, expr: stage === 'crush' || stage === 'lover' || stage === 'spouse' ? 'happy' : 'normal', text: pick(lines) });
    return script;
  }
  if (!r) return script;
  if (kind === 'chat') {
    script.push({ speaker: npcName, expr: exprForEvent('chat', r.special), text: r.text });
    script.push({ speaker: npcName, expr: r.special ? 'happy' : 'normal', text: pick(r.special ? D().CHAT_REACT.hit : D().CHAT_REACT.miss) });
  } else if (kind === 'praise') {
    script.push({ speaker: npcName, expr: exprForEvent('praise', r.delta >= 4), text: r.text });
    if (r.delta >= 4) script.push({ speaker: npcName, expr: 'shy', text: pick(D().PRAISE_REACT.hit) });
  } else if (kind === 'gift') {
    script.push({ speaker: npcName, expr: exprForEvent('gift', r.delta >= 10), text: r.text });
    script.push({ speaker: npcName, expr: r.delta >= 10 ? 'happy' : 'normal', text: pick(r.delta >= 10 ? D().GIFT_REACT.hit : D().GIFT_REACT.miss) });
  }
  return script;
}

const core = {
  mulberry32, createGame, logEvent, fmtDate, addMinutes, doSleep,
  scheduleZone, candidates, relOf, stageOf, stageLabel,
  interactChat, interactPraise, buyGift, buyRing, giveGift,
  askDate, resolveDate, canConfess, confess, canPropose, propose,
  tryBaby, deliverBaby, childAgeYears, checkMilestone, applyParenting, evaluateEnding,
  doWork, canLevelUp, studyLibrary, gymTrain, eatFood,
  exprForEvent, buildScript,
  YEAR_DAYS, START_AGE, MAX_AGE_DAYS,
};

if (typeof module !== 'undefined' && module.exports) module.exports = core;
global.Core = core;
})(typeof window !== 'undefined' ? window : globalThis);
