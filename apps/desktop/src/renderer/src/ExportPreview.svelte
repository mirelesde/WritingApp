<script lang="ts">
  import Select from './Select.svelte'
  import { onMount } from 'svelte'
  import { applyExportStyle, embeddedGrowth, FOLDER_SUGGESTION_GROWTH } from '@writingapp/core'
  import type { ExportStyleDef } from '@writingapp/core'
  import type { PdfOptions } from '../../preload/api'
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
    onclose
  }: {
    title: string
    html: string
    sheets: number
    /** Total size of the pictures the export uses. */
    imageBytes: number
    saving: boolean
    onsave: (pictures: 'embed' | 'folder', css: string) => void
    onsavepdf: (options: PdfOptions, css: string) => void
    onsavemarkdown: () => void
    onsavedocx: (options: PdfOptions) => void
    onclose: () => void
  } = $props()

  let pageSize = $state<PdfOptions['pageSize']>('A4')
  let margin = $state<PdfOptions['margin']>('normal')
  let pageNumbers = $state(true)

  // The preview always has the pictures inside it. If that makes the page much bigger, a folder is suggested.
  const growth = $derived(embeddedGrowth(imageBytes, html.length))
  const suggest = $derived(imageBytes > 0 && growth >= FOLDER_SUGGESTION_GROWTH)
  let chosen = $state<'embed' | 'folder' | null>(null)
  const pictures = $derived(chosen ?? (suggest ? 'folder' : 'embed'))
  const size = (n: number): string =>
    n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

  let saveButton: HTMLButtonElement | undefined

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
  const shown = $derived(applyExportStyle(html, activeCss))

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
  <div class="dlg dialog" role="dialog" aria-modal="true" aria-label="Export preview">
    <header>
      <span class="name">{title} · {sheets === 1 ? '1 sheet' : `${sheets} sheets`}</span>
      <label class="pdf">
        <Select label="Page size" value={pageSize} options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'Letter' }]} onchange={(v) => (pageSize = v as PdfOptions['pageSize'])} />
      </label>
      <label class="pdf">
        <Select label="Margins" value={margin} options={[{ value: 'narrow', label: 'Narrow margins' }, { value: 'normal', label: 'Normal margins' }, { value: 'wide', label: 'Wide margins' }]} onchange={(v) => (margin = v as PdfOptions['margin'])} />
      </label>
      <label class="pdf"><input type="checkbox" bind:checked={pageNumbers} /> Page numbers</label>
      <button disabled={saving} onclick={() => onsavepdf({ pageSize, margin, pageNumbers }, activeCss)}>
        Save as PDF…
      </button>
      {#if imageBytes > 0}
        <label class="pdf" title={suggest ? `The pictures (${size(imageBytes)}) would make the page ${Math.round(growth * 100)}% bigger; a folder keeps it small.` : 'Where the pictures go in an HTML export'}>
          <Select label="Pictures in HTML" value={pictures} options={[{ value: 'embed', label: 'Pictures inside the file' }, { value: 'folder', label: 'Pictures in a folder' }]} onchange={(v) => (chosen = v as 'embed' | 'folder')} />
        </label>
        {#if suggest && pictures === 'embed'}
          <span class="hint">Pictures make this {Math.round(growth * 100)}% bigger</span>
        {/if}
      {/if}
      <button disabled={saving} onclick={() => onsavedocx({ pageSize, margin, pageNumbers })}>Save as Word…</button>
      <button disabled={saving} onclick={onsavemarkdown}>Save as Markdown…</button>
      <button onclick={onclose}>Close</button>
      <button class="primary" bind:this={saveButton} disabled={saving} onclick={() => onsave(pictures, activeCss)}>
        Save as HTML…
      </button>
    </header>
    <div class="styles">
      <label>
        Style
        <Select label="Export style" value={styleId} disabled={editing} options={styleOptions} onchange={choose} />
      </label>
      <span class="desc">{current?.description ?? ''}</span>
      {#if !editing}
        <button onclick={startEditing}>{current?.builtin ? 'Make my own…' : 'Edit…'}</button>
        <button class="link" onclick={() => void window.api.openExportStylesFolder()}>Open folder</button>
      {/if}
    </div>
    {#if editing}
      <div class="editor">
        <div class="meta">
          <input class="input" bind:value={draftName} placeholder="Style name" aria-label="Style name" />
          <input class="input" bind:value={draftDescription} placeholder="Description (optional)" aria-label="Style description" />
        </div>
        <textarea class="input"
          bind:value={draftCss}
          oninput={typedCss}
          spellcheck="false"
          aria-label="Style CSS"
          placeholder="body {'{'} font-family: Georgia, serif; {'}'}"
        ></textarea>
        <div class="actions">
          {#if problem}<span class="problem" role="alert">{problem}</span>{/if}
          {#if current && !current.builtin}
            <button class="danger" onclick={() => void deleteStyle()}>{confirmDelete ? 'Really delete?' : 'Delete'}</button>
          {/if}
          <span class="grow"></span>
          <button onclick={() => (editing = false)}>Cancel</button>
          {#if current && !current.builtin}
            <button onclick={() => void saveDraft(true)}>Save as new</button>
          {/if}
          <button class="primary" disabled={draftName.trim() === ''} onclick={() => void saveDraft(false)}>
            {current && !current.builtin ? 'Save' : 'Save style'}
          </button>
        </div>
      </div>
    {/if}
    <!-- No sandbox permissions: the preview cannot run scripts or reach the app. -->
    <!-- A new frame for each style: changing a live sandboxed frame's srcdoc can leave it blank. -->
    {#key shown}
      <iframe title="Preview of {title}" sandbox="" srcdoc={shown}></iframe>
    {/key}
  </div>
</div>

<style>
  .styles {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .styles .desc {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  .styles label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  button.link {
    background: none;
    color: var(--muted);
    padding: 5px 4px;
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--pane);
  }
  .editor .meta {
    display: flex;
    gap: 8px;
  }
  .editor input {
    flex: 1;
  }
  .editor textarea {
    height: 180px;
    resize: vertical;
    padding: 8px;
    font: 13px/1.45 ui-monospace, Menlo, Consolas, monospace;
    tab-size: 2;
  }
  .editor .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .grow {
    flex: 1;
  }
  .problem {
    color: var(--danger);
    font-size: 12px;
  }
  button.danger {
    color: var(--danger);
  }
  .dialog {
    width: min(1160px, calc(100vw - 48px));
    height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  header button {
    padding: 5px 10px;
    white-space: nowrap;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }
  .name {
    flex: 1 1 140px;
    min-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  button {
    font: inherit;
    font-size: 13px;
    padding: 5px 12px;
    color: inherit;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    border: none;
    border-radius: var(--radius-sm);
    cursor: default;
  }
  button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--text) 13%, transparent);
  }
  button.primary {
    background: var(--accent);
    color: var(--on-accent);
  }
  button:disabled {
    opacity: 0.45;
  }
  .pdf {
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }

  iframe {
    flex: 1;
    border: none;
    background: #fff;
  }
  .hint {
    font-size: 12px;
    color: var(--accent);
    white-space: nowrap;
  }
</style>
