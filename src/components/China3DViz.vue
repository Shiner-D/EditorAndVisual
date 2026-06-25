<script setup lang="ts">
/**
 * Vue 3 核心响应式 API
 * ref()       — 将基本值/对象包装为响应式引用，通过 .value 读写
 * reactive()  — 将普通对象转为深度响应式代理，属性可直接访问
 * onMounted   — 生命周期钩子：组件挂载到 DOM 后触发（适合初始化 Three.js）
 * onUnmounted — 生命周期钩子：组件卸载前触发（适合清理渲染循环、事件监听）
 */
import { ref, reactive, onMounted, onUnmounted } from 'vue'
/**
 * Three.js 核心库（命名空间导入）
 * 提供所有 3D 渲染所需的类：场景、相机、渲染器、几何体、材质、光源、辅助工具等
 */
import * as THREE from 'three'
/**
 * OrbitControls — Three.js 扩展模块中的轨道相机控制器
 * 功能：鼠标左键拖拽旋转 / 右键或双指平移 / 滚轮缩放
 * 构造参数：camera（受控相机），domElement（监听鼠标事件的 canvas DOM）
 */
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// ── Vue 响应式引用 ────────────────────────────────────────────
/** canvasRef: Three.js 渲染目标 canvas 元素的模板引用 */
const canvasRef = ref<HTMLCanvasElement | null>(null)
/** loading: 控制加载遮罩层显示（GeoJSON 请求期间为 true）*/
const loading = ref(true)
/** loadError: 存储加载失败的错误信息，非空时显示错误提示 */
const loadError = ref('')

// ── 图层显隐状态 ───────────────────────────────────────────────
/**
 * layerVis: 各图层的可见性开关
 * barFlyLine — 柱状图 + 飞线
 * eventLabel — 国家标签（城市标签已改为 hover tooltip）
 * keyPoint   — 脉冲光圈关键点
 * heatmap    — 热力图平面
 * scatter    — 随机散点
 */
const layerVis = reactive({
  barFlyLine: true,
  eventLabel: true,
  keyPoint: true,
  heatmap: true,
  scatter: true,
})

// ── 坐标投影 ──────────────────────────────────────────────────
/**
 * 地图坐标系说明：
 *   Three.js 世界坐标轴 Y 轴向上（right-hand）
 *   地图铺在 XZ 平面，Y=0 为地表，省份向 Y 正方向拉伸
 *   东经 → 世界 +X，西经 → 世界 -X
 *   北纬 → 世界 -Z（靠近相机为南），南纬 → 世界 +Z
 *
 * SCALE: 经纬度 → 世界单位的缩放因子（1°≈0.58 wu）
 * CLng/CLat: 投影中心（约中国地理中心），使地图居中显示
 */
const SCALE = 0.58
const CLng = 105, CLat = 36

/**
 * wPos — 经纬度坐标 → Three.js 世界坐标
 * @param lng 经度（东正西负）
 * @param lat 纬度（北正南负）
 * @param y   高度（默认 0 = 地表，>0 为悬空）
 * @returns THREE.Vector3 世界坐标
 */
function wPos(lng: number, lat: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3((lng - CLng) * SCALE, y, -(lat - CLat) * SCALE)
}

// ── 城市与飞线数据 ────────────────────────────────────────────
/**
 * cities: 城市数据列表
 *   name  — 城市名称（用于 tooltip 显示及飞线端点查找）
 *   lng   — 经度
 *   lat   — 纬度
 *   value — 业务指标值（驱动柱高、热力强度、tooltip 数值）
 *   major — 是否为主要城市（影响颜色：true=粉红，false=蓝色）
 */
const cities = [
  { name: '北京', lng: 116.4, lat: 39.9, value: 890, major: true },
  { name: '上海', lng: 121.5, lat: 31.2, value: 1200, major: true },
  { name: '广州', lng: 113.3, lat: 23.1, value: 780, major: true },
  { name: '成都', lng: 104.1, lat: 30.7, value: 650, major: false },
  { name: '武汉', lng: 114.3, lat: 30.6, value: 580, major: false },
  { name: '西安', lng: 108.9, lat: 34.3, value: 420, major: false },
  { name: '重庆', lng: 106.5, lat: 29.6, value: 550, major: false },
  { name: '昆明', lng: 102.7, lat: 25.0, value: 480, major: false },
  { name: '济南', lng: 117.0, lat: 36.7, value: 710, major: false },
  { name: '沈阳', lng: 123.4, lat: 41.8, value: 380, major: false },
  { name: '南京', lng: 118.8, lat: 32.1, value: 760, major: false },
  { name: '杭州', lng: 120.2, lat: 30.3, value: 820, major: false },
]

/** flyLines: 飞线端点对，每条飞线由起始城市名组成的二元组定义 */
const flyLines: [string, string][] = [
  ['北京', '上海'], ['北京', '广州'], ['北京', '成都'],
  ['北京', '武汉'], ['北京', '沈阳'], ['上海', '广州'],
  ['成都', '昆明'], ['南京', '杭州'], ['武汉', '广州'],
]

/** countryLabels: 中国周边国家标签，显示在地图边界外 */
const countryLabels = [
  { name: '蒙古', lng: 103, lat: 47.5 },
  { name: '朝鲜', lng: 128, lat: 41.5 },
  { name: '日本', lng: 137, lat: 37.5 },
  { name: '印度', lng: 78, lat: 28 },
  { name: '缅甸', lng: 96, lat: 21 },
  { name: '老挝', lng: 103, lat: 18 },
]

