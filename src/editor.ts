import { blockElement, readArticle } from './article/model'
import type { Article } from './article/types'
import { inlinesFromElement, sanitizeEmbed } from './article/text'

const DRAFT_KEY = 'telegraph.draft.v1'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type EditorController = {
  destroy: () => void
  getArticle: () => Article
  setModeLabel: (label: string) => void
  showError: (message: string) => void
  markTitleRequired: () => void
  discardDraft: () => void
}

export function loadDraft(): Article | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Article
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.blocks)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveDraft(article: Article): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(article))
  } catch {
    // A draft with large images can exceed localStorage. Publishing still works.
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY)
}

const ICONS = {
  bold: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h6.2a3.4 3.4 0 0 1 0 6.8H7zm0 6.8h7a3.5 3.5 0 0 1 0 7H7z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  italic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h-4M10 19h4M13 5 9 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.6l-1 1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M14 11a4 4 0 0 0-5.7-.3l-2 2a4 4 0 0 0 5.7 5.6l1-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  h: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6v12M17 6v12M7 12h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  h2: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6v12M12 6v12M5 12h7M16 10.5c.4-1.2 1.4-2 2.8-2 1.6 0 2.7 1 2.7 2.4 0 3.2-5.5 3-5.5 6.1h5.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16c0-4 2-7 5-8M18 16c0-4-2-7-5-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 16h.5M15 16h.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.3" fill="currentColor"/><path d="M7 16l3.2-3.2 2.2 2.2L16 11l3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  embed: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>',
}

