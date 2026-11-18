// 《心动人生》核心规则引擎测试（Node 运行：node tests/core-tests.js）
const core = require('../js/core.js');
const { DATA } = require('../js/data.js');

let passed = 0, failed = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` 期望 ${b}，实际 ${a}`); }
function assertGt(a, b, msg) { if (!(a > b)) throw new Error((msg || '') + ` 期望 ${a} > ${b}`); }

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

// ---------- 基础 ----------
test('RNG 确定性：同种子同序列', () => {
  const r1 = core.mulberry32(42), r2 = core.mulberry32(42);
  for (let i = 0; i < 5; i++) assertEq(r1(), r2(), '序列不一致');
});

test('createGame 初始状态', () => {
  const G = core.createGame({ name: '阿明', gender: 'M', seed: 7 });
  assertEq(G.player.name, '阿明');
  assertEq(G.player.gender, 'M');
  assertEq(G.player.money, 3000);
  assertEq(G.player.energy, 100);
  assertEq(G.age, 22);
  assertEq(G.day, 0);
  assertEq(G.minutes, 480);
  assertEq(core.stageOf(G, 'linxiaoyu'), 'stranger');
});

test('日期换算：1年=36天，1月=3天', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 1 });
  const d0 = core.fmtDate(G);
  assertEq(d0.year, 1); assertEq(d0.month, 1); assertEq(d0.day, 1); assertEq(d0.weekday, '星期一');
  G.day = 35; const d1 = core.fmtDate(G);
  assertEq(d1.year, 1); assertEq(d1.month, 12); assertEq(d1.day, 3);
  G.day = 36; assertEq(core.fmtDate(G).year, 2);
  assertEq(core.fmtDate(G).age, 23);
});

// ---------- 时间 ----------
test('addMinutes 不跨天，深夜钳制在 23:00', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 1 });
  core.addMinutes(G, 900); // 8:00 + 15h = 23:00
  assertEq(G.day, 0); assertEq(G.minutes, 1380);
  core.addMinutes(G, 60);
  assertEq(G.day, 0); assertEq(G.minutes, 1380, '应钳制在1380');
  assert(G.needSleep === true, '应标记 needSleep');
});

test('doSleep 跨天并恢复体力', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 1 });
  G.player.energy = 30;
  const r = core.doSleep(G);
  assertEq(G.day, 1); assertEq(G.minutes, 480); assertEq(G.player.energy, 100);
  assert(Array.isArray(r.events), '返回事件数组');
});

// ---------- NPC 日程 ----------
test('scheduleZone：按时段返回所在区域，深夜离场', () => {
  const npc = DATA.NPCS.find(n => n.id === 'linxiaoyu');
  assertEq(core.scheduleZone(npc, 10), 'library');
  assertEq(core.scheduleZone(npc, 13), 'cafe');
  assertEq(core.scheduleZone(npc, 19), 'park');
  assert(core.scheduleZone(npc, 3) === null, '深夜应离场');
});

test('候选池按主角性别过滤异性', () => {
  const Gm = core.createGame({ name: 'm', gender: 'M', seed: 1 });
  const Gf = core.createGame({ name: 'f', gender: 'F', seed: 1 });
  const cm = core.candidates(Gm), cf = core.candidates(Gf);
  assert(cm.length >= 5 && cm.every(n => n.gender === 'F'), '男主要求女性候选');
  assert(cf.length >= 5 && cf.every(n => n.gender === 'M'), '女主要求男性候选');
});

// ---------- 好感与聊天 ----------
test('聊天：命中兴趣话题加成更高，重复话题衰减', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.player.mood = 70;
  const npc = DATA.NPCS.find(n => n.id === 'linxiaoyu'); // 兴趣: reading, music
  const r1 = core.interactChat(G, 'linxiaoyu', 'reading');
  const r2 = core.interactChat(G, 'linxiaoyu', 'weather');
  assertGt(r1.delta, r2.delta, '兴趣话题应加成更高');
  const r3 = core.interactChat(G, 'linxiaoyu', 'reading'); // 连续重复
  assert(r3.delta < r1.delta, '重复话题应衰减');
  assertEq(G.npcs.linxiaoyu.friendship, r1.delta + r2.delta + r3.delta, '友谊应累加');
});

