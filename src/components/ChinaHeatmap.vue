<script setup lang="ts">
/**
 * ChinaHeatmap.vue — 中国省级数据色阶地图
 *
 * 依赖：
 *   - echarts ^5.x  （地图渲染、visualMap 色阶、tooltip）
 *   - 阿里云 DataV GeoJSON API（中国省级边界数据）
 *     https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
 *
 * 功能：
 *   1. 动态拉取省级 GeoJSON 并注册到 ECharts
 *   2. 支持切换「用户量 / 销售额 / 增长率」三种指标
 *   3. 鼠标悬停高亮 + Tooltip 显示排名与占比
 *   4. 右侧统计面板（合计、最高值、TOP 5 榜单）
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

// 支持的指标键名联合类型
type MetricKey = 'users' | 'sales' | 'growth'

// 每条省级数据的结构
interface DataItem { name: string; value: number }

// ── DOM 引用 & 实例 ──────────────────────────────────────────
// ref<HTMLDivElement>：绑定到模板中 ref="chartRef" 的 DOM 节点
const chartRef = ref<HTMLDivElement | null>(null)
// ECharts 实例，由 echarts.init() 返回，全局唯一
let chart: echarts.ECharts | null = null

// ── 响应式状态 ───────────────────────────────────────────────
const loading = ref(true)          // 是否正在加载 GeoJSON
const loadError = ref('')          // 加载失败时的错误信息
const activeMetric = ref<MetricKey>('users')   // 当前激活的指标
const hoveredProvince = ref<DataItem | null>(null) // 鼠标悬停的省份，用于高亮 TOP5 列表

// ── 数据集 ──────────────────────────────────────────────────
const allData: Record<MetricKey, DataItem[]> = {
  users: [
    { name: '北京', value: 712 }, { name: '天津', value: 389 },
    { name: '上海', value: 843 }, { name: '重庆', value: 521 },
    { name: '河北', value: 578 }, { name: '山西', value: 267 },
    { name: '辽宁', value: 412 }, { name: '吉林', value: 198 },
    { name: '黑龙江', value: 245 }, { name: '江苏', value: 934 },
    { name: '浙江', value: 867 }, { name: '安徽', value: 456 },
    { name: '福建', value: 534 }, { name: '江西', value: 312 },
    { name: '山东', value: 689 }, { name: '河南', value: 589 },
    { name: '湖北', value: 498 }, { name: '湖南', value: 423 },
    { name: '广东', value: 1563 }, { name: '海南', value: 134 },
    { name: '四川', value: 634 }, { name: '贵州', value: 234 },
    { name: '云南', value: 289 }, { name: '陕西', value: 367 },
    { name: '甘肃', value: 178 }, { name: '青海', value: 67 },
    { name: '内蒙古', value: 189 }, { name: '广西', value: 345 },
    { name: '西藏', value: 23 }, { name: '宁夏', value: 89 },
    { name: '新疆', value: 156 }, { name: '香港', value: 234 },
    { name: '澳门', value: 45 }, { name: '台湾', value: 312 },
  ],
  sales: [
    { name: '北京', value: 4315 }, { name: '天津', value: 1652 },
    { name: '上海', value: 7489 }, { name: '重庆', value: 2983 },
    { name: '河北', value: 3201 }, { name: '山西', value: 1098 },
    { name: '辽宁', value: 2567 }, { name: '吉林', value: 876 },
    { name: '黑龙江', value: 1134 }, { name: '江苏', value: 8234 },
    { name: '浙江', value: 7651 }, { name: '安徽', value: 2789 },
    { name: '福建', value: 3912 }, { name: '江西', value: 1567 },
    { name: '山东', value: 5623 }, { name: '河南', value: 3456 },
    { name: '湖北', value: 3189 }, { name: '湖南', value: 2678 },
    { name: '广东', value: 12456 }, { name: '海南', value: 789 },
    { name: '四川', value: 3987 }, { name: '贵州', value: 987 },
    { name: '云南', value: 1234 }, { name: '陕西', value: 1876 },
    { name: '甘肃', value: 678 }, { name: '青海', value: 234 },
    { name: '内蒙古', value: 1123 }, { name: '广西', value: 1789 },
    { name: '西藏', value: 89 }, { name: '宁夏', value: 345 },
    { name: '新疆', value: 678 }, { name: '香港', value: 2134 },
    { name: '澳门', value: 456 }, { name: '台湾', value: 1890 },
  ],
  growth: [
    { name: '北京', value: 12.3 }, { name: '天津', value: 8.7 },
    { name: '上海', value: 14.1 }, { name: '重庆', value: 18.9 },
    { name: '河北', value: 9.2 }, { name: '山西', value: 6.4 },
    { name: '辽宁', value: 5.1 }, { name: '吉林', value: 7.3 },
    { name: '黑龙江', value: 3.8 }, { name: '江苏', value: 15.6 },
    { name: '浙江', value: 16.2 }, { name: '安徽', value: 11.4 },
    { name: '福建', value: 13.7 }, { name: '江西', value: 10.2 },
    { name: '山东', value: 10.8 }, { name: '河南', value: 9.6 },
    { name: '湖北', value: 22.1 }, { name: '湖南', value: 11.9 },
    { name: '广东', value: 13.4 }, { name: '海南', value: 24.6 },
    { name: '四川', value: 17.3 }, { name: '贵州', value: 19.8 },
    { name: '云南', value: 15.1 }, { name: '陕西', value: 12.7 },
    { name: '甘肃', value: 8.9 }, { name: '青海', value: 7.2 },
    { name: '内蒙古', value: 6.8 }, { name: '广西', value: 13.2 },
    { name: '西藏', value: 28.4 }, { name: '宁夏', value: 11.5 },
    { name: '新疆', value: 20.3 }, { name: '香港', value: 4.2 },
    { name: '澳门', value: 5.6 }, { name: '台湾', value: 7.8 },
  ],
}

// 每个指标的显示配置：标签、单位、色板（从低到高）、副标题
const metricConfig: Record<MetricKey, { label: string; unit: string; colors: string[]; subtext: string }> = {
  users: {
    label: '年度用户量',
    unit: '万人',
    subtext: '注册用户数量 · 2024年度',
    // colors 数组从暗（低值）到亮（高值），供 visualMap.inRange 使用
    colors: ['#0a1628', '#0d47a1', '#1565c0', '#1976d2', '#42a5f5', '#90caf9', '#e3f2fd'],
  },
  sales: {
    label: '年度销售额',
    unit: '亿元',
    subtext: '线上线下合计 · 2024年度',
    colors: ['#160b22', '#4a148c', '#6a1b9a', '#8e24aa', '#ba68c8', '#e1bee7', '#f3e5f5'],
  },
  growth: {
    label: '同比增长率',
    unit: '%',
    subtext: '较上年度对比增长 · 2024年度',
    colors: ['#091409', '#1b5e20', '#2e7d32', '#388e3c', '#66bb6a', '#a5d6a7', '#e8f5e9'],
  },
}

// ── 纯计算工具函数 ───────────────────────────────────────────

/** 取某指标所有省份数据中的最大值，用于 visualMap.max */
function getMax(key: MetricKey) {
  return Math.max(...allData[key].map(d => d.value))
}

