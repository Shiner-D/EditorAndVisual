<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'

type MetricKey = 'users' | 'sales' | 'growth'

interface DataItem { name: string; value: number }

const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

const loading = ref(true)
const loadError = ref('')
const activeMetric = ref<MetricKey>('users')
const hoveredProvince = ref<DataItem | null>(null)

// ── datasets ────────────────────────────────────────────────
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

const metricConfig: Record<MetricKey, { label: string; unit: string; colors: string[]; subtext: string }> = {
  users: {
    label: '年度用户量',
    unit: '万人',
    subtext: '注册用户数量 · 2024年度',
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

function getMax(key: MetricKey) {
  return Math.max(...allData[key].map(d => d.value))
}

function getTopN(key: MetricKey, n = 5) {
  return [...allData[key]].sort((a, b) => b.value - a.value).slice(0, n)
}

function getTotal(key: MetricKey) {
  return allData[key].reduce((sum, d) => sum + d.value, 0)
}

function formatVal(v: number, key: MetricKey) {
  if (key === 'growth') return v.toFixed(1) + '%'
  return v.toLocaleString() + ' ' + metricConfig[key].unit
}

// ── GeoJSON cleaner ─────────────────────────────────────────
// Aliyun DataV GeoJSON contains null entries at various levels of the
// coordinate arrays (null rings, null points). ECharts does not guard
// against these and throws "Cannot read properties of null (reading '0')".
function sanitizeGeoJson(geoJson: any): any {
  const cleanCoords = (arr: any): any => {
    if (!Array.isArray(arr)) return arr
    return arr
      .filter((x: any) => x != null)
      .map((x: any) => Array.isArray(x) ? cleanCoords(x) : x)
  }

  if (Array.isArray(geoJson.features)) {
    geoJson.features = geoJson.features
      .filter((f: any) => f?.geometry?.coordinates != null)
      .map((f: any) => ({
        ...f,
        geometry: { ...f.geometry, coordinates: cleanCoords(f.geometry.coordinates) },
      }))
  }
  return geoJson
}

// ── ECharts option builder ──────────────────────────────────
function buildOption(key: MetricKey): echarts.EChartsOption {
  const data = allData[key]
  const cfg = metricConfig[key]
  const max = getMax(key)

  return {
    backgroundColor: '#080e1e',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(6, 10, 24, 0.96)',
      borderColor: '#3949ab',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: '#e8eaf6', fontSize: 13, fontFamily: 'inherit' },
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
    visualMap: {
      type: 'continuous',
      min: 0,
      max,
      left: 16,
      bottom: 50,
      orient: 'vertical',
      itemHeight: 160,
      text: ['高', '低'],
      textStyle: { color: '#9fa8da', fontSize: 11 },
      calculable: true,
      inRange: { color: cfg.colors },
    },
    series: [
      {
        name: cfg.label,
        type: 'map',
        map: 'china',
        roam: true,
        zoom: 1.2,
        center: [105, 36],
        // Aliyun DataV GeoJSON uses full names (e.g. "广东省", "内蒙古自治区"),
        // while our data uses short names — nameMap bridges the gap.
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
        emphasis: {
          label: { show: true, color: '#fff', fontSize: 11, fontWeight: 'bold' },
          itemStyle: { areaColor: '#ffd54f', borderColor: '#fff', borderWidth: 1.5 },
        },
        selectedMode: false,
        itemStyle: {
          borderColor: '#1a237e',
          borderWidth: 0.7,
          areaColor: cfg.colors[0],
        },
        label: { show: false },
        data,
      },
    ],
  }
}

// ── lifecycle ───────────────────────────────────────────────
async function initChart() {
  if (!chartRef.value) return

  try {
    const res = await fetch('https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const geoJson = await res.json()
    echarts.registerMap('china', sanitizeGeoJson(geoJson))

    // Turn off loading first so v-show reveals the chart div,
    // then wait for the DOM update before calling echarts.init.
    // Calling echarts.init on a display:none element causes ZRender
    // to get null style values internally, leading to null[0] errors.
    loading.value = false
    await nextTick()

    if (!chartRef.value) return
    chart = echarts.init(chartRef.value)
    chart.setOption(buildOption(activeMetric.value))

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

function switchMetric(key: MetricKey) {
  activeMetric.value = key
  if (chart) chart.setOption(buildOption(key), { notMerge: true })
}

function handleResize() { chart?.resize() }

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
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
      <!-- Loading -->
      <div v-if="loading" class="hm-overlay">
        <div class="hm-spinner"></div>
        <p>正在加载地图数据...</p>
      </div>

      <!-- Error -->
      <div v-else-if="loadError" class="hm-overlay error">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
          10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        <p>{{ loadError }}</p>
        <button @click="initChart(); loading = true; loadError = ''">重新加载</button>
      </div>

      <!-- Chart -->
      <div v-show="!loading && !loadError" ref="chartRef" class="hm-chart"></div>

      <!-- Stats panel -->
      <aside v-if="!loading && !loadError" class="hm-stats">
        <!-- Summary cards -->
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

        <div class="stat-card">
          <div class="stat-label">最高值</div>
          <div class="stat-value highlight">
            {{ formatVal(getMax(activeMetric), activeMetric) }}
          </div>
          <div class="stat-sub">{{ getTopN(activeMetric, 1)[0]?.name }}</div>
        </div>

        <!-- Top 5 list -->
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

        <!-- Subtext -->
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
