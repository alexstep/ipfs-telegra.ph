export const ARTICLE_VERSION = 1 as const

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'br' }

export type Block =
  | { type: 'p'; inlines: Inline[] }
  | { type: 'h3'; text: string }
  | { type: 'h4'; text: string }
  | { type: 'quote'; inlines: Inline[] }
  | { type: 'pull'; inlines: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'hr' }
  | { type: 'image'; src: string; caption: string }
  | { type: 'embed'; provider: 'youtube' | 'vimeo'; src: string }

export type Article = {
  version: typeof ARTICLE_VERSION
  title: string
  author: string
  createdAt: string
  previousCid?: string
  blocks: Block[]
}

export type IpfsFile = {
  path: string
  bytes: Uint8Array
  type: string
}
