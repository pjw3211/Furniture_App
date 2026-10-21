import { createFurniture } from "./furniture.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

const F = createFurniture(THREE, { toCreasedNormals, RoundedBoxGeometry });
const TYPES = Object.fromEntries(F.types.map(t => [t.id, t]));
const IN = 0.0254;
const $ = id => document.getElementById(id);

// =====================================================================
//  Materials
// =====================================================================
const WOODS = [
  { id: "walnut", name: "Walnut", color: 0x5a3a24 },
  { id: "teak", name: "Teak", color: 0x9a6634 },
  { id: "oak", name: "White oak", color: 0xc9a77a },
  { id: "rosewood", name: "Rosewood", color: 0x4a2418 },
];
const FABRICS = [
  { id: "mustard", name: "Mustard", color: 0xc89b2c }, { id: "olive", name: "Olive", color: 0x6b6b2f },
  { id: "teal", name: "Teal", color: 0x2f6b6b }, { id: "rust", name: "Rust", color: 0xa5482a },
  { id: "charcoal", name: "Charcoal", color: 0x3c3c40 }, { id: "cream", name: "Cream", color: 0xe3d8c2 },
  { id: "blush", name: "Blush", color: 0xd4a196 }, { id: "navy", name: "Navy", color: 0x26334f },
];
const ACCENTS = [
  { id: "white", name: "White", color: 0xf0ece4 }, { id: "black", name: "Black", color: 0x232323 },
  { id: "orange", name: "Orange", color: 0xd0632a }, { id: "teal", name: "Teal", color: 0x2f6b6b },
  { id: "mustard", name: "Mustard", color: 0xc89b2c },
];
const pick = (list, id) => (list.find(x => x.id === id) || list[0]).color;
function materialsFor(p) {
  return {
    wood: new THREE.MeshStandardMaterial({ color: pick(WOODS, p.finish), roughness: 0.55, side: THREE.DoubleSide }),
    fabric: new THREE.MeshStandardMaterial({ color: pick(FABRICS, p.fabric), roughness: 0.95 }),
    accent: new THREE.MeshStandardMaterial({ color: pick(ACCENTS, p.accent), roughness: 0.45, side: THREE.DoubleSide }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc09a45, roughness: 0.3, metalness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x241b15, roughness: 0.8, side: THREE.DoubleSide }),
  };
}

// Build a piece as a THREE.Group in inches.
function buildPiece(type, params, explode = false) {
  const T = TYPES[type];
  const s = { ...T.defaults, ...params };
  T.clamp(s);
  const res = T.build(s);
  const mats = materialsFor(s);
  const g = new THREE.Group();
  const lift = { top: 8.5, aprons: 3.5, shelf: 0, legs: 0 };
  for (const part of res.parts) {
    const m = new THREE.Mesh(part.geo, mats[part.mat]);
    m.castShadow = m.receiveShadow = true;
    m.userData.lift = explode ? (lift[part.part] || 0) : 0;
    m.userData.part = part.part;
    g.add(m);
  }
  g.userData.info = res.info;
  return g;
}
function disposeGroup(g) {
  g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
}

// =====================================================================
//  Storage: my pieces + room, kept in this browser
// =====================================================================
const STORE = "mcm-living-room-v1";
let db = null;
function loadDb() {
  try { db = JSON.parse(localStorage.getItem(STORE)); } catch (e) { db = null; }
  if (!db || !Array.isArray(db.pieces)) db = seedDb();
  db.room = { ...ROOM_DEFAULTS, ...(db.room || {}) };
  db.room.items = db.room.items || [];
}
function saveDb() { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { /* private mode */ } }
const uid = () => Math.random().toString(36).slice(2, 10);
const ROOM_DEFAULTS = { width_ft: 16, depth_ft: 13, wall: "white", floor: "oak", rug: "cream",
  rug_w: 96, rug_d: 66, window: 1, right_wall: 0, light: "day", items: [] };

function seedDb() {
  const d = { pieces: [], room: { ...ROOM_DEFAULTS } };
  const add = (type, name, params = {}) => d.pieces.push({ id: uid(), type, name, params: { ...TYPES[type].defaults, ...params } });
  // keep a coffee table from the old single-table page if its address had one
  const legacy = {};
  for (const kv of location.hash.slice(1).split("&")) {
    const [k, v] = kv.split("=");
    if (k in TYPES.coffee_table.defaults && v !== undefined)
      legacy[k] = isNaN(parseFloat(v)) ? decodeURIComponent(v) : parseFloat(v);
  }
  add("sofa", "Sofa");
  add("coffee_table", "Coffee table", legacy);
  add("lounge_chair", "Lounge chair");
  add("side_table", "Side table");
  add("credenza", "Credenza");
  add("bookcase", "Bookcase");
  d.room.items = autoLayout(d.pieces, d.room);
  return d;
}

// =====================================================================
//  Renderer, two scenes (designer and room)
// =====================================================================
const host = $("view");
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
host.appendChild(renderer.domElement);
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// ---- designer scene ----
const dScene = new THREE.Scene();
dScene.background = new THREE.Color(0xf4efe6);
dScene.environment = envTex; dScene.environmentIntensity = 0.6;
const dSun = new THREE.DirectionalLight(0xfff3e0, 2.2);
dSun.position.set(1.2, 2.4, 1.0); dSun.castShadow = true;
dSun.shadow.mapSize.set(2048, 2048);
Object.assign(dSun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 6 });
dSun.shadow.bias = -0.0005;
dScene.add(dSun, new THREE.HemisphereLight(0xffffff, 0xd8c8b0, 0.6));
const dFloor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
dFloor.rotation.x = -Math.PI / 2; dFloor.receiveShadow = true; dScene.add(dFloor);
const dHolder = new THREE.Group(); dHolder.scale.setScalar(IN); dScene.add(dHolder);

