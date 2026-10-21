import { renderArticleHtml, formatDate } from './article/render'
import type { Article } from './article/types'
import { gatewayList, ipfsUrl } from './ipfs/gateways'
import { imageSource, loadArticle } from './ipfs/publish'
import type { ContentStore } from './ipfs/store'
import { loadSettings } from './settings'

export async function articleWithImages(cid: string, article: Article, files: { path: string; bytes: Uint8Array; type: string }[] | null, fetchImpl?: typeof fetch): Promise<Article> {
  const gateways = gatewayList(loadSettings().gateway)
  const blocks = []
  for (const block of article.blocks) {
    if (block.type !== 'image') {
      blocks.push(block)
      continue
    }
    try {
      const src = await imageSource(cid, block.src, { files, gateways, fetchImpl })
      blocks.push({ ...block, src })
    } catch {
      blocks.push({ type: 'p' as const, inlines: [{ t: 'text' as const, v: block.caption || 'Image unavailable' }] })
    }
  }
  return { ...article, blocks, previousCid: cid }
}

export async function showArticle(host: HTMLElement, cid: string, store: ContentStore, hooks: {
  onEdit: (article: Article) => void
}): Promise<void> {
  host.innerHTML = `
    <div class="tl_page_wrap">
      <div class="corner reader_corner">
        <button type="button" class="text_button" id="share">Share</button>
        <a class="text_button" href="#/">New</a>
        <button type="button" class="text_button" id="edit">Edit</button>
        <div class="error_msg" id="error" role="alert"></div>
      </div>
      <p class="loading_note">Loading…</p>
    </div>
  `
  try {
    const loaded = await loadArticle(cid, { store, gateway: loadSettings().gateway })
    const article = loaded.article
    const date = formatDate(article.createdAt)
    const gateways = gatewayList(loadSettings().gateway)
    const links = loaded.source === 'local'
      ? '<p class="pin_note">Stored in this browser. Add a pinning token in settings to publish it to the IPFS network.</p>'
      : `<p class="pin_note">Pinned. ${gateways.map((gateway) => {
          const url = `${ipfsUrl(gateway, cid)}/`
          const name = gateway.replace(/^https?:\/\//, '').replace(/\/ipfs$/, '')
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>`
        }).join(' · ')}</p>`
    host.innerHTML = `
      <div class="tl_page_wrap">
        <div class="corner reader_corner">
          <button type="button" class="text_button" id="share">Share</button>
          <a class="text_button" href="#/">New</a>
          <button type="button" class="text_button" id="edit">Edit</button>
          <div class="error_msg" id="error" role="alert"></div>
        </div>
        <article class="tl_article">
          <header class="tl_article_header">
            <h1 dir="auto"></h1>
            <address dir="auto"></address>
          </header>
          <div class="tl_article_content" dir="auto"></div>
        </article>
        ${links}
      </div>
    `
    const heading = host.querySelector('h1') as HTMLElement
    const address = host.querySelector('address') as HTMLElement
    const content = host.querySelector('.tl_article_content') as HTMLElement
    heading.textContent = article.title
    address.textContent = ''
    if (article.author) {
      const author = document.createElement('span')
      author.textContent = article.author
      address.append(author)
    }
    if (date) {
      const time = document.createElement('time')
      time.dateTime = article.createdAt
      time.textContent = date
      address.append(time)
    }
    content.innerHTML = renderArticleHtml(article).replace(/src="\.\/(images\/[^"]+)"/g, 'data-path="$1"')
    const imageJobs = [...content.querySelectorAll('img')].map(async (img) => {
      const path = img.getAttribute('data-path') || ''
      img.removeAttribute('src')
      try {
        img.src = await imageSource(cid, path, { files: loaded.files, gateways, fetchImpl: fetch })
      } catch {
        img.alt = img.alt || 'Image unavailable'
      }
    })
    await Promise.all(imageJobs)
    host.querySelector('#share')?.addEventListener('click', async () => {
      const url = location.href
      try {
        if (navigator.share) await navigator.share({ title: article.title, url })
        else await navigator.clipboard.writeText(url)
        flash(host, 'Link copied')
      } catch {
        flash(host, url)
      }
    })
    host.querySelector('#edit')?.addEventListener('click', () => {
      void articleWithImages(cid, article, loaded.files).then(hooks.onEdit)
    })
  } catch (error) {
    const note = host.querySelector('.loading_note')
    if (note) note.textContent = error instanceof Error ? error.message : 'Could not open the article'
  }
}

function flash(host: HTMLElement, message: string) {
  const error = host.querySelector('#error')
  if (!(error instanceof HTMLElement)) return
  error.textContent = message
  error.classList.add('shown', 'note')
  window.setTimeout(() => error.classList.remove('shown', 'note'), 2500)
}
