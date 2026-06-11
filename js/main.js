/* ═══════════════════════════════════════════════════════════
   main.js — ดาราจักร : Interactive 3D Astronomy Platform · By Tee Jakkrit
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { SolarSystem, buildStarfield } from './solar.js';
import { Planetarium } from './planetarium.js';
import { deepSpaceTexture } from './textures.js';
import { UI, REGISTRY } from './ui.js';
import { Quiz } from './quiz.js';
import { PROVINCES, ASTEROID_BELT_INFO } from './data.js';

const $ = (id) => document.getElementById(id);

/* ── Renderer ─────────────────────────────────────────────── */
const container = $('scene-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
$('labels-container').appendChild(labelRenderer.domElement);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none'; // ให้ event ทะลุลง canvas

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 5000);
camera.position.set(0, 55, 130);

// ผูก controls กับ canvas โดยตรง — ปัดหมุนได้ 360° ทั้งเมาส์และนิ้ว
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;

/* ── สถานะหลัก ────────────────────────────────────────────── */
let mode = 'solar';
let paused = false;
let focusId = null;
let solar, planetarium, starfield, deepSpaceTex;
const ui = new UI();
const quiz = new Quiz(() => ui.level);

/* ── Loader แบบเป็นขั้นตอน (ให้ UI ได้วาดระหว่างสร้าง) ───── */
const tick = () => new Promise((r) => setTimeout(r, 30));
async function boot() {
  const status = $('loader-status'), fill = $('loader-fill');
  const step = async (pct, msg, fn) => {
    status.textContent = msg;
    fill.style.width = pct + '%';
    await tick();
    fn();
  };

  await step(8, 'กำลังวาดอวกาศลึกและทางช้างเผือก…', () => {
    deepSpaceTex = deepSpaceTexture();
    scene.background = deepSpaceTex;
    starfield = buildStarfield(scene);
  });
  await step(30, 'กำลังหลอมดวงอาทิตย์และดาวเคราะห์ 8 ดวง…', () => {
    solar = new SolarSystem(scene, onPick);
    solar.beltPick.userData.info = ASTEROID_BELT_INFO;
  });
  await step(62, 'กำลังจัดเรียงหมู่ดาวบนท้องฟ้าจำลอง…', () => {
    planetarium = new Planetarium(scene, onPick);
  });
  await step(84, 'กำลังเตรียมระบบการเรียนรู้ภาษาไทย…', () => {
    setupControls();
    ui.fillDrawer('solar', onPick);
  });
  await step(100, 'พร้อมออกเดินทางสู่จักรวาล!', () => {});
  await new Promise((r) => setTimeout(r, 450));
  $('loader').classList.add('done');
  ui.toast('ยินดีต้อนรับสู่ดาราจักร 🚀 คลิกดาวเคราะห์เพื่อเริ่มเรียนรู้');
  // เปิดโหมด/วัตถุจากพารามิเตอร์ URL ได้ เช่น ?mode=sky หรือ ?pick=mars
  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'sky') setMode('sky');
  const pickId = params.get('pick');
  if (pickId && REGISTRY.has(pickId)) onPick(pickId);
}

/* ── การเลือกวัตถุ ────────────────────────────────────────── */
function onPick(id) {
  const o = REGISTRY.get(id);
  if (!o) return;
  ui.showInfo(id);
  if (o.world === 'sky') {
    planetarium.select(o.kind === 'constellation' ? id : null);
    const dir = planetarium.getDirectionTo(id);
    if (dir && mode === 'sky') flyLookAt(dir);
  } else if (mode === 'solar') {
    focusOn(id); // แตะดาว → กล้องบินซูมไปหาทันที
  }
}
ui.onFocus = (id) => { if (REGISTRY.get(id)?.world === 'solar') focusOn(id); };
ui.onDeselect = () => { if (planetarium) planetarium.deselect(); };

