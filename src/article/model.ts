import { CID } from 'multiformats/cid'
import type { Article, Block, Inline } from './types'
import {
  appendInlines,
  inlinesAreEmpty,
  inlinesFromElement,
  isSafeImageSrc,
  sanitizeEmbed,
  sanitizeHref,
} from './text'

export function parseArticle(input: unknown): Article {
  if (!input || typeof input !== 'object') throw new Error('Article JSON is not an object')
  const raw = input as Record<string, unknown>
  if (raw.version !== 1) throw new Error('Unsupported article version')
  if (typeof raw.title !== 'string') throw new Error('Article title is missing')
  if (typeof raw.author !== 'string') throw new Error('Article author is missing')
  if (!Array.isArray(raw.blocks)) throw new Error('Article blocks are missing')
  let previousCid: string | undefined
  if (typeof raw.previousCid === 'string' && raw.previousCid) {
    CID.parse(raw.previousCid)
    previousCid = raw.previousCid
  }
  return {
    version: 1,
    title: raw.title,
    author: raw.author,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    previousCid,
    blocks: raw.blocks.map(parseBlock),
  }
}

function parseBlock(input: unknown): Block {
  if (!input || typeof input !== 'object') throw new Error('Invalid block')
  const raw = input as Record<string, unknown>
  switch (raw.type) {
    case 'p':
    case 'quote':
    case 'pull':
      return { type: raw.type, inlines: parseInlines(raw.inlines) }
    case 'h3':
    case 'h4':
    case 'code':
      if (typeof raw.text !== 'string') throw new Error('Invalid text block')
      return { type: raw.type, text: raw.text }
    case 'hr':
      return { type: 'hr' }
    case 'image': {
      if (typeof raw.src !== 'string' || !isSafeImageSrc(raw.src)) throw new Error('Invalid image')
      return { type: 'image', src: raw.src, caption: typeof raw.caption === 'string' ? raw.caption : '' }
    }
    case 'embed': {
      if (typeof raw.src !== 'string') throw new Error('Invalid embed')
      const embed = sanitizeEmbed(raw.src)
      if (!embed) throw new Error('Invalid embed')
      return { type: 'embed', provider: embed.provider, src: embed.src }
    }
    default:
      throw new Error('Unknown block')
  }
}

function parseInlines(input: unknown): Inline[] {
  if (!Array.isArray(input)) throw new Error('Invalid inlines')
  return input.map(parseInline)
}

function parseInline(input: unknown): Inline {
  if (!input || typeof input !== 'object') throw new Error('Invalid inline')
  const raw = input as Record<string, unknown>
  switch (raw.t) {
    case 'text':
    case 'code':
      if (typeof raw.v !== 'string') throw new Error('Invalid text')
      return { t: raw.t, v: raw.v }
    case 'br':
      return { t: 'br' }
    case 'bold':
    case 'italic':
      return { t: raw.t, c: parseInlines(raw.c) }
    case 'link': {
      if (typeof raw.href !== 'string') throw new Error('Invalid link')
      const href = sanitizeHref(raw.href)
      if (!href) throw new Error('Invalid link')
      return { t: 'link', href, c: parseInlines(raw.c) }
    }
    default:
      throw new Error('Unknown inline')
  }
}

export function readBlock(el: Element): Block | null {
  const type = el.getAttribute('data-type') || tagType(el)
  if (type === 'hr') return { type: 'hr' }
  if (type === 'image') {
    const img = el.querySelector('img')
    const src = img?.getAttribute('src') || ''
    if (!isSafeImageSrc(src)) return null
    const caption = (el.querySelector('figcaption')?.textContent || '').trim()
    return { type: 'image', src, caption }
  }
  if (type === 'embed') {
    const iframe = el.querySelector('iframe')
    const embed = sanitizeEmbed(iframe?.getAttribute('src') || '')
    if (!embed) return null
    return { type: 'embed', provider: embed.provider, src: embed.src }
  }
  if (type === 'h3' || type === 'h4' || type === 'code') {
    const text = (el.textContent || '').replace(/\u00a0/g, ' ')
    if (!text.trim()) return null
    return { type, text }
  }
  if (type === 'p' || type === 'quote' || type === 'pull') {
    const inlines = inlinesFromElement(el)
    if (inlinesAreEmpty(inlines)) return null
    return { type, inlines }
  }
  return null
}

