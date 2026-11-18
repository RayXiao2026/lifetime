// 《心动人生》第一人称渲染引擎：raycasting + 程序化贴图/精灵 + 昼夜 + 小地图
// 性能关键路径：墙体写入全帧 ImageData，一次 putImageData；精灵用 drawImage 逐列裁剪。
(function (global) {
'use strict';

const RENDER_W = 480, RENDER_H = 270;
const FOV_PLANE = 0.66; // 66° 视场
const TEX_SIZE = 64;

// ---------- 颜色工具 ----------
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function packRGB(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return (255 << 24) | (b << 16) | (g << 8) | r; // little-endian ABGR
}
function mixRGB(c1, c2, t) {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}

// ---------- 程序化贴图 ----------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function px(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

// 八种墙体贴图：1边框石 2家木纹 3公司蓝 4书架 5咖啡砖 6商场 7健身房 8医院白
function buildTextures() {
  const T = {};
  function base(id, bg, fn) {
    const c = makeCanvas(TEX_SIZE, TEX_SIZE), ctx = c.getContext('2d');
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, bg);
    fn(ctx);
    const d = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data;
    const u32 = new Uint32Array(TEX_SIZE * TEX_SIZE);
    for (let i = 0; i < u32.length; i++) {
      u32[i] = packRGB(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    }
    T[id] = u32;
  }
  base(1, '#5a5a66', ctx => { // 边界石墙
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 78 + ((x * 7 + y * 13) % 5) * 6;
      px(ctx, x * 16 + 1, y * 16 + 1, 14, 14, `rgb(${v},${v},${v + 10})`);
    }
  });
  base(2, '#b98a5a', ctx => { // 家：木纹
    for (let i = 0; i < 8; i++) px(ctx, 0, i * 8, TEX_SIZE, 1, 'rgba(90,60,30,.5)');
    px(ctx, 10, 0, 2, TEX_SIZE, 'rgba(90,60,30,.35)'); px(ctx, 40, 0, 2, TEX_SIZE, 'rgba(90,60,30,.3)');
    px(ctx, 20, 20, 24, 24, '#e8d5b5'); px(ctx, 21, 21, 22, 22, '#c9a06a');
    px(ctx, 24, 8, 16, 9, '#8ad5e8');
  });
  base(3, '#7ca6e8', ctx => { // 公司：玻璃幕墙
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
      px(ctx, x * 8 + 1, y * 8 + 1, 6, 6, (x + y) % 2 ? '#9cc2f2' : '#6a92d5');
    px(ctx, 0, 30, TEX_SIZE, 4, '#3a5a8a');
  });
  base(4, '#8a6a4a', ctx => { // 图书馆：书架
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#7a5a3a');
    const cols = ['#c94f4f', '#4f7ac9', '#4fc98a', '#c9a84f', '#8a4fc9', '#c96f4f'];
    for (let s = 0; s < 3; s++) for (let i = 0; i < 9; i++)
      px(ctx, i * 7 + 1, s * 21 + 3, 5, 17, cols[(i + s * 3) % 6]);
    px(ctx, 0, 20, TEX_SIZE, 3, '#5a4028'); px(ctx, 0, 42, TEX_SIZE, 3, '#5a4028'); px(ctx, 0, 62, TEX_SIZE, 2, '#5a4028');
  });
  base(5, '#c96a5a', ctx => { // 咖啡厅：红砖
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const off = y % 2 ? 8 : 0;
      px(ctx, (x * 16 + off) % 60, y * 8 + 1, 14, 6, y % 2 ? '#d57862' : '#c25f4d');
    }
    px(ctx, 20, 8, 24, 18, '#f2e0c9'); px(ctx, 21, 9, 22, 16, '#5a3a28');
  });
  base(6, '#d5c07a', ctx => { // 商场
    px(ctx, 0, 0, TEX_SIZE, 24, '#e8d88a');
    px(ctx, 0, 24, TEX_SIZE, 40, '#c9b468');
    px(ctx, 6, 6, 52, 12, '#f7f2d5'); px(ctx, 8, 8, 48, 8, '#e05c7a');
    for (let i = 0; i < 4; i++) px(ctx, 8 + i * 13, 34, 9, 22, ['#7ac98a', '#7a9ec9', '#c9c97a', '#c97a9e'][i]);
  });
  base(7, '#4a5a55', ctx => { // 健身房
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#3a4a45');
    px(ctx, 4, 26, 56, 12, '#e8e8e8'); px(ctx, 6, 28, 52, 8, '#2b2b2b');
    px(ctx, 10, 30, 20, 4, '#e05c5c'); px(ctx, 36, 30, 18, 4, '#5ce0b0');
  });
  base(8, '#e8e8ec', ctx => { // 医院
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#dfe2e8');
    px(ctx, 22, 14, 20, 6, '#e05c5c'); px(ctx, 29, 7, 6, 20, '#e05c5c');
    px(ctx, 0, 44, TEX_SIZE, 3, '#b8bdc9');
  });
  return T;
}

