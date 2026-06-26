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

// ── Three.js 核心对象 ─────────────────────────────────────────
/**
 * THREE.Scene — 场景容器，所有 3D 对象（网格/灯光/粒子）都 add 到此
 * THREE.PerspectiveCamera — 透视相机（近大远小）
 *   参数：fov（视角°）/ aspect（宽高比）/ near（近裁面）/ far（远裁面）
 * THREE.WebGLRenderer — WebGL 渲染器，将场景渲染到 canvas
 * OrbitControls — 轨道控制器（需在每帧 animate 中调用 .update()）
 */
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
/** requestAnimationFrame 返回的 ID，用于 onUnmounted 时取消动画循环 */
let animId = 0

/**
 * 相机预设位置（THREE.Vector3: x, y, z 三维坐标）
 * INIT_POS/TARGET — 斜俯视初始视角
 * TOP_POS/TARGET  — 正上方俯视视角
 */
const INIT_POS    = new THREE.Vector3(2, 50, 58)
const INIT_TARGET = new THREE.Vector3(2, 1, 0)
const TOP_POS     = new THREE.Vector3(2, 90, 1)
const TOP_TARGET  = new THREE.Vector3(2, 0, 0)

/**
 * camAnim — 相机平滑过渡动画状态机
 *   active    — 当前是否正在执行动画
 *   t         — 动画进度 [0, 1]，每帧递增
 *   fromPos   — 动画起始相机位置
 *   toPos     — 动画目标相机位置
 *   fromTarget — 动画起始 OrbitControls 焦点
 *   toTarget   — 动画目标 OrbitControls 焦点
 */
const camAnim = {
  active: false,
  t: 0,
  fromPos: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
}

/**
 * THREE.Group — 场景对象分组容器，便于批量控制显隐/变换
 * 各分组职责：
 *   barGroup    — 柱状图圆柱 + 顶部光晕圆盘
 *   flyGroup    — 飞线轨迹 + 动态光点
 *   labelGroup  — 周边国家标签精灵
 *   keyGroup    — 重点城市光圈 + 脉冲环
 *   heatGroup   — 热力图平面纹理
 *   scatterGroup — 随机散点球
 *   hitGroup    — 不可见射线检测球体（用于 hover tooltip）
 */
let barGroup: THREE.Group
let flyGroup: THREE.Group
let labelGroup: THREE.Group
let keyGroup: THREE.Group
let heatGroup: THREE.Group
let scatterGroup: THREE.Group
let hitGroup: THREE.Group

/**
 * FlyDot — 飞线上移动光点的运动状态
 *   mesh  — 光点网格对象
 *   curve — 所在贝塞尔曲线（用于 getPoint(t) 插值）
 *   t     — 当前位置进度 [0,1]，循环推进
 *   speed — 每帧步进速度（随机扰动使各线速度不同）
 *
 * Ripple — 脉冲扩散环的动画状态
 *   mesh  — 圆环网格
 *   t     — 动画进度 [0,1]，驱动缩放和透明度
 */
interface FlyDot { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; t: number; speed: number }
interface Ripple { mesh: THREE.Mesh; t: number }

const flyDots: FlyDot[] = []
const ripples: Ripple[] = []

// ── Tooltip 响应式状态 + 射线检测工具 ────────────────────────
/**
 * tooltip — 城市悬停提示框的响应式数据
 *   visible — 是否显示
 *   x / y   — canvas 内的像素坐标（跟随鼠标）
 *   name    — 城市名称
 *   value   — 业务指标值
 *   major   — 是否主要城市（控制颜色）
 */
const tooltip = reactive({ visible: false, x: 0, y: 0, name: '', value: 0, major: false })
/**
 * THREE.Raycaster — 射线投射器，用于 3D 场景中的鼠标拾取
 *   setFromCamera(mouse, camera): 从相机出发，沿鼠标方向生成射线
 *   intersectObjects(objects):    返回射线与对象列表的所有交点（按距离升序）
 *
 * THREE.Vector2 — 二维向量，存储归一化鼠标坐标 [-1,1]×[-1,1]
 */
const raycaster = new THREE.Raycaster()
const _mouse = new THREE.Vector2()

// ─────────────────────────────────────────────────────────────
// 场景初始化
// ─────────────────────────────────────────────────────────────
/**
 * initScene — 创建并配置 Three.js 渲染环境
 * @param canvas 渲染目标的 HTMLCanvasElement
 */
