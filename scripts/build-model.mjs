// Генерирует src/assets/volkov-navigator.glb — 3D-модель «Навигатор компании» с логотипом «волков групп».
// Запуск: npm run model
//
// Композиция (ось Y вверх, лицевая сторона логотипа смотрит в +Z):
//   Navigator_Core     — парящая стела из тёмного стекла с объёмным логотипом на обеих сторонах,
//                        светящаяся кромка (Core_LogoGlow) и пьедестал со световым кольцом (Core_GlowRing)
//   Gimbal_Outer/Inner — два наклонных орбитальных кольца с «бусинами»
//   Route_Links        — световые линии от ядра к службам (r 1.28 → 2.17, их читает шейдер импульса)
//   Module_<Service>   — пять «реплик чата» с иконками служб на радиусе 2.5
// Имена узлов — контракт со src/hero/scene.js и src/hero/director.js.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DOMParser} from '@xmldom/xmldom';
import * as THREE from 'three';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeGeometries, mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '../src/assets/volkov-navigator.glb');

// ---------- окружение Node для загрузчика SVG и экспортёра ----------
// xmldom не реализует querySelectorAll — SVGLoader ищет им только градиенты, которых у нас нет
globalThis.DOMParser = class extends DOMParser {
  parseFromString(text, type) {
    const doc = super.parseFromString(text, type);
    doc.querySelectorAll = () => [];
    return doc;
  }
};
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

// ---------- материалы (имена читает scene.js) ----------
const std = (name, color, metalness, roughness, extra = {}) =>
  Object.assign(new THREE.MeshStandardMaterial({name, color, metalness, roughness, ...extra}));
const MAT = {
  Graphite: std('Graphite', 0x15171b, 0.7, 0.42),
  DialFace: std('DialFace', 0x08090b, 0.35, 0.12), // тёмное стекло стелы
  BrushedSteel: std('BrushedSteel', 0xc9ccd2, 1, 0.3),
  VolkovRed: std('VolkovRed', 0xe60000, 0.25, 0.28), // лак фирменного красного логотипа
  Cream: std('Cream', 0xf6ede8, 0.05, 0.45), // «групп» и иконки — кремовый с сайта
  GlowRed: std('GlowRed', 0xff4d3d, 0, 0.5, {emissive: 0xff2a1a, emissiveIntensity: 1}),
  GlowDim: std('GlowDim', 0x80281e, 0, 0.6, {emissive: 0x6b0f0a, emissiveIntensity: 1}),
};

const mesh = (name, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geometry, MAT[material]);
  m.name = name;
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
};
const group = (name, children = [], pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pos);
  g.rotation.set(...rot);
  for (const c of children) g.add(c);
  return g;
};
// склеиваем и заново индексируем совпадающие вершины — GLB выходит в разы меньше
const merge = (geoms) => {
  const g = mergeGeometries(geoms.map((x) => (x.index ? x.toNonIndexed() : x)));
  g.deleteAttribute('uv');
  return mergeVertices(g, 1e-5);
};

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// трубка вдоль ломаной (контур, обводка иконки)
function tubeAlong(points2d, radius, closed, z = 0) {
  const pts = points2d.map((p) => new THREE.Vector3(p.x, p.y, z));
  const curve = new THREE.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) if (pts[i].distanceTo(pts[i + 1]) > 1e-6) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  if (closed && pts[0].distanceTo(pts.at(-1)) > 1e-6) curve.add(new THREE.LineCurve3(pts.at(-1), pts[0]));
  return new THREE.TubeGeometry(curve, Math.max(8, curve.curves.length * 2), radius, 6, false);
}