/** 取排名前 n 的省份，默认 5 个，用于右侧 TOP5 榜单 */
function getTopN(key: MetricKey, n = 5) {
  return [...allData[key]].sort((a, b) => b.value - a.value).slice(0, n)
}

/** 取某指标所有省份数据之和，增长率指标中用来计算平均值 */
function getTotal(key: MetricKey) {
  return allData[key].reduce((sum, d) => sum + d.value, 0)
}

/** 根据指标类型格式化数值为可读字符串 */
function formatVal(v: number, key: MetricKey) {
  if (key === 'growth') return v.toFixed(1) + '%'
  return v.toLocaleString() + ' ' + metricConfig[key].unit
}

// ── GeoJSON 清洗 ─────────────────────────────────────────────
/**
 * 阿里云 DataV GeoJSON 在坐标数组的各层级中可能存在 null 值
 * （空环、空点），ECharts 内部不做保护直接读取 null[0] 会抛错。
 * 此函数递归过滤所有 null 项，保证数据安全后再注册给 ECharts。
 */
function sanitizeGeoJson(geoJson: any): any {
  // 递归清洗：过滤 null 元素，再对数组子项继续递归
  const cleanCoords = (arr: any): any => {
    if (!Array.isArray(arr)) return arr
    return arr
      .filter((x: any) => x != null)
      .map((x: any) => Array.isArray(x) ? cleanCoords(x) : x)
  }

  if (Array.isArray(geoJson.features)) {
    geoJson.features = geoJson.features
      // 过滤 geometry 或 coordinates 为空的 Feature
      .filter((f: any) => f?.geometry?.coordinates != null)
      .map((f: any) => ({
        ...f,
        geometry: { ...f.geometry, coordinates: cleanCoords(f.geometry.coordinates) },
      }))
  }
  return geoJson
}