test('心情低落时聊天效果减半', () => {
  const G1 = core.createGame({ name: 't', gender: 'M', seed: 3 });
  const G2 = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G1.player.mood = 80; G2.player.mood = 20;
  const d1 = core.interactChat(G1, 'linxiaoyu', 'reading').delta;
  const d2 = core.interactChat(G2, 'linxiaoyu', 'reading').delta;
  assert(d2 < d1, '低心情应削弱聊天');
});

test('送礼：命中偏好大幅提升并扣库存', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  core.buyGift(G, 'book'); core.buyGift(G, 'sweet');
  const moneyBefore = G.player.money;
  core.buyGift(G, 'sweet');
  assertEq(G.player.money, moneyBefore - DATA.GIFTS.sweet.price, '购买扣钱');
  const r = core.giveGift(G, 'linxiaoyu', 'book'); // 小雨偏好书籍
  assertGt(r.delta, 10, '偏好礼物应大幅提升');
  assertEq(G.player.inv.book, 0, '送礼后扣库存');
  const r2 = core.giveGift(G, 'linxiaoyu', 'sweet');
  assert(r2.delta < r.delta, '非偏好礼物效果差');
});

// ---------- 约会与表白 ----------
test('约会门槛与结算', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  assert(!core.askDate(G, 'linxiaoyu').ok, '好感不足不能约会');
  G.npcs.linxiaoyu.friendship = 50;
  assert(core.askDate(G, 'linxiaoyu').ok);
  G.player.money = 500;
  const r = core.resolveDate(G, 'linxiaoyu', 'cafe', [0, 1, 0]);
  assertEq(G.npcs.linxiaoyu.dates, 1, '约会次数+1');
  assert(typeof r.delta === 'number' && r.text.length > 0);
});

test('表白：门槛/成功转恋人/失败惩罚', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  assert(!core.canConfess(G, 'linxiaoyu').ok, '双轨不足不能表白');
  G.npcs.linxiaoyu.romance = 75; G.npcs.linxiaoyu.friendship = 55; G.npcs.linxiaoyu.dates = 3;
  assert(core.canConfess(G, 'linxiaoyu').ok);
  const ok = core.confess(G, 'linxiaoyu', 0.01); // 强制成功
  assert(ok.success && core.stageOf(G, 'linxiaoyu') === 'lover', '成功后应为恋人');
  const G2 = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G2.npcs.linxiaoyu.romance = 75; G2.npcs.linxiaoyu.friendship = 55; G2.npcs.linxiaoyu.dates = 3;
  const fail = core.confess(G2, 'linxiaoyu', 0.99); // 强制失败
  assert(!fail.success && G2.npcs.linxiaoyu.romance < 75, '失败应扣浪漫');
});

// ---------- 求婚与婚姻 ----------
test('求婚：需恋人+戒指，成功后成婚', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.npcs.linxiaoyu.romance = 95; G.npcs.linxiaoyu.friendship = 70; G.npcs.linxiaoyu.stage = 'lover';
  assert(!core.canPropose(G, 'linxiaoyu').ok, '没有戒指不能求婚');
  core.buyRing(G);
  assertEq(G.player.ring, 1);
  assert(core.canPropose(G, 'linxiaoyu').ok);
  const r = core.propose(G, 'linxiaoyu', 0.01);
  assert(r.accepted, '高好感求婚应成功');
  assertEq(G.spouseId, 'linxiaoyu');
  assertEq(core.stageOf(G, 'linxiaoyu'), 'spouse');
  assert(G.eventLog.some(e => e.type === 'wedding'), '应有婚礼事件');
});