// ── 省份色阶（Choropleth）数据 ────────────────────────────────
/**
 * provinceData: 各省份的指标值
 * 键为 GeoJSON 中 feature.properties.name 字段的省份名称
 * 值用于计算该省份顶面颜色（色阶插值）
 */
const provinceData: Record<string, number> = {
  '北京市': 890,  '天津市': 620,  '河北省': 380,  '山西省': 290,
  '内蒙古自治区': 340, '辽宁省': 480, '吉林省': 320,  '黑龙江省': 310,
  '上海市': 1200, '江苏省': 780,  '浙江省': 820,  '安徽省': 450,
  '福建省': 560,  '江西省': 390,  '山东省': 710,  '河南省': 520,
  '湖北省': 580,  '湖南省': 470,  '广东省': 950,  '广西壮族自治区': 360,
  '海南省': 280,  '重庆市': 550,  '四川省': 650,  '贵州省': 310,
  '云南省': 480,  '西藏自治区': 180, '陕西省': 420, '甘肃省': 240,
  '青海省': 190,  '宁夏回族自治区': 230, '新疆维吾尔自治区': 350,
  '香港特别行政区': 720, '澳门特别行政区': 680, '台湾省': 600,
}
/** 色阶映射的最小/最大值（用于归一化 t ∈ [0,1]）*/
const PROV_MIN = 180
const PROV_MAX = 1200

/**
 * 三段色阶颜色锚点（深蓝 → 中蓝 → 亮青）
 * THREE.Color(hex): 用十六进制整数创建颜色对象
 */
const _cLow  = new THREE.Color(0x051840) // 低值：深海蓝
const _cMid  = new THREE.Color(0x1055cc) // 中值：中蓝
const _cHigh = new THREE.Color(0x00e5ff) // 高值：亮青

/**
 * provinceColor — 根据指标值返回省份顶面颜色
 * 使用分段线性插值：[min, mid] → _cLow→_cMid，[mid, max] → _cMid→_cHigh
 *
 * THREE.Color.lerpColors(c1, c2, t): 在 c1 和 c2 之间按参数 t∈[0,1] 线性插值
 * @param value 省份原始指标值
 * @returns THREE.Color 插值结果颜色
 */
function provinceColor(value: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (value - PROV_MIN) / (PROV_MAX - PROV_MIN)))
  const out = new THREE.Color()
  if (t < 0.5) out.lerpColors(_cLow, _cMid, t * 2)
  else          out.lerpColors(_cMid, _cHigh, (t - 0.5) * 2)
  return out
}

// ── Three.js ──────────────────────────────────────────────────
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let animId = 0

// Camera preset
const INIT_POS = new THREE.Vector3(2, 50, 58)
const INIT_TARGET = new THREE.Vector3(2, 1, 0)
const TOP_POS = new THREE.Vector3(2, 90, 1)
const TOP_TARGET = new THREE.Vector3(2, 0, 0)

const camAnim = {
  active: false,
  t: 0,
  fromPos: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
}

// Groups
let barGroup: THREE.Group
let flyGroup: THREE.Group
let labelGroup: THREE.Group
let keyGroup: THREE.Group
let heatGroup: THREE.Group
let scatterGroup: THREE.Group
let hitGroup: THREE.Group

interface FlyDot { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; t: number; speed: number }
interface Ripple { mesh: THREE.Mesh; t: number }

const flyDots: FlyDot[] = []
const ripples: Ripple[] = []

// ── tooltip ───────────────────────────────────────────────────
const tooltip = reactive({ visible: false, x: 0, y: 0, name: '', value: 0, major: false })
const raycaster = new THREE.Raycaster()
const _mouse = new THREE.Vector2()

// ─────────────────────────────────────────────────────────────
// INIT SCENE
// ─────────────────────────────────────────────────────────────
function initScene(canvas: HTMLCanvasElement) {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020b18)
  scene.fog = new THREE.FogExp2(0x020b18, 0.008)

  const w = canvas.clientWidth, h = canvas.clientHeight
  camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 500)
  camera.position.copy(INIT_POS)
  camera.lookAt(INIT_TARGET)

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(INIT_TARGET)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 15
  controls.maxDistance = 130
  controls.maxPolarAngle = Math.PI / 2.08
  controls.update()

  // Lighting
  scene.add(new THREE.AmbientLight(0x2244aa, 2.8))
  const dirA = new THREE.DirectionalLight(0x88bbff, 2.4)
  dirA.position.set(5, 50, 40)   // above-south → lights top faces + south sides
  scene.add(dirA)
  const dirB = new THREE.DirectionalLight(0x0022aa, 1.0)
  dirB.position.set(-10, 15, -20)  // from north-above → subtle back-fill
  scene.add(dirB)

  // Horizontal grid (world XZ plane)
  const grid = new THREE.GridHelper(200, 80, 0x0a1e3a, 0x051428)
  grid.position.y = -0.2
  scene.add(grid)

  buildParticles()

  barGroup    = new THREE.Group()
  flyGroup    = new THREE.Group()
  labelGroup  = new THREE.Group()
  keyGroup    = new THREE.Group()
  heatGroup   = new THREE.Group()
  scatterGroup= new THREE.Group()
  hitGroup    = new THREE.Group()
  scene.add(barGroup, flyGroup, labelGroup, keyGroup, heatGroup, scatterGroup, hitGroup)
}

// ─────────────────────────────────────────────────────────────
// PARTICLES
// ─────────────────────────────────────────────────────────────
function buildParticles() {
  const n = 2800
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 160
    pos[i*3+1] = Math.random() * 60
    pos[i*3+2] = (Math.random() - 0.5) * 160
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x1a3a88, size: 0.15, transparent: true, opacity: 0.5, sizeAttenuation: true,
  })))
}