function initScene(canvas: HTMLCanvasElement) {
  // THREE.Scene: 所有 3D 对象的容器
  scene = new THREE.Scene()
  // scene.background: 设置场景背景色（深海蓝）
  scene.background = new THREE.Color(0x020b18)
  /**
   * THREE.FogExp2(color, density) — 指数雾效
   *   color   — 雾颜色（与背景一致，产生远处消融效果）
   *   density — 雾浓度系数（值越大雾越厚，0.008 为轻雾）
   */
  scene.fog = new THREE.FogExp2(0x020b18, 0.008)

  const w = canvas.clientWidth, h = canvas.clientHeight
  /**
   * THREE.PerspectiveCamera(fov, aspect, near, far)
   *   fov    — 垂直视角（°），35° 偏长焦，地图变形小
   *   aspect — 宽高比，保持不失真
   *   near   — 近裁面距离（<near 的对象不渲染）
   *   far    — 远裁面距离（>far 的对象不渲染）
   */
  camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 500)
  // camera.position.copy(): 从 Vector3 复制坐标到相机位置
  camera.position.copy(INIT_POS)
  // camera.lookAt(): 让相机朝向指定世界坐标点
  camera.lookAt(INIT_TARGET)

  /**
   * THREE.WebGLRenderer({ canvas, antialias })
   *   canvas    — 绑定已有 canvas 元素（而非让 Three.js 自动创建）
   *   antialias — 开启多重采样抗锯齿（MSAA），边缘更平滑
   *
   * setPixelRatio: 设备像素比（限制最大 2x 防止高 DPI 设备性能过载）
   * setSize(w, h, updateStyle=false): 设置渲染分辨率
   *   第三参数 false — 不修改 canvas 的 CSS 尺寸（由 CSS 控制布局）
   */
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)

  /**
   * OrbitControls(camera, domElement) — 轨道控制器
   *   target        — 旋转/缩放的焦点坐标
   *   enableDamping — 开启惯性阻尼（拖拽松手后平滑减速）
   *   dampingFactor — 阻尼系数（0~1，越小惯性越强）
   *   minDistance   — 相机最近可拉到的距离
   *   maxDistance   — 相机最远可推到的距离
   *   maxPolarAngle — 极角上限（防止翻转到地图下方，PI/2 = 水平）
   *
   * 注意：开启 damping 后每帧必须调用 controls.update()
   */
  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(INIT_TARGET)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 15
  controls.maxDistance = 130
  controls.maxPolarAngle = Math.PI / 2.08
  controls.update()

  // ── 光源配置 ──
  /**
   * THREE.AmbientLight(color, intensity) — 环境光
   *   无方向，均匀照亮所有面，防止背光面全黑
   *   intensity=2.8 补足场景整体亮度
   */
  scene.add(new THREE.AmbientLight(0x2244aa, 2.8))
  /**
   * THREE.DirectionalLight(color, intensity) — 平行光（模拟太阳光）
   *   dirA: 来自南偏上方，照亮省份顶面和南侧面（主光源，蓝白色）
   *   dirB: 来自北偏上方，提供背面补光（深蓝，弱填充）
   *   position.set(x,y,z): 设定光线方向（平行光位置只决定方向）
   */
  const dirA = new THREE.DirectionalLight(0x88bbff, 2.4)
  dirA.position.set(5, 50, 40)   // 南偏上方 → 照亮顶面和南侧
  scene.add(dirA)
  const dirB = new THREE.DirectionalLight(0x0022aa, 1.0)
  dirB.position.set(-10, 15, -20) // 北偏上方 → 背面补光
  scene.add(dirB)

  /**
   * THREE.GridHelper(size, divisions, color1, color2)
   *   size      — 网格总尺寸
   *   divisions — 分割数（线条数量）
   *   color1    — 中心轴线颜色
   *   color2    — 普通格线颜色
   *   position.y = -0.2: 略低于地表，避免与地图 Z-fighting
   */
  const grid = new THREE.GridHelper(200, 80, 0x0a1e3a, 0x051428)
  grid.position.y = -0.2
  scene.add(grid)

  buildParticles()

  // 初始化各图层分组并一次性加入场景
  barGroup    = new THREE.Group()
  flyGroup    = new THREE.Group()
  labelGroup  = new THREE.Group()
  keyGroup    = new THREE.Group()
  heatGroup   = new THREE.Group()
  scatterGroup= new THREE.Group()
  hitGroup    = new THREE.Group()
  // scene.add(...groups): 支持可变参数，一次添加多个对象
  scene.add(barGroup, flyGroup, labelGroup, keyGroup, heatGroup, scatterGroup, hitGroup)
}

// ─────────────────────────────────────────────────────────────
// 背景粒子星空
// ─────────────────────────────────────────────────────────────
/**
 * buildParticles — 在场景中随机散布 2800 个漂浮粒子，营造星空感
 *
 * 使用 BufferGeometry 而非 Geometry（已废弃），GPU 直接读取内存布局
 */
function buildParticles() {
  const n = 2800
  /**
   * Float32Array(n*3): 平铺存储 n 个点的 [x,y,z]，内存紧凑，适合 GPU 传输
   * 布局：[x0,y0,z0, x1,y1,z1, ..., xn,yn,zn]
   */
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 160  // X: [-80, 80]
    pos[i*3+1] = Math.random() * 60            // Y: [0, 60]（在地图上方漂浮）
    pos[i*3+2] = (Math.random() - 0.5) * 160  // Z: [-80, 80]
  }
  /**
   * THREE.BufferGeometry — 高性能几何体，通过属性缓冲区描述顶点数据
   * setAttribute('position', buffer): 设置顶点位置属性
   *
   * THREE.BufferAttribute(array, itemSize)
   *   array    — 数据源（TypedArray）
   *   itemSize — 每个顶点占用的元素个数（位置 = 3: x/y/z）
   */
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  /**
   * THREE.Points — 点云渲染对象（每个顶点渲染为一个方形点）
   * THREE.PointsMaterial 参数：
   *   color          — 点颜色
   *   size           — 点的世界空间大小
   *   transparent    — 开启透明度
   *   opacity        — 整体不透明度
   *   sizeAttenuation — true=距离越远点越小（透视缩放）
   */
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x1a3a88, size: 0.15, transparent: true, opacity: 0.5, sizeAttenuation: true,
  })))
}

// ─────────────────────────────────────────────────────────────
// GeoJSON 数据清洗
// ─────────────────────────────────────────────────────────────
/**
 * cleanCoords — 递归过滤 GeoJSON 坐标数组中的 null/undefined 值
 * 阿里云 DataV GeoJSON 部分节点存在空坐标，不处理会导致 Shape 构建报错
 * @param a 任意层级的坐标嵌套数组
 * @returns 清洗后的坐标数组
 */
function cleanCoords(a: any): any {
  if (!Array.isArray(a)) return a
  return a.filter((x: any) => x != null).map((x: any) => Array.isArray(x) ? cleanCoords(x) : x)
}

// ─────────────────────────────────────────────────────────────
// 省份地图构建（色阶 Choropleth + 3D 拉伸）
//
// 坐标空间转换说明：
//   GeoJSON 坐标在 ExtrudeGeometry 的局部 XY 平面中描述轮廓
//   网格旋转 -90°（绕 X 轴）后：
//     局部 X → 世界 X（东西方向）
//     局部 Y → 世界 -Z（南北方向，Y 越大越靠北）
//     局部 Z（拉伸方向）→ 世界 Y（高度，向上生长）
// ─────────────────────────────────────────────────────────────
/**
 * buildMap — 根据 GeoJSON features 构建 3D 省份地图
 * @param features GeoJSON FeatureCollection 中的 feature 数组
 *                 每个 feature 包含 geometry（坐标）和 properties（名称等属性）
 */
