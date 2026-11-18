// 《心动人生》UI 与游戏循环：输入 / HUD / 对话 / 约会 / 育儿 / 结局 / 存档
(function () {
'use strict';

const C = window.Core, D = window.DATA;

// ---------- 全局状态 ----------
let G = null;                 // 核心状态（core.createGame）
let world = null;             // 世界运行时（地图/NPC活体/孩子）
let cam = { x: 5.5, y: 6.5, a: Math.PI / 2, pitch: 0 };  // 相机（yaw=a, pitch 为地平线像素偏移）
let player = { x: 5.5, y: 6.5 };   // 玩家物理位置
let playerImgs = null;        // 玩家精灵帧 [站,迈A,迈B,挥手]
let viewMode = 'first';       // 'first' | 'third'
let walkT = 0;                // 行走动画计时
let waving = 0;               // 玩家挥手计时
let locked = false;           // 鼠标指针锁定
const LOOK_SENS = 0.0032, PITCH_SENS = 0.55;
let keys = {};
let timeFrac = 0;
let lastZoneId = null;
let lastDay = -1;
let muted = false;
let running = false;

const $ = id => document.getElementById(id);
const scene = $('scene'), sctx = scene.getContext('2d');
const minimap = $('minimap'), mctx = minimap.getContext('2d');

// ---------- 音效 ----------
let actx = null;
function beep(freq, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + (dur || 0.12));
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + (dur || 0.12));
  } catch (e) { /* 忽略 */ }
}
const sfx = {
  ui: () => beep(660, 0.08, 'square', 0.06),
  good: () => { beep(740, 0.1); setTimeout(() => beep(988, 0.14), 90); },
  love: () => { beep(660, 0.12); setTimeout(() => beep(880, 0.12), 110); setTimeout(() => beep(1175, 0.2), 220); },
  bad: () => beep(180, 0.22, 'sawtooth', 0.08),
  jingle: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'triangle', 0.1), i * 130)),
};

// ---------- 通知 ----------
function notify(text, kind) {
  const el = document.createElement('div');
  el.className = 'notice' + (kind ? ' ' + kind : '');
  el.textContent = text;
  $('notices').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 4200);
  while ($('notices').children.length > 5) $('notices').firstChild.remove();
}

// ---------- 面板管理 ----------
const PANELS = ['adv', 'status', 'map-panel', 'shop', 'help'];
const OVERLAYS = ['pause', 'cutscene', 'date', 'parenting', 'ending'];
function panelOpen() {
  return PANELS.some(p => !$(p).classList.contains('hidden')) || OVERLAYS.some(p => !$(p).classList.contains('hidden'));
}
function closeAll() {
  PANELS.forEach(p => $(p).classList.add('hidden'));
}
function togglePanel(id) {
  const hidden = $(id).classList.contains('hidden');
  closeAll();
  if (hidden) { $(id).classList.remove('hidden'); sfx.ui(); }
}
document.querySelectorAll('.close-x').forEach(b => b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden')));

// ---------- 世界初始化 ----------
function zoneRectSafe(zid) {
  const z = D.ZONES.find(z => z.id === zid);
  if (!z) return null;
  const r = z.rect;
  return { x0: r.x + 1, y0: r.y + 1, x1: r.x + r.w - 2, y1: r.y + r.h - 2 };
}
function randInRect(r) { return { x: r.x0 + Math.random() * (r.x1 - r.x0), y: r.y0 + Math.random() * (r.y1 - r.y0) }; }

function buildWorld() {
  world = {
    map: D.MAP,
    props: D.PROPS.map(p => Object.assign({}, p)),
    npcLive: D.NPCS.map(n => ({
      id: n.id, name: n.name, role: n.role, gender: n.gender, npc: n,
      x: 0, y: 0, tx: 0, ty: 0, waitT: Math.random() * 2, hidden: true, zone: null,
      imgs: [0, 1, 2, 'wave'].map(f => Render.makePersonSprite(n.style, f)),
      walkT: 0, moving: false, waving: false,
    })),
    childLive: null,
  };
}
function npcWantedZone(nl) {
  if (G.spouseId === nl.id) return 'home';
  const zone = C.scheduleZone(nl.npc, G.minutes / 60);
  return zone;
}
function updateNpcZones() {
  for (const nl of world.npcLive) {
    const zid = npcWantedZone(nl);
    if (zid !== nl.zone) {
      nl.zone = zid;
      const r = zid ? zoneRectSafe(zid) : null;
      if (r) {
        const p = randInRect(r);
        nl.x = p.x; nl.y = p.y; nl.tx = p.x; nl.ty = p.y;
        nl.hidden = false;
      } else nl.hidden = true;
    }
  }
}
function updateChildLive() {
  if (!G.child) { world.childLive = null; return; }
  if (!world.childLive) {
    world.childLive = { x: 4.5, y: 6.2, tx: 4.5, ty: 6.2, waitT: 2 };
  }
  const age = C.childAgeYears(G);
  if (age < 1) return; // 婴儿不乱跑
  const cl = world.childLive;
  cl.waitT -= dt;
  if (cl.waitT <= 0) {
    const d = Math.hypot(cl.tx - cl.x, cl.ty - cl.y);
    if (d < 0.15) {
      cl.tx = 3.5 + Math.random() * 4; cl.ty = 3.5 + Math.random() * 4;
      cl.waitT = 1.5 + Math.random() * 3;
    }
  }
}

// ---------- 输入 ----------
let playerGender = 'M';
document.querySelectorAll('.gender-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.gender-btn').forEach(x => x.classList.remove('sel'));
  b.classList.add('sel'); playerGender = b.dataset.g;
}));

$('btn-start').addEventListener('click', () => {
  const name = $('player-name').value.trim() || '阿哲';
  startGame(name, playerGender);
});