// ─────────────────────────────────────────────────────────────
// GeoJSON sanitizer
// ─────────────────────────────────────────────────────────────
function cleanCoords(a: any): any {
  if (!Array.isArray(a)) return a
  return a.filter((x: any) => x != null).map((x: any) => Array.isArray(x) ? cleanCoords(x) : x)
}

// ─────────────────────────────────────────────────────────────
// PROVINCE MAP
// Province shapes live in ExtrudeGeometry local XY space,
// then each mesh is rotated -90° around X so:
//   local X → world X (east/west)
//   local Y → world Z (south/north)
//   local Z → world Y (height, extrusion goes up)
// ─────────────────────────────────────────────────────────────
function buildMap(features: any[]) {
  // Shared side-wall and border materials
  const sideMat = new THREE.MeshPhongMaterial({
    color: 0x0a2a6e,
    emissive: 0x020816,
    emissiveIntensity: 0.3,
    shininess: 15,
    transparent: true,
    opacity: 0.75,
  })
  const borderMat = new THREE.LineBasicMaterial({
    color: 0x4af0ff,
    transparent: true,
    opacity: 0.9,
  })

  // Cache one capMat per province name so shared polygons reuse the same material
  const capCache = new Map<string, THREE.MeshPhongMaterial>()

  for (const f of features) {
    const geo = f?.geometry
    if (!geo?.coordinates) continue

    // Derive per-province cap material from data
    const provName: string = f?.properties?.name ?? ''
    if (!capCache.has(provName)) {
      const val = provinceData[provName] ?? PROV_MIN
      const col = provinceColor(val)
      capCache.set(provName, new THREE.MeshPhongMaterial({
        color: col,
        emissive: col.clone().multiplyScalar(0.28),
        emissiveIntensity: 0.6,
        shininess: 50,
        transparent: true,
        opacity: 0.82,
      }))
    }
    const capMat = capCache.get(provName)!

    const polys: number[][][][] = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates
    for (const poly of polys) {
      if (!poly?.[0] || poly[0].length < 3) continue
      try {
        const [outer, ...holes] = poly
        const shape = new THREE.Shape()
        for (let i = 0; i < outer.length; i++) {
          const c = outer[i]
          if (typeof c[0] !== 'number') continue
          // local X = world X, local Y = world Z (after -PI/2 rot)
          const lx = (c[0] - CLng) * SCALE
          const ly = (c[1] - CLat) * SCALE
          i === 0 ? shape.moveTo(lx, ly) : shape.lineTo(lx, ly)
        }
        for (const hole of holes) {
          if (!hole || hole.length < 3) continue
          const p = new THREE.Path()
          hole.forEach((c: number[], i: number) => {
            if (typeof c[0] !== 'number') return
            const lx = (c[0] - CLng) * SCALE
            const ly = (c[1] - CLat) * SCALE
            i === 0 ? p.moveTo(lx, ly) : p.lineTo(lx, ly)
          })
          shape.holes.push(p)
        }

        const exGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false })
        const mesh = new THREE.Mesh(exGeo, [capMat, sideMat])
        mesh.rotation.x = -Math.PI / 2   // XY plane → XZ plane; Z-extrusion → Y-up
        scene.add(mesh)

        // Border ring at top surface (world Y = 1.42)
        const pts = outer
          .filter((c: number[]) => typeof c[0] === 'number')
          .map((c: number[]) => new THREE.Vector3(
            (c[0] - CLng) * SCALE, 1.42, -(c[1] - CLat) * SCALE,
          ))
        if (pts.length > 1) {
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), borderMat))
        }
      } catch { /* skip broken shapes */ }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// BARS + FLY LINES
// ─────────────────────────────────────────────────────────────
function buildBars() {
  const MAP_TOP = 1.42

  cities.forEach(city => {
    const pos = wPos(city.lng, city.lat, MAP_TOP)
    const h = city.value * 0.007
    const isMaj = city.major
    const col  = isMaj ? 0xff3d8a : 0x00aaff
    const emCol = isMaj ? 0xff0060 : 0x0055ff

    // Cylinder bar (Y-axis aligned = grows in world Y ✓)
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, h, 12),
      new THREE.MeshPhongMaterial({ color: col, emissive: emCol, emissiveIntensity: 0.8, shininess: 80, transparent: true, opacity: 0.9 }),
    )
    bar.position.set(pos.x, MAP_TOP + h / 2, pos.z)
    barGroup.add(bar)

    // Wide glow shell (additive)
    const glowBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, h, 12),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    glowBar.position.copy(bar.position)
    barGroup.add(glowBar)

    // Glowing disc at top
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 20),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    disc.rotation.x = -Math.PI / 2
    disc.position.set(pos.x, MAP_TOP + h, pos.z)
    barGroup.add(disc)
  })
}

function buildFlyLines() {
  const MAP_TOP = 1.42
  const trailMat = new THREE.LineBasicMaterial({
    color: 0x0077cc, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const dotGeo = new THREE.SphereGeometry(0.22, 8, 8)

  for (const [fn, tn] of flyLines) {
    const fc = cities.find(c => c.name === fn)
    const tc = cities.find(c => c.name === tn)
    if (!fc || !tc) continue

    const start = wPos(fc.lng, fc.lat, MAP_TOP)
    const end   = wPos(tc.lng, tc.lat, MAP_TOP)
    const mid   = start.clone().add(end).multiplyScalar(0.5)
    mid.y += start.distanceTo(end) * 0.42 + 2

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    flyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), trailMat))

    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    flyGroup.add(dot)
    flyDots.push({ mesh: dot, curve, t: Math.random(), speed: 0.003 + Math.random() * 0.002 })
  }
}