function buildMap(features: any[]) {
  /**
   * THREE.MeshPhongMaterial — Phong 光照模型材质（支持高光反射）
   *   color           — 漫反射颜色（基础色）
   *   emissive        — 自发光颜色（不受光源影响，始终可见）
   *   emissiveIntensity — 自发光强度倍数
   *   shininess       — 高光集中程度（越大高光越亮越小）
   *   transparent     — 启用透明度混合
   *   opacity         — 不透明度 [0,1]
   *
   * sideMat: 省份侧面（墙壁）共用一个材质，节省 GPU Draw Call
   */
  const sideMat = new THREE.MeshPhongMaterial({
    color: 0x0a2ae,
    emissive: 0x020816,
    emissiveIntensity: 0.9,
    shininess: 15,
    transparent: true,
    opacity: 0.75,
  })
  /**
   * THREE.LineBasicMaterial — 线段专用材质（不支持光照，仅颜色+透明度）
   * 用于渲染省份顶面边界线
   */
  const borderMat = new THREE.LineBasicMaterial({
    color: 0x4af0ff,
    transparent: true,
    opacity: 0.9,
  })

  /**
   * capCache — 省份名 → 顶面材质的缓存 Map
   * 同一省份可能有多个多边形（如岛屿），共用同一材质避免重复创建
   * color.clone().multiplyScalar(0.28): 将省份颜色压暗 72% 作为自发光色，
   *   使省份在暗光下仍有轻微发光感
   */
  const capCache = new Map<string, THREE.MeshPhongMaterial>()

  for (const f of features) {
    const geo = f?.geometry
    if (!geo?.coordinates) continue

    // 从 GeoJSON properties 读取省份名称，匹配 provinceData 中的指标值
    const provName: string = f?.properties?.name ?? ''
    if (!capCache.has(provName)) {
      const val = provinceData[provName] ?? PROV_MIN
      const col = provinceColor(val)
      capCache.set(provName, new THREE.MeshPhongMaterial({
        color: col,
        // multiplyScalar(0.28): 颜色各通道乘以系数，作为自发光底色
        emissive: col.clone().multiplyScalar(0.28),
        emissiveIntensity: 0.6,
        shininess: 50,
        transparent: true,
        opacity: 0.82,
      }))
    }
    const capMat = capCache.get(provName)!

    // GeoJSON Polygon: coordinates=[ring, hole1, ...]
    // MultiPolygon: coordinates=[[ring, hole1], [ring2, hole2], ...]
    // 统一转为 MultiPolygon 格式处理
    const polys: number[][][][] = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates
    for (const poly of polys) {
      if (!poly?.[0] || poly[0].length < 3) continue
      try {
        const [outer, ...holes] = poly
        /**
         * THREE.Shape — 2D 形状轮廓（类似 SVG path），由一系列点定义
         *   moveTo(x,y): 移动到起点（不画线）
         *   lineTo(x,y): 从当前点连线到目标点
         * 坐标映射：GeoJSON 经度→局部 X，纬度→局部 Y（旋转后成为世界 Z）
         */
        const shape = new THREE.Shape()
        for (let i = 0; i < outer.length; i++) {
          const c = outer[i]
          if (typeof c[0] !== 'number') continue
          const lx = (c[0] - CLng) * SCALE
          const ly = (c[1] - CLat) * SCALE
          i === 0 ? shape.moveTo(lx, ly) : shape.lineTo(lx, ly)
        }
        /**
         * THREE.Path — Shape 内部的孔洞轮廓
         * shape.holes: 数组，存放所有孔洞（如湖泊、内飞地）
         * 孔洞区域在拉伸时会被挖空
         */
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

        /**
         * THREE.ExtrudeGeometry(shape, options) — 将 2D 轮廓拉伸为 3D 体
         *   depth        — 拉伸深度（在局部 Z 方向，旋转后变为世界 Y 高度）
         *   bevelEnabled — 是否添加倒角（false=直角边缘，保持地图边界清晰）
         *
         * new THREE.Mesh(geometry, materials[]) — 材质数组：
         *   index 0 → 拉伸面（顶面+底面）= capMat（色阶颜色）
         *   index 1 → 侧面 = sideMat（深蓝统一色）
         *
         * mesh.rotation.x = -PI/2: 将局部 XY 平面旋转到世界 XZ 平面
         *   使拉伸方向（局部 Z）变为世界 Y（向上），实现 3D 凸起效果
         */
        const exGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false })
        const mesh = new THREE.Mesh(exGeo, [capMat, sideMat])
        mesh.rotation.x = -Math.PI / 2
        scene.add(mesh)

        /**
         * 省份顶面边界线：在世界 Y=1.42（地图顶面）处绘制轮廓线
         * THREE.BufferGeometry().setFromPoints(pts): 从 Vector3 数组快速构建线段几何体
         * THREE.Line(geometry, material): 连续折线（逐点相连）
         */
        const pts = outer
          .filter((c: number[]) => typeof c[0] === 'number')
          .map((c: number[]) => new THREE.Vector3(
            (c[0] - CLng) * SCALE, 1.42, -(c[1] - CLat) * SCALE,
          ))
        if (pts.length > 1) {
          scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), borderMat))
        }
      } catch { /* 跳过坐标损坏的 feature，不中断整体渲染 */ }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 柱状图 + 飞线
