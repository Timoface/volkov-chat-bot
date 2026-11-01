// Сцена: рендерер, окружение (фон, дымка, частицы, свет), загрузка GLB и «фоновая жизнь» модели.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const MODULE_KEYS = ['HR', 'Legal', 'IT', 'Office', 'Access'];
import MODEL_URL from '../assets/volkov-navigator.glb?url';
const MODEL_BYTES = 1388236; // запасной размер, если сервер не отдаёт Content-Length

// Импульсы по линиям маршрута: одна и та же формула в шейдере и в JS (для звука и вспышек модулей)
const PULSE_SPEED = 0.16; // оборотов в секунду → импульс раз в 6,25 с на линию
const PULSE_WRAP = 625; // uTime берётся по модулю, чтобы не терять точность float
const PULSE_HEAD_AT_MODULE = 1.25 / 1.5; // значение fract, при котором «голова» импульса достигает модуля
const fract = (x) => x - Math.floor(x);
const linkPhase = (x, z) => fract((Math.atan2(z, x) / (Math.PI * 2)) * 3 + 0.37);

export function createScene(canvas, { reducedMotion, isMobile }) {
  const state = { reducedMotion, isMobile, focusModule: null, onPulse: null };

  // ---------- рендерер ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.setClearColor(0x0a0b0d, 1);
  let maxDpr = isMobile ? 1.5 : 1.75;
  const dpr = () => Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0b0d);
  scene.fog = new THREE.FogExp2(0x0b0c0f, 0.034);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 140);
  camera.position.set(1.3, 1.45, 2.25);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.22;
  pmrem.dispose();

  // ---------- постобработка ----------
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isMobile ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.6, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- фон ----------
  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(80, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float band = smoothstep(-0.55, 0.05, d.y) * (1.0 - smoothstep(0.05, 0.85, d.y));
          vec3 col = mix(vec3(0.010, 0.011, 0.013), vec3(0.030, 0.032, 0.038), band);
          float warm = pow(max(dot(d, normalize(vec3(0.65, -0.05, 0.55))), 0.0), 5.0);
          float cool = pow(max(dot(d, normalize(vec3(-0.55, 0.25, -0.7))), 0.0), 4.0);
          col += vec3(0.070, 0.014, 0.012) * warm + vec3(0.010, 0.017, 0.032) * cool;
          col += (hash(gl_FragCoord.xy) - 0.5) * 0.004;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  // ---------- свет ----------
  const key = new THREE.DirectionalLight(0xfff0e6, 1.6);
  key.position.set(4.5, 6, 5);
  const rim = new THREE.DirectionalLight(0x8eb0ff, 1.5);
  rim.position.set(-5, 2.5, -6.5);
  const hemi = new THREE.HemisphereLight(0x39404c, 0x150605, 0.35);
  const under = new THREE.PointLight(0xff3b30, 2.2, 5, 2);
  under.position.set(0, -0.45, 0);
  scene.add(key, rim, hemi, under);

  // ---------- дымка (billboard-инстансы, бесшовный орбитальный дрейф) ----------
  const hazeUniforms = { uTime: { value: 0 }, uMap: { value: makeHazeTexture() } };
  const haze = makeHaze(hazeUniforms, isMobile);
  scene.add(haze);

  // ---------- частицы-«данные» ----------
  const particleUniforms = { uTime: { value: 0 }, uPixelRatio: { value: dpr() }, uScale: { value: 400 } };
  const particles = makeParticles(particleUniforms, isMobile ? 260 : 520);
  scene.add(particles);

  // ---------- модель ----------
  const pulseTime = { value: 0 };
  const model = { root: null, core: null, gimbals: [], eyes: null, north: null, rims: {}, modules: {}, links: [], flashes: {} };

  function load(onProgress) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(MODEL_URL, (gltf) => { setupModel(gltf.scene); resolve(model); },
        (e) => onProgress?.(Math.min(1, e.loaded / (e.total || MODEL_BYTES))), reject);
    });
  }

  function setupModel(root) {
    model.root = root;
    scene.add(root);
    const get = (n) => root.getObjectByName(n);
    const clone = (mesh, intensity) => { mesh.material = mesh.material.clone(); mesh.material.emissiveIntensity = intensity; return mesh.material; };

    // эмиссивные материалы GLB чуть усиливаем, чтобы их поймал bloom
    root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m.name === 'GlowRed') m.emissiveIntensity = 2.3;
      if (m.name === 'GlowDim') m.emissiveIntensity = 1.5;
      o.frustumCulled = true;
    });

    model.core = get('Navigator_Core');
    model.coreBase = model.core.position.clone();
    for (const [name, speed] of [['Gimbal_Outer', 0.11], ['Gimbal_Inner', -0.16]]) {
      const g = get(name);
      model.gimbals.push({ g, base: g.quaternion.clone(), speed });
    }
    // «дыхание» кромки стелы с логотипом и кольца пьедестала
    model.eyes = clone(get('Core_LogoGlow'), 2.3);
    model.north = clone(get('Core_GlowRing'), 2.3);

    const links = get('Route_Links');
    const linkMat = links.material.clone();
    linkMat.emissiveIntensity = 1.1;
    patchPulse(linkMat, pulseTime);
    links.material = linkMat;

    root.updateMatrixWorld(true);
    for (const k of MODULE_KEYS) {
      const node = get(`Module_${k}`);
      const center = new THREE.Vector3();
      node.getWorldPosition(center);
      const rimMesh = get(`Module_${k}_Rim`);
      model.rims[k] = clone(rimMesh, 1.2);
      model.modules[k] = { node, center, focus: new THREE.Vector3(center.x, center.y + 0.24, center.z) };
      model.links.push({ key: k, phase: linkPhase(center.x, center.z), last: 0 });
      model.flashes[k] = 0;
    }
  }

  // ---------- размер ----------
  let width = 1, height = 1;
  function resize() {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(dpr());
    renderer.setSize(width, height, false);
    composer.setPixelRatio(dpr());
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    particleUniforms.uPixelRatio.value = dpr();
    particleUniforms.uScale.value = (height * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  }

  // смещение кадра: модель уходит вправо/вверх, освобождая место тексту
  function setFrameShift(sx, sy) {
    camera.setViewOffset(width, height, -sx * width, sy * height, width, height);
  }

  // ---------- жизнь сцены ----------
  let lifeTime = 0, fxTime = 0;
  function update(dt) {
    lifeTime += dt;
    const t = lifeTime;
    const rm = state.reducedMotion;
    fxTime += rm ? dt * 0.35 : dt;
    hazeUniforms.uTime.value = rm ? 0 : t;
    particleUniforms.uTime.value = rm ? 0 : t;
    pulseTime.value = fxTime % PULSE_WRAP;

    if (!model.root) return;
    if (!rm) {
      model.core.position.y = model.coreBase.y + Math.sin(t * 0.55) * 0.032;
      model.core.rotation.x = Math.sin(t * 0.37) * 0.007;
      model.core.rotation.z = Math.cos(t * 0.29) * 0.007;
    }
    const spin = rm ? 0.25 : 1;
    for (const gi of model.gimbals) {
      gi.angle = (gi.angle || 0) + dt * gi.speed * spin;
      gi.g.quaternion.copy(gi.base).multiply(_q.setFromAxisAngle(_up, gi.angle));
    }
    model.eyes.emissiveIntensity = 2.3 * (0.8 + 0.2 * Math.sin(t * 1.15));
    model.north.emissiveIntensity = 2.3 * (0.78 + 0.22 * Math.sin(t * 0.9 + 1.7));

    // прибытие импульса к модулю → вспышка ободка + колбэк для звука
    for (const l of model.links) {
      const f = fract(pulseTime.value * PULSE_SPEED + l.phase);
      if (l.last < PULSE_HEAD_AT_MODULE && f >= PULSE_HEAD_AT_MODULE) {
        model.flashes[l.key] = 1;
        state.onPulse?.(l.key);
      }
      l.last = f;
    }
    for (const k of MODULE_KEYS) {
      model.flashes[k] = Math.max(0, model.flashes[k] - dt * 1.6);
      const focus = state.focusModule === k ? 1 : 0;
      const mat = model.rims[k];
      const target = 1.2 + focus * 1.8 + model.flashes[k] * 1.6;
      mat.emissiveIntensity += (target - mat.emissiveIntensity) * Math.min(1, dt * 4);
    }
  }

  function render() { composer.render(); }

  // адаптивное качество: если кадр стабильно тяжёлый — снижаем pixel ratio
  let slowFrames = 0;
  function reportFrame(dt) {
    if (maxDpr <= 1) return;
    slowFrames = dt > 1 / 40 ? slowFrames + 1 : Math.max(0, slowFrames - 0.5);
    if (slowFrames > 90) { maxDpr = Math.max(1, maxDpr - 0.5); slowFrames = 0; resize(); }
  }

  function warmup() { renderer.compile(scene, camera); composer.render(); }

  // освобождение GPU-ресурсов при размонтировании React-компонента
  function dispose() {
    scene.traverse((o) => {
      o.geometry?.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) u.value.dispose();
        m.dispose();
      }
    });
    scene.environment?.dispose();
    composer.dispose();
    rt.dispose();
    renderer.dispose();
  }

  return { state, renderer, scene, camera, model, load, resize, update, render, warmup, reportFrame, setFrameShift, dispose, get size() { return { width, height }; } };
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

