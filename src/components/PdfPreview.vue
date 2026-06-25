<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'

// Use Vite's ?url import so the worker file is bundled correctly
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const props = defineProps<{ pdfBlob: Blob | null }>()
const emit = defineEmits<{ close: [] }>()

const containerRef = ref<HTMLDivElement | null>(null)
const currentPage = ref(1)
const totalPages = ref(0)
const scale = ref(1.4)
const loading = ref(false)
const canvases = ref<HTMLCanvasElement[]>([])

let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null
let objectUrl: string | null = null

async function loadPdf(blob: Blob) {
  loading.value = true
  canvases.value = []

  if (objectUrl) URL.revokeObjectURL(objectUrl)
  if (pdfDoc) {
    await pdfDoc.destroy()
    pdfDoc = null
  }

  objectUrl = URL.createObjectURL(blob)
  const task = pdfjsLib.getDocument({ url: objectUrl })
  pdfDoc = await task.promise
  totalPages.value = pdfDoc.numPages
  loading.value = false

  // Wait for Vue to update DOM (v-show now controls display,
  // so containerRef exists but we still flush to be safe)
  await nextTick()
  await renderAllPages()
}

async function renderAllPages() {
  if (!pdfDoc || !containerRef.value) return
  containerRef.value.innerHTML = ''
  canvases.value = []

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale: scale.value })

    const canvas = document.createElement('canvas')
    canvas.className = 'pdf-page-canvas'
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.dataset.page = String(pageNum)

    containerRef.value.appendChild(canvas)
    canvases.value.push(canvas)

    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
  }
}

watch(() => props.pdfBlob, async (blob) => {
  if (blob) await loadPdf(blob)
})

watch(scale, async () => {
  if (pdfDoc) await renderAllPages()
})

function handleScroll() {
  if (!containerRef.value) return
  const scrollTop = containerRef.value.scrollTop
  for (const canvas of canvases.value) {
    if (canvas.offsetTop + canvas.offsetHeight > scrollTop) {
      currentPage.value = Number(canvas.dataset.page)
      break
    }
  }
}

function goToPage(n: number) {
  const canvas = canvases.value[n - 1]
  if (canvas && containerRef.value) {
    containerRef.value.scrollTo({ top: canvas.offsetTop - 16, behavior: 'smooth' })
  }
}

onMounted(() => {
  if (props.pdfBlob) loadPdf(props.pdfBlob)
})

onBeforeUnmount(() => {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  pdfDoc?.destroy()
})
</script>

<template>
  <div class="preview-overlay" @click.self="emit('close')">
    <div class="preview-panel">
      <!-- Header -->
      <div class="preview-header">
        <span class="preview-title">PDF 预览</span>
        <div class="preview-controls">
          <button @click="scale = Math.max(0.5, +(scale - 0.2).toFixed(1))" title="缩小">
            <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
          </button>
          <span class="scale-label">{{ Math.round(scale * 100) }}%</span>
          <button @click="scale = Math.min(3, +(scale + 0.2).toFixed(1))" title="放大">
            <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
          <span class="page-info" v-if="totalPages">{{ currentPage }} / {{ totalPages }}</span>
          <button @click="goToPage(Math.max(1, currentPage - 1))" :disabled="currentPage <= 1">‹</button>
          <button @click="goToPage(Math.min(totalPages, currentPage + 1))" :disabled="currentPage >= totalPages">›</button>
        </div>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <!-- Content: always render both; use v-show so containerRef is always in DOM -->
      <div class="preview-body">
        <div v-show="loading" class="loading">
          <div class="spinner" />
          <span>生成预览中...</span>
        </div>
        <div
          v-show="!loading"
          ref="containerRef"
          class="pdf-container"
          @scroll="handleScroll"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.preview-panel {
  width: 90vw;
  max-width: 960px;
  height: 90vh;
  background: var(--color-surface);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}

.preview-header {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 52px;
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
  flex-shrink: 0;
}

.preview-title {
  font-weight: 600;
  font-size: 15px;
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.preview-controls button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  font-size: 16px;
  color: var(--color-text);
}

.preview-controls button:hover:not(:disabled) { background: #f0f0f0; }
.preview-controls button:disabled { opacity: 0.35; cursor: not-allowed; }

.preview-controls svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.scale-label, .page-info {
  font-size: 13px;
  color: var(--color-text-muted);
  min-width: 40px;
  text-align: center;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 14px;
  color: #666;
  margin-left: 8px;
}

.close-btn:hover { background: #f0f0f0; }

.preview-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100%;
  color: var(--color-text-muted);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #eee;
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.pdf-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #808080;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  height: 100%;
}
</style>

<style>
.pdf-page-canvas {
  display: block;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  border-radius: 2px;
  max-width: 100%;
}
</style>