// ── ECharts 配置构建器 ───────────────────────────────────────
/**
 * 根据当前指标键构造完整的 ECharts option 对象。
 *
 * ECharts option 主要字段说明：
 *   backgroundColor  — 画布背景色（十六进制或 rgba）
 *   tooltip          — 鼠标悬停提示框
 *   visualMap        — 数据到颜色的映射组件（色阶条）
 *   series           — 系列数组，此处为地图系列
 */
function buildOption(key: MetricKey): echarts.EChartsOption {
  const data = allData[key]
  const cfg = metricConfig[key]
  const max = getMax(key)

  return {
    backgroundColor: '#080e1e',

    // ── tooltip 悬停提示框 ────────────────────────────────────
    tooltip: {
      trigger: 'item',            // 触发方式：'item' 表示鼠标悬停到数据项时触发（地图系列必须用此值）
      backgroundColor: 'rgba(6, 10, 24, 0.96)', // 提示框背景色
      borderColor: '#3949ab',     // 提示框边框颜色
      borderWidth: 1,             // 提示框边框宽度（px）
      padding: [10, 14],          // 内边距 [上下, 左右]（px）
      textStyle: { color: '#e8eaf6', fontSize: 13, fontFamily: 'inherit' }, // 默认文字样式
      /**
       * formatter 自定义提示框内容
       * @param params.name   — 当前悬停项的名称（省份名，已经过 nameMap 映射）
       * @param params.value  — 该省份在当前指标的数值；无数据省份为 undefined/NaN
       * @returns HTML 字符串，ECharts 直接注入到提示框 DOM 中
       */
      formatter: (params: any) => {
        if (params.value === undefined || params.value === null || isNaN(+params.value)) {
          return `<div style="font-weight:600">${params.name}</div>
                  <div style="color:#5c6bc0;margin-top:4px">暂无数据</div>`
        }
        const sorted = [...data].sort((a, b) => b.value - a.value)
        const rank = sorted.findIndex(d => d.name === params.name) + 1
        const pct = ((+params.value / getTotal(key)) * 100).toFixed(1)
        return `
          <div style="font-weight:700;font-size:14px;margin-bottom:6px">${params.name}</div>
          <div style="display:flex;justify-content:space-between;gap:20px">
            <span style="color:#7986cb">${cfg.label}</span>
            <span style="color:#64b5f6;font-weight:600">${formatVal(+params.value, key)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:20px;margin-top:3px">
            <span style="color:#7986cb">全国占比</span>
            <span style="color:#81c784">${key === 'growth' ? '—' : pct + '%'}</span>
          </div>
          <div style="color:#3f51b5;margin-top:5px;font-size:11px">全国第 ${rank} 位</div>`
      }
    },

    // ── visualMap 视觉映射（色阶条）────────────────────────────
    visualMap: {
      type: 'continuous',   // 连续型色阶（另有 'piecewise' 分段型）
      min: 0,               // 色阶映射的最小值
      max,                  // 色阶映射的最大值，动态取当前指标最大值
      left: 16,             // 距容器左边缘距离（px 或百分比）
      bottom: 50,           // 距容器底边缘距离
      orient: 'vertical',   // 色阶条方向：'vertical'（竖）或 'horizontal'（横）
      itemHeight: 160,      // 色阶条长度（px）
      text: ['高', '低'],   // 两端文字标签，顺序对应 [max端, min端]
      textStyle: { color: '#9fa8da', fontSize: 11 },
      calculable: true,     // 是否开启手柄拖拽交互（可拖动两端手柄筛选范围）
      // inRange 定义在值域范围内的视觉通道，color 为颜色列表（从 min→max 插值）
      inRange: { color: cfg.colors },
    },

    // ── series 系列 ───────────────────────────────────────────
    series: [
      {
        name: cfg.label,    // 系列名称，显示在 tooltip、legend 中
        type: 'map',        // 系列类型：地图
        map: 'china',       // 地图名称，必须与 echarts.registerMap() 的第一个参数一致
        roam: true,         // 是否开启鼠标缩放与平移漫游（true = 开启，也可设 'scale'/'move' 单独开）
        zoom: 1.2,          // 初始缩放比例（1 = 原始大小）
        center: [105, 36],  // 初始地图中心点 [经度, 纬度]，用于将地图居中到中国大陆
        /**
         * nameMap 省份名称映射表
         * 阿里云 DataV GeoJSON 使用全称（如"广东省"、"内蒙古自治区"），
         * 而 allData 使用短名（如"广东"、"内蒙古"）。
         * ECharts 通过 nameMap 将 GeoJSON 中的 name 转换后与 data[].name 匹配。
         * 格式：{ GeoJSON全称: 数据短名 }
         */
        nameMap: {
          '北京市': '北京', '天津市': '天津', '上海市': '上海', '重庆市': '重庆',
          '河北省': '河北', '山西省': '山西', '辽宁省': '辽宁', '吉林省': '吉林',
          '黑龙江省': '黑龙江', '江苏省': '江苏', '浙江省': '浙江', '安徽省': '安徽',
          '福建省': '福建', '江西省': '江西', '山东省': '山东', '河南省': '河南',
          '湖北省': '湖北', '湖南省': '湖南', '广东省': '广东', '海南省': '海南',
          '四川省': '四川', '贵州省': '贵州', '云南省': '云南', '陕西省': '陕西',
          '甘肃省': '甘肃', '青海省': '青海',
          '内蒙古自治区': '内蒙古', '广西壮族自治区': '广西',
          '西藏自治区': '西藏', '宁夏回族自治区': '宁夏', '新疆维吾尔自治区': '新疆',
          '香港特别行政区': '香港', '澳门特别行政区': '澳门', '台湾省': '台湾',
        },
        // emphasis 鼠标悬停高亮样式
        emphasis: {
          label: { show: true, color: '#fff', fontSize: 11, fontWeight: 'bold' },
          itemStyle: { areaColor: '#ffd54f', borderColor: '#fff', borderWidth: 1.5 },
        },
        selectedMode: false, // 禁用点击选中效果（地图仅用于展示，不需要选中态）
        // itemStyle 默认（非高亮）状态下的样式
        itemStyle: {
          borderColor: '#1a237e',  // 省界线颜色
          borderWidth: 0.7,        // 省界线宽度（px）
          areaColor: cfg.colors[0], // 无数据省份的填充色（取色板最暗色）
        },
        label: { show: false }, // 默认不显示省份名称标签（悬停时由 emphasis.label 控制）
        data,                   // 数据数组，格式：[{ name: '广东', value: 1563 }, ...]
      },
    ],
  }
}

