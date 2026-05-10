import { supabase } from './supabase'

const bucketName = 'editable-inspection-documents'
const signedUrlTtlSeconds = 60 * 60

export type EditableInspectionDocument = {
  id: string
  name: string
  description: string
  filePath: string
  fileName: string
  fileSize: number
  source: string
  url: string
  createdAt: string
}

type EditableInspectionDocumentRow = {
  id: string
  document_name: string
  description: string
  file_path: string
  original_file_name: string
  file_size: number
  source: string
  created_at: string
}

type UploadEditableInspectionDocumentInput = {
  file: File
  name: string
  description: string
  source: string
  stableKey?: string
}

function createDocumentId() {
  return globalThis.crypto?.randomUUID?.()
}

function sanitizeFileName(fileName: string) {
  const cleanedName = fileName
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')

  return cleanedName.toLowerCase().endsWith('.pdf') ? cleanedName : `${cleanedName || 'document'}.pdf`
}

async function getCurrentUserId() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw new Error(error.message)
  }

  if (!data.user) {
    throw new Error('Sign in to save documents.')
  }

  return data.user.id
}

async function createSignedUrl(filePath: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(filePath, signedUrlTtlSeconds)

  if (error) {
    throw new Error(error.message)
  }

  return data.signedUrl
}

async function mapDocumentRow(row: EditableInspectionDocumentRow): Promise<EditableInspectionDocument> {
  return {
    id: row.id,
    name: row.document_name,
    description: row.description,
    filePath: row.file_path,
    fileName: row.original_file_name,
    fileSize: row.file_size,
    source: row.source,
    url: await createSignedUrl(row.file_path),
    createdAt: row.created_at,
  }
}

export async function getEditableInspectionDocuments() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('editable_inspection_documents')
    .select('id, document_name, description, file_path, original_file_name, file_size, source, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return Promise.all(((data ?? []) as EditableInspectionDocumentRow[]).map(mapDocumentRow))
}

export async function uploadEditableInspectionDocument(input: UploadEditableInspectionDocumentInput) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  if (input.file.type && input.file.type !== 'application/pdf') {
    throw new Error(`${input.file.name} is not a PDF.`)
  }

  const userId = await getCurrentUserId()

  if (input.stableKey) {
    const { data: existingDocument, error: existingError } = await supabase
      .from('editable_inspection_documents')
      .select('id, document_name, description, file_path, original_file_name, file_size, source, created_at')
      .eq('user_id', userId)
      .eq('stable_key', input.stableKey)
      .maybeSingle()

    if (existingError) {
      throw new Error(existingError.message)
    }

    if (existingDocument) {
      return mapDocumentRow(existingDocument as EditableInspectionDocumentRow)
    }
  }

  const documentId = createDocumentId()
  if (!documentId) {
    throw new Error('Document could not be saved because this browser could not create a document id.')
  }

  const fileName = sanitizeFileName(input.file.name)
  const filePath = `${userId}/${documentId}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, input.file, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data, error } = await supabase
    .from('editable_inspection_documents')
    .insert({
      id: documentId,
      user_id: userId,
      document_name: input.name.trim(),
      description: input.description.trim(),
      file_path: filePath,
      original_file_name: fileName,
      file_size: input.file.size,
      content_type: 'application/pdf',
      source: input.source,
      stable_key: input.stableKey ?? null,
    })
    .select('id, document_name, description, file_path, original_file_name, file_size, source, created_at')
    .single()

  if (error) {
    await supabase.storage.from(bucketName).remove([filePath])
    throw new Error(error.message)
  }

  return mapDocumentRow(data as EditableInspectionDocumentRow)
}

export async function deleteEditableInspectionDocument(document: EditableInspectionDocument) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const userId = await getCurrentUserId()
  const { error: deleteRowError } = await supabase
    .from('editable_inspection_documents')
    .delete()
    .eq('id', document.id)
    .eq('user_id', userId)

  if (deleteRowError) {
    throw new Error(deleteRowError.message)
  }

  const { error: deleteFileError } = await supabase.storage
    .from(bucketName)
    .remove([document.filePath])

  if (deleteFileError) {
    throw new Error(deleteFileError.message)
  }
}
