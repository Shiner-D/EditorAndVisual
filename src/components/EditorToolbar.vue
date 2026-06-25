<script setup lang="ts">
import type { Editor } from '@tiptap/core'

import { ref } from 'vue'

const props = defineProps<{ editor: Editor | null }>()
const emit = defineEmits<{
  exportPdf: []
  previewPdf: []
  importPdf: [file: File]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerImport() {
  fileInputRef.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('importPdf', file)
  input.value = ''
}

const headingLevels = [1, 2, 3] as const

function setHeading(level: typeof headingLevels[number]) {
  props.editor?.chain().focus().toggleHeading({ level }).run()
}

function isActive(name: string | Record<string, unknown>, attrs?: Record<string, unknown>) {
  if (typeof name === 'object') {
    return props.editor?.isActive(name) ?? false
  }
  return props.editor?.isActive(name, attrs) ?? false
}

function addImage() {
  const url = prompt('输入图片URL：')
  if (url) props.editor?.chain().focus().setImage({ src: url }).run()
}

function setLink() {
  const url = prompt('输入链接URL：')
  if (url) {
    props.editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  } else {
    props.editor?.chain().focus().unsetLink().run()
  }
}

function insertTable() {
  props.editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}
</script>

<template>
  <div class="toolbar">
    <!-- History -->
    <div class="toolbar-group">
      <button title="撤销 (Ctrl+Z)" :disabled="!editor?.can().undo()" @click="editor?.chain().focus().undo().run()">
        <svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
      </button>
      <button title="重做 (Ctrl+Y)" :disabled="!editor?.can().redo()" @click="editor?.chain().focus().redo().run()">
        <svg viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
      </button>
    </div>

    <div class="divider" />

    <!-- Headings -->
    <div class="toolbar-group">
      <button
        v-for="level in headingLevels"
        :key="level"
        :class="{ active: isActive('heading', { level }) }"
        :title="`标题 ${level}`"
        @click="setHeading(level)"
      >H{{ level }}</button>
      <button :class="{ active: isActive('paragraph') }" title="正文" @click="editor?.chain().focus().setParagraph().run()">P</button>
    </div>

    <div class="divider" />

    <!-- Inline formatting -->
    <div class="toolbar-group">
      <button :class="{ active: isActive('bold') }" title="加粗 (Ctrl+B)" @click="editor?.chain().focus().toggleBold().run()">
        <svg viewBox="0 0 24 24"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>
      </button>
      <button :class="{ active: isActive('italic') }" title="斜体 (Ctrl+I)" @click="editor?.chain().focus().toggleItalic().run()">
        <svg viewBox="0 0 24 24"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z"/></svg>
      </button>
      <button :class="{ active: isActive('underline') }" title="下划线 (Ctrl+U)" @click="editor?.chain().focus().toggleUnderline().run()">
        <svg viewBox="0 0 24 24"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>
      </button>
      <button :class="{ active: isActive('strike') }" title="删除线" @click="editor?.chain().focus().toggleStrike().run()">
        <svg viewBox="0 0 24 24"><path d="M6.85 7.08C6.85 4.37 9.45 3 12.24 3c1.64 0 3 .49 3.9 1.28.77.65 1.46 1.68 1.46 3.24h-3.01c0-.31-.05-.59-.15-.85-.29-.86-1.2-1.28-2.25-1.28-1.86 0-2.34.92-2.34 1.7 0 .48.25.88.74 1.21L12 9.89h-3.55c-.29-.3-.6-.62-.6-2.81zM21 12v-2H3v2h9.62c1.15.45 1.96.75 1.96 1.97 0 1-.67 1.74-2.05 1.74-1.51 0-2.28-.72-2.28-2.01H7.61c0 .98.34 2.38 1.61 3.28.93.66 2.17 1.01 3.59 1.01C15.34 18 18 16.34 18 13.97c0-.63-.14-1.42-.64-2H21z"/></svg>
      </button>
      <button :class="{ active: isActive('highlight') }" title="高亮" @click="editor?.chain().focus().toggleHighlight().run()">
        <svg viewBox="0 0 24 24"><path d="M6 14l3 3v4h6v-4l3-3V9H6v5zm2-3h8v2.17l-3 3V19h-2v-2.83l-3-3V11zm2-9h4v2h-4zm-4.95 2.05l1.41 1.41C5.53 6.4 5 7.64 5 9H3c0-1.87.72-3.58 1.88-4.88L5.05 4.05zM20 9h-2c0-1.36-.53-2.6-1.46-3.54l1.41-1.41C19.28 5.42 20 7.13 20 9z"/></svg>
      </button>
      <button :class="{ active: isActive('code') }" title="行内代码" @click="editor?.chain().focus().toggleCode().run()">
        <svg viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
      </button>
    </div>

    <div class="divider" />

    <!-- Text alignment -->
    <div class="toolbar-group">
      <button :class="{ active: isActive({ textAlign: 'left' }) }" title="左对齐" @click="editor?.chain().focus().setTextAlign('left').run()">
        <svg viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>
      </button>
      <button :class="{ active: isActive({ textAlign: 'center' }) }" title="居中" @click="editor?.chain().focus().setTextAlign('center').run()">
        <svg viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>
      </button>
      <button :class="{ active: isActive({ textAlign: 'right' }) }" title="右对齐" @click="editor?.chain().focus().setTextAlign('right').run()">
        <svg viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>
      </button>
    </div>

    <div class="divider" />

    <!-- Lists -->
    <div class="toolbar-group">
      <button :class="{ active: isActive('bulletList') }" title="无序列表" @click="editor?.chain().focus().toggleBulletList().run()">
        <svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>
      </button>
      <button :class="{ active: isActive('orderedList') }" title="有序列表" @click="editor?.chain().focus().toggleOrderedList().run()">
        <svg viewBox="0 0 24 24"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>
      </button>
      <button :class="{ active: isActive('taskList') }" title="任务列表" @click="editor?.chain().focus().toggleTaskList().run()">
        <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      </button>
    </div>

    <div class="divider" />

    <!-- Insert -->
    <div class="toolbar-group">
      <button :class="{ active: isActive('codeBlock') }" title="代码块" @click="editor?.chain().focus().toggleCodeBlock().run()">
        <svg viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
        <span>代码块</span>
      </button>
      <button title="分割线" @click="editor?.chain().focus().setHorizontalRule().run()">
        <svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>
      </button>
      <button :class="{ active: isActive('link') }" title="链接" @click="setLink">
        <svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
      </button>
      <button title="图片" @click="addImage">
        <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
      </button>
      <button title="表格" @click="insertTable">
        <svg viewBox="0 0 24 24"><path d="M20 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 2v3H5V5h15zM5 10h4v4H5v-4zm0 9v-3h4v3H5zm6 0v-3h4v3h-4zm0-5v-4h4v4h-4zm6 5v-3h3v3h-3zm0-5v-4h3v4h-3z"/></svg>
      </button>
    </div>

    <div class="spacer" />

    <!-- Import / Export -->
    <div class="toolbar-group">
      <input
        ref="fileInputRef"
        type="file"
        accept=".pdf"
        style="display:none"
        @change="onFileSelected"
      />
      <button class="btn-import" title="导入PDF文件并转为可编辑富文本" @click="triggerImport">
        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" transform="scale(1,-1) translate(0,-24)"/></svg>
        导入PDF
      </button>
      <button class="btn-preview" title="预览PDF" @click="emit('previewPdf')">
        <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        预览
      </button>
      <button class="btn-export" title="导出PDF" @click="emit('exportPdf')">
        <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        导出PDF
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 12px;
  height: var(--toolbar-height);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
  margin: 0 4px;
  flex-shrink: 0;
}

.spacer {
  flex: 1;
}

.toolbar button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 4px;
  color: var(--color-text);
  font-size: 12px;
  transition: background 0.15s;
  white-space: nowrap;
}

.toolbar button svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
  flex-shrink: 0;
}

.toolbar button:hover:not(:disabled) {
  background: #f0f0f0;
}

.toolbar button.active {
  background: #e8eaff;
  color: var(--color-primary);
}

.toolbar button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-import {
  padding: 5px 10px !important;
  border-radius: 4px !important;
  background: #eef3ff !important;
  color: #4a6cf7 !important;
  border: 1px solid #c5d3ff !important;
}

.btn-import:hover {
  background: #dce7ff !important;
}

.btn-preview {
  padding: 5px 10px !important;
  border-radius: 4px !important;
  background: #f0f0f0 !important;
  color: #333 !important;
}

.btn-preview:hover {
  background: #e0e0e0 !important;
}

.btn-export {
  padding: 5px 10px !important;
  border-radius: 4px !important;
  background: var(--color-primary) !important;
  color: #fff !important;
}

.btn-export:hover {
  background: var(--color-primary-hover) !important;
}
</style>
