/* noise.js — seeded value noise + fBm สำหรับสร้างพื้นผิวดาวเคราะห์ */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ValueNoise {
  constructor(seed = 1) {
    const rand = mulberry32(seed);
    this.size = 256;
    this.grid = new Float32Array(this.size * this.size);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = rand();
  }
  // smooth value noise, tileable on x over `periodX` cells
  at(x, y, periodX = 0) {
    const s = this.size;
    let x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const px = periodX > 0 ? periodX : s;
    const X0 = ((x0 % px) + px) % px, X1 = (X0 + 1) % px;
    const Y0 = ((y0 % s) + s) % s, Y1 = (Y0 + 1) % s;
    const g = this.grid;
    const a = g[Y0 * s + X0], b = g[Y0 * s + X1];
    const c = g[Y1 * s + X0], d = g[Y1 * s + X1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  // fractal Brownian motion, tileable horizontally
  fbm(x, y, octaves = 5, periodX = 0) {
    let v = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      v += amp * this.at(x * freq, y * freq, periodX > 0 ? periodX * freq : 0);
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return v / norm;
  }
}

export function lerpColor(c1, c2, t) {
  return [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  ];
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// multi-stop gradient ramp: stops = [[t, '#hex'], ...]
export function ramp(stops) {
  const rgb = stops.map(([t, h]) => [t, hexToRgb(h)]);
  return (t) => {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < rgb.length - 1; i++) {
      const [t0, c0] = rgb[i], [t1, c1] = rgb[i + 1];
      if (t <= t1) return lerpColor(c0, c1, (t - t0) / Math.max(1e-6, t1 - t0));
    }
    return rgb[rgb.length - 1][1];
  };
}
