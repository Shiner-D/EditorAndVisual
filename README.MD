# 知识库文档管理系统

基于 Vue 3 + TypeScript + Tiptap 构建的纯前端知识库应用，支持富文本编辑、PDF 导入导出与本地持久化存储。

---

## 目录

- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [功能说明](#功能说明)
  - [文档管理](#文档管理)
  - [富文本编辑器](#富文本编辑器)
  - [PDF 导出](#pdf-导出)
  - [PDF 导入](#pdf-导入)
  - [PDF 预览](#pdf-预览)
  - [本地持久化](#本地持久化)
- [核心模块实现](#核心模块实现)
  - [状态管理 documentStore](#状态管理-documentstore)
  - [富文本编辑器 RichEditor](#富文本编辑器-richeditor)
  - [工具栏 EditorToolbar](#工具栏-editortoolbar)
  - [侧边栏 DocSidebar](#侧边栏-docsidebar)
  - [PDF 导出实现 exportPdf](#pdf-导出实现-exportpdf)
  - [PDF 导入实现 importPdf](#pdf-导入实现-importpdf)
  - [PDF 预览 PdfPreview](#pdf-预览-pdfpreview)

---

## 技术栈

| 类别 | 技术 | 版本 |
| ---- | ---- | ---- |
| 前端框架 | Vue 3 | ^3.5.13 |
| 开发语言 | TypeScript | ^5.7.2 |
| 构建工具 | Vite | ^6.0.5 |
| 富文本编辑器 | Tiptap | ^2.10.4 |
| PDF 渲染 | pdfjs-dist | ^4.9.155 |
| HTML 截图 | html2canvas | ^1.4.1 |
| PDF 生成 | jsPDF | ^2.5.2 |

> 无需后端，所有功能均在浏览器端完成。

---

## 项目结构

```text
e:\Demo/
├── index.html              # HTML 入口，lang="zh-CN"
├── vite.config.ts          # Vite 配置（含 pdfjs-dist 预构建优化）
├── tsconfig.json           # TypeScript 严格模式配置
├── package.json            # 依赖声明（项目名 knowledge-base）
└── src/
    ├── main.ts             # 应用挂载入口
    ├── App.vue             # 根组件，三栏布局与文档生命周期管理
    ├── vite-env.d.ts       # Vite 环境类型声明
    ├── components/
    │   ├── DocSidebar.vue  # 左侧文档列表侧边栏
    │   ├── EditorToolbar.vue # 顶部富文本工具栏
    │   ├── RichEditor.vue  # Tiptap 编辑器核心组件
    │   └── PdfPreview.vue  # PDF 预览模态框
    ├── stores/
    │   └── documentStore.ts # 响应式状态管理 + localStorage 持久化
    ├── styles/
    │   └── global.css      # CSS 变量、全局重置、滚动条样式
    ├── types/
    │   └── document.ts     # Document 接口类型定义
    └── utils/
        ├── exportPdf.ts    # HTML → PDF 转换（智能分页）
        └── importPdf.ts    # PDF → HTML 转换（图像化渲染）
```

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

---

## 功能说明

### 文档管理

- **新建文档**：点击侧边栏顶部的 `+` 按钮，自动创建一篇空白文档并聚焦编辑器
- **切换文档**：点击侧边栏中的文档条目即可切换，编辑器内容实时更新
- **重命名**：双击文档条目，弹出 `prompt` 对话框输入新标题
- **删除**：将鼠标悬停在文档条目上，右侧出现删除按钮，点击后删除该文档
- **时间戳显示**：侧边栏显示相对时间（"刚刚"、"2 小时前"等），基于 `updatedAt` 字段计算

### 富文本编辑器

编辑器基于 [Tiptap](https://tiptap.dev/) 构建，启用了以下格式能力：

| 类别 | 支持的格式 |
| ---- | --------- |
| 文字样式 | 粗体、斜体、下划线、删除线、行内代码 |
| 标题 | H1 / H2 / H3 |
| 段落对齐 | 左对齐、居中、右对齐、两端对齐 |
| 列表 | 无序列表、有序列表、任务清单（可勾选） |
| 插入元素 | 超链接、图片、表格、代码块、分割线 |
| 颜色 | 文字颜色、高亮背景色 |
| 历史 | 撤销 / 重做 |
| Markdown 快捷输入 | `#` 生成标题、`-` 生成列表、`**` 加粗等 |

工具栏按钮状态与编辑器光标位置实时同步，当前激活的格式按钮高亮显示。

### PDF 导出

将当前文档内容导出为 A4 格式的 PDF 文件，核心流程：

1. 将编辑器 HTML 渲染到一个隐藏的打印容器（`printContainer`）中，应用统一的 A4 样式
2. 遍历容器内所有块级元素，计算每个元素的高度和累计位置
3. 当累计高度超过一页时，在该元素前插入分页符，确保内容不被截断
4. 对每一分页块依次调用 `html2canvas` 截图，生成 JPEG 图像
5. 使用 `jsPDF` 将图像逐页写入 PDF，最终触发浏览器下载

> **特殊处理**：若文档内容为从 PDF 导入的图片（含 `data:image/` 的 `<img>` 标签），则跳过 html2canvas 步骤，直接将原始图片数据写入 PDF，避免二次压缩造成的质量损失。

### PDF 导入

将本地 PDF 文件转换为文档内容，核心流程：

1. 用户通过工具栏的"导入 PDF"按钮选择本地文件
2. 使用 `pdfjs-dist` 的 Web Worker 解析 PDF 文件
3. 按页遍历，将每页以 1.5 倍缩放比例渲染到 `<canvas>`
4. 将 canvas 转换为 JPEG base64 数据 URL
5. 生成包含每页图片和分隔线的 HTML 字符串写入编辑器
6. 使用 PDF 文件名（去掉 `.pdf` 后缀）作为文档标题

导入后的内容以图片形式呈现，可直接导出回 PDF。

### PDF 预览

点击工具栏"预览"按钮，打开模态框渲染 PDF 页面：

- 预览内容来自当前文档导出的 PDF（实时生成，非缓存）
- 支持**缩放**：从 50% 到 300%，步进 25%
- 支持**翻页**：上一页 / 下一页按钮，或鼠标滚动
- 显示"当前页 / 总页数"指示器
- 每页渲染为独立 `<canvas>` 元素，使用 pdfjs-dist 异步渲染

### 本地持久化

所有文档数据自动保存到浏览器的 `localStorage`：

- 每次创建、修改、删除操作后立即同步写入
- 页面刷新或重新打开后自动恢复全部文档
- **容量保护**：当 `localStorage` 写入触发 `QuotaExceededError` 时，自动将文档内容中的 base64 图片数据剥离后重试，确保文字内容不丢失

---

## 核心模块实现

### 状态管理 documentStore

**文件**：[src/stores/documentStore.ts](src/stores/documentStore.ts)

使用 Vue 3 Composition API 的 `reactive` 实现轻量状态管理，无需引入 Pinia/Vuex：

```typescript
interface Document {
  id: string        // nanoid 生成的唯一 ID
  title: string     // 文档标题
  content: string   // Tiptap 输出的 HTML 字符串
  createdAt: Date
  updatedAt: Date
}
```

核心操作：

| 方法 | 说明 |
| ---- | ---- |
| `createDocument()` | 创建空白文档，自动设为当前活跃文档 |
| `updateDocument(id, patch)` | 更新标题或内容，刷新 `updatedAt` |
| `deleteDocument(id)` | 删除后自动切换到相邻文档 |
| `setActiveDocument(id)` | 切换当前编辑的文档 |
| `saveToStorage()` | 序列化并写入 localStorage，含容量降级逻辑 |

---

### 富文本编辑器 RichEditor

**文件**：[src/components/RichEditor.vue](src/components/RichEditor.vue)

使用 `useEditor` 钩子初始化 Tiptap 编辑器，启用 24 个扩展：

```typescript
useEditor({
  extensions: [
    StarterKit,           // 基础格式套件（粗体/斜体/标题/列表等）
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Color,
    TextStyle,
    Highlight.configure({ multicolor: true }),
    Link,
    Image,
    Table, TableRow, TableHeader, TableCell,
    TaskList, TaskItem,
    Placeholder.configure({ placeholder: '开始输入...' }),
    // ...
  ],
  onUpdate: ({ editor }) => {
    // 内容变更时同步到 documentStore
    store.updateDocument(activeId, { content: editor.getHTML() })
  }
})
```

通过 `defineExpose({ editor })` 将编辑器实例暴露给父组件（`App.vue`），使工具栏的格式化命令能直接操作编辑器。

监听 `activeDocumentId` 变化，切换文档时调用 `editor.commands.setContent()` 注入新内容。

---

### 工具栏 EditorToolbar

**文件**：[src/components/EditorToolbar.vue](src/components/EditorToolbar.vue)

接收父组件传入的 `editor` 实例（`TiptapEditor` 类型），通过 Tiptap 的链式命令 API 执行格式化操作：

```typescript
// 示例：切换粗体
editor.chain().focus().toggleBold().run()

// 示例：设置对齐方式
editor.chain().focus().setTextAlign('center').run()

// 按钮激活状态检测
editor.isActive('bold')         // → boolean，用于高亮按钮
editor.isActive({ textAlign: 'center' })
```

工具栏按钮分组：

1. **历史操作**：撤销、重做
2. **标题**：正文、H1、H2、H3
3. **文字样式**：粗体、斜体、下划线、删除线、行内代码、文字颜色、高亮
4. **对齐**：左 / 中 / 右 / 两端
5. **列表**：无序、有序、任务清单
6. **插入**：图片、链接、表格、代码块、分割线
7. **PDF 操作**：导入 PDF（文件选择器）、导出 PDF、预览

---

### 侧边栏 DocSidebar

**文件**：[src/components/DocSidebar.vue](src/components/DocSidebar.vue)

接收 `documents` 列表和 `activeDocumentId`，通过事件向上通信：

```typescript
// 向父组件发出的事件
emit('select', id)        // 切换文档
emit('create')            // 新建文档
emit('rename', id, name)  // 重命名
emit('delete', id)        // 删除
```

相对时间计算逻辑：

```typescript
function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime()
  if (diff < 60_000)    return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}
```

---

### PDF 导出实现 exportPdf

**文件**：[src/utils/exportPdf.ts](src/utils/exportPdf.ts)

**智能分页算法**核心逻辑：

```typescript
const A4_HEIGHT_PX = containerWidth * (297 / 210)  // 按比例计算 A4 高度

let pageTop = 0
for (const el of blockElements) {
  const elBottom = el.offsetTop + el.offsetHeight
  if (elBottom - pageTop > A4_HEIGHT_PX) {
    // 在此元素之前插入分页符
    insertPageBreak(el)
    pageTop = el.offsetTop
  }
}
```

通过在超出页面高度的块元素前插入 `<div style="page-break-before: always">` 实现精准分页，避免段落、标题、表格被截断。

**快速路径**（导入 PDF 再导出）：

```typescript
if (isImportedPdf(content)) {
  // 直接从 <img src="data:image/..."> 提取图像数据写入 jsPDF
  // 跳过 html2canvas，保持原始图片质量
}
```

---

### PDF 导入实现 importPdf

**文件**：[src/utils/importPdf.ts](src/utils/importPdf.ts)

```typescript
async function importPdf(file: File): Promise<{ title: string; content: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })
    // 渲染到离屏 canvas
    const canvas = document.createElement('canvas')
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    // 转为 JPEG base64
    pages.push(`<img src="${canvas.toDataURL('image/jpeg', 0.9)}" />`)
  }

  return {
    title: file.name.replace(/\.pdf$/i, ''),
    content: pages.join('<hr/>'),
  }
}
```

---

### PDF 预览 PdfPreview

**文件**：[src/components/PdfPreview.vue](src/components/PdfPreview.vue)

预览流程：

1. 父组件调用 `exportPdf()` 生成 PDF 的 `Uint8Array` 数据（不触发下载）
2. 将数据传入 `PdfPreview`，组件调用 `pdfjsLib.getDocument()` 解析
3. 使用 `page.render()` 将每页异步渲染到独立 `<canvas>`
4. 缩放通过修改 `viewport.scale` 参数后重新渲染所有页面实现

```typescript
async function renderPage(pageNum: number, scale: number) {
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: ctx, viewport }).promise
}
```

---

## 数据流图

```text
用户操作
   │
   ▼
App.vue（协调层）
   │
   ├──▶ DocSidebar.vue    ──emit──▶ create / select / rename / delete
   │
   ├──▶ EditorToolbar.vue ──editor.chain()──▶ RichEditor（Tiptap）
   │         │
   │         └──▶ exportPdf / importPdf / PdfPreview
   │
   └──▶ RichEditor.vue
             │
             └── onUpdate ──▶ documentStore.updateDocument()
                                      │
                                      └──▶ localStorage
```

---

## 类型定义

**文件**：[src/types/document.ts](src/types/document.ts)

```typescript
export interface Document {
  id: string
  title: string
  content: string       // Tiptap HTML 字符串
  createdAt: Date
  updatedAt: Date
}
```

---

## 样式系统

**文件**：[src/styles/global.css](src/styles/global.css)

使用 CSS 自定义属性（变量）统一管理主题：

```css
:root {
  --sidebar-bg: #1e2030;       /* 侧边栏深色背景 */
  --primary: #4f6ef7;          /* 主题蓝色（按钮高亮） */
  --editor-bg: #ffffff;        /* 编辑区白色背景 */
  --sidebar-width: 240px;
  --toolbar-height: 48px;
}
```
