// 《心动人生》3D 渲染引擎（Three.js r128，本地打包）
// 建筑/树木/道具/人物全 3D，真实光影阴影与昼夜；保留 2D 立绘与小地图。
(function (global) {
'use strict';

// ============ 2D 工具（立绘 / 小地图 / 贴图绘制） ============
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function px(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function hex2rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixRGB(c1, c2, t) {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}
function rgbCss(c1) { return `rgb(${c1[0] | 0},${c1[1] | 0},${c1[2] | 0})`; }
function tnoise(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- 墙体贴图（128px，CanvasTexture 用） ----------
const TEX_SIZE = 128;
function buildTextures() {
  const T = {};
  function base(id, bg, fn) {
    const c = makeCanvas(TEX_SIZE, TEX_SIZE), ctx = c.getContext('2d');
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, bg);
    fn(ctx);
    T[id] = c;
  }
  base(1, '#5a5a66', ctx => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const off = y % 2 ? 8 : 0, bx = (x * 16 + off) % 112;
      const v = 72 + ((x * 7 + y * 13) % 5) * 5 + tnoise(x, y) * 10;
      px(ctx, bx + 1, y * 16 + 1, 14, 14, `rgb(${v | 0},${v | 0},${(v + 12) | 0})`);
      px(ctx, bx + 1, y * 16 + 13, 14, 2, 'rgba(0,0,0,.18)');
    }
  });
  base(2, '#b98a5a', ctx => {
    for (let i = 0; i < 16; i++) px(ctx, 0, i * 8, TEX_SIZE, 1, 'rgba(90,60,30,.4)');
    for (let i = 0; i < 5; i++) { px(ctx, i * 26 + 24, 0, 2, TEX_SIZE, 'rgba(70,45,22,.5)'); px(ctx, i * 26 + 26, 0, 1, TEX_SIZE, 'rgba(255,235,200,.12)'); }
    for (let i = 0; i < 40; i++) px(ctx, (tnoise(i, 3) * TEX_SIZE) | 0, (tnoise(i, 7) * TEX_SIZE) | 0, 1, 6, 'rgba(80,50,25,.25)');
    px(ctx, 22, 44, 40, 40, '#eadcc2'); px(ctx, 24, 46, 36, 36, '#8ad5e8');
    px(ctx, 40, 46, 2, 36, '#eadcc2'); px(ctx, 24, 62, 36, 2, '#eadcc2');
  });
  base(3, '#7ca6e8', ctx => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const lit = (x + y) % 2, v = tnoise(x, y) * 8;
      px(ctx, x * 16 + 1, y * 8 + 1, 14, 6, lit ? `rgb(${148 + v | 0},${190 + v | 0},${240 + v | 0})` : `rgb(${100 + v | 0},${140 + v | 0},${208 + v | 0})`);
      px(ctx, x * 16 + 1, y * 8 + 1, 14, 1, 'rgba(255,255,255,.25)');
    }
    px(ctx, 0, 60, TEX_SIZE, 6, '#3a5a8a');
  });
  base(4, '#8a6a4a', ctx => {
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#6f5136');
    const cols = ['#b84a4a', '#4a6fb8', '#4aa878', '#b89a4a', '#7a4ab8', '#b86a4a', '#4aa8a8', '#a84a7a'];
    for (let s = 0; s < 4; s++) for (let i = 0; i < 16; i++) {
      px(ctx, i * 8 + 1, s * 30 + 5, 6, 24, cols[(i + s * 5) % 8]);
      px(ctx, i * 8 + 2, s * 30 + 9, 4, 1, 'rgba(255,255,220,.35)');
    }
    for (let s = 0; s < 4; s++) px(ctx, 0, s * 30 + 29, TEX_SIZE, 3, '#4a3320');
  });
  base(5, '#c96a5a', ctx => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const off = y % 2 ? 8 : 0, bx = (x * 16 + off) % 120, v = tnoise(x, y) * 14;
      px(ctx, bx + 1, y * 8 + 1, 14, 6, y % 2 ? `rgb(${213 + v | 0},${120 + v | 0},${98 + v | 0})` : `rgb(${186 + v | 0},${88 + v | 0},${70 + v | 0})`);
    }
    px(ctx, 40, 16, 48, 36, '#f2e0c9'); px(ctx, 43, 19, 42, 30, '#4a3020');
    px(ctx, 46, 22, 36, 10, '#e8b46a');
  });
  base(6, '#d5c07a', ctx => {
    px(ctx, 0, 0, TEX_SIZE, 48, '#e8d88a'); px(ctx, 0, 48, TEX_SIZE, 80, '#c0aa60');
    px(ctx, 12, 12, 104, 24, '#f7f2d5'); px(ctx, 14, 14, 100, 20, '#e05c7a');
    const shopCols = ['#7ac98a', '#7a9ec9', '#c9c97a', '#c97a9e'];
    for (let i = 0; i < 4; i++) { px(ctx, 16 + i * 26, 68, 20, 44, shopCols[i]); px(ctx, 22 + i * 26, 78, 8, 8, '#f2ead5'); }
  });
  base(7, '#4a5a55', ctx => {
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#37453f');
    px(ctx, 8, 52, 112, 24, '#e8e8e8'); px(ctx, 12, 56, 104, 16, '#22252a');
    px(ctx, 20, 60, 32, 8, '#e05c5c'); px(ctx, 72, 60, 36, 8, '#5ce0b0');
    px(ctx, 20, 24, 88, 6, '#5a6a64');
  });
  base(8, '#e8e8ec', ctx => {
    px(ctx, 0, 0, TEX_SIZE, TEX_SIZE, '#dde1e8');
    for (let y = 0; y < 16; y++) px(ctx, 0, y * 8, TEX_SIZE, 1, 'rgba(160,168,182,.25)');
    px(ctx, 44, 28, 40, 12, '#e05c5c'); px(ctx, 58, 14, 12, 40, '#e05c5c');
    px(ctx, 0, 88, TEX_SIZE, 6, '#b8bdc9');
  });
  return T;
}

// ---------- 地面纹理（1024px 映射 32×32 格） ----------
function buildGroundTexture() {
  const S = 32, c = makeCanvas(1024, 1024), ctx = c.getContext('2d');
  ctx.fillStyle = '#7a9a5f'; ctx.fillRect(0, 0, 1024, 1024);          // 草地
  for (let i = 0; i < 900; i++) {                                      // 草地噪点
    const x = tnoise(i, 1) * 1024, y = tnoise(i, 2) * 1024;
    ctx.fillStyle = `rgba(${90 + tnoise(i, 3) * 40 | 0},${140 + tnoise(i, 4) * 40 | 0},70,.35)`;
    ctx.fillRect(x, y, 4, 4);
  }
  function road(x, y, w, h) {
    ctx.fillStyle = '#55565e'; ctx.fillRect(x * S, y * S, w * S, h * S);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < w * h; i++) ctx.fillRect((x + (i % w)) * S + S / 2 - 1, (y + ((i / w) | 0)) * S + S / 2 - 8, 2, 16); // 车道虚线
  }
  road(0, 10, 32, 2); road(0, 21, 32, 1);                              // 横路
  road(9, 0, 2, 22); road(18, 0, 2, 22); road(28, 11, 2, 10);          // 竖路
  // 公园深绿 + 小径
  ctx.fillStyle = '#5f8a4a'; ctx.fillRect(2 * S, 22 * S, 15 * S, 9 * S);
  ctx.fillStyle = '#c9b98a';
  ctx.fillRect(4 * S, 26 * S - 4, 11 * S, 8);
  // 广场铺砖
  ctx.fillStyle = '#9a98a0'; ctx.fillRect(2 * S, 18 * S, 27 * S, 3 * S);
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
  for (let i = 0; i < 28; i++) { ctx.strokeRect((2 + i) * S, 18 * S, S, S); ctx.strokeRect((2 + i) * S, 20 * S, S, S); }
  return c;
}