// эмиссивный импульс, бегущий по линии от ядра (r≈1.28) к модулю (r≈2.17)
function patchPulse(mat, uTime) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPulseTime = uTime;
    sh.vertexShader = 'varying vec3 vVolkovPos;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vVolkovPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uPulseTime;\nvarying vec3 vVolkovPos;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */`
      #include <emissivemap_fragment>
      float vr = length(vVolkovPos.xz);
      float vs = clamp((vr - 1.28) / 0.89, 0.0, 1.0);
      float vph = fract(atan(vVolkovPos.z, vVolkovPos.x) * 0.15915494 * 3.0 + 0.37);
      float vhead = fract(uPulseTime * ${PULSE_SPEED.toFixed(3)} + vph) * 1.5 - 0.25;
      float vd = vs - vhead;
      float vtail = vd < 0.0 ? exp(vd * 9.0) * 0.25 : 0.0;
      float vpulse = exp(-vd * vd * 160.0) + vtail;
      totalEmissiveRadiance += vec3(1.0, 0.22, 0.16) * vpulse * 4.5;`);
  };
  mat.customProgramCacheKey = () => 'volkov-pulse';
}

function makeHazeTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  // value noise fbm, маскированный мягким радиальным спадом
  const G = 16, grid = Array.from({ length: (G + 1) * (G + 1) }, () => Math.random());
  const noise = (x, y, f) => {
    const gx = (x * f) % G, gy = (y * f) % G, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const v = (i, j) => grid[((iy + j) % G) * (G + 1) + ((ix + i) % G)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (v(0, 0) * (1 - sx) + v(1, 0) * sx) * (1 - sy) + (v(0, 1) * (1 - sx) + v(1, 1) * sx) * sy;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const n = noise(u, v, 3) * 0.55 + noise(u, v, 6) * 0.3 + noise(u, v, 12) * 0.15;
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const mask = Math.max(0, 1 - r) ** 1.8;
    const a = Math.max(0, Math.min(1, mask * (0.35 + n * 0.9)));
    const k = (y * S + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function makeHaze(uniforms, isMobile) {
  const layers = [ // [кол-во, rMin, rMax, yMin, yMax, sizeMin, sizeMax, цвет, альфа, скорость]
    [isMobile ? 6 : 9, 2.6, 5.5, -1.7, -0.7, 3.2, 5.5, [0.30, 0.17, 0.09], 0.11, 0.012], // тёплый ближний туман под моделью
    [isMobile ? 7 : 11, 6, 11, -2.5, 2.5, 7, 11, [0.10, 0.11, 0.13], 0.12, 0.007],
    [isMobile ? 6 : 9, 13, 22, -4, 5, 14, 22, [0.07, 0.08, 0.10], 0.14, 0.004],
  ];
  const off = [], size = [], seed = [], col = [], spd = [];
  for (const [n, r0, r1, y0, y1, s0, s1, c, a, v] of layers) for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
    off.push(Math.cos(ang) * r, y0 + Math.random() * (y1 - y0), Math.sin(ang) * r);
    size.push(s0 + Math.random() * (s1 - s0)); seed.push(Math.random());
    col.push(...c, a * (0.7 + Math.random() * 0.6)); spd.push(v * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.8));
  }
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(off), 3));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(size), 1));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 1));
  g.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(col), 4));
  g.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(spd), 1));
  g.instanceCount = seed.length;
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      attribute vec3 aOffset; attribute float aSize; attribute float aSeed; attribute vec4 aColor; attribute float aSpeed;
      uniform float uTime;
      varying vec2 vUv; varying vec4 vColor; varying float vFade;
      void main() {
        float r = length(aOffset.xz);
        float a = atan(aOffset.z, aOffset.x) + uTime * aSpeed;
        vec3 c = vec3(cos(a) * r, aOffset.y + sin(uTime * 0.06 + aSeed * 12.0) * 0.3, sin(a) * r);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        float rot = aSeed * 6.2831 + uTime * 0.012 * (aSeed - 0.5);
        vec2 p = position.xy * aSize;
        mv.xy += mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p;
        float dist = -mv.z;
        vFade = smoothstep(0.8, 3.2, dist) * (1.0 - smoothstep(40.0, 60.0, dist));
        vUv = uv; vColor = aColor;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying vec2 vUv; varying vec4 vColor; varying float vFade;
      void main() {
        float a = texture2D(uMap, vUv).a * vColor.a * vFade;
        if (a < 0.002) discard;
        gl_FragColor = vec4(vColor.rgb, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

function makeParticles(uniforms, count) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count), size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2, r = 2.4 + Math.pow(Math.random(), 0.8) * 16;
    pos[i * 3] = Math.cos(ang) * r; pos[i * 3 + 1] = -5 + Math.random() * 12; pos[i * 3 + 2] = Math.sin(ang) * r;
    seed[i] = Math.random();
    size[i] = 0.025 + Math.random() * Math.random() * 0.07;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute float aSeed; attribute float aSize;
      uniform float uTime; uniform float uPixelRatio; uniform float uScale;
      varying float vAlpha; varying float vWarm;
      const float H = 12.0; const float Y0 = -5.0;
      void main() {
        vec3 p = position;
        float yy = mod(p.y - Y0 + uTime * (0.035 + aSeed * 0.05), H);
        p.y = Y0 + yy;
        p.x += sin(uTime * 0.11 + aSeed * 30.0) * 0.22;
        p.z += cos(uTime * 0.09 + aSeed * 17.0) * 0.22;
        float edge = smoothstep(0.0, 1.8, yy) * (1.0 - smoothstep(H - 1.8, H, yy));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float tw = 0.6 + 0.4 * sin(uTime * (0.5 + aSeed * 1.2) + aSeed * 40.0);
        vAlpha = edge * tw * smoothstep(0.5, 2.0, -mv.z) * (1.0 - smoothstep(26.0, 34.0, -mv.z));
        vWarm = step(0.2, aSeed);
        gl_PointSize = clamp(aSize * uPixelRatio * uScale / -mv.z, 1.0, 36.0 * uPixelRatio);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vAlpha; varying float vWarm;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float halo = smoothstep(0.5, 0.0, d);
        float core = smoothstep(0.16, 0.0, d);
        vec3 col = mix(vec3(0.86, 0.84, 0.82), vec3(1.0, 0.36, 0.28), vWarm);
        gl_FragColor = vec4(col * (halo * 0.45 + core * 1.25), vAlpha * halo);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}