test('低好感求婚被拒', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.npcs.linxiaoyu.romance = 60; G.npcs.linxiaoyu.friendship = 70; G.npcs.linxiaoyu.stage = 'lover';
  core.buyRing(G);
  const r = core.propose(G, 'linxiaoyu', 0.99);
  assert(!r.accepted && G.spouseId === null);
});

// ---------- 生子与育儿 ----------
test('怀孕与分娩时点（孕期27天）', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.spouseId = 'linxiaoyu'; G.npcs.linxiaoyu.stage = 'spouse'; G.npcs.linxiaoyu.romance = 80;
  G.player.money = 5000;
  const r = core.tryBaby(G);
  assert(r.ok && G.pregnant === true && G.dueDay === G.day + 27);
  let guard = 0;
  while (!G.child && guard++ < 40) core.doSleep(G);
  assert(G.child, '到期应分娩');
  assertEq(G.child.birthDay, 27);
  assertEq(core.childAgeYears(G), 0);
});

test('育儿回合：动作生效、消耗金钱、里程碑推进', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.child = { name: '豆豆', gender: 'M', birthDay: 0, stats: { int: 5, eq: 5, fit: 5, happy: 80 }, flags: [], roundsDone: 0 };
  G.day = 36; // 1岁
  const m = core.checkMilestone(G);
  assertEq(m.type, 'round'); assertEq(m.age, 1);
  G.player.money = 3000;
  const r = core.applyParenting(G, ['read', 'play']);
  assertEq(G.child.roundsDone, 1);
  assert(G.child.stats.int > 5, '亲子阅读应加智力');
  assert(G.child.stats.happy > 80, '玩耍应加快乐');
  assert(G.player.money < 3000, '育儿应花钱');
  assert(typeof r.eventText === 'string' && r.eventText.length > 0, '应有回合事件');
  const m2 = core.checkMilestone(G);
  assertEq(m2.type, null, '同一年龄不重复触发');
});

test('18岁触发结局', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.child = { name: '豆豆', gender: 'M', birthDay: 0, stats: { int: 5, eq: 5, fit: 5, happy: 80 }, flags: [], roundsDone: 6 };
  G.day = 18 * 36;
  const m = core.checkMilestone(G);
  assertEq(m.type, 'ending');
});

test('结局分级：艺术家/运动员/名校与总评', () => {
  const mk = (stats, flags, spouseRel, married) => {
    const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
    G.child = { name: '豆豆', gender: 'M', birthDay: 0, stats, flags, roundsDone: 6 };
    if (married) { G.spouseId = 'linxiaoyu'; G.npcs.linxiaoyu.stage = 'spouse'; G.npcs.linxiaoyu.romance = spouseRel; }
    G.player.careerLevel = 3; G.player.money = 20000; G.player.mood = 80;
    return G;
  };
  const artist = core.evaluateEnding(mk({ int: 50, eq: 80, fit: 30, happy: 80 }, ['art_talent'], 90, true));
  assertEq(artist.childPath, 'artist');
  const athlete = core.evaluateEnding(mk({ int: 40, eq: 60, fit: 90, happy: 70 }, [], 80, true));
  assertEq(athlete.childPath, 'athlete');
  const star = core.evaluateEnding(mk({ int: 80, eq: 60, fit: 50, happy: 60 }, [], 80, true));
  assertEq(star.childPath, 'starUni');
  const single = core.evaluateEnding(mk({ int: 50, eq: 50, fit: 50, happy: 70 }, [], 0, false));
  assertEq(single.title, '自在人生');
  const perfect = core.evaluateEnding(mk({ int: 80, eq: 80, fit: 70, happy: 90 }, ['art_talent'], 95, true));
  assertGt(perfect.score, 80);
  assert(['圆满人生', '幸福家庭'].includes(perfect.title), '高分应有高评价');
});