// ---------- 立绘（Galgame 半身像，四表情，ADV 层沿用） ----------
const portraitCache = {};
function makePortrait(style, expr) {
  const key = JSON.stringify(style) + '|' + expr;
  if (portraitCache[key]) return portraitCache[key];
  const W = 140, H = 210;
  const c = makeCanvas(W, H), ctx = c.getContext('2d');
  const { hair, hairStyle, skin, top, bottom } = style;
  const blush = 'rgba(245,150,150,.55)', dark = '#2b2b33';
  const hairRGB = hex2rgb(hair), topRGB = hex2rgb(top), skinRGB = hex2rgb(skin);
  const hairD = rgbCss(mixRGB(hairRGB, [0, 0, 0], 0.32)), hairL = rgbCss(mixRGB(hairRGB, [255, 255, 255], 0.25));
  const topD = rgbCss(mixRGB(topRGB, [0, 0, 25], 0.3));
  px(ctx, 34, 156, 72, 54, rgbCss(topRGB));
  px(ctx, 28, 170, 14, 40, rgbCss(topRGB)); px(ctx, 98, 170, 14, 40, rgbCss(topRGB));
  px(ctx, 34, 156, 24, 54, 'rgba(255,255,255,.10)');
  px(ctx, 82, 156, 24, 54, 'rgba(0,0,20,.14)');
  px(ctx, 62, 156, 18, 16, rgbCss(skinRGB));
  px(ctx, 62, 168, 18, 5, rgbCss(mixRGB(skinRGB, [30, 15, 0], 0.3)));
  px(ctx, 56, 170, 30, 12, topD);
  px(ctx, 44, 200, 52, 8, topD);
  px(ctx, 40, 62, 60, 76, rgbCss(skinRGB));
  px(ctx, 46, 132, 48, 12, rgbCss(skinRGB));
  px(ctx, 40, 100, 5, 20, rgbCss(mixRGB(skinRGB, [25, 12, 0], 0.22)));
  px(ctx, 95, 100, 5, 20, rgbCss(mixRGB(skinRGB, [25, 12, 0], 0.22)));
  px(ctx, 36, 96, 6, 12, rgbCss(skinRGB)); px(ctx, 98, 96, 6, 12, rgbCss(skinRGB));
  const eyeY = 98;
  function eye(x) {
    px(ctx, x, eyeY, 12, 8, '#fff');
    px(ctx, x + 2, eyeY + 1, 7, 6, '#3f3f52');
    px(ctx, x + 3, eyeY + 1, 3, 3, expr === 'happy' || expr === 'shy' ? '#6a5a9a' : '#4a5a7a');
    px(ctx, x + 3, eyeY + 2, 2, 2, '#fff');
    px(ctx, x, eyeY + 7, 12, 1, rgbCss(mixRGB(skinRGB, [120, 60, 40], 0.4)));
    px(ctx, x - 1, eyeY - 5, 14, 2, hairD);
  }
  if (expr === 'happy') {
    for (let i = 0; i < 12; i++) { px(ctx, 48 + i, eyeY + (i < 6 ? i : 11 - i) / 1.4 | 0, 1, 2, dark); px(ctx, 80 + i, eyeY + (i < 6 ? i : 11 - i) / 1.4 | 0, 1, 2, dark); }
    px(ctx, 64, 122, 14, 8, '#b5606a'); px(ctx, 65, 121, 12, 2, '#d5858f');
    px(ctx, 46, 114, 14, 5, blush); px(ctx, 82, 114, 14, 5, blush);
    px(ctx, 116, 56, 4, 4, '#ff9ec4'); px(ctx, 124, 70, 3, 3, '#ffd9e8');
  } else if (expr === 'shy') {
    eye(48); eye(80);
    px(ctx, 48, eyeY - 3, 12, 1, hairD); px(ctx, 80, eyeY - 3, 12, 1, hairD);
    px(ctx, 44, 110, 16, 8, blush); px(ctx, 80, 110, 16, 8, blush);
    px(ctx, 64, 124, 8, 2, '#c4707a');
    px(ctx, 18, 70, 4, 4, '#ff9ec4');
  } else if (expr === 'sad') {
    eye(48); eye(80);
    px(ctx, 47, eyeY - 4, 14, 2, dark); px(ctx, 79, eyeY - 2, 14, 2, dark);
    px(ctx, 52, eyeY + 9, 6, 2, 'rgba(180,220,240,.6)'); px(ctx, 84, eyeY + 9, 6, 2, 'rgba(180,220,240,.6)');
    px(ctx, 64, 127, 10, 2, '#c4707a');
  } else {
    eye(48); eye(80);
    px(ctx, 65, 123, 10, 2, '#c4707a');
  }
  if (hairStyle === 'long') {
    px(ctx, 38, 52, 64, 18, rgbCss(hairRGB)); px(ctx, 38, 44, 64, 14, rgbCss(hairRGB));
    px(ctx, 40, 40, 60, 8, hairL);
    px(ctx, 36, 58, 9, 96, rgbCss(hairRGB)); px(ctx, 95, 58, 9, 96, rgbCss(hairRGB));
    px(ctx, 36, 58, 2, 96, hairD); px(ctx, 102, 58, 2, 96, hairD);
    px(ctx, 46, 66, 12, 8, rgbCss(hairRGB)); px(ctx, 82, 66, 12, 8, rgbCss(hairRGB));
  } else if (hairStyle === 'short') {
    px(ctx, 38, 50, 64, 20, rgbCss(hairRGB)); px(ctx, 40, 44, 60, 10, hairL);
    px(ctx, 36, 58, 7, 16, rgbCss(hairRGB)); px(ctx, 97, 58, 7, 16, rgbCss(hairRGB));
  } else if (hairStyle === 'ponytail') {
    px(ctx, 38, 50, 64, 20, rgbCss(hairRGB)); px(ctx, 40, 44, 60, 10, hairL);
    px(ctx, 98, 58, 16, 66, rgbCss(hairRGB)); px(ctx, 100, 60, 6, 50, hairD);
    px(ctx, 102, 52, 12, 12, rgbCss(hairRGB));
  } else if (hairStyle === 'bob') {
    px(ctx, 38, 48, 64, 24, rgbCss(hairRGB)); px(ctx, 40, 42, 60, 10, hairL);
    px(ctx, 36, 60, 8, 40, rgbCss(hairRGB)); px(ctx, 96, 60, 8, 40, rgbCss(hairRGB));
  } else if (hairStyle === 'cap') {
    px(ctx, 40, 46, 60, 18, rgbCss(hairRGB)); px(ctx, 42, 42, 56, 8, hairL);
    px(ctx, 32, 60, 76, 6, rgbCss(mixRGB(hairRGB, [0, 0, 0], 0.4)));
    px(ctx, 54, 46, 14, 12, rgbCss(mixRGB(hairRGB, [255, 255, 255], 0.3)));
  }
  portraitCache[key] = c;
  return c;
}

// ---------- 小地图（2D 保留） ----------
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

// ============ 3D 引擎 ============
let renderer = null, scene = null, camera3 = null, sun = null, hemi = null;
let groundMesh = null, roofGroup = null, npcGroups = new Map(), playerGroup = null;
const lampLights = [];

