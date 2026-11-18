// 《心动人生》第一人称渲染引擎 v2：raycasting + 真人比例精灵 + 高清贴图 + 昼夜 + 小地图
// 性能关键路径：墙体写入全帧 ImageData，一次 putImageData；精灵用 drawImage 逐列裁剪。
(function (global) {
'use strict';

const RENDER_W = 720, RENDER_H = 405;
const FOV_PLANE = 0.66; // 66° 视场
const TEX_SIZE = 128;

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
// 确定性伪随机（贴图噪声用）
function tnoise(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- 程序化贴图（128px 细腻版） ----------
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
  base(1, '#5a5a66', ctx => { // 边界石墙：石块 + 灰浆 + 噪点
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const off = y % 2 ? 8 : 0;
      const bx = (x * 16 + off) % 112;
      const v = 72 + ((x * 7 + y * 13) % 5) * 5 + tnoise(x, y) * 10;
      px(ctx, bx + 1, y * 16 + 1, 14, 14, `rgb(${v | 0},${v | 0},${(v + 12) | 0})`);
      px(ctx, bx + 1, y * 16 + 1, 14, 2, `rgba(255,255,255,${0.05 + tnoise(x, y + 9) * 0.06})`);
      px(ctx, bx + 1, y * 16 + 13, 14, 2, 'rgba(0,0,0,.18)');
    }
  });
  base(2, '#b98a5a', ctx => { // 家：木纹 + 竖板 + 小窗
    for (let i = 0; i < 16; i++) px(ctx, 0, i * 8, TEX_SIZE, 1, 'rgba(90,60,30,.4)');
    for (let i = 0; i < 5; i++) { // 竖板拼接
      px(ctx, i * 26 + 24, 0, 2, TEX_SIZE, 'rgba(70,45,22,.5)');
      px(ctx, i * 26 + 26, 0, 1, TEX_SIZE, 'rgba(255,235,200,.12)');
    }
    for (let i = 0; i < 40; i++) px(ctx, (tnoise(i, 3) * TEX_SIZE) | 0, (tnoise(i, 7) * TEX_SIZE) | 0, 1, 6, 'rgba(80,50,25,.25)'); // 木纹丝
    px(ctx, 22, 44, 40, 40, '#eadcc2'); px(ctx, 24, 46, 36, 36, '#8ad5e8');
    px(ctx, 40, 46, 2, 36, '#eadcc2'); px(ctx, 24, 62, 36, 2, '#eadcc2');
    px(ctx, 22, 40, 40, 4, '#8a6a45'); px(ctx, 22, 84, 40, 4, '#8a6a45');
  });
  base(3, '#7ca6e8', ctx => { // 公司：玻璃幕墙
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const lit = (x + y) % 2;
      const v = tnoise(x, y) * 8;
      px(ctx, x * 16 + 1, y * 8 + 1, 14, 6, lit ? `rgb(${148 + v | 0},${190 + v | 0},${240 + v | 0})` : `rgb(${100 + v | 0},${140 + v | 0},${208 + v | 0})`);
      px(ctx, x * 16 + 1, y * 8 + 1, 14, 1, 'rgba(255,255,255,.25)'); // 玻璃反光
    }
    px(ctx, 0, 60, TEX_SIZE, 6, '#3a5a8a');
    px(ctx, 0, 62, TEX_SIZE, 1, 'rgba(255,255,255,.2)');
  });
  base(4, '#8a6a4a', ctx => { // 图书馆：书架
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#6f5136');
    const cols = ['#b84a4a', '#4a6fb8', '#4aa878', '#b89a4a', '#7a4ab8', '#b86a4a', '#4aa8a8', '#a84a7a'];
    for (let s = 0; s < 4; s++) for (let i = 0; i < 16; i++) {
      const c = cols[(i + s * 5) % 8];
      px(ctx, i * 8 + 1, s * 30 + 5, 6, 24, c);
      px(ctx, i * 8 + 1, s * 30 + 5, 6, 2, mixRGB(hex2rgb(c), [255, 255, 255], 0.25) ? `rgba(255,255,255,.18)` : '');
      px(ctx, i * 8 + 2, s * 30 + 9, 4, 1, 'rgba(255,255,220,.35)'); // 书脊烫字
      px(ctx, i * 8 + 2, s * 30 + 15, 4, 1, 'rgba(255,255,220,.25)');
    }
    for (let s = 0; s < 4; s++) px(ctx, 0, s * 30 + 29, TEX_SIZE, 3, '#4a3320');
  });
  base(5, '#c96a5a', ctx => { // 咖啡厅：红砖 + 招牌窗
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const off = y % 2 ? 8 : 0;
      const bx = (x * 16 + off) % 120;
      const v = tnoise(x, y) * 14;
      px(ctx, bx + 1, y * 8 + 1, 14, 6, y % 2 ? `rgb(${213 + v | 0},${120 + v | 0},${98 + v | 0})` : `rgb(${186 + v | 0},${88 + v | 0},${70 + v | 0})`);
      px(ctx, bx + 1, y * 8 + 1, 14, 1, 'rgba(255,220,200,.12)');
    }
    px(ctx, 40, 16, 48, 36, '#f2e0c9'); px(ctx, 43, 19, 42, 30, '#4a3020');
    px(ctx, 46, 22, 36, 10, '#e8b46a'); px(ctx, 48, 36, 32, 10, '#c9a05c');
    px(ctx, 56, 24, 4, 20, '#4a3020'); px(ctx, 68, 24, 4, 20, '#4a3020'); // 窗棂
    px(ctx, 40, 12, 48, 4, '#8a4a3a');
  });
  base(6, '#d5c07a', ctx => { // 商场
    px(ctx, 0, 0, TEX_SIZE, 48, '#e8d88a');
    px(ctx, 0, 48, TEX_SIZE, 80, '#c0aa60');
    for (let i = 0; i < 30; i++) px(ctx, (tnoise(i, 11) * TEX_SIZE) | 0, 48 + (tnoise(i, 13) * 80) | 0, 2, 2, 'rgba(120,100,50,.15)');
    px(ctx, 12, 12, 104, 24, '#f7f2d5'); px(ctx, 14, 14, 100, 20, '#e05c7a');
    px(ctx, 16, 16, 96, 16, '#f7c9d5');
    const shopCols = ['#7ac98a', '#7a9ec9', '#c9c97a', '#c97a9e'];
    for (let i = 0; i < 4; i++) {
      px(ctx, 16 + i * 26, 68, 20, 44, shopCols[i]);
      px(ctx, 16 + i * 26, 68, 20, 3, 'rgba(255,255,255,.3)');
      px(ctx, 22 + i * 26, 78, 8, 8, '#f2ead5'); // 橱窗
    }
  });
  base(7, '#4a5a55', ctx => { // 健身房
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#37453f');
    for (let i = 0; i < 40; i++) px(ctx, (tnoise(i, 17) * TEX_SIZE) | 0, (tnoise(i, 19) * TEX_SIZE) | 0, 3, 1, 'rgba(255,255,255,.04)');
    px(ctx, 8, 52, 112, 24, '#e8e8e8'); px(ctx, 12, 56, 104, 16, '#22252a');
    px(ctx, 20, 60, 32, 8, '#e05c5c'); px(ctx, 72, 60, 36, 8, '#5ce0b0'); // GYM
    px(ctx, 8, 52, 112, 2, 'rgba(255,255,255,.4)');
    px(ctx, 20, 24, 88, 6, '#5a6a64'); px(ctx, 30, 18, 6, 12, '#5a6a64'); px(ctx, 92, 18, 6, 12, '#5a6a64'); // 杠铃
  });
  base(8, '#e8e8ec', ctx => { // 医院
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#dde1e8');
    for (let y = 0; y < 16; y++) px(ctx, 0, y * 8, TEX_SIZE, 1, 'rgba(160,168,182,.25)');
    px(ctx, 44, 28, 40, 12, '#e05c5c'); px(ctx, 58, 14, 12, 40, '#e05c5c'); // 红十字
    px(ctx, 44, 28, 40, 2, 'rgba(255,255,255,.3)');
    px(ctx, 0, 88, TEX_SIZE, 6, '#b8bdc9'); px(ctx, 0, 90, TEX_SIZE, 1, 'rgba(0,0,0,.12)');
  });
  return T;
}

