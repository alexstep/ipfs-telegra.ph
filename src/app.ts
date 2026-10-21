import { mountEditor, type EditorController } from './editor'
import { loadHistory, remember } from './history'
import { publishArticle } from './ipfs/publish'
import { browserStore } from './ipfs/store'
import { showArticle } from './reader'
import { formatDate } from './article/render'
import type { Article } from './article/types'
import { loadSettings, modeLabel, saveSettings, defaultEndpoint, type PinSettings, type Provider } from './settings'

const store = browserStore()
let editor: EditorController | null = null
let pendingEdit: Article | null = null
let fontPromise: Promise<string> | null = null

export function startApp(root: HTMLElement): void {
  window.addEventListener('hashchange', () => render(root))
  render(root)
  document.body.classList.remove('loading')
}

function render(root: HTMLElement) {
  const route = parseRoute(location.hash)
  if (route.kind === 'edit') {
    const initial = pendingEdit
    pendingEdit = null
    editor?.destroy()
    editor = mountEditor(root, {
      initial,
      modeLabel: modeLabel(loadSettings()),
      onPublish: (article) => void publish(article),
      onSettings: () => openSettings(),
      onHistory: () => { location.hash = '#/history' },
    })
    return
  }
  editor?.destroy()
  editor = null
  if (route.kind === 'history') {
    renderHistory(root)
    return
  }
  void showArticle(root, route.cid, store, {
    onEdit: (article) => {
      pendingEdit = article
      location.hash = '#/'
    },
  })
}

async function publish(article: Article) {
  if (article.title.trim().length < 2) {
    editor?.markTitleRequired()
    editor?.showError('Title is too small')
    return
  }
  document.body.classList.add('publishing')
  try {
    const css = await loadFontCss()
    const result = await publishArticle({
      ...article,
      createdAt: new Date().toISOString(),
    }, {
      settings: loadSettings(),
      store,
      css,
    })
    editor?.discardDraft()
    remember({
      cid: result.cid,
      title: result.article.title,
      author: result.article.author,
      createdAt: result.article.createdAt,
      mode: result.mode,
      previousCid: result.article.previousCid,
    })
    location.hash = `#/p/${result.cid}`
  } catch (error) {
    editor?.showError(error instanceof Error ? error.message : 'Could not publish')
  } finally {
    document.body.classList.remove('publishing')
  }
}

function loadFontCss(): Promise<string> {
  fontPromise ??= fetch(new URL('css/fonts.css', document.baseURI))
    .then((response) => response.ok ? response.text() : '')
    .catch(() => '')
  return fontPromise
}

function renderHistory(root: HTMLElement) {
  const items = loadHistory()
  const list = items.length
    ? items.map((item) => {
        const when = formatDate(item.createdAt)
        const where = item.mode === 'local' ? 'this browser' : item.mode
        return `<li><a href="#/p/${encodeURIComponent(item.cid)}"><strong>${escapeText(item.title)}</strong><span>${escapeText([item.author, when, where].filter(Boolean).join(' · '))}</span></a></li>`
      }).join('')
    : '<li class="empty">Nothing published from this browser yet.</li>'
  root.innerHTML = `
    <div class="tl_page_wrap history_page">
      <div class="corner"><a class="text_button" href="#/">Editor</a></div>
      <h1>Published</h1>
      <ul class="history_list">${list}</ul>
    </div>
  `
}

function openSettings() {
  const current = loadSettings()
  const modal = document.createElement('div')
  modal.className = 'tl_alert'
  modal.innerHTML = `
    <main class="tl_alert_message settings_message">
      <h2>Pinning</h2>
      <label>Service
        <select id="pin-provider">
          <option value="local">This browser only</option>
          <option value="pinata">Pinata</option>
          <option value="psa">IPFS Pinning Service API</option>
          <option value="kubo">Kubo HTTP API</option>
        </select>
      </label>
      <label>Endpoint
        <input id="pin-endpoint" type="url" autocomplete="off" spellcheck="false">
      </label>
      <label>Token
        <input id="pin-token" type="password" autocomplete="off" spellcheck="false">
      </label>
      <label>Kubo HTTP API
        <input id="pin-kubo" type="url" placeholder="http://127.0.0.1:5001" autocomplete="off" spellcheck="false">
      </label>
      <label>Dedicated gateway
        <input id="pin-gateway" type="url" placeholder="https://gateway.example.net" autocomplete="off" spellcheck="false">
      </label>
      <p class="hint" id="pin-hint"></p>
      <aside class="tl_message_buttons">
        <button type="button" class="button" id="settings-cancel">Cancel</button>
        <button type="button" class="button" id="settings-save">Save</button>
      </aside>
    </main>
  `
  document.body.append(modal)
  const provider = modal.querySelector('#pin-provider') as HTMLSelectElement
  const endpoint = modal.querySelector('#pin-endpoint') as HTMLInputElement
  const token = modal.querySelector('#pin-token') as HTMLInputElement
  const kubo = modal.querySelector('#pin-kubo') as HTMLInputElement
  const gateway = modal.querySelector('#pin-gateway') as HTMLInputElement
  const hint = modal.querySelector('#pin-hint') as HTMLElement
  provider.value = current.provider
  endpoint.value = current.endpoint
  token.value = current.token
  kubo.value = current.kuboApi
  gateway.value = current.gateway
  const hints: Record<Provider, string> = {
    local: 'The article stays in this browser and the link opens here. Nothing is pinned on the public network.',
    pinata: 'Pinata uploads the article and pins it. Create a JWT under API keys. The token is kept in this browser and is not part of the repository. Folder upload uses pinFileToIPFS, because the current v3 file API does not accept folders.',
    psa: 'Works with any IPFS Pinning Service API. Pinata’s base URL is https://api.pinata.cloud/psa. The API pins a CID that already exists, so a Kubo HTTP API is required as well.',
    kubo: 'Adds the article to a Kubo node through its HTTP API. That node pins the files. A local daemon is usually http://127.0.0.1:5001.',
  }
  function syncHint() {
    const value = provider.value as Provider
    hint.textContent = hints[value]
    if (!endpoint.value.trim()) endpoint.value = defaultEndpoint(value)
  }
  provider.addEventListener('change', () => {
    endpoint.value = defaultEndpoint(provider.value as Provider)
    syncHint()
  })
  syncHint()
  modal.querySelector('#settings-cancel')?.addEventListener('click', () => modal.remove())
  modal.querySelector('#settings-save')?.addEventListener('click', () => {
    const settings: PinSettings = {
      provider: provider.value as Provider,
      endpoint: endpoint.value.trim(),
      token: token.value.trim(),
      kuboApi: kubo.value.trim(),
      gateway: gateway.value.trim(),
    }
    saveSettings(settings)
    editor?.setModeLabel(modeLabel(settings))
    modal.remove()
  })
}

function parseRoute(hash: string): { kind: 'edit' } | { kind: 'history' } | { kind: 'read'; cid: string } {
  const path = hash.replace(/^#/, '') || '/'
  if (path === '/history') return { kind: 'history' }
  if (path.startsWith('/p/')) return { kind: 'read', cid: decodeURIComponent(path.slice(3).replace(/\/+$/, '')) }
  return { kind: 'edit' }
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