/* ── โหมดกล้อง ────────────────────────────────────────────── */
function applySolarCamera() {
  controls.enabled = true;
  controls.minDistance = 7;
  controls.maxDistance = 700;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.rotateSpeed = 0.8;
  camera.fov = 55;
  camera.near = 0.05;
  camera.updateProjectionMatrix();
  camera.position.set(0, 55, 130);
  controls.target.set(0, 0, 0);
}
function applySkyCamera() {
  controls.enabled = true;
  controls.minDistance = 0.12;
  controls.maxDistance = 0.12;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = -0.32;   // ลากท้องฟ้าตามมือแบบ planetarium
  camera.fov = 60;
  camera.near = 0.05;
  camera.updateProjectionMatrix();
  const dir = new THREE.Vector3(0, 0.28, -1).normalize(); // มองทิศเหนือ
  camera.position.copy(dir).multiplyScalar(-0.12);
  controls.target.set(0, 0, 0);
}

function setMode(next) {
  if (next === mode) return;
  mode = next;
  clearFocus();
  ui.hideInfo();
  document.querySelectorAll('.mode-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === next));
  const isSolar = next === 'solar';
  solar.setVisible(isSolar);
  starfield.visible = isSolar;
  scene.background = isSolar ? deepSpaceTex : new THREE.Color(0x010309);
  planetarium.setVisible(!isSolar);
  $('deck-solar').classList.toggle('hidden', !isSolar);
  $('deck-sky').classList.toggle('hidden', isSolar);
  $('compass').classList.toggle('hidden', isSolar);
  $('deck-hint').textContent = isSolar
    ? 'คลิกดาวเคราะห์เพื่อดูข้อมูล · ลากเพื่อหมุน · ลูกกลิ้งเพื่อซูม'
    : 'ลากเพื่อกวาดมองท้องฟ้า · คลิกชื่อหมู่ดาวหรือดาวเพื่อดูข้อมูล';
  ui.fillDrawer(next, onPick);
  if (isSolar) applySolarCamera(); else applySkyCamera();
}

/* ── บินกล้องไปหาดาว (โหมดระบบสุริยะ) ────────────────────────
   เฟส 1 "บินเข้า": ปิด controls ชั่วคราว บินแบบ deterministic
   เฟส 2 "เกาะติด": เลื่อนกล้อง+เป้าตามดาวแบบแข็ง (ไม่มี lerp ไล่)
   → ไม่แย่งบังคับกับมือผู้ใช้ = ไม่กระตุก                      */
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(),
  _sUp = new THREE.Vector3(), _aim = new THREE.Vector3();
const _lastFocus = new THREE.Vector3();
let fly = null;            // { t, fromPos, fromTarget, want }
let interacting = false;   // ผู้ใช้กำลังลาก/ซูมอยู่หรือไม่
controls.addEventListener('start', () => { interacting = true; });
controls.addEventListener('end', () => { interacting = false; });

function focusOn(id) {
  solar.getBodyWorldPosition(id, _v1);
  const r = solar.getBodyRadius(id);
  focusId = id;
  fly = {
    t: 0,
    want: Math.max(r * 4.2, 1.6),
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
  };
  controls.enabled = false;                       // กันมือชนกับแอนิเมชันบิน
  controls.minDistance = Math.max(r * 1.4, 0.5);  // ให้ซูมใกล้ดาวเล็กได้ ไม่โดนดันกลับ
  _lastFocus.copy(_v1);
  ui.toast(`กำลังบินไปยัง ${REGISTRY.get(id).nameTh} …`, 1800);
}

function clearFocus() {
  focusId = null;
  fly = null;
  controls.enabled = true;
  controls.minDistance = 7;
}

/* จุดเล็งที่ดันดาวขึ้นครึ่งบนจอ เมื่อ bottom-sheet มือถือเปิดอยู่ */
function sheetIsOpen() {
  const holoEl = document.getElementById('holo');
  return innerWidth <= 600
    && !holoEl.classList.contains('hidden')
    && !holoEl.classList.contains('collapsed');
}
function aimPoint(planetPos, dist, out) {
  out.copy(planetPos);
  if (!sheetIsOpen()) return out;
  _dir.subVectors(planetPos, camera.position).normalize();
  _right.crossVectors(_dir, camera.up).normalize();
  _sUp.crossVectors(_right, _dir).normalize();
  return out.addScaledVector(_sUp, -dist * 0.42);
}

function updateFocus(dt) {
  if (!focusId || mode !== 'solar') return;
  solar.getBodyWorldPosition(focusId, _v1);

  if (fly) { // ── เฟสบินเข้า ──
    fly.t += dt / 1.5;
    const k = Math.min(1, fly.t);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    // ปลายทาง: ค้างทิศเข้าหาดาวตามตำแหน่งเริ่ม แต่ตามดาวที่เคลื่อนอยู่
    _v2.subVectors(fly.fromPos, _v1).normalize();
    const endPos = _v2.multiplyScalar(fly.want).add(_v1);
    camera.position.lerpVectors(fly.fromPos, endPos, e);
    aimPoint(_v1, fly.want, _aim);
    controls.target.lerpVectors(fly.fromTarget, _aim, e);
    _lastFocus.copy(_v1);
    if (k >= 1) { fly = null; controls.enabled = true; }
    return;
  }

  // ── เฟสเกาะติด: เลื่อนตามดาวแบบแข็ง ──
  _v2.subVectors(_v1, _lastFocus);
  camera.position.add(_v2);
  controls.target.add(_v2);
  _lastFocus.copy(_v1);

  // จัดเฟรมหลบแผงเฉพาะตอนผู้ใช้ไม่ได้ลากจอ (ไม่แย่งบังคับ)
  if (!interacting) {
    const dist = camera.position.distanceTo(_v1);
    aimPoint(_v1, dist, _aim);
    controls.target.lerp(_aim, Math.min(1, dt * 2.5));
  }
}

/* ── หมุนกล้องไปดูทิศที่กำหนด (โหมดท้องฟ้า) ──────────────── */
let lookTween = null;
function flyLookAt(dir) {
  lookTween = { from: camera.position.clone().normalize().negate(), to: dir.clone(), t: 0 };
}
function updateLookTween(dt) {
  if (!lookTween) return;
  lookTween.t += dt * 1.6;
  const k = Math.min(1, lookTween.t);
  const ease = 1 - Math.pow(1 - k, 3);
  const v = lookTween.from.clone().lerp(lookTween.to, ease).normalize();
  camera.position.copy(v).multiplyScalar(-0.12);
  if (k >= 1) lookTween = null;
}

/* ── Raycasting คลิกเลือกดาว ──────────────────────────────── */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 6 || mode !== 'solar') return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...solar.pickables, solar.beltPick], false);
  if (hits.length) {
    const info = hits[0].object.userData.info;
    if (info) onPick(info.id);
  }
});