window.addEventListener('keydown', e => {
  if (!running) return;
  const tag = (e.target && e.target.tagName) === 'INPUT';
  keys[e.key.toLowerCase()] = true;
  if (tag) return;
  if (e.key === 'Escape') {
    if (panelOpen() && $('pause').classList.contains('hidden') && OVERLAYS.every(o => $(o).classList.contains('hidden'))) closeAll();
    else toggleOverlay('pause');
  }
  if (OVERLAYS.some(o => !$(o).classList.contains('hidden'))) return; // overlay 中不响应世界快捷键
  if (e.key.toLowerCase() === 'e' && !e.repeat) {
    if (!$('adv').classList.contains('hidden')) advanceAdv();
    else tryInteract();
  }
  if (e.key.toLowerCase() === 'i') { renderStatus(); togglePanel('status'); }
  if (e.key.toLowerCase() === 'm') { Render.renderMinimap(mctx, world, player, cam); togglePanel('map-panel'); }
  if (e.key.toLowerCase() === 'h') togglePanel('help');
  if (e.key.toLowerCase() === 'v' && !e.repeat) {
    viewMode = viewMode === 'first' ? 'third' : 'first';
    if (viewMode === 'third') camDist = 0.9;   // 起步距离，避免切换瞬间人物糊屏
    document.body.classList.toggle('first-person', viewMode === 'first');
    document.body.classList.toggle('third-person', viewMode === 'third');
    notify(viewMode === 'third' ? '第三人称视角（跟在身后看背影）' : '第一人称视角', 'good');
    sfx.ui();
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ---------- 鼠标视角（Pointer Lock，FPS 操作） ----------
let lockGrace = 0;   // 进入锁定瞬间的跳变过滤帧
scene.addEventListener('click', () => {
  if (running && !panelOpen() && !locked) scene.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === scene;
  if (locked) lockGrace = 3;
  document.body.classList.toggle('locked', locked);
  document.body.classList.toggle('first-person', viewMode === 'first');
  document.body.classList.toggle('third-person', viewMode === 'third');
  const hint = $('lock-hint');
  if (!locked && running && !panelOpen() && !G.ended) hint.classList.remove('hidden');
  else hint.classList.add('hidden');
});
document.addEventListener('mousemove', e => {
  if (!locked || !running || panelOpen()) return;
  if (lockGrace > 0) { lockGrace--; return; }   // 丢弃进入锁定瞬间的跳变帧
  const dx = Math.max(-90, Math.min(90, e.movementX || 0));
  const dy = Math.max(-90, Math.min(90, e.movementY || 0));
  handleMouseLook(dx, dy);
});
function handleMouseLook(dx, dy) {
  cam.a += dx * LOOK_SENS;
  cam.pitch = Math.max(-60, Math.min(60, cam.pitch - dy * PITCH_SENS));
}
function exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

function toggleOverlay(id) {
  const hidden = $(id).classList.contains('hidden');
  if (id === 'pause' && !hidden) { $(id).classList.add('hidden'); return; }
  $(id).classList.remove('hidden');
}

// ---------- 开始 ----------
function startGame(name, gender) {
  G = C.createGame({ name, gender });
  buildWorld();
  player = { x: 5.5, y: 6.5 };
  playerImgs = {
    front: [0, 1, 2, 'wave'].map(f => Render.makePersonSprite(PLAYER_STYLES[gender], f, 'front')),
    back: [0, 1, 2, 'wave'].map(f => Render.makePersonSprite(PLAYER_STYLES[gender], f, 'back')),
  };
  cam = { x: 5.5, y: 6.5, a: Math.PI / 2, pitch: 0 };
  viewMode = 'first';
  lastZoneId = 'home'; lastDay = 0;
  $('title-screen').classList.add('hidden');
  $('game').classList.remove('hidden');
  const showDev = location.hash.indexOf('dev') >= 0;
  if (showDev) $('dev').classList.remove('hidden');
  running = true;
  notify(`欢迎来到小镇，${name}！点击画面锁定鼠标视角（按 H 看玩法）`, 'good');
  updateHud();
  requestAnimationFrame(loop);
}

// ---------- 主循环 ----------
let lastT = 0, dt = 0;
let movedThisFrame = false, runningThisFrame = false;
function loop(t) {
  if (!running) return;
  dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (panelOpen() && locked) exitLock();
  if (!G.ended && !panelOpen()) {
    updatePlayer(dt);
    advanceTime(dt, movedThisFrame, runningThisFrame);
  } else { movedThisFrame = false; }
  if (waving > 0) { waving -= dt; if (waving <= 0) waving = 0; }
  if (!G.ended) {
    updateNpcZones();
    updateNpcs(dt);
    updateChildLive();
  }
  // 相机（第三人称在玩家右肩后，遇墙/道具平滑收缩）
  const camPos = cameraPos(dt);
  cam.x = camPos.x; cam.y = camPos.y;
  const pitch = (viewMode === 'third' ? -95 : 0) + cam.pitch;
  const opts = {};
  if (viewMode === 'third' && camDist > 0.75) {   // 距离过近不绘制玩家，避免贴脸糊屏
    const frameIdx = movedThisFrame ? [0, 1, 0, 2][Math.floor(walkT) % 4] : 0;
    const img = waving > 0 ? playerImgs.back[3] : playerImgs.back[frameIdx];   // 第三人称看背影
    opts.playerSprite = { x: player.x, y: player.y, img };
  }
  opts.pitch = pitch;
  Render.renderScene(sctx, world, cam, G.minutes, opts);
  updateHud();
  updateInteractTip();
  requestAnimationFrame(loop);
}

// FPS 移动：W/S 前后，A/D 侧移，Shift 奔跑；朝向由鼠标控制
function updatePlayer(dt) {
  const run = !!(keys['shift'] && !keys['control']);
  const sp = (run ? 3.5 : 2.1) * dt;
  const cos = Math.cos(cam.a), sin = Math.sin(cam.a);
  let mx = 0, my = 0;
  if (keys['w'] || keys['arrowup']) { mx += cos * sp; my += sin * sp; }
  if (keys['s'] || keys['arrowdown']) { mx -= cos * sp * 0.8; my -= sin * sp * 0.8; }
  if (keys['a'] || keys['arrowleft']) { mx += sin * sp * 0.85; my -= cos * sp * 0.85; }
  if (keys['d'] || keys['arrowright']) { mx -= sin * sp * 0.85; my += cos * sp * 0.85; }
  movedThisFrame = (mx !== 0 || my !== 0);
  runningThisFrame = run && movedThisFrame;
  if (movedThisFrame) {
    if (!blocked(player.x + mx, player.y)) player.x += mx;
    if (!blocked(player.x, player.y + my)) player.y += my;
    walkT += dt * (run ? 11 : 7.5);
  } else walkT = 0;
  // 区域横幅
  const z = D.zoneAt(Math.floor(player.x), Math.floor(player.y));
  const zid = z ? z.id : 'street';
  if (zid !== lastZoneId) {
    lastZoneId = zid;
    const banner = $('zone-banner');
    banner.textContent = z ? z.name : '街道';
    banner.classList.remove('hidden');
    banner.style.animation = 'none'; void banner.offsetWidth; banner.style.animation = '';
  }
}

// 第三人称相机：右肩后越肩位（侧俯视）。
// 从远到近找第一个不与墙/道具相交的位置；侧偏受阻时逐步收回；仍无安全位则退化为玩家视点，确保相机永不进入墙体。
function wallAt(x, y) {
  return !!(world.map[Math.floor(y)] && world.map[Math.floor(y)][Math.floor(x)]);
}
function camBlocked(x, y) {
  if (wallAt(x, y)) return true;
  for (const p of world.props) {
    if (!p.blocking) continue;
    if (Math.hypot(p.x - x, p.y - y) < 0.42) return true;
  }
  return false;
}
let camDist = 0, camShoulder = 0;   // 当前平滑距离/侧偏
function cameraPos(dt) {
  if (viewMode === 'first') { camDist = 0; camShoulder = 0; return { x: player.x, y: player.y }; }
  const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a);
  const rightX = -dirY, rightY = dirX;   // 玩家右侧
  const MAXD = 2.0, MAXS = 0.38;
  let tDist = 0, tShoulder = 0, safe = false;
  for (let s = MAXS; s >= 0.05; s -= 0.165) {
    for (let d = MAXD; d >= 0.15; d -= 0.1) {
      if (!camBlocked(player.x - dirX * d + rightX * s, player.y - dirY * d + rightY * s)) {
        tDist = d; tShoulder = s; safe = true; break;
      }
    }
    if (safe && tDist > 0.6) break;   // 距离足够就不再收侧偏
  }
  if (!safe) { tDist = 0; tShoulder = 0; }   // 兜底：相机贴玩家视点
  const k = Math.min(1, (dt || 0.016) * 9);
  camDist += (tDist - camDist) * k;
  camShoulder += (tShoulder - camShoulder) * k;
  return { x: player.x - dirX * camDist + rightX * camShoulder, y: player.y - dirY * camDist + rightY * camShoulder };
}

function blocked(x, y) {
  const r = 0.28;
  const cells = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
  for (const [cx, cy] of cells) {
    const t = world.map[Math.floor(cy)] && world.map[Math.floor(cy)][Math.floor(cx)];
    if (t) return true;
  }
  for (const p of world.props) {
    if (!p.blocking) continue;
    if (Math.hypot(p.x - x, p.y - y) < 0.55) return true;
  }
  return false;
}

function updateNpcs(dt) {
  for (const nl of world.npcLive) {
    if (nl.hidden) { nl.moving = false; continue; }
    if (nl.waving != null && nl.waving !== false) {
      nl.waving -= dt;
      if (nl.waving <= 0) nl.waving = false;
    }
    nl.waitT -= dt;
    if (nl.waitT > 0) { nl.moving = false; continue; }
    const dx = nl.tx - nl.x, dy = nl.ty - nl.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.15) {
      const r = zoneRectSafe(nl.zone);
      if (r) { const p = randInRect(r); nl.tx = p.x; nl.ty = p.y; }
      nl.waitT = 1.2 + Math.random() * 3;
      nl.moving = false;
    } else {
      const sp = 0.55 * dt;
      nl.x += dx / d * sp; nl.y += dy / d * sp;
      nl.moving = true;
      nl.walkT = (nl.walkT || 0) + dt * 7;
    }
  }
}

function advanceTime(dt, moving, run) {
  timeFrac += dt * (run ? 26 : moving ? 16 : 6);
  const m = Math.floor(timeFrac);
  if (m > 0) {
    timeFrac -= m;
    C.addMinutes(G, m);
    if (G.needSleep) forcedSleep();
  }
}

// ---------- 睡觉 ----------
function forcedSleep() {
  const atHome = lastZoneId === 'home';
  showCutscene('夜深了', atHome ? '你回到家，一头栽进被窝。' : '你困得不行，在长椅上凑合睡了一夜……', '天亮了', () => {
    const { events } = C.doSleep(G, !atHome);
    morningProcess(events);
  });
}
function sleepAtHome() {
  closeAll();
  showCutscene('晚安', '你洗漱完躺下，期待明天。', '天亮了', () => {
    const { events } = C.doSleep(G, false);
    morningProcess(events);
  });
}
function morningProcess(events) {
  for (const ev of events) {
    if (ev.type === 'birth') { onBirth(); return; }
    if (ev.type === 'quarrel') notify(ev.text, 'warn');
  }
  updateHud();
  // 里程碑检查（育儿回合 / 结局）
  const m = C.checkMilestone(G);
  if (m && m.type === 'round') openParenting(m.age);
  else if (m && m.type === 'ending') openEnding();
}

// ---------- 交互检测 ----------
function facingDot(nx, ny) {
  const dx = nx - player.x, dy = ny - player.y;
  const d = Math.hypot(dx, dy) || 1;
  return (dx / d) * Math.cos(cam.a) + (dy / d) * Math.sin(cam.a);
}
function findInteract() {
  let best = null, bestD = 1.6;
  for (const nl of world.npcLive) {
    if (nl.hidden) continue;
    const d = Math.hypot(nl.x - player.x, nl.y - player.y);
    if (d < bestD && facingDot(nl.x, nl.y) > 0.35) { best = { kind: 'npc', nl, d }; bestD = d; }
  }
  if (best) return best;
  for (const p of world.props) {
    if (!p.label) continue;
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < 1.5 && facingDot(p.x, p.y) > 0.3) return { kind: 'station', p, d };
  }
  if (world.childLive) {
    const d = Math.hypot(world.childLive.x - player.x, world.childLive.y - player.y);
    if (d < 1.4 && facingDot(world.childLive.x, world.childLive.y) > 0.3) return { kind: 'child', d };
  }
  return null;
}
function updateInteractTip() {
  const tip = $('interact-tip');
  if (G.ended || panelOpen()) { tip.classList.add('hidden'); return; }
  const it = findInteract();
  if (!it) { tip.classList.add('hidden'); return; }
  tip.classList.remove('hidden');
  if (it.kind === 'npc') tip.innerHTML = `按 <b>E</b> 与 ${it.nl.name} 交谈`;
  else if (it.kind === 'child') tip.innerHTML = `按 <b>E</b> 陪${G.child.name}玩一会儿`;
  else tip.innerHTML = `按 <b>E</b> 使用 ${it.p.label}`;
}
function tryInteract() {
  const it = findInteract();
  if (!it) return;
  waving = 0.55; // 玩家挥手动作
  if (it.kind === 'npc') { it.nl.waving = 1.2; openDialog(it.nl); }
  else if (it.kind === 'child') {
    G.player.mood = Math.min(100, G.player.mood + 5);
    G.child.stats.happy = Math.min(100, G.child.stats.happy + 1);
    notify(`你陪${G.child.name}玩了一会儿，TA 咯咯直笑。心情+5`, 'good');
    sfx.good();
  } else useStation(it.p);
}

