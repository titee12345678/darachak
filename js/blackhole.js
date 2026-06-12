/* ═══════════════════════════════════════════════════════════
   blackhole.js — โหมดหลุมดำ 3D
   เส้นขอบฟ้าเหตุการณ์ · จานพอกพูนมวล (Doppler beaming จริง)
   วงแหวนโฟตอน (เลนส์ความโน้มถ่วง) · เจ็ตสัมพัทธภาพ
   อนุภาคไหลวนตกหลุม — ทุกส่วนคลิกดูข้อมูลได้
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BLACKHOLE_OBJECTS } from './data.js';
import { glowSprite } from './textures.js';
import { ValueNoise } from './noise.js';

const RH = 4; // รัศมีขอบฟ้าเหตุการณ์ (หน่วยฉาก)

function bhInfo(id) {
  return BLACKHOLE_OBJECTS.find((o) => o.id === id);
}

function makeLabel(text, sub, onClick) {
  const div = document.createElement('div');
  div.className = 'obj-label';
  div.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
  div.addEventListener('pointerdown', (e) => { e.stopPropagation(); onClick(); });
  return new CSS2DObject(div);
}

/* noise texture สำหรับลายเส้นก๊าซในจาน */
function noiseTex(seed = 7, size = 256) {
  const n = new ValueNoise(seed);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = n.fbm(x / size * 6, y / size * 6, 5, 6) * 255;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export class BlackHole {
  constructor(scene, onPick) {
    this.onPick = onPick;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.labels = [];
    this.pickables = [];
    this.elapsed = 0;

    this._buildHorizon();
    this._buildDisk();
    this._buildGalaxy();
    this._buildPhotonRing();
    this._buildJets();
    this._buildInfall();
    this._syncLabels();
  }

  /* ── กาแล็กซีดวงดาวล้อมหลุมดำ (ตามภาพ: ทองใจกลาง → ฟ้าแขนกังหัน) ── */
  _buildGalaxy() {
    const COUNT = 24000;
    const ARMS = 4;
    const RMIN = RH * 4.0, RMAX = RH * 34;

    // พื้นเรืองนุ่ม (เนบิวลา) ใต้ดวงดาว — ทำให้ทั้งกาแล็กซีดูเนียนต่อเนื่อง
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const cx = cv.getContext('2d');
    const half = S / 2;
    const bg = cx.createRadialGradient(half, half, 0, half, half, half);
    bg.addColorStop(0, 'rgba(255, 214, 140, 0.85)');
    bg.addColorStop(0.16, 'rgba(255, 226, 170, 0.45)');
    bg.addColorStop(0.42, 'rgba(150, 185, 215, 0.22)');
    bg.addColorStop(0.75, 'rgba(105, 150, 190, 0.10)');
    bg.addColorStop(1, 'rgba(90, 130, 175, 0)');
    cx.fillStyle = bg;
    cx.fillRect(0, 0, S, S);
    // หมอกฟุ้งตามแขนกังหัน (สูตรเดียวกับดวงดาว)
    for (let i = 0; i < 240; i++) {
      const t = Math.pow(Math.random(), 1.4);
      const r = (0.14 + t * 0.82) * half;
      const arm = (i % ARMS) / ARMS * Math.PI * 2;
      const a = arm + (r / half) * 4.6 + (Math.random() - 0.5) * 0.5;
      const x = half + Math.cos(a) * r, y = half + Math.sin(a) * r;
      const rad = 14 + Math.random() * 34;
      const g2 = cx.createRadialGradient(x, y, 0, x, y, rad);
      const blue = r / half > 0.3;
      g2.addColorStop(0, blue ? 'rgba(150, 190, 220, 0.12)' : 'rgba(255, 225, 165, 0.14)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g2;
      cx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const baseTex = new THREE.CanvasTexture(cv);
    baseTex.colorSpace = THREE.SRGBColorSpace;
    this.galaxyBase = new THREE.Mesh(
      new THREE.CircleGeometry(RMAX * 1.05, 64),
      new THREE.MeshBasicMaterial({
        map: baseTex, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.galaxyBase.rotation.x = -Math.PI / 2 + 0.07;
    this.group.add(this.galaxyBase);

    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const siz = new Float32Array(COUNT);
    const cGold = new THREE.Color(0xffd98c);
    const cCream = new THREE.Color(0xfff3dc);
    const cBlue = new THREE.Color(0x8fc0e0);
    const cTeal = new THREE.Color(0x6fa8c8);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const t = Math.pow(Math.random(), 1.6); // หนาแน่นใจกลาง
      const r = RMIN + t * (RMAX - RMIN);
      const arm = (i % ARMS) / ARMS * Math.PI * 2;
      const spiral = arm + (r / RMAX) * 4.6;            // แขนกังหันลอการิทึม
      const spread = 0.28 + (r / RMAX) * 0.55;           // แขนฟุ้งขึ้นด้านนอก
      const ra = spiral + (Math.random() - 0.5) * spread * 2.2;
      const rr = r * (1 + (Math.random() - 0.5) * 0.16);
      pos[i * 3] = Math.cos(ra) * rr;
      pos[i * 3 + 1] = (Math.random() - 0.5) * (0.8 + (r / RMAX) * 3.2); // จานบางใจกลาง ฟุ้งขอบ
      pos[i * 3 + 2] = Math.sin(ra) * rr;
      // สี: ทอง (ใจกลาง) → ครีม → ฟ้า → ฟ้าเขียวหม่น (ขอบ)
      const k = r / RMAX;
      if (k < 0.22) c.lerpColors(cGold, cCream, k / 0.22);
      else if (k < 0.6) c.lerpColors(cCream, cBlue, (k - 0.22) / 0.38);
      else c.lerpColors(cBlue, cTeal, (k - 0.6) / 0.4);
      const lum = 0.45 + Math.random() * 0.6;
      col[i * 3] = c.r * lum; col[i * 3 + 1] = c.g * lum; col[i * 3 + 2] = c.b * lum;
      siz[i] = 0.5 + Math.pow(Math.random(), 3.0) * 2.6; // ส่วนใหญ่เล็กจิ๋ว บางดวงเด่น
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    // จุดกลมขอบฟุ้ง ขนาดสุ่ม — เนียนแบบภาพถ่ายดาว ไม่ใช่สี่เหลี่ยมแข็ง
    this.galaxy = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexColors: true,
      vertexShader: `attribute float aSize; varying vec3 vColor;
        void main(){ vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (160.0 / -mv.z);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vColor;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.15, d);
          gl_FragColor = vec4(vColor, a * 0.95); }`,
    }));
    this.galaxy.rotation.x = 0.07; // ระนาบเดียวกับจานทอง
    this.group.add(this.galaxy);

    // ดาวสว่างสีส้ม-ขาวประปรายแบบในภาพ
    const N2 = 320;
    const p2 = new Float32Array(N2 * 3);
    const c2 = new Float32Array(N2 * 3);
    for (let i = 0; i < N2; i++) {
      const r = RH * 6 + Math.random() * RH * 26;
      const a = Math.random() * Math.PI * 2;
      p2[i * 3] = Math.cos(a) * r;
      p2[i * 3 + 1] = (Math.random() - 0.5) * 4;
      p2[i * 3 + 2] = Math.sin(a) * r;
      const orange = Math.random() < 0.45;
      c2[i * 3] = 1; c2[i * 3 + 1] = orange ? 0.65 : 0.95; c2[i * 3 + 2] = orange ? 0.3 : 0.9;
    }
    const geo2 = new THREE.BufferGeometry();
    geo2.setAttribute('position', new THREE.BufferAttribute(p2, 3));
    geo2.setAttribute('color', new THREE.BufferAttribute(c2, 3));
    this.sparkles = new THREE.Points(geo2, new THREE.PointsMaterial({
      size: 1.5, transparent: true, opacity: 0.9, vertexColors: true,
      map: glowSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64),
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sparkles.rotation.x = 0.07;
    this.group.add(this.sparkles);

    // ป้ายเชื่อมความรู้: หลุมดำยิ่งยวดอยู่ใจกลางกาแล็กซีแทบทุกแห่ง
    const l = makeLabel('กาแล็กซีรอบหลุมดำ', '(คลิกดูเรื่องทางช้างเผือก)', () => this.onPick('milkyway'));
    l.position.set(-RH * 18, 3, RH * 10);
    this.group.add(l);
    this.labels.push(l);
  }

  /* ── เงาดำสนิทของขอบฟ้าเหตุการณ์ ───────────────────────── */
  _buildHorizon() {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(RH, 64, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    sphere.userData.info = bhInfo('bh-core');
    this.group.add(sphere);
    this.pickables.push(sphere);

    const l = makeLabel('เส้นขอบฟ้าเหตุการณ์', '(Event Horizon)', () => this.onPick('bh-core'));
    l.position.set(0, -RH - 2.2, 0);
    this.group.add(l);
    this.labels.push(l);
  }

  /* shader จานก๊าซ — ใช้ร่วมกันระหว่างจานแนวนอนกับวงแสงเลนส์
     uDopDir กำหนดทิศ Doppler beaming ของแต่ละชิ้น */
  _diskMaterial(inner, outer, dopX, dopY, gain) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.sharedTime,
        uNoise: { value: this.noise },
        uInner: { value: inner },
        uOuter: { value: outer },
        uDop: { value: new THREE.Vector2(dopX, dopY) },
        uGain: { value: gain },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec2 vP;
        void main() {
          vP = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform sampler2D uNoise;
        uniform float uInner; uniform float uOuter;
        uniform vec2 uDop; uniform float uGain;
        varying vec2 vP;
        void main() {
          float r = length(vP);
          float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
          float ang = atan(vP.y, vP.x);
          // เกลียวลอการิทึม + เคปเลอร์ (วงในหมุนเร็ว) = ลายนมเกลียวในกาแฟ
          float spin = uTime * (0.30 - t * 0.20);
          float sw = (ang / 6.28318) * 2.0 - log(r / uInner) * 2.6;
          float n  = texture2D(uNoise, vec2(sw - spin * 0.5, t * 1.6)).r;
          float n2 = texture2D(uNoise, vec2(sw * 2.6 + 0.37 - spin * 0.9, t * 4.5)).r;
          float n3 = texture2D(uNoise, vec2(sw * 6.0 - spin * 1.4, t * 9.0)).r;
          float streak = n * 0.45 + n2 * 0.35 + n3 * 0.2;
          // โทนทองอำพันแบบใจกลางกาแล็กซี: ขาวทอง → ทอง → อำพัน → น้ำตาลทอง
          vec3 white = vec3(1.0, 0.97, 0.88);
          vec3 gold  = vec3(1.0, 0.85, 0.52);
          vec3 amber = vec3(0.88, 0.58, 0.26);
          vec3 brown = vec3(0.35, 0.22, 0.10);
          vec3 col = mix(white, gold, smoothstep(0.0, 0.22, t));
          col = mix(col, amber, smoothstep(0.22, 0.55, t));
          col = mix(col, brown, smoothstep(0.55, 1.0, t));
          // แถบฝุ่นมืดแทรกเป็นวง ๆ
          col *= 0.55 + streak * 0.75;
          // Doppler เบา ๆ พอให้ฝั่งหนึ่งสว่างกว่า
          float d = dot(normalize(vP), uDop);
          col *= 1.0 + 0.3 * d;
          // ใจกลางเรืองขาวจ้า (แสงสุดท้ายก่อนตกหลุม)
          float rim = smoothstep(0.10, 0.0, t);
          col += vec3(1.0, 0.99, 0.95) * rim * 1.3;
          // จานทึบแบบควันนม ไม่ใช่ไฟเรือง — ใช้ normal blending
          float fadeIn  = smoothstep(0.0, 0.025, t);
          float fadeOut = 1.0 - smoothstep(0.72, 1.0, t);
          float alpha = fadeIn * fadeOut * (0.5 + streak * 0.55) * uGain;
          float glow = (rim * 0.8 + (1.0 - t) * 0.25);
          gl_FragColor = vec4(col * (0.85 + glow), clamp(alpha + rim, 0.0, 1.0));
        }`,
    });
  }

  /* ── จานพอกพูนมวลมหึมาแบบภาพศิลป์ NASA ──────────────────── */
  _buildDisk() {
    this.sharedTime = { value: 0 };
    this.noise = noiseTex(7);
    const inner = RH * 1.12, outer = RH * 5.0; // วงทองเรืองรอบเงาดำ — กาแล็กซีอนุภาครับช่วงต่อ
    const disk = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 220, 36),
      this._diskMaterial(inner, outer, 0, 1, 1.0),
    );
    disk.rotation.x = -Math.PI / 2 + 0.07; // เกือบแบนราบ มองเฉียดระนาบ
    disk.userData.info = bhInfo('bh-disk');
    this.group.add(disk);
    this.pickables.push(disk);
    this.disk = disk;

    // แสงเลนส์จาง ๆ รัดรอบเงาดำ (หันเข้ากล้องเสมอ)
    const hi = RH * 1.02, ho = RH * 1.7;
    this.lensHalo = new THREE.Mesh(
      new THREE.RingGeometry(hi, ho, 96, 8),
      this._diskMaterial(hi, ho, -1, 0, 0.55),
    );
    this.lensHalo.userData.info = bhInfo('bh-photon');
    this.group.add(this.lensHalo);
    this.pickables.push(this.lensHalo);

    const l = makeLabel('จานพอกพูนมวล', '(Accretion Disk)', () => this.onPick('bh-disk'));
    l.position.set(outer * 0.6, 1.8, 0);
    this.group.add(l);
    this.labels.push(l);
  }

  /* ── วงแหวนโฟตอน: เลนส์ความโน้มถ่วงรอบเงาดำ ────────────── */
  _buildPhotonRing() {
    // sprite วงแหวน billboard — มองมุมไหนก็เห็นวงรอบเงาดำ (ภาพแบบ EHT)
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    // วงโฟตอนรัดแน่นรอบเงาดำ — เส้นบางคมแบบภาพ EHT
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.40, S / 2, S / 2, S * 0.5);
    g.addColorStop(0.0, 'rgba(255,220,160,0)');
    g.addColorStop(0.35, 'rgba(255,235,190,1.0)');
    g.addColorStop(0.55, 'rgba(255,170,80,0.5)');
    g.addColorStop(1.0, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(c);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(RH * 2.35);
    this.group.add(halo);
    this.halo = halo;

    // แสงฟุ้งรอบนอกจาง ๆ
    const outerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSprite('rgba(255,170,80,0.35)', 'rgba(255,120,30,0)'),
      transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    outerGlow.scale.setScalar(RH * 8);
    this.group.add(outerGlow);

    const l = makeLabel('วงแหวนโฟตอน', '(Photon Ring)', () => this.onPick('bh-photon'));
    l.position.set(-RH * 1.45, RH * 1.45, 0);
    this.group.add(l);
    this.labels.push(l);
  }

  /* ── เจ็ตสัมพัทธภาพ — พายุควันเกลียวต่อเนื่อง (shader 3 ชั้นซ้อน) ── */
  _jetMaterial(repeat, speed, twist, opacity) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.sharedTime,
        uNoise: { value: this.noise },
        uRepeat: { value: repeat },
        uSpeed: { value: speed },
        uTwist: { value: twist },
        uOpacity: { value: opacity },
        uH: { value: 34 },
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        uniform float uH;
        varying float vH; varying float vU;
        void main() {
          vH = position.y / uH + 0.5;  // 0 โคน → 1 ปลาย
          vU = uv.x;                    // มุมรอบทรงกรวย
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform sampler2D uNoise;
        uniform float uRepeat; uniform float uSpeed;
        uniform float uTwist; uniform float uOpacity;
        varying float vH; varying float vU;
        void main() {
          // ควันไหลขึ้น + บิดเกลียวรอบแกน = สายพายุต่อเนื่อง
          float n = texture2D(uNoise, vec2(
            vU * uRepeat + vH * uTwist - uTime * uSpeed * 0.22,
            vH * 2.1 - uTime * uSpeed * 0.55)).r;
          float n2 = texture2D(uNoise, vec2(
            vU * uRepeat * 2.3 - uTime * uSpeed * 0.31 + 0.43,
            vH * 4.2 - uTime * uSpeed * 0.95)).r;
          float smoke = smoothstep(0.30, 0.85, n * 0.6 + n2 * 0.4);
          // จางที่โคน-ปลาย และสว่างสุดช่วงล่าง
          float fade = smoothstep(0.0, 0.10, vH) * (1.0 - smoothstep(0.5, 1.0, vH));
          vec3 col = mix(vec3(0.88, 0.94, 1.0), vec3(0.55, 0.72, 1.0), vH);
          float a = smoke * fade * uOpacity;
          gl_FragColor = vec4(col * (0.75 + smoke * 0.7), a);
        }`,
    });
  }

  _buildJets() {
    const H = 34;
    // 3 ชั้นซ้อน: แกนในสว่างแน่น → ชั้นกลาง → หมอกนอกฟุ้งกว้าง
    const layers = [
      [0.4, 1.6, 2.0, 1.6, 5.0, 0.85],
      [0.7, 2.6, 3.0, 1.0, 3.2, 0.5],
      [1.1, 3.8, 4.0, 0.65, 2.2, 0.26],
    ];
    layers.forEach(([rTop, rBot, rep, spd, tw, op]) => {
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(rBot, rTop, H, 48, 24, true), // ปลายบานกว้าง
        this._jetMaterial(rep, spd, tw, op),
      );
      jet.position.y = H / 2 + RH * 0.55;
      this.group.add(jet);
    });

    // แสงขาวจ้าที่โคนเจ็ต (จุดที่อนุภาคถูกเหวี่ยงหนี)
    const base = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSprite('rgba(235,245,255,0.95)', 'rgba(150,190,255,0)'),
      transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    base.scale.setScalar(RH * 1.6);
    base.position.y = RH * 0.9;
    this.group.add(base);

    // แท่งใสสำหรับคลิกเลือกเจ็ต
    const pick = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, H, 8, 1, true),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    pick.position.y = H / 2 + RH * 0.5;
    pick.userData.info = bhInfo('bh-jet');
    this.group.add(pick);
    this.pickables.push(pick);

    const l = makeLabel('เจ็ตสัมพัทธภาพ', '(Relativistic Jet)', () => this.onPick('bh-jet'));
    l.position.set(0, H * 0.8, 0);
    this.group.add(l);
    this.labels.push(l);
  }

  /* ── อนุภาคก๊าซไหลวนตกหลุม ─────────────────────────────── */
  _buildInfall() {
    const COUNT = 320;
    this.parts = [];
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      this.parts.push({
        a: Math.random() * Math.PI * 2,
        r: RH * 1.3 + Math.random() * RH * 2.6,
        s: 0.5 + Math.random() * 0.9,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.infall = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc890, size: 0.3, transparent: true, opacity: 0.8,
      map: glowSprite('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64),
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.infall.rotation.x = -Math.PI / 2 + 0.07; // ระนาบเดียวกับจาน
    this.group.add(this.infall);
  }

  /* CSS2D label ไม่สนใจ visibility ของ group — sync เอง */
  _syncLabels() {
    this.labels.forEach((l) => { l.visible = this.group.visible; });
  }

  setVisible(v) {
    this.group.visible = v;
    this._syncLabels();
  }

  update(dt, camera = null) {
    if (!this.group.visible) return;
    this.elapsed += dt;
    this.sharedTime.value = this.elapsed;
    // วงแสงเลนส์หันหน้าเข้ากล้องตลอด (แสงโค้งรอบหลุมเห็นทุกมุมมอง)
    if (camera) this.lensHalo.quaternion.copy(camera.quaternion);
    // กาแล็กซีหมุนช้า ๆ รอบหลุมดำ (พื้นเรืองหมุนตาม)
    this.galaxy.rotation.y += dt * 0.012;
    this.sparkles.rotation.y += dt * 0.008;
    this.galaxyBase.rotation.z += dt * 0.012;
    // เจ็ตพายุควันขับเคลื่อนด้วย shader (uTime ร่วมกับจาน) — ไม่มีงาน CPU ต่อเฟรม
    // อนุภาคหมุนเร็วขึ้นเมื่อใกล้หลุม (เคปเลอร์) แล้วหายวับที่ขอบฟ้า
    const p = this.infall.geometry.attributes.position;
    this.parts.forEach((m, i) => {
      m.a += dt * m.s * (RH * 2.2 / m.r);
      m.r -= dt * m.s * 0.35;
      if (m.r < RH * 1.02) { // ตกถึงขอบฟ้า → เกิดใหม่ขอบนอก
        m.r = RH * 3.2 + Math.random() * RH * 1.5;
        m.a = Math.random() * Math.PI * 2;
      }
      p.setXYZ(i, Math.cos(m.a) * m.r, Math.sin(m.a) * m.r, (Math.random() - 0.5) * 0.1);
    });
    p.needsUpdate = true;
  }
}
