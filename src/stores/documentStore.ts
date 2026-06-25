import { ref, watch } from 'vue'
import type { Document } from '../types/document'

const STORAGE_KEY = 'kb_documents'

function loadDocuments(): Document[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

const documents = ref<Document[]>(loadDocuments())
const activeDocId = ref<string | null>(documents.value[0]?.id ?? null)

watch(documents, (docs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
  } catch {
    // Quota exceeded (e.g. documents contain large base64 images).
    // Strip image src from content before persisting so the text is still saved.
    const slim = docs.map(d => ({
      ...d,
      content: d.content.replace(/ src="data:[^"]{1000,}"/g, ' src=""'),
    }))
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
    } catch {
      // Still too large — skip persistence for this save
    }
  }
}, { deep: true })

function createDocument(): Document {
  const doc: Document = {
    id: generateId(),
    title: '未命名文档',
    content: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  documents.value.unshift(doc)
  activeDocId.value = doc.id
  return doc
}

function updateDocument(id: string, patch: Partial<Pick<Document, 'title' | 'content'>>) {
  const doc = documents.value.find(d => d.id === id)
  if (!doc) return
  Object.assign(doc, patch, { updatedAt: Date.now() })
}

function deleteDocument(id: string) {
  const idx = documents.value.findIndex(d => d.id === id)
  if (idx === -1) return
  documents.value.splice(idx, 1)
  if (activeDocId.value === id) {
    activeDocId.value = documents.value[0]?.id ?? null
  }
}

function getActiveDocument(): Document | undefined {
  return documents.value.find(d => d.id === activeDocId.value)
}

export function useDocumentStore() {
  return {
    documents,
    activeDocId,
    createDocument,
    updateDocument,
    deleteDocument,
    getActiveDocument,
  }
}
