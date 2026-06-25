<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Underline from '@tiptap/extension-underline'
import Strike from '@tiptap/extension-strike'
import Code from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'
import Heading from '@tiptap/extension-heading'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import History from '@tiptap/extension-history'
import Placeholder from '@tiptap/extension-placeholder'

const props = defineProps<{
  content: string
  docId: string
}>()

const emit = defineEmits<{
  update: [html: string]
}>()

const editorRef = ref<HTMLElement | null>(null)

const editor = useEditor({
  extensions: [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    CodeBlock,
    Heading.configure({ levels: [1, 2, 3] }),
    BulletList,
    OrderedList,
    ListItem,
    TaskList,
    TaskItem.configure({ nested: true }),
    HorizontalRule,
    Image.configure({ allowBase64: true }),
    Link.configure({ openOnClick: false }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Highlight,
    History,
    Placeholder.configure({ placeholder: '开始输入内容，支持 Markdown 快捷键...' }),
  ],
  content: props.content,
  onUpdate({ editor }) {
    emit('update', editor.getHTML())
  },
})

watch(() => props.docId, () => {
  editor.value?.commands.setContent(props.content, false)
})

watch(() => props.content, (newContent) => {
  const editorContent = editor.value?.getHTML()
  if (editorContent !== newContent) {
    editor.value?.commands.setContent(newContent, false)
  }
})

defineExpose({ editor })

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div ref="editorRef" class="editor-wrapper">
    <EditorContent :editor="editor" class="editor-content" />
  </div>
</template>

<style scoped>
.editor-wrapper {
  flex: 1;
  overflow-y: auto;
  background: var(--color-surface);
  display: flex;
  justify-content: center;
}

.editor-content {
  width: 100%;
  max-width: 860px;
  padding: 40px 60px;
}
</style>

<style>
/* Global ProseMirror styles */
.ProseMirror {
  outline: none;
  min-height: 600px;
  font-size: 15px;
  line-height: 1.7;
  color: #1a1a1a;
}

.ProseMirror p {
  margin: 0.4em 0;
}

.ProseMirror h1 { font-size: 2em; font-weight: 700; margin: 0.8em 0 0.4em; }
.ProseMirror h2 { font-size: 1.5em; font-weight: 600; margin: 0.8em 0 0.4em; }
.ProseMirror h3 { font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.4em; }

.ProseMirror ul, .ProseMirror ol {
  padding-left: 1.5em;
  margin: 0.4em 0;
}

.ProseMirror li > p { margin: 0; }

.ProseMirror ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

.ProseMirror ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.ProseMirror ul[data-type="taskList"] li > label {
  flex-shrink: 0;
  padding-top: 2px;
}

.ProseMirror ul[data-type="taskList"] li > div {
  flex: 1;
}

.ProseMirror blockquote {
  border-left: 3px solid #ddd;
  padding-left: 1em;
  color: #666;
  margin: 0.5em 0;
}

.ProseMirror code {
  background: #f0f0f0;
  border-radius: 3px;
  padding: 1px 4px;
  font-family: 'Fira Code', monospace;
  font-size: 0.9em;
}

.ProseMirror pre {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 6px;
  padding: 16px;
  margin: 0.6em 0;
  overflow-x: auto;
}

.ProseMirror pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: 0.9em;
}

.ProseMirror hr {
  border: none;
  border-top: 2px solid #eee;
  margin: 1.5em 0;
}

.ProseMirror img {
  max-width: 100%;
  border-radius: 4px;
  display: block;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  margin: 8px 0;
}

.ProseMirror a {
  color: var(--color-primary);
  text-decoration: underline;
}

.ProseMirror mark {
  background: #ffe066;
  border-radius: 2px;
  padding: 0 2px;
}

/* Table styles */
.ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.6em 0;
  overflow: hidden;
}

.ProseMirror table td, .ProseMirror table th {
  border: 1px solid #ddd;
  padding: 6px 12px;
  position: relative;
  min-width: 80px;
}

.ProseMirror table th {
  background: #f5f5f5;
  font-weight: 600;
}

.ProseMirror table .selectedCell:after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(79, 110, 247, 0.15);
  pointer-events: none;
}

/* Placeholder */
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: #aaa;
  pointer-events: none;
  float: left;
  height: 0;
}
</style>
