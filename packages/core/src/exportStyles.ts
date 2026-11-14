/**
 * Export styles: a style is a piece of CSS laid over the export's base
 * stylesheet. Built-in styles are written here; a writer's own live as
 * `.css` files, with the name and description in a comment at the top.
 */

export interface ExportStyleDef {
  id: string
  name: string
  description: string
  css: string
  builtin: boolean
}

/** Where a style's CSS goes inside an exported page. */
export const STYLE_BLOCK_OPEN = '<style id="export-style">'
const STYLE_BLOCK = /<style id="export-style">[\s\S]*?<\/style>/

/**
 * Makes CSS safe to put in an export: no way out of the style element and no
 * fetching of anything from the web (an export is a private document).
 */
export function sanitizeCss(css: string): string {
  return css
    .replace(/<\/style/gi, '<\\/style')
    .replace(/<!--/g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)\s*(?:https?:)?\/\/[^)]*\)/gi, 'none')
}

/** `html` with the style block replaced by `css`. */
export function applyExportStyle(html: string, css: string): string {
  const block = `${STYLE_BLOCK_OPEN}${sanitizeCss(css)}</style>`
  // A function, so "$" in the CSS is not read as a replacement pattern.
  return STYLE_BLOCK.test(html) ? html.replace(STYLE_BLOCK, () => block) : html
}

// The name and description in a style's leading comment ("name: Book").
export function parseStyleMeta(fileName: string, css: string): { name: string; description: string } {
  const field = (key: string): string | undefined =>
    new RegExp(`^\\s*/\\*[\\s\\S]*?\\b${key}:[ \\t]*([^\\n*]*)`, 'i').exec(css)?.[1]?.trim() || undefined
  return {
    name: field('name') ?? fileName.replace(/\.css$/i, ''),
    description: field('description') ?? '',
  }
}

/** The text of a style file. */
export function styleFileText(name: string, description: string, css: string): string {
  const clean = (s: string): string => s.replace(/[*\n\r\s]+/g, ' ').trim()
  const body = css.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '')
  return `/*\n name: ${clean(name)}\n description: ${clean(description)}\n*/\n${body.trimStart()}`
}

/** A file name for a style: letters, digits, dashes. */
export function styleFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'style'}.css`
}


const builtin = (id: string, name: string, description: string, css: string): ExportStyleDef => ({
  id,
  name,
  description,
  css: css.trim() + '\n',
  builtin: true,
})

export const BUILTIN_EXPORT_STYLES: ExportStyleDef[] = [
  builtin('default', 'Default', 'Plain serif text with sans-serif headings.', ''),

  builtin(
    'book',
    'Book',
    'A printed novel: justified serif text, indented paragraphs, centred chapter headings.',
    `
:root { color-scheme: light; }
body { max-width: 34rem; font: 1.1rem/1.55 Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif; color: #1a1a1a; background: #fdfcf8; text-align: justify; hyphens: auto; }
h1, h2, h3, h4, h5, h6 { font-family: inherit; font-weight: 600; text-align: center; margin: 3em 0 1.2em; }
h1 { font-size: 1.8rem; letter-spacing: .04em; }
h2 { font-size: 1.3rem; }
h3, h4, h5, h6 { font-size: 1.1rem; font-style: italic; }
p { margin: 0; }
p + p { text-indent: 1.5em; }
h1 + p, h2 + p, h3 + p, hr + p, blockquote + p { text-indent: 0; }
ul, ol, blockquote, pre, table { margin-top: 1em; margin-bottom: 1em; }
blockquote { border: 0; padding: 0 2em; color: inherit; font-style: italic; }
hr.break::after { content: '❦'; letter-spacing: 0; font-size: 1.2em; color: #777; }
@media print { body { font-size: 11pt; line-height: 1.45; background: #fff; } h1 { break-before: page; } section:first-child h1:first-child { break-before: avoid; } }
`,
  ),

  builtin(
    'manuscript',
    'Manuscript',
    'Standard submission format: monospaced, double spaced, ragged right, indented paragraphs.',
    `
:root { color-scheme: light; }
body { max-width: 40rem; font: 12pt/2 'Courier New', Courier, monospace; color: #000; background: #fff; text-align: left; }
h1, h2, h3, h4, h5, h6 { font: inherit; font-weight: bold; margin: 2em 0 0; text-align: center; text-transform: uppercase; }
h3, h4, h5, h6 { text-align: left; text-transform: none; }
p { margin: 0; }
p + p { text-indent: .5in; }
h1 + p, h2 + p, h3 + p, hr + p { text-indent: .5in; }
ul, ol, blockquote, pre, table { margin: 0; }
blockquote { border: 0; padding: 0 .5in; color: inherit; }
code, pre { font: inherit; background: none; padding: 0; }
mark { background: none; }
hr.break::after { content: '#'; letter-spacing: 0; color: #000; }
hr.break { margin: 0; }
em { font-style: normal; text-decoration: underline; }
@media print { body { font-size: 12pt; line-height: 2; } }
`,
  ),

  builtin(
    'modern',
    'Modern',
    'Clean sans-serif with generous spacing and an accent colour on headings.',
    `
body { max-width: 42rem; font: 1.05rem/1.75 system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
h1, h2, h3, h4, h5, h6 { font-weight: 700; letter-spacing: -.01em; color: #1f6f6a; }
h1 { font-size: 2.3rem; margin-bottom: .8em; }
h2 { font-size: 1.5rem; border-bottom: 1px solid #8884; padding-bottom: .25em; }
h3 { font-size: 1.2rem; }
a { color: #1f6f6a; }
blockquote { border-left: 4px solid #1f6f6a; color: inherit; opacity: .85; }
code, pre { background: #1f6f6a14; }
@media (prefers-color-scheme: dark) { h1, h2, h3, h4, h5, h6, a { color: #6cc9c1; } }
@media print { h1, h2, h3, h4, h5, h6, a { color: #1f6f6a; } body { font-size: 10.5pt; } }
`,
  ),

  builtin(
    'academic',
    'Academic',
    'Times-style text at 1.5 spacing, bold headings in the same face, plain block quotes.',
    `
:root { color-scheme: light; }
body { max-width: 40rem; font: 12pt/1.5 'Times New Roman', Times, serif; color: #000; background: #fff; }
h1, h2, h3, h4, h5, h6 { font-family: inherit; font-size: 12pt; margin: 1.5em 0 .5em; }
h1 { font-size: 14pt; text-align: center; margin-top: 0; }
h2 { font-weight: bold; }
h3 { font-weight: bold; font-style: italic; }
h4, h5, h6 { font-weight: normal; font-style: italic; }
p { margin: 0; }
p + p { text-indent: .5in; }
blockquote { border: 0; padding: 0 .5in; margin: 1em 0; color: inherit; }
ul, ol, pre, table { margin: 1em 0; }
th, td { border-width: 0 0 1px; }
th { border-bottom-width: 2px; }
hr.break::after { content: '—'; letter-spacing: 0; color: #000; }
@media print { body { font-size: 12pt; } }
`,
  ),

  builtin(
    'notes',
    'Plain notes',
    'Compact, left-aligned and sans-serif; good for working copies and lists.',
    `
body { max-width: 46rem; font: .95rem/1.5 system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
h1, h2, h3, h4, h5, h6 { margin: 1.4em 0 .4em; }
h1 { font-size: 1.6rem; }
h2 { font-size: 1.25rem; }
h3 { font-size: 1.05rem; }
p, ul, ol { margin-bottom: .6em; }
li { margin: .15em 0; }
@media print { body { font-size: 10pt; } }
`,
  ),
]

