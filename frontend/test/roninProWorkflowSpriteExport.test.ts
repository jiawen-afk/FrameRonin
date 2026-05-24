import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWorkflowSpriteExportJson,
  buildWorkflowSpriteExportLayout,
  composeWorkflowSpriteSheet,
} from '../src/lib/roninProWorkflowBatchExport'

test('sprite layout grows rows when frames exceed one row', () => {
  const layout = buildWorkflowSpriteExportLayout(5, 3, 321, 280)
  assert.equal(layout.cols, 3)
  assert.equal(layout.rows, 2)
  assert.equal(layout.sheetWidth, 963)
  assert.equal(layout.sheetHeight, 560)
})

test('sprite json uses 12 fps timestamps', () => {
  const json = buildWorkflowSpriteExportJson({
    frameWidth: 321,
    frameHeight: 280,
    sheetWidth: 963,
    sheetHeight: 560,
    fps: 12,
    frames: [
      { i: 0, x: 0, y: 0, w: 321, h: 280 },
      { i: 1, x: 321, y: 0, w: 321, h: 280 },
    ],
  })

  assert.deepEqual(JSON.parse(json), {
    version: '1.0',
    frame_size: { w: 321, h: 280 },
    sheet_size: { w: 963, h: 560 },
    frames: [
      { i: 0, x: 0, y: 0, w: 321, h: 280, t: 0 },
      { i: 1, x: 321, y: 0, w: 321, h: 280, t: 0.083 },
    ],
  })
})

test('sprite json uses 24 fps timestamps', () => {
  const json = buildWorkflowSpriteExportJson({
    frameWidth: 321,
    frameHeight: 280,
    sheetWidth: 963,
    sheetHeight: 560,
    fps: 24,
    frames: [
      { i: 0, x: 0, y: 0, w: 321, h: 280 },
      { i: 1, x: 321, y: 0, w: 321, h: 280 },
    ],
  })

  const parsed = JSON.parse(json)
  assert.equal(parsed.frames[1].t, 0.042)
})

test('sprite sheet composition places cells row major by columns', async () => {
  const calls: Array<{ x: number; y: number; w: number; h: number }> = []
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        imageSmoothingEnabled: false,
        clearRect() {},
        drawImage(_: unknown, _sx: number, _sy: number, _sw: number, _sh: number, dx: number, dy: number, dw: number, dh: number) {
          calls.push({ x: dx, y: dy, w: dw, h: dh })
        },
      }
    },
    toBlob(cb: (b: Blob | null) => void) {
      cb(new Blob(['png']))
    },
  } as unknown as HTMLCanvasElement

  const originalDocument = globalThis.document
  globalThis.document = {
    createElement(tag: string) {
      assert.equal(tag, 'canvas')
      return canvas
    },
  } as unknown as Document

  try {
    const result = await composeWorkflowSpriteSheet(
      [
        new Blob(['a']),
        new Blob(['b']),
        new Blob(['c']),
      ],
      {
        columns: 2,
        fps: 12,
        loadImage: async () => ({ naturalWidth: 321, naturalHeight: 280 }),
      }
    )
    assert.equal(result.layout.sheetWidth, 642)
    assert.equal(result.layout.sheetHeight, 560)
    assert.ok(result.pngBlob.size > 0)
    assert.equal(calls.length, 3)
    assert.deepEqual(calls[0], { x: 0, y: 0, w: 321, h: 280 })
    assert.deepEqual(calls[1], { x: 321, y: 0, w: 321, h: 280 })
    assert.deepEqual(calls[2], { x: 0, y: 280, w: 321, h: 280 })
  } finally {
    globalThis.document = originalDocument
  }
})