// ---------- 人物精灵（真人比例 32×96，约4.5头身） ----------
// frame: 0 站立 | 1 迈步A | 2 迈步B | 'wave' 挥手
function makePersonSprite(style, frame) {
  const W = 32, H = 96;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const { hair, hairStyle, skin, top, bottom } = style;
  const f = frame || 0;
  const skinD = mixRGB(hex2rgb(skin), [20, 10, 0], 0.25);   // 肤色阴影
  const topD = mixRGB(hex2rgb(top), [0, 0, 20], 0.3);        // 衣物暗面
  const topRGB = hex2rgb(top), hairRGB = hex2rgb(hair), bottomRGB = hex2rgb(bottom);
  const css = (c1, a) => `rgba(${c1[0] | 0},${c1[1] | 0},${c1[2] | 0},${a})`;
  const rgb = c1 => `rgb(${c1[0] | 0},${c1[1] | 0},${c1[2] | 0})`;
  const skinCss = rgb(hex2rgb(skin)), skinDark = rgb(skinD);

  // ---- 腿与鞋（迈步帧前后错位，膝盖折点） ----
  function leg(x, lift, back) {
    const ly = 58 + lift;
    px(ctx, x, ly, 5, 30 - lift - 4, rgb(bottomRGB));           // 裤管
    px(ctx, x, ly, 2, 30 - lift - 4, css(bottomRGB, 0.75));      // 裤管暗面
    px(ctx, x, ly + 26 - lift - 4, 5, 1, 'rgba(0,0,0,.2)');
    px(ctx, back ? x + 1 : x - 1, 86 - lift, 6, 4, '#2b2b30');   // 鞋
    px(ctx, back ? x + 1 : x - 1, 86 - lift, 6, 1, '#4a4a52');
  }
  if (f === 1) { leg(12, 3, false); leg(19, 0, true); }
  else if (f === 2) { leg(12, 0, true); leg(19, 3, false); }
  else { leg(12, 0, false); leg(19, 0, false); }

  // ---- 躯干（上衣 + 明暗 + 领口） ----
  px(ctx, 9, 28, 14, 32, rgb(topRGB));            // 主面
  px(ctx, 9, 28, 4, 32, css(mixRGB(topRGB, [255, 255, 255], 0.18), 1)); // 受光面
  px(ctx, 19, 28, 4, 32, rgb(topD));              // 背光面
  px(ctx, 9, 57, 14, 3, rgb(topD));               // 下摆阴影
  px(ctx, 14, 28, 4, 6, skinCss);                 // 领口 V
  px(ctx, 14, 27, 4, 1, rgb(mixRGB(topRGB, [0, 0, 0], 0.35)));
  px(ctx, 9, 44, 14, 2, css(mixRGB(topRGB, [255, 255, 255], 0.12), 0.5)); // 衣褶

  // ---- 手臂（贴身/摆动/高举） ----
  function arm(x, yTop, yBot, sleeve) {
    px(ctx, x, yTop, 3, yBot - yTop, rgb(sleeve ? mixRGB(topRGB, [0, 0, 0], 0.12) : topRGB));
    px(ctx, x, yTop, 1, yBot - yTop, css(mixRGB(topRGB, [255, 255, 255], 0.15), 1));
    px(ctx, x, yBot, 3, 4, skinCss);              // 手
    px(ctx, x, yBot + 3, 3, 1, skinDark);
  }
  if (f === 'wave') {
    arm(6, 30, 48, true);                          // 左臂垂
    px(ctx, 23, 14, 3, 16, rgb(topRGB));           // 右臂高举
    px(ctx, 24, 12, 3, 4, skinCss); px(ctx, 24, 11, 3, 2, skinCss);
    px(ctx, 27, 16, 1, 12, css(mixRGB(topRGB, [255, 255, 255], 0.2), 1));
  } else if (f === 1) {
    arm(5, 26, 44, true); arm(24, 32, 50, true);   // 左前右后
  } else if (f === 2) {
    arm(24, 26, 44, true); arm(5, 32, 50, true);
  } else {
    arm(6, 30, 48, true); arm(23, 30, 48, true);
  }

  // ---- 头颈 ----
  px(ctx, 14, 22, 4, 7, skinCss);                  // 颈
  px(ctx, 14, 27, 4, 2, skinDark);
  px(ctx, 9, 6, 14, 17, skinCss);                  // 脸
  px(ctx, 9, 18, 14, 4, skinCss);                  // 下颌
  px(ctx, 9, 20, 2, 3, skinDark); px(ctx, 21, 20, 2, 3, skinDark); // 颊侧阴影
  // 五官
  px(ctx, 11, 12, 4, 3, '#ffffff'); px(ctx, 17, 12, 4, 3, '#ffffff');  // 眼白
  px(ctx, 12, 12, 2, 3, '#3a3a48'); px(ctx, 18, 12, 2, 3, '#3a3a48');  // 瞳
  px(ctx, 12, 12, 1, 1, '#fff'); px(ctx, 18, 12, 1, 1, '#fff');        // 高光
  px(ctx, 11, 10, 4, 1, rgb(mixRGB(hairRGB, [0, 0, 0], 0.3)));         // 眉
  px(ctx, 17, 10, 4, 1, rgb(mixRGB(hairRGB, [0, 0, 0], 0.3)));
  px(ctx, 15, 16, 1, 2, skinDark);                 // 鼻影
  px(ctx, 14, 19, 4, 1, '#c07a7a');                // 唇

  // ---- 发型 ----
  const hairD = rgb(mixRGB(hairRGB, [0, 0, 0], 0.3));
  const hairL = rgb(mixRGB(hairRGB, [255, 255, 255], 0.22));
  if (hairStyle === 'long') {
    px(ctx, 8, 4, 16, 10, rgb(hairRGB));
    px(ctx, 8, 4, 16, 3, hairL);                   // 顶部高光
    px(ctx, 7, 8, 3, 42, rgb(hairRGB)); px(ctx, 22, 8, 3, 42, rgb(hairRGB)); // 垂发
    px(ctx, 7, 8, 1, 42, hairD); px(ctx, 24, 8, 1, 42, hairD);
    px(ctx, 10, 12, 4, 3, rgb(hairRGB)); px(ctx, 18, 12, 4, 3, rgb(hairRGB)); // 刘海
    px(ctx, 11, 13, 2, 1, hairD);
  } else if (hairStyle === 'short') {
    px(ctx, 8, 4, 16, 9, rgb(hairRGB));
    px(ctx, 8, 4, 16, 3, hairL);
    px(ctx, 8, 10, 2, 3, hairD); px(ctx, 22, 10, 2, 3, hairD);
    px(ctx, 11, 12, 3, 2, rgb(hairRGB)); px(ctx, 18, 12, 3, 2, rgb(hairRGB));
  } else if (hairStyle === 'ponytail') {
    px(ctx, 8, 4, 16, 9, rgb(hairRGB));
    px(ctx, 8, 4, 16, 3, hairL);
    px(ctx, 24, 8, 4, 26, rgb(hairRGB)); px(ctx, 25, 10, 2, 20, hairD); // 侧马尾
    px(ctx, 24, 32, 4, 3, hairL);
    px(ctx, 10, 12, 4, 2, rgb(hairRGB)); px(ctx, 18, 12, 4, 2, rgb(hairRGB));
  } else if (hairStyle === 'bob') {
    px(ctx, 8, 3, 16, 11, rgb(hairRGB));
    px(ctx, 8, 3, 16, 3, hairL);
    px(ctx, 7, 9, 2, 14, rgb(hairRGB)); px(ctx, 23, 9, 2, 14, rgb(hairRGB));
    px(ctx, 7, 9, 1, 14, hairD); px(ctx, 24, 9, 1, 14, hairD);
    px(ctx, 11, 12, 4, 2, rgb(hairRGB)); px(ctx, 17, 12, 4, 2, rgb(hairRGB));
  } else if (hairStyle === 'cap') {
    px(ctx, 8, 4, 16, 7, rgb(hairRGB));
    px(ctx, 8, 4, 16, 2, hairL);
    px(ctx, 6, 10, 20, 3, rgb(mixRGB(hairRGB, [0, 0, 0], 0.4)));   // 帽檐
    px(ctx, 6, 10, 20, 1, hairL);
    px(ctx, 13, 5, 6, 4, css(mixRGB(hairRGB, [255, 255, 255], 0.3), 1));
    px(ctx, 11, 12, 3, 2, rgb(hairRGB)); px(ctx, 18, 12, 3, 2, rgb(hairRGB));
  }
  return c;
}

