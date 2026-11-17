<script lang="ts">
  import Select from './Select.svelte'
  import { onMount } from 'svelte'
  import { applyExportStyle, CHAPTER_NUMBER_CSS, embeddedGrowth, FOLDER_SUGGESTION_GROWTH, withTitlePage } from '@writingapp/core'
  import type { ExportStyleDef } from '@writingapp/core'
  import type { EpubDialogOptions, PdfOptions, TitlePage } from '../../preload/api'
  import { errorMessage } from './organise'

  let {
    title,
    html,
    sheets,
    imageBytes,
    saving,
    onsave,
    onsavepdf,
    onsavemarkdown,
    onsavedocx,
    onsaveepub,
    onclose
  }: {
    title: string
    html: string
    sheets: number
    /** Total size of the pictures the export uses. */
    imageBytes: number
    saving: boolean
    onsave: (pictures: 'embed' | 'folder', css: string, titlePage: TitlePage | null) => void
    onsavepdf: (options: PdfOptions, css: string, titlePage: TitlePage | null) => void
    onsavemarkdown: () => void
    onsavedocx: (options: PdfOptions) => void
    onsaveepub: (options: EpubDialogOptions, css: string) => void
    onclose: () => void
  } = $props()

  let pageSize = $state<PdfOptions['pageSize']>('A4')
  let margin = $state<PdfOptions['margin']>('normal')
  let pageNumbers = $state(true)
  // Extras laid over the chosen style (title page, chapter numbers, running title).
  let titlePageOn = $state(false)
  let numberChapters = $state(false)
  let runningTitle = $state(false)

  // The preview always has the pictures inside it. If that makes the page much bigger, a folder is suggested.
  const growth = $derived(embeddedGrowth(imageBytes, html.length))
  const suggest = $derived(imageBytes > 0 && growth >= FOLDER_SUGGESTION_GROWTH)
  let chosen = $state<'embed' | 'folder' | null>(null)
  const pictures = $derived(chosen ?? (suggest ? 'folder' : 'embed'))
  const size = (n: number): string =>
    n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

  type Format = 'pdf' | 'docx' | 'epub' | 'html' | 'markdown'
  /** The formats, each with what it is for, so the right one is quick to pick. */
  const FORMATS: { value: Format; label: string; use: string }[] = [
    { value: 'pdf', label: 'PDF', use: 'Pages to print or share' },
    { value: 'docx', label: 'Word', use: 'A document to keep editing' },
    { value: 'epub', label: 'EPUB', use: 'A book for e-readers' },
    { value: 'html', label: 'HTML', use: 'A page for a website or browser' },
    { value: 'markdown', label: 'Markdown', use: 'Plain text, for other writing apps' }
  ]
  const FORMAT_NAMES: Record<Format, string> = { pdf: 'PDF', docx: 'Word', epub: 'EPUB', html: 'HTML', markdown: 'Markdown' }
  const CSS_EXAMPLE = 'body { font-family: Georgia, serif; }'
  const REMEMBER_FORMAT = 'writingapp.exportFormat'
  let format = $state<Format>(
    (() => {
      try {
        const v = localStorage.getItem(REMEMBER_FORMAT)
        return v === 'pdf' || v === 'docx' || v === 'epub' || v === 'html' || v === 'markdown' ? v : 'pdf'
      } catch {
        return 'pdf'
      }
    })()
  )

  function chooseFormat(v: string): void {
    format = v as Format
    editing = false
    try {
      localStorage.setItem(REMEMBER_FORMAT, format)
    } catch {
      // Not remembered; harmless.
    }
  }

  /** Formats whose look comes from an export style. */
  const styled = $derived(format === 'pdf' || format === 'html' || format === 'epub')

  // EPUB details. The author is remembered; the title starts as the export's own.
  const REMEMBER_AUTHOR = 'writingapp.epubAuthor'
  const REMEMBER_LANGUAGE = 'writingapp.epubLanguage'
  const remembered = (key: string, fallback: string): string => {
    try {
      return localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  }
  let bookTitle = $state('')
  let bookAuthor = $state(remembered(REMEMBER_AUTHOR, ''))
  let bookLanguage = $state(remembered(REMEMBER_LANGUAGE, 'en'))
  let coverName = $state<string | null>(null)
  const LANGUAGES = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
    { value: 'de', label: 'German' },
    { value: 'it', label: 'Italian' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'nl', label: 'Dutch' }
  ]

  async function chooseCover(): Promise<void> {
    try {
      const name = await window.api.chooseEpubCover()
      if (name) coverName = name
    } catch (e) {
      problem = errorMessage(e)
    }
  }

  function saveEpub(): void {
    try {
      localStorage.setItem(REMEMBER_AUTHOR, bookAuthor)
      localStorage.setItem(REMEMBER_LANGUAGE, bookLanguage)
    } catch {
      // Not remembered; harmless.
    }
    onsaveepub({ title: bookTitle.trim() || title, author: bookAuthor.trim(), language: bookLanguage, cover: coverName !== null }, savedCss)
  }

  function save(): void {
    if (format === 'pdf') onsavepdf({ pageSize, margin, pageNumbers, runningTitle }, savedCss, titlePage())
    else if (format === 'docx') onsavedocx({ pageSize, margin, pageNumbers })
    else if (format === 'epub') saveEpub()
    else if (format === 'html') onsave(pictures, savedCss, titlePage())
    else onsavemarkdown()
  }

  let saveButton = $state<HTMLButtonElement>()

  // --- Styles ---------------------------------------------------------------

  const REMEMBER = 'writingapp.exportStyle'
  let styles = $state<ExportStyleDef[]>([])
  let styleId = $state('default')
  let problem = $state('')
  const current = $derived(styles.find((x) => x.id === styleId) ?? styles[0])
  const styleOptions = $derived(
    [...styles.filter((x) => x.builtin), ...styles.filter((x) => !x.builtin)].map((x) => ({
      value: x.id,
      label: x.name,
      group: styles.some((y) => y.builtin) && styles.some((y) => !y.builtin) ? (x.builtin ? 'Built in' : 'Yours') : undefined
    }))
  )

  let editing = $state(false)
  let draftName = $state('')
  let draftDescription = $state('')
  let draftCss = $state('')
  let previewCss = $state('')
  let confirmDelete = $state(false)
  let previewTimer: ReturnType<typeof setTimeout> | undefined

  /** The CSS the page is shown and saved with. */
  const activeCss = $derived(editing ? previewCss : (current?.css ?? ''))
  /** The style's CSS with the chapter numbering the writer switched on. */
  const savedCss = $derived(activeCss + (numberChapters ? CHAPTER_NUMBER_CSS : ''))
  const titlePage = (): TitlePage | null => (titlePageOn && (format === 'pdf' || format === 'html') ? { title: bookTitle.trim() || title, author: bookAuthor.trim() } : null)
  const shown = $derived.by(() => {
    const styled = applyExportStyle(html, savedCss)
    return titlePageOn && (format === 'pdf' || format === 'html') ? withTitlePage(styled, bookTitle.trim() || title, bookAuthor.trim()) : styled
  })

  async function loadStyles(select?: string): Promise<void> {
    try {
      styles = await window.api.exportStyles()
      let wanted = select
      if (!wanted) {
        try {
          wanted = localStorage.getItem(REMEMBER) ?? undefined
        } catch {
          // Storage can be unavailable; the default is fine.
        }
      }
      styleId = styles.some((x) => x.id === wanted) ? wanted! : 'default'
    } catch (e) {
      problem = errorMessage(e)
    }
  }

  function choose(id: string): void {
    styleId = id
    try {
      localStorage.setItem(REMEMBER, id)
    } catch {
      // Not remembered; harmless.
    }
  }

  function startEditing(): void {
    if (!current) return
    editing = true
    confirmDelete = false
    problem = ''
    draftName = current.builtin ? `${current.name} copy` : current.name
    draftDescription = current.description
    draftCss = current.css
    previewCss = current.css
  }

  function typedCss(): void {
    clearTimeout(previewTimer)
    previewTimer = setTimeout(() => (previewCss = draftCss), 200)
  }

  /** Saves the draft over the current style of the writer's own, or as a new style. */
  async function saveDraft(asNew: boolean): Promise<void> {
    try {
      const overwrite = !asNew && current && !current.builtin ? current.id : undefined
      const id = await window.api.saveExportStyle(draftName, draftDescription, draftCss, overwrite)
      editing = false
      await loadStyles(id)
      choose(id)
    } catch (e) {
      problem = errorMessage(e)
    }
  }

  async function deleteStyle(): Promise<void> {
    if (!current || current.builtin) return
    if (!confirmDelete) {
      confirmDelete = true
      return
    }
    try {
      await window.api.deleteExportStyle(current.id)
      editing = false
      confirmDelete = false
      await loadStyles('default')
      choose('default')
    } catch (e) {
      problem = errorMessage(e)
    }
  }

  onMount(() => {
    saveButton?.focus()
    void loadStyles()
  })

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (editing) editing = false
      else onclose()
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dlg-backdrop centered" onkeydown={keydown}>
  <div class="dlg dialog" class:editing role="dialog" aria-modal="true" aria-label="Export preview">
    <!-- No sandbox permissions: the preview cannot run scripts or reach the app. -->
    <!-- A new frame for each style: changing a live sandboxed frame's srcdoc can leave it blank. -->
    {#key shown}
      <iframe title="Preview of {title}" sandbox="" srcdoc={shown}></iframe>
    {/key}

    <!-- The settings read top to bottom: format, its options, its style, then Export. -->
    <aside>
      <header>
        <h2>Export</h2>
        <span class="name">{title} · {sheets === 1 ? '1 sheet' : `${sheets} sheets`}</span>
      </header>

      <div class="scroll">
        {#if editing && styled}
          <section class="editor">
            <h3>{current && !current.builtin ? 'Edit style' : 'New style'}</h3>
            <p class="note">A style is a set of CSS rules for fonts, spacing and colours. The preview updates as you type.</p>
            <input class="input" bind:value={draftName} placeholder="Style name" aria-label="Style name" />
            <input class="input" bind:value={draftDescription} placeholder="Description (optional)" aria-label="Style description" />
            <textarea
              class="input"
              bind:value={draftCss}
              oninput={typedCss}
              spellcheck="false"
              aria-label="Style CSS"
              placeholder={CSS_EXAMPLE}
            ></textarea>
            {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
            {#if current && !current.builtin}
              <button class="btn danger delete" onclick={() => void deleteStyle()}>{confirmDelete ? 'Click again to delete' : 'Delete style'}</button>
            {/if}
          </section>
        {:else}
          <section>
            <h3>Format</h3>
            <div class="formats" role="radiogroup" aria-label="Format">
              {#each FORMATS as f (f.value)}
                <label class="format" class:on={format === f.value}>
                  <input type="radio" name="export-format" value={f.value} checked={format === f.value} onchange={() => chooseFormat(f.value)} />
                  <span class="format-name">{f.label}</span>
                  <span class="format-use">{f.use}</span>
                  <svg class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
                </label>
              {/each}
            </div>
          </section>

          <section>
            {#if format !== 'markdown'}<h3>Options</h3>{/if}
            {#if format === 'pdf' || format === 'docx'}
              <div class="pair">
                <Select label="Page size" value={pageSize} options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'Letter' }]} onchange={(v) => (pageSize = v as PdfOptions['pageSize'])} />
                <Select label="Margins" value={margin} options={[{ value: 'narrow', label: 'Narrow margins' }, { value: 'normal', label: 'Normal margins' }, { value: 'wide', label: 'Wide margins' }]} onchange={(v) => (margin = v as PdfOptions['margin'])} />
              </div>
              <label class="check"><input type="checkbox" bind:checked={pageNumbers} /> Page numbers</label>
            {:else if format === 'epub'}
              <input class="input" bind:value={bookTitle} placeholder="Book title (default: {title})" aria-label="Book title" />
              <input class="input" bind:value={bookAuthor} placeholder="Author (optional)" aria-label="Author" />
              <div class="pair">
                <Select label="Language" value={bookLanguage} options={LANGUAGES} onchange={(v) => (bookLanguage = v)} />
                <button class="btn cover" onclick={() => void chooseCover()} title={coverName ?? 'Choose a cover picture'}>{coverName ? `Cover: ${coverName}` : 'Cover…'}</button>
              </div>
              {#if coverName}<button class="link" onclick={() => (coverName = null)}>No cover</button>{/if}
            {:else if format === 'html'}
              {#if imageBytes > 0}
                <Select label="Pictures" value={pictures} options={[{ value: 'embed', label: 'Inside the page (one file)' }, { value: 'folder', label: 'In a folder beside the page' }]} onchange={(v) => (chosen = v as 'embed' | 'folder')} />
                {#if suggest && pictures === 'embed'}
                  <p class="note warn">Embedding the pictures adds {size(imageBytes)} to the page. A folder keeps the page small.</p>
                {/if}
              {:else}
                <p class="note">One file; it needs nothing else to open.</p>
              {/if}
            {:else}
              <p class="note">Plain Markdown with no styling. Pictures are copied into a folder beside the file.</p>
            {/if}
            {#if styled}
              <label class="check"><input type="checkbox" bind:checked={numberChapters} /> Number chapters (top-level headings)</label>
            {/if}
            {#if format === 'pdf'}
              <label class="check"><input type="checkbox" bind:checked={runningTitle} /> Title at the top of each page</label>
            {/if}
            {#if format === 'pdf' || format === 'html'}
              <label class="check"><input type="checkbox" bind:checked={titlePageOn} /> Title page</label>
              {#if titlePageOn}
                <input class="input" bind:value={bookTitle} placeholder="Title (default: {title})" aria-label="Title page title" />
                <input class="input" bind:value={bookAuthor} placeholder="Author (optional)" aria-label="Title page author" />
              {/if}
            {/if}
            {#if format === 'docx' || format === 'epub'}
              <p class="note">{format === 'docx' ? 'The preview shows the content; Word lays out the pages itself.' : 'The preview shows the content; each e-reader lays out the pages itself.'}</p>
            {/if}
          </section>

          {#if styled}
            <section>
              <h3>Style</h3>
              <Select label="Export style" value={styleId} options={styleOptions} onchange={choose} />
              {#if current?.description}<p class="note">{current.description}</p>{/if}
              <div class="row">
                <button class="btn" onclick={startEditing}>{current?.builtin ? 'Copy and edit…' : 'Edit…'}</button>
                <button class="link" onclick={() => void window.api.openExportStylesFolder()}>Show styles folder</button>
              </div>
              {#if problem}<p class="problem" role="alert">{problem}</p>{/if}
            </section>
          {/if}
        {/if}
      </div>

      <footer>
        {#if editing && styled}
          <button class="btn" onclick={() => (editing = false)}>Cancel</button>
          {#if current && !current.builtin}
            <button class="btn" onclick={() => void saveDraft(true)}>Save as new style</button>
          {/if}
          <button class="btn primary" disabled={draftName.trim() === ''} onclick={() => void saveDraft(false)}>
            {current && !current.builtin ? 'Save' : 'Save style'}
          </button>
        {:else}
          <button class="btn" onclick={onclose}>Close</button>
          <button class="btn primary export" bind:this={saveButton} disabled={saving} onclick={save}>
            Export as {FORMAT_NAMES[format]}…
          </button>
        {/if}
      </footer>
    </aside>
  </div>
</div>

<style>
  .dialog {
    width: min(1160px, calc(100vw - 48px));
    height: calc(100vh - 48px);
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    overflow: clip;
  }
  /* Writing CSS wants more room than picking a format does. */
  .dialog.editing {
    grid-template-columns: minmax(0, 1fr) 420px;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
  }

  aside {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--list);
    border-left: 1px solid var(--border);
  }
  header {
    padding: 16px 16px 4px;
  }
  h2 {
    font-size: calc(15px * var(--ui-scale, 1));
  }
  .name {
    display: block;
    margin-top: 2px;
    font-size: calc(12px * var(--ui-scale, 1));
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 16px 16px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 18px;
  }
  h3 {
    margin: 0 0 2px;
    font-size: calc(12px * var(--ui-scale, 1));
    font-weight: 600;
    color: var(--muted);
  }

  /* The formats: every choice in view, one click each. */
  .formats {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 -8px;
  }
  .format {
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    column-gap: 8px;
    padding: 6px 8px;
    border-radius: var(--radius-md);
    cursor: default;
  }
  .format:hover {
    background: var(--hover);
  }
  .format.on {
    background: var(--selected);
  }
  .format:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  /* The real radio stays for the keyboard (arrow keys move between formats) but is not drawn. */
  .format input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .format-name {
    font-size: calc(13px * var(--ui-scale, 1));
    font-weight: 600;
  }
  .format-use {
    grid-column: 1;
    font-size: calc(12px * var(--ui-scale, 1));
    color: var(--muted);
  }
  .tick {
    grid-column: 2;
    grid-row: 1 / span 2;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: var(--text);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    visibility: hidden;
  }
  .format.on .tick {
    visibility: visible;
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .scroll :global(.select) {
    width: 100%;
    min-width: 0;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: calc(13px * var(--ui-scale, 1));
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .cover {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .note {
    margin: 0;
    font-size: calc(12px * var(--ui-scale, 1));
    line-height: 1.4;
    color: var(--muted);
  }
  .note.warn {
    color: var(--text);
  }
  .problem {
    margin: 0;
    color: var(--danger);
    font-size: calc(12px * var(--ui-scale, 1));
  }
  button.link {
    align-self: flex-start;
    font: inherit;
    font-size: calc(13px * var(--ui-scale, 1));
    background: none;
    border: none;
    color: var(--muted);
    padding: 5px 6px;
    border-radius: var(--radius-sm);
    cursor: default;
  }
  button.link:hover {
    color: var(--text);
  }

  .editor textarea {
    flex: none;
    height: 320px;
    resize: vertical;
    padding: 8px;
    font: calc(12px * var(--ui-scale, 1)) / 1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    tab-size: 2;
  }
  .editor .delete {
    align-self: flex-start;
  }

  /* Export stays in reach at the foot of the column, however long the options get. */
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
  footer .export {
    flex: 1;
    white-space: nowrap;
  }
</style>