// ---------- 工作与养成 ----------
test('工作收入随职级提升，可晋升', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  const r = core.doWork(G);
  assertEq(r.income, DATA.CAREERS[0].income);
  assertEq(G.player.careerDays, 1);
  G.player.careerDays = 20; G.player.talent = 30;
  assert(core.canLevelUp(G), '满足条件可晋升');
  const r2 = core.doWork(G, 0.01); // 强制晋升
  assert(r2.leveledUp && G.player.careerLevel === 1);
});

test('图书馆学习与健身房锻炼', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  const t0 = G.player.talent, c0 = G.player.charm;
  core.studyLibrary(G); core.gymTrain(G);
  assert(G.player.talent > t0 && G.player.charm > c0);
});

test('好感衰减与夫妻矛盾', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.npcs.linxiaoyu.friendship = 80; G.npcs.linxiaoyu.romance = 80; G.npcs.linxiaoyu.lastInteractDay = 0; G.day = 0;
  core.doSleep(G); core.doSleep(G); core.doSleep(G); core.doSleep(G);
  assert(G.npcs.linxiaoyu.romance < 80 && G.npcs.linxiaoyu.friendship < 80, '3天不联系应衰减');
  const G2 = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G2.spouseId = 'linxiaoyu'; G2.npcs.linxiaoyu.stage = 'spouse'; G2.npcs.linxiaoyu.romance = 35;
  const r = core.doSleep(G2);
  assert(r.events.some(e => e.type === 'quarrel'), '配偶好感过低应有矛盾事件');
});

test('体力不足时动作被拦截', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.player.energy = 2;
  const r = core.interactChat(G, 'linxiaoyu', 'weather');
  assert(!r.ok, '体力不足应失败');
});

// ---------- Galgame 演出层 ----------
test('台词库：话题台词每条≥3句', () => {
  for (const k in DATA.TOPICS) {
    assert(DATA.TOPICS[k].neutral.length >= 3, `话题 ${k} 台词不足3条`);
    assert(DATA.TOPICS[k].name.length > 0, `话题 ${k} 缺名称`);
  }
});

test('台词库：兴趣专属台词覆盖所有 NPC 兴趣', () => {
  const used = new Set();
  for (const n of DATA.NPCS) for (const i of n.interests) used.add(i);
  for (const t of used) {
    assert(DATA.INTEREST_LINES[t] && DATA.INTEREST_LINES[t].length >= 2, `兴趣 ${t} 缺专属台词`);
  }
});

test('台词库：阶段问候覆盖 7 个关系阶段', () => {
  const stages = ['stranger', 'acquaintance', 'friend', 'crush', 'closeFriend', 'lover', 'spouse'];
  for (const s of stages) {
    assert(Array.isArray(DATA.GREETINGS[s]) && DATA.GREETINGS[s].length >= 2, `阶段 ${s} 缺问候台词`);
  }
});

test('表情映射：事件到立绘表情', () => {
  assertEq(core.exprForEvent('chat', true), 'happy');
  assertEq(core.exprForEvent('chat', false), 'normal');
  assertEq(core.exprForEvent('praise', true), 'shy');
  assertEq(core.exprForEvent('gift', true), 'happy');
  assertEq(core.exprForEvent('gift', false), 'normal');
  assertEq(core.exprForEvent('confess', true), 'shy');
  assertEq(core.exprForEvent('confess', false), 'sad');
  assertEq(core.exprForEvent('quarrel', false), 'sad');
  assertEq(core.exprForEvent('other', true), 'normal');
});

test('对话脚本构建：聊天结果转台词序列', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.player.mood = 70;
  const r = core.interactChat(G, 'linxiaoyu', 'reading');
  const script = core.buildScript('chat', r, '林小雨');
  assert(Array.isArray(script) && script.length >= 2, '应至少2条台词');
  assert(script[0].speaker === '林小雨', '说话人应为NPC');
  assert(script[0].expr === 'happy', '兴趣命中应为开心表情');
  assert(script.every(s => typeof s.text === 'string' && s.text.length > 0), '台词非空');
});