// ─────────────────────────────────────────────────────────────
// EVENT LABELS
// ─────────────────────────────────────────────────────────────
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function buildEventLabels() {
  // City labels removed — now driven by mouse hover tooltip (see buildHitTargets)
  const MAP_TOP = 1.42
  // Country labels outside China (remain as sprites)
  countryLabels.forEach(cl => {
    const cv = document.createElement('canvas'); cv.width = 112; cv.height = 40
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = 'rgba(0,30,80,0.7)'; ctx.strokeStyle = '#2255aa'; ctx.lineWidth = 1.5
    rrect(ctx, 2, 4, 108, 32, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#5599cc'; ctx.font = '13px Microsoft YaHei,sans-serif'
    ctx.textAlign = 'center'; ctx.fillText(cl.name, 56, 25)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }))
    const pos = wPos(cl.lng, cl.lat, MAP_TOP + 3)
    sp.position.copy(pos)
    sp.scale.set(3, 1, 1)
    labelGroup.add(sp)
  })
}

// ─────────────────────────────────────────────────────────────
// HIT TARGETS  (invisible spheres for mouse-hover raycasting)
// ─────────────────────────────────────────────────────────────
function buildHitTargets() {
  const geo = new THREE.SphereGeometry(1.8, 8, 8)
  const mat = new THREE.MeshBasicMaterial({ visible: false })
  cities.forEach(city => {
    const pos = wPos(city.lng, city.lat, 3)
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(pos)
    m.userData = { name: city.name, value: city.value, major: city.major }
    hitGroup.add(m)
  })
}

// ─────────────────────────────────────────────────────────────
// KEY POINTS  (large pulsing rings, esp. around Beijing)
// ─────────────────────────────────────────────────────────────
function buildKeyPoints() {
  const MAP_TOP = 1.42
  const sphereGeo = new THREE.SphereGeometry(0.28, 14, 14)

  cities.filter(c => c.value > 550).forEach(city => {
    const pos = wPos(city.lng, city.lat, MAP_TOP)
    const col = city.major ? 0xff3d8a : 0x00ffcc
    const glowCol = city.major ? 0xff3d8a : 0x00e5ff

    // Center sphere
    const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({
      color: col, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    sphere.position.set(pos.x, MAP_TOP + 0.28, pos.z)
    keyGroup.add(sphere)

    // 3 concentric pulse rings laid flat in XZ
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.22, 40),
        new THREE.MeshBasicMaterial({
          color: glowCol, transparent: true, opacity: 0.8,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.set(pos.x, MAP_TOP + 0.05, pos.z)
      keyGroup.add(ring)
      ripples.push({ mesh: ring, t: i / 3 })
    }
  })

  // Extra large orbit rings around Beijing
  const bj = cities.find(c => c.name === '北京')!
  const bjPos = wPos(bj.lng, bj.lat, MAP_TOP + 0.1)
  for (let i = 0; i < 2; i++) {
    const r = 2.2 + i * 1.4
    const orbitRing = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.1, 64),
      new THREE.MeshBasicMaterial({
        color: 0x00aaff, transparent: true, opacity: 0.35 - i * 0.08,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    )
    orbitRing.rotation.x = -Math.PI / 2
    orbitRing.position.copy(bjPos)
    keyGroup.add(orbitRing)
  }
}

// ─────────────────────────────────────────────────────────────
// HEATMAP  — per-city billboard sprites (always face camera)
// ─────────────────────────────────────────────────────────────
function buildHeatmap() {
  // Map world-space bounds (same projection as wPos)
  const MAP_X_MIN = (73  - CLng) * SCALE  // west edge  ≈ -18.56
  const MAP_X_MAX = (135 - CLng) * SCALE  // east edge  ≈  17.40
  const MAP_Z_MIN = -(53 - CLat) * SCALE  // north edge ≈  -9.86
  const MAP_Z_MAX = -(18 - CLat) * SCALE  // south edge ≈  10.44
  const MAP_W = MAP_X_MAX - MAP_X_MIN     // ≈ 35.96 world units
  const MAP_H = MAP_Z_MAX - MAP_Z_MIN     // ≈ 20.30 world units

  const CW = 1024
  const CH = Math.round(CW * MAP_H / MAP_W)  // ≈ 578

  // ── Pass 1: draw additive white blobs on TRANSPARENT canvas ─
  const cv = document.createElement('canvas')
  cv.width = CW; cv.height = CH
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, CW, CH)   // transparent background — no black fill!

  cities.forEach(city => {
    const wX = (city.lng - CLng) * SCALE
    const wZ = -(city.lat - CLat) * SCALE
    const px = (wX - MAP_X_MIN) / MAP_W * CW
    const py = (wZ - MAP_Z_MIN) / MAP_H * CH

    // Reduced radii so blobs stay within China borders
    // major: 2.5–4.0 wu  (≈ 4–7 lat/lng degrees), minor: 1.5–2.8 wu
    const rWorld = city.major
      ? (city.value / 1200) * 1.5 + 2.5
      : (city.value / 1200) * 1.3 + 1.5
    const rPx = rWorld / MAP_W * CW

    const g = ctx.createRadialGradient(px, py, 0, px, py, rPx)
    g.addColorStop(0,    'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(200,200,200,0.85)')
    g.addColorStop(0.60, 'rgba(70,70,70,0.40)')
    g.addColorStop(1,    'rgba(0,0,0,0)')
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, py, rPx, 0, Math.PI * 2)
    ctx.fill()
  })

  // ── Pass 2: map brightness → heatmap palette ───────────────
  const id = ctx.getImageData(0, 0, CW, CH)
  const d  = id.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue    // skip pixels untouched by any gradient
    const v = d[i] / 255            // R channel = brightness (0‥1)
    let r = 0, g = 0, b = 0, a = 0
    if (v > 0.01) {
      const t = Math.min(1, v)
      if      (t < 0.20) { const s=t/0.20;          r=0;   g=0;                     b=Math.round(s*255);       a=Math.round(s*160) }
      else if (t < 0.38) { const s=(t-0.20)/0.18;   r=0;   g=Math.round(s*220);     b=Math.round(255-s*100);   a=185 }
      else if (t < 0.56) { const s=(t-0.38)/0.18;   r=0;   g=220;                   b=Math.round(155-s*155);   a=200 }
      else if (t < 0.72) { const s=(t-0.56)/0.16;   r=Math.round(s*255); g=220;     b=0;                       a=215 }
      else if (t < 0.88) { const s=(t-0.72)/0.16;   r=255; g=Math.round(220-s*220); b=0;                       a=228 }
      else               {                            r=255; g=0;          b=0;                                  a=240 }
    }
    d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=a
  }
  ctx.putImageData(id, 0, 0)

  // ── Pass 3: single flat plane covering entire China map ────
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W, MAP_H),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      opacity: 0.90,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  plane.rotation.x = -Math.PI / 2
  plane.position.set(
    (MAP_X_MIN + MAP_X_MAX) / 2,
    1.48,
    (MAP_Z_MIN + MAP_Z_MAX) / 2,
  )
  heatGroup.add(plane)
}

