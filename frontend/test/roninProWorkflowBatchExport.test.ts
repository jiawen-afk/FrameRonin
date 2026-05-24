import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorkflowBatchExportName,
  exportWorkflowResultsToDirectory,
} from '../src/lib/roninProWorkflowBatchExport'

test('builds stable numbered PNG names from a shared prefix', () => {
  assert.equal(buildWorkflowBatchExportName('hero walk', 0, 12), 'hero walk_001.png')
  assert.equal(buildWorkflowBatchExportName('hero walk', 11, 12), 'hero walk_012.png')
})

test('falls back to workflow prefix and removes unsafe filename characters', () => {
  assert.equal(buildWorkflowBatchExportName('', 0, 2), 'workflow_001.png')
  assert.equal(buildWorkflowBatchExportName('boss:idle/left*?|', 1, 2), 'boss_idle_left_002.png')
})

test('exports every result to the selected directory with generated names', async () => {
  const writes: Array<{ name: string; blobText: string }> = []
  const directory = {
    async getFileHandle(name: string, options: { create: boolean }) {
      assert.equal(options.create, true)
      return {
        async createWritable() {
          return {
            async write(blob: Blob) {
              writes.push({ name, blobText: await blob.text() })
            },
            async close() {
              return undefined
            },
          }
        },
      }
    },
  } as unknown as FileSystemDirectoryHandle

  const count = await exportWorkflowResultsToDirectory(
    [
      { name: 'a.png', url: 'blob:a' },
      { name: 'b.png', url: 'blob:b' },
    ],
    {
      directory,
      prefix: 'batch',
      fetchBlob: async (url) => new Blob([url.replace('blob:', '')], { type: 'image/png' }),
    }
  )

  assert.equal(count, 2)
  assert.deepEqual(writes, [
    { name: 'batch_001.png', blobText: 'a' },
    { name: 'batch_002.png', blobText: 'b' },
  ])
})
