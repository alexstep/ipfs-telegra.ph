import type { Article, Block } from './types'
import { escapeHtml, inlinesToText, isDirectoryImagePath, renderInlines } from './text'

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function renderBlockHtml(block: Block): string {
  switch (block.type) {
    case 'p':
      return `<p>${renderInlines(block.inlines)}</p>`
    case 'h3':
      return `<h3>${escapeHtml(block.text)}</h3>`
    case 'h4':
      return `<h4>${escapeHtml(block.text)}</h4>`
    case 'quote':
      return `<blockquote>${renderInlines(block.inlines)}</blockquote>`
    case 'pull':
      return `<aside>${renderInlines(block.inlines)}</aside>`
    case 'code':
      return `<pre>${escapeHtml(block.text)}</pre>`
    case 'hr':
      return '<hr>'
    case 'image': {
      if (!isDirectoryImagePath(block.src)) return ''
      const caption = block.caption.trim()
        ? `<figcaption>${escapeHtml(block.caption.trim())}</figcaption>`
        : ''
      return `<figure><div class="figure_wrapper"><img src="./${escapeHtml(block.src)}" alt="${escapeHtml(block.caption.trim())}"></div>${caption}</figure>`
    }
    case 'embed':
      return `<figure><div class="iframe_wrap"><div class="iframe_helper"><iframe src="${escapeHtml(block.src)}" allowfullscreen frameborder="0"></iframe></div></div></figure>`
  }
}

export function renderArticleHtml(article: Article): string {
  return article.blocks.map(renderBlockHtml).join('\n')
}

const PAGE_CSS = `
html, body { margin: 0; padding: 0; background: #fff; }
body { color: rgba(0,0,0,.8); }
.tl_page_wrap { max-width: 732px; margin: 0 auto; padding: 28px 0 64px; }
.ta_header h1, .tac h3, .tac h4, .tac figcaption, address, #share {
  font-family: CustomSansSerif, "Lucida Grande", Arial, sans-serif;
}
.ta_header h1 {
  font-weight: 700; font-size: 32px; line-height: 34px; margin: 21px 21px 12px; color: #222;
}
address { font-style: normal; font-size: 15px; line-height: 18px; color: #79828B; margin: 12px 21px 20px; }
address time:before { content: "•"; padding: 0 7px; }
.tac, .tac p, .tac blockquote, .tac aside {
  font-family: CustomSerif, Georgia, Cambria, "Times New Roman", serif;
  font-size: 18px; line-height: 1.58; margin: 0;
}
.tac p { margin: 0 21px 12px; white-space: pre-wrap; word-wrap: break-word; }
.tac a { color: inherit; text-decoration: none; border-bottom: .1em solid rgba(0,0,0,.7); }
.tac h3, .tac h4 { font-weight: 700; font-size: 28px; margin: 18px 21px 9px; }
.tac h4 { font-size: 24px; margin: 18px 21px 7px; }
.tac blockquote {
  margin: 18px 21px 16px 0; padding-left: 15px; border-left: 3px solid #000; font-style: italic;
}
@media (max-width: 720px) { .tac blockquote { margin-left: 21px; } }
.tac aside {
  font-size: 21px; color: rgba(0,0,0,.6); margin: 18px 21px 16px; padding: 0 18px; text-align: center; font-style: italic;
}
.tac pre, .tac code { font-family: Menlo, "Courier New", Courier, monospace; font-size: 16px; background: #F5F8FC; }
.tac code { padding: 1px 3px; }
.tac pre { margin: 14px 0; padding: 7px 21px; white-space: pre-wrap; }
.tac hr { width: 50%; margin: 30px auto; border: none; border-top: 1px solid #c9cdd1; }
.tac figure { margin: 0 21px 16px; text-align: center; }
.tac img, .tac iframe { max-width: 100%; }
.tac figcaption { font-size: 15px; color: #79828B; padding: 12px 21px 0; line-height: 18px; }
.iframe_wrap { position: relative; max-width: 100%; }
.iframe_helper { position: relative; padding-top: 56.25%; }
.iframe_helper iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
#share {
  position: absolute; top: 12px; right: 16px; color: #777; text-transform: uppercase;
  text-decoration: none; font-size: 15px; letter-spacing: .04em;
}
`.trim()

export function renderPublishedHtml(article: Article, extraCss = ''): string {
  const safeCss = extraCss.replace(/<\/style/gi, '<\\/style')
  const title = escapeHtml(article.title)
  const author = escapeHtml(article.author)
  const description = escapeHtml(descriptionOf(article))
  const date = formatDate(article.createdAt)
  const authorHtml = author
    ? `<a rel="author">${author}</a>${date ? `<time datetime="${escapeHtml(article.createdAt)}">${escapeHtml(date)}</time>` : ''}`
    : (date ? `<time datetime="${escapeHtml(article.createdAt)}">${escapeHtml(date)}</time>` : '')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="article">
<style>${safeCss}\n${PAGE_CSS}</style>
</head>
<body>
<a id="share" href="">Share</a>
<div class="tl_page_wrap">
<main class="ta">
<header class="ta_header">
<h1 dir="auto">${title}</h1>
<address dir="auto">${authorHtml}</address>
</header>
<article class="tac" dir="auto">
${renderArticleHtml(article)}
</article>
</main>
</div>
<script>
document.getElementById('share').addEventListener('click', function (event) {
  event.preventDefault();
  var url = location.href;
  if (navigator.share) {
    navigator.share({ title: document.title, url: url }).catch(function () {});
    return;
  }
  if (navigator.clipboard) navigator.clipboard.writeText(url);
  else window.prompt('Article link', url);
});
</script>
</body>
</html>`
}

export function descriptionOf(article: Article): string {
  const parts: string[] = []
  for (const block of article.blocks) {
    if (block.type === 'p' || block.type === 'quote' || block.type === 'pull') {
      parts.push(inlinesToText(block.inlines))
    } else if (block.type === 'h3' || block.type === 'h4' || block.type === 'code') {
      parts.push(block.text)
    }
    if (parts.join(' ').length > 160) break
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 140)
}