// ── 生命周期 ─────────────────────────────────────────────────
/**
 * 初始化流程：
 *   1. 拉取阿里云省级 GeoJSON → 清洗 → 注册到 ECharts
 *   2. 关闭 loading（让 v-show 使图表 div 可见）
 *   3. await nextTick 等待 DOM 更新（echarts.init 需要可见节点，否则 ZRender 取不到尺寸）
 *   4. echarts.init 初始化实例 → setOption 渲染 → 绑定交互事件
 */
async function initChart() {
  if (!chartRef.value) return

  try {
    const res = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const geoJson = await res.json()

    /**
     * echarts.registerMap(mapName, geoJSON, specialAreas?)
     *   mapName    — 地图注册名，后续 series.map 引用此名称
     *   geoJSON    — 符合 GeoJSON 规范的地图数据对象
     *   specialAreas — 可选，将某些区域放大显示（如南海诸岛）
     */
    echarts.registerMap('china', sanitizeGeoJson(geoJson))

    // 先关闭 loading 使图表容器可见，再等 DOM 刷新后初始化 ECharts，
    // 避免在 display:none 节点上初始化导致 ZRender 取到 null 尺寸。
    loading.value = false
    await nextTick()

    if (!chartRef.value) return

    /**
     * echarts.init(dom, theme?, opts?)
     *   dom    — 图表容器 DOM 节点（必须有确定的宽高）
     *   theme  — 主题名称或主题配置对象（可选）
     *   opts   — 初始化参数（可选），常用：
     *              { renderer: 'canvas'|'svg', width, height, devicePixelRatio }
     * 返回 ECharts 实例（ECharts 类型）
     */
    chart = echarts.init(chartRef.value)

    /**
     * chart.setOption(option, opts?)
     *   option — ECharts 配置项对象
     *   opts   — 合并策略（可选）：
     *              notMerge: true  — 不与旧 option 合并，完全替换（切换指标时使用）
     *              lazyUpdate: true — 延迟更新（下一帧渲染，适合高频更新场景）
     *              silent: true    — 不触发事件回调
     */
    chart.setOption(buildOption(activeMetric.value))

    /**
     * chart.on(eventName, handler)
     *   注册 ECharts 事件监听，常用事件：
     *     'mouseover'  — 鼠标移入数据项
     *     'mouseout'   — 鼠标移出数据项
     *     'click'      — 点击数据项
     *     'datazoom'   — 数据区域缩放
     *   handler(params) 参数字段（地图系列）：
     *     params.name      — 悬停省份名（已经过 nameMap 转换）
     *     params.value     — 该省份数值
     *     params.data      — 原始数据对象 { name, value }
     *     params.seriesName — 系列名称
     */
    chart.on('mouseover', (params: any) => {
      const d = allData[activeMetric.value].find(x => x.name === params.name)
      hoveredProvince.value = d ?? null
    })
    chart.on('mouseout', () => { hoveredProvince.value = null })

  } catch (e) {
    console.error('[ChinaHeatmap] init error:', e)
    loadError.value = `加载失败：${e instanceof Error ? e.message : String(e)}`
    loading.value = false
  }
}

