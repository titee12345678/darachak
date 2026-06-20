# CLAUDE.md — ระบบสุริยะ (Solar System · By Tee Jakkrit)

แพลตฟอร์มเรียนรู้ดาราศาสตร์ 3 มิติภาษาไทย ระดับพิพิธภัณฑ์วิทยาศาสตร์ — เว็บแอป Three.js ล้วน ไม่มี build step
Repo: https://github.com/titee12345678/darachak

---

## หลักการสำคัญที่ต้องยึดเสมอ (ห้ามละเมิด)

1. **ทุกอย่างต้อง realtime คำนวณจริงตามเวลา** — ตำแหน่งดาวเคราะห์/ดวงจันทร์/ดาวหาง, เฟสดวงจันทร์, การหมุนของโลก, ฤดูกาล, ตำแหน่งดาวบนท้องฟ้า ล้วนคำนวณจากเวลาจริงด้วยสูตรดาราศาสตร์ **ห้ามใช้ค่าสุ่มหรือค่าประมาณหยาบถ้ามีสูตรจริงใช้ได้** (ตรวจสอบความแม่นเทียบค่าจริงเสมอ เช่น ดวงอาทิตย์ต้องอยู่ Dec ~+23° ช่วงครีษมายันมิถุนายน)
2. **ความสมจริง 100%** — พื้นผิวดาวและภาพในแผงต้องเป็นภาพถ่าย/แผนที่จริง (NASA/ESA/ESO/EHT) ห้ามใช้ภาพ false-color (แผนที่ระดับความสูง) หรือภาพจินตนาการ ปนกับภาพถ่ายจริง
3. **เนื้อหาภาษาไทยทั้งหมด** ระดับใช้สอนได้จริง อ้างอิงหลักสูตร สสวท. (สาระวิทยาศาสตร์โลกและอวกาศ ว 3.1)
4. **ไม่กินสเปค** — รองรับมือถือ; texture/noise สร้างครั้งเดียวตอนโหลด, แอนิเมชันรันบน GPU (shader) ไม่ใช่ CPU ต่อเฟรม; ระวัง `ctx.filter` ใน loop วาด canvas (ทำให้โหลดช้ามาก)

---

## วิธีรัน

```bash
python3 server.py 5556      # เซิร์ฟเวอร์ no-cache (กันไฟล์ JS เก่าค้าง browser จน app ค้างหน้าโหลด)
# เปิด http://localhost:5556
```

ใช้ static server อื่นได้ แต่ต้องส่ง `Cache-Control: no-cache` ไม่งั้นเวลาอัปเดตหลายไฟล์ browser อาจหยิบเวอร์ชันปนกัน → โมดูลพังเงียบ → ค้างหน้าโหลด (แก้ชั่วคราวด้วย hard refresh `Cmd/Ctrl+Shift+R`)

**Deep links:** `?mode=sky` · `?mode=bh` · `?pick=saturn` (id ใดก็ได้) · `?demo=phases|seasons|solar-eclipse|lunar-eclipse|compare`

---

## สถาปัตยกรรม

ES modules ล้วน โหลด Three.js 0.160 จาก CDN ผ่าน importmap ใน `index.html` ไม่มี bundler/npm

### โครงสร้างไฟล์