// ---------- 人物精灵 ----------
function makePersonSprite(style) {
  const w = 24, h = 48;
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const { hair, hairStyle, skin, top, bottom } = style;
  px(ctx, 5, 44, 6, 4, '#2b2b2b'); px(ctx, 13, 44, 6, 4, '#2b2b2b');       // 鞋
  px(ctx, 6, 34, 5, 10, bottom); px(ctx, 13, 34, 5, 10, bottom);           // 腿
  px(ctx, 4, 18, 16, 17, top);                                             // 身体
  px(ctx, 4, 18, 16, 2, 'rgba(255,255,255,.15)');
  px(ctx, 2, 19, 3, 12, top); px(ctx, 19, 19, 3, 12, top);                 // 手臂
  px(ctx, 2, 31, 3, 3, skin); px(ctx, 19, 31, 3, 3, skin);
  px(ctx, 6, 4, 12, 12, skin);                                             // 头
  px(ctx, 7, 6, 2, 2, '#2b2b2b'); px(ctx, 15, 6, 2, 2, '#2b2b2b');         // 眼
  px(ctx, 9, 11, 6, 1, '#c96a6a');                                         // 嘴
  if (hairStyle === 'long') { px(ctx, 5, 2, 14, 10, hair); px(ctx, 4, 8, 3, 22, hair); px(ctx, 17, 8, 3, 22, hair); }
  else if (hairStyle === 'short') { px(ctx, 5, 3, 14, 7, hair); px(ctx, 5, 9, 2, 3, hair); px(ctx, 17, 9, 2, 3, hair); }
  else if (hairStyle === 'ponytail') { px(ctx, 5, 3, 14, 7, hair); px(ctx, 17, 6, 4, 14, hair); }
  else if (hairStyle === 'bob') { px(ctx, 5, 2, 14, 9, hair); px(ctx, 4, 8, 2, 8, hair); px(ctx, 18, 8, 2, 8, hair); }
  else if (hairStyle === 'cap') { px(ctx, 5, 3, 14, 6, hair); px(ctx, 5, 9, 14, 2, '#333344'); px(ctx, 3, 8, 18, 2, hair); }
  return c;
}