/* ── ปุ่มและแผงควบคุม ─────────────────────────────────────── */
function setupControls() {
  // โหมด
  document.querySelectorAll('.mode-tab').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));

  // ระดับการเรียนรู้
  document.querySelectorAll('.lvl').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.lvl').forEach((x) => x.classList.toggle('active', x === b));
      ui.setLevel(b.dataset.level);
      ui.toast(`เปลี่ยนเป็นโหมด${{ kid: 'เด็ก 🧒', student: 'นักเรียน 📘', expert: 'ผู้เชี่ยวชาญ 🔭' }[b.dataset.level]}`);
    }));

  // ความเร็วเวลา (ตัวคูณของเวลาจริง)
  const speedInput = $('speed');
  const fmtCompact = new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 });
  const updateSpeedLabel = () => {
    const m = speedMultiplier();
    $('speed-readout').textContent = `×${m < 1000 ? Math.round(m).toLocaleString('th-TH') : fmtCompact.format(m)}`;
  };
  speedInput.addEventListener('input', updateSpeedLabel);
  updateSpeedLabel();

  $('pause-btn').addEventListener('click', () => {
    paused = !paused;
    $('pause-btn').textContent = paused ? '▶' : '❚❚';
    $('pause-btn').classList.toggle('on', paused);
  });
  $('orbit-toggle').addEventListener('click', (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    solar.setOrbitsVisible(on);
  });
  $('label-toggle').addEventListener('click', (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    solar.setLabelsVisible(on);
  });
  $('reset-cam').addEventListener('click', () => {
    clearFocus();
    applySolarCamera();
  });

  // ลิ้นชัก
  $('drawer-toggle').addEventListener('click', () => $('drawer').classList.toggle('open'));

  // ท้องฟ้าจำลอง: จังหวัด วันที่ เวลา
  const prov = $('province');
  PROVINCES.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = p.name;
    prov.appendChild(o);
  });
  const today = new Date();
  $('sky-date').value = today.toISOString().slice(0, 10);
  const hh = String(today.getHours()).padStart(2, '0');
  const mm = String(today.getMinutes()).padStart(2, '0');
  $('sky-time').value = `${hh}:${mm}`;

  const applySky = () => {
    const p = PROVINCES[+prov.value];
    const dateStr = $('sky-date').value || today.toISOString().slice(0, 10);
    const timeStr = $('sky-time').value || '20:00';
    const date = new Date(`${dateStr}T${timeStr}:00+07:00`); // เวลาประเทศไทย
    planetarium.setSky(p.lat, p.lon, date);
    if (planetarium.selectedId) planetarium.select(planetarium.selectedId);
  };
  prov.addEventListener('change', () => { applySky(); ui.toast(`ท้องฟ้าเหนือ${PROVINCES[+prov.value].name}`); });
  $('sky-date').addEventListener('change', applySky);
  $('sky-time').addEventListener('change', applySky);
  $('sky-now').addEventListener('click', () => {
    const now = new Date();
    $('sky-date').value = now.toISOString().slice(0, 10);
    $('sky-time').value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    applySky();
    ui.toast('แสดงท้องฟ้า ณ เวลาปัจจุบัน');
  });
  $('const-lines').addEventListener('click', (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    planetarium.setLinesVisible(on);
  });
  $('const-art').addEventListener('click', (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    planetarium.setArtVisible(on);
  });

  // ซูมท้องฟ้าด้วยลูกกลิ้ง (ปรับ FOV)
  renderer.domElement.addEventListener('wheel', (e) => {
    if (mode !== 'sky') return;
    camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.03, 22, 80);
    camera.updateProjectionMatrix();
  }, { passive: true });

  // ซูมท้องฟ้าด้วยสองนิ้ว (pinch → FOV) บนมือถือ
  const touches = new Map();
  let pinchDist = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { touches.set(e.pointerId, [e.clientX, e.clientY]); });
  el.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (mode !== 'sky' || touches.size !== 2) return;
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchDist > 0) {
      camera.fov = THREE.MathUtils.clamp(camera.fov + (pinchDist - d) * 0.18, 22, 80);
      camera.updateProjectionMatrix();
    }
    pinchDist = d;
  });
  const endTouch = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinchDist = 0; };
  el.addEventListener('pointerup', endTouch);
  el.addEventListener('pointercancel', endTouch);
}

