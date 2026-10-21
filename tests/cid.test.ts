import { describe, expect, test } from 'bun:test'
import { exporter } from 'ipfs-unixfs-exporter'
import { CID } from 'multiformats/cid'
import type { IpfsFile } from '../src/article/types'
import { importDirectory } from '../src/ipfs/cid'

const files: IpfsFile[] = [
  { path: 'index.html', bytes: new TextEncoder().encode('<h1>Hi</h1>'), type: 'text/html' },
  { path: 'article.json', bytes: new TextEncoder().encode('{"version":1,"title":"Hi"}'), type: 'application/json' },
  { path: 'images/0.jpg', bytes: Uint8Array.from([1, 2, 3, 4]), type: 'image/jpeg' },
]

async function read(entry: { type: string; content?: () => AsyncIterable<Uint8Array> }): Promise<Uint8Array> {
  if (entry.type !== 'file' && entry.type !== 'raw' && entry.type !== 'identity') {
    throw new Error(`unexpected ${entry.type}`)
  }
  const chunks: Uint8Array[] = []
  for await (const chunk of entry.content!()) chunks.push(chunk)
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

describe('unixfs cid', () => {
  test('is a stable CIDv1 directory whose files can be read back', async () => {
    const first = await importDirectory(files)
    const second = await importDirectory([...files].reverse())
    expect(first.cid).toBe(second.cid)
    const cid = CID.parse(first.cid)
    expect(cid.version).toBe(1)
    expect(first.cid.startsWith('bafy')).toBe(true)

    const article = await exporter(`${first.cid}/article.json`, first.blockstore)
    const bytes = await read(article)
    expect(new TextDecoder().decode(bytes)).toContain('"title":"Hi"')

    const changed = files.map((file) => file.path === 'article.json'
      ? { ...file, bytes: new TextEncoder().encode('{"version":1,"title":"Edited"}') }
      : file)
    const other = await importDirectory(changed)
    expect(other.cid).not.toBe(first.cid)
  })
})