// ---------- 立绘（Galgame 半身像，四表情） ----------
// expr: normal | happy | shy | sad
const portraitCache = {};
function makePortrait(style, expr) {
  const key = JSON.stringify(style) + '|' + expr;
  if (portraitCache[key]) return portraitCache[key];
  const W = 120, H = 170;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const { hair, hairStyle, skin, top, bottom } = style;
  const blush = '#f5a3a3', dark = '#2b2b33';

  // 肩与身体
  px(ctx, 30, 128, 60, 42, top);
  px(ctx, 24, 140, 12, 30, top); px(ctx, 84, 140, 12, 30, top);      // 肩袖
  px(ctx, 52, 128, 16, 14, skin);                                      // 颈
  px(ctx, 30, 128, 60, 6, 'rgba(255,255,255,.18)');
  px(ctx, 48, 132, 24, 10, 'rgba(0,0,0,.12)');                         // 领口阴影
  // 头（Q 版大头）
  px(ctx, 34, 52, 52, 62, skin);
  px(ctx, 38, 100, 44, 10, skin);                                      // 下巴
  // 耳
  px(ctx, 30, 78, 5, 10, skin); px(ctx, 85, 78, 5, 10, skin);

  // 表情
  const eyeY = 78;
  if (expr === 'happy') {
    // 弯月眼 ^ ^
    for (let i = 0; i < 5; i++) { px(ctx, 44 + i, eyeY + (i < 2 ? i : (4 - i)), 1, 1, dark); px(ctx, 46 + i, eyeY + 1 + (i < 2 ? i : (4 - i)) - 1, 1, 1, dark); }
    for (let i = 0; i < 5; i++) { px(ctx, 70 + i, eyeY + (i < 2 ? i : (4 - i)), 1, 1, dark); px(ctx, 72 + i, eyeY + 1 + (i < 2 ? i : (4 - i)) - 1, 1, 1, dark); }
    px(ctx, 55, 100, 10, 7, '#c96a6a'); px(ctx, 56, 99, 8, 2, '#e88a8a');   // 张嘴笑
    px(ctx, 40, 66, 8, 4, blush); px(ctx, 72, 66, 8, 4, blush);              // 腮红
    px(ctx, 98, 46, 3, 3, '#ff9ec4'); px(ctx, 104, 56, 2, 2, '#ffd9e8');     // 音符点缀
  } else if (expr === 'shy') {
    px(ctx, 46, eyeY, 4, 3, dark); px(ctx, 70, eyeY, 4, 3, dark);            // 微垂眼
    px(ctx, 44, eyeY - 5, 8, 2, hair); px(ctx, 68, eyeY - 5, 8, 2, hair);    // 低眉
    px(ctx, 38, 88, 12, 6, blush); px(ctx, 70, 88, 12, 6, blush);            // 大腮红
    px(ctx, 57, 101, 6, 2, '#c96a6a');                                       // 抿嘴
    px(ctx, 16, 58, 3, 3, '#ff9ec4'); px(ctx, 12, 66, 2, 2, '#ffd9e8');      // 悸动点缀
  } else if (expr === 'sad') {
    px(ctx, 46, eyeY + 2, 4, 3, dark); px(ctx, 70, eyeY + 2, 4, 3, dark);
    px(ctx, 43, eyeY - 6, 9, 2, dark); px(ctx, 68, eyeY - 4, 9, 2, dark);    // 八字眉
    px(ctx, 55, 103, 10, 2, '#a05a5a');                                      // 向下嘴
  } else {
    px(ctx, 46, eyeY, 4, 5, dark); px(ctx, 70, eyeY, 4, 5, dark);
    px(ctx, 47, eyeY, 2, 2, '#fff'); px(ctx, 71, eyeY, 2, 2, '#fff');        // 高光
    px(ctx, 57, 101, 6, 2, '#c96a6a');
  }

  // 发型（放大版）
  if (hairStyle === 'long') {
    px(ctx, 32, 44, 56, 14, hair);
    px(ctx, 30, 40, 60, 10, hair);
    px(ctx, 28, 54, 8, 74, hair); px(ctx, 84, 54, 8, 74, hair);              // 垂发
    px(ctx, 36, 30, 48, 14, hair);
  } else if (hairStyle === 'short') {
    px(ctx, 32, 42, 56, 16, hair);
    px(ctx, 36, 32, 48, 12, hair);
    px(ctx, 30, 50, 6, 12, hair); px(ctx, 84, 50, 6, 12, hair);
  } else if (hairStyle === 'ponytail') {
    px(ctx, 32, 42, 56, 16, hair);
    px(ctx, 36, 32, 48, 12, hair);
    px(ctx, 86, 50, 14, 56, hair); px(ctx, 88, 44, 10, 10, hair);            // 侧马尾
    px(ctx, 90, 70, 4, 12, 'rgba(255,255,255,.15)');
  } else if (hairStyle === 'bob') {
    px(ctx, 32, 40, 56, 20, hair);
    px(ctx, 36, 30, 48, 14, hair);
    px(ctx, 28, 52, 8, 34, hair); px(ctx, 84, 52, 8, 34, hair);
  } else if (hairStyle === 'cap') {
    px(ctx, 34, 36, 52, 16, hair);
    px(ctx, 28, 46, 64, 5, hair);                                            // 帽檐
    px(ctx, 30, 41, 60, 4, 'rgba(0,0,0,.2)');
  }
  portraitCache[key] = c;
  return c;
}

