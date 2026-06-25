<script setup lang="ts">
import { ref, computed } from 'vue'
import DocSidebar from './components/DocSidebar.vue'
import EditorToolbar from './components/EditorToolbar.vue'
import RichEditor from './components/RichEditor.vue'
import PdfPreview from './components/PdfPreview.vue'
import ChinaHeatmap from './components/ChinaHeatmap.vue'
import China3DViz from './components/China3DViz.vue'
import { useDocumentStore } from './stores/documentStore'
import { exportToPdf, htmlToPdfBlob } from './utils/exportPdf'
import { parsePdfToHtml } from './utils/importPdf'

type AppView = 'editor' | 'heatmap' | 'viz3d'
const currentView = ref<AppView>('editor')

const store = useDocumentStore()
const editorRef = ref<InstanceType<typeof RichEditor> | null>(null)
const showPreview = ref(false)
const pdfBlob = ref<Blob | null>(null)
const importing = ref(false)

const activeDoc = computed(() => store.getActiveDocument())

// Auto-create first doc
if (store.documents.value.length === 0) {
  const doc = store.createDocument()
  doc.title = '欢迎使用知识库'
  doc.content = `<h1>欢迎使用知识库系统</h1>
<p>这是一个基于 <strong>Tiptap</strong> + <strong>Vue 3</strong> 的富文本编辑器，支持：</p>
<ul>
  <li>标题、正文、列表、表格等常用格式</li>
  <li>代码块、任务列表、图片、链接</li>
  <li>一键导出 PDF 或预览 PDF</li>
</ul>
<h2>快速开始</h2>
<p>在左侧点击 <strong>+</strong> 新建文档，双击文档名可重命名。</p>
<h2>键盘快捷键</h2>
<ul>
  <li><code>Ctrl+B</code> — 加粗</li>
  <li><code>Ctrl+I</code> — 斜体</li>
  <li><code>Ctrl+U</code> — 下划线</li>
  <li><code>Ctrl+Z</code> — 撤销</li>
  <li><code>#</code> + 空格 — 一级标题</li>
  <li><code>##</code> + 空格 — 二级标题</li>
  <li><code>-</code> + 空格 — 无序列表</li>
  <li><code>1.</code> + 空格 — 有序列表</li>
  <li><code>[]</code> + 空格 — 任务列表</li>
</ul>`
}

function handleUpdate(html: string) {
  if (activeDoc.value) {
    store.updateDocument(activeDoc.value.id, { content: html })
  }
}

function handleTitleChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (activeDoc.value) {
    store.updateDocument(activeDoc.value.id, { title: input.value })
  }
}

function getEditorHtml(): string {
  return editorRef.value?.editor?.getHTML() ?? ''
}

async function handleExportPdf() {
  if (!activeDoc.value) return
  const html = getEditorHtml()
  await exportToPdf(activeDoc.value.title, html, `${activeDoc.value.title}.pdf`)
}

async function handleImportPdf(file: File) {
  importing.value = true
  try {
    const { title, html } = await parsePdfToHtml(file)
    const doc = store.createDocument()
    store.updateDocument(doc.id, { title: title || file.name.replace(/\.pdf$/i, ''), content: html })
    store.activeDocId.value = doc.id
  } catch (err) {
    console.error('PDF import failed', err)
    alert('PDF 解析失败，请确认文件包含可提取的文本内容。')
  } finally {
    importing.value = false
  }
}

async function handlePreviewPdf() {
  if (!activeDoc.value) return
  const html = getEditorHtml()
  pdfBlob.value = await htmlToPdfBlob(activeDoc.value.title, html)
  showPreview.value = true
}
</script>

