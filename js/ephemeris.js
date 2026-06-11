/* ═══════════════════════════════════════════════════════════
   ephemeris.js — ตำแหน่งดาวจริงตามเวลา
   · ดาวเคราะห์: JPL approximate Keplerian elements (1800–2050)
   · ดวงจันทร์: สูตรย่อของ Meeus (แม่น ~0.3°)
   · ดาวหางฮัลเลย์: orbital elements จริง (perihelion 1986)
   · การหมุนของโลก: Earth Rotation Angle (ERA)
   ทุกฟังก์ชันรับ d = วันนับจาก J2000.0 (2000-01-01 12:00 UTC)
   ═══════════════════════════════════════════════════════════ */

const DEG = Math.PI / 180;
export const J2000_MS = 946728000000; // Date.UTC(2000, 0, 1, 12)

export function daysSinceJ2000(date) {
  return (date.getTime() - J2000_MS) / 86400000;
}

/* ── JPL Keplerian elements @J2000 + อัตราเปลี่ยนต่อศตวรรษจูเลียน ──
   [a(AU), e, I(°), L(°), ϖ(°), Ω(°)] + rates  */
const ELEMENTS = {
  mercury: { el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081] },
  venus: { el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], rate: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418] },
  earth: { el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0] },
  mars: { el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343] },
  jupiter: { el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106] },
  saturn: { el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794] },
  uranus: { el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589] },
  neptune: { el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664] },
  pluto: { el: [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684], rate: [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482] },
  // ดาวซีรีส (elements ราว J2000, ความแม่นพอสำหรับภาพรวม)
  ceres: { el: [2.7675, 0.07582, 10.594, 249.886, 153.902, 80.305], rate: [0.0, 0.0, 0.0, 7818.7, 0.0, 0.0] },
};

export const EPHEM_IDS = Object.keys(ELEMENTS);