function init3D(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(canvas.width, canvas.height, false);
  // ===== 物理渲染管线（照片级） =====
  renderer.outputEncoding = THREE.sRGBEncoding;            // sRGB 色彩空间输出
  renderer.toneMapping = THREE.ACESFilmicToneMapping;      // 电影级色调映射
  renderer.toneMappingExposure = 1.05;                     // 曝光
  renderer.physicallyCorrectLights = true;                 // 物理光照单位
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;        // 软阴影
  scene = new THREE.Scene();
  camera3 = new THREE.PerspectiveCamera(70, canvas.width / canvas.height, 0.05, 80);
  hemi = new THREE.HemisphereLight(0xbfd9f2, 0x5a6a4f, 0.9);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff2d5, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;                                   // 阴影柔边
  sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0004;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new THREE.Fog(0xcfe2f2, 14, 46);
  // 环境反射贴图（程序化天空 → PMREM）
  if (!envMap) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const skyGeo = new THREE.SphereGeometry(50, 16, 12);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xbfd9f2, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(skyGeo, skyMat));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(6), new THREE.MeshBasicMaterial({ color: 0xfff5dd }));
    glow.position.set(15, 20, 10);
    envScene.add(glow);
    envMap = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }
  scene.environment = envMap;
}
let envMap = null;

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.encoding = THREE.sRGBEncoding;
  return t;
}
// 高度图（画布亮度）→ 法线贴图（Sobel 梯度），照片级凹凸质感的核心
function heightToNormal(c, strength) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h), octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const lum = (x, y) => {
    x = (x + w) % w; y = (y + h) % h;
    const i = (y * w + x) * 4;
    return (src[i] * 0.3 + src[i + 1] * 0.5 + src[i + 2] * 0.2) / 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
    const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
    const len = Math.sqrt(dx * dx + dy * dy + 1);
    const i = (y * w + x) * 4;
    img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
    img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
// PBR 材质（凹凸 + 粗糙度）
function pbrMat(colorTex, normalTex, roughness, metalness, normalScale) {
  const m = new THREE.MeshStandardMaterial({
    map: colorTex ? canvasTex(colorTex) : null,
    normalMap: normalTex || null,
    roughness: roughness === undefined ? 0.9 : roughness,
    metalness: metalness === undefined ? 0 : metalness,
  });
  if (normalTex) m.normalScale = new THREE.Vector2(normalScale || 1, normalScale || 1);
  return m;
}

function buildWorld3D(world, D) {
  while (scene.children.length) scene.remove(scene.children[0]);
  scene.add(hemi); scene.add(sun); scene.add(sun.target);
  npcGroups = new Map(); lampLights.length = 0;

  // 地面（PBR：草地/路面法线凹凸）
  const gCanvas = buildGroundTexture();
  const gTex = canvasTex(gCanvas);
  gTex.magFilter = THREE.LinearFilter;
  const groundMat = new THREE.MeshStandardMaterial({
    map: gTex,
    normalMap: heightToNormal(gCanvas, 2.2),
    roughness: 0.95, metalness: 0,
  });
  groundMat.normalScale = new THREE.Vector2(1.4, 1.4);
  groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(16, 0, 16);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // 墙体（按贴图 InstancedMesh）
  const texes = buildTextures();
  const wallData = {};
  const MAP = world.map;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const t = MAP[y][x];
    if (!t) continue;
    (wallData[t] = wallData[t] || []).push([x, y]);
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const t in wallData) {
    const list = wallData[t];
    // PBR 墙面：颜色 + 法线（砖缝/木纹真实凹凸）+ 材质粗糙度差异
    const texCanvas = texes[t] || texes[1];
    const nrm = heightToNormal(texCanvas, t === '3' ? 1.2 : 2.6);
    const rough = t === '3' ? 0.25 : t === '8' ? 0.5 : t === '4' ? 0.8 : 0.88;   // 玻璃光滑 / 医院半光 / 砖木粗糙
    const mat = new THREE.MeshStandardMaterial({
      map: canvasTex(texCanvas), normalMap: nrm,
      roughness: rough, metalness: t === '3' ? 0.35 : 0.04,
    });
    mat.normalScale = new THREE.Vector2(1.5, 1.5);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach(([x, y], i) => {
      m.makeTranslation(x + 0.5, 0.5, y + 0.5);
      im.setMatrixAt(i, m);
    });
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  }

  // 屋顶（建筑整体一块，颜色随贴图）
  roofGroup = new THREE.Group();
  const roofColors = { 2: 0x8a6242, 3: 0x4a6a9a, 4: 0x6a4a2a, 5: 0x9a4a3a, 6: 0xb09a52, 7: 0x37443e, 8: 0xb8bec9, 1: 0x444450 };
  const rects = [[2, 2, 7, 7, 2], [11, 2, 7, 7, 3], [20, 2, 10, 7, 4], [2, 12, 7, 6, 5], [11, 12, 7, 6, 7], [22, 12, 8, 6, 6], [20, 23, 10, 7, 8]];
  for (const [x, y, w, h, t] of rects) {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.3, 0.12, h + 0.3),
      new THREE.MeshStandardMaterial({ color: roofColors[t] || 0x777777, roughness: 0.85 })
    );
    roof.position.set(x + w / 2, 1.04, y + h / 2);
    roof.castShadow = true; roof.receiveShadow = true;
    roofGroup.add(roof);
  }
  scene.add(roofGroup);

  // 树木（干 + 冠 Instanced）
  const trees = world.props.filter(p => p.type === 'tree');
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2b, roughness: 0.9 });
  const crownGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3f7f4d, roughness: 0.85 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length);
  const m = new THREE.Matrix4();
  trees.forEach((p, i) => {
    m.makeTranslation(p.x, 0.25, p.y); trunks.setMatrixAt(i, m);
    const s = 0.8 + tnoise(p.x, p.y) * 0.5;
    m.compose(new THREE.Vector3(p.x, 0.62, p.y), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    crowns.setMatrixAt(i, m);
  });
  trunks.castShadow = crowns.castShadow = true;
  scene.add(trunks); scene.add(crowns);

  // 路灯（杆 + 发光灯头 + 夜间点光）
  for (const p of world.props.filter(pp => pp.type === 'lamp')) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.5, metalness: 0.6 }));
    pole.position.set(p.x, 0.55, p.y); pole.castShadow = true;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    bulb.position.set(p.x, 1.12, p.y);
    scene.add(pole); scene.add(bulb);
    const pl = new THREE.PointLight(0xffe9a8, 0, 5.5, 2);
    pl.position.set(p.x, 1.15, p.y);
    scene.add(pl); lampLights.push(pl);
  }

  // 家具道具（组合盒）
  function box(w, h, d, color, x, y, z, parent) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 }));
    b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true;
    parent.add(b); return b;
  }
  for (const p of world.props) {
    const g = new THREE.Group();
    if (p.type === 'bed') { box(0.7, 0.22, 0.5, 0x8a6a4a, 0, 0.11, 0, g); box(0.66, 0.1, 0.44, 0xe8e0d0, 0, 0.26, 0, g); box(0.24, 0.08, 0.3, 0xffffff, -0.18, 0.33, 0, g); box(0.36, 0.06, 0.4, 0xd5748a, 0.14, 0.33, 0, g); }
    else if (p.type === 'desk') { box(0.8, 0.06, 0.5, 0xa08a6a, 0, 0.45, 0, g); box(0.06, 0.45, 0.06, 0x6a5a45, -0.34, 0.22, -0.18, g); box(0.06, 0.45, 0.06, 0x6a5a45, 0.34, 0.22, -0.18, g); box(0.06, 0.45, 0.06, 0x6a5a45, -0.34, 0.22, 0.18, g); box(0.06, 0.45, 0.06, 0x6a5a45, 0.34, 0.22, 0.18, g); box(0.34, 0.22, 0.03, 0x3a4a5a, 0, 0.58, -0.14, g); }
    else if (p.type === 'shelf') { box(0.9, 1.0, 0.24, 0x7a5a3a, 0, 0.5, 0, g); for (let s = 0; s < 4; s++) box(0.8, 0.04, 0.2, 0x5a4028, 0, 0.16 + s * 0.24, 0.01, g); }
    else if (p.type === 'counter' || p.type === 'counter2' || p.type === 'hdesk') { const col = p.type === 'counter' ? 0xa06a4a : p.type === 'hdesk' ? 0xdfe2e8 : 0xc9a86a; box(0.9, 0.55, 0.4, col, 0, 0.28, 0, g); box(0.9, 0.05, 0.42, 0xe8d5c0, 0, 0.56, 0, g); }
    else if (p.type === 'equip') { box(0.8, 0.08, 0.3, 0x5a5a66, 0, 0.3, 0, g); box(0.08, 0.5, 0.08, 0x3a3a44, 0, 0.55, 0, g); box(0.5, 0.08, 0.2, 0x44444e, 0, 0.85, 0, g); }
    else if (p.type === 'fridge') { box(0.5, 0.85, 0.5, 0xd5dade, 0, 0.43, 0, g); box(0.46, 0.02, 0.46, 0x8a92a0, 0.1, 0.6, 0.26, g); }
    else if (p.type === 'shower') { box(0.6, 1.0, 0.6, 0xb8c4d0, 0, 0.5, 0, g); box(0.5, 0.9, 0.5, 0x9ec8e0, 0, 0.48, 0.04, g); }
    else if (p.type === 'bench') { box(0.9, 0.06, 0.3, 0x8a6a4a, 0, 0.28, 0, g); box(0.06, 0.28, 0.06, 0x5a4530, -0.38, 0.14, 0.1, g); box(0.06, 0.28, 0.06, 0x5a4530, 0.38, 0.14, 0.1, g); }
    else if (p.type === 'fountain') {
      box(1.4, 0.3, 1.4, 0x8a92a0, 0, 0.15, 0, g);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0x5aa8d5, transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.1 }));
      water.position.y = 0.32; g.add(water);
      box(0.12, 0.5, 0.12, 0x8a92a0, 0, 0.45, 0, g);
    }
    else continue;
    g.position.set(p.x, 0, p.y);
    scene.add(g);
  }

  // NPC 3D 模型
  for (const nl of world.npcLive) {
    const g = makePerson3D(nl.npc.style, nl.npc.gender);
    g.userData.nameSprite = makeNameSprite(nl.name);
    g.add(g.userData.nameSprite);
    g.userData.nameSprite.position.y = 0.85;
    scene.add(g);
    npcGroups.set(nl.id, g);
  }
  // 玩家模型（第三人称显示）
  playerGroup = makePerson3D(window.__playerStyle, window.__playerGender);
  playerGroup.visible = false;
  scene.add(playerGroup);
}

