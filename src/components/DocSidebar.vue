<script setup lang="ts">
import type { Document } from '../types/document'

defineProps<{
  documents: Document[]
  activeDocId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  create: []
  delete: [id: string]
  rename: [id: string, title: string]
}>()

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function startRename(doc: Document) {
  const title = prompt('重命名文档：', doc.title)
  if (title && title.trim()) emit('rename', doc.id, title.trim())
}

function confirmDelete(doc: Document, e: MouseEvent) {
  e.stopPropagation()
  if (confirm(`删除「${doc.title}」？此操作不可撤销。`)) {
    emit('delete', doc.id)
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        知识库
      </div>
      <button class="btn-new" title="新建文档" @click="emit('create')">
        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
      </button>
    </div>

    <div class="sidebar-section-label">文档列表</div>

    <nav class="doc-list">
      <div
        v-for="doc in documents"
        :key="doc.id"
        class="doc-item"
        :class="{ active: doc.id === activeDocId }"
        @click="emit('select', doc.id)"
        @dblclick="startRename(doc)"
      >
        <svg class="doc-icon" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        <div class="doc-info">
          <span class="doc-title">{{ doc.title }}</span>
          <span class="doc-date">{{ formatDate(doc.updatedAt) }}</span>
        </div>
        <button class="doc-delete" title="删除" @click="confirmDelete(doc, $event)">
          <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </nav>

    <div v-if="documents.length === 0" class="empty-hint">
      <span>暂无文档</span>
      <button @click="emit('create')">+ 新建第一篇</button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  background: var(--color-sidebar-bg);
  color: var(--color-sidebar-text);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 12px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  color: #fff;
}

.sidebar-logo svg {
  width: 20px;
  height: 20px;
  stroke: #7c8cff;
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.btn-new {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #fff;
  transition: background 0.15s;
}

.btn-new:hover { background: rgba(255,255,255,0.12); }
.btn-new svg { width: 18px; height: 18px; fill: currentColor; }

.sidebar-section-label {
  padding: 14px 14px 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255,255,255,0.35);
  font-weight: 600;
}

.doc-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px;
}

.doc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  transition: background 0.12s;
}

.doc-item:hover { background: var(--color-sidebar-hover); }
.doc-item.active { background: var(--color-sidebar-active); }

.doc-icon {
  width: 16px;
  height: 16px;
  fill: #7c8cff;
  flex-shrink: 0;
  opacity: 0.8;
}

.doc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.doc-title {
  font-size: 13px;
  color: var(--color-sidebar-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.doc-item.active .doc-title { color: #fff; }

.doc-date {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  margin-top: 1px;
}

.doc-delete {
  display: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
}

.doc-item:hover .doc-delete { display: flex; }
.doc-delete:hover { background: rgba(255,60,60,0.3); color: #ff6b6b; }
.doc-delete svg { width: 14px; height: 14px; fill: currentColor; }

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 16px;
  color: rgba(255,255,255,0.3);
  font-size: 13px;
}

.empty-hint button {
  color: #7c8cff;
  font-size: 13px;
}

.empty-hint button:hover { text-decoration: underline; }
</style>
