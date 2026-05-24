export interface WorkflowBatchExportResult {
  name: string
  url: string
}

export interface WorkflowBatchExportOptions {
  directory: FileSystemDirectoryHandle
  prefix: string
  fetchBlob?: (url: string) => Promise<Blob>
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
