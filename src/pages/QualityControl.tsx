import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import type { PDFPageProxy } from 'pdfjs-dist'
import DNumberSearchBar from '../components/DNumberSearchBar'
import ProfileMenu from '../components/ProfileMenu'
import { supabase, isConfigured } from '../lib/supabase'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type UploadSide = 'left' | 'right'
type FileStatus = 'idle' | 'selected' | 'extracting' | 'ready' | 'error'

type PdfImageFingerprint = {
  pageNumber: number
  imageNumber: number
  width: number
  height: number
  hash: string
  dedupeHash: string
}

type PdfUploadState = {
  file: File | null
  status: FileStatus
  images: PdfImageFingerprint[]
  error: string
}

type PdfImageObject = {
  width?: number
  height?: number
  data?: Uint8Array | Uint8ClampedArray
  bitmap?: ImageBitmap
  kind?: number
}

const emptyUploadState = (): PdfUploadState => ({
  file: null,
  status: 'idle',
  images: [],
  error: '',
})

const imageOperators = new Set<number>([
  pdfjsLib.OPS.paintImageXObject,
  pdfjsLib.OPS.paintInlineImageXObject,
  pdfjsLib.OPS.paintImageXObjectRepeat,
])

const minimumPhotoArea = 20_000
const minimumPhotoEdge = 96
const maximumPhotoAspectRatio = 4
const perceptualHashSize = 16
const sampleHashSize = 32
const matchingHashDistance = 8

function getPdfObject(page: PDFPageProxy, objectId: string): Promise<PdfImageObject | null> {
  const pageWithObjects = page as PDFPageProxy & {
    objs: {
      get: (id: string, callback: (value: PdfImageObject | null) => void) => null
    }
  }

  return new Promise<PdfImageObject | null>((resolve) => {
    pageWithObjects.objs.get(objectId, (value: PdfImageObject | null) => resolve(value))
  })
}

function getCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Canvas is not available in this browser.')
  }

  return { canvas, context }
}

function shouldUseImage(width: number, height: number) {
  const aspectRatio = width > height ? width / height : height / width

  return (
    width >= minimumPhotoEdge &&
    height >= minimumPhotoEdge &&
    width * height >= minimumPhotoArea &&
    aspectRatio <= maximumPhotoAspectRatio
  )
}

function getImageDataStride(image: PdfImageObject, width: number, height: number) {
  const source = image.data
  if (!source) return 0

  if (image.kind === pdfjsLib.ImageKind.RGBA_32BPP || source.length >= width * height * 4) return 4
  if (image.kind === pdfjsLib.ImageKind.RGB_24BPP || source.length >= width * height * 3) return 3

  return 0
}

function getSampledSourceIndex(x: number, y: number, width: number, height: number, sampleSize: number, stride: number) {
  const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / sampleSize))
  const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / sampleSize))

  return (sourceY * width + sourceX) * stride
}

function getRawImageLuminanceValues(image: PdfImageObject, width: number, height: number, sampleSize: number) {
  const source = image.data
  const stride = getImageDataStride(image, width, height)
  if (!source || !stride) return null

  const values: number[] = []
  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const index = getSampledSourceIndex(x, y, width, height, sampleSize, stride)
      values.push(source[index] * 0.299 + source[index + 1] * 0.587 + source[index + 2] * 0.114)
    }
  }

  return values
}

function createPerceptualHashFromLuminanceValues(luminanceValues: number[]) {
  const average = luminanceValues.reduce((total, value) => total + value, 0) / luminanceValues.length
  return luminanceValues.map((value) => (value >= average ? '1' : '0')).join('')
}

