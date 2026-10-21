import type { Inline } from './types'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function sanitizeHref(value: string): string | null {
  const href = value.trim()
  if (!href) return null
  if (/^(https?:|mailto:)/i.test(href)) {
    if (/[\s<>"']/.test(href)) return null
    return href
  }
  if (href.startsWith('//')) return null
  return null
}

export function sanitizeEmbed(src: string): { provider: 'youtube' | 'vimeo'; src: string } | null {
  const value = src.trim()
  let match = value.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([\w-]{6,})/i,
  )
  if (match?.[1]) {
    return { provider: 'youtube', src: `https://www.youtube.com/embed/${match[1]}` }
  }
  match = value.match(/^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:video\/)?(\d{5,})/i)
  if (match?.[1]) {
    return { provider: 'vimeo', src: `https://player.vimeo.com/video/${match[1]}` }
  }
  if (/^https:\/\/www\.youtube\.com\/embed\/[\w-]{6,}$/.test(value)) {
    return { provider: 'youtube', src: value }
  }
  if (/^https:\/\/player\.vimeo\.com\/video\/\d{5,}$/.test(value)) {
    return { provider: 'vimeo', src: value }
  }
  return null
}

export function isDirectoryImagePath(src: string): boolean {
  return /^images\/[a-zA-Z0-9._-]+$/.test(src)
}

export function isImageDataUrl(src: string): boolean {
  return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)
}

export function isSafeImageSrc(src: string): boolean {
  return isDirectoryImagePath(src) || isImageDataUrl(src)
}

const TEXT_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'A', 'CODE', 'BR', 'SPAN'])

export function inlinesFromElement(root: Node): Inline[] {
  const out: Inline[] = []
  for (const node of root.childNodes) {
    if (node.nodeType === 3) {
      const v = node.textContent ?? ''
      if (v) out.push({ t: 'text', v })
      continue
    }
    if (node.nodeType !== 1) continue
    const el = node as Element
    const tag = el.tagName
    if (tag === 'BR') {
      out.push({ t: 'br' })
    } else if (tag === 'STRONG' || tag === 'B') {
      out.push({ t: 'bold', c: inlinesFromElement(el) })
    } else if (tag === 'EM' || tag === 'I') {
      out.push({ t: 'italic', c: inlinesFromElement(el) })
    } else if (tag === 'CODE') {
      const v = el.textContent ?? ''
      if (v) out.push({ t: 'code', v })
    } else if (tag === 'A') {
      const href = sanitizeHref(el.getAttribute('href') || '')
      const children = inlinesFromElement(el)
      if (href && children.length) out.push({ t: 'link', href, c: children })
      else out.push(...children)
    } else if (!TEXT_TAGS.has(tag)) {
      out.push(...inlinesFromElement(el))
    } else {
      out.push(...inlinesFromElement(el))
    }
  }
  return mergeText(out)
}

export function mergeText(inlines: Inline[]): Inline[] {
  const out: Inline[] = []
  for (const inline of inlines) {
    const prev = out[out.length - 1]
    if (inline.t === 'text' && prev?.t === 'text') prev.v += inline.v
    else if (inline.t === 'bold' || inline.t === 'italic' || inline.t === 'link') {
      const children = mergeText(inline.c)
      if (children.length) out.push({ ...inline, c: children })
    } else if (inline.t === 'text' && inline.v === '') {
      continue
    } else {
      out.push(inline)
    }
  }
  return out
}

export function inlinesToText(inlines: Inline[]): string {
  return inlines.map(inlineToText).join('')
}

function inlineToText(inline: Inline): string {
  switch (inline.t) {
    case 'text':
    case 'code':
      return inline.v
    case 'br':
      return '\n'
    case 'bold':
    case 'italic':
    case 'link':
      return inlinesToText(inline.c)
  }
}

export function inlinesAreEmpty(inlines: Inline[]): boolean {
  return inlinesToText(inlines).trim() === ''
}

export function renderInlines(inlines: Inline[]): string {
  return inlines.map(renderInline).join('')
}

function renderInline(inline: Inline): string {
  switch (inline.t) {
    case 'text':
      return escapeHtml(inline.v)
    case 'br':
      return '<br>'
    case 'bold':
      return `<strong>${renderInlines(inline.c)}</strong>`
    case 'italic':
      return `<em>${renderInlines(inline.c)}</em>`
    case 'code':
      return `<code>${escapeHtml(inline.v)}</code>`
    case 'link': {
      const href = sanitizeHref(inline.href)
      if (!href) return renderInlines(inline.c)
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${renderInlines(inline.c)}</a>`
    }
  }
}

export function appendInlines(doc: Document, parent: HTMLElement, inlines: Inline[]): void {
  for (const inline of inlines) parent.append(inlineNode(doc, inline))
  if (!parent.childNodes.length) parent.append(doc.createElement('br'))
}

function inlineNode(doc: Document, inline: Inline): Node {
  switch (inline.t) {
    case 'text':
      return doc.createTextNode(inline.v)
    case 'br':
      return doc.createElement('br')
    case 'code': {
      const code = doc.createElement('code')
      code.textContent = inline.v
      return code
    }
    case 'bold':
    case 'italic': {
      const el = doc.createElement(inline.t === 'bold' ? 'strong' : 'em')
      appendInlines(doc, el, inline.c)
      return el
    }
    case 'link': {
      const href = sanitizeHref(inline.href)
      if (!href) {
        const span = doc.createElement('span')
        appendInlines(doc, span, inline.c)
        return span
      }
      const a = doc.createElement('a')
      a.setAttribute('href', href)
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
      appendInlines(doc, a, inline.c)
      return a
    }
  }
}

export function parseDataUrl(src: string): { type: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(src)
  if (!match?.[1] || !match[2]) return null
  const binary = atob(match[2].replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const type = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
  return { type, bytes }
}

export function bytesToDataUrl(bytes: Uint8Array, type: string): string {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, i + step)
    binary += String.fromCharCode(...slice)
  }
  return `data:${type};base64,${btoa(binary)}`
}

export function extensionForType(type: string): string {
  if (type.includes('png')) return 'png'
  if (type.includes('gif')) return 'gif'
  if (type.includes('webp')) return 'webp'
  return 'jpg'
}