// ---- room scene ----
const rScene = new THREE.Scene();
rScene.background = new THREE.Color(0xe9e2d6);
rScene.environment = envTex; rScene.environmentIntensity = 0.45;
const roomRoot = new THREE.Group(); roomRoot.scale.setScalar(IN); rScene.add(roomRoot);
const shell = new THREE.Group(); roomRoot.add(shell);
const furnitureRoot = new THREE.Group(); roomRoot.add(furnitureRoot);
const rHemi = new THREE.HemisphereLight(0xffffff, 0xcbb89a, 0.7);
const rSun = new THREE.DirectionalLight(0xfff1dc, 2.6);
rSun.castShadow = true; rSun.shadow.mapSize.set(2048, 2048); rSun.shadow.bias = -0.0004;
const rLamp = new THREE.PointLight(0xffb867, 0, 0, 1.6);
rLamp.castShadow = true;
rScene.add(rHemi, rSun, rSun.target, rLamp);

let mode = "design";

// =====================================================================
//  Procedural textures for the room
// =====================================================================
function canvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function boards(base, vary) {
  return (ctx, w, h) => {
    const r = rand(7), rows = 8;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 400;
      while (x < w) {
        const len = 260 + r() * 300, k = 1 + (r() - 0.5) * vary;
        const c = base.map(v => Math.max(0, Math.min(255, v * k)));
        ctx.fillStyle = `rgb(${c.join(",")})`;
        ctx.fillRect(x, i * h / rows, len, h / rows);
        ctx.strokeStyle = "rgba(0,0,0,.05)";
        for (let g = 0; g < 6; g++) {
          ctx.beginPath(); const y = i * h / rows + r() * h / rows;
          ctx.moveTo(x, y); ctx.bezierCurveTo(x + len / 3, y + 4, x + len * 2 / 3, y - 4, x + len, y); ctx.stroke();
        }
        ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(x, i * h / rows, 2, h / rows);
        x += len;
      }
      ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(0, i * h / rows, w, 2);
    }
  };
}
const FLOORS = [
  { id: "oak", name: "Oak boards", color: 0xc8a272, tex: () => boards([200, 160, 110], 0.16), size: [96, 48] },
  { id: "walnut", name: "Walnut boards", color: 0x6e4a31, tex: () => boards([112, 74, 48], 0.2), size: [96, 48] },
  { id: "terrazzo", name: "Terrazzo", color: 0xd9d2c4, size: [48, 48], tex: () => (ctx, w, h) => {
    ctx.fillStyle = "#ddd6c8"; ctx.fillRect(0, 0, w, h); const r = rand(3);
    const cols = ["#b9b0a0", "#8c8478", "#c46a3a", "#e9e4da", "#6f7a6d"];
    for (let i = 0; i < 1600; i++) { ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.arc(r() * w, r() * h, 1 + r() * 5, 0, 7); ctx.fill(); } } },
  { id: "carpet", name: "Carpet", color: 0x9c8f7d, size: [24, 24], tex: () => (ctx, w, h) => {
    ctx.fillStyle = "#9c8f7d"; ctx.fillRect(0, 0, w, h); const r = rand(11);
    for (let i = 0; i < 20000; i++) { ctx.fillStyle = `rgba(${r() < .5 ? "255,255,255" : "0,0,0"},.05)`;
      ctx.fillRect(r() * w, r() * h, 2, 2); } } },
];
const WALLS = [
  { id: "white", name: "Warm white", color: 0xeee7da },
  { id: "sage", name: "Sage", color: 0xa7ad8f },
  { id: "terracotta", name: "Terracotta", color: 0xc07a58 },
  { id: "navy", name: "Navy", color: 0x2f3b55 },
  { id: "panel", name: "Wood panel", color: 0x7a5233, tex: true },
];
const RUGS = [
  { id: "none", name: "No rug", color: 0xffffff },
  { id: "cream", name: "Cream wool", color: 0xe8dfcc },
  { id: "mustard", name: "Mustard", color: 0xc89b2c },
  { id: "geo", name: "Geometric", color: 0x2f6b6b },
  { id: "stripe", name: "Stripes", color: 0xa5482a },
];
function rugTex(id) {
  return canvasTex(512, 512, (ctx, w, h) => {
    const r = rand(5);
    const fill = { cream: "#e8dfcc", mustard: "#c89b2c", geo: "#e6dccb", stripe: "#e9e0cf" }[id];
    ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h);
    if (id === "geo") {
      const cols = ["#2f6b6b", "#c89b2c", "#a5482a", "#2b2118"];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        ctx.fillStyle = cols[(i + j) % 4]; const x = i * w / 6 + w / 12, y = j * h / 6 + h / 12;
        ctx.beginPath();
        if ((i * 3 + j) % 3 === 0) ctx.arc(x, y, w / 22, 0, 7);
        else if ((i + j) % 3 === 1) { ctx.moveTo(x, y - w / 18); ctx.lineTo(x + w / 18, y + w / 22); ctx.lineTo(x - w / 18, y + w / 22); }
        else ctx.rect(x - w / 26, y - w / 26, w / 13, w / 13);
        ctx.fill();
      }
    } else if (id === "stripe") {
      const cols = ["#a5482a", "#2b2118", "#c89b2c", "#e9e0cf"];
      for (let i = 0; i < 16; i++) { ctx.fillStyle = cols[i % 4]; ctx.fillRect(i * w / 16, 0, w / 32, h); }
    }
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = `rgba(${r() < .5 ? "255,255,255" : "0,0,0"},.06)`;
      ctx.fillRect(r() * w, r() * h, 2, 2); }
    ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = 10; ctx.strokeRect(10, 10, w - 20, h - 20);
  });
}

