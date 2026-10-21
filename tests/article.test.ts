import { describe, expect, test } from 'bun:test'
import { parseHTML } from 'linkedom'
import { buildDirectory } from '../src/article/bundle'
import { parseArticle, readBlock } from '../src/article/model'
import { renderPublishedHtml } from '../src/article/render'
import type { Article } from '../src/article/types'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function sample(): Article {
  return {
    version: 1,
    title: 'Harbor <script>',
    author: 'Ada & Bob',
    createdAt: '2026-10-21T12:00:00.000Z',
    blocks: [
      { type: 'p', inlines: [{ t: 'text', v: 'A ' }, { t: 'bold', c: [{ t: 'text', v: 'quiet' }] }, { t: 'text', v: ' note' }] },
      { type: 'quote', inlines: [{ t: 'link', href: 'https://example.com', c: [{ t: 'text', v: 'source' }] }] },
      { type: 'image', src: PNG, caption: 'Pier' },
    ],
  }
}

describe('article serialization', () => {
  test('escapes text and keeps telegraph blocks in the published page', () => {
    const { article, files } = buildDirectory(sample())
    const html = new TextDecoder().decode(files[0]!.bytes)
    expect(files.map((file) => file.path)).toEqual(['index.html', 'article.json', 'images/0.png'])
    expect(html).toContain('Harbor &lt;script&gt;')
    expect(html).toContain('Ada &amp; Bob')
    expect(html).toContain('<strong>quiet</strong>')
    expect(html).toContain('<blockquote><a href="https://example.com"')
    expect(html).toContain('src="./images/0.png"')
    expect(html).not.toContain('Harbor <script>')
    const roundTrip = parseArticle(JSON.parse(new TextDecoder().decode(files[1]!.bytes)))
    expect(roundTrip).toEqual(article)
    expect(roundTrip.blocks[2]).toEqual({ type: 'image', src: 'images/0.png', caption: 'Pier' })
  })

  test('rejects a bad version and a javascript link', () => {
    expect(() => parseArticle({ version: 2, title: 'T', author: '', blocks: [] })).toThrow('Unsupported')
    expect(() => parseArticle({
      version: 1,
      title: 'T',
      author: '',
      blocks: [{ type: 'p', inlines: [{ t: 'link', href: 'javascript:alert(1)', c: [{ t: 'text', v: 'x' }] }] }],
    })).toThrow('Invalid link')
  })

  test('reads formatted editor html and drops unsafe links', () => {
    const { document } = parseHTML('<div></div>')
    const quote = document.createElement('blockquote')
    quote.setAttribute('data-type', 'quote')
    quote.innerHTML = 'See <a href="javascript:alert(1)">nope</a> <a href="https://example.com">yes</a>'
    expect(readBlock(quote)).toEqual({
      type: 'quote',
      inlines: [
        { t: 'text', v: 'See nope ' },
        { t: 'link', href: 'https://example.com', c: [{ t: 'text', v: 'yes' }] },
      ],
    })
  })

  test('published html is a complete document', () => {
    const html = renderPublishedHtml(sample(), 'h1{color:red}')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('h1{color:red}')
    expect(html).toContain('October 21, 2026')
  })
})