function makeNameSprite(name) {
  const c = makeCanvas(128, 24);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  roundRect(ctx, 14, 2, 100, 20, 8); ctx.fill();
  ctx.fillStyle = '#ffe8f0';
  ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, 64, 13);
  const t = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true }));
  sp.scale.set(0.72, 0.135, 1);
  return sp;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 3D 人物（精细建模：五官 + 表情 + 身形） ----------
// 部件几何/材质缓存（共享，降低创建开销）——PBR 质感
const P_CACHE = {};
function pgeo(key, make) { if (!P_CACHE[key]) P_CACHE[key] = make(); return P_CACHE[key]; }
function pmat(key, color) {
  const k = key + color;
  if (!P_CACHE[k]) {
    const opt = { color: new THREE.Color(color), roughness: 0.85, metalness: 0 };
    if (key === 'skin') { opt.roughness = 0.42; opt.metalness = 0; }        // 皮肤：微光泽次表面近似
    else if (key === 'hair') { opt.roughness = 0.36; opt.metalness = 0.12; } // 头发：角蛋白光泽
    else if (key === 'top') { opt.roughness = 0.92; }                        // 布料：高粗糙
    else if (key === 'shoe') { opt.roughness = 0.3; opt.metalness = 0.05; }  // 皮鞋
    P_CACHE[k] = new THREE.MeshStandardMaterial(opt);
  }
  return P_CACHE[k];
}