// ---------- 站点 ----------
function useStation(p) {
  switch (p.type) {
    case 'bed': sleepAtHome(); break;
    case 'desk': {
      const r = C.doWork(G);
      if (!r.ok) { notify(r.reason, 'warn'); sfx.bad(); break; }
      notify(`工作 4 小时，收入 ${r.income} 元${r.leveledUp ? '，你升职了！' : ''}`, r.leveledUp ? 'good' : '');
      if (r.leveledUp) { sfx.jingle(); notify(`升职为【${D.CAREERS[G.player.careerLevel].title}】！`, 'good'); } else sfx.ui();
      break;
    }
    case 'shelf': {
      const r = C.studyLibrary(G);
      if (!r.ok) { notify(r.reason, 'warn'); sfx.bad(); break; }
      notify(r.text + ' 才华+2', 'good'); sfx.ui();
      break;
    }
    case 'equip': {
      const r = C.gymTrain(G);
      if (!r.ok) { notify(r.reason, 'warn'); sfx.bad(); break; }
      notify(r.text + ' 魅力+2', 'good'); sfx.ui();
      break;
    }
    case 'counter': {
      const r = C.eatFood(G, 'cafe');
      if (!r.ok) { notify(r.reason, 'warn'); sfx.bad(); break; }
      notify(r.text + '（-50 元）', 'good'); sfx.ui();
      break;
    }
    case 'counter2': renderShop(); togglePanel('shop'); break;
    case 'hdesk': {
      if (G.pregnant) { notify('张医生：胎儿很健康，按时产检，放平心态。', 'good'); sfx.ui(); break; }
      if (G.player.money < 150) { notify('体检要 150 元，钱不够。', 'warn'); break; }
      G.player.money -= 150;
      G.player.energy = Math.min(100, G.player.energy + 25);
      G.player.mood = Math.min(100, G.player.mood + 6);
      C.addMinutes(G, 60);
      notify('体检完成，一切正常。体力+25 心情+6', 'good'); sfx.ui();
      break;
    }
    default: notify('没什么特别的。');
  }
}

