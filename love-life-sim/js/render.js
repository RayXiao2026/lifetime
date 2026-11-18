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
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  camera3 = new THREE.PerspectiveCamera(70, canvas.width / canvas.height, 0.05, 80);
  hemi = new THREE.HemisphereLight(0xbfd9f2, 0x5a6a4f, 0.95);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff2d5, 1.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0004;
  scene.add(sun); scene.add(sun.target);
  scene.fog = new THREE.Fog(0xcfe2f2, 14, 46);
}

function canvasTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function buildWorld3D(world, D) {
  while (scene.children.length) scene.remove(scene.children[0]);
  scene.add(hemi); scene.add(sun); scene.add(sun.target);
  npcGroups = new Map(); lampLights.length = 0;

  // 地面
  const gTex = canvasTex(buildGroundTexture());
  gTex.magFilter = THREE.LinearFilter;
  groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 32),
    new THREE.MeshLambertMaterial({ map: gTex })
  );
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
    const mat = new THREE.MeshLambertMaterial({ map: canvasTex(texes[t] || texes[1]) });
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
      new THREE.MeshLambertMaterial({ color: roofColors[t] || 0x777777 })
    );
    roof.position.set(x + w / 2, 1.04, y + h / 2);
    roof.castShadow = true; roof.receiveShadow = true;
    roofGroup.add(roof);
  }
  scene.add(roofGroup);

  // 树木（干 + 冠 Instanced）
  const trees = world.props.filter(p => p.type === 'tree');
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.1, 0.5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2b });
  const crownGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f7f4d });
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
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 6), new THREE.MeshLambertMaterial({ color: 0x3a3a44 }));
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
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
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
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), new THREE.MeshLambertMaterial({ color: 0x5aa8d5, transparent: true, opacity: 0.85 }));
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
// 部件几何/材质缓存（共享，降低创建开销）
const P_CACHE = {};
function pgeo(key, make) { if (!P_CACHE[key]) P_CACHE[key] = make(); return P_CACHE[key]; }
function pmat(key, color) {
  const k = key + color;
  if (!P_CACHE[k]) P_CACHE[k] = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
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

  // ===== 头部组（含五官与表情部件） =====
  const head = new THREE.Group();
  head.position.y = 0.585;
  // 圆润蛋形头
  const skull = part(pgeo('skull', () => new THREE.SphereGeometry(0.085, 18, 14)), skin, 0, 0, 0);
  skull.scale.set(1, 1.08, 0.95);
  head.add(skull);
  // 耳朵
  head.add(part(pgeo('ear', () => new THREE.SphereGeometry(0.022, 8, 6)), skin, -0.086, 0, 0));
  head.add(part(pgeo('ear', () => new THREE.SphereGeometry(0.022, 8, 6)), skin, 0.086, 0, 0));
  // 眼睛（眼白+虹膜+瞳孔高光+睫毛）
  function eye(sx) {
    const e = new THREE.Group();
    e.position.set(0.032 * sx, 0.005, 0.068);
    const white = part(pgeo('eyeW', () => new THREE.SphereGeometry(0.0155, 10, 8)), pmat('eyeW', '#ffffff'), 0, 0, 0);
    white.scale.set(1, 1, 0.55);
    const iris = part(pgeo('iris', () => new THREE.SphereGeometry(0.0095, 8, 8)), pmat('iris', '#5a6a9a'), 0, 0, 0.006);
    iris.scale.set(1, 1, 0.5);
    const glint = part(pgeo('glint', () => new THREE.SphereGeometry(0.003, 6, 6)), pmat('glint', '#ffffff'), -0.003 * sx, 0.004, 0.011);
    const lash = part(pgeo('lash', () => new THREE.BoxGeometry(0.032, 0.0035, 0.004)), pmat('lash', '#3a3340'), 0, 0.014, 0.003);
    e.add(white); e.add(iris); e.add(glint); e.add(lash);
    return e;
  }
  const eyeL = eye(-1), eyeR = eye(1);
  head.add(eyeL); head.add(eyeR);
  // 眉毛
  const browL = part(pgeo('brow', () => new THREE.BoxGeometry(0.03, 0.0045, 0.004)), hairD, -0.032, 0.052, 0.072);
  const browR = part(pgeo('brow', () => new THREE.BoxGeometry(0.03, 0.0045, 0.004)), hairD, 0.032, 0.052, 0.072);
  head.add(browL); head.add(browR);
  // 鼻子
  head.add(part(pgeo('nose', () => new THREE.BoxGeometry(0.009, 0.015, 0.012)), skinD, 0, -0.012, 0.08));
  // 嘴（三种状态）
  const mouthSmile = new THREE.Mesh(pgeo('smile', () => new THREE.TorusGeometry(0.013, 0.0028, 6, 10, Math.PI)), pmat('mouth', '#c4707a'));
  mouthSmile.rotation.z = Math.PI; mouthSmile.position.set(0, -0.032, 0.074);
  const mouthOpen = part(pgeo('open', () => new THREE.SphereGeometry(0.009, 8, 6)), pmat('mouthIn', '#a05560'), 0, -0.034, 0.072);
  mouthOpen.scale.set(1.2, 0.75, 0.45);
  const mouthSad = new THREE.Mesh(pgeo('sad', () => new THREE.TorusGeometry(0.012, 0.0026, 6, 10, Math.PI)), pmat('mouth', '#c4707a'));
  mouthSad.position.set(0, -0.026, 0.074);
  head.add(mouthSmile); head.add(mouthOpen); head.add(mouthSad);
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
  // 刘海
  head.add(part(pgeo('bang', () => new THREE.BoxGeometry(0.13, 0.028, 0.02)), hairM, 0, 0.052, 0.058));
  const hs = style.hairStyle;
  if (hs === 'long') {
    const back = part(pgeo('hlong', () => new THREE.SphereGeometry(0.088, 14, 12)), hairM, 0, -0.09, -0.012);
    back.scale.set(1, 1.9, 0.85);
    head.add(back);
    head.add(part(pgeo('hside', () => new THREE.SphereGeometry(0.026, 8, 8)), hairM, -0.082, -0.03, 0.03));
    head.add(part(pgeo('hside', () => new THREE.SphereGeometry(0.026, 8, 8)), hairM, 0.082, -0.03, 0.03));
  } else if (hs === 'ponytail') {
    const pt = part(pgeo('hpt1', () => new THREE.SphereGeometry(0.024, 8, 8)), hairM, 0, -0.02, -0.09);
    head.add(pt);
    head.add(part(pgeo('hpt2', () => new THREE.SphereGeometry(0.02, 8, 8)), hairM, 0, -0.07, -0.1));
    head.add(part(pgeo('hpt3', () => new THREE.SphereGeometry(0.015, 8, 8)), hairM, 0, -0.11, -0.095));
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
    mouthSmile, mouthOpen, mouthSad, blushL, blushR,
    walkT: 0,
  };
  applyExpr(g, 'normal');
  return g;
}
function mixCss(hex, rgb2, t) {
  const c1 = hex2rgb(hex);
  const m = mixRGB(c1, rgb2, t);
  return rgbCss(m);
}