/* ตัวคูณเวลาจริง: สไลเดอร์ 0..100 → ×1 ถึง ×10,000,000 (สเกล log) */
function speedMultiplier() {
  const v = +$('speed').value;
  return Math.pow(10, (v / 100) * 7);
}
/* แปลงเป็นวันจำลองต่อวินาทีจริง — ×1 = เวลาเดินเท่าชีวิตจริง */
function daysPerSec() {
  return speedMultiplier() / 86400;
}

/* ── เข็มทิศบอกทิศที่กำลังมอง ─────────────────────────────── */
const THAI_DIRS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้',
  'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
function updateCompass() {
  if (mode !== 'sky') return;
  const dir = camera.position.clone().negate().normalize(); // มองทะลุจุดศูนย์กลาง
  let az = Math.atan2(dir.x, -dir.z) * 180 / Math.PI;
  if (az < 0) az += 360;
  $('compass-dir').textContent = `${THAI_DIRS[Math.round(az / 45) % 8]} (${Math.round(az)}°)`;
}

/* ── วงจรเรนเดอร์ ─────────────────────────────────────────── */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (solar && mode === 'solar') {
    solar.update(paused ? 0 : dt, paused ? 0 : daysPerSec());
    updateFocus(dt);
  }
  if (mode === 'sky') {
    updateLookTween(dt);
    updateCompass();
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

boot().then(animate);