// =====================================================================
//  Room shell
// =====================================================================
const roomDims = () => ({ W: db.room.width_ft * 12, D: db.room.depth_ft * 12, H: 102 });
function buildShell() {
  shell.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  shell.clear();
  const { W, D, H } = roomDims(), R = db.room;
  const fl = FLOORS.find(f => f.id === R.floor) || FLOORS[0];
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: canvasTex(1024, 512, fl.tex(), W / fl.size[0], D / fl.size[1]), roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = "floor";
  shell.add(floor);
  const wl = WALLS.find(w => w.id === R.wall) || WALLS[0];
  const wallMat = () => wl.tex
    ? new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(512, 256, (ctx, w, h) => {
        const r = rand(9); for (let i = 0; i < 16; i++) { const k = 0.85 + r() * 0.3;
          ctx.fillStyle = `rgb(${[122 * k, 82 * k, 51 * k].map(Math.round).join(",")})`; ctx.fillRect(i * w / 16, 0, w / 16, h);
          ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(i * w / 16, 0, 2, h); } }, W / 64, 1) })
    : new THREE.MeshStandardMaterial({ color: wl.color, roughness: 0.92 });
  const T = 4;
  // back wall with an optional window
  const back = new THREE.Shape([new THREE.Vector2(-W / 2 - T, 0), new THREE.Vector2(W / 2 + T, 0),
    new THREE.Vector2(W / 2 + T, H), new THREE.Vector2(-W / 2 - T, H)]);
  const win = { w: Math.min(72, W * 0.4), h: 54, y0: 30, x: W * 0.18 };
  if (R.window) back.holes.push(new THREE.Path([new THREE.Vector2(win.x - win.w / 2, win.y0),
    new THREE.Vector2(win.x - win.w / 2, win.y0 + win.h), new THREE.Vector2(win.x + win.w / 2, win.y0 + win.h),
    new THREE.Vector2(win.x + win.w / 2, win.y0)]));
  const bw = new THREE.Mesh(new THREE.ExtrudeGeometry(back, { depth: T, bevelEnabled: false }), wallMat());
  bw.position.z = -D / 2 - T; bw.receiveShadow = true; bw.castShadow = true; shell.add(bw);
  if (R.window) {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 0.5 });
    const fr = new THREE.Group();
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, T + 1), frameMat);
      m.position.set(x, y, -D / 2 - T / 2); m.castShadow = true; fr.add(m); };
    bar(win.w + 3, 1.5, win.x, win.y0); bar(win.w + 3, 1.5, win.x, win.y0 + win.h);
    bar(1.5, win.h, win.x - win.w / 2, win.y0 + win.h / 2); bar(1.5, win.h, win.x + win.w / 2, win.y0 + win.h / 2);
    bar(1, win.h, win.x, win.y0 + win.h / 2);
    shell.add(fr);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(win.w * 3, win.h * 3),
      new THREE.MeshBasicMaterial({ color: R.light === "day" ? 0xcfe3ef : 0x29324a }));
    sky.position.set(win.x, win.y0 + win.h / 2, -D / 2 - 40); shell.add(sky);
  }
  const side = (x, flip) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(T, H, D + T), wallMat());
    m.position.set(x + (flip ? T / 2 : -T / 2), H / 2, -T / 2); m.receiveShadow = true; m.castShadow = true; shell.add(m);
  };
  side(-W / 2, false);
  if (R.right_wall) side(W / 2, true);
  // skirting
  const sk = new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 0.5 });
  const sb = new THREE.Mesh(new THREE.BoxGeometry(W, 4, 0.6), sk); sb.position.set(0, 2, -D / 2 + 0.3); shell.add(sb);
  const sl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, D), sk); sl.position.set(-W / 2 + 0.3, 2, 0); shell.add(sl);
  // rug
  if (R.rug !== "none") {
    const rug = new THREE.Mesh(new THREE.BoxGeometry(R.rug_w, 0.35, R.rug_d),
      new THREE.MeshStandardMaterial({ map: rugTex(R.rug), roughness: 1 }));
    rug.position.set(0, 0.18, D * 0.08); rug.receiveShadow = true; rug.name = "rug"; shell.add(rug);
  }
  // lighting
  const day = R.light === "day";
  rHemi.intensity = day ? 0.75 : 0.3;
  rScene.environmentIntensity = day ? 0.45 : 0.12;
  rSun.intensity = day ? 2.6 : 0.25;
  rSun.color.set(day ? 0xfff1dc : 0x8aa0d0);
  const sunPos = new THREE.Vector3(win.x + 40, 150, -D / 2 - 120).multiplyScalar(IN);
  rSun.position.copy(sunPos); rSun.target.position.set(0, 0, D * 0.15 * IN);
  const ext = Math.max(W, D) * IN * 0.75;
  Object.assign(rSun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.1, far: 12 });
  rSun.shadow.camera.updateProjectionMatrix();
  rLamp.intensity = day ? 0 : 3.2;
  rLamp.position.set(-W * 0.3 * IN, 70 * IN, -D * 0.25 * IN);
  rScene.background.set(day ? 0xe9e2d6 : 0x1d1a17);
}

// =====================================================================
//  Room furniture
// =====================================================================
const pieceById = id => db.pieces.find(p => p.id === id);
let selected = null;
const selRing = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc0612b }));
selRing.visible = false; roomRoot.add(selRing);
const selFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ color: 0xc0612b, transparent: true, opacity: 0.22, depthWrite: false }));
selFill.rotation.x = -Math.PI / 2; selFill.renderOrder = 2; selFill.visible = false; roomRoot.add(selFill);