// ---------- ADV 对话（Galgame 演出层） ----------
let curNpc = null;
let advQueue = [], advIdx = 0, advTyping = false, advTimer = null, advDone = null;

function openDialog(nl) {
  curNpc = nl;
  closeAll();
  $('adv').classList.remove('hidden');
  document.body.classList.add('adv-open');
  $('adv-name').textContent = nl.npc.name;
  $('adv-stage').textContent = C.stageLabel(G, nl.id) + ' · ' + nl.npc.job;
  advRelBar();
  advPortrait('normal');
  $('adv-opts').innerHTML = '';
  const script = C.buildScript('greet', { stage: C.stageOf(G, nl.id) }, nl.npc.name);
  playScript(script, () => advRenderHome());
  sfx.ui();
}

function closeDialog() {
  clearInterval(advTimer);
  advTyping = false;
  $('adv').classList.add('hidden');
  document.body.classList.remove('adv-open');
}

function advPortrait(expr) {
  const cv = $('adv-portrait-cv');
  const p = Render.makePortrait(curNpc.npc.style, expr || 'normal');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(p, 0, 0);
}

function advRelBar() {
  const st = G.npcs[curNpc.id];
  $('adv-relfill').style.width = st.rel + '%';
  $('adv-relval').textContent = '好感 ' + st.rel;
}

function playScript(script, done) {
  advQueue = script || []; advIdx = 0; advDone = done || null;
  $('adv-opts').innerHTML = '';
  nextLine();
}

function nextLine() {
  if (advIdx >= advQueue.length) {
    $('adv-cursor').style.display = 'none';
    const cb = advDone; advDone = null;
    if (cb) cb();
    return;
  }
  const line = advQueue[advIdx++];
  $('adv-name').textContent = line.speaker;
  advPortrait(line.expr);
  typeText($('adv-text'), line.text);
}

function typeText(el, text) {
  clearInterval(advTimer);
  el.textContent = '';
  el.dataset.full = text;
  let i = 0;
  advTyping = true;
  $('adv-cursor').style.display = 'none';
  advTimer = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i);
    if (i % 4 === 0) beep(880, 0.015, 'square', 0.012);
    if (i >= text.length) {
      clearInterval(advTimer);
      advTyping = false;
      $('adv-cursor').style.display = '';
    }
  }, 26);
}

// E / 点击：未打完立即完成，打完则下一句
function advanceAdv() {
  if ($('adv').classList.contains('hidden')) return;
  if (advTyping) {
    clearInterval(advTimer);
    $('adv-text').textContent = $('adv-text').dataset.full;
    advTyping = false;
    $('adv-cursor').style.display = '';
    return;
  }
  if (advDone || advIdx < advQueue.length) nextLine();
}
$('adv-box').addEventListener('click', advanceAdv);

// 樱花花瓣演出
function petalsOn(ms) {
  const box = $('petals');
  box.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.style.left = (Math.random() * 100) + '%';
    p.style.animationDuration = (4 + Math.random() * 3) + 's';
    p.style.animationDelay = (Math.random() * 2) + 's';
    p.style.transform = 'scale(' + (0.7 + Math.random() * 0.7) + ')';
    box.appendChild(p);
  }
  box.classList.add('on');
  setTimeout(() => box.classList.remove('on'), ms || 6000);
}

// ---------- ADV 选项渲染 ----------
function advRenderOptions(list, grid) {
  const box = $('adv-opts');
  box.innerHTML = '';
  box.id = 'adv-opts';
  box.className = grid ? 'grid' : '';
  for (const o of list) {
    const b = document.createElement('button');
    b.innerHTML = o.label + (o.hint ? `<span class="hint">${o.hint}</span>` : '');
    if (o.dis) b.disabled = true;
    else b.addEventListener('click', o.fn);
    box.appendChild(b);
  }
}