/**
 * 切换指标：更新响应式状态并用 notMerge 完全替换 option，
 * 防止旧指标的 visualMap 范围残留到新指标上。
 */
function switchMetric(key: MetricKey) {
  activeMetric.value = key
  // setOption 第二参数 { notMerge: true }：完全替换旧配置而非增量合并
  if (chart) chart.setOption(buildOption(key), { notMerge: true })
}

/**
 * chart.resize(opts?)
 *   通知 ECharts 容器尺寸已变化，重新计算布局。
 *   opts 可选：{ width, height, animation: { duration, easing } }
 *   必须在 window resize 事件中调用，否则图表不会自适应容器大小。
 */
function handleResize() { chart?.resize() }

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  /**
   * chart.dispose()
   *   销毁 ECharts 实例，释放 Canvas/SVG 资源与内存。
   *   Vue 组件卸载时必须调用，否则 ZRender 内部定时器会持续占用内存。
   */
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="hm-root">
    <!-- Header ------------------------------------------------>
    <header class="hm-header">
      <div class="hm-title">
        <svg viewBox="0 0 24 24" class="hm-title-icon">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38
           0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        <span>中国地域数据色阶图</span>
        <span class="hm-badge">DEMO</span>
      </div>

      <!-- 指标切换标签页：v-for 遍历三个指标键，点击调用 switchMetric -->
      <div class="hm-tabs">
        <button
          v-for="key in (['users', 'sales', 'growth'] as MetricKey[])"
          :key="key"
          class="hm-tab"
          :class="{ active: activeMetric === key }"
          @click="switchMetric(key)"
        >{{ metricConfig[key].label }}</button>
      </div>
    </header>

    <!-- Body -------------------------------------------------->
    <div class="hm-body">
      <!-- 加载状态遮罩 -->
      <div v-if="loading" class="hm-overlay">
        <div class="hm-spinner"></div>
        <p>正在加载地图数据...</p>
      </div>

      <!-- 错误状态遮罩：点击「重新加载」时同步重置状态再触发 initChart -->
      <div v-else-if="loadError" class="hm-overlay error">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
          10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <p>{{ loadError }}</p>
        <button @click="initChart(); loading = true; loadError = ''">重新加载</button>
      </div>

      <!-- ECharts 挂载容器：用 v-show 而非 v-if，保证 DOM 节点在 initChart 之前已存在 -->
      <div v-show="!loading && !loadError" ref="chartRef" class="hm-chart"></div>

      <!-- 右侧统计面板 -->
      <aside v-if="!loading && !loadError" class="hm-stats">
        <!-- 全国汇总卡片：增长率取均值，其他指标取总和 -->
        <div class="stat-card">
          <div class="stat-label">全国合计</div>
          <div class="stat-value">
            {{ activeMetric === 'growth'
              ? (getTotal(activeMetric) / allData[activeMetric].length).toFixed(1) + '%'
              : getTotal(activeMetric).toLocaleString() + ' ' + metricConfig[activeMetric].unit
            }}
          </div>
          <div class="stat-sub">{{ activeMetric === 'growth' ? '平均增长率' : '34 省市合计' }}</div>
        </div>

        <!-- 最高值卡片 -->
        <div class="stat-card">
          <div class="stat-label">最高值</div>
          <div class="stat-value highlight">
            {{ formatVal(getMax(activeMetric), activeMetric) }}
          </div>
          <div class="stat-sub">{{ getTopN(activeMetric, 1)[0]?.name }}</div>
        </div>

        <!-- TOP 5 榜单：hoveredProvince 与地图 mouseover 事件联动高亮 -->
        <div class="rank-panel">
          <div class="rank-title">TOP 5 省市</div>
          <div
            v-for="(item, i) in getTopN(activeMetric, 5)"
            :key="item.name"
            class="rank-item"
            :class="{ hovered: hoveredProvince?.name === item.name }"
          >
            <span class="rank-no" :class="`rank-${i + 1}`">{{ i + 1 }}</span>
            <span class="rank-name">{{ item.name }}</span>
            <span class="rank-val">{{ formatVal(item.value, activeMetric) }}</span>
          </div>
        </div>

        <!-- 数据来源副标题 -->
        <div class="hm-subtext">{{ metricConfig[activeMetric].subtext }}</div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ── layout ── */
