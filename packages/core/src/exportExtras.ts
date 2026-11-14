import { escapeHtml } from './export'

/** Numbers each top-level heading "1.", "2." … in HTML, PDF and EPUB, with CSS counters. */
export const CHAPTER_NUMBER_CSS = `
body { counter-reset: chapter; }
h1 { counter-increment: chapter; }
h1::before { content: counter(chapter) ". "; }
`

const TITLE_PAGE_CSS = `
.title-page { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 85vh; break-after: page; page-break-after: always; }
.title-page .book-title { font: 700 2.6em/1.2 Georgia, serif; margin: 0 0 .6em; }
.title-page .book-author { font-size: 1.3em; margin: 0; }
`

/**
 * A page of its own with the title and author, put at the start of an
 * exported page. It is a `div`, not a heading, so it does not join the
 * contents or the chapter count.
 */
export function withTitlePage(html: string, title: string, author: string): string {
  const block = `<div class="title-page"><div class="book-title">${escapeHtml(title)}</div>${author.trim() ? `<p class="book-author">${escapeHtml(author.trim())}</p>` : ''}</div>\n`
  const styled = html.includes('</head>') ? html.replace('</head>', () => `<style id="export-title-page">${TITLE_PAGE_CSS}</style>\n</head>`) : html
  return styled.includes('<body>') ? styled.replace('<body>', () => `<body>\n${block}`) : block + styled
}

/** Whether the CSS sets the page size with `@page`, which the PDF then follows. */
export function setsPageSize(html: string): boolean {
  return /@page[^{}]*\{[^}]*\bsize\s*:/i.test(html)
}
