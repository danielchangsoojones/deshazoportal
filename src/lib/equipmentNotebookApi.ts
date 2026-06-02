const defaultNotebookApiUrl = '/notebook-api'

const notebookApiUrl =
  (import.meta.env.VITE_EQUIPMENT_NOTEBOOK_API_URL as string | undefined)?.trim().replace(/\/$/, '') ||
  defaultNotebookApiUrl

async function fetchNotebook(path: string, init?: RequestInit) {
  try {
    return await fetch(`${notebookApiUrl}${path}`, init)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Notebook API is unreachable at ${notebookApiUrl}. Start the notebook API server or set VITE_EQUIPMENT_NOTEBOOK_API_URL to the running API. If the server is already running, check its CORS settings.`,
      )
    }
    throw error
  }
}

export type NotebookSource = {
  index: number
  name: string
  equipment_id: string
  document_type: 'manual' | 'inspection'
  manufacturer: string
  source: string
  pdf_url: string
}

export type NotebookCitation = {
  id: number
  title: string
  page: number
  document_type: 'manual' | 'inspection'
  quote: string
  source: string
}

export type NotebookChatResponse = {
  message: string
  answer_markdown: string
  citations: NotebookCitation[]
}

export type NotebookPdfInfo = {
  index: number
  name: string
  pages: number
}

export async function getNotebookSources(signal?: AbortSignal) {
  const response = await fetchNotebook('/sources', { signal })
  if (!response.ok) {
    throw new Error(`Notebook sources failed with status ${response.status}`)
  }
  return (await response.json()) as NotebookSource[]
}

export async function askNotebook(message: string, sourceIndex: number | null, signal?: AbortSignal) {
  const response = await fetchNotebook('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      top_k: 12,
      ...(sourceIndex === null ? {} : { source_index: sourceIndex }),
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Notebook chat failed with status ${response.status}`)
  }

  return (await response.json()) as NotebookChatResponse
}

export async function uploadNotebookPdf(file: File, documentType: 'manual' | 'inspection') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('document_type', documentType)

  const response = await fetchNotebook('/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Notebook upload failed with status ${response.status}`)
  }

  return response.json() as Promise<{ index: number }>
}

export async function deleteNotebookSource(sourceIndex: number) {
  const response = await fetchNotebook(`/sources/${sourceIndex}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`Notebook source removal failed with status ${response.status}`)
  }
  return response.json() as Promise<{ sources: number }>
}

export async function reindexNotebook() {
  const response = await fetchNotebook('/reindex', { method: 'POST' })
  if (!response.ok) {
    throw new Error(`Notebook reindex failed with status ${response.status}`)
  }
  return response.json() as Promise<{ chunks: number; parts: number }>
}

export async function getNotebookPdfInfo(sourceIndex: number, signal?: AbortSignal) {
  const response = await fetchNotebook(`/pdf-info/${sourceIndex}`, { signal })
  if (!response.ok) {
    throw new Error(`Notebook PDF info failed with status ${response.status}`)
  }
  return (await response.json()) as NotebookPdfInfo
}

export function notebookPdfUrl(sourceIndex: number, page = 1) {
  return `${notebookApiUrl}/pdf/${sourceIndex}#page=${page}`
}

export function notebookPdfPageImageUrl(sourceIndex: number, page = 1) {
  return `${notebookApiUrl}/pdf-page/${sourceIndex}?page=${page}`
}

export { notebookApiUrl }