/* แก้สมการเคปเลอร์ M = E − e·sinE (หน่วยองศา) */
function solveKepler(Mdeg, e) {
  const M = ((Mdeg % 360) + 540) % 360 - 180; // [-180,180)
  let E = M + (e * 57.29577951308232) * Math.sin(M * DEG);
  for (let i = 0; i < 8; i++) {
    const dM = M - (E - e * 57.29577951308232 * Math.sin(E * DEG));
    const dE = dM / (1 - e * Math.cos(E * DEG));
    E += dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}

/* ตำแหน่ง heliocentric ecliptic (AU) — แกน: x→จุดวสันตวิษุวัต, z→ขั้วเหนือสุริยวิถี */
export function helio(id, d) {
  const p = ELEMENTS[id];
  if (!p) return { x: 0, y: 0, z: 0 };
  const T = d / 36525;
  const a = p.el[0] + p.rate[0] * T;
  const e = p.el[1] + p.rate[1] * T;
  const I = (p.el[2] + p.rate[2] * T) * DEG;
  const L = p.el[3] + p.rate[3] * T;
  const w = p.el[4] + p.rate[4] * T;  // ϖ longitude of perihelion
  const O = (p.el[5] + p.rate[5] * T) * DEG;
  const M = L - w;
  const omega = w * DEG - O;          // argument of perihelion ω
  const E = solveKepler(M, e) * DEG;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return orbitalToEcliptic(xp, yp, omega, O, I);
}

function orbitalToEcliptic(xp, yp, omega, O, I) {
  const co = Math.cos(omega), so = Math.sin(omega);
  const cO = Math.cos(O), sO = Math.sin(O);
  const cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    y: (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    z: (so * sI) * xp + (co * sI) * yp,
  };
}

/* ── ดวงจันทร์: geocentric ecliptic (สูตรย่อ Meeus, ~0.3°) ── */
export function moonGeo(d) {
  const Lp = (218.3164477 + 13.17639648 * d) * DEG;  // ลองจิจูดเฉลี่ย
  const Ms = (357.5291092 + 0.98560028 * d) * DEG;   // mean anomaly ดวงอาทิตย์
  const Mp = (134.9633964 + 13.06499295 * d) * DEG;  // mean anomaly ดวงจันทร์
  const D = (297.8501921 + 12.19074912 * d) * DEG;   // elongation
  const F = (93.2720950 + 13.22935024 * d) * DEG;    // argument of latitude
  const lon = Lp
    + (6.288774 * Math.sin(Mp) + 1.274027 * Math.sin(2 * D - Mp)
      + 0.658314 * Math.sin(2 * D) + 0.213618 * Math.sin(2 * Mp)
      - 0.185116 * Math.sin(Ms) - 0.114332 * Math.sin(2 * F)) * DEG;
  const lat = (5.128122 * Math.sin(F) + 0.280602 * Math.sin(Mp + F)
    + 0.277693 * Math.sin(Mp - F)) * DEG;
  return {
    x: Math.cos(lat) * Math.cos(lon),
    y: Math.cos(lat) * Math.sin(lon),
    z: Math.sin(lat),
  }; // unit vector geocentric ecliptic
}

/* ── ดาวหางฮัลเลย์: elements จริง (perihelion 9 ก.พ. 1986) ── */
const HALLEY = {
  a: 17.834, e: 0.96714, I: 162.262 * DEG,
  O: 58.42 * DEG, omega: 111.332 * DEG,
  periDay: -5077.605,       // วันที่ผ่าน perihelion นับจาก J2000
  period: 27509,            // วัน (75.32 ปี)
};
export const HALLEY_PERIOD = HALLEY.period;
export function halleyHelio(d) {
  const M = 360 * ((d - HALLEY.periDay) / HALLEY.period);
  const E = solveKepler(M, HALLEY.e) * DEG;
  const xp = HALLEY.a * (Math.cos(E) - HALLEY.e);
  const yp = HALLEY.a * Math.sqrt(1 - HALLEY.e * HALLEY.e) * Math.sin(E);
  return orbitalToEcliptic(xp, yp, HALLEY.omega, HALLEY.O, HALLEY.I);
}

/* ── ecliptic → equatorial (RA ชม., Dec องศา) ── */
const OBLIQ = 23.43928 * DEG;
export function eclipticToRaDec(v) {
  const xeq = v.x;
  const yeq = v.y * Math.cos(OBLIQ) - v.z * Math.sin(OBLIQ);
  const zeq = v.y * Math.sin(OBLIQ) + v.z * Math.cos(OBLIQ);
  const r = Math.sqrt(xeq * xeq + yeq * yeq + zeq * zeq) || 1;
  let ra = Math.atan2(yeq, xeq) / DEG / 15;
  if (ra < 0) ra += 24;
  return { ra, dec: Math.asin(zeq / r) / DEG };
}

/* ── มุมการหมุนของโลก (Earth Rotation Angle) ── */
export function earthRotationAngle(d) {
  return Math.PI * 2 * (0.7790572732640 + 1.00273781191135448 * d);
}

/* ── สเกลพิพิธภัณฑ์: แปลงระยะจริง (AU) → หน่วยฉาก ──
   ทิศจริง 100% / ระยะถูกบีบแบบ piecewise ให้ชมได้ทั้งระบบ */
const AU_ANCHORS = [
  [0, 0], [0.387, 14], [0.723, 19], [1.0, 25], [1.524, 31],
  [2.767, 37.5], [5.203, 46], [9.537, 60], [19.19, 73], [30.07, 85], [39.48, 96],
];
export function sceneRadiusFromAU(rAU) {
  const A = AU_ANCHORS;
  if (rAU <= 0) return 0;
  for (let i = 1; i < A.length; i++) {
    if (rAU <= A[i][0]) {
      const [a0, s0] = A[i - 1], [a1, s1] = A[i];
      return s0 + (s1 - s0) * (rAU - a0) / (a1 - a0);
    }
  }
  const [a0, s0] = A[A.length - 2], [a1, s1] = A[A.length - 1];
  return s1 + (rAU - a1) * (s1 - s0) / (a1 - a0); // extrapolate
}

/* helio/geo ecliptic (AU) → ตำแหน่งฉาก (แกนฉาก: X=x, Y=z, Z=−y) */
export function eclipticToScene(v, out) {
  const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
  const s = sceneRadiusFromAU(r) / r;
  return out.set(v.x * s, v.z * s, -v.y * s);
}