// ---------- логотип «волков групп» из SVG ----------
// cls-2 — красное «волков», cls-1 — «групп». Блок <style> убираем: xmldom не умеет CSSOM.
function buildLogo(width, depth) {
  const raw = fs.readFileSync(path.join(here, 'assets/volkov-logo.svg'), 'utf8').replace(/<defs>[\s\S]*?<\/defs>/, '');
  const vb = raw.match(/viewBox="([\d.\s-]+)"/)[1].split(/\s+/).map(Number);
  const svg = raw.replace(/(<svg[^>]*>)/, '$1<g transform="scale(1,-1)">').replace('</svg>', '</g></svg>');
  const {paths} = new SVGLoader().parse(svg);
  const s = width / vb[2];
  const parts = {red: [], cream: []};
  for (const p of paths) {
    const cls = p.userData.node.getAttribute('class') ?? p.userData.node.parentNode?.getAttribute?.('class');
    for (const shape of p.toShapes()) {
      const g = new THREE.ExtrudeGeometry(shape, {depth: depth / s, bevelEnabled: true, bevelThickness: 6, bevelSize: 3, bevelSegments: 2, curveSegments: 5});
      (cls === 'cls-2' ? parts.red : parts.cream).push(g);
    }
  }
  const out = {};
  for (const k of ['red', 'cream']) {
    const g = merge(parts[k]);
    g.scale(s, s, s);
    // центр логотипа в начале координат (viewBox по Y перевёрнут)
    g.translate(-(vb[0] + vb[2] / 2) * s, (vb[1] + vb[3] / 2) * s, 0);
    out[k] = g;
  }
  return {...out, height: vb[3] * s};
}

const SLAB_W = 2.55, SLAB_H = 1.22, SLAB_D = 0.1, SLAB_Y = 0.2;
const logo = buildLogo(2.08, 0.045);
const slabShape = roundedRect(SLAB_W, SLAB_H, 0.2);
const slab = new THREE.ExtrudeGeometry(slabShape, {depth: SLAB_D, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 16});
slab.translate(0, 0, -SLAB_D / 2);
const edge = merge([-1, 1].map((side) => tubeAlong(slabShape.getPoints(12), 0.012, true, side * (SLAB_D / 2 + 0.022))));
const face = SLAB_D / 2 + 0.02;

const core = group('Navigator_Core', [
  group('Core_Stele', [
    mesh('Core_Slab', slab, 'DialFace'),
    mesh('Core_LogoGlow', edge, 'GlowRed'),
    // логотип на обеих сторонах: сзади — копия, развёрнутая на 180°, чтобы читалась и с тыла
    mesh('Core_Logo_Front_Volkov', logo.red, 'VolkovRed', [0, 0, face]),
    mesh('Core_Logo_Front_Gruppe', logo.cream, 'Cream', [0, 0, face]),
    mesh('Core_Logo_Back_Volkov', logo.red, 'VolkovRed', [0, 0, -face], [0, Math.PI, 0]),
    mesh('Core_Logo_Back_Gruppe', logo.cream, 'Cream', [0, 0, -face], [0, Math.PI, 0]),
  ], [0, SLAB_Y, 0]),
  // пьедестал: ступенчатый диск и световое кольцо
  mesh('Core_Base', new THREE.LatheGeometry([[0, 0], [0.95, 0], [1.02, 0.03], [1.0, 0.07], [0.82, 0.1], [0.78, 0.13], [0, 0.13]].map(([x, y]) => new THREE.Vector2(x, y)), 96), 'Graphite', [0, -0.78, 0]),
  mesh('Core_GlowRing', new THREE.TorusGeometry(0.9, 0.012, 8, 160), 'GlowRed', [0, -0.645, 0], [Math.PI / 2, 0, 0]),
  mesh('Core_Stand', new THREE.CylinderGeometry(0.035, 0.05, 0.48, 24), 'BrushedSteel', [0, -0.42, 0]),
]);

// ---------- орбиты ----------
function gimbal(name, r, tilt, beads) {
  const ring = new THREE.TorusGeometry(r, 0.01, 8, 220);
  const beadGeo = merge(Array.from({length: beads}, (_, i) => {
    const a = (i / beads) * Math.PI * 2;
    return new THREE.SphereGeometry(0.028, 16, 10).translate(Math.cos(a) * r, Math.sin(a) * r, 0);
  }));
  return group(name, [mesh(`${name}_Ring`, ring, 'BrushedSteel'), mesh(`${name}_Beads`, beadGeo, 'GlowRed')], [0, SLAB_Y, 0], tilt);
}
const gOuter = gimbal('Gimbal_Outer', 1.64, [Math.PI / 2 - 0.32, 0, 0.18], 3);
const gInner = gimbal('Gimbal_Inner', 1.5, [Math.PI / 2 + 0.26, 0, -0.42], 2);

// ---------- службы: «реплики чата» с иконками ----------
const ICONS = {HR: 'users', Legal: 'scale', IT: 'wrench', Office: 'door-open', Access: 'lock-keyhole'};
const toSvg = (node) =>
  node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