.hm-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #080e1e;
  color: #e8eaf6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

.hm-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.hm-chart {
  flex: 1;
  height: 100%;
}

/* ── header ── */
.hm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  background: #0d1426;
  border-bottom: 1px solid #1a237e;
  flex-shrink: 0;
  gap: 16px;
}

.hm-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  color: #e8eaf6;
  white-space: nowrap;
}

.hm-title-icon {
  width: 20px;
  height: 20px;
  fill: #5c6bc0;
  flex-shrink: 0;
}

.hm-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  background: #1a237e;
  color: #7986cb;
  border-radius: 4px;
  padding: 2px 6px;
}

/* ── tabs ── */
.hm-tabs {
  display: flex;
  gap: 4px;
}

.hm-tab {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: #7986cb;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.hm-tab:hover { background: #1a237e; color: #e8eaf6; }
.hm-tab.active { background: #283593; color: #e8eaf6; font-weight: 600; }

/* ── overlay states ── */
.hm-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #7986cb;
  font-size: 14px;
  z-index: 10;
}

.hm-overlay.error { color: #ef9a9a; }
.hm-overlay.error svg { width: 40px; height: 40px; fill: #e57373; }

.hm-overlay button {
  margin-top: 4px;
  padding: 8px 20px;
  background: #283593;
  color: #e8eaf6;
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.15s;
}
.hm-overlay button:hover { background: #3949ab; }

.hm-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #1a237e;
  border-top-color: #5c6bc0;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── stats panel ── */
.hm-stats {
  width: 220px;
  flex-shrink: 0;
  background: #0d1426;
  border-left: 1px solid #1a237e;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.stat-card {
  background: #111b35;
  border: 1px solid #1a237e;
  border-radius: 8px;
  padding: 12px 14px;
}

.stat-label {
  font-size: 11px;
  color: #5c6bc0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #e8eaf6;
  line-height: 1.2;
  word-break: break-all;
}

.stat-value.highlight { color: #64b5f6; }

.stat-sub {
  font-size: 11px;
  color: #5c6bc0;
  margin-top: 2px;
}

/* ── rank panel ── */
.rank-panel {
  background: #111b35;
  border: 1px solid #1a237e;
  border-radius: 8px;
  padding: 12px 14px;
  flex: 1;
}

.rank-title {
  font-size: 11px;
  color: #5c6bc0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid #1a237e;
  transition: background 0.1s;
  border-radius: 4px;
}

.rank-item:last-child { border-bottom: none; }
.rank-item.hovered { background: rgba(83, 109, 254, 0.12); }

.rank-no {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1a237e;
  color: #7986cb;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rank-no.rank-1 { background: #b7960c; color: #fff3cd; }
.rank-no.rank-2 { background: #546e7a; color: #cfd8dc; }
.rank-no.rank-3 { background: #6d3a10; color: #ffe0b2; }

.rank-name {
  flex: 1;
  font-size: 13px;
  color: #c5cae9;
}

.rank-val {
  font-size: 12px;
  color: #64b5f6;
  font-weight: 600;
  white-space: nowrap;
}

.hm-subtext {
  font-size: 11px;
  color: #3949ab;
  text-align: center;
  padding-top: 4px;
}
</style>