function footprint(group) {
  const b = new THREE.Box3();
  group.updateMatrixWorld(true);
  for (const m of group.children) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox); }
  return b;
}
function syncRoomFurniture() {
  for (const c of [...furnitureRoot.children]) { disposeGroup(c); furnitureRoot.remove(c); }
  db.room.items = db.room.items.filter(it => pieceById(it.pieceId));
  for (const it of db.room.items) {
    const p = pieceById(it.pieceId);
    const g = buildPiece(p.type, p.params);
    g.userData.item = it;
    g.userData.box = footprint(g);
    placeGroup(g);
    furnitureRoot.add(g);
  }
  updateSelection();
}
function placeGroup(g) {
  const it = g.userData.item;
  g.position.set(it.x, 0, it.z);
  g.rotation.y = THREE.MathUtils.degToRad(it.rot);
}
function updateSelection() {
  const g = furnitureRoot.children.find(c => c.userData.item.uid === selected);
  $("selbox").style.display = g ? "block" : "none";
  selRing.visible = selFill.visible = !!g && mode === "room";
  if (!g) return;
  const p = pieceById(g.userData.item.pieceId);
  $("sel-name").textContent = p.name;
  const b = g.userData.box, pad = 1.5;
  const pts = [[b.min.x - pad, b.min.z - pad], [b.max.x + pad, b.min.z - pad], [b.max.x + pad, b.max.z + pad], [b.min.x - pad, b.max.z + pad]]
    .map(([x, z]) => new THREE.Vector3(x, 0.5, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position));
  selRing.geometry.dispose(); selRing.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  selFill.scale.set(b.max.x - b.min.x + 2 * pad, b.max.z - b.min.z + 2 * pad, 1);
  const bc = new THREE.Vector3((b.min.x + b.max.x) / 2, 0.6, (b.min.z + b.max.z) / 2)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
  selFill.position.copy(bc);
  selFill.rotation.set(-Math.PI / 2, 0, g.rotation.y);
}
// Keep the whole (turned) footprint inside the room.
function clampItem(it, g) {
  const { W, D } = roomDims(), b = g.userData.box, a = THREE.MathUtils.degToRad(it.rot);
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const hw = (b.max.x - b.min.x) / 2, hd = (b.max.z - b.min.z) / 2;
  const ex = Math.min(c * hw + s * hd, W / 2), ez = Math.min(s * hw + c * hd, D / 2);
  it.x = Math.max(-W / 2 + ex, Math.min(W / 2 - ex, it.x));
  it.z = Math.max(-D / 2 + ez, Math.min(D / 2 - ez, it.z));
}

// Typical mid-century living room layout from the pieces given.
function autoLayout(pieces, room) {
  const W = room.width_ft * 12, D = room.depth_ft * 12, items = [];
  const byType = t => pieces.filter(p => p.type === t);
  const sofa = byType("sofa")[0], ct = byType("coffee_table")[0];
  const sofaD = sofa ? sofa.params.depth : 34, sofaW = sofa ? sofa.params.width : 84;
  const sofaZ = -D / 2 + sofaD / 2 + 4;
  const put = (p, x, z, rot) => p && items.push({ uid: uid(), pieceId: p.id, x, z, rot });
  put(sofa, 0, sofaZ, 0);
  put(ct, 0, sofaZ + sofaD / 2 + 16 + (ct ? ct.params.table_w / 2 : 11), 0);
  const chairs = byType("lounge_chair");
  chairs.forEach((c, i) => put(c, (i % 2 ? -1 : 1) * (sofaW / 2 + 10), sofaZ + sofaD + 34, i % 2 ? 125 : -125));
  byType("side_table").forEach((s, i) => put(s, (i % 2 ? 1 : -1) * (sofaW / 2 + 14), sofaZ, 0));
  byType("credenza").forEach((c, i) => put(c, -W / 2 + c.params.depth / 2 + 3, -D / 2 + 30 + c.params.length / 2 + sofaD + i * 70, 90));
  byType("bookcase").forEach((b, i) => put(b, W / 2 - b.params.width / 2 - 12 - i * (b.params.width + 6), -D / 2 + b.params.depth / 2 + 2, 0));
  return items;
}

// ---- picking and dragging in the room ----
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null;
function pointerToFloor(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(floorPlane, hit)) return null;
  return hit.divideScalar(IN);
}
renderer.domElement.addEventListener("pointerdown", ev => {
  if (mode !== "room" || ev.button !== 0) return;
  pointerToFloor(ev);
  const hits = ray.intersectObjects(furnitureRoot.children, true);
  if (!hits.length) { selected = null; updateSelection(); return; }
  let g = hits[0].object; while (g.parent !== furnitureRoot) g = g.parent;
  selected = g.userData.item.uid; updateSelection();
  const f = pointerToFloor(ev);
  drag = { g, dx: g.position.x - f.x, dz: g.position.z - f.z, moved: false };
  controls.enabled = false;
  renderer.domElement.setPointerCapture(ev.pointerId);
});
renderer.domElement.addEventListener("pointermove", ev => {
  if (!drag) return;
  const f = pointerToFloor(ev); if (!f) return;
  const it = drag.g.userData.item;
  it.x = Math.round((f.x + drag.dx) * 2) / 2; it.z = Math.round((f.z + drag.dz) * 2) / 2;
  clampItem(it, drag.g); placeGroup(drag.g); updateSelection(); drag.moved = true;
});
const endDrag = () => { if (drag) { if (drag.moved) saveDb(); drag = null; controls.enabled = true; } };
renderer.domElement.addEventListener("pointerup", endDrag);
renderer.domElement.addEventListener("pointercancel", endDrag);

function turnSelected(deg) {
  const g = furnitureRoot.children.find(c => c.userData.item.uid === selected); if (!g) return;
  g.userData.item.rot = ((g.userData.item.rot + deg) % 360 + 360) % 360;
  clampItem(g.userData.item, g); placeGroup(g); updateSelection(); saveDb();
}
$("rot-l").onclick = () => turnSelected(45);
$("rot-r").onclick = () => turnSelected(-45);
$("dup").onclick = () => {
  const it = db.room.items.find(i => i.uid === selected); if (!it) return;
  const n = { ...it, uid: uid(), x: it.x + 24, z: it.z + 12 };
  db.room.items.push(n); selected = n.uid; saveDb(); syncRoomFurniture();
};
$("del-sel").onclick = () => {
  db.room.items = db.room.items.filter(i => i.uid !== selected); selected = null; saveDb(); syncRoomFurniture();
};
$("edit-sel").onclick = () => {
  const it = db.room.items.find(i => i.uid === selected); if (it) editPiece(it.pieceId);
};
addEventListener("keydown", e => {
  if (mode !== "room" || !selected || e.target.tagName === "INPUT") return;
  if (e.key === "q" || e.key === "Q") turnSelected(15);
  if (e.key === "e" || e.key === "E") turnSelected(-15);
  if (e.key === "Delete" || e.key === "Backspace") $("del-sel").click();
});