function makePerson3D(style, gender) {
  const g = new THREE.Group();
  const skin = pmat('skin', style.skin);
  const skinD = pmat('skinD', mixCss(style.skin, [40, 18, 0], 0.25));
  const top = pmat('top', style.top);
  const bottom = pmat('bottom', style.bottom);
  const hairM = pmat('hair', style.hair);
  const hairD = pmat('hairD', mixCss(style.hair, [0, 0, 0], 0.3));
  function part(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  }

  // ===== 头部组（精修：眼窝/眼睑/睫毛/双层虹膜/鼻梁鼻翼/双唇露齿/下巴） =====
  const head = new THREE.Group();
  head.position.y = 0.585;
  head.scale.set(0.97, 1.06, 0.96);
  // 颅骨 + 下巴
  const skull = part(pgeo('skull', () => new THREE.SphereGeometry(0.085, 20, 16)), skin, 0, 0, 0);
  skull.scale.set(1, 1.05, 0.95);
  head.add(skull);
  const chin = part(pgeo('chin', () => new THREE.SphereGeometry(0.024, 10, 8)), skin, 0, -0.068, 0.026);
  chin.scale.set(1.05, 0.85, 0.9);
  head.add(chin);
  // 耳朵（带耳廓暗面）
  head.add(part(pgeo('ear', () => new THREE.SphereGeometry(0.022, 8, 6)), skin, -0.085, -0.004, 0));
  head.add(part(pgeo('ear', () => new THREE.SphereGeometry(0.022, 8, 6)), skin, 0.085, -0.004, 0));
  head.add(part(pgeo('earIn', () => new THREE.SphereGeometry(0.011, 6, 5)), skinD, -0.089, -0.004, 0.004));
  head.add(part(pgeo('earIn', () => new THREE.SphereGeometry(0.011, 6, 5)), skinD, 0.089, -0.004, 0.004));

  // ---- 眼睛（杏仁形：眼窝 + 眼白 + 双层虹膜 + 瞳孔 + 双高光 + 上眼睑 + 睫毛线 + 下睑） ----
  function eye(sx) {
    const e = new THREE.Group();
    e.position.set(0.031 * sx, 0.006, 0.06);
    e.rotation.z = -0.1 * sx;   // 微斜杏仁
    // 眼窝（暗色底）
    const socket = part(pgeo('socket', () => new THREE.SphereGeometry(0.019, 10, 8)), skinD, 0, 0, -0.004);
    socket.scale.set(1.18, 0.8, 0.45);
    e.add(socket);
    // 眼白（压扁球）
    const white = part(pgeo('eyeW', () => new THREE.SphereGeometry(0.0142, 12, 10)), pmat('eyeW', '#f8f6f2'), 0, 0, 0.001);
    white.scale.set(1.28, 1, 0.5);
    e.add(white);
    // 虹膜双层（外深内浅）+ 瞳孔
    const irisOut = part(pgeo('irisO', () => new THREE.SphereGeometry(0.0088, 10, 8)), pmat('irisO', '#3d4c78'), 0, 0, 0.005);
    irisOut.scale.set(1, 1, 0.42);
    const irisIn = part(pgeo('irisI', () => new THREE.SphereGeometry(0.0062, 10, 8)), pmat('irisI', '#6a7fb5'), 0, 0, 0.0062);
    irisIn.scale.set(1, 1, 0.4);
    const pupil = part(pgeo('pupil', () => new THREE.SphereGeometry(0.0032, 8, 6)), pmat('pupil', '#141420'), 0, 0, 0.0075);
    pupil.scale.set(1, 1, 0.35);
    e.add(irisOut); e.add(irisIn); e.add(pupil);
    // 双高光（主+副）
    e.add(part(pgeo('glint', () => new THREE.SphereGeometry(0.0024, 6, 5)), pmat('glint', '#ffffff'), -0.0022 * sx, 0.0032, 0.0085));
    e.add(part(pgeo('glint2', () => new THREE.SphereGeometry(0.0013, 6, 5)), pmat('glint', '#ffffff'), 0.0026 * sx, -0.0028, 0.008));
    // 上眼睑（肤色薄盖）
    const lid = part(pgeo('lid', () => new THREE.SphereGeometry(0.0155, 10, 8)), skin, 0, 0.0055, 0.0005);
    lid.scale.set(1.32, 0.5, 0.52);
    e.add(lid);
    // 睫毛线 + 睫毛梢
    e.add(part(pgeo('lash', () => new THREE.BoxGeometry(0.033, 0.0022, 0.002)), pmat('lash', '#2a2430'), 0, 0.0118, 0.0065));
    const tip = part(pgeo('lashtip', () => new THREE.BoxGeometry(0.007, 0.0018, 0.0018)), pmat('lash', '#2a2430'), 0.014 * sx, 0.0128, 0.006);
    tip.rotation.z = 0.5 * sx;
    e.add(tip);
    // 下睑线
    e.add(part(pgeo('lowlid', () => new THREE.BoxGeometry(0.028, 0.0015, 0.0015)), pmat('lowlid', '#c9a898'), 0, -0.0112, 0.0045));
    return e;
  }
  const eyeL = eye(-1), eyeR = eye(1);
  head.add(eyeL); head.add(eyeR);
  // 眉毛（两段带弧）
  const browL = part(pgeo('browA', () => new THREE.BoxGeometry(0.02, 0.0042, 0.004)), hairD, -0.035, 0.05, 0.072);
  const browL2 = part(pgeo('browB', () => new THREE.BoxGeometry(0.012, 0.0036, 0.0036)), hairD, -0.018, 0.048, 0.0735);
  browL2.rotation.z = -0.25;
  const browR = part(pgeo('browA', () => new THREE.BoxGeometry(0.02, 0.0042, 0.004)), hairD, 0.035, 0.05, 0.072);
  const browR2 = part(pgeo('browB', () => new THREE.BoxGeometry(0.012, 0.0036, 0.0036)), hairD, 0.018, 0.048, 0.0735);
  browR2.rotation.z = 0.25;
  head.add(browL); head.add(browL2); head.add(browR); head.add(browR2);
  // ---- 鼻（鼻梁 + 鼻头 + 鼻翼） ----
  const bridge = part(pgeo('bridge', () => new THREE.BoxGeometry(0.007, 0.028, 0.009)), skin, 0, -0.008, 0.079);
  bridge.rotation.x = 0.25;
  head.add(bridge);
  head.add(part(pgeo('noseTip', () => new THREE.SphereGeometry(0.0064, 8, 6)), skin, 0, -0.0205, 0.0815));
  head.add(part(pgeo('noseWing', () => new THREE.SphereGeometry(0.0045, 6, 5)), skinD, -0.0062, -0.021, 0.0775));
  head.add(part(pgeo('noseWing', () => new THREE.SphereGeometry(0.0045, 6, 5)), skinD, 0.0062, -0.021, 0.0775));
  // ---- 嘴（上唇弧 + 下唇 + 张嘴露齿 + 难过弧） ----
  const mouthSmile = new THREE.Mesh(pgeo('smile', () => new THREE.TorusGeometry(0.0125, 0.0024, 6, 12, Math.PI)), pmat('mouth', '#b56a72'));
  mouthSmile.rotation.z = Math.PI; mouthSmile.position.set(0, -0.031, 0.0735);
  mouthSmile.scale.set(1.1, 0.8, 1);
  const upperLip = new THREE.Mesh(pgeo('ulip', () => new THREE.TorusGeometry(0.011, 0.0019, 6, 12, Math.PI * 0.9)), pmat('mouthD', '#9d5560'));
  upperLip.rotation.z = Math.PI + 0.15; upperLip.position.set(0, -0.0265, 0.0735);
  const lowerLip = part(pgeo('llip', () => new THREE.SphereGeometry(0.0068, 8, 6)), pmat('mouth', '#c4707a'), 0, -0.0385, 0.0735);
  lowerLip.scale.set(1.6, 0.62, 0.5);
  const mouthOpen = new THREE.Group();
  mouthOpen.position.set(0, -0.033, 0.0725);
  const oral = part(pgeo('oral', () => new THREE.SphereGeometry(0.0075, 8, 6)), pmat('oral', '#7a3540'), 0, 0, 0);
  oral.scale.set(1.35, 1, 0.45);
  const teeth = part(pgeo('teeth', () => new THREE.BoxGeometry(0.013, 0.0038, 0.0035)), pmat('teeth', '#f5f2ec'), 0, 0.0032, 0.0035);
  mouthOpen.add(oral); mouthOpen.add(teeth);
  const mouthSad = new THREE.Mesh(pgeo('sad', () => new THREE.TorusGeometry(0.0115, 0.0024, 6, 12, Math.PI)), pmat('mouth', '#b56a72'));
  mouthSad.position.set(0, -0.0285, 0.0735);
  head.add(mouthSmile); head.add(upperLip); head.add(lowerLip); head.add(mouthOpen); head.add(mouthSad);
  // 腮红
  const blushL = new THREE.Mesh(pgeo('blush', () => new THREE.CircleGeometry(0.013, 10)), pmat('blush', 'rgba(245,150,150,.55)'));
  blushL.position.set(-0.052, -0.018, 0.066); blushL.rotation.y = -0.35;
  const blushR = new THREE.Mesh(pgeo('blush', () => new THREE.CircleGeometry(0.013, 10)), pmat('blush', 'rgba(245,150,150,.55)'));
  blushR.position.set(0.052, -0.018, 0.066); blushR.rotation.y = 0.35;
  head.add(blushL); head.add(blushR);

  // ===== 发型（圆润版） =====
  const hairCap = part(pgeo('hcap', () => new THREE.SphereGeometry(0.09, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), hairM, 0, 0.004, -0.004);
  hairCap.scale.set(1.02, 1.1, 1);
  head.add(hairCap);
  // 刘海三层（主 + 左右斜片）+ 发顶高光
  head.add(part(pgeo('bang', () => new THREE.BoxGeometry(0.13, 0.028, 0.02)), hairM, 0, 0.052, 0.058));
  const bangL = part(pgeo('bangS', () => new THREE.BoxGeometry(0.045, 0.026, 0.018)), hairM, -0.05, 0.044, 0.055);
  bangL.rotation.z = 0.35; bangL.rotation.y = 0.25;
  const bangR = part(pgeo('bangS', () => new THREE.BoxGeometry(0.045, 0.026, 0.018)), hairM, 0.05, 0.044, 0.055);
  bangR.rotation.z = -0.35; bangR.rotation.y = -0.25;
  head.add(bangL); head.add(bangR);
  const hi = part(pgeo('hhi', () => new THREE.BoxGeometry(0.06, 0.004, 0.03)), pmat('hairHi', mixCss(style.hair, [255, 255, 255], 0.45)), -0.015, 0.094, -0.012);
  hi.rotation.z = 0.2;
  head.add(hi);
  const hs = style.hairStyle;
  const swayParts = [];
  if (hs === 'long') {
    const back = part(pgeo('hlong', () => new THREE.SphereGeometry(0.088, 14, 12)), hairM, 0, -0.09, -0.012);
    back.scale.set(1, 1.9, 0.85);
    head.add(back);
    swayParts.push(back);
    head.add(part(pgeo('hside', () => new THREE.SphereGeometry(0.026, 8, 8)), hairM, -0.082, -0.03, 0.03));
    head.add(part(pgeo('hside', () => new THREE.SphereGeometry(0.026, 8, 8)), hairM, 0.082, -0.03, 0.03));
    // 前侧发束（发梢渐细圆头）
    const strandL = part(pgeo('strand', () => new THREE.BoxGeometry(0.015, 0.15, 0.011)), hairM, -0.077, -0.018, 0.046);
    strandL.rotation.z = 0.12;
    const strandR = part(pgeo('strand', () => new THREE.BoxGeometry(0.015, 0.15, 0.011)), hairM, 0.077, -0.018, 0.046);
    strandR.rotation.z = -0.12;
    head.add(strandL); head.add(strandR);
    head.add(part(pgeo('strandTip', () => new THREE.SphereGeometry(0.0075, 6, 5)), hairM, -0.086, -0.092, 0.046));
    head.add(part(pgeo('strandTip', () => new THREE.SphereGeometry(0.0075, 6, 5)), hairM, 0.086, -0.092, 0.046));
  } else if (hs === 'ponytail') {
    const pt = new THREE.Group();
    pt.position.set(0, -0.02, -0.09);
    pt.add(part(pgeo('hpt1', () => new THREE.SphereGeometry(0.024, 8, 8)), hairM, 0, 0, 0));
    pt.add(part(pgeo('hpt2', () => new THREE.SphereGeometry(0.02, 8, 8)), hairM, 0, -0.05, -0.01));
    pt.add(part(pgeo('hpt3', () => new THREE.SphereGeometry(0.015, 8, 8)), hairM, 0, -0.09, -0.005));
    head.add(pt);
    swayParts.push(pt);
  } else if (hs === 'bob') {
    const back = part(pgeo('hbob', () => new THREE.SphereGeometry(0.089, 14, 12)), hairM, 0, -0.035, -0.01);
    back.scale.set(1, 1.35, 0.9);
    head.add(back);
  } else if (hs === 'cap') {
    head.add(part(pgeo('capbrim', () => new THREE.CylinderGeometry(0.105, 0.105, 0.01, 14)), hairD, 0, 0.052, 0.03));
    head.add(part(pgeo('capband', () => new THREE.BoxGeometry(0.16, 0.012, 0.024)), hairD, 0, 0.058, 0.062));
  } else {   // short
    head.add(part(pgeo('hshort', () => new THREE.SphereGeometry(0.089, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)), hairM, 0, 0.002, -0.004));
  }
  g.add(head);

  // ===== 身体 =====
  // 脖子
  g.add(part(pgeo('neck', () => new THREE.CylinderGeometry(0.028, 0.034, 0.06, 8)), skin, 0, 0.485, 0));
  // 躯干两段（肩背 + 腰身）
  g.add(part(pgeo('torsoU', () => new THREE.BoxGeometry(0.22, 0.15, 0.125)), top, 0, 0.4, 0));
  g.add(part(pgeo('torsoL', () => new THREE.BoxGeometry(0.195, 0.12, 0.115)), top, 0, 0.275, 0));
  // 领口
  g.add(part(pgeo('collar', () => new THREE.BoxGeometry(0.09, 0.02, 0.02)), skin, 0, 0.465, 0.055));
  // 腿（髋部 pivot）
  const legGeo = pgeo('leg', () => new THREE.BoxGeometry(0.07, 0.24, 0.07));
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.add(part(legGeo, bottom, 0, -0.12, 0));
  legR.add(part(legGeo, bottom, 0, -0.12, 0));
  legL.add(part(pgeo('shoe', () => new THREE.BoxGeometry(0.08, 0.05, 0.12)), pmat('shoe', 0x2b2b30), 0, -0.24, 0.02));
  legR.add(part(pgeo('shoe', () => new THREE.BoxGeometry(0.08, 0.05, 0.12)), pmat('shoe', 0x2b2b30), 0, -0.24, 0.02));
  legL.position.set(-0.05, 0.22, 0); legR.position.set(0.05, 0.22, 0);
  g.add(legL); g.add(legR);
  // 女性裙摆
  if (gender === 'F') {
    const skirt = new THREE.Mesh(pgeo('skirt', () => new THREE.CylinderGeometry(0.105, 0.155, 0.12, 12)), bottom);
    skirt.position.set(0, 0.215, 0); skirt.castShadow = true;
    g.add(skirt);
    swayParts.push(skirt);
  }
  // 手臂（肩部 pivot + 球形手）
  const armGeo = pgeo('arm', () => new THREE.BoxGeometry(0.055, 0.24, 0.055));
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.add(part(armGeo, top, 0, -0.1, 0));
  armR.add(part(armGeo, top, 0, -0.1, 0));
  armL.add(part(pgeo('hand', () => new THREE.SphereGeometry(0.021, 8, 6)), skin, 0, -0.225, 0));
  armR.add(part(pgeo('hand', () => new THREE.SphereGeometry(0.021, 8, 6)), skin, 0, -0.225, 0));
  armL.position.set(-0.135, 0.465, 0); armR.position.set(0.135, 0.465, 0);
  g.add(armL); g.add(armR);

  g.userData = {
    legL, legR, armL, armR, head,
    eyeL, eyeR, browL, browR,
    mouthSmile, mouthOpen, mouthSad, upperLip, lowerLip, blushL, blushR,
    swayParts, walkT: 0,
  };
  applyExpr(g, 'normal');
  return g;
}
function mixCss(hex, rgb2, t) {
  const c1 = hex2rgb(hex);
  const m = mixRGB(c1, rgb2, t);
  return rgbCss(m);
}

// 表情：normal | happy | shy | sad（st.talking 时嘴部开合说话）
function applyExpr(g, expr, talking) {
  const u = g.userData;
  if (!u.mouthSmile) return;
  const happy = expr === 'happy', shy = expr === 'shy', sad = expr === 'sad';
  const sy = happy ? 0.35 : shy ? 0.62 : 1;
  u.eyeL.scale.y = sy; u.eyeR.scale.y = sy;
  u.browL.rotation.z = sad ? -0.45 : 0;
  u.browR.rotation.z = sad ? 0.45 : 0;
  u.browL.position.y = sad ? 0.046 : 0.05;
  u.browR.position.y = sad ? 0.058 : 0.05;
  // 嘴型：说话时张嘴开合（正弦），覆盖表情静态嘴
  const talkingNow = !!talking && !sad;
  u.mouthSmile.visible = !happy && !sad && !talkingNow;
  u.mouthOpen.visible = happy || talkingNow;
  u.mouthSad.visible = sad;
  if (u.upperLip) {
    u.upperLip.visible = !happy && !talkingNow;
    u.lowerLip.visible = !happy && !talkingNow && !sad;
  }
  u.blushL.visible = u.blushR.visible = (happy || shy);
  u.head.rotation.x = shy ? 0.18 : 0;
}

// 同步人物动画：state = {x, y, yaw, moving, walkT, waving, expr, stance, airborne, squash, stretch, speed, dt, lookX, lookY}
function syncPerson3D(g, st) {
  const u = g.userData;
  const stance = st.stance || 'stand';
  const airborne = !!st.airborne;
  const dt = st.dt || 0.016;
  const baseY = stance === 'prone' ? 0.09 : stance === 'crouch' ? 0.0 : 0;
  g.position.set(st.x, baseY + (st.h || 0), st.y);

  // 转身平滑（最短角度路径插值）
  if (u.yawCur === undefined) u.yawCur = Math.PI / 2 - st.yaw;
  let diff = (Math.PI / 2 - st.yaw) - u.yawCur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  u.yawCur += diff * Math.min(1, dt * 10);
  g.rotation.y = u.yawCur;

  // 压缩/伸展（squash-and-stretch）
  const squash = st.squash || 0, stretch = st.stretch || 0;
  const syq = (1 - squash * 0.28) * (1 + stretch * 0.22), sxq = (1 + squash * 0.18) * (1 - stretch * 0.12);
  if (stance === 'prone') {
    g.rotation.x = 1.42;
    g.scale.set(sxq, syq * 0.9, 1);
  } else if (stance === 'crouch') {
    g.rotation.x = 0.18;
    g.scale.set(sxq * 1.02, syq * 0.68, 1);
  } else {
    g.rotation.x = 0;
    g.scale.set(sxq, syq, 1);
  }

  // 肢体动画
  let w = st.moving ? Math.sin(st.walkT * Math.PI) : 0;
  if (airborne) {
    u.legL.rotation.x = 0.55; u.legR.rotation.x = -0.35;
    u.armL.rotation.x = -0.7; u.armR.rotation.x = -0.7;
    u.armL.rotation.z = 0.5; u.armR.rotation.z = -0.5;
  } else if (stance === 'prone') {
    const crawl = st.moving ? Math.sin(st.walkT * Math.PI * 2) : 0;
    u.legL.rotation.x = 0.15 + crawl * 0.25; u.legR.rotation.x = 0.15 - crawl * 0.25;
    u.armL.rotation.x = -1.2 + crawl * 0.35; u.armR.rotation.x = -1.2 - crawl * 0.35;
    u.armL.rotation.z = 0.25; u.armR.rotation.z = -0.25;
  } else if (stance === 'crouch') {
    u.legL.rotation.x = 0.85 + w * 0.35; u.legR.rotation.x = 0.85 - w * 0.35;
    u.armL.rotation.x = -0.35 - w * 0.3; u.armR.rotation.x = -0.35 + w * 0.3;
    u.armL.rotation.z = 0.3; u.armR.rotation.z = -0.3;
  } else {
    u.legL.rotation.x = w * 0.7;
    u.legR.rotation.x = -w * 0.7;
    u.armL.rotation.x = -w * 0.55;
    u.armL.rotation.z = 0;
    if (st.waving) {
      u.armR.rotation.x = 0;
      u.armR.rotation.z = -2.4 + Math.sin(st.walkT * 6) * 0.25;
    } else {
      u.armR.rotation.z = 0;
      u.armR.rotation.x = w * 0.55;
    }
    // 躯干走路摇摆（左右重心交替）
    u.torsoU = u.torsoU || null;
    g.rotation.z = w * 0.045;
  }

  // 呼吸/走路起伏
  if (!airborne && stance === 'stand') {
    g.position.y += st.moving ? Math.abs(Math.sin(st.walkT * Math.PI)) * 0.012 : Math.sin((st.walkT || 0) * 0.8) * 0.002;
  }
  // 发/裙摆：弹簧-阻尼模型（跟随速度后飘 + 步频扰动，带过冲回摆）
  if (u.swayParts && u.swayParts.length) {
    const spd = Math.min(1, (st.speed || 0) / 3);
    const target = spd * 0.22 + w * 0.1;
    const K = 60, D = 8;   // 弹簧刚度 / 阻尼
    u.swayV = (u.swayV || 0) + (target - (u.swayA || 0)) * K * dt - (u.swayV || 0) * D * dt;
    u.swayA = (u.swayA || 0) + u.swayV * dt;
    for (const sp of u.swayParts) sp.rotation.x = Math.max(-0.6, Math.min(0.9, u.swayA));
  }
  applyExpr(g, st.expr || 'normal', st.talking);
  // 说话嘴部开合动画（正弦幅度随语速）
  if (st.talking && g.userData.mouthOpen) {
    const t = g.userData.talkPhase || 0;
    g.userData.mouthOpen.scale.y = 0.35 + Math.abs(Math.sin(t * 9)) * 0.85;
    g.userData.mouthOpen.scale.x = 0.9 + Math.abs(Math.sin(t * 4.5)) * 0.15;
    g.userData.talkPhase = t + (st.dt || 0.016);
  } else {
    g.userData.talkPhase = 0;
    if (g.userData.mouthOpen) g.userData.mouthOpen.scale.y += (1 - g.userData.mouthOpen.scale.y) * 0.3;
  }
  // 眨眼（随机间隔 2~5 秒，闭 0.12 秒；最后应用以覆盖表情的眯眼）
  if (u.eyeL) {
    u.blinkT = (u.blinkT === undefined ? 1 + Math.random() * 3 : u.blinkT) - dt;
    if (u.blinkT <= -0.12) u.blinkT = 2 + Math.random() * 3.5;
    if (u.blinkT <= 0) { u.eyeL.scale.y = 0.08; u.eyeR.scale.y = 0.08; }
    else u._exprSy = u.eyeL.scale.y;
    // 眼球跟随：近距离看向目标（玩家）
    if (st.lookX !== undefined && st.lookY !== undefined && u.blinkT > 0) {
      const ang = Math.atan2(st.lookY - st.y, st.lookX - st.x) - st.yaw;
      const rel = Math.sin(ang), fwd = Math.cos(ang);
      if (fwd > 0.1) {
        u.eyeL.position.x = -0.032 + rel * 0.006; u.eyeR.position.x = 0.032 + rel * 0.006;
      }
    }
  }
  if (u.nameSprite) u.nameSprite.visible = st.showName !== false;
}

// ---------- 昼夜光照 ----------
function setDaylight(minutes) {
  const h = minutes / 60;
  let skyC, sunC, sunI, hemiI, fogC, lampI;
  if (h < 10) { skyC = 0xbfd9f2; sunC = 0xfff2d5; sunI = 1.0; hemiI = 0.95; fogC = 0xcfe2f2; lampI = 0; }
  else if (h < 16) { skyC = 0xcfe0f5; sunC = 0xfff8e8; sunI = 1.05; hemiI = 1.0; fogC = 0xdceaf7; lampI = 0; }
  else if (h < 18.5) { skyC = 0xd9b98a; sunC = 0xffb070; sunI = 0.85; hemiI = 0.7; fogC = 0xe0c9a8; lampI = 0.3; }
  else if (h < 20.5) { skyC = 0x6a5a8a; sunC = 0x8a70a0; sunI = 0.4; hemiI = 0.45; fogC = 0x5a5170; lampI = 0.8; }
  else { skyC = 0x1c2236; sunC = 0x4a5878; sunI = 0.16; hemiI = 0.3; fogC = 0x1c2236; lampI = 1.0; }
  // 太阳角度：早东（+x）晚西（-x），正午高
  const t = Math.max(0, Math.min(1, (h - 6) / 12));
  const ang = t * Math.PI;
  sun.position.set(Math.cos(ang) * 18, 6 + Math.sin(ang) * 14 + 4, 8);
  sun.target.position.set(16, 0, 16);
  sun.color.setHex(sunC); sun.intensity = sunI;
  hemi.color.setHex(skyC); hemi.intensity = hemiI;
  scene.fog.color.setHex(fogC);
  renderer.setClearColor(fogC);
  for (const pl of lampLights) pl.intensity = lampI * 0.9;
}

// ---------- 粒子系统（落地扬尘 / 踢球火花） ----------
const puffs = [];
let puffTex = null;
function getPuffTex() {
  if (puffTex) return puffTex;
  const c = makeCanvas(32, 32), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
  g.addColorStop(0, 'rgba(255,255,255,.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(16, 16, 15, 0, Math.PI * 2); ctx.fill();
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}
function spawnPuff(x, y, h, n, color, spread) {
  for (let i = 0; i < n; i++) {
    const mat = new THREE.SpriteMaterial({ map: getPuffTex(), color: new THREE.Color(color || 0xcfc5b0), transparent: true, opacity: 0.8, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2, r = Math.random() * (spread || 0.25);
    sp.position.set(x + Math.cos(a) * r, h, y + Math.sin(a) * r);
    sp.scale.set(0.08, 0.08, 1);
    scene.add(sp);
    puffs.push({ sp, vx: Math.cos(a) * (0.3 + Math.random() * 0.5), vz: Math.sin(a) * (0.3 + Math.random() * 0.5), vy: 0.5 + Math.random() * 0.8, life: 0.55, age: 0 });
  }
}
function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.age += dt;
    if (p.age >= p.life) { scene.remove(p.sp); p.sp.material.dispose(); puffs.splice(i, 1); continue; }
    const k = p.age / p.life;
    p.sp.position.x += p.vx * dt; p.sp.position.z += p.vz * dt; p.sp.position.y += p.vy * dt;
    p.vy -= 1.2 * dt;
    const s = 0.08 + k * 0.16;
    p.sp.scale.set(s, s, 1);
    p.sp.material.opacity = 0.8 * (1 - k);
  }
}

// ---------- 可踢足球（重力/反弹/滚动/碰撞物理） ----------
const balls = [];
function makeBallTexture() {
  const c = makeCanvas(64, 32), ctx = c.getContext('2d');
  px(ctx, 0, 0, 64, 32, '#f2f2f2');
  ctx.fillStyle = '#2b2b30';
  for (let i = 0; i < 10; i++) {
    const x = (i % 5) * 13 + (i > 4 ? 6 : 0), y = i > 4 ? 20 : 6;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 - Math.PI / 2;
      const px_ = x + Math.cos(a) * 4, py_ = y + Math.sin(a) * 4;
      k === 0 ? ctx.moveTo(px_, py_) : ctx.lineTo(px_, py_);
    }
    ctx.closePath(); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
function addBall(x, y) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 12),
    new THREE.MeshStandardMaterial({ map: canvasTex(makeBallTexture()), roughness: 0.25, metalness: 0.05 })
  );
  mesh.castShadow = true;
  mesh.position.set(x, 0.09, y);
  scene.add(mesh);
  balls.push({ mesh, x, y, h: 0, vx: 0, vy: 0, vh: 0 });
}
function clearBalls() { for (const b of balls) scene.remove(b.mesh); balls.length = 0; }
const GRAV_BALL = 9.5;
function updateBalls(dt, player, world, npcs) {
  for (let bi = 0; bi < balls.length; bi++) {
    const b = balls[bi];
    // 重力与弹跳
    b.vh -= GRAV_BALL * dt;
    b.h += b.vh * dt;
    if (b.h <= 0) {
      b.h = 0;
      if (b.vh < -0.9) {
        b.vh = -b.vh * 0.55;
        if (b.vh > 0.8) spawnPuff(b.x, b.y, 0.06, 3, 0xb0a890, 0.12);   // 落地小尘
      }
      else b.vh = 0;
      // 滚动摩擦
      b.vx *= Math.pow(0.35, dt); b.vy *= Math.pow(0.35, dt);
    } else {
      b.vx *= Math.pow(0.75, dt); b.vy *= Math.pow(0.75, dt);  // 空气阻力
    }
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    // 墙反弹（带轻微随机扰动）
    if (wallAt3(nx, b.y)) { b.vx = -b.vx * 0.62 + (Math.random() - 0.5) * 0.3; spawnPuff(b.x, b.y, 0.1, 2, 0x9a9488, 0.08); }
    else b.x = nx;
    if (wallAt3(b.x, ny)) { b.vy = -b.vy * 0.62 + (Math.random() - 0.5) * 0.3; spawnPuff(b.x, b.y, 0.1, 2, 0x9a9488, 0.08); }
    else b.y = ny;
    // 道具碰撞（圆-圆推出 + 法线反弹）
    if (world) for (const p of world.props) {
      if (!p.blocking) continue;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), R = 0.42 + 0.09;
      if (d < R && d > 0.001) {
        const nxn = dx / d, nyn = dy / d;
        b.x = p.x + nxn * R; b.y = p.y + nyn * R;
        const vn = b.vx * nxn + b.vy * nyn;
        if (vn < 0) { b.vx -= 1.6 * vn * nxn; b.vy -= 1.6 * vn * nyn; }   // e=0.6 反弹
        if (Math.hypot(b.vx, b.vy) > 1.2) spawnPuff(b.x, b.y, 0.12, 2, 0xa89f8d, 0.08);
      }
    }
    // 球-球碰撞（等质量动量交换）
    for (let bj = bi + 1; bj < balls.length; bj++) {
      const o = balls[bj];
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
      if (d < 0.18 && d > 0.001) {
        const nxn = dx / d, nyn = dy / d;
        const rel = (b.vx - o.vx) * nxn + (b.vy - o.vy) * nyn;
        if (rel > 0) {
          const j = rel * 0.9;
          b.vx -= j * nxn; b.vy -= j * nyn;
          o.vx += j * nxn; o.vy += j * nyn;
          spawnPuff((b.x + o.x) / 2, (b.y + o.y) / 2, 0.12, 4, 0xffffff, 0.08);
        }
        const push = (0.18 - d) / 2;
        b.x -= nxn * push; b.y -= nyn * push;
        o.x += nxn * push; o.y += nyn * push;
      }
    }
    // 玩家踢球（碰撞半径 + 玩家速度注入 + 姿态差异）
    const dx = b.x - player.x, dy = b.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.28 && d > 0.001) {
      const pSpd = Math.hypot(player.vx || 0, player.vy || 0);
      let kick = 2.2 + pSpd * 1.4;
      if (player.h > 0.05) kick += 1.8;                                  // 跳跃大力抽射
      if (player.stance === 'crouch') kick *= 0.6;                       // 蹲姿轻拨
      if (player.stance === 'prone') kick *= 0.25;                       // 趴下只能蹭
      b.vx = dx / d * kick + (player.vx || 0) * 0.6;
      b.vy = dy / d * kick + (player.vy || 0) * 0.6;
      if (b.h <= 0.02) b.vh = 2.2 + Math.random();
      if (kick > 3) spawnPuff(b.x, b.y, 0.12, 6, 0xfff2c9, 0.15);        // 大力踢球火花
    }
    // NPC 轻推
    if (npcs) for (const nl of npcs) {
      if (nl.hidden) continue;
      const ddx = b.x - nl.x, ddy = b.y - nl.y, dd = Math.hypot(ddx, ddy);
      if (dd < 0.22 && dd > 0.001) {
        b.vx = ddx / dd * 1.2; b.vy = ddy / dd * 1.2;
        if (b.h <= 0.02) b.vh = 1.2;
      }
    }
    b.mesh.position.set(b.x, 0.09 + b.h, b.y);
    // 滚动自转
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0.05) {
      b.mesh.rotation.x += (b.vy * dt) / 0.09;
      b.mesh.rotation.y -= (b.vx * dt) / 0.09;
    }
  }
  updatePuffs(dt);
}
function wallAt3(x, y) {
  const m = (typeof window !== 'undefined' && window.__worldMap) ? window.__worldMap : null;
  if (!m) return false;
  return !!(m[Math.floor(y)] && m[Math.floor(y)][Math.floor(x)]);
}

