import { describe, expect, test } from 'bun:test'
import type { Article } from '../src/article/types'
import { fetchIpfsPath, ipfsUrl } from '../src/ipfs/gateways'
import { loadArticle } from '../src/ipfs/publish'
import { memoryStore } from '../src/ipfs/store'

const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'

const article: Article = {
  version: 1,
  title: 'From a gateway',
  author: 'Ada',
  createdAt: '2026-10-21T00:00:00.000Z',
  blocks: [{ type: 'p', inlines: [{ t: 'text', v: 'Hello' }] }],
}

describe('gateway fallback', () => {
  test('builds a path url and stops at the first gateway that answers', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('gateway.pinata.cloud')) return new Response('busy', { status: 429 })
      return new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    const got = await fetchIpfsPath(CID, 'article.json', {
      gateways: [
        'https://gateway.pinata.cloud/ipfs',
        'https://ipfs.filebase.io/ipfs',
        'https://4everland.io/ipfs',
      ],
      fetchImpl,
    })
    expect(calls).toEqual([
      ipfsUrl('https://gateway.pinata.cloud/ipfs', CID, 'article.json'),
      ipfsUrl('https://ipfs.filebase.io/ipfs', CID, 'article.json'),
    ])
    expect(new TextDecoder().decode(got.bytes)).toBe('hello')
    expect(got.gateway).toContain('filebase')
  })

  test('tries the next gateway after a network error and parses the article', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (!url.includes('4everland.io')) throw new Error('offline')
      return new Response(JSON.stringify(article), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const loaded = await loadArticle(CID, { store: memoryStore(), fetchImpl, timeoutMs: 1000 })
    expect(loaded.source).toContain('4everland.io')
    expect(loaded.article.title).toBe('From a gateway')
    expect(calls).toHaveLength(3)
  })

  test('does not call the network for a CID already stored locally', async () => {
    const store = memoryStore()
    const bytes = new TextEncoder().encode(JSON.stringify(article))
    await store.put(CID, [{ path: 'article.json', bytes, type: 'application/json' }])
    let called = false
    const fetchImpl: typeof fetch = async () => {
      called = true
      return new Response('no', { status: 500 })
    }
    const loaded = await loadArticle(CID, { store, fetchImpl })
    expect(called).toBe(false)
    expect(loaded.source).toBe('local')
    expect(loaded.article.author).toBe('Ada')
  })

  test('rejects an invalid CID before fetching', async () => {
    let called = false
    const fetchImpl: typeof fetch = async () => {
      called = true
      return new Response('no')
    }
    await expect(fetchIpfsPath('not a cid', '', { gateways: ['https://ipfs.filebase.io/ipfs'], fetchImpl })).rejects.toThrow()
    expect(called).toBe(false)
  })
})