// ─────────────────────────────────────────────────────────────
/** buildBars — 为每个城市生成数据柱（圆柱体 + 外发光壳 + 顶部光圈） */
function buildBars() {
  const MAP_TOP = 1.42  // 地图顶面的世界 Y 坐标

  cities.forEach(city => {
    const pos = wPos(city.lng, city.lat, MAP_TOP)
    const h = city.value * 0.007  // 柱高 = 指标值 × 系数（线性映射）
    const isMaj = city.major
    const col  = isMaj ? 0xff3d8a : 0x00aaff   // 主城市粉红，次城市蓝
    const emCol = isMaj ? 0xff0060 : 0x0055ff  // 自发光色（比主色更深）

    /**
     * THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
     *   radiusTop    — 顶部半径（略小，形成微锥形）
     *   radiusBottom — 底部半径
     *   height       — 圆柱高度（由 city.value 驱动）
     *   radialSegments — 圆周分段数（12=十二边形，近似圆）
     *
     * position.set(x, MAP_TOP + h/2, z): 圆柱中心在高度方向居中，
     *   底部恰好落在地图顶面
     */
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, h, 12),
      new THREE.MeshPhongMaterial({ color: col, emissive: emCol, emissiveIntensity: 0.8, shininess: 80, transparent: true, opacity: 0.9 }),
    )
    bar.position.set(pos.x, MAP_TOP + h / 2, pos.z)
    barGroup.add(bar)

    /**
     * 外发光壳：半径更大的圆柱，仅渲染背面（BackSide）
     *   THREE.BackSide — 只渲染内表面，从外部看就是光晕效果
     *   THREE.AdditiveBlending — 加法混合：颜色叠加亮化，不遮挡背后内容
     *   depthWrite: false — 不写入深度缓冲，防止遮挡透明对象
     *   opacity: 0.08 — 极低不透明度，产生柔和光晕
     */
    const glowBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, h, 12),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    glowBar.position.copy(bar.position)
    barGroup.add(glowBar)

    /**
     * THREE.CircleGeometry(radius, segments) — 圆形平面几何体
     *   rotation.x = -PI/2: 将圆从 XY 平面旋转到 XZ 平面（水平朝上）
     *   position Y = MAP_TOP + h: 放置在柱顶端
     *   THREE.DoubleSide — 正反两面都渲染（水平圆从上下都可见）
     */
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.04, 12),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    )
    disc.rotation.x = -Math.PI / 2
    disc.position.set(pos.x, MAP_TOP + h, pos.z)
    barGroup.add(disc)
  })
}

/** buildFlyLines — 在城市间构建弧形飞线轨迹及沿线移动的光点 */
function buildFlyLines() {
  const MAP_TOP = 1.42
  /**
   * THREE.MeshBasicMaterial — 不受光照影响的基础材质（始终显示固定颜色）
   * 适合发光线条/粒子等不需要光照计算的元素
   */
  const trailMat = new THREE.LineBasicMaterial({
    color: 0x66aaff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  /**
   * THREE.SphereGeometry(radius, widthSegments, heightSegments)
   *   widthSegments/heightSegments: 球面的经纬分段数，8×8 足够小球平滑
   */
  const dotGeo = new THREE.SphereGeometry(0.06, 12, 12)

  for (const [fn, tn] of flyLines) {
    const fc = cities.find(c => c.name === fn)
    const tc = cities.find(c => c.name === tn)
    if (!fc || !tc) continue

    const start = wPos(fc.lng, fc.lat, MAP_TOP)
    const end   = wPos(tc.lng, tc.lat, MAP_TOP)
    /**
     * 二次贝塞尔曲线控制点：取起止点中点后上移
     *   multiplyScalar(0.5): Vector3 各分量乘以 0.5（即取中点）
     *   上移量 = 两点距离 × 0.42 + 2，距离越远弧越高
     */
    const mid = start.clone().add(end).multiplyScalar(0.5)
    mid.y += start.distanceTo(end) * 0.42 + 2

    /**
     * THREE.QuadraticBezierCurve3(v0, v1, v2) — 三维二次贝塞尔曲线
     *   v0 — 起点，v1 — 控制点（不经过），v2 — 终点
     *
     * curve.getPoints(n): 返回曲线上均匀分布的 n+1 个 Vector3 采样点
     * BufferGeometry().setFromPoints(pts): 从点数组构建线段几何体
     */
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    flyGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)), trailMat))

    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    flyGroup.add(dot)
    /**
     * flyDots 记录每条飞线的光点状态：
     *   t: Math.random() — 随机初始位置，避免所有点同步运动
     *   speed: 加入随机扰动，使各飞线节奏不同
     *   animate() 中通过 curve.getPoint(t) 实时更新位置
     */
    flyDots.push({ mesh: dot, curve, t: Math.random(), speed: 0.003 + Math.random() * 0.002 })
  }
}

// ─────────────────────────────────────────────────────────────
// 标签精灵
// ─────────────────────────────────────────────────────────────
/**
 * rrect — 在 Canvas 2D 上绘制圆角矩形路径（辅助函数）
 * Canvas 原生不提供圆角矩形，通过 arcTo 逐段绘制四个圆角
 *
 * ctx.arcTo(x1,y1, x2,y2, r): 以切线方向绘制半径为 r 的圆弧
 *   从当前点出发，朝 (x1,y1) 方向，圆弧与 (x1,y1)→(x2,y2) 相切
 *
 * @param ctx Canvas 2D 渲染上下文
 * @param x,y 矩形左上角坐标
 * @param w,h 矩形宽高
 * @param r   圆角半径
 */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

/**
 * buildEventLabels — 构建周边国家的 3D 标签精灵
 * 城市标签已改为鼠标悬停 tooltip（见 buildHitTargets），此处仅保留国家标签
 *
 * 技术原理：
 *   在 Canvas 上绘制文字→转为纹理→挂载到 THREE.Sprite
 *   Sprite 始终面向相机（Billboard），适合 HUD/标签类元素
 */
function buildEventLabels() {
  const MAP_TOP = 1.42
  countryLabels.forEach(cl => {
    // 离屏 Canvas 绘制标签背景 + 文字
    const cv = document.createElement('canvas'); cv.width = 112; cv.height = 40
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = 'rgba(0,30,80,0.7)'; ctx.strokeStyle = '#2255aa'; ctx.lineWidth = 1.5
    rrect(ctx, 2, 4, 108, 32, 4); ctx.fill(); ctx.stroke()  // 圆角矩形背景
    ctx.fillStyle = '#5599cc'; ctx.font = '13px Microsoft YaHei,sans-serif'
    ctx.textAlign = 'center'; ctx.fillText(cl.name, 56, 25)  // 居中文字

    /**
     * THREE.Sprite(material) — 永远面向相机的平面精灵
     *   不受 rotation 影响，始终正对相机（Billboard 效果）
     *
     * THREE.SpriteMaterial 参数：
     *   map      — 纹理贴图（此处来自离屏 Canvas）
     *   depthTest: false — 不进行深度测试，标签始终显示在地图上方
     *
     * THREE.CanvasTexture(canvas): 将 Canvas 元素转为 Three.js 纹理
     *
     * sp.scale.set(3, 1, 1): 宽高比 3:1，匹配 Canvas 的 112:40 近似比例
     */
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }))
    const pos = wPos(cl.lng, cl.lat, MAP_TOP + 3)  // 浮于地图表面 3 个单位高
    sp.position.copy(pos)
    sp.scale.set(3, 1, 1)
    labelGroup.add(sp)
  })
}

