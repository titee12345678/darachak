/* ═══════════════════════════════════════════════════════════
   solar.js — ฉากระบบสุริยะ 3 มิติ
   ดวงอาทิตย์เพลาสมา · ดาวเคราะห์ 8 ดวง · วงโคจรเรืองแสง
   แถบดาวเคราะห์น้อย · ดาวหาง · ดาวเคราะห์แคระ · ดวงจันทร์
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SUN, PLANETS, DWARF_PLANETS, COMET, EARTH_MOON } from './data.js';
import {
  rockyTexture, venusTexture, earthTextures, cloudTexture,
  gasGiantTexture, ringTexture, glowSprite,
} from './textures.js';
import { ValueNoise } from './noise.js';

const ORBIT_COLOR = 0x7fd4ff;

/* noise canvas → DataTexture สำหรับ shader ดวงอาทิตย์ */
function noiseDataTexture(seed, size = 256) {
  const n = new ValueNoise(seed);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = n.fbm(x / size * 8, y / size * 8, 5, 8) * 255;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function makeLabel(text, sub, cls, onClick) {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = sub ? `${text}<small>${sub}</small>` : text;
  div.addEventListener('pointerdown', (e) => { e.stopPropagation(); onClick(); });
  const obj = new CSS2DObject(div);
  return obj;
}

function orbitLine(a, e = 0, inclineDeg = 0, segments = 256, color = ORBIT_COLOR, opacity = 0.32) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    const r = a * (1 - e * e) / (1 + e * Math.cos(th));
    pts.push(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.rotation.x = THREE.MathUtils.degToRad(inclineDeg);
  return line;
}

export class SolarSystem {
  constructor(scene, onPick) {
    this.scene = scene;
    this.onPick = onPick;
    this.group = new THREE.Group();
    this.bodies = [];        // { info, pivot, mesh, angle, ... }
    this.pickables = [];
    this.orbits = [];
    this.labels = [];
    this.simDays = 0;
    this.elapsed = 0;
    scene.add(this.group);

    this._buildSun();
    this._buildPlanets();
    this._buildAsteroidBelt();
    this._buildComet();
    this._buildLight();
  }

  /* ── ดวงอาทิตย์ + โคโรนา + เปลวสุริยะ ─────────────────── */
  _buildSun() {
    const noiseTex = noiseDataTexture(11);
    this.sunUniforms = {
      uTime: { value: 0 },
      uNoise: { value: noiseTex },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.sunUniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform sampler2D uNoise;
        varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
        void main() {
          // เพลาสมาไหลวน: ซ้อน noise สองชั้นเลื่อนสวนทางกัน
          vec2 uv1 = vUv * 3.0 + vec2(uTime * 0.013, uTime * 0.004);
          vec2 uv2 = vUv * 6.0 - vec2(uTime * 0.008, uTime * 0.016);
          float n1 = texture2D(uNoise, uv1).r;
          float n2 = texture2D(uNoise, uv2).r;
          float n = n1 * 0.6 + n2 * 0.4;
          n = pow(n, 1.5);
          // granulation เม็ดเล็ก
          float g = texture2D(uNoise, vUv * 14.0 + n * 0.35 + uTime * 0.002).r;
          n = n * 0.8 + g * 0.2;
          vec3 deep = vec3(0.55, 0.08, 0.0);
          vec3 mid  = vec3(1.0, 0.42, 0.02);
          vec3 hot  = vec3(1.0, 0.86, 0.45);
          vec3 white= vec3(1.0, 0.98, 0.88);
          vec3 col = mix(deep, mid, smoothstep(0.15, 0.5, n));
          col = mix(col, hot, smoothstep(0.5, 0.78, n));
          col = mix(col, white, smoothstep(0.78, 0.97, n));
          // ขอบดวงมืดลง (limb darkening)
          float limb = dot(vNormal, vView);
          col *= 0.55 + 0.45 * smoothstep(0.0, 0.7, limb);
          // ขอบเรืองส้ม
          col += vec3(1.0, 0.45, 0.1) * pow(1.0 - max(limb, 0.0), 2.5) * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN.radius, 96, 48), mat);
    sun.userData.info = SUN;
    this.group.add(sun);
    this.pickables.push(sun);
    this.sun = sun;

    // โคโรนาเรืองแสงหลายชั้น
    const coronaTex = glowSprite('rgba(255,200,90,1)', 'rgba(255,120,20,0)', 256);
    const mk = (scale, opacity) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: coronaTex, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      s.scale.setScalar(scale);
      this.group.add(s);
      return s;
    };
    this.corona = [mk(SUN.radius * 5.2, 0.55), mk(SUN.radius * 8.5, 0.22), mk(SUN.radius * 14, 0.1)];

    // เปลวสุริยะ — sprite วงรอบขอบดวง กระเพื่อมเป็นจังหวะ
    const flareTex = glowSprite('rgba(255,170,60,0.95)', 'rgba(255,80,10,0)', 128);
    this.flares = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flareTex, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const a = (i / 9) * Math.PI * 2;
      s.userData = { angle: a, phase: Math.random() * 10, speed: 0.4 + Math.random() * 0.7 };
      this.group.add(s);
      this.flares.push(s);
    }

    const label = makeLabel('ดวงอาทิตย์', '(The Sun)', 'obj-label sun-label', () => this.onPick(SUN.id));
    label.position.set(0, SUN.radius + 2.2, 0);
    sun.add(label);
    this.labels.push(label);
  }

  _buildLight() {
    const sunLight = new THREE.PointLight(0xfff2dd, 2600, 0, 1.9);
    sunLight.position.set(0, 0, 0);
    this.group.add(sunLight);
    this.group.add(new THREE.AmbientLight(0x223344, 1.1));
  }

  /* ── ดาวเคราะห์ทั้ง 8 + ดาวเคราะห์แคระ ────────────────── */
  _buildPlanets() {
    const all = [...PLANETS, ...DWARF_PLANETS];
    all.forEach((p, idx) => {
      const seed = 100 + idx * 17;
      let material, extras = {};

      if (p.tex.kind === 'earth') {
        const { map, bumpMap, specularMap } = earthTextures(seed);
        material = new THREE.MeshPhongMaterial({
          map, bumpMap, bumpScale: 3.2, specularMap,
          specular: new THREE.Color(0x668899), shininess: 22,
        });
      } else if (p.tex.kind === 'venus') {
        material = new THREE.MeshPhongMaterial({ map: venusTexture(seed), shininess: 4 });
      } else if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(p.tex.kind)) {
        material = new THREE.MeshPhongMaterial({ map: gasGiantTexture(seed, p.tex.kind), shininess: 6 });
      } else {
        material = new THREE.MeshPhongMaterial({
          map: rockyTexture(seed, p.tex.base, p.tex.craters || 100, p.id === 'mars'),
          shininess: 2,
        });
      }

      const pivot = new THREE.Group();               // หมุน = โคจร
      const tiltGroup = new THREE.Group();           // แกนเอียง
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 64, 32), material);
      mesh.userData.info = p;
      tiltGroup.rotation.z = THREE.MathUtils.degToRad(p.tilt || 0);
      tiltGroup.add(mesh);

      const holder = new THREE.Group();              // ตำแหน่งบนวงโคจร
      holder.add(tiltGroup);
      pivot.add(holder);
      if (p.inclineDeg) pivot.rotation.x = THREE.MathUtils.degToRad(p.inclineDeg);
      this.group.add(pivot);

      // วงแหวน
      if (p.rings) {
        const inner = p.radius * p.rings.inner, outer = p.radius * p.rings.outer;
        const ringGeo = new THREE.RingGeometry(inner, outer, 192, 1);
        // remap UV: u = รัศมี เพื่อให้แถบวงแหวนถูกทิศ
        const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v3.fromBufferAttribute(pos, i);
          uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5);
        }
        const ringMat = new THREE.MeshBasicMaterial({
          map: ringTexture(seed + 5, !!p.rings.faint),
          side: THREE.DoubleSide, transparent: true, depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        tiltGroup.add(ring);
        // เงาจาง ๆ ใต้วงแหวน (แสงสะท้อน)
        const glow = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({
          map: ringMat.map, side: THREE.DoubleSide, transparent: true,
          opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = -0.02;
        tiltGroup.add(glow);
      }

      // โลก: เมฆ + ชั้นบรรยากาศ + ดวงจันทร์
      if (p.id === 'earth') {
        const clouds = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius * 1.018, 64, 32),
          new THREE.MeshPhongMaterial({ map: cloudTexture(seed + 9), transparent: true, depthWrite: false }),
        );
        tiltGroup.add(clouds);
        extras.clouds = clouds;

        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(p.radius * 1.07, 64, 32),
          new THREE.ShaderMaterial({
            transparent: true, side: THREE.BackSide,
            blending: THREE.AdditiveBlending, depthWrite: false,
            vertexShader: `varying vec3 vN; varying vec3 vV;
              void main(){ vN = normalize(normalMatrix * normal);
                vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `varying vec3 vN; varying vec3 vV;
              void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6);
                gl_FragColor = vec4(0.35, 0.62, 1.0, 1.0) * f * 1.4; }`,
          }),
        );
        tiltGroup.add(atmo);

        // ดวงจันทร์
        const moonMesh = new THREE.Mesh(
          new THREE.SphereGeometry(EARTH_MOON.radius, 32, 16),
          new THREE.MeshPhongMaterial({
            map: rockyTexture(seed + 21, ['#b8b8b4', '#8e8e8a', '#d2d2cf', '#6f6f6b'], 200),
            shininess: 1,
          }),
        );
        moonMesh.userData.info = EARTH_MOON;
        const moonPivot = new THREE.Group();
        moonPivot.rotation.x = THREE.MathUtils.degToRad(5);
        moonPivot.add(moonMesh);
        moonMesh.position.set(EARTH_MOON.dist, 0, 0);
        holder.add(moonPivot);
        extras.moonPivot = moonPivot;
        this.pickables.push(moonMesh);

        const mlabel = makeLabel('ดวงจันทร์', '(Moon)', 'obj-label', () => this.onPick(EARTH_MOON.id));
        mlabel.position.set(0, EARTH_MOON.radius + 0.5, 0);
        moonMesh.add(mlabel);
        this.labels.push(mlabel);
        this.bodies.push({ info: EARTH_MOON, mesh: moonMesh, isMoon: true });
        // หมุนโลกตามเวลาจริง (ประมาณตำแหน่งเที่ยงวันที่ลองจิจูดดวงอาทิตย์)
        const now = new Date();
        const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
        mesh.rotation.y = ((utcHours / 24) * Math.PI * 2) + Math.PI;
      }

      // ดวงจันทร์กาลิเลียนของดาวพฤหัสบดี + ไททันของดาวเสาร์ (จุดเล็ก ๆ)
      if (p.id === 'jupiter' || p.id === 'saturn') {
        const moons = p.id === 'jupiter'
          ? [[1.45, 0.09], [1.8, 0.08], [2.2, 0.13], [2.7, 0.12]]
          : [[3.1, 0.13]];
        extras.miniMoons = moons.map(([dm, rm], k) => {
          const piv = new THREE.Group();
          const mm = new THREE.Mesh(
            new THREE.SphereGeometry(rm, 12, 8),
            new THREE.MeshPhongMaterial({ color: 0xbfb9ae }),
          );
          mm.position.set(p.radius * dm, 0, 0);
          piv.add(mm);
          piv.rotation.y = k * 1.7;
          holder.add(piv);
          return { piv, speed: 0.7 / (k + 1) };
        });
      }

      // เส้นวงโคจรเรืองแสง
      const orbit = orbitLine(p.dist, p.eccentric || 0, p.inclineDeg || 0,
        256, ORBIT_COLOR, p.type === 'dwarf' ? 0.18 : 0.34);
      this.group.add(orbit);
      this.orbits.push(orbit);

      // ป้ายชื่อไทย (อังกฤษในวงเล็บ)
      const label = makeLabel(p.nameTh, `(${p.nameEn.split(' ')[0]})`, 'obj-label', () => this.onPick(p.id));
      label.position.set(0, p.radius + (p.rings ? p.radius * 0.6 : 0) + 0.9, 0);
      holder.add(label);
      this.labels.push(label);

      this.pickables.push(mesh);
      const phase = (idx * 2.39996) % (Math.PI * 2); // golden angle กระจายตำแหน่งเริ่มต้น
      this.bodies.push({
        info: p, pivot, holder, mesh, extras, phase,
        a: p.dist, e: p.eccentric || 0,
        rotSpeed: (1 / Math.abs(p.rotation || 1)) * Math.sign(p.rotation || 1),
      });
    });
  }

  /* ── แถบดาวเคราะห์น้อย ─────────────────────────────────── */
  _buildAsteroidBelt() {
    const COUNT = 1700;
    const geo = new THREE.DodecahedronGeometry(0.11, 0);
    const mat = new THREE.MeshPhongMaterial({ color: 0x8d8273, flatShading: true });
    this.beltInner = new THREE.InstancedMesh(geo, mat, COUNT);
    const dummy = new THREE.Object3D();
    const rand = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < COUNT; i++) {
      const r = rand(34.5, 41.5);
      const th = Math.random() * Math.PI * 2;
      dummy.position.set(Math.cos(th) * r, rand(-0.9, 0.9), Math.sin(th) * r);
      dummy.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      dummy.scale.setScalar(rand(0.3, 1.8));
      dummy.updateMatrix();
      this.beltInner.setMatrixAt(i, dummy.matrix);
    }
    this.beltGroup = new THREE.Group();
    this.beltGroup.add(this.beltInner);
    this.group.add(this.beltGroup);

    // วัตถุใส ๆ ครอบแถบไว้สำหรับคลิก
    const beltPick = new THREE.Mesh(
      new THREE.TorusGeometry(38, 3.4, 8, 64),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    beltPick.rotation.x = Math.PI / 2;
    beltPick.userData.info = null; // set in main via ASTEROID_BELT_INFO
    this.beltPick = beltPick;
    this.group.add(beltPick);

    const label = makeLabel('แถบดาวเคราะห์น้อย', '(Asteroid Belt)', 'obj-label', () => this.onPick('belt'));
    label.position.set(0, 1.6, -38);
    this.group.add(label);
    this.labels.push(label);
  }

  /* ── ดาวหางฮัลเลย์ ─────────────────────────────────────── */
  _buildComet() {
    const a = (COMET.perihelion + COMET.aphelion) / 2;
    const e = (COMET.aphelion - COMET.perihelion) / (COMET.aphelion + COMET.perihelion);
    this.cometParams = { a, e, angle: 2.2 };

    const head = new THREE.Group();
    const nucleus = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 1),
      new THREE.MeshPhongMaterial({ color: 0xd8e8f0, flatShading: true }),
    );
    nucleus.userData.info = COMET;
    head.add(nucleus);
    const coma = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSprite('rgba(200,235,255,0.95)', 'rgba(120,180,255,0)'),
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    coma.scale.setScalar(2.2);
    head.add(coma);

    // หางดาวหาง — particle ชี้หนีดวงอาทิตย์
    const TAIL = 420;
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAIL * 3), 3));
    const tailMat = new THREE.PointsMaterial({
      color: 0xaaddff, size: 0.5, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.cometTail = new THREE.Points(tailGeo, tailMat);
    this.cometSeeds = Array.from({ length: TAIL }, () => [Math.random(), Math.random(), Math.random()]);
    this.group.add(this.cometTail);

    const orbit = orbitLine(a, e, COMET.inclineDeg, 512, 0x9fc8ff, 0.14);
    this.group.add(orbit);
    this.orbits.push(orbit);

    const label = makeLabel('ดาวหางฮัลเลย์', '(Halley)', 'obj-label', () => this.onPick(COMET.id));
    label.position.set(0, 1.2, 0);
    head.add(label);
    this.labels.push(label);

    this.cometHead = head;
    this.cometOrbitGroup = new THREE.Group();
    this.cometOrbitGroup.rotation.x = THREE.MathUtils.degToRad(COMET.inclineDeg);
    this.cometOrbitGroup.add(head);
    this.group.add(this.cometOrbitGroup);
    this.pickables.push(nucleus);
    this.bodies.push({ info: COMET, mesh: nucleus, isComet: true });
  }

  /* ── อัปเดตทุกเฟรม ─────────────────────────────────────── */
  update(dt, daysPerSec) {
    this.elapsed += dt;
    this.simDays += dt * daysPerSec;
    const t = this.simDays;
    this.sunUniforms.uTime.value = this.elapsed;

    // ดาวเคราะห์โคจร + หมุนรอบตัวเอง
    for (const b of this.bodies) {
      if (b.isMoon || b.isComet || !b.pivot) continue;
      const p = b.info;
      const th = b.phase + (t / p.period) * Math.PI * 2;
      const r = b.a * (1 - b.e * b.e) / (1 + b.e * Math.cos(th));
      b.holder.position.set(Math.cos(th) * r, 0, Math.sin(th) * r);
      // หมุนรอบตัวเองตามคาบจริง (rotSpeed = รอบ/วันจำลอง)
      b.mesh.rotation.y += dt * daysPerSec * b.rotSpeed * Math.PI * 2;
      if (b.extras.clouds) b.extras.clouds.rotation.y += dt * daysPerSec * Math.PI * 2 * 1.12; // เมฆไหลเร็วกว่าพื้นเล็กน้อย
      if (b.extras.moonPivot) b.extras.moonPivot.rotation.y = (t / EARTH_MOON.period) * Math.PI * 2;
      if (b.extras.miniMoons) b.extras.miniMoons.forEach((m) => { m.piv.rotation.y += dt * daysPerSec * m.speed * 4; });
    }

    // แถบดาวเคราะห์น้อย (คาบเฉลี่ย ~4.6 ปีของซีรีส)
    this.beltGroup.rotation.y += dt * daysPerSec * (Math.PI * 2 / 1680);

    // ดาวหาง — กวาดมุมเร็วใกล้ดวงอาทิตย์ ช้าไกลออกไป (กฎข้อ 2 ของเคปเลอร์)
    const cp = this.cometParams;
    {
      const rNow = this._cometR();
      const L = Math.PI * 2 * cp.a * cp.a * Math.sqrt(1 - cp.e * cp.e) / COMET.period;
      cp.angle += dt * daysPerSec * L / (rNow * rNow);
    }
    const r = this._cometR();
    const pos = new THREE.Vector3(Math.cos(cp.angle) * r, 0, Math.sin(cp.angle) * r);
    this.cometHead.position.copy(pos);

    // หาง: ชี้หนีดวงอาทิตย์ ยาวขึ้นเมื่อใกล้ดวงอาทิตย์
    const world = this.cometHead.getWorldPosition(new THREE.Vector3());
    const away = world.clone().normalize();
    const len = THREE.MathUtils.clamp(120 / world.length(), 1.5, 9);
    const posAttr = this.cometTail.geometry.attributes.position;
    for (let i = 0; i < this.cometSeeds.length; i++) {
      const [s1, s2, s3] = this.cometSeeds[i];
      const d = Math.pow(s1, 1.4) * len;
      const spread = 0.06 + d * 0.16;
      posAttr.setXYZ(i,
        world.x + away.x * d + (s2 - 0.5) * spread,
        world.y + away.y * d + (s3 - 0.5) * spread,
        world.z + away.z * d + (s2 + s3 - 1) * spread * 0.5);
    }
    posAttr.needsUpdate = true;

    // เปลวสุริยะกระเพื่อม
    for (const f of this.flares) {
      const u = f.userData;
      u.angle += dt * 0.05 * u.speed;
      const pulse = Math.max(0, Math.sin(this.elapsed * u.speed + u.phase));
      const rr = SUN.radius * (1.02 + pulse * 0.18);
      f.position.set(Math.cos(u.angle) * rr, Math.sin(u.angle * 0.7) * rr * 0.5, Math.sin(u.angle) * rr);
      f.material.opacity = pulse * 0.7;
      f.scale.setScalar(SUN.radius * (0.5 + pulse * 1.1));
    }
    // โคโรนาหายใจช้า ๆ
    this.corona[0].scale.setScalar(SUN.radius * (5.2 + Math.sin(this.elapsed * 0.6) * 0.25));
    this.corona[1].scale.setScalar(SUN.radius * (8.5 + Math.sin(this.elapsed * 0.4 + 2) * 0.5));
  }

  _cometR() {
    const { a, e, angle } = this.cometParams;
    return a * (1 - e * e) / (1 + e * Math.cos(angle));
  }

  /* ── ค้นหา object สำหรับโฟกัสกล้อง ─────────────────────── */
  getBodyWorldPosition(id, target) {
    if (id === 'sun') return target.set(0, 0, 0);
    if (id === 'belt') return target.set(0, 0, -38);
    const b = this.bodies.find((x) => x.info.id === id);
    if (b) return b.mesh.getWorldPosition(target);
    return target.set(0, 0, 0);
  }
  getBodyRadius(id) {
    if (id === 'sun') return SUN.radius;
    if (id === 'belt') return 6;
    const b = this.bodies.find((x) => x.info.id === id);
    return b ? (b.info.radius || 0.5) : 1;
  }

  setOrbitsVisible(v) { this.orbits.forEach((o) => { o.visible = v; }); }
  setLabelsVisible(v) { this.labels.forEach((l) => { l.visible = v; }); }
  setVisible(v) {
    this.group.visible = v;
    this.labels.forEach((l) => { l.visible = v; });
  }
}

/* ── ทุ่งดาวพื้นหลัง (ใช้ร่วมทั้งสองโหมด) ────────────────── */
export function buildStarfield(scene, radius = 1600) {
  const COUNT = 14000;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);
  const color = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    // กระจายบนทรงกลม
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = s * Math.cos(th) * radius;
    pos[i * 3 + 1] = u * radius;
    pos[i * 3 + 2] = s * Math.sin(th) * radius;
    const k = Math.random();
    if (k < 0.12) color.setHSL(0.07, 0.8, 0.75);       // ส้มแดง
    else if (k < 0.3) color.setHSL(0.12, 0.5, 0.85);   // เหลือง
    else if (k < 0.6) color.setHSL(0.6, 0.45, 0.85);   // ฟ้าขาว
    else color.setHSL(0, 0, 0.9);                       // ขาว
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    size[i] = Math.pow(Math.random(), 2.4) * 5.2 + 0.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aSize; varying vec3 vColor;
      void main(){ vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vColor;
      void main(){ vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float a = smoothstep(1.0, 0.2, d);
        gl_FragColor = vec4(vColor, a); }`,
    vertexColors: true,
  });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
  return stars;
}