// ---------- 立绘（Galgame 半身像，四表情） ----------
// expr: normal | happy | shy | sad
const portraitCache = {};
function makePortrait(style, expr) {
  const key = JSON.stringify(style) + '|' + expr;
  if (portraitCache[key]) return portraitCache[key];
  const W = 140, H = 210;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const { hair, hairStyle, skin, top, bottom } = style;
  const blush = 'rgba(245,150,150,.55)', dark = '#2b2b33';
  const hairRGB = hex2rgb(hair), topRGB = hex2rgb(top), skinRGB = hex2rgb(skin);
  const rgb = c1 => `rgb(${c1[0] | 0},${c1[1] | 0},${c1[2] | 0})`;
  const hairD = rgb(mixRGB(hairRGB, [0, 0, 0], 0.32)), hairL = rgb(mixRGB(hairRGB, [255, 255, 255], 0.25));
  const topD = rgb(mixRGB(topRGB, [0, 0, 25], 0.3));

  // 肩与身体
  px(ctx, 34, 156, 72, 54, rgb(topRGB));
  px(ctx, 28, 170, 14, 40, rgb(topRGB)); px(ctx, 98, 170, 14, 40, rgb(topRGB));
  px(ctx, 34, 156, 72, 6, css(topRGB, 0));
  px(ctx, 34, 156, 24, 54, `rgba(255,255,255,.10)`);          // 受光
  px(ctx, 82, 156, 24, 54, `rgba(0,0,20,.14)`);               // 背光
  px(ctx, 62, 156, 18, 16, rgb(skinRGB));                     // 颈
  px(ctx, 62, 168, 18, 5, rgb(mixRGB(skinRGB, [30, 15, 0], 0.3)));
  px(ctx, 56, 170, 30, 12, rgb(topD));                        // 领口
  px(ctx, 44, 200, 52, 8, rgb(topD));                         // 下摆
  // 头
  px(ctx, 40, 62, 60, 76, rgb(skinRGB));
  px(ctx, 46, 132, 48, 12, rgb(skinRGB));                     // 下颌
  px(ctx, 40, 100, 5, 20, rgb(mixRGB(skinRGB, [25, 12, 0], 0.22)));
  px(ctx, 95, 100, 5, 20, rgb(mixRGB(skinRGB, [25, 12, 0], 0.22)));
  px(ctx, 36, 96, 6, 12, rgb(skinRGB)); px(ctx, 98, 96, 6, 12, rgb(skinRGB)); // 耳

  // 五官
  const eyeY = 98;
  function eye(x) {
    px(ctx, x, eyeY, 12, 8, '#fff');                          // 眼白
    px(ctx, x + 2, eyeY + 1, 7, 6, '#3f3f52');                // 瞳
    px(ctx, x + 3, eyeY + 1, 3, 3, irisColor());              // 虹膜
    px(ctx, x + 3, eyeY + 2, 2, 2, '#fff');                   // 高光
    px(ctx, x, eyeY + 7, 12, 1, rgb(mixRGB(skinRGB, [120, 60, 40], 0.4))); // 下睑
    px(ctx, x - 1, eyeY - 5, 14, 2, hairD);                   // 眉
  }
  function irisColor() { return expr === 'happy' || expr === 'shy' ? '#6a5a9a' : '#4a5a7a'; }
  const mouth = (mx, my, w, open) => {
    if (open) { px(ctx, mx, my, w, 6, '#b5606a'); px(ctx, mx, my, w, 2, '#d5858f'); }
    else px(ctx, mx, my, w, 2, '#c4707a');
  };
  if (expr === 'happy') {
    for (let i = 0; i < 12; i++) { px(ctx, 48 + i, eyeY + (i < 6 ? i : 11 - i) / 1.4 | 0, 1, 2, dark); px(ctx, 80 + i, eyeY + (i < 6 ? i : 11 - i) / 1.4 | 0, 1, 2, dark); }
    px(ctx, 64, 122, 14, 8, '#b5606a'); px(ctx, 65, 121, 12, 2, '#d5858f');
    px(ctx, 46, 114, 14, 5, blush); px(ctx, 82, 114, 14, 5, blush);
    px(ctx, 116, 56, 4, 4, '#ff9ec4'); px(ctx, 124, 70, 3, 3, '#ffd9e8'); px(ctx, 20, 66, 3, 3, '#ffd9e8');
  } else if (expr === 'shy') {
    eye(48); eye(80);
    px(ctx, 48, eyeY - 3, 12, 1, hairD); px(ctx, 80, eyeY - 3, 12, 1, hairD);
    px(ctx, 44, 110, 16, 8, blush); px(ctx, 80, 110, 16, 8, blush);
    mouth(64, 124, 8, false);
    px(ctx, 18, 70, 4, 4, '#ff9ec4'); px(ctx, 14, 82, 3, 3, '#ffd9e8');
  } else if (expr === 'sad') {
    eye(48); eye(80);
    px(ctx, 47, eyeY - 4, 14, 2, dark); px(ctx, 79, eyeY - 2, 14, 2, dark);   // 八字眉
    px(ctx, 52, eyeY + 9, 6, 2, 'rgba(180,220,240,.6)'); px(ctx, 84, eyeY + 9, 6, 2, 'rgba(180,220,240,.6)'); // 泪光
    mouth(64, 127, 10, false);
  } else {
    eye(48); eye(80);
    mouth(65, 123, 10, false);
  }

  // 发型（放大）
  if (hairStyle === 'long') {
    px(ctx, 38, 52, 64, 18, rgb(hairRGB));
    px(ctx, 38, 44, 64, 14, rgb(hairRGB));
    px(ctx, 40, 40, 60, 8, hairL);
    px(ctx, 36, 58, 9, 96, rgb(hairRGB)); px(ctx, 95, 58, 9, 96, rgb(hairRGB));
    px(ctx, 36, 58, 2, 96, hairD); px(ctx, 102, 58, 2, 96, hairD);
    px(ctx, 46, 66, 12, 8, rgb(hairRGB)); px(ctx, 82, 66, 12, 8, rgb(hairRGB));
  } else if (hairStyle === 'short') {
    px(ctx, 38, 50, 64, 20, rgb(hairRGB));
    px(ctx, 40, 44, 60, 10, hairL);
    px(ctx, 36, 58, 7, 16, rgb(hairRGB)); px(ctx, 97, 58, 7, 16, rgb(hairRGB));
    px(ctx, 48, 66, 12, 6, rgb(hairRGB)); px(ctx, 80, 66, 12, 6, rgb(hairRGB));
  } else if (hairStyle === 'ponytail') {
    px(ctx, 38, 50, 64, 20, rgb(hairRGB));
    px(ctx, 40, 44, 60, 10, hairL);
    px(ctx, 98, 58, 16, 66, rgb(hairRGB)); px(ctx, 100, 60, 6, 50, hairD);
    px(ctx, 102, 52, 12, 12, rgb(hairRGB));
    px(ctx, 48, 66, 12, 6, rgb(hairRGB)); px(ctx, 80, 66, 12, 6, rgb(hairRGB));
  } else if (hairStyle === 'bob') {
    px(ctx, 38, 48, 64, 24, rgb(hairRGB));
    px(ctx, 40, 42, 60, 10, hairL);
    px(ctx, 36, 60, 8, 40, rgb(hairRGB)); px(ctx, 96, 60, 8, 40, rgb(hairRGB));
    px(ctx, 36, 60, 2, 40, hairD); px(ctx, 102, 60, 2, 40, hairD);
    px(ctx, 48, 68, 10, 5, rgb(hairRGB)); px(ctx, 82, 68, 10, 5, rgb(hairRGB));
  } else if (hairStyle === 'cap') {
    px(ctx, 40, 46, 60, 18, rgb(hairRGB));
    px(ctx, 42, 42, 56, 8, hairL);
    px(ctx, 32, 60, 76, 6, rgb(mixRGB(hairRGB, [0, 0, 0], 0.4)));
    px(ctx, 32, 60, 76, 1, hairL);
    px(ctx, 54, 46, 14, 12, css(mixRGB(hairRGB, [255, 255, 255], 0.3), 1));
    px(ctx, 48, 66, 10, 5, rgb(hairRGB)); px(ctx, 82, 66, 10, 5, rgb(hairRGB));
  }
  function css(c1, a) { return `rgba(${c1[0] | 0},${c1[1] | 0},${c1[2] | 0},${a})`; }
  portraitCache[key] = c;
  return c;
}

