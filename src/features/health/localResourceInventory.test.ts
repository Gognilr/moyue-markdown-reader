import { describe, expect, it } from 'vitest'
import { collectInspectableLocalReferences, resourceInventoryFromItems } from './localResourceInventory'

describe('resourceInventoryFromItems', () => {
  it('preserves exact Markdown URLs and exposes resource metadata to health checks', () => {
    expect(resourceInventoryFromItems([
      { reference: './assets/diagram.png', exists: true, byteLength: 2048, isImage: true },
      { reference: './missing.md', exists: false, isImage: false },
    ])).toEqual({
      './assets/diagram.png': { exists: true, byteLength: 2048 },
      './missing.md': { exists: false },
    })
  })
})

describe('collectInspectableLocalReferences', () => {
  it('keeps exact safe authored URLs while excluding remote and escaping targets', () => {
    expect(collectInspectableLocalReferences([
      '![diagram](assets/diagram.png?raw=1#top)',
      '[guide](docs/guide.md#start)',
      '![remote](https://example.com/a.png)',
      '![escape](../secret.png)',
      '[root](/shared/readme.md)',
    ].join('\n'))).toEqual(['assets/diagram.png?raw=1#top', 'docs/guide.md#start'])
  })
})