function placePiece(pieceId, at) {
  const p = pieceById(pieceId), { D } = roomDims();
  const it = { uid: uid(), pieceId, x: at ? at.x : 0, z: at ? at.z : D * 0.1, rot: 0 };
  db.room.items.push(it); selected = it.uid; saveDb(); syncRoomFurniture();
  const g = furnitureRoot.children.find(c => c.userData.item.uid === it.uid);
  clampItem(it, g); placeGroup(g); updateSelection(); saveDb();
  toast(`${p.name} placed. Drag it to move it.`);
}

// =====================================================================
//  Thumbnails
// =====================================================================
const thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
thumbR.setPixelRatio(1); thumbR.setSize(320, 240, false);
thumbR.toneMapping = THREE.ACESFilmicToneMapping; thumbR.localClippingEnabled = true;
const tScene = new THREE.Scene();
tScene.environment = envTex; tScene.environmentIntensity = 0.7;
const tLight = new THREE.DirectionalLight(0xfff3e0, 2.4); tLight.position.set(1, 2.5, 1.5);
tScene.add(tLight, new THREE.HemisphereLight(0xffffff, 0xd8c8b0, 0.7));
const tCam = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 2000);
const thumbCache = new Map();
function thumb(type, params, focus) {
  const key = type + JSON.stringify(params) + (focus || "");
  if (thumbCache.has(key)) return thumbCache.get(key);
  const g = buildPiece(type, params);
  const s = { ...TYPES[type].defaults, ...params };
  let box = new THREE.Box3().setFromObject(g);
  const planes = [];
  if (focus === "leg") {
    const legTop = s.leg_h ?? (s.table_h - s.top_t - Math.max(3, s.apron_h));
    const size = box.getSize(new THREE.Vector3());
    const x0 = size.x / 2 - Math.min(10, size.x / 3), z0 = size.z / 2 - Math.min(10, size.z / 3);
    planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0), new THREE.Plane(new THREE.Vector3(0, 0, 1), -z0),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), legTop + 0.5));
    box = box.intersect(new THREE.Box3(new THREE.Vector3(x0, -1, z0), new THREE.Vector3(1e3, legTop + 0.5, 1e3)));
  }
  g.traverse(o => { if (o.isMesh) o.material.clippingPlanes = planes; });
  tScene.add(g);
  const view = focus === "leg" ? [1, 0.3, 1.6] : [0.75, 0.75, 1.5];
  const c = box.getCenter(new THREE.Vector3()), dir = new THREE.Vector3(...view).normalize();
  let dist = box.getSize(new THREE.Vector3()).length() * 2;
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
    corners.push(new THREE.Vector3(x, y, z));
  for (let i = 0; i < 3; i++) {
    tCam.position.copy(c).addScaledVector(dir, dist); tCam.lookAt(c); tCam.updateMatrixWorld();
    let e = 0; for (const v of corners) { const q = v.clone().project(tCam); e = Math.max(e, Math.abs(q.x), Math.abs(q.y)); }
    dist *= e / 0.88;
  }
  tCam.position.copy(c).addScaledVector(dir, dist); tCam.lookAt(c);
  thumbR.render(tScene, tCam);
  tScene.remove(g); disposeGroup(g);
  const url = thumbR.domElement.toDataURL("image/png");
  thumbCache.set(key, url);
  return url;
}

// =====================================================================
//  Designer
// =====================================================================
let cur = null;      // { type, params, editingId, name }
let explode = false;

function newDesign(type, params) {
  cur = { type, params: { ...TYPES[type].defaults, ...(params || {}) }, editingId: null, name: "" };
}
function editPiece(id) {
  const p = pieceById(id);
  cur = { type: p.type, params: { ...TYPES[p.type].defaults, ...p.params }, editingId: id, name: p.name };
  setMode("design"); buildDesignerUI(); updateDesign();
}

const fmt = (v, unit) => {
  if (unit !== "in") return (Math.round(v * 100) / 100) + (unit || "");
  const whole = Math.floor(v + 1e-6), frac = Math.round((v - whole) * 16);
  if (frac === 0) return `${whole} in`;
  if (frac === 16) return `${whole + 1} in`;
  let n = frac, den = 16; while (n % 2 === 0) { n /= 2; den /= 2; }
  return `${whole ? whole + " " : ""}${n}/${den} in`;
};

// furniture type tiles
for (const T of F.types) {
  const b = document.createElement("button");
  b.className = "opt"; b.dataset.type = T.id;
  b.innerHTML = `<img alt=""><b>${T.name}</b>`;
  b.onclick = () => { newDesign(T.id); buildDesignerUI(); updateDesign(); };
  $("types").append(b);
}