function createPerceptualHashFromBitmap(bitmap: ImageBitmap, width: number, height: number) {
  const { canvas, context } = getCanvas(perceptualHashSize, perceptualHashSize)
  context.drawImage(bitmap, 0, 0, width, height, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const luminanceValues: number[] = []

  for (let index = 0; index < pixels.length; index += 4) {
    luminanceValues.push(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114)
  }

  return createPerceptualHashFromLuminanceValues(luminanceValues)
}

function createSampleHashFromBitmap(bitmap: ImageBitmap, width: number, height: number) {
  const { canvas, context } = getCanvas(sampleHashSize, sampleHashSize)
  context.drawImage(bitmap, 0, 0, width, height, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let hash = 2166136261

  for (let index = 0; index < pixels.length; index += 1) {
    hash ^= pixels[index]
    hash = Math.imul(hash, 16777619)
  }

  return `${width}x${height}:${(hash >>> 0).toString(16)}`
}

function createSampleHashFromRawImage(image: PdfImageObject, width: number, height: number) {
  const source = image.data
  const stride = getImageDataStride(image, width, height)
  if (!source || !stride) return null

  let hash = 2166136261
  for (let y = 0; y < sampleHashSize; y += 1) {
    for (let x = 0; x < sampleHashSize; x += 1) {
      const index = getSampledSourceIndex(x, y, width, height, sampleHashSize, stride)
      const alpha = stride === 4 ? source[index + 3] : 255
      const values = [source[index], source[index + 1], source[index + 2], alpha]

      for (const value of values) {
        hash ^= value
        hash = Math.imul(hash, 16777619)
      }
    }
  }

  return `${width}x${height}:${(hash >>> 0).toString(16)}`
}

function createImageFingerprint(image: PdfImageObject, pageNumber: number, imageNumber: number) {
  const width = image.width ?? image.bitmap?.width ?? 0
  const height = image.height ?? image.bitmap?.height ?? 0

  if (!shouldUseImage(width, height)) return null

  const luminanceValues = image.bitmap
    ? null
    : getRawImageLuminanceValues(image, width, height, perceptualHashSize)
  const hash = image.bitmap
    ? createPerceptualHashFromBitmap(image.bitmap, width, height)
    : luminanceValues
      ? createPerceptualHashFromLuminanceValues(luminanceValues)
      : null
  const dedupeHash = image.bitmap
    ? createSampleHashFromBitmap(image.bitmap, width, height)
    : createSampleHashFromRawImage(image, width, height)

  if (!hash || !dedupeHash) return null

  return {
    pageNumber,
    imageNumber,
    width,
    height,
    hash,
    dedupeHash,
  }
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0))
}

function getHashDistance(leftHash: string, rightHash: string) {
  let distance = 0
  const length = Math.min(leftHash.length, rightHash.length)

  for (let index = 0; index < length; index += 1) {
    if (leftHash[index] !== rightHash[index]) distance += 1
  }

  return distance + Math.abs(leftHash.length - rightHash.length)
}

function compareImageSets(leftImages: PdfImageFingerprint[], rightImages: PdfImageFingerprint[]) {
  const candidateMatches = leftImages.flatMap((leftImage, leftIndex) =>
    rightImages
      .map((rightImage, rightIndex) => ({
        leftIndex,
        rightIndex,
        distance: getHashDistance(leftImage.hash, rightImage.hash),
      }))
      .filter((match) => match.distance <= matchingHashDistance),
  )

  candidateMatches.sort((leftMatch, rightMatch) => leftMatch.distance - rightMatch.distance)

  const matchedLeftIndexes = new Set<number>()
  const matchedRightIndexes = new Set<number>()

  candidateMatches.forEach((match) => {
    if (matchedLeftIndexes.has(match.leftIndex) || matchedRightIndexes.has(match.rightIndex)) return

    matchedLeftIndexes.add(match.leftIndex)
    matchedRightIndexes.add(match.rightIndex)
  })

  const matchingImageCount = matchedLeftIndexes.size

  return {
    matchingImageCount,
    allImagesMatch:
      matchingImageCount > 0 &&
      matchingImageCount === leftImages.length &&
      matchingImageCount === rightImages.length,
  }
}

function dedupeImageFingerprints(images: PdfImageFingerprint[]) {
  const uniqueImages = new Map<string, PdfImageFingerprint>()

  for (const image of images) {
    if (!uniqueImages.has(image.dedupeHash)) {
      uniqueImages.set(image.dedupeHash, image)
    }
  }

  return Array.from(uniqueImages.values()).map((image, index) => ({
    ...image,
    imageNumber: index + 1,
  }))
}

