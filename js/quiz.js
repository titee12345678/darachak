/* ═══════════════════════════════════════════════════════════
   quiz.js — แบบทดสอบความรู้ดาราศาสตร์ 3 ระดับ
   ═══════════════════════════════════════════════════════════ */
import { QUIZ_BANK, QUIZ_COMMENTS, LEVEL_NAMES } from './data.js';

const $ = (id) => document.getElementById(id);
const N_QUESTIONS = 8;

export class Quiz {
  constructor(getLevel) {
    this.getLevel = getLevel;
    $('quiz-btn').addEventListener('click', () => this.open());
    $('quiz-close').addEventListener('click', () => this.close());
    $('quiz-go').addEventListener('click', () => this.start());
    $('quiz-again').addEventListener('click', () => this.start());
    $('quiz-next').addEventListener('click', () => this.next());
    $('quiz-modal').addEventListener('click', (e) => {
      if (e.target === $('quiz-modal')) this.close();
    });
  }

  open() {
    $('quiz-level-name').textContent = LEVEL_NAMES[this.getLevel()];
    $('quiz-modal').classList.remove('hidden');
    $('quiz-start').classList.remove('hidden');
    $('quiz-play').classList.add('hidden');
    $('quiz-end').classList.add('hidden');
  }
  close() { $('quiz-modal').classList.add('hidden'); }

  start() {
    const bank = QUIZ_BANK[this.getLevel()];
    this.questions = [...bank].sort(() => Math.random() - 0.5).slice(0, N_QUESTIONS);
    this.index = 0;
    this.score = 0;
    $('quiz-start').classList.add('hidden');
    $('quiz-end').classList.add('hidden');
    $('quiz-play').classList.remove('hidden');
    this.render();
  }

  render() {
    const q = this.questions[this.index];
    $('quiz-counter').textContent = `ข้อ ${this.index + 1} / ${this.questions.length}`;
    $('quiz-prog-fill').style.width = `${(this.index / this.questions.length) * 100}%`;
    $('quiz-q').textContent = q.q;
    $('quiz-feedback').textContent = '';
    $('quiz-feedback').className = '';
    $('quiz-next').classList.add('hidden');
    const box = $('quiz-choices');
    box.innerHTML = '';
    // สลับลำดับตัวเลือก
    const order = q.c.map((_, i) => i).sort(() => Math.random() - 0.5);
    order.forEach((ci) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-choice';
      btn.textContent = q.c[ci];
      btn.addEventListener('click', () => this.answer(ci, btn));
      box.appendChild(btn);
    });
    this._order = order;
  }

  answer(ci, btn) {
    const q = this.questions[this.index];
    const buttons = [...document.querySelectorAll('.quiz-choice')];
    buttons.forEach((b) => { b.disabled = true; });
    const correctBtn = buttons[this._order.indexOf(q.a)];
    correctBtn.classList.add('correct');
    const fb = $('quiz-feedback');
    if (ci === q.a) {
      this.score++;
      fb.textContent = `ถูกต้อง! ${q.x}`;
      fb.className = 'good';
    } else {
      btn.classList.add('wrong');
      fb.textContent = `ยังไม่ใช่นะ — ${q.x}`;
      fb.className = 'bad';
    }
    $('quiz-next').classList.remove('hidden');
    $('quiz-next').textContent = this.index === this.questions.length - 1 ? 'ดูผลคะแนน ▸' : 'ข้อต่อไป ▸';
  }

  next() {
    this.index++;
    if (this.index >= this.questions.length) { this.finish(); return; }
    this.render();
  }

  finish() {
    $('quiz-play').classList.add('hidden');
    $('quiz-end').classList.remove('hidden');
    const ratio = this.score / this.questions.length;
    const comment = [...QUIZ_COMMENTS].reverse().find((c) => ratio >= c.min) || QUIZ_COMMENTS[0];
    $('quiz-medal').textContent = comment.medal;
    $('quiz-score').textContent = `ได้ ${this.score} จาก ${this.questions.length} คะแนน`;
    $('quiz-comment').textContent = comment.text;
    $('quiz-prog-fill').style.width = '100%';
  }
}