export function mountEditor(host: HTMLElement, hooks: {
  initial: Article | null
  modeLabel: string
  onPublish: (article: Article) => void
  onSettings: () => void
  onHistory: () => void
}): EditorController {
  host.innerHTML = `
    <div class="tl_page_wrap">
      <div class="corner">
        <button type="button" class="button publish_button" id="publish">Publish</button>
        <div class="corner_links">
          <button type="button" id="open-settings">Settings</button>
          <button type="button" id="open-history">History</button>
          <button type="button" id="clear-draft">Clear</button>
        </div>
        <div class="mode_label" id="mode-label"></div>
        <div class="error_msg" id="error" role="alert"></div>
      </div>
      <article class="tl_article tl_article_edit" id="article">
        <h1 class="field title empty" id="title" contenteditable="plaintext-only" data-placeholder="Title" data-label="Title" dir="auto"></h1>
        <address class="field author empty" id="author" contenteditable="plaintext-only" data-placeholder="Your name" data-label="Author" dir="auto"></address>
        <div class="tl_article_content" id="body" dir="auto"></div>
      </article>
      <div class="tl_tooltip" id="toolbar">
        <div class="buttons">
          ${toolButton('bold', 'Bold')}${toolButton('italic', 'Italic')}${toolButton('link', 'Link')}
          <span class="button_gap"></span>
          ${toolButton('h', 'Header', 'h3')}${toolButton('h2', 'Subheader', 'h4')}${toolButton('quote', 'Quote')}
        </div>
        <div class="prompt">
          <button type="button" class="close" aria-label="Close">×</button>
          <input class="prompt_input" type="url" placeholder="Paste or type a link…">
        </div>
      </div>
      <div class="tl_blocks" id="blocks">
        <button type="button" data-act="image" aria-label="Add image">${ICONS.image}</button>
        <button type="button" data-act="embed" aria-label="Add embed">${ICONS.embed}</button>
      </div>
    </div>
    <input id="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden>
  `

  const article = host.querySelector('#article') as HTMLElement
  const title = host.querySelector('#title') as HTMLElement
  const author = host.querySelector('#author') as HTMLElement
  const body = host.querySelector('#body') as HTMLElement
  const toolbar = host.querySelector('#toolbar') as HTMLElement
  const blocks = host.querySelector('#blocks') as HTMLElement
  const linkInput = toolbar.querySelector('.prompt_input') as HTMLInputElement
  const error = host.querySelector('#error') as HTMLElement
  const mode = host.querySelector('#mode-label') as HTMLElement
  const fileInput = host.querySelector('#file') as HTMLInputElement
  mode.textContent = hooks.modeLabel

  let previousCid = hooks.initial?.previousCid
  let savedRange: Range | null = null
  let formatRange: Range | null = null
  let errorTimer = 0
  let draftTimer = 0
  let requiredTimer = 0

  if (hooks.initial) applyArticle(hooks.initial)
  else {
    const draft = loadDraft()
    if (draft) applyArticle(draft)
  }
  if (!body.querySelector('.block')) body.append(makeParagraph())
  syncPlaceholders()

  function applyArticle(next: Article) {
    title.textContent = next.title
    author.textContent = next.author
    previousCid = next.previousCid
    body.replaceChildren()
    for (const block of next.blocks) body.append(blockElement(document, block))
    if (!body.childElementCount) body.append(makeParagraph())
  }

  function makeParagraph(): HTMLElement {
    const p = document.createElement('p')
    p.className = 'block'
    p.dataset.type = 'p'
    p.contentEditable = 'true'
    p.append(document.createElement('br'))
    return p
  }

  function getArticle(): Article {
    return readArticle({
      title: title.textContent || '',
      author: author.textContent || '',
      body,
      createdAt: hooks.initial?.createdAt || '',
      previousCid,
    })
  }

  function scheduleDraft() {
    clearTimeout(draftTimer)
    draftTimer = window.setTimeout(() => saveDraft(getArticle()), 300)
  }

  function showError(message: string) {
    error.textContent = message
    error.classList.add('shown')
    clearTimeout(errorTimer)
    errorTimer = window.setTimeout(() => error.classList.remove('shown'), 4000)
  }

  function blockOfNode(node: Node | null): HTMLElement | null {
    const el = node instanceof Element ? node : node?.parentElement
    const block = el?.closest('.block')
    return block instanceof HTMLElement && body.contains(block) ? block : null
  }

  function currentBlock(): HTMLElement | null {
    const sel = window.getSelection()
    return blockOfNode(sel?.anchorNode ?? null)
  }

  function syncPlaceholders() {
    title.classList.toggle('empty', !(title.textContent || '').trim())
    author.classList.toggle('empty', !(author.textContent || '').trim())
    const items = [...body.querySelectorAll(':scope > .block')]
    items.forEach((node, index) => {
      const el = node as HTMLElement
      if (el.dataset.type !== 'p') return
      const empty = !(el.textContent || '').replace(/\u00a0/g, ' ').trim()
      el.classList.toggle('empty', empty)
      if (empty && items.length === 1 && index === 0) el.dataset.placeholder = 'Your story...'
      else delete el.dataset.placeholder
      const caption = el.querySelector('figcaption')
      if (caption) caption.classList.toggle('empty', !(caption.textContent || '').trim())
    })
    for (const caption of body.querySelectorAll('figcaption')) {
      caption.classList.toggle('empty', !(caption.textContent || '').trim())
    }
  }

  function placeCaret(el: HTMLElement, atStart: boolean) {
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(atStart)
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(range)
    el.focus()
  }

  function placeCaretAt(root: HTMLElement, offset: number) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let remaining = offset
    let node = walker.nextNode()
    while (node) {
      const length = node.textContent?.length ?? 0
      if (remaining <= length) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.collapse(true)
        const sel = window.getSelection()
        if (!sel) return
        sel.removeAllRanges()
        sel.addRange(range)
        root.focus()
        return
      }
      remaining -= length
      node = walker.nextNode()
    }
    placeCaret(root, false)
  }

  function collapsedOffset(root: HTMLElement): number | null {
    const sel = window.getSelection()
    if (!sel?.isCollapsed || !sel.rangeCount) return null
    const range = sel.getRangeAt(0)
    if (!root.contains(range.startContainer)) return null
    const pre = range.cloneRange()
    pre.selectNodeContents(root)
    pre.setEnd(range.startContainer, range.startOffset)
    return pre.toString().length
  }

  function insertText(text: string) {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text.replace(/\r\n/g, '\n'))
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function splitBlock(block: HTMLElement) {
    const text = (block.textContent || '').trim()
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(text)) {
      const hr = document.createElement('hr')
      hr.className = 'block'
      hr.dataset.type = 'hr'
      const next = makeParagraph()
      block.replaceWith(hr, next)
      placeCaret(next, true)
      return
    }
    const embed = sanitizeEmbed(text)
    if (embed && block.dataset.type === 'p') {
      const figure = blockElement(document, { type: 'embed', provider: embed.provider, src: embed.src })
      const next = makeParagraph()
      block.replaceWith(figure, next)
      placeCaret(next, true)
      return
    }
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    if (!range.collapsed) range.deleteContents()
    const tail = document.createRange()
    tail.selectNodeContents(block)
    tail.setStart(range.endContainer, range.endOffset)
    const fragment = tail.extractContents()
    if (!block.childNodes.length) block.append(document.createElement('br'))
    const next = makeParagraph()
    next.replaceChildren(fragment)
    if (!(next.textContent || '') && !next.querySelector('br')) next.append(document.createElement('br'))
    block.after(next)
    placeCaret(next, true)
  }

  function onKeyDown(event: KeyboardEvent) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (target === title || target === author) {
      if (event.key === 'Enter') {
        event.preventDefault()
        if (target === title) placeCaret(author, true)
        else {
          const first = body.querySelector('.block') as HTMLElement | null
          if (first?.isContentEditable) placeCaret(first, true)
        }
      }
      return
    }
    const caption = target.closest('figcaption')
    if (caption instanceof HTMLElement && event.key === 'Enter') {
      event.preventDefault()
      const figure = caption.closest('.block')
      const next = makeParagraph()
      figure?.after(next)
      placeCaret(next, true)
      syncPlaceholders()
      scheduleDraft()
      return
    }
    const block = target.closest('.block')
    if (!(block instanceof HTMLElement) || !body.contains(block)) return
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      if (event.shiftKey) {
        insertText('\n')
      } else {
        splitBlock(block)
      }
      syncPlaceholders()
      scheduleDraft()
      hideChrome()
      return
    }
    if (event.key === 'Backspace') {
      const offset = collapsedOffset(block)
      if (offset !== 0) return
      const prev = block.previousElementSibling as HTMLElement | null
      if (!prev) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      const empty = !(block.textContent || '').trim()
      if (prev.dataset.type === 'image' || prev.dataset.type === 'embed' || prev.dataset.type === 'hr') {
        prev.remove()
        if (empty && body.childElementCount > 1) block.remove()
        if (!body.childElementCount) body.append(makeParagraph())
      } else if (empty) {
        block.remove()
        if (prev.isContentEditable) placeCaret(prev, false)
      } else if (prev.isContentEditable && prev.dataset.type !== 'h3' && prev.dataset.type !== 'h4' && prev.dataset.type !== 'code') {
        const at = (prev.textContent || '').length
        while (block.firstChild) prev.append(block.firstChild)
        block.remove()
        placeCaretAt(prev, at)
      }
      syncPlaceholders()
      scheduleDraft()
    }
  }

  function activeRange(): Range | null {
    const sel = window.getSelection()
    if (sel?.rangeCount && !sel.isCollapsed) return sel.getRangeAt(0)
    if (formatRange && !formatRange.collapsed) {
      sel?.removeAllRanges()
      sel?.addRange(formatRange)
      return formatRange
    }
    return null
  }

  function toggleInline(tag: 'strong' | 'em' | 'a', href?: string) {
    const sel = window.getSelection()
    if (!sel) return
    const range = (tag === 'a' && savedRange) ? savedRange : activeRange()
    if (!range) return
    if (tag === 'a' && savedRange) {
      sel.removeAllRanges()
      sel.addRange(savedRange)
    }
    const block = (range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement)?.closest('.block')
    if (!(block instanceof HTMLElement) || !block.isContentEditable) return
    if (block.dataset.type === 'h3' || block.dataset.type === 'h4' || block.dataset.type === 'code') return
    const anchor = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
    const existing = anchor?.closest(tag)
    if (existing && block.contains(existing) && (tag !== 'a' || !href)) {
      const parent = existing.parentNode
      if (!parent) return
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing)
      existing.remove()
      return
    }
    if (range.collapsed) return
    const wrap = document.createElement(tag)
    if (tag === 'a' && href) {
      wrap.setAttribute('href', href)
      wrap.setAttribute('target', '_blank')
      wrap.setAttribute('rel', 'noopener noreferrer')
    }
    wrap.append(range.extractContents())
    range.insertNode(wrap)
    const next = document.createRange()
    next.selectNodeContents(wrap)
    sel.removeAllRanges()
    sel.addRange(next)
    scheduleDraft()
  }

  function convert(type: 'p' | 'h3' | 'h4' | 'quote' | 'pull') {
    activeRange()
    const block = currentBlock() || (formatRange ? blockOfNode(formatRange.commonAncestorContainer) : null)
    if (!block || block.dataset.type === 'image' || block.dataset.type === 'embed' || block.dataset.type === 'hr') return
    const next = type === 'h3' || type === 'h4'
      ? blockElement(document, { type, text: block.innerText || '' })
      : blockElement(document, { type, inlines: inlinesFromElement(block) })
    if (!(next.textContent || '').trim()) {
      next.replaceChildren(document.createElement('br'))
    }
    block.replaceWith(next)
    placeCaret(next, false)
    syncPlaceholders()
    scheduleDraft()
    hideChrome()
  }

  function hideChrome() {
    toolbar.classList.remove('shown', 'prompting')
    blocks.classList.remove('shown')
    savedRange = null
  }

  function positionToolbar() {
    const sel = window.getSelection()
    if (!sel?.rangeCount || sel.isCollapsed || toolbar.classList.contains('prompting')) {
      if (!toolbar.classList.contains('prompting')) toolbar.classList.remove('shown')
      return
    }
    const block = currentBlock()
    if (!block || block.dataset.type === 'image' || block.dataset.type === 'embed') {
      toolbar.classList.remove('shown')
      return
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      toolbar.classList.remove('shown')
      return
    }
    toolbar.classList.add('shown')
    blocks.classList.remove('shown')
    const narrow = window.innerWidth < 720
    if (narrow) {
      toolbar.style.top = 'auto'
      toolbar.style.bottom = '12px'
      toolbar.style.left = '50%'
      toolbar.style.transform = 'translateX(-50%)'
      return
    }
    toolbar.style.bottom = 'auto'
    toolbar.style.transform = 'translateX(-50%)'
    const top = rect.top - toolbar.offsetHeight - 10
    toolbar.style.top = `${Math.max(8, top)}px`
    toolbar.style.left = `${rect.left + rect.width / 2}px`
    markActive(block)
  }

  function markActive(block: HTMLElement) {
    const sel = window.getSelection()
    const node = sel?.anchorNode
    const el = node instanceof Element ? node : node?.parentElement
    toolbar.querySelector('[data-act="bold"]')?.classList.toggle('active', !!el?.closest('strong, b'))
    toolbar.querySelector('[data-act="italic"]')?.classList.toggle('active', !!el?.closest('em, i'))
    toolbar.querySelector('[data-act="link"]')?.classList.toggle('active', !!el?.closest('a'))
    toolbar.querySelector('[data-act="h3"]')?.classList.toggle('active', block.dataset.type === 'h3')
    toolbar.querySelector('[data-act="h4"]')?.classList.toggle('active', block.dataset.type === 'h4')
    toolbar.querySelector('[data-act="quote"]')?.classList.toggle('active', block.dataset.type === 'quote' || block.dataset.type === 'pull')
    toolbar.querySelector('[data-act="quote"]')?.classList.toggle('pull', block.dataset.type === 'pull')
  }

  function positionBlocks() {
    const sel = window.getSelection()
    const block = currentBlock()
    if (!sel?.isCollapsed || !block || block.dataset.type !== 'p' || (block.textContent || '').trim()) {
      blocks.classList.remove('shown')
      return
    }
    if (toolbar.classList.contains('shown')) return
    const rect = block.getBoundingClientRect()
    blocks.classList.add('shown')
    const narrow = window.innerWidth < 900
    blocks.style.top = `${rect.top + rect.height / 2}px`
    blocks.style.left = narrow ? `${rect.left + rect.width / 2}px` : `${rect.left - 8}px`
    blocks.style.transform = narrow ? 'translate(-50%, -50%)' : 'translate(-100%, -50%)'
  }

  function onSelection() {
    const sel = window.getSelection()
    if (sel?.rangeCount && !sel.isCollapsed) {
      const block = blockOfNode(sel.anchorNode)
      if (block) formatRange = sel.getRangeAt(0).cloneRange()
    }
    const active = document.activeElement
    article.classList.toggle('title_focused', active === title || active === author)
    if (toolbar.classList.contains('prompting')) return
    positionToolbar()
    if (!toolbar.classList.contains('shown')) positionBlocks()
    else blocks.classList.remove('shown')
  }

  async function addImageFile(file: File) {
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) {
      showError('Invalid file format')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showError('File too big (up to 5 MB allowed)')
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const figure = blockElement(document, { type: 'image', src: dataUrl, caption: '' })
    const block = currentBlock()
    const next = makeParagraph()
    if (block && block.dataset.type === 'p' && !(block.textContent || '').trim()) {
      block.replaceWith(figure)
      figure.after(next)
    } else if (block) {
      block.after(figure)
      figure.after(next)
    } else {
      body.append(figure, next)
    }
    syncPlaceholders()
    scheduleDraft()
    hideChrome()
  }

  function openLinkPrompt() {
    const sel = window.getSelection()
    if (!sel?.rangeCount || sel.isCollapsed) return
    savedRange = sel.getRangeAt(0).cloneRange()
    toolbar.classList.add('shown', 'prompting')
    linkInput.value = ''
    linkInput.focus()
  }

  function closeLinkPrompt() {
    toolbar.classList.remove('prompting')
    savedRange = null
    hideChrome()
  }

  function applyLink() {
    let value = linkInput.value.trim()
    if (!value) {
      closeLinkPrompt()
      return
    }
    if (!/^(https?:|mailto:)/i.test(value)) {
      value = value.includes('@') && !value.includes('/') ? `mailto:${value}` : `https://${value}`
    }
    toggleInline('a', value)
    closeLinkPrompt()
  }

  host.querySelector('#publish')?.addEventListener('click', () => hooks.onPublish(getArticle()))
  host.querySelector('#open-settings')?.addEventListener('click', hooks.onSettings)
  host.querySelector('#open-history')?.addEventListener('click', hooks.onHistory)
  host.querySelector('#clear-draft')?.addEventListener('click', () => {
    title.textContent = ''
    author.textContent = ''
    previousCid = undefined
    body.replaceChildren(makeParagraph())
    clearDraft()
    syncPlaceholders()
    title.focus()
  })
  article.addEventListener('focusin', onSelection)
  article.addEventListener('focusout', onSelection)
  article.addEventListener('keydown', onKeyDown)
  article.addEventListener('input', () => {
    syncPlaceholders()
    scheduleDraft()
  })
  article.addEventListener('paste', (event) => {
    const file = [...(event.clipboardData?.files || [])].find((item) => /^image\/(png|jpe?g|gif|webp)$/.test(item.type))
    event.preventDefault()
    if (file) {
      void addImageFile(file)
      return
    }
    insertText(event.clipboardData?.getData('text/plain') || '')
    syncPlaceholders()
    scheduleDraft()
  })
  article.addEventListener('dragover', (event) => event.preventDefault())
  article.addEventListener('drop', (event) => {
    const file = [...(event.dataTransfer?.files || [])].find((item) => /^image\/(png|jpe?g|gif|webp)$/.test(item.type))
    if (!file) return
    event.preventDefault()
    void addImageFile(file)
  })
  article.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (target.classList.contains('remove_block')) {
      const block = target.closest('.block')
      block?.remove()
      if (!body.childElementCount) body.append(makeParagraph())
      syncPlaceholders()
      scheduleDraft()
    }
  })
  toolbar.addEventListener('mousedown', (event) => {
    const target = event.target
    if (target instanceof Element && target.closest('input')) return
    event.preventDefault()
  })
  toolbar.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('button')
    if (!(button instanceof HTMLButtonElement)) return
    const act = button.dataset.act
    if (act === 'bold') toggleInline('strong')
    else if (act === 'italic') toggleInline('em')
    else if (act === 'link') {
      const sel = window.getSelection()
      const node = sel?.anchorNode
      const el = node instanceof Element ? node : node?.parentElement
      if (el?.closest('a')) toggleInline('a')
      else openLinkPrompt()
    } else if (act === 'h3') {
      const block = currentBlock()
      convert(block?.dataset.type === 'h3' ? 'p' : 'h3')
    } else if (act === 'h4') {
      const block = currentBlock()
      convert(block?.dataset.type === 'h4' ? 'p' : 'h4')
    } else if (act === 'quote') {
      const block = currentBlock()
      convert(block?.dataset.type === 'quote' ? 'pull' : block?.dataset.type === 'pull' ? 'p' : 'quote')
    } else if (button.classList.contains('close')) closeLinkPrompt()
    syncPlaceholders()
  })
  linkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      applyLink()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeLinkPrompt()
    }
  })
  blocks.addEventListener('mousedown', (event) => event.preventDefault())
  blocks.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('button')
    if (!(button instanceof HTMLButtonElement)) return
    if (button.dataset.act === 'image') fileInput.click()
    if (button.dataset.act === 'embed') {
      const value = window.prompt('YouTube or Vimeo link')
      if (!value) return
      const embed = sanitizeEmbed(value)
      if (!embed) {
        showError('Paste a YouTube or Vimeo link')
        return
      }
      const figure = blockElement(document, { type: 'embed', provider: embed.provider, src: embed.src })
      const block = currentBlock()
      const next = makeParagraph()
      if (block && !(block.textContent || '').trim()) block.replaceWith(figure)
      else if (block) block.after(figure)
      else body.append(figure)
      figure.after(next)
      syncPlaceholders()
      scheduleDraft()
      hideChrome()
    }
  })
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void addImageFile(file)
  })
  document.addEventListener('selectionchange', onSelection)
  window.addEventListener('resize', onSelection)
  window.addEventListener('scroll', onSelection, true)
  if (!(title.textContent || '').trim()) title.focus()

  return {
    destroy() {
      clearTimeout(draftTimer)
      clearTimeout(errorTimer)
      clearTimeout(requiredTimer)
      document.removeEventListener('selectionchange', onSelection)
      window.removeEventListener('resize', onSelection)
      window.removeEventListener('scroll', onSelection, true)
      host.replaceChildren()
    },
    discardDraft() {
      clearTimeout(draftTimer)
      clearDraft()
    },
    getArticle,
    setModeLabel(label: string) {
      mode.textContent = label
    },
    showError,
    markTitleRequired() {
      article.classList.add('title_required', 'title_focused')
      title.focus()
      clearTimeout(requiredTimer)
      requiredTimer = window.setTimeout(() => article.classList.remove('title_required'), 3000)
    },
  }
}

function toolButton(icon: keyof typeof ICONS, label: string, act?: string): string {
  return `<button type="button" data-act="${act ?? icon}" aria-label="${label}">${ICONS[icon]}</button>`
}