// ─────────────────────────────────────────────────────────────
// SCATTER POINTS
// ─────────────────────────────────────────────────────────────
function buildScatter() {
  const geo = new THREE.SphereGeometry(0.14, 6, 6)
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ff9d, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
  // Cluster centers at provincial capitals / major regions within China
  const clusters: [number, number, number][] = [
    [116.4, 39.9, 3.5], [121.5, 31.2, 2.5], [113.3, 23.1, 2.5],
    [104.1, 30.7, 3.0], [114.3, 30.6, 2.5], [108.9, 34.3, 3.0],
    [106.5, 29.6, 2.5], [102.7, 25.0, 2.5], [117.0, 36.7, 2.5],
    [123.4, 41.8, 3.0], [118.8, 32.1, 2.5], [120.2, 30.3, 2.0],
    [125.3, 43.9, 3.0], [111.7, 40.8, 4.0], [117.2, 31.8, 2.5],
    [119.3, 26.1, 2.5], [108.4, 22.8, 3.0], [112.9, 28.2, 2.5],
    [103.8, 36.1, 3.5], [101.8, 36.6, 3.0], [106.3, 38.5, 4.0],
    [91.1,  29.6, 4.0], [87.6,  43.8, 5.0], [110.3, 20.0, 2.0],
  ]
  for (let i = 0; i < 70; i++) {
    const [cLng, cLat, r] = clusters[i % clusters.length]
    const angle = Math.random() * Math.PI * 2
    const dist  = Math.sqrt(Math.random()) * r   // sqrt for uniform disk distribution
    const lng = cLng + Math.cos(angle) * dist
    const lat = cLat + Math.sin(angle) * dist
    const pos = wPos(lng, lat, 1.44 + Math.random() * 0.15)
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(pos)
    scatterGroup.add(m)
  }
}

// ─────────────────────────────────────────────────────────────
// ANIMATE
// ─────────────────────────────────────────────────────────────
function animate() {
  animId = requestAnimationFrame(animate)
  const t = performance.now() * 0.001

  // Fly dot movement
  flyDots.forEach(d => {
    d.t = (d.t + d.speed) % 1
    d.mesh.position.copy(d.curve.getPoint(d.t))
    ;(d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(d.t * Math.PI) * 0.92
  })

  // Ripple rings
  ripples.forEach(r => {
    r.t = (r.t + 0.0065) % 1
    const s = r.t * 8 + 0.5
    r.mesh.scale.set(s, s, s)
    ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - r.t) * 0.75
  })

  // Bar emissive pulse
  barGroup.children.forEach((child: THREE.Object3D, i: number) => {
    const m = (child as THREE.Mesh).material as THREE.MeshPhongMaterial
    if (m?.emissiveIntensity !== undefined)
      m.emissiveIntensity = 0.6 + Math.sin(t * 2 + i * 0.5) * 0.22
  })

  // Camera smooth animation
  if (camAnim.active) {
    camAnim.t = Math.min(camAnim.t + 0.04, 1)
    const ease = 1 - Math.pow(1 - camAnim.t, 3)
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, ease)
    controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, ease)
    if (camAnim.t >= 1) camAnim.active = false
  }

  controls.update()
  renderer.render(scene, camera)
}

// ─────────────────────────────────────────────────────────────
// CAMERA CONTROLS
// ─────────────────────────────────────────────────────────────
function startCamAnim(toPos: THREE.Vector3, toTarget: THREE.Vector3) {
  camAnim.fromPos.copy(camera.position)
  camAnim.fromTarget.copy(controls.target)
  camAnim.toPos.copy(toPos)
  camAnim.toTarget.copy(toTarget)
  camAnim.t = 0
  camAnim.active = true
}