// ---------- 道具精灵 ----------
function makePropSprite(type) {
  const map = {
    tree: [40, 72], lamp: [20, 72], bench: [40, 26], fountain: [60, 40],
    bed: [48, 28], desk: [44, 30], shelf: [44, 44], counter: [44, 28],
    counter2: [44, 28], equip: [40, 32], hdesk: [44, 28], child: [26, 46],
  };
  const dim = map[type] || [28, 40];
  const c = makeCanvas(dim[0], dim[1]), ctx = c.getContext('2d');
  const W = dim[0], H = dim[1];
  if (type === 'tree') {
    px(ctx, 16, 44, 8, 28, '#6a4a2b');
    px(ctx, 16, 44, 3, 28, '#7d5a37'); px(ctx, 21, 44, 3, 28, '#553a20');
    px(ctx, 5, 8, 30, 38, '#3a7a4a');
    px(ctx, 9, 2, 22, 16, '#4a9a5a'); px(ctx, 2, 20, 13, 18, '#2f6a3f'); px(ctx, 27, 20, 12, 17, '#2f6a3f');
    px(ctx, 12, 10, 11, 9, '#5aaa6a');
    px(ctx, 9, 3, 8, 3, 'rgba(160,220,170,.4)');
    px(ctx, 7, 24, 6, 4, 'rgba(20,50,30,.35)'); px(ctx, 26, 26, 6, 4, 'rgba(20,50,30,.35)');
  } else if (type === 'lamp') {
    px(ctx, 9, 8, 4, 64, '#3a3a44');
    px(ctx, 9, 8, 1, 64, '#55555f');
    px(ctx, 4, 0, 14, 10, '#f7e8a0'); px(ctx, 6, 2, 10, 6, '#fff8d0');
    px(ctx, 4, 0, 14, 2, '#ffefb0');
    px(ctx, 7, 74, 8, 2, '#2b2b33');
  } else if (type === 'bench') {
    px(ctx, 0, 6, 40, 6, '#8a6a4a'); px(ctx, 0, 16, 40, 5, '#8a6a4a');
    px(ctx, 0, 6, 40, 2, '#a5825e');
    for (let i = 0; i < 5; i++) px(ctx, 2 + i * 8, 6, 1, 16, '#6f543a');
    px(ctx, 3, 12, 5, 14, '#5a4530'); px(ctx, 32, 12, 5, 14, '#5a4530');
  } else if (type === 'fountain') {
    px(ctx, 2, 18, 56, 22, '#8a92a0'); px(ctx, 5, 20, 50, 18, '#5aa8d5');
    px(ctx, 5, 20, 50, 3, '#7cc0e8');
    px(ctx, 25, 2, 10, 20, '#8a92a0'); px(ctx, 20, 0, 20, 5, '#5aa8d5');
    px(ctx, 28, 6, 4, 12, '#a8d5f2');
    px(ctx, 2, 36, 56, 4, '#6a7280');
  } else if (type === 'bed') {
    px(ctx, 0, 3, 48, 25, '#8a6a4a'); px(ctx, 2, 5, 44, 20, '#e8e0d0');
    px(ctx, 2, 5, 15, 13, '#f8f4ec'); px(ctx, 20, 8, 26, 15, '#d5748a');
    px(ctx, 20, 8, 26, 3, '#e891a4');
    px(ctx, 0, 3, 48, 3, '#a5825e');
  } else if (type === 'desk') {
    px(ctx, 0, 6, 44, 7, '#a08a6a'); px(ctx, 0, 6, 44, 2, '#b89e78');
    px(ctx, 3, 13, 5, 17, '#6a5a45'); px(ctx, 36, 13, 5, 17, '#6a5a45');
    px(ctx, 9, 0, 15, 7, '#3a4a5a'); px(ctx, 10, 1, 13, 5, '#5a7a9a');   // 显示器
    px(ctx, 14, 7, 5, 2, '#3a4a5a');
    px(ctx, 28, 2, 10, 5, '#2b2b2b'); px(ctx, 30, 3, 6, 1, '#4a4a52');   // 键盘
  } else if (type === 'shelf') {
    px(ctx, 0, 0, 44, 44, '#7a5a3a');
    const cols = ['#c94f4f', '#4f7ac9', '#4fc98a', '#c9a84f', '#8a4fc9', '#c96f4f'];
    for (let s = 0; s < 5; s++) for (let i = 0; i < 7; i++) {
      px(ctx, i * 6 + 2, s * 9 + 3, 4, 7, cols[(i + s * 2) % 6]);
      px(ctx, i * 6 + 2, s * 9 + 3, 4, 1, 'rgba(255,255,255,.15)');
    }
    for (let s = 0; s < 5; s++) px(ctx, 0, s * 9 + 10, 44, 1, '#5a4028');
    px(ctx, 0, 0, 44, 3, '#8f6c48');
  } else if (type === 'counter' || type === 'counter2' || type === 'hdesk') {
    px(ctx, 0, 6, 44, 22, type === 'counter' ? '#a06a4a' : type === 'hdesk' ? '#dfe2e8' : '#c9a86a');
    px(ctx, 0, 6, 44, 3, 'rgba(255,255,255,.3)');
    px(ctx, 0, 24, 44, 4, 'rgba(0,0,0,.15)');
    if (type === 'counter') { px(ctx, 16, 0, 10, 7, '#e05c5c'); px(ctx, 18, 2, 5, 4, '#f2e0c9'); px(ctx, 26, 2, 3, 4, '#c9a05c'); }
    if (type === 'counter2') { px(ctx, 14, 0, 12, 7, '#e8d07c'); px(ctx, 16, 1, 8, 2, '#f2e5a8'); px(ctx, 17, 3, 6, 3, '#7ac98a'); px(ctx, 29, 1, 8, 5, '#c97a9e'); }
    if (type === 'hdesk') { px(ctx, 18, 0, 7, 7, '#e05c5c'); px(ctx, 20, 2, 3, 3, '#fff'); }
  } else if (type === 'equip') {
    px(ctx, 2, 10, 36, 5, '#5a5a66'); px(ctx, 2, 10, 36, 1, '#7a7a88');
    px(ctx, 15, 15, 10, 17, '#3a3a44');
    px(ctx, 5, 0, 30, 10, '#44444e'); px(ctx, 5, 0, 30, 2, '#5c5c6a');
    px(ctx, 10, 3, 8, 5, '#e05c5c'); px(ctx, 22, 3, 8, 5, '#5ce0b0');
    px(ctx, 14, 32, 12, 3, '#2b2b30');
  } else if (type === 'child') {
    px(ctx, 8, 34, 10, 12, '#5c8ad5');
    px(ctx, 8, 34, 3, 12, '#77a0e8');
    px(ctx, 6, 16, 14, 14, '#f2d5b8');
    px(ctx, 8, 20, 3, 3, '#2b2b2b'); px(ctx, 15, 20, 3, 3, '#2b2b2b');
    px(ctx, 11, 25, 5, 1, '#c96a6a');
    px(ctx, 5, 13, 16, 5, '#6a4a2b'); px(ctx, 5, 13, 16, 1, '#7d5a37');
    px(ctx, 9, 46, 3, 3, '#2b2b30'); px(ctx, 14, 46, 3, 3, '#2b2b30');
  }
  return c;
}