let sliderEls = {};
function buildDesignerUI() {
  const T = TYPES[cur.type], box = $("groups");
  box.innerHTML = ""; sliderEls = {};
  for (const G of T.groups) {
    const h = document.createElement("h2");
    h.innerHTML = `${G.title} <em></em>`; box.append(h);
    if (G.presets) {
      const wrap = document.createElement("div"); wrap.className = "opts"; box.append(wrap);
      for (const P of G.presets) {
        const b = document.createElement("button");
        b.className = "opt"; b.draggable = true; b.dataset.preset = P.id;
        b.innerHTML = `<img alt="" src="${thumb(cur.type, { ...T.defaults, ...P.p }, G.focus)}"><b>${P.name}</b>`;
        b.onclick = () => applyPreset(P);
        b.addEventListener("dragstart", e => {
          e.dataTransfer.setData("text/plain", "preset:" + G.title + ":" + P.id);
          b.classList.add("dragging");
        });
        b.addEventListener("dragend", () => { b.classList.remove("dragging"); mainEl.classList.remove("dragover"); });
        b._preset = P;
        wrap.append(b);
      }
      G._wrap = wrap; G._tag = h.querySelector("em");
    }
    if (G.materials !== undefined) {
      const add = (label, list, key) => {
        const l = document.createElement("div"); l.className = "swlabel"; l.textContent = label; box.append(l);
        const w = document.createElement("div"); w.className = "swatches"; box.append(w);
        for (const m of list) {
          const b = document.createElement("button"); b.className = "sw"; b.dataset.key = key; b.dataset.val = m.id;
          b.innerHTML = `<i style="background:#${m.color.toString(16).padStart(6, "0")}"></i>${m.name}`;
          b.onclick = () => { cur.params[key] = m.id; updateDesign(); };
          w.append(b);
        }
      };
      add("Wood", WOODS, "finish");
      if (G.materials.fabric) add("Fabric", FABRICS, "fabric");
      if (G.materials.accent) add("Accent (fronts)", ACCENTS, "accent");
    }
    if (G.sliders) {
      const sb = document.createElement("div"); sb.className = "sliders"; box.append(sb);
      for (const def of G.sliders) {
        const [key, label] = def;
        const wrap = document.createElement("div");
        if (Array.isArray(def[2])) {
          wrap.className = "seg";
          wrap.innerHTML = `<span>${label}</span>`;
          for (const [val, txt] of def[2]) {
            const b = document.createElement("button"); b.textContent = txt; b.dataset.val = String(val);
            b.onclick = () => { cur.params[key] = val; updateDesign(); };
            wrap.append(b);
          }
          sliderEls[key] = { wrap, choice: true, showIf: def[3] };
        } else {
          const [, , min, max, step, unit, showIf, dyn] = def;
          wrap.className = "sl";
          wrap.innerHTML = `<label>${label}</label><output></output><input type="range" min="${min}" max="${max}" step="${step}">`;
          const inp = wrap.querySelector("input");
          inp.addEventListener("input", () => { cur.params[key] = parseFloat(inp.value); updateDesign(key); });
          sliderEls[key] = { wrap, unit, showIf, dyn };
        }
        sb.append(wrap);
      }
    }
  }
  document.querySelectorAll("[data-type]").forEach(b => b.setAttribute("aria-pressed", b.dataset.type === cur.type));
  const ed = $("editing");
  ed.innerHTML = `Name<input id="pname" value="${(cur.name || TYPES[cur.type].name).replace(/"/g, "&quot;")}">`;
  $("pname").oninput = e => { cur.name = e.target.value; };
  $("explode").style.display = cur.type.endsWith("table") ? "" : "none";
  $("save").textContent = cur.editingId ? "Save changes" : "Save to my pieces";
  $("saveas").style.display = cur.editingId ? "" : "none";
}

function applyPreset(P) {
  const T = TYPES[cur.type];
  Object.assign(cur.params, P.p);
  T.clamp(cur.params);
  if (T.fit(cur.params).length && T.fix) T.fix(cur.params);
  updateDesign();
}

let designGroup = null, lastWarn = "";
function updateDesign(changedKey) {
  const T = TYPES[cur.type], s = cur.params;
  T.clamp(s);
  if (designGroup) { dHolder.remove(designGroup); disposeGroup(designGroup); }
  designGroup = buildPiece(cur.type, s, explode);
  for (const m of designGroup.children) m.position.y = m.userData.lift;
  dHolder.add(designGroup);

  for (const [key, el] of Object.entries(sliderEls)) {
    el.wrap.style.display = el.showIf && !el.showIf(s) ? "none" : "";
    if (el.choice) {
      el.wrap.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(s[key]) === b.dataset.val));
    } else {
      const inp = el.wrap.querySelector("input");
      if (el.dyn) { const d = el.dyn(s); if (d.max !== undefined) inp.max = d.max; }
      if (key !== changedKey) inp.value = s[key];
      el.wrap.querySelector("output").textContent = fmt(s[key], el.unit);
    }
  }
  document.querySelectorAll("#groups .sw").forEach(b => b.setAttribute("aria-pressed", s[b.dataset.key] === b.dataset.val));
  const names = [];
  for (const G of T.groups) if (G.presets) {
    const m = G.presets.find(P => Object.entries(P.p).every(([k, v]) =>
      typeof v === "number" ? Math.abs(s[k] - v) < 1e-3 : s[k] === v));
    G._wrap.querySelectorAll(".opt").forEach(b => b.setAttribute("aria-pressed", m?.id === b.dataset.preset));
    G._tag.textContent = m ? "" : "custom";
  }
  $("title").textContent = (cur.name || T.name) + (cur.editingId ? "" : " (not saved yet)");
  $("info").innerHTML = (designGroup.userData.info || []).join("<br>");
  const probs = T.fit(s), warn = $("warn");
  warn.style.display = probs.length ? "block" : "none";
  if (probs.join() !== lastWarn) {
    warn.innerHTML = probs.map(p => `<div>${p}</div>`).join("") + (T.fix ? `<button id="fixfit">Move the legs in to fit</button>` : "");
    const fb = $("fixfit"); if (fb) fb.onclick = () => { T.fix(cur.params); updateDesign(); };
    lastWarn = probs.join();
  }
  fitDesignCamera();
}
let lastSpan = 0;
function fitDesignCamera(force) {
  if (mode !== "design" || !designGroup) return;
  dHolder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(designGroup), size = b.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  if (!force && Math.abs(span - lastSpan) < 0.05 * lastSpan) return;
  lastSpan = span;
  const c = b.getCenter(new THREE.Vector3());
  controls.target.set(0, c.y * 0.8, 0);
  const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const r = size.length() / 2 * 1.05;
  const dist = r / Math.sin(Math.min(vfov, hfov) / 2);
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-6 || force === "reset") dir.set(1.25, 0.8, 1.55);
  camera.position.copy(controls.target).addScaledVector(dir.normalize(), dist);
}

