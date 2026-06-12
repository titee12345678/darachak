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
    this._buildPhotonRing();
    this._buildJets();
    this._buildInfall();
    this._syncLabels();
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
          // โทนสีแบบภาพ NASA: ขาวครีมใจกลาง → ครีม → น้ำตาลอ่อน → น้ำตาลเข้ม
          vec3 white = vec3(1.0, 0.98, 0.92);
          vec3 cream = vec3(0.95, 0.88, 0.74);
          vec3 tan   = vec3(0.70, 0.56, 0.42);
          vec3 brown = vec3(0.30, 0.20, 0.13);
          vec3 col = mix(white, cream, smoothstep(0.0, 0.22, t));
          col = mix(col, tan,   smoothstep(0.22, 0.55, t));
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
    const inner = RH * 1.12, outer = RH * 11.5; // จานใหญ่แผ่กว้าง เงาดำดูเล็กกลางจาน
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

  /* ── เจ็ตสัมพัทธภาพ — สายควันเกลียวพลิ้วพุ่งขึ้น (แบบภาพ NASA) ── */
  _buildJets() {
    const H = 34;
    const COUNT = 700;
    this.jetParts = [];
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const h = Math.pow(Math.random(), 0.8) * H;
      this.jetParts.push({
        h,
        a: Math.random() * Math.PI * 2,
        r0: 0.25 + Math.random() * 0.45,
        sp: 0.6 + Math.random() * 1.0,
        wob: Math.random() * Math.PI * 2,
      });
      // ฟ้าขาวสว่างที่โคน จางลงตามความสูง
      const f = 1 - h / H;
      col[i * 3] = 0.65 + f * 0.35;
      col[i * 3 + 1] = 0.78 + f * 0.22;
      col[i * 3 + 2] = 1.0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.jetPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.55, transparent: true, opacity: 0.42, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.group.add(this.jetPoints);

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
      color: 0xffc890, size: 0.22, transparent: true, opacity: 0.8,
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
    // สายเจ็ตเกลียวพลิ้ว: อนุภาคไต่เกลียวขึ้น บานออกตามความสูง
    const jp = this.jetPoints.geometry.attributes.position;
    const H = 34;
    this.jetParts.forEach((m, i) => {
      m.h += dt * m.sp * 3.2;
      m.a += dt * m.sp * 1.8;
      if (m.h > H) { m.h = 0; m.a = Math.random() * Math.PI * 2; }
      const spread = m.r0 + (m.h / H) * 2.6;            // บานออกด้านบน
      const sway = Math.sin(m.h * 0.32 + this.elapsed * 0.7 + m.wob) * (m.h / H) * 1.4;
      jp.setXYZ(i,
        Math.cos(m.a) * spread + sway,
        RH * 0.7 + m.h,
        Math.sin(m.a) * spread + sway * 0.5);
    });
    jp.needsUpdate = true;
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