// ─────────────────────────────────────────────────────────────
// 鼠标拾取碰撞体（不可见球体，用于 hover 检测）
// ─────────────────────────────────────────────────────────────
/**
 * buildHitTargets — 为每个城市创建不可见球形碰撞体
 *
 * 原理：Three.js Raycaster 无法直接拾取 Sprite，需要在相同位置
 *   放置可被射线检测的网格，通过 visible:false 隐藏但保留碰撞响应
 *
 * mesh.userData: Three.js Object3D 的自定义数据字典
 *   存储城市元数据，射线命中时通过 hits[0].object.userData 读取
 */
function buildHitTargets() {
  // 半径 1.8：足够大让用户轻松悬停到，又不会和相邻城市重叠
  const geo = new THREE.SphereGeometry(1.8, 8, 8)
  // visible:false — 不渲染，但仍参与射线检测
  const mat = new THREE.MeshBasicMaterial({ visible: false })
  cities.forEach(city => {
    const pos = wPos(city.lng, city.lat, 3)  // Y=3，悬于柱状图区域中段
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(pos)
    // userData 挂载城市信息，命中时在 onMouseMove 中读取显示 tooltip
    m.userData = { name: city.name, value: city.value, major: city.major }
    hitGroup.add(m)
  })
}

// ─────────────────────────────────────────────────────────────
// 重点城市标记（脉冲光圈 + 轨道环）
// ─────────────────────────────────────────────────────────────
/**
 * buildKeyPoints — 为高价值城市（value>550）添加中心球 + 三重脉冲环
 * 北京额外添加两圈静态轨道大环，突出首都地位
 */