function savePiece(asNew) {
  const name = (cur.name || TYPES[cur.type].name).trim();
  if (cur.editingId && !asNew) {
    const p = pieceById(cur.editingId);
    p.params = { ...cur.params }; p.name = name;
  } else {
    const p = { id: uid(), type: cur.type, name: asNew && cur.editingId ? name + " (copy)" : name, params: { ...cur.params } };
    db.pieces.push(p); cur.editingId = p.id; cur.name = p.name;
  }
  saveDb(); buildDesignerUI(); updateDesign(); renderPieces();
  if (mode === "room") syncRoomFurniture();
  return cur.editingId;
}
$("save").onclick = () => { savePiece(false); toast("Saved to My pieces."); };
$("saveas").onclick = () => { savePiece(true); toast("Saved as a new piece."); };
$("place").onclick = () => {
  const id = savePiece(false);
  setMode("room");
  if (!db.room.items.some(i => i.pieceId === id)) placePiece(id); else { syncRoomFurniture(); toast("Updated in the room."); }
};
$("explode").onclick = () => { explode = !explode; $("explode").textContent = explode ? "Assemble" : "Explode"; updateDesign(); };
$("reset").onclick = () => { cur.params = { ...TYPES[cur.type].defaults }; updateDesign(); fitDesignCamera("reset"); };

function download(name, blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
$("dl-design").onclick = () => download(`${slug(cur.name || TYPES[cur.type].name)}.json`,
  new Blob([JSON.stringify({ format: "mid-century-furniture/1", type: cur.type, name: cur.name || TYPES[cur.type].name,
    units: "inches, degrees", params: cur.params }, null, 2)], { type: "application/json" }));
$("dl-stl").onclick = () => {
  // Millimetres, Z up, front toward -Y (same frame as the Fusion exports)
  const g = new THREE.Group(); g.rotation.x = Math.PI / 2; g.scale.setScalar(25.4);
  for (const m of designGroup.children) g.add(new THREE.Mesh(m.geometry));
  g.updateMatrixWorld(true);
  download(`${slug(cur.name || TYPES[cur.type].name)}.stl`, new Blob([new STLExporter().parse(g, { binary: true })]));
};
let fileMode = null;
$("ld-design").onclick = () => { fileMode = "design"; $("file").click(); };
$("open-room").onclick = () => { fileMode = "room"; $("file").click(); };
$("file").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  let j; try { j = JSON.parse(await f.text()); } catch (err) { return toast("That file couldn't be read."); }
  if (fileMode === "design") {
    const type = j.type || (j.params && "table_l" in j.params ? "coffee_table" : null);
    if (!TYPES[type]) return toast("That isn't a saved furniture design.");
    newDesign(type, j.params); cur.name = j.name || TYPES[type].name; buildDesignerUI(); updateDesign();
  } else {
    if (!Array.isArray(j.pieces) || !j.room) return toast("That isn't a saved room.");
    db = { pieces: j.pieces, room: { ...ROOM_DEFAULTS, ...j.room } }; saveDb();
    selected = null; buildShell(); renderPieces(); syncRoomFurniture(); buildRoomUI(); frameRoom();
  }
};

// =====================================================================
//  Room UI
// =====================================================================
function renderPieces() {
  const box = $("pieces"); box.innerHTML = "";
  for (const p of db.pieces) {
    const n = db.room.items.filter(i => i.pieceId === p.id).length;
    const el = document.createElement("div"); el.className = "piece";
    el.innerHTML = `<img alt="" draggable="true" src="${thumb(p.type, p.params)}"><div><b></b>
      <small>${TYPES[p.type].name}${n ? ` · ${n} in the room` : ""}</small>
      <div class="acts"><button class="primary">Place</button><button>Edit</button><button>Delete</button></div></div>`;
    el.querySelector("b").textContent = p.name;
    const [bPlace, bEdit, bDel] = el.querySelectorAll("button");
    bPlace.onclick = () => { setMode("room"); placePiece(p.id); renderPieces(); };
    bEdit.onclick = () => editPiece(p.id);
    bDel.onclick = () => {
      if (!confirm(`Delete "${p.name}" from My pieces${n ? " and the room" : ""}?`)) return;
      db.pieces = db.pieces.filter(q => q.id !== p.id); saveDb(); renderPieces(); syncRoomFurniture();
    };
    const img = el.querySelector("img");
    img.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", "piece:" + p.id));
    box.append(el);
  }
}
$("new-piece").onclick = () => { newDesign("coffee_table"); setMode("design"); buildDesignerUI(); updateDesign(); };

function buildRoomUI() {
  const rs = $("room-sliders"); rs.innerHTML = "";
  const slider = (box, key, label, min, max, step, unit, after) => {
    const w = document.createElement("div"); w.className = "sl";
    w.innerHTML = `<label>${label}</label><output>${db.room[key]} ${unit}</output><input type="range" min="${min}" max="${max}" step="${step}" value="${db.room[key]}">`;
    const inp = w.querySelector("input");
    inp.oninput = () => { db.room[key] = parseFloat(inp.value); w.querySelector("output").textContent = `${db.room[key]} ${unit}`;
      buildShell(); after && after(); };
    inp.onchange = saveDb;
    box.append(w);
  };
  slider(rs, "width_ft", "Room width", 10, 26, 0.5, "ft", () => { for (const g of furnitureRoot.children) { clampItem(g.userData.item, g); placeGroup(g); } updateSelection(); });
  slider(rs, "depth_ft", "Room depth", 9, 22, 0.5, "ft", () => { for (const g of furnitureRoot.children) { clampItem(g.userData.item, g); placeGroup(g); } updateSelection(); });
  const rugS = $("rug-sliders"); rugS.innerHTML = "";
  if (db.room.rug !== "none") {
    slider(rugS, "rug_w", "Rug width", 48, 144, 6, "in");
    slider(rugS, "rug_d", "Rug depth", 36, 120, 6, "in");
  }
  const sw = (id, list, key) => {
    const box = $(id); box.innerHTML = "";
    for (const m of list) {
      const b = document.createElement("button"); b.className = "sw";
      b.setAttribute("aria-pressed", db.room[key] === m.id);
      b.innerHTML = `<i style="background:#${m.color.toString(16).padStart(6, "0")}"></i>${m.name}`;
      b.onclick = () => { db.room[key] = m.id; saveDb(); buildShell(); buildRoomUI(); };
      box.append(b);
    }
  };
  sw("sw-wall", WALLS, "wall"); sw("sw-floor", FLOORS, "floor"); sw("sw-rug", RUGS, "rug");
  const tg = $("room-toggles"); tg.innerHTML = "";
  const seg = (key, label, opts) => {
    const w = document.createElement("div"); w.className = "seg"; w.innerHTML = `<span>${label}</span>`;
    for (const [v, t] of opts) {
      const b = document.createElement("button"); b.textContent = t;
      b.setAttribute("aria-pressed", db.room[key] === v);
      b.onclick = () => { db.room[key] = v; saveDb(); buildShell(); buildRoomUI(); };
      w.append(b);
    }
    tg.append(w);
  };
  seg("light", "Light", [["day", "Daytime"], ["evening", "Evening"]]);
  seg("window", "Window", [[1, "Yes"], [0, "No"]]);
  seg("right_wall", "Right wall", [[0, "Open"], [1, "Wall"]]);
}
$("arrange").onclick = () => {
  const inRoom = db.pieces.filter(p => db.room.items.some(i => i.pieceId === p.id));
  db.room.items = autoLayout(inRoom.length ? inRoom : db.pieces, db.room);
  selected = null; saveDb(); syncRoomFurniture(); renderPieces();
};
$("clear").onclick = () => { db.room.items = []; selected = null; saveDb(); syncRoomFurniture(); renderPieces(); };
$("save-room").onclick = () => download("my-living-room.json",
  new Blob([JSON.stringify({ format: "mid-century-living-room/1", pieces: db.pieces, room: db.room }, null, 2)], { type: "application/json" }));