function advRenderHome() {
  const nl = curNpc, st = G.npcs[nl.id], npc = nl.npc;
  $('adv-stage').textContent = C.stageLabel(G, nl.id) + ' · ' + npc.job;
  advRelBar();
  $('adv-text').textContent = npc.role === 'romance'
    ? `「${npc.traits.join('、')}」的${npc.job}。TA 正看着你，等你先开口。`
    : `${npc.job}${npc.name}正望着街上来来往往的人。`;
  const opts = [];
  const btn = (label, fn, hint, dis) => opts.push({ label, fn, hint, dis });

  if (npc.role === 'friend') {
    if (npc.id === 'laowang') btn('听老王唠嗑', friendWang);
    if (npc.id === 'lijie') btn('找李姐打听消息', friendLijie);
    if (npc.id === 'xiaobei') btn('和小北吹牛', friendXiaobei);
    if (npc.id === 'drzhang') btn('和张医生聊聊', () => playScript([{ speaker: '张医生', expr: 'normal', text: '身体是本钱，别老熬夜。你这样挺好的，注意休息。' }], () => advRenderHome()));
  } else {
    btn('闲聊', advRenderTopics, '选对话题');
    btn('夸赞 TA', doPraise);
    const hasGift = Object.keys(G.player.inv).some(k => G.player.inv[k] > 0);
    btn('送礼', hasGift ? advRenderGifts : null, hasGift ? '从背包挑选' : '背包空空（商场有卖）', !hasGift);
    const dateOk = C.askDate(G, nl.id);
    btn('邀约', startDateFlow, dateOk.ok ? null : dateOk.reason, !dateOk.ok);
    if (st.stage === 'stranger') {
      const cf = C.canConfess(G, nl.id);
      btn('表白', doConfess, cf.ok ? '说出来！' : cf.reason, !cf.ok);
    } else if (st.stage === 'lover') {
      const pp = C.canPropose(G, nl.id);
      btn('求婚', doPropose, pp.ok ? '单膝跪地' : pp.reason, !pp.ok);
    } else if (st.stage === 'spouse') {
      const tb = C.tryBaby(G);
      btn('要个孩子吗', doTryBaby, tb.ok ? '认真谈谈' : tb.reason, !tb.ok);
    }
  }
  btn('告别', closeDialog);
  advRenderOptions(opts);
}

function advRenderTopics() {
  const nl = curNpc, st = G.npcs[nl.id];
  $('adv-text').textContent = '聊点什么好呢？' + (st.revealed ? '（李姐情报：TA 喜欢 ' + nl.npc.interests.map(t => D.TOPICS[t].name.slice(2)).join('、') + '）' : '');
  const list = Object.keys(D.TOPICS).map(t => {
    const isRepeat = (st.recentTopics || []).indexOf(t) >= 0;
    const mark = (st.revealed && nl.npc.interests.indexOf(t) >= 0) ? ' ♥' : '';
    return { label: D.TOPICS[t].name + mark + (isRepeat ? '（刚聊过）' : ''), fn: () => doChat(t) };
  });
  list.push({ label: '返回', fn: advRenderHome });
  advRenderOptions(list, true);
}

function doChat(topic) {
  const r = C.interactChat(G, curNpc.id, topic);
  if (!r.ok) { notify(r.reason, 'warn'); sfx.bad(); return; }
  advRelBar();
  const script = C.buildScript('chat', r, curNpc.npc.name);
  if (r.delta > 0 && script.length) script[script.length - 1].text += `（好感 +${r.delta}）`;
  playScript(script, () => advRenderTopics());
  sfx.good();
}

function doPraise() {
  const r = C.interactPraise(G, curNpc.id);
  if (!r.ok) { notify(r.reason, 'warn'); sfx.bad(); return; }
  advRelBar();
  const script = C.buildScript('praise', r, curNpc.npc.name);
  if (script.length) script[script.length - 1].text += `（好感 +${r.delta}）`;
  playScript(script, () => advRenderHome());
  sfx.ui();
}

function advRenderGifts() {
  const list = Object.keys(D.GIFTS).filter(k => G.player.inv[k] > 0).map(k => ({
    label: `${D.GIFTS[k].name} ×${G.player.inv[k]}`, fn: () => doGift(k),
  }));
  list.push({ label: '返回', fn: advRenderHome });
  $('adv-text').textContent = '把心意送出去吧。';
  advRenderOptions(list);
}

function doGift(cat) {
  const r = C.giveGift(G, curNpc.id, cat);
  advRelBar();
  const script = C.buildScript('gift', r, curNpc.npc.name);
  if (script.length) script[script.length - 1].text += `（好感 +${r.delta}）`;
  playScript(script, () => {
    const left = Object.keys(G.player.inv).some(k => G.player.inv[k] > 0);
    if (left) advRenderGifts(); else advRenderHome();
  });
  sfx.love();
}

function doConfess() {
  const r = C.confess(G, curNpc.id);
  if (r.success) {
    petalsOn(7000);
    sfx.love();
    notify(`你和${curNpc.name}在一起了！`, 'good');
  } else sfx.bad();
  advRelBar();
  playScript([{ speaker: curNpc.npc.name, expr: C.exprForEvent('confess', r.success), text: r.text }], () => advRenderHome());
}

function doPropose() {
  const r = C.propose(G, curNpc.id);
  if (r.accepted) {
    sfx.jingle();
    petalsOn(9000);
    closeDialog();
    showCutscene('婚礼', r.text + `\n\n从此，${curNpc.name}会在家里等你。`, '成家了', () => {
      updateNpcZones();
      notify('伴侣已搬进家里，记得常陪 TA 聊天。', 'good');
    });
  } else {
    sfx.bad();
    playScript([{ speaker: curNpc.npc.name, expr: 'sad', text: r.text }], () => advRenderHome());
  }
}

function doTryBaby() {
  const r = C.tryBaby(G);
  if (!r.ok) { notify(r.reason, 'warn'); return; }
  sfx.love();
  closeDialog();
  showCutscene('一个新的决定', r.text + '\n\n大约九个月后，家里会迎来一位新成员。', '期待着', () => {});
}