// ---------- 昼夜配色 ----------
function dayPalette(minutes) {
  const h = minutes / 60;
  let sky1, sky2, ground, tint, amb;
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

function renderScene(ctx, world, cam, minutes, opts) {
  if (!TEXTURES) TEXTURES = buildTextures();
  const W = RENDER_W, H = RENDER_H;
  const pitch = (opts && opts.pitch) ? Math.max(-170, Math.min(170, opts.pitch)) : 0;
  const horizon = Math.max(50, Math.min(H - 50, (H >> 1) + pitch));
  if (!frame) { frame = ctx.createImageData(W, H); buf32 = new Uint32Array(frame.data.buffer); }
  const pal = dayPalette(minutes);
  const MAP = world.map;

  // 天空与地面（逐行渐变，按 pitch 偏移的地平线）
  const gTop = mixRGB(pal.sky1, pal.sky2, 0), gBot = mixRGB(pal.sky1, pal.sky2, 1);
  const grA = pal.ground, grB = [pal.ground[0] * 0.55, pal.ground[1] * 0.55, pal.ground[2] * 0.55];
  for (let y = 0; y < H; y++) {
    let col;
    if (y < horizon) { const t = Math.max(0, y / Math.max(1, horizon)); col = packRGB(gTop[0] + (gBot[0] - gTop[0]) * t, gTop[1] + (gBot[1] - gTop[1]) * t, gTop[2] + (gBot[2] - gTop[2]) * t); }
    else { const t = (y - horizon) / Math.max(1, H - horizon); col = packRGB(grA[0] + (grB[0] - grA[0]) * t, grA[1] + (grB[1] - grA[1]) * t, grA[2] + (grB[2] - grA[2]) * t); }
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
    // 光照：侧面暗 + 距离雾（平滑曲线） + 昼夜 + 垂直微渐变
    const fog = Math.max(0.2, Math.min(1, 1.9 / (perp + 0.35)));
    const baseLight = (side === 1 ? 0.74 : 1) * (0.55 + fog * 0.45) * pal.amb;
    const texStep = TEX_SIZE / lineH;
    let texPos = (y0 - horizon + lineH / 2) * texStep;
    for (let y = y0; y <= y1; y++) {
      const texY = ((texPos | 0) & (TEX_SIZE - 1));
      texPos += texStep;
      const vLight = baseLight * (0.92 + 0.08 * (texY / TEX_SIZE)); // 上亮下暗
      const t = tex[texY * TEX_SIZE + texX];
      const r = ((t & 255) * vLight) | 0, g = (((t >> 8) & 255) * vLight) | 0, b = (((t >> 16) & 255) * vLight) | 0;
      buf32[y * W + x] = packRGB(r, g, b);
    }
  }
  ctx.putImageData(frame, 0, 0);

  // 精灵（NPC + 道具 + 第三人称玩家）
  const sprites = [];
  for (const p of world.props) sprites.push({ x: p.x, y: p.y, img: getPropImg(p.type), isProp: true });
  for (const n of world.npcLive) {
    if (n.hidden) continue;
    const frameIdx = n.moving ? [0, 1, 0, 2][Math.floor(n.walkT || 0) % 4] : 0;
    const img = n.waving ? n.imgs[n.imgs.length - 1] : n.imgs[frameIdx];
    sprites.push({ x: n.x, y: n.y, img, name: n.name, isProp: false });
  }
  if (opts && opts.playerSprite) {
    const ps = opts.playerSprite;
    sprites.push({ x: ps.x, y: ps.y, img: ps.img, name: null, isProp: true, isPlayer: true });
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
    for (let col = 0; col < spriteW; col += 1) {
      const cx = x0 + col;
      if (cx < 0 || cx >= W) continue;
      if (ty >= zbuffer[cx]) continue;
      ctx.drawImage(s.img, (col * sw / spriteW) | 0, 0, 1, sh, cx, y0, 1, spriteH);
    }
    if (pal.amb < 0.7 && ty < 30) {
      ctx.fillStyle = `rgba(10,14,40,${(1 - pal.amb) * 0.5})`;
      ctx.fillRect(x0, y0, spriteW, spriteH);
    }
    if (!s.isProp && !s.isPlayer && ty < 4.2) {
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(screenX - 36, y0 - 18, 72, 14);
      ctx.fillStyle = '#ffe8f0';
      ctx.fillText(s.name, screenX, y0 - 8);
    }
  }

  // 夜色滤镜与暗角
  if (pal.tint) { ctx.fillStyle = pal.tint; ctx.fillRect(0, 0, W, H); }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H / 2.6, W / 2, H / 2, H / 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.30)');
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
function renderMinimap(ctx, world, player, cam) {
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
  ctx.translate(player.x * S, player.y * S);
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