function camZoom(factor: number) {
  const dir = camera.position.clone().sub(controls.target)
  dir.multiplyScalar(factor)
  startCamAnim(controls.target.clone().add(dir), controls.target.clone())
}

function camTopView() { startCamAnim(TOP_POS, TOP_TARGET) }
function camReset()   { startCamAnim(INIT_POS, INIT_TARGET) }

// ─────────────────────────────────────────────────────────────
// LAYER TOGGLE
// ─────────────────────────────────────────────────────────────
function toggleLayer(key: keyof typeof layerVis) {
  layerVis[key] = !layerVis[key]
  const v = layerVis[key]
  if (!scene) return
  if (key === 'barFlyLine') { barGroup.visible = v; flyGroup.visible = v }
  if (key === 'eventLabel') { labelGroup.visible = v; if (!v) tooltip.visible = false }
  if (key === 'keyPoint')     keyGroup.visible = v
  if (key === 'heatmap')      heatGroup.visible = v
  if (key === 'scatter')      scatterGroup.visible = v
}

// ─────────────────────────────────────────────────────────────
// MOUSE HOVER TOOLTIP
// ─────────────────────────────────────────────────────────────
function onMouseMove(e: MouseEvent) {
  if (!canvasRef.value || !layerVis.eventLabel) { tooltip.visible = false; return }
  const rect = canvasRef.value.getBoundingClientRect()
  _mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
  _mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
  raycaster.setFromCamera(_mouse, camera)
  const hits = raycaster.intersectObjects(hitGroup.children)
  if (hits.length > 0) {
    const d = hits[0].object.userData
    tooltip.visible = true
    tooltip.x = e.clientX - rect.left
    tooltip.y = e.clientY - rect.top
    tooltip.name  = d.name
    tooltip.value = d.value
    tooltip.major = d.major
  } else {
    tooltip.visible = false
  }
}

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
async function init() {
  if (!canvasRef.value) return
  try {
    initScene(canvasRef.value)

    const res = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const gj = await res.json()
    gj.features = (gj.features ?? [])
      .filter((f: any) => f?.geometry?.coordinates != null)
      .map((f: any) => ({ ...f, geometry: { ...f.geometry, coordinates: cleanCoords(f.geometry.coordinates) } }))

    buildMap(gj.features)
    buildBars()
    buildFlyLines()
    buildEventLabels()
    buildHitTargets()
    buildKeyPoints()
    buildHeatmap()
    buildScatter()

    loading.value = false
    animate()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
    loading.value = false
  }
}

