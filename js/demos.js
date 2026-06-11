/* ═══════════════════════════════════════════════════════════
   demos.js — โหมดสาธิตสำหรับครูวิทยาศาสตร์
   ① เฟสดวงจันทร์ (พร้อมจอ "มุมมองจากโลก")
   ② ฤดูกาลจากแกนเอียง 23.5°
   ③ สุริยุปราคา  ④ จันทรุปราคา  ⑤ เปรียบเทียบขนาดจริง
   หมายเหตุ: ฉากสาธิตจงใจขยายขนาด/ย่อระยะเพื่อความชัดเจนในการสอน
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THAI_SEASON = (m) => (m >= 2 && m <= 4) ? 'ฤดูร้อน' : (m >= 5 && m <= 9) ? 'ฤดูฝน' : 'ฤดูหนาว';

function label(text, cls = 'obj-label') {
  const div = document.createElement('div');
  div.className = cls;
  div.innerHTML = text;
  return new CSS2DObject(div);
}

export class Demos {
  constructor(scene, camera, controls) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.active = null;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    const tl = new THREE.TextureLoader();
    this.tex = {};
    for (const [k, f] of Object.entries({
      earth: '2k_earth_daymap.jpg', moon: '2k_moon.jpg', sun: '2k_sun.jpg',
      mercury: '2k_mercury.jpg', venus: '2k_venus_atmosphere.jpg', mars: '2k_mars.jpg',
      jupiter: '2k_jupiter.jpg', saturn: '2k_saturn.jpg', uranus: '2k_uranus.jpg',
      neptune: '2k_neptune.jpg', ring: '2k_saturn_ring_alpha.png',
    })) {
      this.tex[k] = tl.load(`textures/${f}`);
      this.tex[k].colorSpace = THREE.SRGBColorSpace;
    }

    this._buildOrbital();
    this._buildCompare();
    this._syncLabels(); // ซ่อนป้ายสาธิตทั้งหมดตั้งแต่เริ่ม (CSS2D ไม่สนใจ group ที่ซ่อน)
  }

  /* ── ฉากโลก-ดวงจันทร์-ดวงอาทิตย์ (ใช้ร่วม 4 สาธิตแรก) ──── */
  _buildOrbital() {
    const g = new THREE.Group();
    this.orbital = g;
    this.group.add(g);

    // ดวงอาทิตย์ + แสง
    this.demoSun = new THREE.Mesh(
      new THREE.SphereGeometry(6, 48, 24),
      new THREE.MeshBasicMaterial({ map: this.tex.sun, color: 0xffddaa }),
    );
    this.sunLabel = label('ดวงอาทิตย์ ☀', 'obj-label sun-label');
    this.sunLabel.position.y = 8;
    this.demoSun.add(this.sunLabel);
    g.add(this.demoSun);
    this.demoLight = new THREE.PointLight(0xffffff, 4000, 0, 1.6);
    g.add(this.demoLight, new THREE.AmbientLight(0x404048, 0.7));

    // โลก + แกนหมุน + เส้นศูนย์สูตร
    this.demoEarthGroup = new THREE.Group();
    this.demoEarth = new THREE.Mesh(
      new THREE.SphereGeometry(3, 64, 32),
      new THREE.MeshPhongMaterial({ map: this.tex.earth, shininess: 8 }),
    );
    this.demoEarthGroup.add(this.demoEarth);
    const axis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 9.5, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5566 }),
    );
    this.demoEarthGroup.add(axis);
    const npole = label('ขั้วเหนือ N', 'star-label');
    npole.position.y = 5.4;
    this.demoEarthGroup.add(npole);
    const eq = new THREE.Mesh(
      new THREE.TorusGeometry(3.05, 0.035, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.7 }),
    );
    eq.rotation.x = Math.PI / 2;
    this.demoEarthGroup.add(eq);
    this.earthLabel = label('โลก 🌏');
    this.earthLabel.position.y = 4.6;
    this.demoEarthGroup.add(this.earthLabel);
    g.add(this.demoEarthGroup);

    // ดวงจันทร์ + วงโคจร
    this.demoMoonMat = new THREE.MeshPhongMaterial({ map: this.tex.moon, shininess: 2 });
    this.demoMoon = new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 24), this.demoMoonMat);
    this.moonLabel = label('ดวงจันทร์ 🌙');
    this.moonLabel.position.y = 1.7;
    this.demoMoon.add(this.moonLabel);
    g.add(this.demoMoon);

    const orbitPts = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      orbitPts.push(new THREE.Vector3(Math.cos(a) * 10, 0, Math.sin(a) * 10));
    }
    this.moonOrbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(orbitPts),
      new THREE.LineBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.35 }),
    );
    g.add(this.moonOrbit);

    // วงโคจรโลกรอบดวงอาทิตย์ (สาธิตฤดูกาล)
    const ePts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      ePts.push(new THREE.Vector3(Math.cos(a) * 35, 0, Math.sin(a) * 35));
    }
    this.earthOrbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ePts),
      new THREE.LineBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.3 }),
    );
    g.add(this.earthOrbit);

    // กรวยเงา (อุปราคา)
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x05050a, transparent: true, opacity: 0.42,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.earthShadow = new THREE.Mesh(new THREE.ConeGeometry(2.95, 26, 32, 1, true), shadowMat);
    this.earthShadow.rotation.z = -Math.PI / 2; // ชี้ +X (หนีดวงอาทิตย์)
    this.moonShadow = new THREE.Mesh(new THREE.ConeGeometry(0.83, 14, 32, 1, true), shadowMat.clone());
    this.moonShadow.rotation.z = -Math.PI / 2;
    g.add(this.earthShadow, this.moonShadow);

    // ป้ายบอกตำแหน่งเฟสสำคัญ 4 จุดรอบวงโคจร (สาธิตเฟส)
    this.phaseMarks = new THREE.Group();
    [['🌑 เดือนมืด', -10, 0], ['🌓 ขึ้น 7-8 ค่ำ', 0, 10],
      ['🌕 จันทร์เต็มดวง', 10, 0], ['🌗 แรม 7-8 ค่ำ', 0, -10]].forEach(([t, x, z]) => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb454 }),
      );
      dot.position.set(x * 1.18, 0, z * 1.18);
      const l = label(t, 'star-label');
      l.position.y = 0.7;
      dot.add(l);
      this.phaseMarks.add(dot);
    });
    g.add(this.phaseMarks);

    // เส้นแนวเรียงตรง ดวงอาทิตย์-โลก (สาธิตอุปราคา)
    this.alignLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-65, 0, 0), new THREE.Vector3(30, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.3 }),
    );
    g.add(this.alignLine);

    // ป้ายฤดูสำคัญบนวงโคจร (สาธิตฤดูกาล)
    this.seasonMarks = new THREE.Group();
    [['มิ.ย. ครีษมายัน — เหนือร้อนสุด', -35, 0], ['ธ.ค. เหมายัน — เหนือหนาวสุด', 35, 0],
      ['มี.ค. วสันตวิษุวัต — กลางวัน=กลางคืน', 0, 35], ['ก.ย. ศารทวิษุวัต — กลางวัน=กลางคืน', 0, -35]]
      .forEach(([t, x, z]) => {
        const l = label(t, 'star-label');
        l.position.set(x * 1.12, 1.5, z * 1.12);
        this.seasonMarks.add(l);
      });
    g.add(this.seasonMarks);

    // กล้องจอเล็ก "มุมมองที่เห็นจริง"
    this.insetCamera = new THREE.PerspectiveCamera(10, 1, 0.3, 300);
  }

  /* ── ฉากเปรียบเทียบขนาดจริง ─────────────────────────────── */
  _buildCompare() {
    const g = new THREE.Group();
    this.compare = g;
    this.group.add(g);
    // รัศมีจริงเทียบโลก = 1
    const defs = [
      ['sun', 'ดวงอาทิตย์', 109, 0xffcc88],
      ['mercury', 'ดาวพุธ', 0.38],
      ['venus', 'ดาวศุกร์', 0.95],
      ['earth', 'โลก', 1.0],
      ['mars', 'ดาวอังคาร', 0.53],
      ['jupiter', 'ดาวพฤหัสบดี', 11.2],
      ['saturn', 'ดาวเสาร์', 9.45],
      ['uranus', 'ดาวยูเรนัส', 4.0],
      ['neptune', 'ดาวเนปจูน', 3.88],
    ];
    let x = 0;
    defs.forEach(([key, name, r], i) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 64, 32),
        new THREE.MeshBasicMaterial({ map: this.tex[key] }),
      );
      if (key === 'sun') {
        // ดวงอาทิตย์ใหญ่เกินจอ — วางให้เห็นแค่ขอบโค้งด้านซ้าย
        mesh.position.set(-112, 0, 0);
        const l = label('ดวงอาทิตย์ — ใหญ่กว่าโลก 109 เท่า ☀', 'obj-label sun-label');
        l.position.set(106, 18, 0);
        mesh.add(l);
      } else {
        x += r + 2.2;
        mesh.position.set(x, 0, 0);
        x += r;
        const l = label(name);
        l.position.y = r + 1.6;
        mesh.add(l);
        if (key === 'saturn') {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(r * 1.25, r * 2.2, 96),
            new THREE.MeshBasicMaterial({
              map: this.tex.ring, side: THREE.DoubleSide, transparent: true, depthWrite: false,
            }),
          );
          ring.rotation.x = -Math.PI / 2.4;
          mesh.add(ring);
        }
      }
      g.add(mesh);
    });
    g.add(new THREE.AmbientLight(0xffffff, 1));
  }

  /* ── นิยามสาธิตแต่ละแบบ ─────────────────────────────────── */
  get defs() {
    return {
      phases: {
        title: '🌙 เฟสของดวงจันทร์ (ข้างขึ้น-ข้างแรม)',
        slider: { min: 0, max: 29.5, step: 0.1, value: 0, label: 'เลื่อนวันในเดือนจันทรคติ' },
        camera: [[0, 34, 8], [0, 0, 0]],
        inset: { label: '🔭 ดวงจันทร์ที่คนบนโลกเห็นจริง', view: 'moon-from-earth', fov: 10 },
        setup: () => {
          this.orbital.visible = true;
          this.compare.visible = false;
          this.demoSun.position.set(-60, 0, 0);
          this.demoLight.position.set(-60, 0, 0);
          this.demoEarthGroup.position.set(0, 0, 0);
          this.demoEarthGroup.rotation.z = 0;
          this.moonOrbit.visible = true;
          this.earthOrbit.visible = false;
          this.earthShadow.visible = false;
          this.moonShadow.visible = false;
          this.demoMoon.visible = true;
          this.phaseMarks.visible = true;
          this.alignLine.visible = false;
          this.seasonMarks.visible = false;
        },
        apply: (day) => {
          const a = (day / 29.53) * Math.PI * 2;
          // วันที่ 0 = เดือนมืด (ดวงจันทร์อยู่ฝั่งดวงอาทิตย์)
          this.demoMoon.position.set(-Math.cos(a) * 10, 0, Math.sin(a) * 10);
          this.demoMoon.rotation.y = -a; // หันหน้าเดิมเข้าโลกเสมอ
          const illum = (1 - Math.cos(a)) / 2;
          const waxing = day < 14.77;
          let name;
          if (illum < 0.03) name = 'เดือนมืด — ดวงจันทร์อยู่ระหว่างโลกกับดวงอาทิตย์ ด้านมืดหันหาเรา';
          else if (illum < 0.45) name = waxing ? 'จันทร์เสี้ยวข้างขึ้น — เห็นด้านสว่างเพิ่มขึ้นทุกคืน' : 'จันทร์เสี้ยวข้างแรม — ด้านสว่างหดลงทุกคืน';
          else if (illum < 0.55) name = waxing ? 'ขึ้น 7-8 ค่ำ — เห็นครึ่งดวง (First Quarter)' : 'แรม 7-8 ค่ำ — เห็นครึ่งดวง (Last Quarter)';
          else if (illum < 0.97) name = waxing ? 'ข้างขึ้นค่อนดวง' : 'ข้างแรมค่อนดวง';
          else name = 'จันทร์เต็มดวง — โลกอยู่กลาง แสงอาทิตย์ส่องเต็มหน้าดวงจันทร์';
          const dayThai = waxing ? `ขึ้น ${Math.min(15, Math.max(1, Math.round(day)))} ค่ำ` : `แรม ${Math.min(15, Math.max(1, Math.round(day - 14.77)))} ค่ำ`;
          return `วันที่ ${day.toFixed(1)} ของเดือนจันทรคติ (${dayThai}) · สว่าง ${Math.round(illum * 100)}%<br>${name}<br><b>สังเกตจอเล็กด้านล่าง: นี่คือดวงจันทร์ที่คนบนโลกเห็นจริง</b>`;
        },
      },

      seasons: {
        title: '🌏 ฤดูกาลเกิดจากแกนโลกเอียง 23.5°',
        slider: { min: 0, max: 11, step: 1, value: 5, label: 'เลื่อนเดือน' },
        camera: [[0, 30, 52], [0, 0, 0]],
        inset: { label: '🔭 โลกเมื่อมองจากดวงอาทิตย์ — ขั้วไหนรับแสง?', view: 'earth-from-sun', fov: 16 },
        setup: () => {
          this.orbital.visible = true;
          this.compare.visible = false;
          this.demoSun.position.set(0, 0, 0);
          this.demoLight.position.set(0, 0, 0);
          this.moonOrbit.visible = false;
          this.earthOrbit.visible = true;
          this.earthShadow.visible = false;
          this.moonShadow.visible = false;
          this.demoMoon.visible = false;
          this.phaseMarks.visible = false;
          this.alignLine.visible = false;
          this.seasonMarks.visible = true;
        },
        apply: (m) => {
          // มิถุนายน: โลกอยู่ฝั่งที่ขั้วเหนือ (เอียงไปทาง +X เสมอ) ชี้หาดวงอาทิตย์
          const th = ((m - 5) / 12) * Math.PI * 2 + Math.PI;
          this.demoEarthGroup.position.set(Math.cos(th) * 35, 0, Math.sin(th) * 35);
          this.demoEarthGroup.rotation.z = -23.5 * DEG; // แกนเอียงทิศคงที่ตลอดวงโคจร
          this.demoEarth.rotation.y += 0.02;
          const north = (m >= 3 && m <= 8) ? 'ขั้วเหนือเอียงหาดวงอาทิตย์ → ซีกโลกเหนือร้อน' : 'ขั้วเหนือเอียงหนีดวงอาทิตย์ → ซีกโลกเหนือหนาว';
          return `เดือน${THAI_MONTHS[m]} · ประเทศไทย: <b>${THAI_SEASON(m)}</b><br>${north}<br>สังเกต: แกนสีแดงชี้ทิศเดิมตลอดวงโคจร — ฤดูกาลจึงเกิดจาก "มุมตกกระทบของแสง" ไม่ใช่ระยะใกล้-ไกลดวงอาทิตย์`;
        },
      },

      'solar-eclipse': {
        title: '🌑 สุริยุปราคา — ดวงจันทร์บังดวงอาทิตย์',
        slider: { min: -16, max: 16, step: 0.2, value: -16, label: 'เลื่อนดวงจันทร์ผ่านแนวดวงอาทิตย์' },
        camera: [[6, 9, 24], [0, 0, 0]],
        inset: { label: '🔭 ดวงอาทิตย์ที่คนบนโลกเห็น — ค่อย ๆ ถูกบัง!', view: 'sun-from-earth', fov: 14 },
        setup: () => {
          this.orbital.visible = true;
          this.compare.visible = false;
          this.demoSun.position.set(-65, 0, 0);
          this.demoLight.position.set(-65, 0, 0);
          this.demoEarthGroup.position.set(0, 0, 0);
          this.demoEarthGroup.rotation.z = 0;
          this.moonOrbit.visible = false;
          this.earthOrbit.visible = false;
          this.earthShadow.visible = false;
          this.moonShadow.visible = true;
          this.demoMoon.visible = true;
          this.demoMoonMat.color.set(0xffffff);
          this.phaseMarks.visible = false;
          this.alignLine.visible = true;
          this.seasonMarks.visible = false;
        },
        apply: (deg) => {
          const a = deg * DEG;
          this.demoMoon.position.set(-Math.cos(a) * 9, 0, Math.sin(a) * 9);
          this.demoMoon.rotation.y = -a;
          this.moonShadow.position.copy(this.demoMoon.position).add(new THREE.Vector3(7, 0, 0));
          const align = Math.max(0, 1 - Math.abs(deg) / 4);
          this.moonShadow.material.opacity = 0.15 + align * 0.4;
          return Math.abs(deg) < 3
            ? '<b>เกิดสุริยุปราคา!</b> เงาดวงจันทร์ (กรวยมืด) ทอดลงบนผิวโลก — คนที่อยู่ในเงาเห็นดวงอาทิตย์ถูกบัง กลางวันมืดลงชั่วครู่<br>เกิดได้เฉพาะวัน "เดือนมืด" ที่ดวงอาทิตย์-ดวงจันทร์-โลก เรียงเป็นเส้นตรงพอดี'
            : 'ดวงจันทร์ยังไม่ตรงแนว — เดือนมืดส่วนใหญ่จึง "ไม่เกิด" สุริยุปราคา เพราะวงโคจรดวงจันทร์เอียง 5° เลื่อนสไลเดอร์ให้ดวงจันทร์เข้ากลางแนว';
        },
      },

      'lunar-eclipse': {
        title: '🔴 จันทรุปราคา — ดวงจันทร์เข้าไปในเงาโลก (ราหูอมจันทร์)',
        slider: { min: 164, max: 196, step: 0.2, value: 164, label: 'เลื่อนดวงจันทร์ผ่านเงาโลก' },
        camera: [[14, 10, 26], [6, 0, 0]],
        inset: { label: '🔭 ดวงจันทร์ที่คนบนโลกเห็น — กลายเป็นสีแดง!', view: 'moon-from-earth', fov: 16 },
        setup: () => {
          this.orbital.visible = true;
          this.compare.visible = false;
          this.demoSun.position.set(-65, 0, 0);
          this.demoLight.position.set(-65, 0, 0);
          this.demoEarthGroup.position.set(0, 0, 0);
          this.demoEarthGroup.rotation.z = 0;
          this.moonOrbit.visible = false;
          this.earthOrbit.visible = false;
          this.earthShadow.visible = true;
          this.earthShadow.position.set(13, 0, 0);
          this.moonShadow.visible = false;
          this.demoMoon.visible = true;
          this.phaseMarks.visible = false;
          this.alignLine.visible = true;
          this.seasonMarks.visible = false;
        },
        apply: (deg) => {
          const a = deg * DEG;
          this.demoMoon.position.set(-Math.cos(a) * 9, 0, Math.sin(a) * 9);
          const inside = Math.max(0, 1 - Math.abs(deg - 180) / 5);
          // ดวงจันทร์ในเงาโลกกลายเป็นสีแดงอิฐ (แสงหักเหผ่านบรรยากาศโลก)
          this.demoMoonMat.color.setRGB(1, 1 - inside * 0.62, 1 - inside * 0.75);
          return inside > 0.4
            ? '<b>เกิดจันทรุปราคา!</b> ดวงจันทร์เข้าไปในกรวยเงาของโลกและกลายเป็น <b>สีแดงอิฐ</b> — แสงอาทิตย์ที่หักเหผ่านบรรยากาศโลก (เหมือนแสงยามเย็น) ยังส่องไปถึง<br>คนไทยโบราณเรียกว่า "ราหูอมจันทร์" เกิดเฉพาะคืนจันทร์เต็มดวงที่เรียงแนวพอดี'
            : 'จันทร์เต็มดวงปกติ — ยังไม่เข้าเงาโลก เลื่อนสไลเดอร์ให้ดวงจันทร์เคลื่อนเข้ากรวยเงา';
        },
      },

      compare: {
        title: '⚖️ เปรียบเทียบขนาดจริงของดาว (โลก = 1)',
        slider: null,
        camera: [[26, 6, 86], [26, 0, 0]],
        setup: () => {
          this.orbital.visible = false;
          this.compare.visible = true;
        },
        apply: () => 'ทุกดวงย่อด้วยสัดส่วนเดียวกัน — ดวงอาทิตย์ใหญ่จนเห็นแค่ขอบโค้งซ้ายมือ (กว้างกว่าโลก 109 เท่า บรรจุโลกได้ 1.3 ล้านใบ)<br>ดาวพฤหัสบดีกว้างกว่าโลก 11 เท่า ขณะที่ดาวพุธเล็กกว่าโลกอีก · <b>ลากเพื่อเลื่อนชม ซูมดูโลกเล็ก ๆ ของเรา</b>',
      },
    };
  }

  /* CSS2D label ไม่สืบทอด visibility จาก parent group — ต้อง sync เอง */
  _syncLabels() {
    this.group.traverse((o) => {
      if (!o.isCSS2DObject) return;
      let v = this.group.visible;
      for (let p = o.parent; p && v; p = p.parent) {
        if (p.visible === false) v = false;
        if (p === this.group) break;
      }
      o.visible = v;
    });
  }

  /* ── เข้า/ออกสาธิต ──────────────────────────────────────── */
  enter(name) {
    const def = this.defs[name];
    if (!def) return;
    this.active = name;
    this._def = def;
    this.group.visible = true;
    def.setup();
    this._syncLabels();
    // กล้อง
    this.camera.position.set(...def.camera[0]);
    this.controls.target.set(...def.camera[1]);
    this.controls.enabled = true;
    this.controls.autoRotate = false;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 400;
    // แผงควบคุม
    $('demo-title').textContent = def.title;
    const slider = $('demo-slider');
    if (def.slider) {
      slider.style.display = '';
      $('demo-slider-label').style.display = '';
      $('demo-slider-label').textContent = def.slider.label;
      slider.min = def.slider.min; slider.max = def.slider.max;
      slider.step = def.slider.step; slider.value = def.slider.value;
      $('demo-caption').innerHTML = def.apply(+slider.value);
      slider.oninput = () => { $('demo-caption').innerHTML = def.apply(+slider.value); };
    } else {
      slider.style.display = 'none';
      $('demo-slider-label').style.display = 'none';
      $('demo-caption').innerHTML = def.apply();
    }
    $('demo-panel').classList.remove('hidden');
    $('inset-frame').classList.toggle('hidden', !def.inset);
    if (def.inset) $('inset-frame').querySelector('span').textContent = def.inset.label;
  }

  exit() {
    this.active = null;
    this.group.visible = false;
    this._syncLabels();
    $('demo-panel').classList.add('hidden');
    $('inset-frame').classList.add('hidden');
  }

  update(dt) {
    if (this.active === 'seasons') this.demoEarth.rotation.y += dt * 0.4;
    if (this.active === 'phases') this.demoEarth.rotation.y += dt * 0.15;
  }

  /* จอเล็ก "มุมมองที่คนบนโลกเห็นจริง" — ทุกสาธิต */
  renderInset(renderer) {
    const inset = this._def?.inset;
    if (!this.active || !inset) return;
    const w = renderer.domElement.clientWidth;
    const s = Math.min(190, Math.floor(w * 0.34));
    // จอกว้าง: มุมขวาล่าง (พ้นแผงสาธิต) / จอแคบ: ลอยเหนือแผงตรงกลาง
    let x, y;
    if (w > 780) { x = w - s - 16; y = 16; }
    else { x = Math.floor(w / 2 - s / 2); y = ($('demo-panel').offsetHeight || 170) + 30; }

    // จัดกล้องตามชนิดมุมมอง
    const cam = this.insetCamera;
    const earth = this.demoEarthGroup.position;
    if (inset.view === 'moon-from-earth') {
      // ยืนบนโลก มองดวงจันทร์
      const dir = this.demoMoon.position.clone().sub(earth).normalize();
      cam.position.copy(earth).addScaledVector(dir, 3.3);
      cam.lookAt(this.demoMoon.position);
    } else if (inset.view === 'sun-from-earth') {
      // ยืนบนโลก มองดวงอาทิตย์ (เห็นดวงจันทร์เคลื่อนผ่านหน้า)
      const dir = this.demoSun.position.clone().sub(earth).normalize();
      cam.position.copy(earth).addScaledVector(dir, 3.3);
      cam.lookAt(this.demoSun.position);
    } else { // earth-from-sun: มองโลกจากดวงอาทิตย์ เห็นขั้วที่รับแสง
      const dir = earth.clone().sub(this.demoSun.position).normalize();
      cam.position.copy(this.demoSun.position).addScaledVector(dir, 7.5);
      cam.lookAt(earth);
    }
    cam.fov = inset.fov || 10;
    cam.aspect = 1;
    cam.updateProjectionMatrix();
    const frame = $('inset-frame');
    frame.style.width = `${s}px`;
    frame.style.height = `${s}px`;
    frame.style.left = `${x}px`;
    frame.style.bottom = `${y}px`;
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, s, s);
    renderer.setViewport(x, y, s, s);
    renderer.render(this.scene, this.insetCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, renderer.domElement.clientHeight);
  }
}