```
index.html          โครง HTML + importmap + HUD ทั้งหมด (3 แท็บโหมด, แผง holo, deck, drawer, quiz, demo)
server.py           dev server แบบ no-cache
css/style.css       ธีม Hologram (ฟอนต์ Chakra Petch + Sarabun), responsive มือถือเต็มรูปแบบ
teacher.html        คู่มือครู + แผนการสอน 50 นาที 3 แผน (standalone)
worksheet.html      เครื่องสร้างใบงานพิมพ์ได้ สุ่มจาก QUIZ_BANK (standalone)

js/
  main.js           orchestrator: renderer, กล้อง, OrbitControls, raycast, สลับโหมด,
                    render loop (ครอบ try/catch กันค้าง), deep-link, ปุ่มทั้งหมด, กล้องโฟกัส/บินกลับ
  data.js           ข้อมูลวัตถุทั้งหมด (ดู exports ด้านล่าง) — แหล่งความจริงเดียว
  ephemeris.js      สูตรตำแหน่งดาวจริง (หัวใจของหลัก realtime — ดูหัวข้อแยก)
  solar.js          ฉากระบบสุริยะ: SolarSystem class + buildStarfield()
  planetarium.js    ฉากท้องฟ้าจำลอง: Planetarium class (LST→Alt/Az, ดาวตก, day/night)
  blackhole.js      ฉากหลุมดำ: BlackHole class (จาน shader, เจ็ต, กาแล็กซีอนุภาค)
  demos.js          โหมดสาธิต 5 ฉาก: Demos class (จอ inset "มุมมองที่ตาเห็นจริง")
  tour.js           ทัวร์นำชมอัตโนมัติ + เสียงบรรยายไทย (Web Speech API)
  ui.js             UI class: แผง holo, REGISTRY (รวมทุก object), drawer, เสียงบรรยาย
  quiz.js           แบบทดสอบ 3 ระดับ
  articles.js       ARTICLES[id] = [[หัวข้อ, เนื้อหา]...] — บทอ่านเจาะลึก 213 หัวข้อ/61 วัตถุ
  textures.js       สร้าง texture สด: realTex() โหลดภาพจริง + fallback procedural (noise)
  noise.js          ValueNoise (fBm) + ramp สี — รากฐาน procedural texture
  stars-catalog.js  Yale Bright Star Catalogue 8,404 ดวง [RA, Dec, mag, อุณหภูมิ/100]

textures/           แผนที่พื้นผิวดาวจริง 2K (.jpg) + วงแหวน + normal/specular โลก
img/                ภาพถ่ายจริงในแผงข้อมูล (รายวัตถุ) + img/const/ ภาพวาดตำนานหมู่ดาว
```

### exports หลักใน data.js (แก้เนื้อหาที่นี่)
`SUN, PLANETS, DWARF_PLANETS, COMET, EARTH_MOON, MAJOR_MOONS, ASTEROID_BELT_INFO, BLACKHOLE_OBJECTS, CONSTELLATIONS, BRIGHT_STARS, DSOS, PROVINCES, QUIZ_BANK, QUIZ_COMMENTS, LEVEL_NAMES`

แต่ละ object มี field: `id, nameTh, nameEn, stats[], statsX[] (เชิงลึก โหมดนักเรียน+), fact, factKid, speech (บทพูด — ขึ้นต้นด้วยชื่อแล้ว ห้ามเติมชื่อซ้ำ), photo, photoCredit, gravity (เครื่องคิดน้ำหนัก)`

### REGISTRY (ui.js)
รวมทุก object จากทุกหมวดเข้า Map เดียว ค้นด้วย `id` — ใช้ทั้งการแสดงผลแผงข้อมูล, ลิ้นชัก, deep-link, ทัวร์

---

## ephemeris.js — หัวใจของหลัก realtime

- **ดาวเคราะห์ 8 + พลูโต + ซีรีส**: JPL approximate Keplerian elements (ใช้ได้ปี 1800–2050) + แก้สมการเคปเลอร์
- **ดวงจันทร์**: สูตรย่อ Meeus (แม่น ~0.3°) → ใช้คำนวณ `moonPhase()` (ข้างขึ้น/แรม กี่ค่ำ + %สว่าง)
- **ดาวหางฮัลเลย์**: orbital elements จริง (perihelion 1986, คาบ 76 ปี)
- **การหมุนโลก**: ERA (Earth Rotation Angle) → ลองจิจูดใต้ดวงอาทิตย์
- **แปลงพิกัด**: `eclipticToRaDec()` (สำหรับท้องฟ้า), `eclipticToScene()` (สเกลพิพิธภัณฑ์ — ทิศ/มุม/เวลาจริง แต่ระยะถูกบีบ piecewise ให้ชมได้)
- **ท้องฟ้าจำลอง** (planetarium.js): `localSiderealTime()` + `radecToHorizon()` แปลง RA/Dec → ตำแหน่งบนโดมตามจังหวัด/เวลา

