/* ═══════════════════════════════════════════════════════════
   tour.js — ทัวร์นำชมระบบสุริยะอัตโนมัติ พร้อมเสียงบรรยายไทย
   สำหรับครูเปิดฉายหน้าชั้นเรียน — บินไล่ทีละดวง เลื่อนเองทุกจุด
   ═══════════════════════════════════════════════════════════ */
import { REGISTRY } from './ui.js';

const $ = (id) => document.getElementById(id);

const STOPS = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune'];
const MIN_SECONDS = 16; // เวลาขั้นต่ำต่อจุด (เผื่อเครื่องไม่มีเสียงไทย)

export class Tour {
  constructor({ onVisit, onEnd }) {
    this.onVisit = onVisit;   // (id) => บินไป + เปิดแผงข้อมูล
    this.onEnd = onEnd;       // จบทัวร์ → กลับภาพรวม
    this.index = -1;
    this.active = false;
    this._timer = null;

    $('tour-next').addEventListener('click', () => this.next());
    $('tour-prev').addEventListener('click', () => this.prev());
    $('tour-stop').addEventListener('click', () => this.stop());
  }

  start() {
    this.active = true;
    this.index = -1;
    $('tour-bar').classList.remove('hidden');
    this.next();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this._timer);
    speechSynthesis.cancel();
    $('tour-bar').classList.add('hidden');
    if (this.onEnd) this.onEnd();
  }

  next() { this._go(this.index + 1); }
  prev() { this._go(Math.max(0, this.index - 1)); }

  _go(i) {
    if (!this.active) return;
    clearTimeout(this._timer);
    speechSynthesis.cancel();
    if (i >= STOPS.length) { this.stop(); return; }
    this.index = i;
    const id = STOPS[i];
    const o = REGISTRY.get(id);
    $('tour-counter').textContent = `จุดที่ ${i + 1}/${STOPS.length}`;
    $('tour-name').textContent = o.nameTh;
    this.onVisit(id);

    // บรรยายเสียงไทย แล้วไปจุดถัดไปเมื่อพูดจบ (อย่างน้อย MIN_SECONDS วินาที)
    const started = Date.now();
    const advance = () => {
      if (!this.active || this.index !== i) return;
      const waitMore = Math.max(0, MIN_SECONDS * 1000 - (Date.now() - started));
      this._timer = setTimeout(() => {
        if (this.active && this.index === i) this.next();
      }, waitMore + 1800);
    };
    const text = `${o.nameTh}. ${o.speech || o.fact || ''}`;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'th-TH';
    utter.rate = 0.95;
    const thai = speechSynthesis.getVoices().find((v) => v.lang.startsWith('th'));
    if (thai) utter.voice = thai;
    utter.onend = advance;
    utter.onerror = advance;
    setTimeout(() => speechSynthesis.speak(utter), 1600); // รอกล้องบินถึงก่อน
    // กันกรณีเสียงไม่ทำงานเลย
    this._timer = setTimeout(() => {
      if (this.active && this.index === i && speechSynthesis.speaking === false) this.next();
    }, (MIN_SECONDS + 8) * 1000);
  }
}