function onResize() {
  if (!canvasRef.value || !renderer || !camera) return
  const w = canvasRef.value.clientWidth, h = canvasRef.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

onMounted(() => {
  init()
  window.addEventListener('resize', onResize)
  canvasRef.value?.addEventListener('mousemove', onMouseMove)
  canvasRef.value?.addEventListener('mouseleave', () => { tooltip.visible = false })
})
onUnmounted(() => {
  cancelAnimationFrame(animId)
  controls?.dispose()
  renderer?.dispose()
  flyDots.length = 0; ripples.length = 0
  window.removeEventListener('resize', onResize)
  canvasRef.value?.removeEventListener('mousemove', onMouseMove)
})
</script>

<template>
  <div class="v3d">
    <canvas ref="canvasRef" class="v3d-canvas" />

    <!-- Loading -->
    <div v-if="loading" class="v3d-overlay">
      <div class="v3d-spin" />
      <span>正在初始化 3D 场景…</span>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="v3d-overlay">
      <p style="color:#ff8080;max-width:320px;text-align:center">{{ loadError }}</p>
      <button class="v3d-btn-retry" @click="loading=true;loadError='';init()">重 试</button>
    </div>

    <!-- Left panel -->
    <aside v-show="!loading&&!loadError" class="v3d-left">
      <button class="v3d-layer-btn" :class="{on:layerVis.barFlyLine}" @click="toggleLayer('barFlyLine')">
        <span class="licon bar-ic" /><span>柱子飞线</span>
      </button>
      <button class="v3d-layer-btn" :class="{on:layerVis.eventLabel}" @click="toggleLayer('eventLabel')">
        <span class="licon evt-ic" /><span>事件标签</span>
      </button>
      <button class="v3d-layer-btn" :class="{on:layerVis.keyPoint}" @click="toggleLayer('keyPoint')">
        <span class="licon key-ic" /><span>重点点位</span>
      </button>
      <button class="v3d-layer-btn" :class="{on:layerVis.heatmap}" @click="toggleLayer('heatmap')">
        <span class="licon heat-ic" /><span>热力图例</span>
      </button>
      <button class="v3d-layer-btn" :class="{on:layerVis.scatter}" @click="toggleLayer('scatter')">
        <span class="licon dot-ic" /><span>地图散点</span>
      </button>
    </aside>

    <!-- Right camera controls -->
    <aside v-show="!loading&&!loadError" class="v3d-right">
      <button class="v3d-cam-btn" @click="camZoom(0.75)" title="放大">放 大</button>
      <button class="v3d-cam-btn" @click="camZoom(1.35)" title="缩小">缩 小</button>
      <button class="v3d-cam-btn" @click="camTopView()" title="俯视">俯 视</button>
      <button class="v3d-cam-btn" @click="camReset()" title="还原">还 原</button>
    </aside>

    <!-- N compass -->
    <div v-show="!loading&&!loadError" class="v3d-compass">
      <svg t="1782351661439"
        class="icon"
        viewBox="0 0 1024 1024"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        p-id="11864"
        width="50"
        height="50">
        <path d="M694.8 512H329.2L512 0l182.8 512z" fill="#F15642" p-id="11865"></path>
        <path d="M329.2 512h365.733333L512 1024 329.2 512z" fill="#50BEE8" p-id="11866"></path>
        <path d="M694.8 512L512 0v512h182.8z" fill="#C44138" p-id="11867"></path>
        <path d="M512 512v512l182.8-512H512z" fill="#00A0C5" p-id="11868"></path>
        <path d="M475.466667 548.533333c20.133333 20.133333 52.933333 20.133333 73.2 0 20.133333-20.133333 20.133333-52.933333 0-73.2-20.133333-20.133333-52.933333-20.133333-73.2 0-20.266667 20.266667-20.266667 53.066667 0 73.2z" fill="#35495C" p-id="11869"></path>
        <path d="M493.733333 463.733333c6.666667 2.533333 12.933333 6.4 18.266667 11.733334 20.133333 20.133333 20.133333 52.933333 0 73.2-5.2 5.2-11.466667 9.2-18.266667 11.733333 26.666667 10.266667 56.533333-3.066667 66.666667-29.6 7.333333-19.066667 2.666667-40.8-11.866667-55.2-14.8-15.066667-36.4-18.8-54.8-11.866667z" fill="#123247" p-id="11870"></path>
      </svg>
      <span class="compass-n">N</span>
    </div>

    <!-- Corner brackets -->
    <div class="vcorner vtl"/><div class="vcorner vtr"/>
    <div class="vcorner vbl"/><div class="vcorner vbr"/>

    <!-- Top title -->
    <header v-show="!loading&&!loadError" class="v3d-header">
      <span class="hzh">中国数据可视化大屏</span>
      <span class="hen">3D CHINA DATA VISUALIZATION</span>
      <span class="hbadge">LIVE</span>
    </header>

    <!-- Bottom -->
    <footer v-show="!loading&&!loadError" class="v3d-footer">
      <div class="fcards">
        <div v-for="c in cities.filter(x=>x.major)" :key="c.name" class="fcard">
          <div class="fc-name">{{ c.name }}</div>
          <div class="fc-val">{{ c.value.toLocaleString() }}</div>
          <div class="fc-bar"><div class="fc-fill" :style="{width:(c.value/1200*100)+'%',background:c.major?'#ff3d8a':'#00aaff'}"/></div>
        </div>
      </div>
      <div class="fchina">中国 &nbsp;CHINA</div>
    </footer>

    <!-- City hover tooltip -->
    <Transition name="tt-fade">
      <div v-if="tooltip.visible" class="v3d-tooltip"
           :style="{ left: tooltip.x + 14 + 'px', top: tooltip.y - 10 + 'px' }">
        <span class="tt-dot" :style="{ background: tooltip.major ? '#ff3d8a' : '#00ccff' }" />
        <span class="tt-name">{{ tooltip.name }}</span>
        <span class="tt-sep">|</span>
        <span class="tt-val" :style="{ color: tooltip.major ? '#ff3d8a' : '#00e5ff' }">
          {{ tooltip.value.toLocaleString() }}
        </span>
      </div>
    </Transition>

    <!-- Color legend -->
    <div v-show="!loading&&!loadError" class="v3d-legend">
      <div class="legend-title">省份数据指标</div>
      <div class="legend-body">
        <div class="legend-bar" />
        <div class="legend-labels">
          <span>{{ PROV_MAX.toLocaleString() }}</span>
          <span>{{ Math.round((PROV_MAX + PROV_MIN) / 2).toLocaleString() }}</span>
          <span>{{ PROV_MIN.toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <!-- Hint -->
    <div v-show="!loading&&!loadError" class="v3d-hint">拖拽旋转 · 滚轮缩放</div>
  </div>
</template>

<style scoped>
.v3d {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #020b18;
  font-family: 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif;
}

.v3d-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* ── overlays ── */
.v3d-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  z-index: 30;
  color: #7fbcff;
  font-size: 14px;
}
.v3d-spin {
  width: 44px; height: 44px;
  border: 3px solid rgba(0,100,200,0.2);
  border-top-color: #00dcff;
  border-radius: 50%;
  animation: vspin 0.85s linear infinite;
}
@keyframes vspin { to { transform: rotate(360deg); } }
.v3d-btn-retry {
  padding: 9px 26px;
  background: rgba(0,50,140,0.85);
  color: #a0d0ff;
  border: 1px solid #3366ff;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

/* ── left panel ── */
.v3d-left {
  position: absolute;
  top: 50%;
  left: 18px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 9px;
  z-index: 10;
}
.v3d-layer-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 15px;
  min-width: 124px;
  background: rgba(0,14,45,0.82);
  border: 1px solid rgba(0,90,200,0.28);
  border-radius: 3px;
  color: rgba(150,195,240,0.5);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  backdrop-filter: blur(6px);
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
.v3d-layer-btn:hover {
  background: rgba(0,45,120,0.9);
  border-color: rgba(0,180,255,0.5);
  color: #b0d8f0;
}
.v3d-layer-btn.on {
  border-color: rgba(0,200,255,0.72);
  color: #c8e8ff;
  background: rgba(0,35,95,0.9);
}
.v3d-layer-btn.on .licon { opacity: 1; filter: none; }

/* ── icons ── */
.licon {
  flex-shrink: 0;
  width: 16px; height: 16px;
  border-radius: 2px;
  opacity: 0.38;
  filter: grayscale(65%);
  transition: opacity 0.18s, filter 0.18s;
}
.bar-ic  { background: linear-gradient(to top, rgba(0,80,200,0.3), #00aaff); }
.evt-ic  { background: rgba(0,255,157,0.18); border: 2px solid #00ff9d; border-radius: 50%; }
.key-ic  { background: #00ffcc; clip-path: polygon(50% 0%,100% 50%,50% 100%,0% 50%); }
.heat-ic { background: linear-gradient(135deg, #ff9900, #ff3d8a); }
.dot-ic  { width:10px; height:10px; margin:3px; background:#00ff9d; border-radius:50%; }

/* ── right camera panel ── */
.v3d-right {
  position: absolute;
  top: 50%;
  right: 18px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}
.v3d-cam-btn {
  padding: 8px 18px;
  background: rgba(0,14,45,0.82);
  border: 1px solid rgba(0,90,200,0.35);
  border-radius: 3px;
  color: rgba(150,195,240,0.7);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  backdrop-filter: blur(6px);
  min-width: 72px;
  transition: border-color 0.18s, color 0.18s, background 0.18s;
}
.v3d-cam-btn:hover {
  background: rgba(0,50,130,0.9);
  border-color: rgba(0,200,255,0.6);
  color: #c8e8ff;
}
.v3d-cam-btn:active {
  background: rgba(0,80,180,0.9);
}

/* ── N compass ── */
.v3d-compass {
  position: absolute;
  top: 60px;
  right: 110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  z-index: 10;
  pointer-events: none;
}
.compass-n {
  font-size: 11px;
  font-weight: 800;
  color: #00dcff;
  letter-spacing: 0.1em;
}

/* ── corner brackets ── */
.vcorner {
  position: absolute;
  width: 22px; height: 22px;
  border-color: rgba(0,200,255,0.6);
  border-style: solid;
  pointer-events: none;
  z-index: 5;
}
.vtl { top:13px;  left:13px;  border-width: 2px 0 0 2px; }
.vtr { top:13px;  right:13px; border-width: 2px 2px 0 0; }
.vbl { bottom:13px; left:13px;  border-width: 0 0 2px 2px; }
.vbr { bottom:13px; right:13px; border-width: 0 2px 2px 0; }

/* ── header ── */
.v3d-header {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: linear-gradient(to bottom, rgba(2,11,24,0.95), transparent);
  z-index: 10;
  pointer-events: none;
}
.hzh {
  font-size: 16px; font-weight: 700;
  color: #d0e8ff;
  letter-spacing: 0.12em;
  text-shadow: 0 0 18px rgba(0,180,255,0.5);
}
.hen {
  font-size: 10px; color: rgba(150,205,255,0.4);
  letter-spacing: 0.2em;
}
.hbadge {
  font-size: 9px; font-weight: 800; letter-spacing: 0.1em;
  padding: 2px 7px;
  background: rgba(255,50,50,0.18);
  border: 1px solid rgba(255,80,80,0.45);
  border-radius: 3px; color: #ff8080;
  animation: blink 1.6s ease-in-out infinite;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* ── footer ── */
.v3d-footer {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 10px 24px;
  background: linear-gradient(to top, rgba(2,11,24,0.96), transparent);
  z-index: 10;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  pointer-events: none;
}
.fcards { display: flex; gap: 18px; }
.fcard  { display: flex; flex-direction: column; gap: 3px; min-width: 88px; }
.fc-name { font-size: 11px; color: rgba(150,195,255,0.7); }
.fc-val  { font-size: 20px; font-weight: 700; color: #d0eaff; line-height: 1; }
.fc-bar  { height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; }
.fc-fill { height: 100%; border-radius: 2px; }
.fchina {
  font-size: 24px; font-weight: 900; letter-spacing: 0.25em;
  color: rgba(255,255,255,0.88);
  text-shadow: 0 0 28px rgba(0,180,255,0.4);
}

/* ── city hover tooltip ── */
.v3d-tooltip {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  background: rgba(0, 14, 46, 0.92);
  border: 1px solid rgba(0, 180, 255, 0.45);
  border-radius: 4px;
  backdrop-filter: blur(6px);
  pointer-events: none;
  z-index: 20;
  white-space: nowrap;
  box-shadow: 0 0 12px rgba(0, 180, 255, 0.2);
}
.tt-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tt-name {
  font-size: 13px;
  font-weight: 600;
  color: #c8e4ff;
  letter-spacing: 0.05em;
}
.tt-sep {
  font-size: 11px;
  color: rgba(100, 160, 220, 0.4);
}
.tt-val {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.tt-fade-enter-active, .tt-fade-leave-active { transition: opacity 0.12s, transform 0.12s; }
.tt-fade-enter-from, .tt-fade-leave-to { opacity: 0; transform: translateY(4px); }

/* ── color legend ── */
.v3d-legend {
  position: absolute;
  bottom: 72px;
  left: 18px;
  z-index: 10;
  pointer-events: none;
}
.legend-title {
  font-size: 10px;
  color: rgba(150,195,255,0.6);
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.legend-body {
  display: flex;
  align-items: stretch;
  gap: 7px;
}
.legend-bar {
  width: 12px;
  height: 110px;
  border-radius: 3px;
  background: linear-gradient(to bottom, #00e5ff 0%, #1055cc 50%, #051840 100%);
  box-shadow: 0 0 8px rgba(0,229,255,0.25);
}
.legend-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 10px;
  color: rgba(150,205,255,0.65);
  line-height: 1;
}

/* ── hint ── */
.v3d-hint {
  position: absolute;
  bottom: 58px; right: 18px;
  font-size: 10px;
  color: rgba(100,160,220,0.38);
  pointer-events: none;
  z-index: 5;
}
</style>