function buildKeyPoints() {
  const MAP_TOP = 1.42
  /**
   * THREE.SphereGeometry(radius, widthSegs, heightSegs)
   *   14×14 分段：小球但足够平滑（8×8 看起来会有明显多边形感）
   */
  const sphereGeo = new THREE.SphereGeometry(0.28, 14, 14)

  cities.filter(c => c.value > 550).forEach(city => {
    const pos = wPos(city.lng, city.lat, MAP_TOP)
    const col    = city.major ? 0xff3d8a : 0x00ffcc  // 中心球颜色
    const glowCol = city.major ? 0xff3d8a : 0x00e5ff // 光圈颜色

    // 中心发光球：略高于地表，与柱底部重叠产生底座感
    const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({
      color: col, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    sphere.position.set(pos.x, MAP_TOP + 0.28, pos.z)
    keyGroup.add(sphere)

    /**
     * 三重脉冲扩散环（错开初始进度 i/3，使动画有层次感）
     *
     * THREE.RingGeometry(innerRadius, outerRadius, thetaSegments)
     *   innerRadius — 环内径
     *   outerRadius — 环外径（outerRadius-innerRadius = 环宽）
     *   thetaSegments — 圆周分段数（40=接近正圆）
     *
     * rotation.x = -PI/2: 环从 XY 平面旋转到 XZ 平面（水平放置）
     *
     * ripples 数组记录每个环的动画状态：
     *   animate() 中每帧推进 t，驱动 scale 扩大 + opacity 减小，模拟扩散波
     */
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
      ripples.push({ mesh: ring, t: i / 3 })  // 错开起始进度
    }
  })

  // 北京专属大轨道环：静态装饰，半径逐渐增大，不透明度递减
  const bj = cities.find(c => c.name === '北京')!
  const bjPos = wPos(bj.lng, bj.lat, MAP_TOP + 0.1)
  for (let i = 0; i < 2; i++) {
    const r = 2.2 + i * 1.4  // 两圈半径：2.2 和 3.6
    /**
     * RingGeometry(r, r+0.1, 64): 外径比内径大 0.1，细环线
     * 64 段：大环需要更多分段才能保持圆润
     */
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
// 热力图（Canvas 密度着色 → 平铺纹理）
// ─────────────────────────────────────────────────────────────
/**
 * buildHeatmap — 生成经典密度热力图，铺满整个中国地图区域
 *
 * 三步流程：
 *   Pass 1: 离屏 Canvas 上叠加各城市白色辐射渐变（'lighter' 合成模式）
 *           → 密集区累加亮度，无城市覆盖处保持完全透明（alpha=0）
 *   Pass 2: 逐像素读取亮度值，通过分段线性函数映射到热力色板
 *           蓝(冷) → 青 → 绿 → 黄 → 橙 → 红(热)
 *   Pass 3: Canvas 转 Three.js 纹理，贴到水平 PlaneGeometry 上
 */
function buildHeatmap() {
  /**
   * 中国地图在世界坐标系中的边界（与 wPos 投影公式一致）
   *   经度 73–135°E 映射到世界 X: -18.56 ~ 17.40
   *   纬度 53–18°N  映射到世界 Z: -9.86 ~ 10.44（北纬为负 Z）
   */
  const MAP_X_MIN = (73  - CLng) * SCALE  // 西边界 ≈ -18.56
  const MAP_X_MAX = (135 - CLng) * SCALE  // 东边界 ≈  17.40
  const MAP_Z_MIN = -(53 - CLat) * SCALE  // 北边界 ≈  -9.86
  const MAP_Z_MAX = -(18 - CLat) * SCALE  // 南边界 ≈  10.44
  const MAP_W = MAP_X_MAX - MAP_X_MIN     // 东西跨度 ≈ 35.96 世界单位
  const MAP_H = MAP_Z_MAX - MAP_Z_MIN     // 南北跨度 ≈ 20.30 世界单位

  // Canvas 分辨率 1024×578（按地图长宽比缩放保持不失真）
  const CW = 1024
  const CH = Math.round(CW * MAP_H / MAP_W)

  // ── Pass 1: 叠加白色辐射渐变（强度图）──────────────────────
  const cv = document.createElement('canvas')
  cv.width = CW; cv.height = CH
  const ctx = cv.getContext('2d')!
  /**
   * clearRect: 背景保持完全透明（alpha=0），这是关键
   * 若用 fillStyle='#000' 填充黑色（不透明），则整个矩形平面在三维场景中可见，
   * 造成地图四周出现明显矩形边框
   */
  ctx.clearRect(0, 0, CW, CH)

  cities.forEach(city => {
    // 城市经纬度 → 世界坐标 → Canvas 像素坐标
    // Canvas Y=0 对应北（小世界Z），Y=CH 对应南（大世界Z），与 flipY 纹理映射一致
    const wX = (city.lng - CLng) * SCALE
    const wZ = -(city.lat - CLat) * SCALE
    const px = (wX - MAP_X_MIN) / MAP_W * CW
    const py = (wZ - MAP_Z_MIN) / MAP_H * CH

    /**
     * 渐变半径控制在 1.5–4.0 世界单位，避免热力扩散到中国边境外
     * （北京到上海约 6 世界单位，半径 4 确保热斑不相互完全融合）
     */
    const rWorld = city.major
      ? (city.value / 1200) * 1.5 + 2.5   // 主城市：2.5–4.0 wu
      : (city.value / 1200) * 1.3 + 1.5   // 次城市：1.5–2.8 wu
    const rPx = rWorld / MAP_W * CW

    /**
     * createRadialGradient(x0,y0,r0, x1,y1,r1): 径向渐变
     *   内圆 r0=0（点源），外圆 r1=rPx（影响范围边界）
     *
     * globalCompositeOperation='lighter': 加法混合
     *   多城市重叠处亮度叠加，模拟热量累积效果
     *   未被覆盖的像素 alpha 保持 0，三维场景中完全透明
     */
    const g = ctx.createRadialGradient(px, py, 0, px, py, rPx)
    g.addColorStop(0,    'rgba(255,255,255,1)')    // 热核：纯白
    g.addColorStop(0.25, 'rgba(200,200,200,0.85)') // 内区：亮灰
    g.addColorStop(0.60, 'rgba(70,70,70,0.40)')    // 过渡：暗灰半透
    g.addColorStop(1,    'rgba(0,0,0,0)')           // 边缘：完全透明
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(px, py, rPx, 0, Math.PI * 2)
    ctx.fill()
  })

  // ── Pass 2: 亮度 → 热力色板（逐像素重写 RGBA）─────────────
  /**
   * getImageData: 读取全部像素，data 为 Uint8ClampedArray
   * 排列格式：[R0,G0,B0,A0, R1,G1,B1,A1, ...]，每像素 4 字节
   */
  const id = ctx.getImageData(0, 0, CW, CH)
  const d  = id.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue   // 未被渐变覆盖的透明像素直接跳过
    const v = d[i] / 255           // R 通道亮度归一化 [0,1]（RGB 相同，取任意一个）
    let r = 0, g = 0, b = 0, a = 0
    if (v > 0.01) {
      /**
       * 分段线性色板映射（6 段）：
       *   [0.00, 0.20) → 深蓝渐变：仅蓝通道增长
       *   [0.20, 0.38) → 青色渐变：绿增蓝减
       *   [0.38, 0.56) → 绿色渐变：绿保持，蓝归零
       *   [0.56, 0.72) → 黄色渐变：红增绿保
       *   [0.72, 0.88) → 橙色渐变：红满绿减
       *   [0.88, 1.00] → 纯红：最高热度
       * alpha 随热度提升，低热区域更透明以与地图自然融合
       */
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
  // putImageData: 将修改后的像素写回 Canvas，完成上色
  ctx.putImageData(id, 0, 0)

  // ── Pass 3: 纹理贴到水平平面 ───────────────────────────────
  /**
   * THREE.PlaneGeometry(w, h): 宽×高的矩形平面，默认在局部 XY 平面
   * THREE.CanvasTexture: 将 Canvas 转为 GPU 纹理（默认 flipY=true）
   *   flipY=true 时 UV(0,0)对应 Canvas 底部（南），UV(1,1)对应 Canvas 顶部（北）
   *   旋转 -PI/2 后局部 +Y → 世界 -Z（北），UV 与地图方向完美对齐
   *
   * rotation.x = -PI/2: 平面从 XY 旋转到 XZ（水平铺在地图表面）
   * Y=1.48: 略高于地图顶面（1.42），防止 Z-fighting 闪烁
   * 中心坐标取地图世界坐标范围的几何中心
   */
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W, MAP_H),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
      opacity: 0.90,
      blending: THREE.AdditiveBlending,  // 热力色叠加在地图上，不遮挡底层
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
// 随机散点
// ─────────────────────────────────────────────────────────────
/**
 * buildScatter — 在省份聚簇中心周围随机生成 70 个漂浮小球
 *
 * 算法：极坐标均匀圆盘采样
 *   angle = random * 2PI（均匀方向）
 *   dist  = sqrt(random) * r（sqrt 修正使面积密度均匀，否则中心密集边缘稀疏）
 *   最终点 = (cos(angle)*dist, sin(angle)*dist) + 聚簇中心
 */
function buildScatter() {
  /** SphereGeometry(0.14, 6, 6): 极小球，6 段足够，节省顶点数 */
  const geo = new THREE.SphereGeometry(0.14, 6, 6)
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ff9d, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
  /**
   * clusters: 各省/主要区域中心坐标 + 散布半径 [lng, lat, radius°]
   * 覆盖中国大陆主要区域，避免散点落在海洋或境外
   * 元组格式：[中心经度, 中心纬度, 散布半径（经纬度）]
   */
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
    const [cLng, cLat, r] = clusters[i % clusters.length]  // 轮询聚簇中心
    const angle = Math.random() * Math.PI * 2
    const dist  = Math.sqrt(Math.random()) * r   // sqrt 保证圆盘内均匀分布
    const lng = cLng + Math.cos(angle) * dist
    const lat = cLat + Math.sin(angle) * dist
    // wPos: 将经纬度映射到世界坐标，Y=1.44~1.59 使小球漂浮在地图顶面之上
    const pos = wPos(lng, lat, 1.44 + Math.random() * 0.15)
    const m = new THREE.Mesh(geo, mat)  // Mesh(geometry, material): 可渲染网格
    m.position.copy(pos)                // copy(v): 将 Vector3 xyz 分量复制到 m.position
    scatterGroup.add(m)                 // add(): 将网格加入图层组，统一控制可见性
  }
}

// ─────────────────────────────────────────────────────────────
// ANIMATE
// ─────────────────────────────────────────────────────────────
/**
 * animate — 主渲染循环（帧驱动动画）
 *
 * requestAnimationFrame(callback): 浏览器原生 API
 *   在下一次重绘前调用 callback，返回 ID 可传给 cancelAnimationFrame 取消
 *   约 60fps（根据显示器刷新率），后台标签自动节流以节省 CPU/GPU
 */
function animate() {
  animId = requestAnimationFrame(animate)    // 注册下一帧，形成循环；ID 存入 animId 供卸载时取消
  const t = performance.now() * 0.001       // performance.now(): 高精度毫秒时间戳，转秒作为动画时钟

  // ── 飞弧光点移动 ────────────────────────────────────────────
  flyDots.forEach(d => {
    d.t = (d.t + d.speed) % 1              // 进度 [0,1) 循环；speed 决定光点速度
    // getPoint(t): QuadraticBezierCurve3 在参数 t 处的插值位置，返回 THREE.Vector3
    d.mesh.position.copy(d.curve.getPoint(d.t))
    // opacity 用正弦半波：t=0/1 端点接近 0，t=0.5 中段最亮（0.92）
    // 模拟光点从飞弧起点出发，中途最亮，到达终点后淡出的视觉效果
    ;(d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(d.t * Math.PI) * 0.92
  })

  // ── 波纹扩散动画 ────────────────────────────────────────────
  ripples.forEach(r => {
    r.t = (r.t + 0.0065) % 1              // 扩散进度 [0,1) 循环
    const s = r.t * 8 + 0.5              // 缩放因子 0.5→8.5，波纹从小到大扩散
    // scale.set(x,y,z): 设置 Object3D 的三轴缩放，等比缩放使波纹环形均匀扩展
    r.mesh.scale.set(s, s, s)
    // 透明度随扩散线性衰减：t=0→0.75 最浓，t=1→0 消失，模拟波纹能量耗散
    ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - r.t) * 0.75
  })

  // ── 柱状图自发光脉冲 ────────────────────────────────────────
  barGroup.children.forEach((child: THREE.Object3D, i: number) => {
    const m = (child as THREE.Mesh).material as THREE.MeshPhongMaterial
    if (m?.emissiveIntensity !== undefined)
      // emissiveIntensity: MeshPhongMaterial 自发光强度系数（乘以 emissive 颜色）
      // sin(t*2 + i*0.5): 每根柱子相位偏移 i*0.5，形成错峰脉动效果，避免同步闪烁
      m.emissiveIntensity = 0.6 + Math.sin(t * 2 + i * 0.5) * 0.22
  })

  // ── 相机平滑动画 ────────────────────────────────────────────
  if (camAnim.active) {
    camAnim.t = Math.min(camAnim.t + 0.04, 1)          // 每帧步进 0.04，约 25 帧（~0.4s@60fps）完成
    const ease = 1 - Math.pow(1 - camAnim.t, 3)        // cubic ease-out：起步快，结尾缓减速，视觉更自然
    // lerpVectors(a, b, t): 将自身设为 a + (b-a)*t 的线性插值，三轴同时插值
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, ease)
    // 同步插值 OrbitControls 目标点，使相机旋转中心也平滑迁移，避免视角跳变
    controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, ease)
    if (camAnim.t >= 1) camAnim.active = false          // 动画完成，关闭标志，停止插值
  }

  // controls.update(): 应用轨道阻尼（dampingFactor），enableDamping=true 时每帧必须调用
  controls.update()
  // renderer.render(scene, camera): 遍历场景图，调用 WebGL draw call 输出到 Canvas
  renderer.render(scene, camera)
}

// ─────────────────────────────────────────────────────────────
// CAMERA CONTROLS
// ─────────────────────────────────────────────────────────────
/**
 * startCamAnim — 启动相机平滑移动动画
 * @param toPos    目标相机位置（Three.js 世界坐标）
 * @param toTarget 目标 OrbitControls 中心点（相机将朝向此点）
 *
 * 实现：记录当前起始状态，重置进度 t=0 并激活标志
 * animate() 循环检测 camAnim.active，每帧按 ease-out 插值推进
 */
function startCamAnim(toPos: THREE.Vector3, toTarget: THREE.Vector3) {
  camAnim.fromPos.copy(camera.position)    // copy(v): 将 v 的 xyz 复制到当前 Vector3
  camAnim.fromTarget.copy(controls.target) // controls.target: OrbitControls 当前注视中心点
  camAnim.toPos.copy(toPos)
  camAnim.toTarget.copy(toTarget)
  camAnim.t = 0           // 动画进度归零
  camAnim.active = true   // 激活动画，animate() 将每帧推进
}

/**
 * camZoom — 沿当前视线方向相对缩放
 * @param factor 缩放因子：< 1 拉近，> 1 拉远
 *
 * 原理：
 *   dir = camera.position − target（从目标指向相机的方向向量，长度=当前距离）
 *   新相机位 = target + dir × factor
 *   factor=0.7 → 距离缩短为 70%；factor=1.5 → 距离增加到 150%
 */
function camZoom(factor: number) {
  // clone(): 复制 Vector3 以免修改原始值
  // sub(v): 向量减法，结果为从 target 指向 camera 的偏移向量
  const dir = camera.position.clone().sub(controls.target)
  dir.multiplyScalar(factor)  // multiplyScalar(s): 向量数乘，改变长度（即距离）
  // add(v): 向量加法，将偏移量叠加在目标点上，得到新相机位
  startCamAnim(controls.target.clone().add(dir), controls.target.clone())
}

/** camTopView — 切换到正上方俯视视角（从高空垂直向下看） */
function camTopView() { startCamAnim(TOP_POS, TOP_TARGET) }
/** camReset   — 恢复默认斜视初始视角 */
function camReset()   { startCamAnim(INIT_POS, INIT_TARGET) }

// ─────────────────────────────────────────────────────────────
// LAYER TOGGLE
// ─────────────────────────────────────────────────────────────
/**
 * toggleLayer — 切换指定图层的显示/隐藏状态
 * @param key layerVis 响应式对象的键名，对应不同可视化图层
 *
 * THREE.Object3D.visible: boolean
 *   true  → 该对象及其整棵子树参与渲染（产生 draw call）
 *   false → 整棵子树跳过渲染，GPU 无需处理，性能友好
 *
 * 特殊处理：
 *   barFlyLine → 同时控制柱状图组（barGroup）和飞线组（flyGroup）
 *   eventLabel → 隐藏时同步清除 tooltip，防止标签不可见时悬浮框残留
 */
function toggleLayer(key: keyof typeof layerVis) {
  layerVis[key] = !layerVis[key]    // reactive 对象取反，UI 面板复选框自动同步
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
/**
 * onMouseMove — 鼠标移动处理：射线检测碰撞体，驱动悬浮提示显示
 *
 * NDC（规范化设备坐标）转换公式：
 *   _mouse.x =  (clientX - left) / width  * 2 - 1   → [-1, 1]，左(-1)→右(+1)
 *   _mouse.y = -(clientY - top)  / height * 2 + 1   → [-1, 1]，上(+1)→下(-1)
 *   注意 Y 轴方向与屏幕坐标相反（屏幕向下为正，NDC 向上为正）
 *
 * raycaster.setFromCamera(mouse: Vector2, camera: Camera):
 *   根据 NDC 坐标和透视相机参数构造从相机原点出发的射线
 *
 * raycaster.intersectObjects(objects: Object3D[], recursive?: boolean):
 *   @param objects   待检测对象列表（hitGroup 的不可见碰撞平面）
 *   @returns 按射线距离从近到远排序的碰撞结果 IntersectionArray
 *            每项包含 { distance, point, face, object, ... }
 *
 * hits[0].object.userData: 命中首个对象挂载的业务数据（在 buildHitTargets 中写入）
 */
function onMouseMove(e: MouseEvent) {
  if (!canvasRef.value || !layerVis.eventLabel) { tooltip.visible = false; return }
  // getBoundingClientRect(): 获取 Canvas 元素相对浏览器视口的位置和尺寸
  const rect = canvasRef.value.getBoundingClientRect()
  _mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1
  _mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1
  raycaster.setFromCamera(_mouse, camera)
  const hits = raycaster.intersectObjects(hitGroup.children)
  if (hits.length > 0) {
    const d = hits[0].object.userData  // userData: 碰撞体绑定的自定义数据 {name, value, major}
    tooltip.visible = true
    tooltip.x = e.clientX - rect.left  // 转为 Canvas 局部坐标，用于 CSS absolute 定位 tooltip
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
/**
 * init — 异步总初始化入口
 *
 * 执行顺序：
 *   1. initScene()         → 创建 Three.js 场景、相机、渲染器、灯光、网格
 *   2. fetch GeoJSON       → 阿里云 DataV 获取国家级行政区划数据（100000_full）
 *   3. cleanCoords()       → 过滤 null/NaN/超范围坐标，防止 ExtrudeGeometry 崩溃
 *   4. buildMap()          → 挤出省级多边形 + 省界线
 *   5. buildBars()         → 数据柱状图 + 光晕外壳
 *   6. buildFlyLines()     → 贝塞尔飞线 + 光点动画
 *   7. buildEventLabels()  → Canvas 标签 Sprite
 *   8. buildHitTargets()   → 不可见碰撞平面（Raycaster 用）
 *   9. buildKeyPoints()    → 波纹关键地点 + 轨道环
 *  10. buildHeatmap()      → 密度热力图（三遍算法）
 *  11. buildScatter()      → 随机漂浮散点
 *  12. animate()           → 启动帧循环
 *
 * 错误处理：fetch 失败或 HTTP 非 2xx → loadError 显示错误提示，关闭加载遮罩
 */
async function init() {
  if (!canvasRef.value) return
  try {
    initScene(canvasRef.value)

    // 阿里云 DataV GeoJSON 接口：100000 = 全国，_full = 包含省级子区划边界
    const res = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const gj = await res.json()
    // 过滤 geometry 为 null 的要素（海外飞地/特殊区域），并逐要素清洗坐标数组
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

    loading.value = false  // 关闭 v-if 加载遮罩
    animate()              // 启动 requestAnimationFrame 渲染循环
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
    loading.value = false
  }
}

/**
 * onResize — 响应窗口/容器尺寸变化，同步相机和渲染器
 *
 * camera.aspect = w/h:
 *   更新透视相机宽高比，防止内容拉伸或压缩
 *
 * camera.updateProjectionMatrix():
 *   重新计算投影矩阵（4×4），aspect/fov/near/far 任意一项改变后必须调用
 *   否则渲染结果仍使用旧的投影参数
 *
 * renderer.setSize(w, h, false):
 *   调整渲染缓冲区分辨率
 *   第三参数 false：不修改 Canvas CSS 尺寸（由 CSS width:100%;height:100% 控制）
 */
function onResize() {
  if (!canvasRef.value || !renderer || !camera) return
  const w = canvasRef.value.clientWidth, h = canvasRef.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

/**
 * onMounted — Vue 生命周期钩子：组件挂载到 DOM 后触发
 *
 * 此时 canvasRef.value 指向真实 DOM 节点，可安全传入 Three.js WebGLRenderer
 * 注册三个事件监听：
 *   resize    → onResize()：响应浏览器窗口大小变化
 *   mousemove → onMouseMove()：实时 Raycaster 碰撞检测驱动 tooltip
 *   mouseleave → 鼠标离开 Canvas 时立即隐藏 tooltip，防止残留
 */
onMounted(() => {
  init()
  window.addEventListener('resize', onResize)
  canvasRef.value?.addEventListener('mousemove', onMouseMove)
  canvasRef.value?.addEventListener('mouseleave', () => { tooltip.visible = false })
})

/**
 * onUnmounted — Vue 生命周期钩子：组件卸载前触发
 *
 * 必须释放所有 Three.js 资源，否则 WebGL 上下文泄漏导致内存持续增长：
 *   cancelAnimationFrame(animId): 停止渲染循环，否则 animate() 继续执行并持有场景引用
 *   controls.dispose():  移除 OrbitControls 绑定的 DOM 鼠标/触摸/滚轮事件
 *   renderer.dispose():  释放 WebGL 上下文（VRAM 中的纹理缓冲、着色器程序、帧缓冲）
 *   flyDots/ripples.length=0: 清空动画状态数组，释放 Mesh/Curve 对象引用
 * 同时移除 window/canvas 上注册的事件监听，避免内存泄漏和组件卸载后的回调触发
 */
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
