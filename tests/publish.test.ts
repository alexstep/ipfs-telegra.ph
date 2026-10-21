import { describe, expect, test } from 'bun:test'
import { buildDirectory } from '../src/article/bundle'
import type { Article } from '../src/article/types'
import { publishArticle } from '../src/ipfs/publish'
import { memoryStore } from '../src/ipfs/store'
import { planPublish, type PinSettings } from '../src/settings'

const article: Article = {
  version: 1,
  title: 'Pinned note',
  author: 'Ada',
  createdAt: '2026-10-21T00:00:00.000Z',
  blocks: [{ type: 'p', inlines: [{ t: 'text', v: 'Body' }] }],
}

function settings(partial: Partial<PinSettings>): PinSettings {
  return {
    provider: 'local',
    endpoint: '',
    token: '',
    kuboApi: '',
    gateway: '',
    ...partial,
  }
}

describe('pinning providers', () => {
  test('chooses a provider from the settings', () => {
    expect(planPublish(settings({ provider: 'pinata' }))).toEqual({ ok: true, mode: 'local' })
    expect(planPublish(settings({ provider: 'pinata', token: 'jwt' }))).toEqual({ ok: true, mode: 'pinata' })
    expect(planPublish(settings({ provider: 'psa', token: 'jwt' })).ok).toBe(false)
    expect(planPublish(settings({ provider: 'psa', token: 'jwt', kuboApi: 'http://127.0.0.1:5001' }))).toEqual({ ok: true, mode: 'psa' })
    expect(planPublish(settings({ provider: 'kubo', kuboApi: 'http://127.0.0.1:5001' }))).toEqual({ ok: true, mode: 'kubo' })
  })

  test('uploads a directory to Pinata and keeps the returned CID', async () => {
    let authorization = ''
    let names: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      authorization = new Headers(init?.headers).get('authorization') || ''
      const form = init?.body as FormData
      names = form.getAll('file').map((file) => (file as File).name)
      expect(String(input)).toBe('https://api.pinata.cloud/pinning/pinFileToIPFS')
      expect(form.get('pinataOptions')).toBe(JSON.stringify({ cidVersion: 1, wrapWithDirectory: true }))
      return new Response(JSON.stringify({ IpfsHash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' }), { status: 200 })
    }
    const store = memoryStore()
    const published = await publishArticle(article, {
      settings: settings({ provider: 'pinata', token: 'secret-jwt', endpoint: 'https://api.pinata.cloud' }),
      store,
      fetchImpl,
    })
    expect(authorization).toBe('Bearer secret-jwt')
    expect(names).toContain('article.json')
    expect(names).toContain('index.html')
    expect(published.mode).toBe('pinata')
    expect(published.cid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
    expect(await store.get(published.cid)).not.toBeNull()
  })

  test('adds to Kubo and then pins through the pinning service API', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('/api/v0/add')) {
        return new Response('{"Name":"index.html","Hash":"bafyfile"}\n{"Name":"","Hash":"bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"}\n', { status: 200 })
      }
      const body = JSON.parse(String(init?.body)) as { cid: string; name: string }
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer psa-token')
      expect(body.cid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
      expect(body.name).toBe('Pinned note')
      return new Response(JSON.stringify({ requestid: '1', status: 'queued', pin: { cid: body.cid } }), { status: 202 })
    }
    const published = await publishArticle(article, {
      settings: settings({
        provider: 'psa',
        token: 'psa-token',
        endpoint: 'https://api.pinata.cloud/psa',
        kuboApi: 'http://127.0.0.1:5001',
      }),
      store: memoryStore(),
      fetchImpl,
    })
    expect(calls[0]).toContain('http://127.0.0.1:5001/api/v0/add')
    expect(calls[1]).toBe('https://api.pinata.cloud/psa/pins')
    expect(published.mode).toBe('psa')
  })

  test('reports a Pinata error without storing a CID', async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ error: 'bad token' }), { status: 401 })
    const store = memoryStore()
    await expect(publishArticle(article, {
      settings: settings({ provider: 'pinata', token: 'nope', endpoint: 'https://api.pinata.cloud' }),
      store,
      fetchImpl,
    })).rejects.toThrow('bad token')
  })

  test('local publishing does not touch the network', async () => {
    let called = false
    const fetchImpl: typeof fetch = async () => {
      called = true
      return new Response('no', { status: 500 })
    }
    const store = memoryStore()
    const published = await publishArticle(article, {
      settings: settings({ provider: 'local' }),
      store,
      fetchImpl,
    })
    expect(called).toBe(false)
    expect(published.cid.startsWith('bafy')).toBe(true)
    const files = await store.get(published.cid)
    expect(files?.some((file) => file.path === 'article.json')).toBe(true)
    expect(buildDirectory(article).files).toHaveLength(files?.length ?? 0)
  })
})
