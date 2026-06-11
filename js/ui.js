/* ═══════════════════════════════════════════════════════════
   ui.js — แผง Hologram ข้อมูล · เสียงบรรยายไทย · ลิ้นชักรายชื่อ
   ═══════════════════════════════════════════════════════════ */
import {
  SUN, PLANETS, DWARF_PLANETS, COMET, EARTH_MOON, ASTEROID_BELT_INFO,
  CONSTELLATIONS, BRIGHT_STARS, DSOS,
} from './data.js';

const $ = (id) => document.getElementById(id);

/* ไอคอนแผงข้อมูล: ใช้ภาพพื้นผิวจริงของดาวแต่ละดวง */
const GLYPH_TEX = {
  sun: '2k_sun.jpg', mercury: '2k_mercury.jpg', venus: '2k_venus_atmosphere.jpg',
  earth: '2k_earth_daymap.jpg', mars: '2k_mars.jpg', jupiter: '2k_jupiter.jpg',
  saturn: '2k_saturn.jpg', uranus: '2k_uranus.jpg', neptune: '2k_neptune.jpg',
  moon: '2k_moon.jpg', ceres: '2k_ceres_fictional.jpg',
};
/* จุดที่ครอปจากแผนที่ (โลกเลือกฝั่งเอเชีย มองเห็นประเทศไทย) */
const GLYPH_POS = { earth: '74% 42%', jupiter: '64% 55%', mars: '20% 50%' };

/* รวม object ทุกชนิดเข้า registry เดียว ค้นด้วย id */
export const REGISTRY = new Map();
[SUN, ...PLANETS, ...DWARF_PLANETS, COMET, EARTH_MOON, ASTEROID_BELT_INFO].forEach((o) => REGISTRY.set(o.id, { ...o, world: 'solar' }));
CONSTELLATIONS.forEach((c) => REGISTRY.set(c.id, { ...c, world: 'sky', kind: 'constellation' }));
BRIGHT_STARS.forEach((s) => REGISTRY.set(s.id, { ...s, world: 'sky', kind: 'star' }));
DSOS.forEach((d) => REGISTRY.set(d.id, { ...d, world: 'sky', kind: 'dso' }));

export class UI {
  constructor() {
    this.level = 'kid';
    this.mode = 'solar';
    this.currentId = null;
    this.onFocus = null;       // ตั้งจาก main
    this.speaking = false;
    $('holo-close').addEventListener('click', () => this.hideInfo());
    $('holo-handle').addEventListener('click', () => $('holo').classList.toggle('collapsed'));
    $('speak-btn').addEventListener('click', () => this.toggleSpeak());
    $('focus-btn').addEventListener('click', () => {
      if (this.currentId && this.onFocus) this.onFocus(this.currentId);
    });
  }

  setLevel(level) {
    this.level = level;
    if (this.currentId) this.showInfo(this.currentId); // รีเฟรชเนื้อหา
  }