$("shot").onclick = () => {
  selRing.visible = false; renderer.render(rScene, camera);
  renderer.domElement.toBlob(b => download("living-room.png", b)); updateSelection();
};

function frameRoom() {
  const { W, D } = roomDims();
  controls.target.set(0, 24 * IN, D * 0.02 * IN);
  // stand back far enough to see the whole room at this window shape
  const vfov = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const dist = Math.max((W * 0.62) / Math.tan(hfov / 2), (D * 0.55) / Math.tan(vfov / 2)) * IN;
  const dir = new THREE.Vector3(0.38, 0.5, 1).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.maxDistance = Math.max(W, D) * IN * 2.2; controls.minDistance = 0.4;
}

// =====================================================================
//  Modes, drag and drop, misc
// =====================================================================
const saved = { design: null, room: null };
function setMode(m) {
  if (m === mode) { if (m === "room") { renderPieces(); updateSelection(); } return; }
  saved[mode] = { pos: camera.position.clone(), target: controls.target.clone() };
  mode = m;
  $("tab-design").setAttribute("aria-selected", m === "design");
  $("tab-room").setAttribute("aria-selected", m === "room");
  $("pane-design").hidden = m !== "design"; $("pane-room").hidden = m !== "room";
  if (saved[m]) { camera.position.copy(saved[m].pos); controls.target.copy(saved[m].target); }
  else if (m === "room") frameRoom();
  if (m === "room") {
    $("title").textContent = "Living room";
    $("hint").textContent = "Click a piece to select it, drag it to move it, Q / E to turn it · drag empty space to orbit";
    $("drop").textContent = "Drop to place in the room";
    renderPieces(); syncRoomFurniture();
  } else {
    $("hint").textContent = "Drag to orbit · scroll to zoom · right-drag to pan";
    $("drop").textContent = "Drop to fit this part";
    controls.maxDistance = 8; updateDesign(); fitDesignCamera(true);
  }
  updateSelection();
}
$("tab-design").onclick = () => setMode("design");
$("tab-room").onclick = () => setMode("room");

const mainEl = document.querySelector("main");
let dragDepth = 0;
mainEl.addEventListener("dragenter", e => { e.preventDefault(); dragDepth++; mainEl.classList.add("dragover"); });
mainEl.addEventListener("dragover", e => { e.preventDefault(); });
mainEl.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; mainEl.classList.remove("dragover"); } });
mainEl.addEventListener("drop", e => {
  e.preventDefault(); dragDepth = 0; mainEl.classList.remove("dragover");
  const data = e.dataTransfer.getData("text/plain");
  if (data.startsWith("piece:")) {
    if (mode !== "room") setMode("room");
    const f = pointerToFloor(e);
    placePiece(data.slice(6), f); renderPieces();
  } else if (data.startsWith("preset:") && mode === "design") {
    const [, title, id] = data.split(":");
    const G = TYPES[cur.type].groups.find(g => g.title === title);
    const P = G?.presets?.find(p => p.id === id); if (P) applyPreset(P);
  }
});

let toastT;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200);
}

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fitDesignCamera(true);
}
new ResizeObserver(resize).observe(host);

function tick() {
  controls.update();
  renderer.render(mode === "design" ? dScene : rScene, camera);
  requestAnimationFrame(tick);
}

try {
  loadDb(); saveDb();
  for (const T of F.types) document.querySelector(`[data-type="${T.id}"] img`).src = thumb(T.id, T.defaults);
  const first = db.pieces[0];
  if (first) cur = { type: first.type, params: { ...TYPES[first.type].defaults, ...first.params }, editingId: first.id, name: first.name };
  else newDesign("coffee_table");
  camera.position.set(1.25, 0.95, 1.55);
  buildShell(); buildRoomUI(); buildDesignerUI();
  resize(); updateDesign(); fitDesignCamera("reset");
  if (location.hash.includes("room")) setMode("room");
  tick();
  window.__ready = true;
  window.__app = { db: () => db, cur: () => cur, setMode, editPiece, placePiece, TYPES, camera, controls,
    sel: id => { selected = id; updateSelection(); }, turn: turnSelected, items: () => furnitureRoot.children };
} catch (e) {
  const el = $("err"); el.style.display = "grid"; el.textContent = "Something went wrong: " + e.message; console.error(e);
}