// 表情：normal | happy | shy | sad
function applyExpr(g, expr) {
  const u = g.userData;
  if (!u.mouthSmile) return;
  const happy = expr === 'happy', shy = expr === 'shy', sad = expr === 'sad';
  // 眼睛：开心眯眼、害羞半垂
  const sy = happy ? 0.35 : shy ? 0.62 : 1;
  u.eyeL.scale.y = sy; u.eyeR.scale.y = sy;
  // 眉毛：难过时八字
  u.browL.rotation.z = sad ? -0.45 : 0;
  u.browR.rotation.z = sad ? 0.45 : 0;
  u.browL.position.y = sad ? 0.046 : 0.052;
  u.browR.position.y = sad ? 0.058 : 0.052;
  // 嘴型切换
  u.mouthSmile.visible = !happy && !sad;
  u.mouthOpen.visible = happy;
  u.mouthSad.visible = sad;
  // 腮红
  u.blushL.visible = u.blushR.visible = (happy || shy);
  // 头部姿态：害羞低头
  u.head.rotation.x = shy ? 0.18 : 0;
}

// 同步人物动画：state = {x, y, yaw, moving, walkT, waving, expr}
function syncPerson3D(g, st) {
  g.position.set(st.x, 0, st.y);
  g.rotation.y = Math.PI / 2 - st.yaw;
  const w = st.moving ? Math.sin(st.walkT * Math.PI) : 0;
  g.userData.legL.rotation.x = w * 0.7;
  g.userData.legR.rotation.x = -w * 0.7;
  g.userData.armL.rotation.x = -w * 0.55;
  if (st.waving) {
    g.userData.armR.rotation.x = 0;
    g.userData.armR.rotation.z = -2.4 + Math.sin(st.walkT * 6) * 0.25;   // 举臂挥手
  } else {
    g.userData.armR.rotation.z = 0;
    g.userData.armR.rotation.x = w * 0.55;
  }
  // 呼吸/走路轻微起伏
  g.position.y = st.moving ? Math.abs(Math.sin(st.walkT * Math.PI)) * 0.012 : Math.sin((st.walkT || 0) * 0.8) * 0.002;
  applyExpr(g, st.expr || 'normal');
  if (g.userData.nameSprite) {
    g.userData.nameSprite.visible = st.showName !== false;
  }
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

// ---------- 帧渲染 ----------
// camOpts: {x, y, a, pitch(rad), mode:'first'|'third', dist}
function frame3D(camOpts, minutes) {
  setDaylight(minutes);
  const dirX = Math.cos(camOpts.a), dirY = Math.sin(camOpts.a);
  if (camOpts.mode === 'first') {
    camera3.position.set(camOpts.x, 0.56, camOpts.y);
    const p = camOpts.pitch || 0;
    camera3.lookAt(camOpts.x + dirX * Math.cos(p), 0.56 + Math.sin(p), camOpts.y + dirY * Math.cos(p));
  } else {
    const d = camOpts.dist || 2.0, sh = camOpts.shoulder || 0.38;
    const eyeX = camOpts.x - dirX * d - dirY * sh, eyeY = camOpts.y - dirY * d + dirX * sh;
    camera3.position.set(eyeX, 1.45, eyeY);
    camera3.lookAt(camOpts.x + dirX * 0.6, 0.45, camOpts.y + dirY * 0.6);
  }
  renderer.render(scene, camera3);
}

const Render = {
  RENDER_W: 720, RENDER_H: 405,
  init3D, buildWorld3D, frame3D, makePerson3D, syncPerson3D, setDaylight,
  makePortrait, renderMinimap,
  get scene3D() { return scene; },
  get npcGroups() { return npcGroups; },
  get playerGroup() { return playerGroup; },
};
global.Render = Render;
})(typeof window !== 'undefined' ? window : globalThis);