<template>
  <div class="app-root">
    <!-- Top nav tabs -->
    <nav class="app-topnav">
      <div class="topnav-brand">
        <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        知识库系统
      </div>
      <div class="topnav-tabs">
        <button
          class="topnav-tab"
          :class="{ active: currentView === 'editor' }"
          @click="currentView = 'editor'"
        >
          <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          文档编辑
        </button>
        <button
          class="topnav-tab"
          :class="{ active: currentView === 'heatmap' }"
          @click="currentView = 'heatmap'"
        >
          <svg viewBox="0 0 24 24"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>
          色阶地图示例
        </button>
        <button
          class="topnav-tab"
          :class="{ active: currentView === 'viz3d' }"
          @click="currentView = 'viz3d'"
        >
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          3D 可视化大屏
        </button>
      </div>
    </nav>

    <!-- Content area -->
    <div class="app-content">
      <!-- Heatmap view -->
      <ChinaHeatmap v-if="currentView === 'heatmap'" />

      <!-- 3D Viz view -->
      <China3DViz v-else-if="currentView === 'viz3d'" />

      <!-- Editor view -->
      <div v-else-if="currentView === 'editor'" class="app-layout">
    <!-- Sidebar -->
    <DocSidebar
      :documents="store.documents.value"
      :active-doc-id="store.activeDocId.value"
      @select="(id) => (store.activeDocId.value = id)"
      @create="store.createDocument"
      @delete="store.deleteDocument"
      @rename="(id, title) => store.updateDocument(id, { title })"
    />

    <!-- Main -->
    <main class="main-area">
      <template v-if="activeDoc">
        <!-- Toolbar -->
        <EditorToolbar
          :editor="editorRef?.editor ?? null"
          @export-pdf="handleExportPdf"
          @preview-pdf="handlePreviewPdf"
          @import-pdf="handleImportPdf"
        />

        <!-- Title -->
        <div class="doc-title-bar">
          <input
            class="doc-title-input"
            :value="activeDoc.title"
            placeholder="文档标题"
            @input="handleTitleChange"
          />
        </div>

        <!-- Editor -->
        <RichEditor
          ref="editorRef"
          :content="activeDoc.content"
          :doc-id="activeDoc.id"
          @update="handleUpdate"
        />
      </template>

      <div v-else class="empty-state">
        <div class="empty-icon">📄</div>
        <p>请从左侧选择或新建文档</p>
        <button @click="store.createDocument">+ 新建文档</button>
      </div>
    </main>

    <!-- PDF Preview Modal -->
    <PdfPreview
      v-if="showPreview"
      :pdf-blob="pdfBlob"
      @close="showPreview = false"
    />

    <!-- Import loading overlay -->
    <div v-if="importing" class="import-overlay">
      <div class="import-spinner">
        <svg viewBox="0 0 24 24" class="spin"><path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z"/></svg>
        <span>正在渲染 PDF 页面...</span>
        <small>每页生成预览图 + 提取可编辑文本</small>
      </div>
    </div>
      </div><!-- end editor view -->
    </div><!-- end app-content -->
  </div><!-- end app-root -->
</template>

<style scoped>
/* ── root shell ── */
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ── top navigation ── */
.app-topnav {
  display: flex;
  align-items: center;
  height: 44px;
  background: #1e2030;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding: 0 16px;
  gap: 0;
  flex-shrink: 0;
}

.topnav-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: #c8ccd8;
  margin-right: 20px;
  white-space: nowrap;
}

.topnav-brand svg {
  width: 16px;
  height: 16px;
  stroke: #7c8cff;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.topnav-tabs {
  display: flex;
  gap: 2px;
}

.topnav-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  height: 32px;
  border-radius: 6px;
  font-size: 13px;
  color: rgba(200, 204, 216, 0.6);
  transition: background 0.14s, color 0.14s;
}

.topnav-tab svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
  flex-shrink: 0;
}

.topnav-tab:hover {
  background: rgba(255, 255, 255, 0.07);
  color: #c8ccd8;
}

.topnav-tab.active {
  background: rgba(124, 140, 255, 0.18);
  color: #a0aaff;
  font-weight: 600;
}

/* ── content area (below nav) ── */
.app-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.app-content > .app-layout {
  flex: 1;
}

/* ── editor layout (same as before) ── */
.app-layout {
  display: flex;
  overflow: hidden;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
}

.doc-title-bar {
  padding: 20px 60px 0;
  background: var(--color-surface);
}

.doc-title-input {
  width: 100%;
  max-width: 860px;
  border: none;
  outline: none;
  font-size: 26px;
  font-weight: 700;
  color: var(--color-text);
  background: transparent;
  line-height: 1.3;
  padding-bottom: 12px;
  border-bottom: 2px solid transparent;
  transition: border-color 0.2s;
}

.doc-title-input:focus {
  border-bottom-color: var(--color-primary);
}

.doc-title-input::placeholder {
  color: #ccc;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-muted);
}

.empty-icon {
  font-size: 48px;
}

.empty-state p {
  font-size: 15px;
}

.empty-state button {
  margin-top: 8px;
  padding: 8px 20px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 6px;
  font-size: 14px;
  transition: background 0.15s;
}

.empty-state button:hover {
  background: var(--color-primary-hover);
}

.import-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.import-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 10px;
  padding: 32px 40px;
  font-size: 15px;
  color: #333;
}

.import-spinner small {
  font-size: 12px;
  color: #888;
}

.import-spinner svg {
  width: 36px;
  height: 36px;
  fill: var(--color-primary);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 0.9s linear infinite;
}
</style>