// ---------- SSR 屏幕空间反射（Ray-Tracing 风格，双 pass + 深度 RT） ----------
let ssrRT = null, ssrScene = null, ssrCam = null, ssrMat = null, ssrEnabled = true;
function initSSR() {
  try {
    const w = Math.floor(720 / 2), h = Math.floor(405 / 2);   // 半分辨率保性能
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedShortType;
    ssrRT = new THREE.WebGLRenderTarget(w, h, { depthTexture: depth, depthBuffer: true });
    ssrCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    ssrScene = new THREE.Scene();
    ssrMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: ssrRT.texture },
        tDepth: { value: depth },
        uResolution: { value: new THREE.Vector2(w, h) },
        uNear: { value: 0.05 }, uFar: { value: 80 },
        uProj: { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uViewUp: { value: new THREE.Vector3(0, 1, 0) },
        uStrength: { value: 0.85 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D tColor; uniform sampler2D tDepth;
        uniform vec2 uResolution; uniform float uNear, uFar, uStrength;
        uniform mat4 uProj, uInvProj; uniform vec3 uViewUp;
        // 交错梯度噪声（去条带）
        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        // NDC 深度 → view space 距离（透视）
        float depthToView(float d) {
          float ndc = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / ((uFar + uNear) - ndc * (uFar - uNear));
        }
        vec3 viewPos(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 v = uInvProj * clip;
          return v.xyz / v.w;
        }
        void main() {
          vec4 base = texture2D(tColor, vUv);
          vec3 vp = viewPos(vUv);
          vec3 n = normalize(cross(dFdx(vp), dFdy(vp)));
          vec3 rd = reflect(normalize(vp), n);
          if (dot(rd, vec3(0.0, 0.0, -1.0)) <= 0.0) { gl_FragColor = base; return; }  // 射向相机后方
          // 权重：地面（法线朝上）主导 + Fresnel 掠射增强
          float upW = smoothstep(0.25, 0.85, dot(n, normalize(uViewUp)));
          float fres = pow(1.0 - clamp(dot(-normalize(vp), n), 0.0, 1.0), 3.0);
          float wBase = upW * 0.75 + fres * 0.35;
          // 屏幕空间 ray march
          vec3 p = vp + n * 0.02;
          float t = 0.06 + ign(gl_FragCoord.xy) * 0.05;
          vec3 hitCol = vec3(0.0); float hitW = 0.0;
          for (int i = 0; i < 20; i++) {
            t *= 1.38;
            vec3 sp = p + rd * t;
            vec4 cp = uProj * vec4(sp, 1.0);
            vec2 suv = cp.xy / cp.w * 0.5 + 0.5;
            if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
            float sceneZ = -depthToView(texture2D(tDepth, suv).x);
            float dz = sp.z - sceneZ;
            if (dz < -0.012 && dz > -0.9) {          // 命中：射线点在表面后方（厚度窗口）
              float edge = smoothstep(0.0, 0.12, suv.x) * smoothstep(0.0, 0.12, 1.0 - suv.x)
                         * smoothstep(0.0, 0.12, suv.y) * smoothstep(0.0, 0.12, 1.0 - suv.y);
              float distF = 1.0 - clamp(t / 12.0, 0.0, 0.8);
              hitCol = texture2D(tColor, suv).rgb;
              hitW = edge * distF;
              break;
            }
          }
          if (hitW <= 0.0) { gl_FragColor = base; return; }
          vec3 refl = hitCol;
          float w = clamp(wBase * hitW * uStrength, 0.0, 0.85);
          gl_FragColor = vec4(mix(base.rgb, refl * (0.85 + fres * 0.3), w), base.a);
        }
      `,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ssrMat);
    quad.frustumCulled = false;
    ssrScene.add(quad);
  } catch (e) {
    ssrEnabled = false;   // 深度纹理不可用则回退
    ssrRT = null;
  }
}
function setSSR(on) { ssrEnabled = on && !!ssrRT; }

// ---------- 帧渲染 ----------
// camOpts: {x, y, a, pitch(rad), mode:'first'|'third', dist, eyeH, thirdH, bob}
function frame3D(camOpts, minutes) {
  setDaylight(minutes);
  const dirX = Math.cos(camOpts.a), dirY = Math.sin(camOpts.a);
  if (camOpts.mode === 'first') {
    const eyeH = (camOpts.eyeH || 0.56) + (camOpts.bob || 0);
    camera3.position.set(camOpts.x, eyeH, camOpts.y);
    const p = camOpts.pitch || 0;
    camera3.lookAt(camOpts.x + dirX * Math.cos(p), eyeH + Math.sin(p), camOpts.y + dirY * Math.cos(p));
  } else {
    const d = camOpts.dist || 2.0, sh = camOpts.shoulder || 0.38;
    const eyeX = camOpts.x - dirX * d - dirY * sh, eyeY = camOpts.y - dirY * d + dirX * sh;
    camera3.position.set(eyeX, camOpts.thirdH || 1.45, eyeY);
    camera3.lookAt(camOpts.x + dirX * 0.6, (camOpts.eyeH || 0.56) - 0.08, camOpts.y + dirY * 0.6);
  }
  camera3.updateMatrixWorld();
  if (ssrEnabled && ssrRT && ssrMat) {
    // Pass 1：场景渲到带深度的 RT
    renderer.setRenderTarget(ssrRT);
    renderer.render(scene, camera3);
    // Pass 2：全屏 SSR 合成
    ssrMat.uniforms.uProj.value.copy(camera3.projectionMatrix);
    ssrMat.uniforms.uInvProj.value.copy(camera3.projectionMatrix).invert();
    const up = new THREE.Vector3(0, 1, 0).transformDirection(camera3.matrixWorldInverse);
    ssrMat.uniforms.uViewUp.value.copy(up);
    renderer.setRenderTarget(null);
    renderer.render(ssrScene, ssrCam);
  } else {
    renderer.render(scene, camera3);
  }
}

const Render = {
  RENDER_W: 720, RENDER_H: 405,
  init3D, buildWorld3D, frame3D, makePerson3D, syncPerson3D, setDaylight, initSSR, setSSR,
  get ssrOn() { return ssrEnabled; },
  addBall, clearBalls, updateBalls, spawnPuff, get balls() { return balls; },
  makePortrait, renderMinimap,
  get scene3D() { return scene; },
  get npcGroups() { return npcGroups; },
  get playerGroup() { return playerGroup; },
};
global.Render = Render;
})(typeof window !== 'undefined' ? window : globalThis);