J2000 epoch = `Date.UTC(2000,0,1,12)`. `daysSinceJ2000(date)` คืออินพุตหลักของทุกฟังก์ชัน

---

## เทคนิคการเรนเดอร์ที่ใช้ (อ้างอิงเมื่อแก้กราฟิก)

- **ดวงอาทิตย์**: ShaderMaterial ผสมภาพถ่าย SDO จริงกับ noise เคลื่อนไหว + limb darkening + โคโรนา sprite + เปลวสุริยะ
- **โลก**: MeshPhongMaterial — daymap + nightmap (emissive โชว์ฝั่งกลางคืนผ่าน onBeforeCompile คำนวณทิศดวงอาทิตย์) + normalMap + specularMap + เมฆชั้นแยก + atmosphere fresnel shader
- **ดาวก๊าซวงนอก (ยูเรนัส/เนปจูน/พลูโต)**: เติม emissive จาง ๆ เลียนการเปิดรับแสงของภาพถ่ายยาน (ไกลดวงอาทิตย์จนคล้ำ)
- **วงแหวนดาวเสาร์**: ภาพ alpha จริง + remap UV ตามรัศมี; **ยูเรนัส**: แถบแคบสีถ่านมืดโปร่ง (ของจริงบางเฉียบ)
- **หลุมดำ**: จาน = ShaderMaterial (เกลียวลอการิทึม + เคปเลอร์ + Doppler beaming) + วงเลนส์ billboard + เจ็ต = ทรงกรวย shader พายุควัน + กาแล็กซี/อนุภาค = Points (จุดกลมขอบฟุ้ง ขนาดสุ่ม)
- **declutter ป้ายชื่อ** (solar.js): ซ่อนป้ายที่ชนกันบนจอ มี hysteresis + fade กันกระพริบ
- **ป้ายชื่อ**: CSS2DRenderer — **CSS2DObject ไม่สืบทอด visibility ของ group แม่** ต้อง sync เอง (เช่น `_syncLabels()` ใน demos.js/blackhole.js)
- เลี่ยง `backdrop-filter` บนพื้นที่ทับฉาก 3D ที่ขยับ (สั่นวูบบนมือถือ) และ animate `transform` แทน `top/left`

---

## รูปแบบการทำงาน (workflow ที่ใช้กับโปรเจกต์นี้)

- **แก้แล้ว verify ก่อน push เสมอ**: `node --input-type=module -e "import('./js/X.js')..."` — ไฟล์ที่ import three จะ error `Cannot find package 'three'` = ปกติ (แปลว่า syntax ผ่าน); ไฟล์อื่นต้อง print OK
- ตรวจภาพด้วย headless Chrome (`--use-angle=swiftshader`) ได้ แต่ swiftshader พังหลังรันหนักหลายรอบ → fallback เป็น parse-check + ให้ผู้ใช้ดูบน browser จริง
- **commit เป็นภาษาไทย** อธิบายว่าแก้อะไรเพราะอะไร ลงท้าย `Co-Authored-By: Claude <noreply@anthropic.com>` แล้ว push ทุกครั้งที่ผู้ใช้สั่ง
- ทำงานบน `main` โดยตรง (ผู้ใช้ยืนยันรูปแบบนี้)

---

## เครดิตข้อมูล/ภาพ
- พื้นผิวดาว: Solar System Scope (CC BY 4.0, อิง NASA) · พลูโต: New Horizons · ซีรีส: Dawn (HAMO) · ดวงอาทิตย์: SDO
- ภาพแผง: NASA/ESA/ESO/EHT ผ่าน Wikimedia Commons
- ภาพวาดตำนานหมู่ดาว: Stellarium (Johan Meuris, Free Art License)
- แคตตาล็อกดาว: Yale Bright Star Catalogue (BSC5)
- ฉากหลังอวกาศ + พื้นทุ่งหญ้า: procedural (seeded value-noise)
