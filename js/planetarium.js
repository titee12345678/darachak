/* ═══════════════════════════════════════════════════════════
   planetarium.js — ท้องฟ้าจำลองแบบโดม
   หมู่ดาว 12 กลุ่ม · ดาวฤกษ์สำคัญ · วัตถุท้องฟ้าลึก
   จำลองท้องฟ้าจริงตามจังหวัด วันที่ และเวลา (LST → Alt/Az)
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CONSTELLATIONS, BRIGHT_STARS, DSOS } from './data.js';
import { glowSprite, nebulaSprite } from './textures.js';
import { mulberry32 } from './noise.js';
import { daysSinceJ2000, helio, moonGeo, eclipticToRaDec } from './ephemeris.js';
import { STAR_CATALOG } from './stars-catalog.js';

const R = 480; // รัศมีโดมท้องฟ้า

/* ── เวลาดาราคติท้องถิ่น (Local Sidereal Time) ───────────── */
export function localSiderealTime(date, lonDeg) {
  const D = date.getTime() / 86400000 - 10957.5; // วันนับจาก J2000.0
  let gmst = (18.697374558 + 24.06570982441908 * D) % 24;
  if (gmst < 0) gmst += 24;
  let lst = (gmst + lonDeg / 15) % 24;
  if (lst < 0) lst += 24;
  return lst; // ชั่วโมง
}

/* RA/Dec (ชม., องศา) → ตำแหน่งบนโดมในพิกัดขอบฟ้า
   แกนฉาก: +X ตะวันออก, +Y กลางฟ้า, −Z เหนือ */
function radecToHorizon(raH, decDeg, lstH, latDeg, out) {
  const a = (raH / 24) * Math.PI * 2;
  const d = THREE.MathUtils.degToRad(decDeg);
  const th = (lstH / 24) * Math.PI * 2;
  const phi = THREE.MathUtils.degToRad(latDeg);
  const vx = Math.cos(d) * Math.cos(a), vy = Math.cos(d) * Math.sin(a), vz = Math.sin(d);
  const x1 = vx * Math.cos(th) + vy * Math.sin(th);   // Rz(−θ)
  const y1 = -vx * Math.sin(th) + vy * Math.cos(th);
  const east = y1;
  const up = x1 * Math.cos(phi) + vz * Math.sin(phi);
  const north = vz * Math.cos(phi) - x1 * Math.sin(phi);
  return out.set(east, up, -north);
}

const ART_EMOJI = {
  hunter: '🏹', bear: '🐻', scorpion: '🦂', lion: '🦁', twins: '🧑‍🤝‍🧑',
  bull: '🐂', archer: '🏹', queen: '👑', cross: '✦', lyre: '🪕', swan: '🦢',
  ram: '🐏', crab: '🦀', maiden: '👧', scales: '⚖️', seagoat: '🐐',
  waterbearer: '🏺', fish: '🐟',
};