// 好友互动
function friendWang() {
  const st = G.npcs.laowang;
  if (st.lastBoonDay === G.day) {
    playScript([{ speaker: '老王', expr: 'normal', text: '今儿聊够了，改天再来！' }], () => advRenderHome());
    return;
  }
  st.lastBoonDay = G.day;
  G.player.mood = Math.min(100, G.player.mood + 6);
  const lines = ['小伙子/姑娘，缘分这东西，得自己上街去找！', '我跟你王阿姨当年，就是在公园长椅上认识的。', '钱是挣不完的，人是会走散的，懂？'];
  playScript([
    { speaker: '老王', expr: 'happy', text: lines[Math.floor(Math.random() * lines.length)] },
    { speaker: '老王', expr: 'normal', text: '（心情 +6）' },
  ], () => advRenderHome());
  sfx.good();
}
function friendLijie() {
  const cands = C.candidates(G).filter(n => !G.npcs[n.id].revealed);
  if (!cands.length) {
    playScript([{ speaker: '李姐', expr: 'happy', text: '镇上的适龄青年我可都告诉你啦！' }], () => advRenderHome());
    return;
  }
  const n = cands[Math.floor(Math.random() * cands.length)];
  G.npcs[n.id].revealed = true;
  playScript([
    { speaker: '李姐', expr: 'happy', text: '（李姐左右看了看，把你拉到一边。）' },
    { speaker: '李姐', expr: 'normal', text: `${n.name}最喜欢${D.GIFTS[n.giftPref].name}，平时爱聊${n.interests.map(t => D.TOPICS[t].name.slice(2)).join('和')}。` },
  ], () => advRenderHome());
  notify(`情报更新：${n.name} 的喜好已解锁（I 查看关系）`, 'good');
  sfx.good();
}
function friendXiaobei() {
  G.player.mood = Math.min(100, G.player.mood + 3);
  const tips = ['找李姐能打听别人的喜好，事半功倍！', '心情低落时聊天效果减半，先去吃点好的。', '约会三次以上再表白，稳。', '图书馆涨才华，升职加薪靠它。'];
  playScript([
    { speaker: '小北', expr: 'happy', text: tips[Math.floor(Math.random() * tips.length)] },
    { speaker: '小北', expr: 'normal', text: '（心情 +3）' },
  ], () => advRenderHome());
  sfx.ui();
}

// ---------- 约会 ----------
let dateCtx = null;
function startDateFlow() {
  const ok = C.askDate(G, curNpc.id);
  if (!ok.ok) { notify(ok.reason, 'warn'); return; }
  dateCtx = { id: curNpc.id, name: curNpc.name, interests: curNpc.npc.interests, revealed: G.npcs[curNpc.id].revealed, spot: null, choices: [], step: 0 };
  closeAll();
  $('date').classList.remove('hidden');
  renderDateSpots();
  sfx.ui();
}
function renderDateSpots() {
  $('date-title').textContent = `邀约 · ${dateCtx.name}`;
  $('date-text').textContent = '去哪儿好呢？' + (dateCtx.revealed ? '（TA 的兴趣你已了然于心）' : '');
  const box = $('date-opts');
  box.innerHTML = '';
  for (const k in D.DATE_SPOTS) {
    const s = D.DATE_SPOTS[k];
    const b = document.createElement('button');
    const match = dateCtx.revealed && dateCtx.interests.some(i => ({ cafe: ['food', 'music'], park: ['travel', 'sports'], cinema: ['games', 'art'] })[k].indexOf(i) >= 0);
    b.innerHTML = `${s.name}${match ? ' ♥可能正中下怀' : ''}<span class="cost">${s.cost} 元</span>`;
    b.disabled = G.player.money < s.cost;
    b.addEventListener('click', () => { dateCtx.spot = k; dateCtx.step = 0; renderDateStep(); });
    box.appendChild(b);
  }
  const cancel = document.createElement('button');
  cancel.textContent = '还是改天吧';
  cancel.addEventListener('click', () => $('date').classList.add('hidden'));
  box.appendChild(cancel);
}
function renderDateStep() {
  const s = D.DATE_SPOTS[dateCtx.spot];
  if (dateCtx.step < 3) {
    $('date-title').textContent = `约会 · ${s.name}（${dateCtx.step + 1}/3）`;
    $('date-text').textContent = s.lines[dateCtx.step];
    const box = $('date-opts');
    box.innerHTML = '';
    [['按 TA 的喜欢来安排', 0], ['随性一点，走走看看', 1]].forEach(([label, v]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { dateCtx.choices.push(v); dateCtx.step++; renderDateStep(); });
      box.appendChild(b);
    });
  } else {
    const r = C.resolveDate(G, dateCtx.id, dateCtx.spot, dateCtx.choices);
    if (!r.ok) { notify(r.reason, 'warn'); $('date').classList.add('hidden'); return; }
    $('date-title').textContent = '约会结束';
    $('date-text').textContent = r.text + `\n\n${dateCtx.name}今天很开心。（好感 +${r.delta}，心情 +8）`;
    const box = $('date-opts');
    box.innerHTML = '';
    const b = document.createElement('button');
    b.textContent = '送 TA 回去';
    b.addEventListener('click', () => { $('date').classList.add('hidden'); sfx.love(); notify(`约会完成（累计 ${G.npcs[dateCtx.id].dates} 次）`, 'good'); });
    box.appendChild(b);
  }
}

// ---------- cutscene ----------
function showCutscene(title, text, btnLabel, onDone, withInput) {
  $('cutscene-title').textContent = title;
  $('cutscene-text').textContent = text;
  $('cutscene-btn').textContent = btnLabel || '继续';
  $('cutscene-input').classList.toggle('hidden', !withInput);
  if (withInput) { $('baby-name-input').value = ''; }
  $('cutscene').classList.remove('hidden');
  $('cutscene-btn').onclick = () => {
    $('cutscene').classList.add('hidden');
    onDone && onDone($('baby-name-input').value);
  };
}

// ---------- 分娩 ----------
function onBirth() {
  sfx.jingle();
  showCutscene('新生', '产房外，你听见一声响亮的啼哭。\n护士抱着一个小小的襁褓走出来——\n你们的孩子出生了。', '取个小名', (name) => {
    if (name && name.trim()) G.child.name = name.trim();
    world.childLive = null;
    notify(`孩子小名「${G.child.name}」。TA 满岁数时会触发成长抉择，好好陪伴 TA。`, 'good');
    const m = C.checkMilestone(G);
    if (m && m.type === 'ending') openEnding();
  }, true);
}