// ---------- 道具精灵 ----------
function makePropSprite(type) {
  const map = {
    tree: [32, 56], lamp: [16, 56], bench: [32, 20], fountain: [48, 32],
    bed: [40, 22], desk: [36, 24], shelf: [36, 34], counter: [36, 22],
    counter2: [36, 22], equip: [32, 26], hdesk: [36, 22], child: [20, 34],
  };
  const dim = map[type] || [24, 32];
  const c = makeCanvas(dim[0], dim[1]), ctx = c.getContext('2d');
  const W = dim[0], H = dim[1];
  if (type === 'tree') {
    px(ctx, 13, 34, 6, 22, '#6a4a2b');
    px(ctx, 4, 6, 24, 30, '#3a7a4a');
    px(ctx, 7, 2, 18, 12, '#4a9a5a'); px(ctx, 2, 16, 10, 14, '#2f6a3f'); px(ctx, 22, 16, 9, 13, '#2f6a3f');
    px(ctx, 10, 8, 8, 6, '#5aaa6a');
  } else if (type === 'lamp') {
    px(ctx, 7, 6, 3, 50, '#3a3a44');
    px(ctx, 3, 0, 11, 8, '#f7e8a0'); px(ctx, 5, 2, 7, 4, '#fff8d0');
  } else if (type === 'bench') {
    px(ctx, 0, 4, 32, 5, '#8a6a4a'); px(ctx, 0, 12, 32, 4, '#8a6a4a');
    px(ctx, 2, 9, 4, 11, '#5a4530'); px(ctx, 26, 9, 4, 11, '#5a4530');
  } else if (type === 'fountain') {
    px(ctx, 2, 14, 44, 18, '#8a92a0'); px(ctx, 5, 16, 38, 14, '#5aa8d5');
    px(ctx, 20, 2, 8, 16, '#8a92a0'); px(ctx, 16, 0, 16, 4, '#5aa8d5');
    px(ctx, 22, 4, 4, 10, '#a8d5f2');
  } else if (type === 'bed') {
    px(ctx, 0, 2, 40, 20, '#8a6a4a'); px(ctx, 2, 4, 36, 16, '#e8e0d0');
    px(ctx, 2, 4, 12, 10, '#fff'); px(ctx, 16, 6, 22, 12, '#d5748a');
  } else if (type === 'desk') {
    px(ctx, 0, 4, 36, 6, '#a08a6a'); px(ctx, 2, 10, 4, 14, '#6a5a45'); px(ctx, 30, 10, 4, 14, '#6a5a45');
    px(ctx, 8, 0, 12, 5, '#3a4a5a'); px(ctx, 24, 1, 8, 4, '#2b2b2b');
  } else if (type === 'shelf') {
    px(ctx, 0, 0, 36, 34, '#7a5a3a');
    const cols = ['#c94f4f', '#4f7ac9', '#4fc98a', '#c9a84f'];
    for (let s = 0; s < 4; s++) for (let i = 0; i < 6; i++) px(ctx, i * 6 + 1, s * 8 + 2, 4, 6, cols[(i + s) % 4]);
  } else if (type === 'counter' || type === 'counter2' || type === 'hdesk') {
    px(ctx, 0, 4, 36, 18, type === 'counter' ? '#a06a4a' : type === 'hdesk' ? '#dfe2e8' : '#c9a86a');
    px(ctx, 0, 4, 36, 3, 'rgba(255,255,255,.25)');
    if (type === 'counter') { px(ctx, 14, 0, 8, 5, '#e05c5c'); px(ctx, 16, 2, 4, 3, '#f2e0c9'); }
    if (type === 'counter2') { px(ctx, 12, 0, 10, 5, '#e8d07c'); px(ctx, 14, 1, 6, 3, '#7ac98a'); }
    if (type === 'hdesk') { px(ctx, 15, 0, 6, 5, '#e05c5c'); px(ctx, 17, 1, 2, 3, '#fff'); }
  } else if (type === 'equip') {
    px(ctx, 2, 8, 28, 4, '#5a5a66'); px(ctx, 12, 12, 8, 14, '#3a3a44');
    px(ctx, 4, 0, 24, 8, '#44444e'); px(ctx, 8, 2, 6, 4, '#e05c5c');
  } else if (type === 'child') {
    px(ctx, 6, 26, 8, 8, '#5c8ad5');
    px(ctx, 5, 12, 10, 10, '#f2d5b8');
    px(ctx, 6, 14, 2, 2, '#2b2b2b'); px(ctx, 12, 14, 2, 2, '#2b2b2b');
    px(ctx, 8, 17, 4, 1, '#c96a6a');
    px(ctx, 4, 10, 12, 4, '#6a4a2b');
  }
  return c;
}