async function iconGeometry(name, size) {
  const {__iconData} = await import(`lucide-react/dist/esm/icons/${name}.mjs`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g transform="translate(0,24) scale(1,-1)">${toSvg(__iconData.node)}</g></svg>`;
  const {paths} = new SVGLoader().parse(svg);
  const s = size / 24, geoms = [];
  for (const p of paths) for (const sp of p.subPaths) {
    const pts = sp.getPoints(10).map((v) => new THREE.Vector2((v.x - 12) * s, (v.y - 12) * s));
    if (pts.length > 1) geoms.push(tubeAlong(pts, 0.017, sp.autoClose));
    else geoms.push(new THREE.SphereGeometry(0.02, 8, 6).translate(pts[0].x, pts[0].y, 0)); // точка (h.01)
  }
  return merge(geoms);
}
function bubbleShape() { // скруглённый прямоугольник с «хвостиком» снизу слева
  const w = 0.66, h = 0.5, r = 0.14, x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + 0.16, y);
  s.lineTo(x + 0.06, y - 0.13);
  s.lineTo(x + 0.3, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const bubble = new THREE.ExtrudeGeometry(bubbleShape(), {depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4, curveSegments: 12});
bubble.translate(0, 0, -0.04);

const MODULES = [ // имя, угол (0 = −Z, по часовой при взгляде сверху), высота
  ['HR', 54, 0.12], ['Legal', 118, -0.04], ['IT', 242, 0.18], ['Office', 298, 0.02], ['Access', 350, 0.1]]; // фронт стелы (140–220°) свободен
const RADIUS = 2.5, BUBBLE_Y = 0.3;
const modules = [], links = [];
for (const [name, deg, y] of MODULES) {
  const a = (deg * Math.PI) / 180, dir = [Math.sin(a), -Math.cos(a)];
  const yaw = Math.atan2(dir[0], dir[1]); // локальный +Z смотрит наружу
  const icon = await iconGeometry(ICONS[name], 0.3);
  modules.push(group(`Module_${name}`, [
    mesh(`Module_${name}_Pedestal`, new THREE.CylinderGeometry(0.2, 0.24, 0.035, 48), 'Graphite'),
    mesh(`Module_${name}_Rim`, new THREE.TorusGeometry(0.235, 0.007, 6, 72), 'GlowDim', [0, 0.02, 0], [Math.PI / 2, 0, 0]),
    mesh(`Module_${name}_Bubble`, bubble, 'Graphite', [0, BUBBLE_Y, 0]),
    mesh(`Module_${name}_Icon`, icon, 'Cream', [0, BUBBLE_Y, 0.075]),
    mesh(`Module_${name}_Icon_Back`, icon, 'Cream', [0, BUBBLE_Y, -0.075], [0, Math.PI, 0]),
    mesh(`Module_${name}_Icon_Accent`, new THREE.SphereGeometry(0.03, 16, 10), 'GlowRed', [0.25, BUBBLE_Y + 0.17, 0.07]),
  ], [dir[0] * RADIUS, y, dir[1] * RADIUS], [0, yaw, 0]));
  // линия маршрута: r 1.28 → 2.17 (эти радиусы зашиты в шейдер импульса scene.js)
  const r0 = 1.28, r1 = 2.17, len = r1 - r0;
  const link = new THREE.CylinderGeometry(0.005, 0.005, len, 8);
  link.rotateX(Math.PI / 2);
  link.translate(0, 0, r0 + len / 2);
  link.rotateY(yaw);
  link.translate(0, y * 0.5 + 0.02, 0);
  links.push(link);
}

const root = group('VolkovNavigator', [
  core, gOuter, gInner,
  mesh('Route_Links', merge(links), 'GlowDim'),
  group('Department_Modules', modules),
]);
const scene = new THREE.Scene();
scene.add(root);

const glb = await new GLTFExporter().parseAsync(scene, {binary: true});
fs.writeFileSync(OUT, Buffer.from(glb));
let tris = 0, meshes = 0;
root.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
});
console.log(`volkov-navigator.glb: ${(glb.byteLength / 1024).toFixed(1)} KB, ${meshes} meshes, ${Math.round(tris)} triangles`);