// ---------- Sims 逆向：需求 / 双轨关系 / 情绪 / 特质 ----------
test('需求随时间衰减，特质修正衰减速率', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.player.needs.hunger = 80;
  core.decayNeeds(G, 120); // 2 小时
  assert(G.player.needs.hunger < 80, '饥饿应衰减');
  const G2 = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G2.player.needs.hunger = 80; G2.player.traits = ['foodie'];
  core.decayNeeds(G2, 120);
  assert(G2.player.needs.hunger < G.player.needs.hunger, '美食家饥饿应衰减更快');
});

test('饥饿归零触发强制事件', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.player.needs.hunger = 2;
  core.decayNeeds(G, 600);
  assert(G.player.needs.hunger > 5, '应被强制进食事件拉回');
  assert(G.player.mood < 70, '挨饿应扣心情');
});

test('情绪由需求派生', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  assertEq(core.moodOf(G).id, 'fine');
  G.player.needs.social = 10;
  assertEq(core.moodOf(G).id, 'lonely');
  G.player.needs.hunger = 10;
  assertEq(core.moodOf(G).id, 'starving');
});

test('双轨关系：聊天涨友谊、浪漫互动涨浪漫且受友谊加成', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.player.mood = 70;
  const r1 = core.interactChat(G, 'linxiaoyu', 'reading');
  assert(r1.delta > 0 && G.npcs.linxiaoyu.friendship > 0, '聊天应加友谊');
  assertEq(G.npcs.linxiaoyu.romance, 0, '聊天不应直接加浪漫');
  const rom1 = core.doRomantic(G, 'linxiaoyu', 'gaze');
  assert(rom1.delta >= 6 && G.npcs.linxiaoyu.romance >= 6, '深情对望应加浪漫');
  const G2 = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G2.player.mood = 70; G2.npcs.linxiaoyu.friendship = 70;
  const rom2 = core.doRomantic(G2, 'linxiaoyu', 'gaze');
  assert(rom2.delta > rom1.delta, '高友谊应加成浪漫互动');
});

test('牵手需要浪漫门槛，调情受调情情绪加成', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.player.mood = 70;
  const no = core.doRomantic(G, 'linxiaoyu', 'holdhands');
  assert(!no.ok, '浪漫不足不能牵手');
  G.npcs.linxiaoyu.romance = 50;
  const yes = core.doRomantic(G, 'linxiaoyu', 'holdhands');
  assert(yes.ok && yes.delta >= 8, '牵手应成功且加成明显');
  G.player.flirtyT = 5;
  const fl = core.doRomantic(G, 'linxiaoyu', 'flirt');
  assert(fl.ok && fl.delta >= 5, '调情应生效');
});

test('表白需双轨门槛', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.npcs.linxiaoyu.romance = 75; G.npcs.linxiaoyu.friendship = 30; G.npcs.linxiaoyu.dates = 3;
  assert(!core.canConfess(G, 'linxiaoyu').ok, '友谊不足不能表白');
  G.npcs.linxiaoyu.friendship = 50;
  assert(core.canConfess(G, 'linxiaoyu').ok, '双轨满足应可表白');
});

test('阶段由浪漫轨驱动', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.npcs.linxiaoyu.romance = 50;
  assertEq(core.stageOf(G, 'linxiaoyu'), 'friend');
  G.npcs.linxiaoyu.romance = 85;
  assertEq(core.stageOf(G, 'linxiaoyu'), 'closeFriend');
});

test('特质影响互动与情绪（浪漫主义者）', () => {
  const G = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G.player.mood = 70; G.player.traits = ['romantic'];
  const r = core.doRomantic(G, 'linxiaoyu', 'gaze');
  const G2 = core.createGame({ name: 't', gender: 'M', seed: 3 });
  G2.player.mood = 70;
  const r2 = core.doRomantic(G2, 'linxiaoyu', 'gaze');
  assert(r.delta > r2.delta, '浪漫主义者浪漫互动更强');
});

// ---------- 汇总 ----------
console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
