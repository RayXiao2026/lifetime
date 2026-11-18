// 《心动人生》数据层：NPC / 地图 / 区域 / 礼物 / 话题 / 育儿 / 职业
// 纯数据与纯函数，不依赖 DOM，可被 Node 加载。
(function (global) {
'use strict';

// ---------- 地图 ----------
// 32x32 网格。0=空地, 1..8=墙体贴图编号
const MAP_W = 32, MAP_H = 32;
const MAP = [];
for (let y = 0; y < MAP_H; y++) { MAP.push(new Array(MAP_W).fill(0)); }

function carveBuilding(x, y, w, h, tex, doorSide, doorPos) {
  // 外墙一圈
  for (let i = 0; i < w; i++) { MAP[y][x + i] = tex; MAP[y + h - 1][x + i] = tex; }
  for (let j = 0; j < h; j++) { MAP[y + j][x] = tex; MAP[y + j][x + w - 1] = tex; }
  // 门：在指定边上开 2 格缺口
  const d = doorPos;
  if (doorSide === 'S') { MAP[y + h - 1][d] = 0; MAP[y + h - 1][d + 1] = 0; }
  if (doorSide === 'N') { MAP[y][d] = 0; MAP[y][d + 1] = 0; }
}
// 边界
for (let x = 0; x < MAP_W; x++) { MAP[0][x] = 1; MAP[MAP_H - 1][x] = 1; }
for (let y = 0; y < MAP_H; y++) { MAP[y][0] = 1; MAP[y][MAP_W - 1] = 1; }
// 建筑：家/公司/图书馆（北带），咖啡厅/健身房/商场（中带），医院（南带）
carveBuilding(2, 2, 7, 7, 2, 'S', 5);      // 家 x2-8,y2-8
carveBuilding(11, 2, 7, 7, 3, 'S', 14);    // 公司 x11-17,y2-8
carveBuilding(20, 2, 10, 7, 4, 'S', 24);   // 图书馆 x20-29,y2-8
carveBuilding(2, 12, 7, 6, 5, 'N', 5);     // 咖啡厅 x2-8,y12-17
carveBuilding(11, 12, 7, 6, 7, 'N', 14);   // 健身房 x11-17,y12-17
carveBuilding(22, 12, 8, 6, 6, 'N', 25);   // 商场 x22-29,y12-17
carveBuilding(20, 23, 10, 7, 8, 'N', 24);  // 医院 x20-29,y23-29

// ---------- 区域 ----------
const ZONES = [
  { id: 'home',     name: '家 · 温馨公寓',  rect: { x: 2, y: 2, w: 7, h: 7 }, color: '#e8a87c' },
  { id: 'company',  name: '启明科技 · 公司', rect: { x: 11, y: 2, w: 7, h: 7 }, color: '#7ca6e8' },
  { id: 'library',  name: '城南图书馆',      rect: { x: 20, y: 2, w: 10, h: 7 }, color: '#a48be8' },
  { id: 'cafe',     name: '晴天咖啡厅',      rect: { x: 2, y: 12, w: 7, h: 6 }, color: '#e87c8f' },
  { id: 'gym',      name: '铁盒健身房',      rect: { x: 11, y: 12, w: 7, h: 6 }, color: '#8fe87c' },
  { id: 'mall',     name: '中央商场',        rect: { x: 22, y: 12, w: 8, h: 6 }, color: '#e8d07c' },
  { id: 'plaza',    name: '中央广场',        rect: { x: 2, y: 18, w: 28, h: 3 }, color: '#c9c9c9' },
  { id: 'park',     name: '滨河公园',        rect: { x: 2, y: 22, w: 15, h: 9 }, color: '#7ce8b5' },
  { id: 'hospital', name: '仁心医院',        rect: { x: 20, y: 23, w: 10, h: 7 }, color: '#e8e8e8' },
];
function zoneAt(x, y) {
  for (let i = 0; i < ZONES.length; i++) {
    const r = ZONES[i].rect;
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      // 排除建筑外墙外的误判：home/company 等直接命中即可（含墙内）
      return ZONES[i];
    }
  }
  return null;
}

// ---------- 道具（可交互站点） ----------
const PROPS = [
  { type: 'bed',     x: 5.5,  y: 4.5,  blocking: true,  label: '床' },
  { type: 'desk',    x: 14.5, y: 4.5,  blocking: true,  label: '工位' },
  { type: 'shelf',   x: 24.5, y: 4.5,  blocking: true,  label: '书架' },
  { type: 'counter', x: 4.5,  y: 14.5, blocking: true,  label: '咖啡柜台' },
  { type: 'equip',   x: 14.5, y: 14.5, blocking: true,  label: '健身器材' },
  { type: 'counter2', x: 25.5, y: 14.5, blocking: true, label: '商场柜台' },
  { type: 'hdesk',   x: 24.5, y: 25.5, blocking: true,  label: '挂号处' },
  { type: 'fountain', x: 15.5, y: 19.5, blocking: true, label: '喷泉' },
  // 树
  { type: 'tree', x: 4.5, y: 24.5, blocking: true }, { type: 'tree', x: 8.5, y: 26.5, blocking: true },
  { type: 'tree', x: 12.5, y: 24.5, blocking: true }, { type: 'tree', x: 14.5, y: 28.5, blocking: true },
  { type: 'tree', x: 5.5, y: 29.5, blocking: true }, { type: 'tree', x: 10.5, y: 30.2, blocking: true },
  { type: 'tree', x: 3.5, y: 19.8, blocking: false }, { type: 'tree', x: 28.5, y: 19.8, blocking: false },
  // 长椅
  { type: 'bench', x: 9.5, y: 10.8, blocking: true }, { type: 'bench', x: 21.5, y: 10.8, blocking: true },
  { type: 'bench', x: 15.5, y: 25.5, blocking: true }, { type: 'bench', x: 7.5, y: 22.5, blocking: true },
  // 路灯
  { type: 'lamp', x: 9.5, y: 11.8, blocking: false }, { type: 'lamp', x: 21.5, y: 11.8, blocking: false },
  { type: 'lamp', x: 9.5, y: 21.8, blocking: false }, { type: 'lamp', x: 21.5, y: 21.8, blocking: false },
  { type: 'lamp', x: 15.5, y: 20.8, blocking: false }, { type: 'lamp', x: 15.5, y: 10.2, blocking: false },
];

// ---------- NPC ----------
// schedule: [{from,to,zone}] 小时区间，zone 为 null 表示离场回家
const NPCS = [
  // ===== 女性候选（主角为男性时） =====
  { id: 'linxiaoyu', name: '林小雨', gender: 'F', role: 'romance', job: '图书馆管理员',
    traits: ['文静', '细心'], interests: ['reading', 'music'], giftPref: 'book',
    style: { hair: '#2b2b3a', hairStyle: 'long', skin: '#f2c9a0', top: '#ffffff', bottom: '#4a6fa5' },
    schedule: [{ from: 8, to: 12, zone: 'library' }, { from: 12, to: 14, zone: 'cafe' }, { from: 14, to: 18, zone: 'library' }, { from: 18, to: 20, zone: 'park' }] },
  { id: 'suqingqing', name: '苏晴晴', gender: 'F', role: 'romance', job: '咖啡师',
    traits: ['活泼', '自来熟'], interests: ['food', 'travel'], giftPref: 'sweet',
    style: { hair: '#8a5a2b', hairStyle: 'short', skin: '#f5d0aa', top: '#f7d774', bottom: '#e8a87c' },
    schedule: [{ from: 8, to: 12, zone: 'cafe' }, { from: 12, to: 14, zone: 'park' }, { from: 14, to: 20, zone: 'cafe' }] },
  { id: 'shenzhiyi', name: '沈知意', gender: 'F', role: 'romance', job: '自由插画师',
    traits: ['文艺', '慢热'], interests: ['art', 'music'], giftPref: 'flower',
    style: { hair: '#6a4a8a', hairStyle: 'long', skin: '#f0d5b8', top: '#b8a9c9', bottom: '#5d5d6e' },
    schedule: [{ from: 10, to: 12, zone: 'cafe' }, { from: 12, to: 18, zone: 'library' }, { from: 18, to: 21, zone: 'park' }] },
  { id: 'luke', name: '陆可', gender: 'F', role: 'romance', job: '健身教练',
    traits: ['飒爽', '直率'], interests: ['sports', 'travel'], giftPref: 'sportgear',
    style: { hair: '#3a3a3a', hairStyle: 'ponytail', skin: '#e8b98a', top: '#e05c5c', bottom: '#3a3a3a' },
    schedule: [{ from: 8, to: 12, zone: 'gym' }, { from: 12, to: 14, zone: 'cafe' }, { from: 14, to: 20, zone: 'gym' }] },
  { id: 'wenyan', name: '温言', gender: 'F', role: 'romance', job: '小学老师',
    traits: ['温柔', '耐心'], interests: ['reading', 'food'], giftPref: 'book',
    style: { hair: '#9a6a3a', hairStyle: 'bob', skin: '#f5d8bb', top: '#f2e8d5', bottom: '#c9a86a' },
    schedule: [{ from: 12, to: 13, zone: 'cafe' }, { from: 13, to: 17, zone: 'park' }, { from: 17, to: 21, zone: 'library' }] },
  { id: 'hanshuang', name: '韩霜', gender: 'F', role: 'romance', job: '律师',
    traits: ['理性', '毒舌'], interests: ['games', 'reading'], giftPref: 'digital',
    style: { hair: '#c9c9d5', hairStyle: 'short', skin: '#f2dcc5', top: '#2b2b3a', bottom: '#2b2b3a' },
    schedule: [{ from: 12, to: 14, zone: 'cafe' }, { from: 18, to: 21, zone: 'gym' }] },
  // ===== 男性候选（主角为女性时） =====
  { id: 'chenmo', name: '陈默', gender: 'M', role: 'romance', job: '程序员',
    traits: ['内敛', '可靠'], interests: ['games', 'reading'], giftPref: 'gamemerch',
    style: { hair: '#1f1f2b', hairStyle: 'short', skin: '#eecfa8', top: '#5d7fb5', bottom: '#333344' },
    schedule: [{ from: 14, to: 17, zone: 'cafe' }, { from: 17, to: 21, zone: 'gym' }] },
  { id: 'jiangye', name: '江野', gender: 'M', role: 'romance', job: '摄影师',
    traits: ['文艺', '洒脱'], interests: ['travel', 'art'], giftPref: 'digital',
    style: { hair: '#4a3a2b', hairStyle: 'short', skin: '#e8c193', top: '#7a9e7e', bottom: '#5d5d4a' },
    schedule: [{ from: 8, to: 10, zone: 'park' }, { from: 16, to: 19, zone: 'park' }, { from: 19, to: 21, zone: 'cafe' }] },
  { id: 'fangyu', name: '方屿', gender: 'M', role: 'romance', job: '西餐厨师',
    traits: ['开朗', '热心'], interests: ['food', 'sports'], giftPref: 'sweet',
    style: { hair: '#2b2b2b', hairStyle: 'short', skin: '#e8b98a', top: '#ffffff', bottom: '#444444' },
    schedule: [{ from: 14, to: 17, zone: 'park' }, { from: 17, to: 21, zone: 'cafe' }] },
  { id: 'xuyan', name: '许晏', gender: 'M', role: 'romance', job: '医生',
    traits: ['温柔', '稳重'], interests: ['reading', 'sports'], giftPref: 'book',
    style: { hair: '#3a3a44', hairStyle: 'short', skin: '#f2d5b8', top: '#d5e8f2', bottom: '#4a6a8a' },
    schedule: [{ from: 16, to: 18, zone: 'gym' }, { from: 18, to: 21, zone: 'library' }] },
  { id: 'qinlang', name: '秦朗', gender: 'M', role: 'romance', job: '创业者',
    traits: ['自信', '张扬'], interests: ['travel', 'sports'], giftPref: 'digital',
    style: { hair: '#5d3a2b', hairStyle: 'short', skin: '#eecfa8', top: '#2b2b3a', bottom: '#8a6a4a' },
    schedule: [{ from: 8, to: 11, zone: 'cafe' }, { from: 18, to: 21, zone: 'park' }] },
  { id: 'guyifan', name: '顾一帆', gender: 'M', role: 'romance', job: '街头吉他手',
    traits: ['浪漫', '随性'], interests: ['music', 'art'], giftPref: 'digital',
    style: { hair: '#7a2b3a', hairStyle: 'long', skin: '#f0d0b0', top: '#3a5d4a', bottom: '#2b2b2b' },
    schedule: [{ from: 10, to: 12, zone: 'park' }, { from: 16, to: 21, zone: 'park' }] },
  // ===== 好友 NPC =====
  { id: 'laowang', name: '老王', gender: 'M', role: 'friend', job: '退休大爷',
    traits: ['健谈'], interests: ['weather', 'food'], giftPref: 'sweet',
    style: { hair: '#d5d5d5', hairStyle: 'short', skin: '#e8c8a5', top: '#8a8a7a', bottom: '#5d5d5d' },
    schedule: [{ from: 8, to: 17, zone: 'park' }] },
  { id: 'lijie', name: '李姐', gender: 'F', role: 'friend', job: '热心邻居',
    traits: ['八卦'], interests: ['food', 'weather'], giftPref: 'flower',
    style: { hair: '#6a3a2b', hairStyle: 'bob', skin: '#f2c9a0', top: '#d5748a', bottom: '#7a5d8a' },
    schedule: [{ from: 9, to: 14, zone: 'cafe' }, { from: 14, to: 17, zone: 'park' }] },
  { id: 'xiaobei', name: '小北', gender: 'M', role: 'friend', job: '发小',
    traits: ['损友'], interests: ['games', 'sports'], giftPref: 'gamemerch',
    style: { hair: '#2b2b2b', hairStyle: 'cap', skin: '#e8c193', top: '#f2a03a', bottom: '#3a5d8a' },
    schedule: [{ from: 12, to: 14, zone: 'cafe' }, { from: 17, to: 21, zone: 'park' }] },
  { id: 'drzhang', name: '张医生', gender: 'M', role: 'friend', job: '医生',
    traits: ['严肃'], interests: ['reading', 'work'], giftPref: 'book',
    style: { hair: '#3a3a3a', hairStyle: 'short', skin: '#f2d5b8', top: '#ffffff', bottom: '#4a8ad5' },
    schedule: [{ from: 8, to: 20, zone: 'hospital' }] },
];

// ---------- 话题 ----------
const TOPICS = {
  weather: { name: '聊聊天气', neutral: ['今天天气真不错，适合出来走走。', '听说最近要降温了，记得添衣服。', '这种天气最适合发呆了。', '风轻轻的，心情也跟着变好了。'] },
  work:    { name: '聊聊工作', neutral: ['最近工作有点忙，你呢？', '我们公司最近在赶项目，头都大了。', '工作嘛，就是为了生活。', '要是能早点下班就好了，唉。'] },
  food:    { name: '聊聊美食', neutral: ['这附近有什么好吃的推荐吗？', '我最近迷上自己做菜了。', '人是铁饭是钢，一顿不吃饿得慌。', '心情不好的时候，就想吃点热乎的。'] },
  music:   { name: '聊聊音乐', neutral: ['你平时听什么歌？', '最近有首歌挺火的，你听过吗？', '音乐真是好东西，怎么听都不腻。', '戴上耳机的瞬间，世界都安静了。'] },
  sports:  { name: '聊聊运动', neutral: ['你平时运动吗？', '生命在于运动啊。', '最近想找个球友，你有兴趣吗？', '出一身汗，什么烦恼都没了。'] },
  reading: { name: '聊聊读书', neutral: ['最近在看什么书？', '图书馆新到了一批书，改天去看看。', '看书能让人静下心来。', '有一本好书相伴，一下午很快就过去了。'] },
  travel:  { name: '聊聊旅行', neutral: ['如果放假，你最想去哪玩？', '旅行最开心的就是路上遇到的风景。', '世界那么大，真想都去看看。', '说走就走的旅行，想想就很浪漫。'] },
  games:   { name: '聊聊游戏', neutral: ['你玩游戏吗？', '最近新出的那款游戏你试过没？', '偶尔打打游戏放松一下挺好的。', '游戏里输了可以重来，现实可不行，哈哈。'] },
  art:     { name: '聊聊画画', neutral: ['你懂艺术吗？我完全外行。', '公园里有人写生，画得真好。', '艺术这东西，看着就让人觉得美好。', '晚霞有时候比画还好看。'] },
};
// 命中兴趣时的专属回应
const INTEREST_LINES = {
  weather: ['你也喜欢看云吗？我常常一个人看很久。', '下雨天的时候，我就爱听雨声发呆。'],
  work: ['认真聊工作的人，反而显得很真诚。', '其实我对待喜欢的事，也像对待工作一样认真。'],
  food: ['这家店的提拉米苏是我的心头好，你尝过吗？', '说起吃的我就停不下来，哈哈。'],
  music: ['你也喜欢音乐？我歌单里全是老歌。', '下次给你推荐几首我循环了整个月的歌。'],
  sports: ['运动的人身上有种让人安心的力量感。', '周末要不要一起去打球？'],
  reading: ['这本书我看过！没想到你也在读。', '读书的人，眼神里都带着光。'],
  travel: ['我去过好多地方，最难忘的是海边的那次日出。', '和你聊旅行，感觉世界都变大了。'],
  games: ['你也打游戏？开黑吗？我可不菜！', '游戏是第九艺术，这话我认可。'],
  art: ['你也在意这些细节吗？大多数人都不抬头看晚霞的。', '画画的人看世界的方式不一样。'],
};
// 聊天后的第二反应台词（按是否命中兴趣）
const CHAT_REACT = {
  hit: ['（TA 的眼睛亮了一下，话匣子一下子打开了。）', '（聊到兴头上，TA 不自觉地向你靠近了半步。）', '（TA 笑着说了很多，时间过得飞快。）'],
  miss: ['（TA 礼貌地回应着，气氛还算融洽。）', '（话题平平，但 TA 并没有不耐烦。）', '（你们有一搭没一搭地聊着，也不算尴尬。）'],
};
// 夸赞反应
const PRAISE_REACT = {
  hit: ['「……你、你突然这么说，我会不好意思的啦。」', '「第一次有人这么夸我……谢谢。」'],
  miss: ['（TA 干笑了两声，把话题岔开了。）'],
};
// 送礼反应
const GIFT_REACT = {
  hit: ['（TA 把礼物小心翼翼地抱在怀里，像捧着什么宝贝。）'],
  miss: ['（TA 客气地道了谢，把礼物收进了包里。）'],
};
// 阶段问候台词（见面第一句）
const GREETINGS = {
  stranger:   ['……你好？我们认识吗？', '（TA 打量了你一眼，微微点头。）'],
  acquaintance: ['啊，是你呀，又见面了。', '今天也出来走走吗？'],
  friend:    ['嘿，正好碰到你！', '来得正好，陪我聊会儿天呗。'],
  crush:     ['……你来了。我刚才还在想，会不会遇到你。', '看到你，今天运气好像不错。'],
  closeFriend: ['我就知道这个点能等到你。', '今天想我了吗？——开玩笑的，哈哈。'],
  lover:     ['你终于来啦，我好想你。', '牵着我的手，慢慢走吧。'],
  spouse:    ['回来啦？饭在锅里，我在等你。', '辛苦了一天吧，先坐下歇会儿。'],
};
const PRAISE_LINES = [
  '你今天看起来状态很好啊。', '你笑起来的时候，感觉周围都亮了。',
  '跟你聊天真的很开心。', '你身上有种让人想靠近的气质。',
];
const CHAT_TIRED = '（对方似乎有点累了，改天再聊吧。）';

// ---------- 礼物 ----------
const GIFTS = {
  book:      { name: '精装书',   price: 60,  desc: '沉甸甸的知识' },
  sweet:     { name: '手工甜品', price: 45,  desc: '甜甜的心意' },
  flower:    { name: '花束',     price: 50,  desc: '经典永不过时' },
  sportgear: { name: '运动装备', price: 120, desc: '挥洒汗水的伙伴' },
  digital:   { name: '数码好物', price: 200, desc: '科技改变生活' },
  gamemerch: { name: '游戏周边', price: 90,  desc: '信仰充值' },
};
const RING_PRICE = 2000;

// ---------- 职业 ----------
const CAREERS = [
  { title: '实习生', income: 600 },
  { title: '职员',   income: 900 },
  { title: '资深',   income: 1300 },
  { title: '主管',   income: 2000 },
  { title: '总监',   income: 3200 },
];

// ---------- 约会 ----------
const DATE_SPOTS = {
  cafe:   { name: '晴天咖啡厅', cost: 200, lines: ['点了两杯拿铁，你们聊起了最近的日常。', '窗外的阳光正好，气氛刚刚好。', '临走时，TA 说下次还想来。'] },
  park:   { name: '滨河公园',   cost: 100, lines: ['你们沿着河岸慢慢走，聊了很多。', 'TA 捡起一片叶子夹进了包里。', '夕阳把两个人的影子拉得很长。'] },
  cinema: { name: '中央商场影城', cost: 300, lines: ['电影很精彩，TA 看得目不转睛。', '散场后你们还在讨论剧情。', '爆米花甜甜的，就像今天的心情。'] },
};

// ---------- 育儿 ----------
const PARENTING_ACTIONS = [
  { id: 'read',  name: '亲子阅读', cost: 300,  desc: '智力+6',      fx: { int: 6 } },
  { id: 'sport', name: '户外运动', cost: 200,  desc: '体质+6',      fx: { fit: 6 } },
  { id: 'talk',  name: '深夜谈心', cost: 0,    desc: '情商+6 快乐+3', fx: { eq: 6, happy: 3 } },
  { id: 'play',  name: '陪TA玩耍', cost: 100,  desc: '快乐+8',      fx: { happy: 8 } },
  { id: 'trip',  name: '全家旅行', cost: 1500, desc: '全属性小幅提升', fx: { int: 2, eq: 2, fit: 2, happy: 6 } },
  { id: 'class', name: '兴趣班',   cost: 800,  desc: '随机点亮天赋', fx: { special: 'class' } },
];
const CHILD_MILESTONE_AGES = [1, 3, 6, 9, 12, 15];
// 各年龄段的随机事件（满足条件走 A 线，否则 B 线）
const CHILD_EVENTS = {
  1:  { a: { text: 'TA 第一次含糊地叫出了「爸爸/妈妈」，你们激动坏了。', fx: { happy: 5 } },
        b: { text: 'TA 半夜发起了烧，你们手忙脚乱跑了一趟医院。', fx: { happy: -4 }, cost: 300 } },
  3:  { a: { text: '幼儿园才艺表演，TA 落落大方地唱完了整首歌。', fx: { eq: 5 } },
        b: { text: 'TA 和小伙伴闹了别扭，回家闷闷不乐。', fx: { eq: -3 } } },
  6:  { a: { text: '入学摸底考发挥出色，老师当众表扬了 TA。', fx: { int: 5, happy: 3 } },
        b: { text: '刚上小学有点不适应，成绩起起伏伏。', fx: { int: 3 } } },
  9:  { a: { text: 'TA 在兴趣班展露头角，老师说是块好料！', fx: { special: 'talent' } },
        b: { text: 'TA 迷上了电子游戏，作业都要催着写。', fx: { int: -3, happy: 4 } } },
  12: { a: { text: '青春期悄然而至，好在你们一直像朋友一样相处。', fx: { eq: 4, happy: 2 } },
        b: { text: 'TA 开始把房门关上了，你们有点担心。', fx: { eq: -4 } } },
  15: { a: { text: 'TA 主动跟你聊了整晚的心事，你们抱了抱。', fx: { eq: 6, happy: 4 } },
        b: { text: '叛逆期爆发，TA 摔门而去，你在客厅坐了一夜。', fx: { eq: -8, happy: -6 } } },
};
const CLASS_KINDS = [
  { id: 'art',    name: '美术班', flag: 'art_talent', fx: { eq: 8 } },
  { id: 'coding', name: '编程班', flag: null,        fx: { int: 8 } },
  { id: 'music',  name: '音乐班', flag: 'art_talent', fx: { eq: 6, happy: 2 } },
  { id: 'ball',   name: '球类班', flag: null,        fx: { fit: 8 } },
];

// ---------- 结局 ----------
const CHILD_PATHS = {
  artist:   { name: '小艺术家',   line: 'TA 考上了美术学院，作品第一次进了美术馆。' },
  athlete:  { name: '职业运动员', line: 'TA 被省队选中，站上了全国领奖台。' },
  starUni:  { name: '名校学子',   line: 'TA 收到了名牌大学的录取通知书，全家笑开了花。' },
  leader:   { name: '青年创业者', line: 'TA 带着小伙伴创办了公司，眼里全是光。' },
  uni:      { name: '大学生',     line: 'TA 顺利考上大学，开始书写自己的故事。' },
  happyOrd: { name: '快乐的普通人', line: 'TA 找到了喜欢的工作，把日子过得热气腾腾。' },
  lost:     { name: '迷茫的少年', line: 'TA 暂时还没想好去哪，你们决定陪 TA 慢慢找。' },
};

const DATA = {
  MAP, MAP_W, MAP_H, ZONES, zoneAt, PROPS, NPCS, TOPICS, INTEREST_LINES,
  CHAT_REACT, PRAISE_REACT, GIFT_REACT, GREETINGS,
  PRAISE_LINES, CHAT_TIRED, GIFTS, RING_PRICE, CAREERS, DATE_SPOTS,
  PARENTING_ACTIONS, CHILD_MILESTONE_AGES, CHILD_EVENTS, CLASS_KINDS, CHILD_PATHS,
};

if (typeof module !== 'undefined' && module.exports) module.exports = { DATA };
global.DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