function tagType(el: Element): string {
  const tag = el.tagName
  if (tag === 'H3') return 'h3'
  if (tag === 'H4') return 'h4'
  if (tag === 'BLOCKQUOTE') return 'quote'
  if (tag === 'ASIDE') return 'pull'
  if (tag === 'PRE') return 'code'
  if (tag === 'HR') return 'hr'
  if (tag === 'FIGURE') return el.querySelector('iframe') ? 'embed' : 'image'
  return 'p'
}

export function readArticle(options: {
  title: string
  author: string
  body: Element
  createdAt: string
  previousCid?: string
}): Article {
  const blocks: Block[] = []
  for (const child of options.body.children) {
    const block = readBlock(child)
    if (block) blocks.push(block)
  }
  return {
    version: 1,
    title: options.title.replace(/\s+/g, ' ').trim(),
    author: options.author.replace(/\s+/g, ' ').trim(),
    createdAt: options.createdAt,
    previousCid: options.previousCid,
    blocks,
  }
}

export function blockElement(doc: Document, block: Block): HTMLElement {
  if (block.type === 'hr') {
    const hr = doc.createElement('hr')
    hr.className = 'block'
    hr.setAttribute('data-type', 'hr')
    return hr
  }
  if (block.type === 'image') {
    const figure = doc.createElement('figure')
    figure.className = 'block'
    figure.setAttribute('data-type', 'image')
    const wrap = doc.createElement('div')
    wrap.className = 'figure_wrapper'
    const img = doc.createElement('img')
    img.alt = block.caption
    img.src = block.src
    wrap.append(img)
    const remove = doc.createElement('button')
    remove.type = 'button'
    remove.className = 'remove_block'
    remove.setAttribute('aria-label', 'Remove image')
    remove.textContent = '×'
    const caption = doc.createElement('figcaption')
    caption.setAttribute('contenteditable', 'true')
    caption.setAttribute('data-placeholder', 'Caption (optional)')
    caption.textContent = block.caption
    if (!block.caption) caption.classList.add('empty')
    figure.append(wrap, remove, caption)
    return figure
  }
  if (block.type === 'embed') {
    const figure = doc.createElement('figure')
    figure.className = 'block'
    figure.setAttribute('data-type', 'embed')
    const wrap = doc.createElement('div')
    wrap.className = 'iframe_wrap'
    const helper = doc.createElement('div')
    helper.className = 'iframe_helper'
    const iframe = doc.createElement('iframe')
    iframe.src = block.src
    iframe.setAttribute('allowfullscreen', 'true')
    iframe.setAttribute('frameborder', '0')
    helper.append(iframe)
    wrap.append(helper)
    const remove = doc.createElement('button')
    remove.type = 'button'
    remove.className = 'remove_block'
    remove.setAttribute('aria-label', 'Remove embed')
    remove.textContent = '×'
    figure.append(wrap, remove)
    return figure
  }
  const tag = block.type === 'quote' ? 'blockquote'
    : block.type === 'pull' ? 'aside'
    : block.type === 'h3' ? 'h3'
    : block.type === 'h4' ? 'h4'
    : block.type === 'code' ? 'pre'
    : 'p'
  const el = doc.createElement(tag)
  el.className = 'block'
  el.setAttribute('data-type', block.type)
  el.setAttribute('contenteditable', 'true')
  if (block.type === 'h3' || block.type === 'h4' || block.type === 'code') {
    el.textContent = block.text
  } else {
    appendInlines(doc, el, block.inlines)
  }
  return el
}
