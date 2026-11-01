// Режиссёр камеры: 6 ракурсов (старт + 5 остановок) и 5 криволинейных переходов между ними.
// Камера движется по сплайну в цилиндрических координатах вокруг оси Y (дуги и облёты),
// точка взгляда — по своему сплайну. Переход всегда доигрывается до конца по таймеру, а не по скроллу.
import * as THREE from 'three';

const DEG = Math.PI / 180;
// «север» = −Z, угол растёт по часовой стрелке при взгляде сверху (как у модулей в build-model.js)
const cyl = (deg, r, y) => new THREE.Vector3(deg, r, y);
const cylToWorld = (c, out) => out.set(Math.sin(c.x * DEG) * c.y, c.z, -Math.cos(c.x * DEG) * c.y);

const CORE_CLEARANCE = 2.1; // кольца-гироскопы — радиус ≤ 1.64
const MODULE_CLEARANCE = 0.72;

export function createDirector(camera, model, { onStart, onArrive, setFrameShift }) {
  const M = (k) => model.modules[k].focus.clone();
  const O = new THREE.Vector3(0, 0.02, 0);

  // fit — радиус композиции, который должен поместиться по меньшей стороне кадра
  const stops = [
    { cam: cyl(161, 4.7, 2.9), target: new THREE.Vector3(0, -0.12, 0), sx: 0.2, sy: 0.0, msy: 0.19, mk: 1.0 },
    // фронтально: логотип на стеле и все пять служб в кадре
    { cam: cyl(180, 6.4, 1.35), target: new THREE.Vector3(0, 0.05, 0), sx: 0.1, sy: 0.0, msy: 0.1, fit: 3.05 },
    { cam: cyl(59, 4.6, 1.5), target: M('HR'), sx: 0.15, sy: 0.02, msy: 0.12, module: 'HR' },
    { cam: cyl(114, 4.6, 1.4), target: M('Legal'), sx: 0.15, sy: 0.02, msy: 0.12, module: 'Legal' },
    { cam: cyl(300, 4.6, 1.45), target: M('Office'), sx: 0.15, sy: 0.02, msy: 0.12, module: 'Office' },
    { cam: cyl(380, 8.4, 3.9), target: new THREE.Vector3(0, -0.1, 0), sx: 0.1, sy: 0.0, msy: 0.1, fit: 2.9 },
  ];
  // переход i ведёт из stops[i-1] в stops[i]; mids — промежуточные опорные точки (t в долях перехода)
  const paths = [null,
    { dur: 2.6, mids: [{ t: 0.45, cam: cyl(166, 6.0, 2.6), target: O.clone() }] },
    { dur: 2.6, mids: [{ t: 0.5, cam: cyl(112, 4.4, 5.0), target: O.clone().lerp(M('HR'), 0.62) }] },
    { dur: 2.4, mids: [{ t: 0.5, cam: cyl(91, 5.5, 1.7), target: new THREE.Vector3(1.75, 0.25, 0.05) }] },
    { dur: 3.0, mids: [{ t: 0.5, cam: cyl(215, 4.8, 1.3), target: M('IT') }] },
    { dur: 3.0, mids: [{ t: 0.4, cam: cyl(345, 4.6, 1.5), target: M('Access') }, { t: 0.62, cam: cyl(352, 5.9, 2.1), target: M('Access').lerp(O, 0.45) }] },
  ];
  for (let i = 1; i < paths.length; i++) {
    const p = paths[i], a = stops[i - 1], b = stops[i];
    p.keys = [{ t: 0, cam: a.cam, target: a.target }, ...p.mids, { t: 1, cam: b.cam, target: b.target }];
  }

  let aspect = 1, isMobileFrame = false;
  const kOf = (s) => {
    const half = Math.tan((camera.fov * DEG) / 2);
    let k = aspect < 1 ? Math.pow(1 / aspect, s.module ? 0.62 : 0.8) : 1;
    if (s.mk) k *= s.mk;
    if (s.fit) {
      const dist = cylToWorld(s.cam, _v).distanceTo(s.target);
      k = THREE.MathUtils.clamp(s.fit / (half * Math.min(aspect, 1)) / dist, 0.7, 4);
    }
    return k;
  };
  const shiftOf = (s) => (isMobileFrame ? [0, s.msy] : [s.sx, s.sy]);

  let stage = 0;
  let active = null; // { path, from, to, elapsed, dur }
  let queue = null;
  let reduced = false;
  const pointer = new THREE.Vector2(), pointerSmooth = new THREE.Vector2();

  const pos = new THREE.Vector3(), tgt = new THREE.Vector3();

  function evalPath(pi, p) {
    const keys = paths[pi].keys;
    hermite(keys, p, 'cam', _c);
    hermite(keys, Math.min(1, p + 0.05 * Math.sin(Math.PI * p)), 'target', tgt); // взгляд чуть опережает камеру
    cylToWorld(_c, pos);
    const a = stops[pi - 1], b = stops[pi];
    const w = smooth(p);
    const k = THREE.MathUtils.lerp(kOf(a), kOf(b), w);
    const [ax, ay] = shiftOf(a), [bx, by] = shiftOf(b);
    applyCamera(k, THREE.MathUtils.lerp(ax, bx, w), THREE.MathUtils.lerp(ay, by, w));
  }
  function evalStop(i) {
    const s = stops[i];
    cylToWorld(s.cam, pos); tgt.copy(s.target);
    const [x, y] = shiftOf(s);
    applyCamera(kOf(s), x, y);
  }
  function applyCamera(k, sx, sy) {
    pos.sub(tgt).multiplyScalar(k).add(tgt);
    // лёгкий параллакс от курсора (только в покое)
    pointerSmooth.lerp(reduced || active ? _zero : pointer, 0.04);
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    pos.addScaledVector(_right, pointerSmooth.x * 0.06).add(_v.set(0, pointerSmooth.y * 0.04, 0));
    keepClear(pos);
    camera.position.copy(pos);
    camera.up.set(0, 1, 0); // горизонт всегда ровный
    camera.lookAt(tgt);
    setFrameShift(sx, sy);
  }
  function keepClear(p) {
    const d = p.length();
    if (d < CORE_CLEARANCE) p.multiplyScalar(CORE_CLEARANCE / Math.max(d, 1e-3));
    for (const k in model.modules) {
      _v.subVectors(p, model.modules[k].center);
      const dm = _v.length();
      if (dm < MODULE_CLEARANCE) p.copy(model.modules[k].center).addScaledVector(_v.normalize(), MODULE_CLEARANCE);
    }
  }

  function start(to, speed = 1) {
    const from = stage;
    const path = Math.max(from, to);
    const dur = reduced ? 0.62 : paths[path].dur * speed;
    active = { path, from, to, elapsed: 0, dur, dir: to > from ? 1 : -1, swapped: false };
    onStart?.({ from, to, duration: dur, reduced });
  }

  function step(dir) {
    if (active) return false;
    const to = stage + dir;
    if (to < 0 || to >= stops.length) return false;
    start(to);
    return true;
  }
  function goTo(n) {
    if (active || n === stage || n < 0 || n >= stops.length) return false;
    queue = n;
    start(stage + Math.sign(n - stage), Math.abs(n - stage) > 1 ? 0.62 : 1);
    return true;
  }

  function update(dt) {
    if (!active) { evalStop(stage); return; }
    active.elapsed += dt;
    const t = Math.min(1, active.elapsed / active.dur);
    if (reduced) {
      // кроссфейд: затемнение → смена ракурса → проявление
      if (!active.swapped && t >= 0.45) { active.swapped = true; stage = active.to; }
      evalStop(active.swapped ? active.to : active.from);
    } else {
      const p = active.dir > 0 ? t : 1 - t;
      evalPath(active.path, p);
    }
    if (t >= 1) {
      stage = active.to;
      active = null;
      evalStop(stage);
      const chained = queue !== null && queue !== stage;
      onArrive?.(stage, chained);
      if (chained) start(stage + Math.sign(queue - stage), Math.abs(queue - stage) > 1 ? 0.62 : 1);
      else queue = null;
    }
  }

  return {
    step, goTo, update,
    get stage() { return stage; },
    get busy() { return !!active; },
    get progress() { return active ? Math.min(1, active.elapsed / active.dur) : 1; },
    get target() { return active ? active.to : stage; },
    stops,
    setReduced(v) { reduced = v; },
    // тот же медиазапрос, что переключает раскладку текста в styles.css
    setAspect(a) { aspect = a; isMobileFrame = window.matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)').matches; },
    setPointer(x, y) { pointer.set(x, y); },
  };
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _right = new THREE.Vector3();
const _m0 = new THREE.Vector3(), _m1 = new THREE.Vector3();
const _zero = new THREE.Vector2();

const smooth = (t) => t * t * (3 - 2 * t);

// кусочный кубический Эрмит по неравномерным ключам; на концах нулевая скорость → плавный разгон и торможение
function hermite(keys, t, field, out) {
  t = Math.min(1, Math.max(0, t));
  t = THREE.MathUtils.lerp(t, smooth(t), 0.35);
  let j = 0;
  while (j < keys.length - 2 && t > keys[j + 1].t) j++;
  const k0 = keys[j], k1 = keys[j + 1];
  const h = k1.t - k0.t, s = (t - k0.t) / h;
  tangent(keys, j, field, _m0); tangent(keys, j + 1, field, _m1);
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return out.copy(k0[field]).multiplyScalar(h00)
    .addScaledVector(_m0, h10 * h)
    .addScaledVector(k1[field], h01)
    .addScaledVector(_m1, h11 * h);
}
function tangent(keys, i, field, out) {
  if (i === 0 || i === keys.length - 1) return out.set(0, 0, 0);
  const a = keys[i - 1], b = keys[i], c = keys[i + 1];
  _v.subVectors(b[field], a[field]).divideScalar(b.t - a.t);
  return out.subVectors(c[field], b[field]).divideScalar(c.t - b.t).add(_v).multiplyScalar(0.5);
}