// ---------- 昼夜配色 ----------
function dayPalette(minutes) {
  const h = minutes / 60;
  let sky1, sky2, ground, ceil, tint, amb;
  if (h < 10) { sky1 = '#8ad0f2'; sky2 = '#d5ecfa'; ground = '#6a6a72'; tint = null; amb = 1; }
  else if (h < 16) { sky1 = '#7ac2ee'; sky2 = '#e8f4d5'; ground = '#707078'; tint = null; amb = 1; }
  else if (h < 18.5) { sky1 = '#f2a05c'; sky2 = '#f7d5a0'; ground = '#66605a'; tint = 'rgba(255,140,60,.08)'; amb = 0.85; }
  else if (h < 20.5) { sky1 = '#6a5a8a'; sky2 = '#c97a6a'; ground = '#4a4652'; tint = 'rgba(40,40,90,.18)'; amb = 0.6; }
  else { sky1 = '#1e2438'; sky2 = '#2c3450'; ground = '#33363f'; tint = 'rgba(20,25,60,.30)'; amb = 0.45; }
  return { sky1: hex2rgb(sky1), sky2: hex2rgb(sky2), ground: hex2rgb(ground), tint, amb };
}

// ---------- 主渲染 ----------
let TEXTURES = null;
let frame = null, buf32 = null;
const zbuffer = new Float32Array(RENDER_W);