async function extractPdfImageFingerprints(file: File) {
  const pdfData = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({ data: pdfData })
  const pdf = await loadingTask.promise
  const images: PdfImageFingerprint[] = []
  let processedImageCount = 0

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const operatorList = await page.getOperatorList()

      for (let index = 0; index < operatorList.fnArray.length; index += 1) {
        const operator = operatorList.fnArray[index]
        if (!imageOperators.has(operator)) continue

        const args = operatorList.argsArray[index]
        const image = operator === pdfjsLib.OPS.paintInlineImageXObject
          ? (args[0] as PdfImageObject | null)
          : await getPdfObject(page, String(args[0]))

        if (!image) continue

        processedImageCount += 1
        if (processedImageCount % 8 === 0) await waitForNextFrame()

        const fingerprint = createImageFingerprint(image, pageNumber, images.length + 1)
        if (fingerprint) images.push(fingerprint)
      }

      page.cleanup()
      await waitForNextFrame()
    }
  } finally {
    await loadingTask.destroy()
  }

  return dedupeImageFingerprints(images)
}

function getImageCountLabel(state: PdfUploadState) {
  if (state.status === 'selected') return 'Pending'
  if (state.status === 'extracting') return 'Scanning'
  if (state.status === 'error') return 'Error'

  return `${state.images.length} ${state.images.length === 1 ? 'photo' : 'photos'}`
}