// ---------- 育儿 ----------
let ptPicked = [];
function openParenting(age) {
  const c = G.child;
  ptPicked = [];
  $('pt-title').textContent = `${c.name} ${age} 岁了 · 成长抉择`;
  renderPtStats();
  $('pt-event').textContent = '这一年，你打算怎么陪伴 TA？（最多选 3 项）';
  const box = $('pt-actions');
  box.innerHTML = '';
  for (const a of D.PARENTING_ACTIONS) {
    const b = document.createElement('button');
    b.innerHTML = `${a.name}<br><span class="cost">${a.cost} 元 · ${a.desc}</span>`;
    if (G.player.money < a.cost) b.disabled = true;
    b.addEventListener('click', () => {
      const i = ptPicked.indexOf(a.id);
      if (i >= 0) { ptPicked.splice(i, 1); b.classList.remove('sel'); }
      else if (ptPicked.length < 3) { ptPicked.push(a.id); b.classList.add('sel'); }
      sfx.ui();
      $('pt-picked').textContent = `已选 ${ptPicked.length}/3：` + (ptPicked.map(id => D.PARENTING_ACTIONS.find(x => x.id === id).name).join('、') || '无');
    });
    box.appendChild(b);
  }
  $('pt-picked').textContent = '已选 0/3';
  $('pt-confirm').textContent = '就这样陪伴';
  $('pt-confirm').onclick = () => {
    const r = C.applyParenting(G, ptPicked);
    if (!r.ok) { notify(r.reason, 'warn'); sfx.bad(); return; }
    renderPtStats();
    $('pt-event').textContent = r.effects.join('\n') + (r.eventText ? '\n\n—— 这一年 ——\n' + r.eventText : '');
    $('pt-confirm').textContent = '收下这段时光';
    $('pt-confirm').onclick = () => {
      $('parenting').classList.add('hidden');
      sfx.good();
      const m = C.checkMilestone(G);
      if (m && m.type === 'ending') openEnding();
    };
    sfx.ui();
  };
  $('parenting').classList.remove('hidden');
}
function renderPtStats() {
  const s = G.child.stats;
  $('pt-stats').innerHTML = ['int|智力', 'eq|情商', 'fit|体质', 'happy|快乐'].map(p => {
    const [k, name] = p.split('|');
    return `<div class="pt-stat"><div class="k">${name}</div><div class="v">${s[k]}</div></div>`;
  }).join('') + `<div class="pt-stat"><div class="k">零花钱池</div><div class="v" style="font-size:14px">${G.player.money}</div></div>`;
}

// ---------- 结局 ----------
const PLAYER_STYLES = {
  M: { hair: '#2b2b33', hairStyle: 'short', skin: '#eecfa8', top: '#5d7fb5', bottom: '#333344' },
  F: { hair: '#6a4a3a', hairStyle: 'long', skin: '#f2d5b8', top: '#e05c8a', bottom: '#3a3a55' },
};
function drawFamilyPortrait() {
  const cv = $('end-family'), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const members = [{ style: PLAYER_STYLES[G.player.gender], expr: 'happy' }];
  if (G.spouseId) {
    const sp = D.NPCS.find(n => n.id === G.spouseId);
    members.push({ style: sp.style, expr: 'shy' });
  }
  if (G.child) {
    const spStyle = G.spouseId ? D.NPCS.find(n => n.id === G.spouseId).style : PLAYER_STYLES[G.player.gender];
    members.push({
      style: { hair: spStyle.hair, hairStyle: 'short', skin: spStyle.skin, top: '#f2c94c', bottom: '#5c8ad5' },
      expr: 'happy',
    });
  }
  const n = members.length, w = 110;
  members.forEach((m, i) => {
    const p = Render.makePortrait(m.style, m.expr);
    const x = (cv.width - n * w) / 2 + i * w;
    ctx.drawImage(p, x, 10, 100, 142);
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd9e8';
    const name = i === 0 ? G.player.name : i === 1 ? D.NPCS.find(x2 => x2.id === G.spouseId).name : G.child.name;
    ctx.fillText(name, x + 50, 164);
  });
}
function openEnding() {
  G.ended = true;
  const e = C.evaluateEnding(G);
  sfx.jingle();
  drawFamilyPortrait();
  $('end-title').textContent = e.title;
  $('end-score').textContent = `人生幸福指数 ${e.score} / 100 · ${G.player.name} 的故事`;
  $('end-lines').innerHTML = e.lines.map(l => `<p>${l}</p>`).join('') +
    (e.childPath ? `<p style="color:#ffd9e8">孩子去向：【${D.CHILD_PATHS[e.childPath].name}】</p>` : '');
  const tl = G.eventLog.map(ev => `<div><span class="tl-age">${ev.age}岁</span>${ev.text}</div>`).join('');
  $('end-timeline').innerHTML = tl || '<div>平静的一生。</div>';
  $('ending').classList.remove('hidden');
}
$('btn-again').addEventListener('click', () => location.reload());

// ---------- 生涯面板 ----------
function renderStatus() {
  const p = G.player;
  let html = `<div class="sec-title">自己</div>
    <div>职业：${D.CAREERS[p.careerLevel].title}（第${p.careerLevel + 1}级）· 金钱 ${p.money} · 魅力 ${p.charm} · 才华 ${p.talent}</div>
    <div>约会 ${G.stats.dates} 次 · 聊天 ${G.stats.chats} 次 · 送礼 ${G.stats.gifts} 次</div>`;
  html += `<div class="sec-title">关系</div>`;
  const all = C.candidates(G).concat(D.NPCS.filter(n => n.role === 'friend'));
  for (const n of all) {
    const st = G.npcs[n.id];
    const info = st.revealed ? `（喜欢${D.GIFTS[n.giftPref].name}）` : '';
    const dates = st.dates ? ` · 约会${st.dates}次` : '';
    html += `<div class="relation-row"><span class="rname">${n.name}</span><span class="rstage">${C.stageLabel(G, n.id)}</span>
      <div class="rtrack"><div class="rfill" style="width:${st.rel}%"></div></div><span class="rval">${st.rel}</span>
      <span style="font-size:11px;color:#6f6390">${info}${dates}</span></div>`;
  }
  if (G.pregnant) html += `<div class="sec-title">家庭</div><div>孕期中，预产期约在第 ${(G.dueDay - G.day)} 天后。</div>`;
  if (G.child) {
    const s = G.child.stats;
    html += `<div class="sec-title">孩子 · ${G.child.name}（${C.childAgeYears(G)}岁）</div>
      <div>智力 ${s.int} · 情商 ${s.eq} · 体质 ${s.fit} · 快乐 ${s.happy} · 成长抉择 ${G.child.roundsDone}/6</div>`;
  }
  $('status-body').innerHTML = html;
}