  /* ── แผงข้อมูล Hologram ────────────────────────────────── */
  showInfo(id) {
    const o = REGISTRY.get(id);
    if (!o) return;
    this.currentId = id;
    this.stopSpeak();

    $('holo-name').textContent = o.nameTh;
    $('holo-en').textContent = o.nameEn;
    $('holo-read').textContent = o.read || '';

    // ไอคอนดาว: ภาพพื้นผิวจริง (ถ้ามี) + แสงเงาทรงกลม / สำรองเป็นไล่สี
    const glyph = $('holo-glyph');
    const tex = GLYPH_TEX[id];
    if (tex) {
      glyph.style.background =
        `radial-gradient(circle at 32% 28%, rgba(255,255,255,.22), rgba(255,255,255,0) 48%),
         url('textures/${tex}')`;
      glyph.style.backgroundSize = 'cover, auto 112%';
      glyph.style.backgroundPosition = `center, ${GLYPH_POS[id] || '32% 50%'}`;
      glyph.classList.add('real');
    } else {
      const col = o.color || '#9fd8ff';
      glyph.style.background = `radial-gradient(circle at 33% 33%, #ffffff, ${col} 55%, #0a0a14 130%)`;
      glyph.style.backgroundSize = '';
      glyph.style.backgroundPosition = '';
      glyph.classList.remove('real');
    }
    glyph.classList.toggle('ringed', !!o.rings);

    // สถิติ: โหมดเด็กตัดเหลือ 4 แถวแรก / โหมดอื่นแสดงครบ
    let rows = [];
    if (o.kind === 'constellation') {
      rows = [
        ['ฤดูกาลที่เห็นได้', o.season],
        ['ทิศทางการสังเกต', o.direction],
        ['จำนวนดาวหลัก', `<b>${o.stars.length}</b> ดวง`],
      ];
    } else if (o.stats) {
      rows = o.stats.slice();
    }
    if (this.level === 'kid') rows = rows.slice(0, 4);
    $('holo-stats').innerHTML = rows
      .map(([k, v2]) => `<div class="row"><dt>${k}</dt><dd>${v2}</dd></div>`)
      .join('');

    // เกร็ดความรู้ตามระดับ
    let fact = o.fact || o.info || '';
    if (this.level === 'kid' && o.factKid) fact = o.factKid;
    if (o.kind === 'constellation') fact = o.info;
    $('holo-fact-text').textContent = fact;

    // ข้อมูลเสริม (ตำนาน / โหมดผู้เชี่ยวชาญ)
    const extra = $('holo-extra');
    if (o.kind === 'constellation' && this.level !== 'kid') {
      $('holo-extra-title').textContent = 'ประวัติและตำนาน';
      $('holo-extra-text').textContent = o.legend;
      extra.classList.remove('hidden');
    } else if (o.kind === 'constellation' && this.level === 'kid') {
      $('holo-extra-title').textContent = 'นิทานดวงดาว';
      $('holo-extra-text').textContent = o.legend.split(' ').slice(0, 28).join(' ') + '…';
      extra.classList.remove('hidden');
    } else {
      extra.classList.add('hidden');
    }

    // ปุ่มบินไปดู เฉพาะวัตถุในระบบสุริยะ และเฉพาะตอนอยู่โหมดระบบสุริยะ
    $('focus-btn').style.display = (o.world === 'solar' && this.mode !== 'sky') ? '' : 'none';

    $('holo').classList.remove('hidden');
    $('holo').classList.remove('collapsed'); // เปิดวัตถุใหม่ → กางแผงเสมอ
  }

  hideInfo() {
    $('holo').classList.add('hidden');
    this.currentId = null;
    this.stopSpeak();
    if (this.onDeselect) this.onDeselect();
  }

  /* ── เสียงบรรยายภาษาไทย (Web Speech API) ──────────────── */
  toggleSpeak() {
    if (this.speaking) { this.stopSpeak(); return; }
    const o = REGISTRY.get(this.currentId);
    if (!o) return;
    let text = `${o.nameTh}. `;
    text += o.speech || o.fact || o.info || '';
    if (o.kind === 'constellation') text += ` มองเห็นได้ใน${o.season} ทาง${o.direction}`;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'th-TH';
    utter.rate = 0.95;
    const thai = speechSynthesis.getVoices().find((v) => v.lang.startsWith('th'));
    if (thai) utter.voice = thai;
    utter.onend = () => { this.speaking = false; $('speak-btn').classList.remove('speaking'); };
    utter.onerror = utter.onend;
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
    this.speaking = true;
    $('speak-btn').classList.add('speaking');
  }
  stopSpeak() {
    speechSynthesis.cancel();
    this.speaking = false;
    $('speak-btn').classList.remove('speaking');
  }

  /* ── ลิ้นชักรายชื่อวัตถุ ───────────────────────────────── */
  fillDrawer(mode, onSelect) {
    const list = $('drawer-list');
    $('drawer-title').textContent = mode === 'solar' ? 'วัตถุในระบบสุริยะ' : 'วัตถุบนท้องฟ้า';
    list.innerHTML = '';
    const add = (o, sub) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="color:${o.color || '#9fd8ff'};background:${o.color || '#9fd8ff'}"></span>
        ${o.nameTh} <small>${sub || ''}</small>`;
      li.addEventListener('click', () => onSelect(o.id));
      list.appendChild(li);
    };
    const group = (t) => {
      const li = document.createElement('li');
      li.className = 'group';
      li.textContent = t;
      list.appendChild(li);
    };
    if (mode === 'solar') {
      group('ดาวฤกษ์');
      add(REGISTRY.get('sun'));
      group('ดาวเคราะห์ 8 ดวง');
      PLANETS.forEach((p) => add(p));
      group('อื่น ๆ');
      add(REGISTRY.get('moon'));
      add(REGISTRY.get('belt'));
      DWARF_PLANETS.forEach((p) => add(p, 'แคระ'));
      add(REGISTRY.get('comet'));
    } else {
      group('หมู่ดาว');
      CONSTELLATIONS.forEach((c) => add({ ...c, color: '#ffe9b8' }));
      group('ดาวฤกษ์สำคัญ');
      BRIGHT_STARS.forEach((s) => add(s));
      group('วัตถุท้องฟ้าลึก');
      DSOS.forEach((d) => add(d));
    }
  }

  toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }
}
