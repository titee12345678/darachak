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
      blending: THREE.AdditiveBlending,
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
          // เคปเลอร์: วงในหมุนเร็วกว่า — ลายก๊าซบิดเกลียว
          float spin = uTime * (0.55 - t * 0.38);
          float n = texture2D(uNoise, vec2((ang / 6.28318) * 3.0 - spin - t * 2.2, t * 1.8)).r;
          float n2 = texture2D(uNoise, vec2((ang / 6.28318) * 7.0 - spin * 1.6 + 0.35, t * 3.5)).r;
          float streak = n * 0.6 + n2 * 0.4;
          // อุณหภูมิ: ขอบในขาวร้อนจัด → วงนอกส้มแดงคล้ำ
          vec3 white = vec3(1.0, 0.99, 0.96);
          vec3 hot  = vec3(1.0, 0.88, 0.62);
          vec3 mid  = vec3(1.0, 0.55, 0.14);
          vec3 cool = vec3(0.45, 0.09, 0.02);
          vec3 col = mix(white, hot, smoothstep(0.0, 0.18, t));
          col = mix(col, mid, smoothstep(0.18, 0.5, t));
          col = mix(col, cool, smoothstep(0.5, 1.0, t));
          // Doppler beaming: ฝั่งพุ่งเข้าหาผู้ชมสว่าง+ฟ้าขึ้น อีกฝั่งหรี่+แดง
          float d = dot(normalize(vP), uDop);
          float dop = 1.0 + 0.8 * d;
          col *= dop;
          col.b *= (1.0 + 0.3 * d);
          // ขอบในเรืองขาวจัด (แสงสุดท้ายก่อนตกหลุม)
          float rim = smoothstep(0.12, 0.0, t);
          col += vec3(1.0, 0.97, 0.9) * rim * 1.6;
          float bright = pow(1.0 - t, 1.5) * (0.45 + streak * 0.95) * uGain;
          float edge = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.78, 1.0, t));
          gl_FragColor = vec4(col * bright, bright * edge);
        }`,
    });
  }

  /* ── จานพอกพูนมวลแนวนอน ────────────────────────────────── */
  _buildDisk() {
    this.sharedTime = { value: 0 };
    this.noise = noiseTex(7);
    const inner = RH * 1.18, outer = RH * 4.2;
    const disk = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 192, 24),
      this._diskMaterial(inner, outer, 0, 1, 1.25),
    );
    disk.rotation.x = -Math.PI / 2 + 0.18;
    disk.userData.info = bhInfo('bh-disk');
    this.group.add(disk);
    this.pickables.push(disk);
    this.disk = disk;

    // วงแสงเลนส์ความโน้มถ่วง — แสงจาก "ด้านหลัง" ของจานถูกดัดโค้ง
    // ขึ้นมาเหนือ-ใต้เงาดำ (ภาพแบบ Gargantua/M87) หันเข้ากล้องเสมอ
    const hi = RH * 1.04, ho = RH * 2.5;
    this.lensHalo = new THREE.Mesh(
      new THREE.RingGeometry(hi, ho, 128, 16),
      this._diskMaterial(hi, ho, -1, 0, 0.9),
    );
    this.lensHalo.userData.info = bhInfo('bh-disk');
    this.group.add(this.lensHalo);
    this.pickables.push(this.lensHalo);

    const l = makeLabel('จานพอกพูนมวล', '(Accretion Disk)', () => this.onPick('bh-disk'));
    l.position.set(outer * 0.82, 1.6, 0);
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

  /* ── เจ็ตสัมพัทธภาพคู่ขั้วบน-ล่าง ──────────────────────── */
  _buildJets() {
    const H = 30;
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, 'rgba(170,210,255,0.85)');
    g.addColorStop(0.35, 'rgba(140,190,255,0.4)');
    g.addColorStop(1, 'rgba(120,170,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);

    this.jets = [];
    [1, -1].forEach((dir) => {
      const jet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 1.0, H, 24, 1, true),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      jet.position.y = dir * (H / 2 + RH * 0.5);
      if (dir < 0) jet.rotation.x = Math.PI;
      jet.userData.info = bhInfo('bh-jet');
      this.group.add(jet);
      this.pickables.push(jet);
      this.jets.push(jet);
    });

    const l = makeLabel('เจ็ตสัมพัทธภาพ', '(Relativistic Jet)', () => this.onPick('bh-jet'));
    l.position.set(0, H * 0.75, 0);
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
    this.infall.rotation.x = -Math.PI / 2 + 0.22; // ระนาบเดียวกับจาน
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
    // เจ็ตเต้นระยิบ
    this.jets.forEach((j, i) => {
      j.material.opacity = 0.45 + 0.2 * Math.sin(this.elapsed * 2.2 + i * 2);
    });
    // อนุภาคหมุนเร็วขึ้นเมื่อใกล้หลุม (เคปเลอร์) แล้วหายวับที่ขอบฟ้า
    const p = this.infall.geometry.attributes.position;
    this.parts.forEach((m, i) => {
      m.a += dt * m.s * (RH * 2.2 / m.r);
      m.r -= dt * m.s * 0.35;
      if (m.r < RH * 1.02) { // ตกถึงขอบฟ้า → เกิดใหม่ขอบนอก
        m.r = RH * 3.6 + Math.random() * RH;
        m.a = Math.random() * Math.PI * 2;
      }
      p.setXYZ(i, Math.cos(m.a) * m.r, Math.sin(m.a) * m.r, (Math.random() - 0.5) * 0.1);
    });
    p.needsUpdate = true;
  }
}