function renderScene(ctx, world, cam, minutes) {
  if (!TEXTURES) TEXTURES = buildTextures();
  const W = RENDER_W, H = RENDER_H, horizon = H >> 1;
  if (!frame) { frame = ctx.createImageData(W, H); buf32 = new Uint32Array(frame.data.buffer); }
  const pal = dayPalette(minutes);
  const MAP = world.map;

  // 天空与地面（逐行渐变）
  const gTop = mixRGB(pal.sky1, pal.sky2, 0), gBot = mixRGB(pal.sky1, pal.sky2, 1);
  const grA = pal.ground, grB = [pal.ground[0] * 0.6, pal.ground[1] * 0.6, pal.ground[2] * 0.6];
  for (let y = 0; y < H; y++) {
    let col;
    if (y < horizon) { const t = y / horizon; col = packRGB(gTop[0] + (gBot[0] - gTop[0]) * t, gTop[1] + (gBot[1] - gTop[1]) * t, gTop[2] + (gBot[2] - gTop[2]) * t); }
    else { const t = (y - horizon) / (H - horizon); col = packRGB(grA[0] + (grB[0] - grA[0]) * t, grA[1] + (grB[1] - grA[1]) * t, grA[2] + (grB[2] - grA[2]) * t); }
    buf32.fill(col, y * W, (y + 1) * W);
  }

  const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a);
  const planeX = -dirY * FOV_PLANE, planeY = dirX * FOV_PLANE;

  // 墙体 raycast（DDA）
  for (let x = 0; x < W; x++) {
    const camX = 2 * x / W - 1;
    const rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
    let mapX = cam.x | 0, mapY = cam.y | 0;
    const deltaX = Math.abs(1 / rdx), deltaY = Math.abs(1 / rdy);
    let stepX, stepY, sideDistX, sideDistY;
    if (rdx < 0) { stepX = -1; sideDistX = (cam.x - mapX) * deltaX; } else { stepX = 1; sideDistX = (mapX + 1 - cam.x) * deltaX; }
    if (rdy < 0) { stepY = -1; sideDistY = (cam.y - mapY) * deltaY; } else { stepY = 1; sideDistY = (mapY + 1 - cam.y) * deltaY; }
    let hit = 0, side = 0, tile = 0, guard = 0;
    while (!hit && guard++ < 64) {
      if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
      else { sideDistY += deltaY; mapY += stepY; side = 1; }
      tile = MAP[mapY] && MAP[mapY][mapX];
      if (tile) hit = 1;
    }
    if (!hit) { zbuffer[x] = 1e9; continue; }
    const perp = side === 0 ? (mapX - cam.x + (1 - stepX) / 2) / rdx : (mapY - cam.y + (1 - stepY) / 2) / rdy;
    zbuffer[x] = perp;
    const lineH = (H / perp) | 0;
    const y0 = Math.max(0, horizon - (lineH >> 1));
    const y1 = Math.min(H - 1, horizon + (lineH >> 1));
    const tex = TEXTURES[tile] || TEXTURES[1];
    let wallX = side === 0 ? cam.y + perp * rdy : cam.x + perp * rdx;
    wallX -= Math.floor(wallX);
    let texX = (wallX * TEX_SIZE) | 0;
    if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = TEX_SIZE - texX - 1;
    const light = (side === 1 ? 0.72 : 1) * Math.max(0.25, Math.min(1, 2.2 / perp)) * pal.amb;
    const texStep = TEX_SIZE / lineH;
    let texPos = (y0 - horizon + lineH / 2) * texStep;
    for (let y = y0; y <= y1; y++) {
      const texY = ((texPos | 0) & (TEX_SIZE - 1));
      texPos += texStep;
      const t = tex[texY * TEX_SIZE + texX];
      const r = ((t & 255) * light) | 0, g = (((t >> 8) & 255) * light) | 0, b = (((t >> 16) & 255) * light) | 0;
      buf32[y * W + x] = packRGB(r, g, b);
    }
  }
  ctx.putImageData(frame, 0, 0);

  // 精灵（NPC + 道具）
  const sprites = [];
  for (const p of world.props) sprites.push({ x: p.x, y: p.y, img: getPropImg(p.type), isProp: true });
  for (const n of world.npcLive) {
    if (n.hidden) continue;
    sprites.push({ x: n.x, y: n.y, img: n.img, name: n.name, isProp: false });
  }
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  for (const s of sprites) s.dist = (s.x - cam.x) * (s.x - cam.x) + (s.y - cam.y) * (s.y - cam.y);
  sprites.sort((a, b) => b.dist - a.dist);
  for (const s of sprites) {
    const sx = s.x - cam.x, sy = s.y - cam.y;
    const tx = invDet * (dirY * sx - dirX * sy);
    const ty = invDet * (-planeY * sx + planeX * sy);
    if (ty <= 0.15) continue;
    const screenX = (W / 2) * (1 + tx / ty) | 0;
    const h = Math.abs(H / ty) | 0;
    const sw = s.img.width, sh = s.img.height;
    const spriteH = (h * 0.85) | 0;
    const spriteW = (spriteH * sw / sh) | 0;
    const y0 = (horizon + (h >> 1) - spriteH) | 0;
    const x0 = (screenX - spriteW / 2) | 0;
    for (let col = 0; col < spriteW; col++) {
      const cx = x0 + col;
      if (cx < 0 || cx >= W) continue;
      if (ty >= zbuffer[cx]) continue;
      ctx.drawImage(s.img, (col * sw / spriteW) | 0, 0, 1, sh, cx, y0, 1, spriteH);
    }
    if (pal.amb < 0.7 && ty < 30) {
      ctx.fillStyle = `rgba(10,14,40,${(1 - pal.amb) * 0.5})`;
      ctx.fillRect(x0, y0, spriteW, spriteH);
    }
    if (!s.isProp && ty < 3.5) {
      ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(screenX - 32, y0 - 16, 64, 13);
      ctx.fillStyle = '#ffe8f0';
      ctx.fillText(s.name, screenX, y0 - 6);
    }
  }

  // 夜色滤镜与暗角
  if (pal.tint) { ctx.fillStyle = pal.tint; ctx.fillRect(0, 0, W, H); }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H / 1.1);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// ---------- 小地图 ----------
