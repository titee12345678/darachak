/* ═══════════════════════════════════════════════════════════
   textures.js — โรงงานพื้นผิวดาวเคราะห์แบบ procedural
   ทุกพื้นผิวสร้างสดด้วย seeded noise — ไม่ต้องโหลดไฟล์ภาพ
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { ValueNoise, mulberry32, ramp, hexToRgb, lerpColor } from './noise.js';

const TEX_W = 1024, TEX_H = 512;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ── ดาวหิน (พุธ อังคาร ซีรีส พลูโต ดวงจันทร์) ─────────── */
export function rockyTexture(seed, baseColors, craterCount = 120, marsPolar = false) {
  const [c, ctx] = makeCanvas(TEX_W, TEX_H);
  const noise = new ValueNoise(seed);
  const noise2 = new ValueNoise(seed + 77);
  const img = ctx.createImageData(TEX_W, TEX_H);
  const d = img.data;
  const cols = baseColors.map(hexToRgb);
  const SCALE = 7;

  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H;
    const lat = Math.abs(v - 0.5) * 2; // 0 equator → 1 pole
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W;
      let n = noise.fbm(u * SCALE, v * SCALE * 0.55, 6, SCALE);
      const m = noise2.fbm(u * SCALE * 3, v * SCALE * 1.6, 4, SCALE * 3);
      n = n * 0.72 + m * 0.28;
      let col;
      if (n < 0.42) col = lerpColor(cols[3], cols[1], n / 0.42);
      else if (n < 0.6) col = lerpColor(cols[1], cols[0], (n - 0.42) / 0.18);
      else col = lerpColor(cols[0], cols[2], (n - 0.6) / 0.4);
      if (marsPolar && lat > 0.82) { // ขั้วน้ำแข็งดาวอังคาร
        const ice = Math.min(1, (lat - 0.82) / 0.1 + m * 0.3);
        col = lerpColor(col, [245, 244, 238], ice);
      }
      const i = (y * TEX_W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // หลุมอุกกาบาต
  const rand = mulberry32(seed + 999);
  for (let i = 0; i < craterCount; i++) {
    const cx = rand() * TEX_W, cy = TEX_H * (0.08 + rand() * 0.84);
    const r = 2 + Math.pow(rand(), 2.2) * 26;
    const g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    const dark = rand() * 0.30 + 0.12;
    g.addColorStop(0, `rgba(0,0,0,${dark})`);
    g.addColorStop(0.62, `rgba(0,0,0,${dark * 0.45})`);
    g.addColorStop(0.78, `rgba(255,255,255,${dark * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    if (cx < r) { ctx.beginPath(); ctx.arc(cx + TEX_W, cy, r, 0, Math.PI * 2); ctx.fill(); }
    if (cx > TEX_W - r) { ctx.beginPath(); ctx.arc(cx - TEX_W, cy, r, 0, Math.PI * 2); ctx.fill(); }
  }
  return canvasTexture(c);
}

/* ── ดาวศุกร์ — เมฆกรดหมุนวน ───────────────────────────── */
export function venusTexture(seed) {
  const [c, ctx] = makeCanvas(TEX_W, TEX_H);
  const noise = new ValueNoise(seed);
  const img = ctx.createImageData(TEX_W, TEX_H);
  const d = img.data;
  const R = ramp([[0, '#a8761f'], [0.35, '#c99b46'], [0.6, '#e3c87e'], [0.82, '#f4e3ae'], [1, '#fdf6dd']]);
  const S = 5;
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W;
      // เมฆไหลตามแนวนอน + บิดเป็นรูปตัว Y ตามจริง
      const warp = noise.fbm(u * S, v * S * 2.2, 4, S) * 2.2;
      const band = Math.sin(v * Math.PI * 5 + warp * 3 + u * Math.PI * 2) * 0.5 + 0.5;
      const n = noise.fbm(u * S * 2 + warp, v * S * 1.2, 5, S * 2);
      const col = R(n * 0.55 + band * 0.45);
      const i = (y * TEX_W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c);
}

/* ── โลก — ทวีป มหาสมุทร น้ำแข็งขั้วโลก + bump + specular ─ */
export function earthTextures(seed) {
  const noise = new ValueNoise(seed);
  const ridge = new ValueNoise(seed + 31);
  const [cMap, xMap] = makeCanvas(TEX_W, TEX_H);
  const [cBump, xBump] = makeCanvas(TEX_W, TEX_H);
  const [cSpec, xSpec] = makeCanvas(TEX_W, TEX_H);
  const iMap = xMap.createImageData(TEX_W, TEX_H);
  const iBump = xBump.createImageData(TEX_W, TEX_H);
  const iSpec = xSpec.createImageData(TEX_W, TEX_H);
  const ocean = ramp([[0, '#04203f'], [0.5, '#0a3a66'], [0.85, '#11518c'], [1, '#2a74ad']]);
  const S = 4.2;

  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H;
    const lat = Math.abs(v - 0.5) * 2;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W;
      let h = noise.fbm(u * S, v * S * 0.55, 7, S);
      const rg = Math.abs(ridge.fbm(u * S * 2.6, v * S * 1.4, 5, S * 2.6) - 0.5) * 2;
      h = h * 0.78 + (1 - rg) * 0.22;
      const sea = 0.52;
      let col, bump, spec;
      if (h < sea) {
        col = ocean(h / sea); bump = 18; spec = 235;
      } else {
        const e = (h - sea) / (1 - sea); // ความสูงแผ่นดิน 0..1
        const heat = (1 - lat) * (0.72 + noise.at(u * 9, v * 9) * 0.28); // เขตร้อนใกล้ศูนย์สูตร
        if (e < 0.07) col = [205, 188, 140];                       // ชายหาด
        else if (heat > 0.62 && e < 0.45) col = lerpColor([186, 154, 96], [142, 118, 66], e); // ทะเลทราย
        else if (e < 0.5) col = lerpColor([56, 112, 48], [34, 78, 36], e * 2);  // ป่า
        else if (e < 0.75) col = lerpColor([108, 96, 70], [140, 130, 112], (e - 0.5) * 4); // ภูเขา
        else col = [238, 238, 235];                                 // ยอดหิมะ
        bump = 70 + e * 185; spec = 22;
      }
      if (lat > 0.86) { // น้ำแข็งขั้วโลก
        const ice = Math.min(1, (lat - 0.86) / 0.07);
        col = lerpColor(col, [240, 246, 250], ice);
        spec = Math.max(spec, ice * 120); bump = Math.max(bump, 60);
      }
      const i = (y * TEX_W + x) * 4;
      iMap.data[i] = col[0]; iMap.data[i + 1] = col[1]; iMap.data[i + 2] = col[2]; iMap.data[i + 3] = 255;
      iBump.data[i] = iBump.data[i + 1] = iBump.data[i + 2] = bump; iBump.data[i + 3] = 255;
      iSpec.data[i] = iSpec.data[i + 1] = iSpec.data[i + 2] = spec; iSpec.data[i + 3] = 255;
    }
  }
  xMap.putImageData(iMap, 0, 0);
  xBump.putImageData(iBump, 0, 0);
  xSpec.putImageData(iSpec, 0, 0);
  const map = canvasTexture(cMap);
  const bumpMap = new THREE.CanvasTexture(cBump);
  const specularMap = new THREE.CanvasTexture(cSpec);
  return { map, bumpMap, specularMap };
}

/* ── เมฆโลก (โปร่งใส) ──────────────────────────────────── */
export function cloudTexture(seed) {
  const [c, ctx] = makeCanvas(TEX_W, TEX_H);
  const noise = new ValueNoise(seed);
  const img = ctx.createImageData(TEX_W, TEX_H);
  const d = img.data;
  const S = 6;
  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W;
      const swirl = noise.fbm(u * S * 0.7, v * S * 0.5, 3, S * 0.7) * 1.6;
      let n = noise.fbm(u * S + swirl, v * S * 0.62 + swirl * 0.4, 6, S);
      n = Math.max(0, (n - 0.5) * 2.6);
      const a = Math.min(1, n) * 235;
      const i = (y * TEX_W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c);
}

/* ── ดาวก๊าซยักษ์ — แถบเมฆ + จุดแดงใหญ่ ────────────────── */
export function gasGiantTexture(seed, kind) {
  const [c, ctx] = makeCanvas(TEX_W, TEX_H);
  const noise = new ValueNoise(seed);
  const img = ctx.createImageData(TEX_W, TEX_H);
  const d = img.data;

  const ramps = {
    jupiter: ramp([[0, '#8a5a3a'], [0.18, '#c08552'], [0.34, '#e8c9a0'], [0.5, '#f5e7cc'], [0.62, '#d3a878'], [0.78, '#a96f48'], [0.9, '#e3cfae'], [1, '#f7ecd8']]),
    saturn: ramp([[0, '#b08c58'], [0.25, '#d3b27e'], [0.5, '#e8d2a4'], [0.72, '#f2e3bf'], [0.88, '#dec291'], [1, '#f7eed6']]),
    uranus: ramp([[0, '#6fb8c4'], [0.4, '#8fd2da'], [0.7, '#a8e0e6'], [1, '#c4ecef']]),
    neptune: ramp([[0, '#1f3aa8'], [0.35, '#2c55c9'], [0.6, '#3f74dd'], [0.85, '#6a9ae8'], [1, '#8fb4ef']]),
  };
  const R = ramps[kind];
  const bandFreq = kind === 'jupiter' ? 11 : kind === 'saturn' ? 8 : 3.2;
  const turb = kind === 'jupiter' ? 0.5 : kind === 'saturn' ? 0.22 : 0.1;
  const S = 6;

  // จุดแดงใหญ่ของดาวพฤหัสบดี
  const grs = { u: 0.68, v: 0.66, ru: 0.085, rv: 0.05 };
  const grsRamp = ramp([[0, '#7e2c18'], [0.4, '#b2452a'], [0.75, '#d4714e'], [1, '#e8a37e']]);

  for (let y = 0; y < TEX_H; y++) {
    const v = y / TEX_H;
    for (let x = 0; x < TEX_W; x++) {
      const u = x / TEX_W;
      const w = noise.fbm(u * S, v * S * 2, 5, S);
      let vv = v + (w - 0.5) * turb * 0.3; // บิดแถบด้วยลม
      let t = Math.sin(vv * Math.PI * bandFreq + w * 4 * turb) * 0.5 + 0.5;
      t = t * 0.75 + w * 0.25;
      let col = R(t);

      if (kind === 'jupiter') {
        let du = Math.abs(u - grs.u); du = Math.min(du, 1 - du);
        const dv = (v - grs.v);
        const e = (du * du) / (grs.ru * grs.ru) + (dv * dv) / (grs.rv * grs.rv);
        if (e < 1) {
          const ang = Math.atan2(dv / grs.rv, du / grs.ru);
          const swirl = Math.sin(ang * 3 + e * 6 + w * 3) * 0.18;
          const inten = (1 - e) + swirl;
          col = lerpColor(col, grsRamp(Math.max(0, Math.min(1, inten))), Math.min(1, (1 - e) * 2.2));
        }
      }
      if (kind === 'neptune') { // จุดมืดใหญ่
        let du = Math.abs(u - 0.3); du = Math.min(du, 1 - du);
        const dv = v - 0.42;
        const e = (du * du) / 0.004 + (dv * dv) / 0.0016;
        if (e < 1) col = lerpColor(col, [16, 28, 92], (1 - e) * 0.75);
      }
      const i = (y * TEX_W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c);
}

/* ── วงแหวนดาวเสาร์ (แถบรัศมี + ช่องแคสสินี) ──────────── */
export function ringTexture(seed, faint = false) {
  const W = 1024, H = 8;
  const [c, ctx] = makeCanvas(W, H);
  const noise = new ValueNoise(seed);
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const base = faint ? [150, 175, 190] : [216, 197, 160];
  for (let x = 0; x < W; x++) {
    const t = x / W;
    let a = noise.fbm(t * 60, 0.5, 4) * 0.85 + 0.15;
    a *= Math.sin(t * Math.PI) * 0.5 + 0.55;                  // จางที่ขอบ
    if (t > 0.62 && t < 0.70) a *= 0.07;                       // ช่องแคสสินี
    if (t > 0.30 && t < 0.33) a *= 0.35;
    if (t > 0.84 && t < 0.86) a *= 0.25;
    if (t < 0.05) a *= t / 0.05;
    const bright = 0.75 + noise.at(t * 140, 3) * 0.5;
    if (faint) a *= 0.4;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      d[i] = base[0] * bright; d[i + 1] = base[1] * bright; d[i + 2] = base[2] * bright;
      d[i + 3] = Math.min(1, a) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c);
}

/* ── ฉากหลังอวกาศลึก: ทางช้างเผือก + เนบิวลา (equirect) ──
   1024×512 พอ — เป็นพื้นหลังฟุ้งถูกยืดเบลออยู่แล้ว แต่เร็วขึ้น 4 เท่า */
export function deepSpaceTexture() {
  const W = 1024, H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const noise = new ValueNoise(4242);
  ctx.fillStyle = '#01020a';
  ctx.fillRect(0, 0, W, H);

  // แถบทางช้างเผือกพาดเฉียง
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const bandCenter = 0.5 + Math.sin(u * Math.PI * 2) * 0.18;
      const dist = Math.abs(v - bandCenter);
      if (dist < 0.22) {
        const n = noise.fbm(u * 14, v * 14, 5, 14);
        const dust = noise.fbm(u * 30 + 7, v * 30, 4, 30);
        let glow = Math.max(0, 1 - dist / 0.22);
        glow = glow * glow * (0.35 + n * 0.65);
        const dark = dust < 0.42 ? (0.42 - dust) * 2.2 : 0; // ฝุ่นมืดกลางแถบ
        const g = Math.max(0, glow * (1 - dark)) * 88;
        const i = (y * W + x) * 4;
        d[i] += g * 0.9; d[i + 1] += g * 0.85; d[i + 2] += g;
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // เนบิวลาสีจาง ๆ
  const rand = mulberry32(777);
  const nebColors = ['rgba(120,80,200,', 'rgba(200,80,140,', 'rgba(60,130,200,', 'rgba(200,120,60,'];
  for (let i = 0; i < 14; i++) {
    const cx = rand() * W, cy = rand() * H, r = 60 + rand() * 200;
    const col = nebColors[Math.floor(rand() * nebColors.length)];
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, col + (0.05 + rand() * 0.06) + ')');
    g.addColorStop(1, col + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // ดาวฝุ่นเล็ก ๆ ฝังในพื้นหลัง
  for (let i = 0; i < 1800; i++) {
    const x = rand() * W, y = rand() * H;
    const b = rand();
    ctx.fillStyle = `rgba(${200 + b * 55},${200 + b * 55},255,${0.1 + b * 0.5})`;
    ctx.fillRect(x, y, b > 0.92 ? 2 : 1, b > 0.92 ? 2 : 1);
  }
  const t = canvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/* ── sprite กลม ๆ เรืองแสง (ดาว / แสงฟุ้ง) ─────────────── */
export function glowSprite(colorInner = '#ffffff', colorOuter = 'rgba(150,180,255,0)', size = 128) {
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, colorInner);
  g.addColorStop(0.25, colorInner);
  g.addColorStop(1, colorOuter);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c);
}

/* ── sprite เนบิวลาฟุ้ง (สำหรับ DSO ในท้องฟ้าจำลอง)
   128px พอ — เป็นแสงฟุ้งไร้ขอบคม แต่สร้างเร็วขึ้น 4 เท่า ────── */
export function nebulaSprite(hex, seed = 5, size = 128) {
  const [c, ctx] = makeCanvas(size, size);
  const noise = new ValueNoise(seed);
  const [r, g, b] = hexToRgb(hex);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5, dy = y / size - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy) * 2;
      const n = noise.fbm(x / size * 6, y / size * 6, 5);
      let a = Math.max(0, 1 - dist) * Math.max(0, n - 0.28) * 1.7;
      a = Math.min(1, a);
      const i = (y * size + x) * 4;
      d[i] = r + (255 - r) * a * 0.35; d[i + 1] = g + (255 - g) * a * 0.35; d[i + 2] = b + (255 - b) * a * 0.3;
      d[i + 3] = a * 200;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c);
}
