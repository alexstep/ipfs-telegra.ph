import type { Article, IpfsFile } from './types'
import { extensionForType, isImageDataUrl, parseDataUrl } from './text'
import { renderPublishedHtml } from './render'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function buildDirectory(article: Article, css = ''): { article: Article; files: IpfsFile[] } {
  const files: IpfsFile[] = []
  let imageIndex = 0
  const blocks = article.blocks.map((block) => {
    if (block.type !== 'image') return block
    if (block.src.startsWith('images/')) return block
    if (!isImageDataUrl(block.src)) throw new Error('Invalid file format')
    const parsed = parseDataUrl(block.src)
    if (!parsed) throw new Error('Invalid file format')
    if (parsed.bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('File too big (up to 5 MB allowed)')
    const path = `images/${imageIndex}.${extensionForType(parsed.type)}`
    imageIndex += 1
    files.push({ path, bytes: parsed.bytes, type: parsed.type })
    return { ...block, src: path }
  })
  const normalized: Article = { ...article, blocks }
  const json = JSON.stringify(normalized)
  const html = renderPublishedHtml(normalized, css)
  return {
    article: normalized,
    files: [
      { path: 'index.html', bytes: new TextEncoder().encode(html), type: 'text/html; charset=utf-8' },
      { path: 'article.json', bytes: new TextEncoder().encode(json), type: 'application/json' },
      ...files,
    ],
  }
}
