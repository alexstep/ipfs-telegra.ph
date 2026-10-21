import { buildDirectory } from '../article/bundle'
import { parseArticle } from '../article/model'
import type { Article } from '../article/types'
import { bytesToDataUrl } from '../article/text'
import { planPublish, type PinSettings } from '../settings'
import { directoryCid } from './cid'
import { assertCid, fetchIpfsPath, gatewayList } from './gateways'
import { addToKubo, pinWithPsa, uploadToPinata, type PublishMode } from './pin'
import type { ContentStore } from './store'

export type Published = {
  cid: string
  mode: PublishMode
  article: Article
}

export async function publishArticle(article: Article, options: {
  settings: PinSettings
  store: ContentStore
  fetchImpl?: typeof fetch
  css?: string
}): Promise<Published> {
  const plan = planPublish(options.settings)
  if (!plan.ok) throw new Error(plan.message)
  const bundle = buildDirectory(article, options.css)
  const name = bundle.article.title || 'article'
  let cid: string
  if (plan.mode === 'pinata') {
    cid = await uploadToPinata(bundle.files, {
      endpoint: options.settings.endpoint,
      token: options.settings.token.trim(),
      name,
      fetchImpl: options.fetchImpl,
    })
  } else if (plan.mode === 'kubo' || plan.mode === 'psa') {
    cid = await addToKubo(bundle.files, {
      api: options.settings.kuboApi.trim(),
      fetchImpl: options.fetchImpl,
    })
    if (plan.mode === 'psa') {
      await pinWithPsa(cid, {
        endpoint: options.settings.endpoint,
        token: options.settings.token.trim(),
        name,
        fetchImpl: options.fetchImpl,
      })
    }
  } else {
    cid = await directoryCid(bundle.files)
  }
  await options.store.put(cid, bundle.files)
  return { cid, mode: plan.mode, article: bundle.article }
}

export async function loadArticle(cid: string, options: {
  store: ContentStore
  gateway?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<{ article: Article; source: string; files: { path: string; bytes: Uint8Array; type: string }[] | null }> {
  assertCid(cid)
  const cached = await options.store.get(cid)
  if (cached) {
    const json = cached.find((file) => file.path === 'article.json')
    if (json) {
      return {
        article: parseArticle(JSON.parse(new TextDecoder().decode(json.bytes))),
        source: 'local',
        files: cached,
      }
    }
  }
  const gateways = gatewayList(options.gateway)
  const errors: string[] = []
  for (const gateway of gateways) {
    try {
      const got = await fetchIpfsPath(cid, 'article.json', {
        gateways: [gateway],
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      })
      const article = parseArticle(JSON.parse(new TextDecoder().decode(got.bytes)))
      return { article, source: gateway, files: null }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new Error(`Could not read the article. ${errors.join(' | ')}`)
}

export async function imageSource(cid: string, path: string, options: {
  files: { path: string; bytes: Uint8Array; type: string }[] | null
  gateways: string[]
  fetchImpl?: typeof fetch
}): Promise<string> {
  const local = options.files?.find((file) => file.path === path)
  if (local) return bytesToDataUrl(local.bytes, local.type || 'image/jpeg')
  const got = await fetchIpfsPath(cid, path, { gateways: options.gateways, fetchImpl: options.fetchImpl })
  const type = got.contentType.split(';')[0]?.trim() || 'image/jpeg'
  return bytesToDataUrl(got.bytes, type.startsWith('image/') ? type : 'image/jpeg')
}