// ---------- 商店 ----------
function renderShop() {
  const p = G.player;
  let html = '<div class="shop-grid">';
  for (const k in D.GIFTS) {
    const g = D.GIFTS[k];
    html += `<div class="shop-item"><div class="si-name">${g.name} <span style="font-size:11px;color:#6f6390">持有${p.inv[k]}</span></div>
      <div class="si-desc">${g.desc}</div><div class="si-price">${g.price} 元</div>
      <button data-buy="${k}" ${p.money < g.price ? 'disabled' : ''}>购买</button></div>`;
  }
  const lover = Object.values(G.npcs).some(n => n.stage === 'lover');
  html += `<div class="shop-item"><div class="si-name">求婚戒指</div><div class="si-desc">${lover ? '一生一次的承诺' : '先找到那个对的人（恋人阶段可买）'}</div>
    <div class="si-price">${D.RING_PRICE} 元</div><button data-buy="ring" ${(!lover || p.money < D.RING_PRICE || p.ring) ? 'disabled' : ''}>${p.ring ? '已持有' : '购买'}</button></div>`;
  const clothesPrice = 500 * (p.clothesTier + 1);
  html += `<div class="shop-item"><div class="si-name">新衣服（第${p.clothesTier + 1}件）</div><div class="si-desc">魅力 +5</div>
    <div class="si-price">${clothesPrice} 元</div><button data-buy="clothes" ${(p.clothesTier >= 3 || p.money < clothesPrice) ? 'disabled' : ''}>购买</button></div>`;
  html += '</div>';
  $('shop-body').innerHTML = html;
  $('shop-body').querySelectorAll('button[data-buy]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.buy;
    if (k === 'ring') {
      const r = C.buyRing(G);
      if (r.ok) { notify('买到了戒指。找机会向 TA 求婚吧！', 'good'); sfx.good(); }
    } else if (k === 'clothes') {
      const price = 500 * (p.clothesTier + 1);
      if (p.money >= price && p.clothesTier < 3) {
        p.money -= price; p.clothesTier++; p.charm = Math.min(100, p.charm + 5);
        notify('新衣服真精神！魅力 +5', 'good'); sfx.good();
      }
    } else {
      const r = C.buyGift(G, k);
      if (r.ok) { notify(`买下了${D.GIFTS[k].name}（-${r.cost} 元）`, 'good'); sfx.ui(); }
      else { notify(r.reason, 'warn'); sfx.bad(); }
    }
    renderShop();
  }));
}

// ---------- HUD ----------
function updateHud() {
  const d = C.fmtDate(G);
  $('hud-date').textContent = `${d.text} ${String(Math.floor(G.minutes / 60)).padStart(2, '0')}:${String(G.minutes % 60).padStart(2, '0')}`;
  $('hud-age').textContent = `${d.age}岁`;
  $('hud-money').textContent = G.player.money;
  $('hud-energy').textContent = G.player.energy;
  $('hud-mood').textContent = G.player.mood;
  $('hud-charm').textContent = G.player.charm;
  $('hud-talent').textContent = G.player.talent;
  $('hud-career').textContent = D.CAREERS[G.player.careerLevel].title;
  $('hud-view').textContent = viewMode === 'third' ? '第三人称' : '第一人称';
  $('bar-energy').style.width = G.player.energy + '%';
  $('bar-mood').style.width = G.player.mood + '%';
}

// ---------- 暂停 / 存档 ----------
$('btn-save').addEventListener('click', () => {
  try {
    localStorage.setItem('xindong-save', JSON.stringify(G));
    notify('进度已保存。', 'good');
    $('pause').classList.add('hidden');
  } catch (e) { notify('保存失败：' + e.message, 'warn'); }
});
$('btn-load').addEventListener('click', () => {
  const raw = localStorage.getItem('xindong-save');
  if (!raw) { notify('没有存档。', 'warn'); return; }
  G = JSON.parse(raw);
  G.rng = C.mulberry32(G.seed);
  buildWorld();
  updateNpcZones();
  world.childLive = null;
  $('pause').classList.add('hidden');
  closeAll();
  notify('进度已读取。', 'good');
});
$('btn-mute').addEventListener('click', function () { muted = !muted; this.textContent = muted ? '音效：关' : '音效：开'; });
$('btn-restart').addEventListener('click', () => location.reload());

// ---------- 开发者 ----------
$('dev-toggle').addEventListener('click', () => $('dev').classList.toggle('open'));
(function buildDev() {
  const items = [
    ['+1 天', () => { morningOf(C.doSleep(G)); }],
    ['+10 天', () => { for (let i = 0; i < 10; i++) C.doSleep(G); morningProcess([]); }],
    ['金钱+5000', () => { G.player.money += 5000; notify('+5000'); }],
    ['体力/心情拉满', () => { G.player.energy = 100; G.player.mood = 100; }],
    ['全候选好感+40', () => { C.candidates(G).forEach(n => { G.npcs[n.id].rel = Math.min(100, G.npcs[n.id].rel + 40); G.npcs[n.id].lastInteractDay = G.day; }); notify('好感+40'); }],
    ['约会次数+3(最近候选)', () => { const c = C.candidates(G)[0]; if (c) { G.npcs[c.id].dates += 3; notify(c.name + ' 约会+3'); } }],
    ['直接恋爱', () => { const c = C.candidates(G)[0]; if (c) { G.npcs[c.id].stage = 'lover'; G.npcs[c.id].rel = Math.max(G.npcs[c.id].rel, 92); notify('与' + c.name + '恋爱'); } }],
    ['直接结婚', () => { const c = C.candidates(G).find(n => G.npcs[n.id].stage === 'lover') || C.candidates(G)[0]; if (c) { G.npcs[c.id].stage = 'spouse'; G.npcs[c.id].rel = 100; G.spouseId = c.id; updateNpcZones(); notify('与' + c.name + '结婚'); } }],
    ['立即怀孕', () => { if (!G.spouseId) { notify('先结婚'); return; } G.pregnant = true; G.dueDay = G.day + 1; notify('明天生'); }],
    ['快进到下个成长节点', () => { if (!G.child) { notify('还没孩子'); return; } const next = D.CHILD_MILESTONE_AGES[G.child.roundsDone]; const target = G.child.birthDay + next * 36; while (G.day < target) C.doSleep(G); morningProcess([]); }],
    ['直接结算', () => openEnding()],
  ];
  const box = $('dev-body');
  items.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    box.appendChild(b);
  });
})();
function morningOf(r) { morningProcess(r.events); }

// ---------- 测试/调试钩子 ----------
window.__xd = {
  getG: () => G, getWorld: () => world,
  cam: () => ({ x: player.x, y: player.y, a: cam.a, pitch: cam.pitch, viewMode }),
  look: handleMouseLook,
  setView: m => { viewMode = m; },
  teleport: (x, y, a) => { player.x = x; player.y = y; if (a !== undefined) cam.a = a; },
  npc: id => world.npcLive.find(n => n.id === id),
  talkTo: id => { const nl = world.npcLive.find(n => n.id === id); if (nl) { nl.hidden = false; openDialog(nl); } },
  start: (name, gender) => startGame(name, gender),
  morning: () => morningProcess([]),
  openParenting, openEnding, sleepAtHome,
};

})();
