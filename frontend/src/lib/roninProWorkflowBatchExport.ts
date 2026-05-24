export interface WorkflowBatchExportResult {
  name: string
  url: string
}

export interface WorkflowBatchExportOptions {
  directory: FileSystemDirectoryHandle
  prefix: string
  fetchBlob?: (url: string) => Promise<Blob>
}

export interface WorkflowSpriteExportFrame {
  i: number
  x: number
  y: number
  w: number
  h: number
}

export interface WorkflowSpriteExportLayout {
  cols: number
  rows: number
  sheetWidth: number
  sheetHeight: number
  frameWidth: number
  frameHeight: number
  frameGap: number
}

export interface WorkflowSpriteExportJsonFrame extends WorkflowSpriteExportFrame {
  t: number
}

export interface WorkflowSpriteExportJsonInput {
  frameWidth: number
  frameHeight: number
  sheetWidth: number
  sheetHeight: number
  fps: 12 | 24
  frames: WorkflowSpriteExportFrame[]
}

export interface WorkflowSpriteExportOptions {
  columns: number
  fps: 12 | 24
  loadImage?: (blob: Blob) => Promise<WorkflowSpriteExportImage>
  frameWidth?: number
  frameHeight?: number
}

export interface WorkflowSpriteExportImage {
  naturalWidth: number
  naturalHeight: number
}

export interface WorkflowSpriteExportResult {
  pngBlob: Blob
  json: string
  layout: WorkflowSpriteExportLayout
}

function sanitizeBatchExportPrefix(prefix: string): string {
  const clean = prefix
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_ .]+|[_ .]+$/g, '')
  return clean || 'workflow'
}

export function buildWorkflowBatchExportName(prefix: string, index0: number, total: number): string {
  const width = Math.max(3, String(Math.max(1, total)).length)
  const index = Math.max(1, Math.trunc(index0) + 1)
  return `${sanitizeBatchExportPrefix(prefix)}_${String(index).padStart(width, '0')}.png`
}

export function buildWorkflowSpriteExportLayout(
  count: number,
  columns: number,
  frameWidth: number,
  frameHeight: number
): WorkflowSpriteExportLayout {
  const cols = Math.max(1, Math.floor(columns))
  const rows = Math.max(1, Math.ceil(Math.max(0, count) / cols))
  return {
    cols,
    rows,
    sheetWidth: cols * frameWidth,
    sheetHeight: rows * frameHeight,
    frameWidth,
    frameHeight,
    frameGap: 0,
  }
}

export function buildWorkflowSpriteExportJson(input: WorkflowSpriteExportJsonInput): string {
  const frames: WorkflowSpriteExportJsonFrame[] = input.frames.map((frame, index) => ({
    ...frame,
    t: Math.round((index / input.fps) * 1000) / 1000,
  }))
  return JSON.stringify(
    {
      version: '1.0',
      frame_size: { w: input.frameWidth, h: input.frameHeight },
      sheet_size: { w: input.sheetWidth, h: input.sheetHeight },
      frames,
    },
    null,
    2
  )
}

async function defaultFetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to read workflow result: ${res.status}`)
  return res.blob()
}

export async function exportWorkflowResultsToDirectory(
  results: WorkflowBatchExportResult[],
  options: WorkflowBatchExportOptions
): Promise<number> {
  const fetchBlob = options.fetchBlob ?? defaultFetchBlob
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i]!
    const blob = await fetchBlob(result.url)
    const fileName = buildWorkflowBatchExportName(options.prefix, i, results.length)
    const fileHandle = await options.directory.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(blob)
    } finally {
      await writable.close()
    }
  }
  return results.length
}

export async function composeWorkflowSpriteSheet(
  blobs: Blob[],
  options: WorkflowSpriteExportOptions
): Promise<WorkflowSpriteExportResult> {
  if (blobs.length === 0) throw new Error('No frames')
  const firstImage = options.loadImage ? await options.loadImage(blobs[0]!) : await loadWorkflowImage(blobs[0]!)
  const frameWidth = options.frameWidth ?? firstImage.naturalWidth
  const frameHeight = options.frameHeight ?? firstImage.naturalHeight
  const layout = buildWorkflowSpriteExportLayout(
    blobs.length,
    options.columns,
    frameWidth,
    frameHeight
  )
  const sheet = document.createElement('canvas')
  sheet.width = layout.sheetWidth
  sheet.height = layout.sheetHeight
  const ctx = sheet.getContext('2d')
  if (!ctx) throw new Error('ERR_CANVAS_CREATE')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, layout.sheetWidth, layout.sheetHeight)

  const frames: WorkflowSpriteExportFrame[] = []
  for (let i = 0; i < blobs.length; i += 1) {
    const blob = blobs[i]!
    const img = i === 0 ? firstImage : options.loadImage ? await options.loadImage(blob) : await loadWorkflowImage(blob)
    const col = i % layout.cols
    const row = Math.floor(i / layout.cols)
    const x = col * layout.frameWidth
    const y = row * layout.frameHeight
    ctx.drawImage(
      img as unknown as CanvasImageSource,
      0,
      0,
      img.naturalWidth,
      img.naturalHeight,
      x,
      y,
      layout.frameWidth,
      layout.frameHeight
    )
    frames.push({ i, x, y, w: layout.frameWidth, h: layout.frameHeight })
  }

  const pngBlob = await canvasToBlob(sheet)
  const json = buildWorkflowSpriteExportJson({
    frameWidth: layout.frameWidth,
    frameHeight: layout.frameHeight,
    sheetWidth: layout.sheetWidth,
    sheetHeight: layout.sheetHeight,
    fps: options.fps,
    frames,
  })
  return { pngBlob, json, layout }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'undefined') {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('blob read failed'))
      reader.readAsDataURL(blob)
      return
    }
    void blob.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!)
      resolve(`data:application/octet-stream;base64,${btoa(binary)}`)
    }, reject)
  })
}

async function loadWorkflowImage(blob: Blob): Promise<WorkflowSpriteExportImage> {
  const src = await blobToDataUrl(blob)
  return new Promise((resolve, reject) => {
    const ImageCtor = typeof Image !== 'undefined' ? Image : undefined
    if (!ImageCtor) {
      reject(new Error('image load failed'))
      return
    }
    const img = new ImageCtor()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas blob failed'))), 'image/png', 0.95)
  })
}