function UploadPanel({
  id,
  label,
  state,
  onFileSelected,
  onReset,
}: {
  id: string
  label: string
  state: PdfUploadState
  onFileSelected: (file: File) => void
  onReset: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected],
  )

  const previewUrl = useMemo(
    () => (state.file ? URL.createObjectURL(state.file) : ''),
    [state.file],
  )

  useEffect(() => {
    if (!previewUrl) return

    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (!state.file && inputRef.current) inputRef.current.value = ''
  }, [state.file])

  const handleReset = () => {
    if (inputRef.current) inputRef.current.value = ''
    onReset()
  }

  const previewSource = previewUrl
    ? `${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1&zoom=page-fit`
    : ''

  return (
    <section
      onDragEnter={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        handleFiles(event.dataTransfer.files)
      }}
      className={`flex min-h-[calc(100svh-340px)] flex-col rounded-[20px] border-2 border-dashed bg-white p-5 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] transition xl:min-h-[calc(100svh-305px)] ${
        isDragging ? 'border-[var(--deshazo-blue)] bg-[#f2f6ff]' : 'border-[var(--deshazo-border)]'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-black uppercase tracking-[0.02em] text-[rgba(21,24,33,0.55)]">{label}</p>
          <h2 className="mt-1 text-[24px] font-black text-[var(--deshazo-text)]">PDF inspection report</h2>
          {state.file ? (
            <p className="mt-1 max-w-[42ch] truncate text-[14px] font-semibold text-[rgba(21,24,33,0.58)]">{state.file.name}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-[var(--deshazo-surface)] px-3 py-1 text-[13px] font-bold text-[var(--deshazo-blue)]">
            {getImageCountLabel(state)}
          </span>
          {state.file ? (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full border border-[#f1c1bd] bg-[#fff6f5] px-3 py-1 text-[13px] font-bold text-[#b42318] transition hover:bg-[#ffe7e4]"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {state.file && previewSource ? (
        <div className="mt-5 flex flex-1 min-h-0 flex-col overflow-hidden rounded-[16px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/55">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--deshazo-border)] bg-white px-4 py-3">
            <p className="truncate text-[15px] font-black text-[var(--deshazo-text)]">PDF Thumbnail</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-full bg-[var(--deshazo-blue)] px-4 py-2 text-[14px] font-bold text-white transition hover:bg-[var(--deshazo-blue-deep)]"
            >
              Replace
            </button>
          </div>
          <div className="flex flex-1 items-start justify-center px-5 py-8">
            <div className="w-full max-w-[230px] rounded-[14px] border border-[var(--deshazo-border)] bg-white p-2 shadow-[0_18px_38px_-26px_rgba(47,86,166,0.35)]">
              <div className="aspect-[8.5/11] overflow-hidden rounded-[10px] border border-[#e5e9f3] bg-white">
                <iframe
                  title={`${label} preview`}
                  src={previewSource}
                  className="h-full w-full bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-8 flex flex-1 flex-col items-center justify-center rounded-[16px] border border-[var(--deshazo-border)] bg-[var(--deshazo-surface)]/70 px-5 py-16 text-center transition hover:border-[var(--deshazo-blue)] hover:bg-[#f7f9ff]"
        >
          <span className="text-[56px] font-black leading-none text-[var(--deshazo-blue)]">+</span>
          <span className="mt-4 text-[20px] font-black text-[var(--deshazo-text)]">
            Drop a PDF here or choose a file
          </span>
          <span className="mt-2 max-w-[34ch] text-[15px] font-medium text-[rgba(21,24,33,0.62)]">
            Only embedded report photos are extracted for comparison.
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(event) => handleFiles(event.currentTarget.files)}
      />

      <div className="mt-4 min-h-6 text-[15px] font-semibold">
        {state.status === 'selected' ? <p className="text-[rgba(21,24,33,0.62)]">Waiting for the other PDF...</p> : null}
        {state.status === 'extracting' ? <p className="text-[var(--deshazo-blue)]">Extracting image data...</p> : null}
        {state.status === 'ready' ? <p className="text-[#237a4d]">Photo scan complete.</p> : null}
        {state.status === 'error' ? <p className="text-[#b42318]">{state.error}</p> : null}
      </div>
    </section>
  )
}

export default function QualityControl() {
  const [user, setUser] = useState<User | null>(null)
  const [leftUpload, setLeftUpload] = useState<PdfUploadState>(() => emptyUploadState())
  const [rightUpload, setRightUpload] = useState<PdfUploadState>(() => emptyUploadState())
  const extractionRunId = useRef(0)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isConfigured || !supabase) {
      navigate('/quotelogin')
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/quotelogin')
      } else {
        setUser(data.user)
      }
    })
  }, [navigate])

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/quotelogin')
  }

  const handleFileSelected = useCallback((side: UploadSide, file: File) => {
    const updateUpload = side === 'left' ? setLeftUpload : setRightUpload

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      extractionRunId.current += 1
      updateUpload({
        file: null,
        status: 'error',
        images: [],
        error: 'Please upload a PDF inspection report.',
      })
      return
    }

    extractionRunId.current += 1
    updateUpload({
      file,
      status: 'selected',
      images: [],
      error: '',
    })
  }, [])

  useEffect(() => {
    if (!leftUpload.file || !rightUpload.file) return

    const runId = extractionRunId.current + 1
    extractionRunId.current = runId
    const leftFile = leftUpload.file
    const rightFile = rightUpload.file

    const extractBothReports = async () => {
      setLeftUpload((current) => ({
        ...current,
        status: 'extracting',
        images: [],
        error: '',
      }))
      setRightUpload((current) => ({
        ...current,
        status: 'extracting',
        images: [],
        error: '',
      }))

      const [leftResult, rightResult] = await Promise.allSettled([
        extractPdfImageFingerprints(leftFile),
        extractPdfImageFingerprints(rightFile),
      ])

      if (extractionRunId.current !== runId) return

      setLeftUpload((current) => {
        if (current.file !== leftFile) return current
        if (leftResult.status === 'rejected') {
          return {
            ...current,
            status: 'error',
            images: [],
            error: leftResult.reason instanceof Error ? leftResult.reason.message : 'Unable to read this PDF.',
          }
        }

        return {
          ...current,
          status: 'ready',
          images: leftResult.value,
          error: leftResult.value.length ? '' : 'No inspection photos were found in this PDF.',
        }
      })

      setRightUpload((current) => {
        if (current.file !== rightFile) return current
        if (rightResult.status === 'rejected') {
          return {
            ...current,
            status: 'error',
            images: [],
            error: rightResult.reason instanceof Error ? rightResult.reason.message : 'Unable to read this PDF.',
          }
        }

        return {
          ...current,
          status: 'ready',
          images: rightResult.value,
          error: rightResult.value.length ? '' : 'No inspection photos were found in this PDF.',
        }
      })
    }

    void extractBothReports()
  }, [leftUpload.file, rightUpload.file])

  const resetLeftUpload = () => {
    extractionRunId.current += 1
    setLeftUpload(emptyUploadState())
  }

  const resetRightUpload = () => {
    extractionRunId.current += 1
    setRightUpload(emptyUploadState())
  }

  const resetAllUploads = () => {
    extractionRunId.current += 1
    setLeftUpload(emptyUploadState())
    setRightUpload(emptyUploadState())
  }

  if (!user) return null

  const canCompare = leftUpload.status === 'ready' && rightUpload.status === 'ready'
  const isComparing = leftUpload.status === 'extracting' || rightUpload.status === 'extracting'
  const hasUploadedPdf = Boolean(leftUpload.file || rightUpload.file)
  const comparison = canCompare
    ? compareImageSets(leftUpload.images, rightUpload.images)
    : { matchingImageCount: 0, allImagesMatch: false }
  const resultNoun = Math.max(leftUpload.images.length, rightUpload.images.length, comparison.matchingImageCount) === 1
    ? 'image'
    : 'images'
  const resultText = canCompare
    ? comparison.allImagesMatch
      ? `These inspection reports contain the same ${resultNoun}.`
      : `These inspection reports do not contain the same ${resultNoun}.`
    : isComparing
      ? 'Comparing PDF images...'
      : leftUpload.file || rightUpload.file
        ? 'Upload the second PDF inspection report to compare their images.'
        : 'Upload both PDF inspection reports to compare their images.'

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--deshazo-text)]">
      <header className="sticky top-0 z-40 bg-[var(--deshazo-blue)] px-5 py-3 shadow-sm">
        <div className="flex w-full items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/deshazo-internal-dashboard')}
            className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-normal text-white transition hover:bg-white/20"
            aria-label="Home"
          >
            Home
          </button>

          <DNumberSearchBar />

          <ProfileMenu user={user} onSignOut={handleSignOut} />
        </div>
      </header>

      <main className="flex w-full items-stretch">
        <section className="flex min-w-0 flex-1 flex-col px-5 py-5 sm:px-8 lg:px-10">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-[clamp(34px,4vw,54px)] font-black leading-none text-[var(--deshazo-text)]">
                Quality Control
              </h1>
              <div className="mt-[18px] h-1.5 w-full max-w-[530px] rounded-full bg-[var(--deshazo-blue)]" />
            </div>

            <div className="flex w-full max-w-[560px] flex-col gap-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={resetAllUploads}
                  disabled={!hasUploadedPdf}
                  className="rounded-full border border-[#f1c1bd] bg-white px-4 py-2 text-[14px] font-bold text-[#b42318] shadow-[0_12px_28px_-24px_rgba(47,86,166,0.3)] transition hover:bg-[#fff6f5] disabled:cursor-not-allowed disabled:border-[var(--deshazo-border)] disabled:text-[rgba(21,24,33,0.32)] disabled:hover:bg-white"
                >
                  Reset all
                </button>
              </div>

              <section
                className={`rounded-[20px] border px-5 py-4 shadow-[0_18px_40px_-34px_rgba(47,86,166,0.28)] ${
                  canCompare && comparison.allImagesMatch
                    ? 'border-[#9bd2b3] bg-[#f0fbf5]'
                    : canCompare
                      ? 'border-[#f1c1bd] bg-[#fff6f5]'
                      : 'border-[var(--deshazo-border)] bg-white'
                }`}
              >
                <p className="text-[13px] font-black uppercase tracking-[0.02em] text-[rgba(21,24,33,0.55)]">Result</p>
                <p className="mt-1 text-[22px] font-black leading-tight text-[var(--deshazo-text)]">{resultText}</p>
              </section>
            </div>
          </div>

          <section className="grid w-full flex-1 grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
            <UploadPanel
              id="left-pdf-upload"
              label="Left PDF upload area"
              state={leftUpload}
              onFileSelected={(file) => void handleFileSelected('left', file)}
              onReset={resetLeftUpload}
            />
            <UploadPanel
              id="right-pdf-upload"
              label="Right PDF upload area"
              state={rightUpload}
              onFileSelected={(file) => void handleFileSelected('right', file)}
              onReset={resetRightUpload}
            />
          </section>
        </section>
      </main>
    </div>
  )
}