function emojiSprite(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.font = '190px serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.9;
  ctx.filter = 'sepia(1) hue-rotate(160deg) saturate(2.4) brightness(1.15)';
  ctx.fillText(emoji, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

export class Planetarium {
  constructor(scene, onPick) {
    this.scene = scene;
    this.onPick = onPick;
    this.group = new THREE.Group();
    this.labels = [];
    this.pickables = [];
    this.lat = 13.75; this.lon = 100.5; this.date = new Date();
    this.selectedId = null;
    this.linesVisible = true;
    this.artVisible = false;
    scene.add(this.group);

    this._buildBackgroundStars();
    this._buildMilkyWay();
    this._buildConstellations();
    this._buildBrightStars();
    this._buildDSOs();
    this._buildSkyPlanets();
    this._buildHorizon();
    this._buildMeteors();
    this._buildAtmosphere();
    this.setSky(this.lat, this.lon, this.date);
    this.setVisible(false);
  }

  /* ── ดาวพื้นหลัง: ดาวจริง 8,404 ดวงจาก Yale Bright Star Catalog ──
     ขนาดตามความสว่างจริง (magnitude) สีตามอุณหภูมิผิวดาวจริง */
  _buildBackgroundStars() {
    const COUNT = STAR_CATALOG.length;
    this.bgEq = []; // [ra, dec]
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    const color = new THREE.Color();
    const tempToColor = (t) => { // เคลวิน → สีดาว (ประมาณ blackbody)
      if (t < 3700) color.setRGB(1, 0.62, 0.4);        // M แดงส้ม
      else if (t < 5200) color.setRGB(1, 0.8, 0.58);   // K ส้ม
      else if (t < 6000) color.setRGB(1, 0.94, 0.82);  // G เหลือง
      else if (t < 7500) color.setRGB(1, 0.98, 0.94);  // F ขาวเหลือง
      else if (t < 10000) color.setRGB(0.93, 0.95, 1); // A ขาว
      else color.setRGB(0.76, 0.86, 1);                // B/O ฟ้า
    };
    for (let i = 0; i < COUNT; i++) {
      const [ra, dec, mag, t100] = STAR_CATALOG[i];
      this.bgEq.push([ra, dec]);
      tempToColor(t100 * 100);
      // ดาวจางลดความสว่างผ่านสี (additive blending = คูณสีเหมือนคูณ alpha)
      const lum = THREE.MathUtils.clamp(1.25 - mag * 0.16, 0.18, 1);
      col[i * 3] = color.r * lum; col[i * 3 + 1] = color.g * lum; col[i * 3 + 2] = color.b * lum;
      size[i] = THREE.MathUtils.clamp(7.2 - mag * 1.0, 1.1, 10);
    }
    const tw = new Float32Array(COUNT);
    const randTw = mulberry32(777);
    for (let i = 0; i < COUNT; i++) tw[i] = randTw();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
    this.starUniforms = { uTime: { value: 0 }, uDay: { value: 0 } };
    this.bgStars = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: this.starUniforms,
      vertexShader: `attribute float aSize; attribute float aTw;
        varying vec3 vColor; varying float vUp; varying float vTw;
        void main(){ vColor = color; vUp = position.y; vTw = aTw;
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uDay;
        varying vec3 vColor; varying float vUp; varying float vTw;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
          float a = smoothstep(1.0, 0.25, d);
          if (vUp < 0.0) a *= 0.0;                       // ใต้ขอบฟ้ามองไม่เห็น
          // ดาวกะพริบระยิบ (บรรยากาศหักเหแสง) — แรงขึ้นใกล้ขอบฟ้า
          float near = 1.0 - smoothstep(0.0, 160.0, vUp);
          float tw = 1.0 - (0.12 + 0.3 * near) * (0.5 + 0.5 * sin(uTime * (1.5 + vTw * 4.0) + vTw * 60.0));
          // แสงดาวจางลงใกล้ขอบฟ้า (มองผ่านอากาศหนากว่า)
          float ext = mix(0.25, 1.0, smoothstep(0.0, 100.0, vUp));
          a *= tw * ext * (1.0 - uDay * 0.93);            // กลางวันดาวหายไป
          gl_FragColor = vec4(vColor, a); }`,
      vertexColors: true,
    }));
    this.group.add(this.bgStars);
  }

  /* ── แถบทางช้างเผือก (ระนาบกาแล็กซี) ───────────────────── */
  _buildMilkyWay() {
    // ขั้วกาแล็กซีเหนือ: RA 12.86h, Dec +27.13°
    const pole = new THREE.Vector3();
    const a = (12.86 / 24) * Math.PI * 2, d = THREE.MathUtils.degToRad(27.13);
    pole.set(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
    const A = new THREE.Vector3(0, 0, 1).cross(pole).normalize();
    const B = pole.clone().cross(A).normalize();
    const rand = mulberry32(55);
    const COUNT = 900;
    this.mwEq = []; // unit vectors ในพิกัดศูนย์สูตร
    const pos = new Float32Array(COUNT * 3);
    const size = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const t = rand() * Math.PI * 2;
      const spread = (rand() + rand() + rand() - 1.5) * 0.12;
      const v = A.clone().multiplyScalar(Math.cos(t))
        .add(B.clone().multiplyScalar(Math.sin(t)))
        .add(pole.clone().multiplyScalar(spread)).normalize();
      this.mwEq.push(v);
      // หนาแน่นขึ้นใกล้ใจกลาง (ทิศคนยิงธนู RA~18.5h)
      size[i] = 14 + rand() * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.milkyWay = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: glowSprite('rgba(225,220,255,0.5)', 'rgba(160,160,220,0)') } },
      vertexShader: `attribute float aSize; varying float vUp;
        void main(){ vUp = position.y;
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D uTex; varying float vUp;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
          float a = t.a * 0.16; if (vUp < 0.0) a = 0.0;
          gl_FragColor = vec4(t.rgb, a); }`,
    }));
    this.group.add(this.milkyWay);
  }

  /* ── หมู่ดาว 12 กลุ่ม ──────────────────────────────────── */
  _buildConstellations() {
    this.constellations = CONSTELLATIONS.map((c) => {
      const starTex = glowSprite('rgba(255,255,255,1)', 'rgba(160,200,255,0)');
      const starsGroup = new THREE.Group();
      const sprites = c.stars.map(([name, ra, dec, mag]) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: starTex, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        const sc = THREE.MathUtils.clamp(14 - mag * 2.6, 4, 15);
        s.scale.setScalar(sc);
        s.userData = { ra, dec, name };
        starsGroup.add(s);
        return s;
      });

      // เส้นเชื่อมเรืองแสง
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(c.lines.length * 6), 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x86d8ff, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const lines = new THREE.LineSegments(lineGeo, lineMat);

      // ป้ายชื่อหมู่ดาว
      const div = document.createElement('div');
      div.className = 'const-label';
      div.innerHTML = `${c.nameTh}<small>(${c.nameEn})</small>`;
      div.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onPick(c.id); });
      const label = new CSS2DObject(div);
      this.labels.push(label);

      // ภาพตำนานโปร่งใส
      const art = new THREE.Sprite(emojiSprite(ART_EMOJI[c.art] || '✶'));
      art.visible = false;

      // ป้ายชื่อดาวสมาชิก (โชว์เมื่อเลือก)
      const starLabels = c.stars.map(([name]) => {
        const sd = document.createElement('div');
        sd.className = 'star-label';
        sd.textContent = name;
        const so = new CSS2DObject(sd);
        so.visible = false;
        so.userData.memberOf = c.id; // โชว์เฉพาะเมื่อเลือกหมู่ดาวนี้
        this.labels.push(so);
        return so;
      });

      this.group.add(starsGroup, lines, label, art);
      starLabels.forEach((l) => this.group.add(l));
      return { data: c, sprites, lines, label, art, starLabels };
    });
  }

  /* ── ดาวฤกษ์สว่างสำคัญ ─────────────────────────────────── */
  _buildBrightStars() {
    this.brightStars = BRIGHT_STARS.map((s) => {
      const tex = glowSprite(s.color, 'rgba(150,180,255,0)');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sprite.scale.setScalar(THREE.MathUtils.clamp(16 - s.mag * 4, 7, 20));
      const div = document.createElement('div');
      div.className = 'star-label';
      div.textContent = s.nameTh;
      div.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onPick(s.id); });
      const label = new CSS2DObject(div);
      this.labels.push(label);
      this.group.add(sprite, label);
      return { data: s, sprite, label };
    });
  }

  /* ── วัตถุท้องฟ้าลึก ───────────────────────────────────── */
  _buildDSOs() {
    this.dsos = DSOS.filter((d) => d.kind !== 'milkyway').map((d, i) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nebulaSprite(d.color, 60 + i * 13),
        transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sprite.scale.setScalar(d.size * 13);
      const div = document.createElement('div');
      div.className = 'dso-label';
      div.textContent = d.nameTh;
      div.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onPick(d.id); });
      const label = new CSS2DObject(div);
      this.labels.push(label);
      this.group.add(sprite, label);
      return { data: d, sprite, label };
    });
  }

  /* ── ดวงอาทิตย์ ดวงจันทร์ ดาวเคราะห์ — ตำแหน่งจริงตามเวลา ── */
  _buildSkyPlanets() {
    const defs = [
      { id: 'sun', nameTh: 'ดวงอาทิตย์', color: '#ffd27a', size: 34 },
      { id: 'moon', nameTh: 'ดวงจันทร์', color: '#eceadf', size: 28 },
      { id: 'mercury', nameTh: 'ดาวพุธ', color: '#cbbcab', size: 8 },
      { id: 'venus', nameTh: 'ดาวศุกร์', color: '#fff3cf', size: 15 },
      { id: 'mars', nameTh: 'ดาวอังคาร', color: '#ff9a70', size: 10 },
      { id: 'jupiter', nameTh: 'ดาวพฤหัสบดี', color: '#ffe3ba', size: 13 },
      { id: 'saturn', nameTh: 'ดาวเสาร์', color: '#ffeccd', size: 11 },
    ];
    this.skyPlanets = defs.map((p) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowSprite(p.color, 'rgba(255,220,150,0)'),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sprite.scale.setScalar(p.size);
      const div = document.createElement('div');
      div.className = 'obj-label';
      div.innerHTML = `${p.nameTh}`;
      div.style.color = '#ffe9b8';
      div.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onPick(p.id); });
      const label = new CSS2DObject(div);
      this.labels.push(label);
      this.group.add(sprite, label);
      return { def: p, sprite, label };
    });
  }

  /* ── ดาวตก! ────────────────────────────────────────────── */
  _buildMeteors() {
    this.meteors = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xfff8e8, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.group.add(line);
      this.meteors.push({ line, t: 2, dur: 1, start: new THREE.Vector3(), dir: new THREE.Vector3(), len: 50 });
    }
    this.meteorTimer = 4;
  }

  _spawnMeteor() {
    const m = this.meteors.find((x) => x.t >= 1);
    if (!m) return;
    // จุดเริ่มสุ่มบนฟ้า (มุมเงย 25–75°)
    const az = Math.random() * Math.PI * 2;
    const alt = (25 + Math.random() * 50) * Math.PI / 180;
    m.start.set(
      Math.cos(alt) * Math.sin(az) * R * 0.97,
      Math.sin(alt) * R * 0.97,
      Math.cos(alt) * Math.cos(az) * R * 0.97,
    );
    // ทิศพุ่ง: สุ่มแนวเฉียงลง
    const up = m.start.clone().normalize();
    const tangent = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)
      .cross(up).normalize();
    m.dir.copy(tangent).addScaledVector(up, -0.55).normalize();
    m.len = 35 + Math.random() * 55;
    m.dur = 0.45 + Math.random() * 0.5;
    m.t = 0;
  }

  /* เรียกทุกเฟรมจาก main (เฉพาะโหมดท้องฟ้า) */
  update(dt, elapsed) {
    if (!this.group.visible) return;
    this.starUniforms.uTime.value = elapsed;
    // ดาวตกสุ่มทุก 4–13 วินาที (เฉพาะตอนฟ้ามืด)
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      if ((this.dayFactor || 0) < 0.4) this._spawnMeteor();
      this.meteorTimer = 4 + Math.random() * 9;
    }
    for (const m of this.meteors) {
      if (m.t >= 1) { m.line.material.opacity = 0; continue; }
      m.t += dt / m.dur;
      const k = Math.min(1, m.t);
      const head = m.start.clone().addScaledVector(m.dir, k * m.len);
      const tail = head.clone().addScaledVector(m.dir, -Math.min(k * m.len, 14));
      const p = m.line.geometry.attributes.position;
      p.setXYZ(0, tail.x, tail.y, tail.z);
      p.setXYZ(1, head.x, head.y, head.z);
      p.needsUpdate = true;
      m.line.material.opacity = Math.sin(Math.PI * k) * 0.95;
    }
  }

  /* ── พื้นดิน ขอบฟ้า และทิศ ─────────────────────────────── */
  _buildHorizon() {
    // พื้นดินมืดใต้ขอบฟ้า
    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 1.05, R * 1.05, R * 0.5, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x030608, side: THREE.DoubleSide }),
    );
    ground.position.y = -R * 0.25 - 2;
    this.group.add(ground);
    const groundCap = new THREE.Mesh(
      new THREE.CircleGeometry(R * 1.05, 64),
      new THREE.MeshBasicMaterial({ color: 0x040709 }),
    );
    groundCap.rotation.x = -Math.PI / 2;
    groundCap.position.y = -2;
    this.group.add(groundCap);

    // แสงเรืองขอบฟ้า
    const horizonGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.998, R * 0.998, R * 0.12, 96, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x1a3a52, transparent: true, opacity: 0.5,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    horizonGlow.position.y = R * 0.03;
    this.group.add(horizonGlow);

    // วงแหวนขอบฟ้า
    const ringPts = [];
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(t) * R * 0.99, 0, Math.sin(t) * R * 0.99));
    }
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({ color: 0x4a90b8, transparent: true, opacity: 0.55 }),
    );
    this.group.add(ring);

    // ป้ายทิศภาษาไทย
    const dirs = [
      ['เหนือ (N)', 0, 0, -1], ['ตะวันออก (E)', 1, 0, 0],
      ['ใต้ (S)', 0, 0, 1], ['ตะวันตก (W)', -1, 0, 0],
    ];
    dirs.forEach(([name, x, y, z]) => {
      const div = document.createElement('div');
      div.className = 'const-label';
      div.style.color = '#ffb454';
      div.textContent = name;
      const o = new CSS2DObject(div);
      o.position.set(x * R * 0.95, 8, z * R * 0.95);
      this.group.add(o);
      this.labels.push(o);
    });

    // เส้นกริดมุมเงยจาง ๆ
    [30, 60].forEach((alt) => {
      const r2 = Math.cos(THREE.MathUtils.degToRad(alt)) * R;
      const y2 = Math.sin(THREE.MathUtils.degToRad(alt)) * R;
      const pts = [];
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * r2, y2, Math.sin(t) * r2));
      }
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x2a5a78, transparent: true, opacity: 0.16 }),
      );
      this.group.add(l);
    });
  }

  /* ── บรรยากาศ: เงาต้นไม้รอบขอบฟ้า + โดมท้องฟ้ากลางวัน ──── */
  _buildAtmosphere() {
    // เงาต้นไม้/เนินเขา (วาดสุ่มบน canvas พันรอบขอบฟ้า)
    const c = document.createElement('canvas');
    c.width = 2048; c.height = 220;
    const ctx = c.getContext('2d');
    const rand = mulberry32(2468);
    ctx.fillStyle = '#020403';
    let base = 160;
    ctx.beginPath();
    ctx.moveTo(0, 220);
    for (let x = 0; x <= 2048; x += 8) {
      base += (rand() - 0.5) * 7;
      base = Math.max(120, Math.min(190, x > 1980 ? 160 : base)); // ปิดรอยต่อให้เนียน
      ctx.lineTo(x, base);
      if (rand() < 0.16) { // ต้นไม้
        const h = 14 + rand() * 36, w2 = 5 + rand() * 12;
        ctx.lineTo(x + w2 * 0.2, base - h * 0.5);
        ctx.lineTo(x + w2 * 0.45, base - h * 0.3);
        ctx.lineTo(x + w2 * 0.5, base - h);
        ctx.lineTo(x + w2 * 0.6, base - h * 0.35);
        ctx.lineTo(x + w2 * 0.8, base - h * 0.55);
        ctx.lineTo(x + w2, base);
      }
    }
    ctx.lineTo(2048, 220);
    ctx.closePath();
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    const trees = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.985, R * 0.985, R * 0.1, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false }),
    );
    trees.position.y = R * 0.028;
    this.group.add(trees);

    // โดมกลางวัน: ฟ้าสว่างเป็นสีฟ้าเมื่อดวงอาทิตย์อยู่เหนือขอบฟ้า
    this.dayDome = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.18, 32, 16),
      new THREE.MeshBasicMaterial({
        color: 0x7ab4e8, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false,
      }),
    );
    this.group.add(this.dayDome);
  }

  /* ── จัดท้องฟ้าตามสถานที่และเวลา ───────────────────────── */
  setSky(lat, lon, date) {
    this.lat = lat; this.lon = lon; this.date = date;
    const lst = localSiderealTime(date, lon);
    const v = new THREE.Vector3();

    // ดาวพื้นหลัง
    const bp = this.bgStars.geometry.attributes.position;
    this.bgEq.forEach(([ra, dec], i) => {
      radecToHorizon(ra, dec, lst, lat, v).multiplyScalar(R * 1.02);
      bp.setXYZ(i, v.x, v.y, v.z);
    });
    bp.needsUpdate = true;

    // ทางช้างเผือก
    const mp = this.milkyWay.geometry.attributes.position;
    const th = (lst / 24) * Math.PI * 2, phi = THREE.MathUtils.degToRad(lat);
    this.mwEq.forEach((u, i) => {
      const x1 = u.x * Math.cos(th) + u.y * Math.sin(th);
      const y1 = -u.x * Math.sin(th) + u.y * Math.cos(th);
      const east = y1, up = x1 * Math.cos(phi) + u.z * Math.sin(phi);
      const north = u.z * Math.cos(phi) - x1 * Math.sin(phi);
      mp.setXYZ(i, east * R, up * R, -north * R);
    });
    mp.needsUpdate = true;

    // หมู่ดาว
    this.constellations.forEach((con) => {
      const centroid = new THREE.Vector3();
      con.sprites.forEach((s, i) => {
        radecToHorizon(s.userData.ra, s.userData.dec, lst, lat, v).multiplyScalar(R);
        s.position.copy(v);
        centroid.add(v);
        con.starLabels[i].position.copy(v).multiplyScalar(0.97);
        con.starLabels[i].position.y -= 6;
      });
      centroid.divideScalar(con.sprites.length);
      con.label.position.copy(centroid).multiplyScalar(1.04);
      con.art.position.copy(centroid).multiplyScalar(0.92);
      const artScale = con.data.id === 'crux' ? 40 : 95;
      con.art.scale.setScalar(artScale);
      // ซ่อนป้ายถ้าทั้งกลุ่มอยู่ใต้ขอบฟ้า
      con.label.visible = this.group.visible && centroid.y > -R * 0.05;
      const lp = con.lines.geometry.attributes.position;
      con.data.lines.forEach(([i1, i2], k) => {
        const p1 = con.sprites[i1].position, p2 = con.sprites[i2].position;
        lp.setXYZ(k * 2, p1.x, p1.y, p1.z);
        lp.setXYZ(k * 2 + 1, p2.x, p2.y, p2.z);
      });
      lp.needsUpdate = true;
      con.lines.visible = this.linesVisible && this.group.visible;
      con.sprites.forEach((s) => { s.visible = s.position.y > -10; });
      con.art.visible = (this.artVisible || this.selectedId === con.data.id)
        && centroid.y > 0 && this.group.visible;
    });

    // ดาวสว่าง
    this.brightStars.forEach((bs) => {
      radecToHorizon(bs.data.ra, bs.data.dec, lst, lat, v).multiplyScalar(R);
      bs.sprite.position.copy(v);
      bs.label.position.copy(v).multiplyScalar(0.96);
      bs.label.position.y += 8;
      const above = v.y > -8;
      bs.sprite.visible = above;
      bs.label.visible = above && this.group.visible;
    });

    // DSO
    this.dsos.forEach((d) => {
      radecToHorizon(d.data.ra, d.data.dec, lst, lat, v).multiplyScalar(R * 0.97);
      d.sprite.position.copy(v);
      d.label.position.copy(v).multiplyScalar(0.94);
      const above = v.y > -8;
      d.sprite.visible = above;
      d.label.visible = above && this.group.visible;
    });

    // ดวงอาทิตย์ ดวงจันทร์ ดาวเคราะห์ — ephemeris จริง ณ วัน/เวลาที่เลือก
    const dDay = daysSinceJ2000(date);
    const eEarth = helio('earth', dDay);
    this.skyPlanets.forEach((sp) => {
      let vec;
      if (sp.def.id === 'sun') vec = { x: -eEarth.x, y: -eEarth.y, z: -eEarth.z };
      else if (sp.def.id === 'moon') vec = moonGeo(dDay);
      else {
        const p = helio(sp.def.id, dDay);
        vec = { x: p.x - eEarth.x, y: p.y - eEarth.y, z: p.z - eEarth.z };
      }
      const { ra, dec } = eclipticToRaDec(vec);
      radecToHorizon(ra, dec, lst, lat, v).multiplyScalar(R * 0.95);
      sp.sprite.position.copy(v);
      sp.label.position.copy(v).multiplyScalar(0.93);
      sp.label.position.y += 10;
      const above = v.y > -12;
      sp.sprite.visible = above;
      sp.label.visible = above && this.group.visible;
    });

    // กลางวัน-กลางคืนจริง: ฟ้าสว่างตามมุมเงยดวงอาทิตย์
    const sunSp = this.skyPlanets.find((s) => s.def.id === 'sun');
    const sunUp = sunSp.sprite.position.y / (R * 0.95);
    this.dayFactor = THREE.MathUtils.smoothstep(sunUp, -0.06, 0.22);
    this.starUniforms.uDay.value = this.dayFactor;
    // รุ่งเช้า/พลบค่ำเป็นสีส้มทอง → กลางวันฟ้าสด
    this.dayDome.material.color.lerpColors(
      new THREE.Color(0xff8a3d), new THREE.Color(0x6fb1ea),
      THREE.MathUtils.clamp((sunUp - 0.02) / 0.2, 0, 1));
    this.dayDome.material.opacity = this.dayFactor * 0.88;
    this.milkyWay.visible = this.dayFactor < 0.5;
    this.dsos.forEach((d) => { d.sprite.material.opacity = 0.85 * (1 - this.dayFactor); });
  }

  /* ── เลือก/ไฮไลต์หมู่ดาว ───────────────────────────────── */
  select(id) {
    this.selectedId = id;
    this.constellations.forEach((con) => {
      const on = con.data.id === id;
      con.lines.material.opacity = on ? 0.95 : 0.4;
      con.lines.material.color.set(on ? 0xcdeeff : 0x86d8ff);
      con.starLabels.forEach((l) => { l.visible = on && this.group.visible; });
      con.art.visible = (on || this.artVisible) && this.group.visible
        && con.label.position.y > 0;
    });
  }
  deselect() { this.select(null); }

  /* ทิศทางมอง (กล้องชี้ไปที่วัตถุ id) — คืน Vector3 หรือ null */
  getDirectionTo(id) {
    const con = this.constellations.find((c) => c.data.id === id);
    if (con) return con.label.position.clone().normalize();
    const bs = this.brightStars.find((b) => b.data.id === id);
    if (bs) return bs.sprite.position.clone().normalize();
    const d = this.dsos.find((x) => x.data.id === id);
    if (d) return d.sprite.position.clone().normalize();
    const sp = this.skyPlanets.find((x) => x.def.id === id);
    if (sp && sp.sprite.visible) return sp.sprite.position.clone().normalize();
    return null;
  }

  setLinesVisible(vis) {
    this.linesVisible = vis;
    this.constellations.forEach((c) => { c.lines.visible = vis && this.group.visible; });
  }
  setArtVisible(vis) {
    this.artVisible = vis;
    this.constellations.forEach((c) => {
      c.art.visible = (vis || this.selectedId === c.data.id)
        && c.label.position.y > 0 && this.group.visible;
    });
  }

  setVisible(vis) {
    this.group.visible = vis;
    this.labels.forEach((l) => {
      const member = l.userData.memberOf;
      l.visible = vis && (!member || member === this.selectedId);
    });
    if (vis) this.setSky(this.lat, this.lon, this.date); // รีเฟรช visibility ป้าย
  }
}