let minimapBase = null;
function buildMinimap(map) {
  const S = 4;
  const c = makeCanvas(32 * S, 32 * S), ctx = c.getContext('2d');
  const wallColors = { 1: '#3a3a44', 2: '#b98a5a', 3: '#7ca6e8', 4: '#a48be8', 5: '#c96a5a', 6: '#e8d07c', 7: '#4a5a55', 8: '#dfe2e8' };
  ctx.fillStyle = '#1c1f28'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#2b303e';
  ctx.fillRect(0, 10 * S, c.width, 2 * S); ctx.fillRect(0, 21 * S, c.width, S);
  ctx.fillStyle = '#24402f'; ctx.fillRect(2 * S, 22 * S, 15 * S, 9 * S);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const t = map[y][x];
    if (t && wallColors[t]) { ctx.fillStyle = wallColors[t]; ctx.fillRect(x * S, y * S, S, S); }
  }
  return c;
}
function renderMinimap(ctx, world, cam) {
  if (!minimapBase) minimapBase = buildMinimap(world.map);
  const S = 4;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(minimapBase, 0, 0);
  for (const n of world.npcLive) {
    if (n.hidden) continue;
    ctx.fillStyle = n.role === 'romance' ? '#ff7aa8' : '#8ad5a0';
    ctx.fillRect(n.x * S - 1.5, n.y * S - 1.5, 3, 3);
  }
  if (world.childLive) {
    ctx.fillStyle = '#ffd54f';
    ctx.fillRect(world.childLive.x * S - 1.5, world.childLive.y * S - 1.5, 3, 3);
  }
  ctx.save();
  ctx.translate(cam.x * S, cam.y * S);
  ctx.rotate(cam.a);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-3, -2.6); ctx.lineTo(-3, 2.6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------- 精灵缓存 ----------
const propImgCache = {};
function getPropImg(type) {
  if (!propImgCache[type]) propImgCache[type] = makePropSprite(type);
  return propImgCache[type];
}

const Render = {
  RENDER_W, RENDER_H, renderScene, renderMinimap, makePersonSprite, makePortrait, getPropImg, dayPalette,
};
global.Render = Render;
})(typeof window !== 'undefined' ? window : globalThis);
