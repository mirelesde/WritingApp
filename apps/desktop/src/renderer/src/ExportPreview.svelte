<script lang="ts">
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
<div class="backdrop" onkeydown={keydown}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Export preview">
    <header>
      <span class="name">{title} · {sheets === 1 ? '1 sheet' : `${sheets} sheets`}</span>
      <label class="pdf">
        <select bind:value={pageSize} aria-label="Page size">
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
        </select>
      </label>
      <label class="pdf">
        <select bind:value={margin} aria-label="Margins">
          <option value="narrow">Narrow margins</option>
          <option value="normal">Normal margins</option>
          <option value="wide">Wide margins</option>
        </select>
      </label>
      <label class="pdf"><input type="checkbox" bind:checked={pageNumbers} /> Page numbers</label>
      <button disabled={saving} onclick={() => onsavepdf({ pageSize, margin, pageNumbers }, activeCss)}>
        Save as PDF…
      </button>
      {#if imageBytes > 0}
        <label class="pdf" title={suggest ? `The pictures (${size(imageBytes)}) would make the page ${Math.round(growth * 100)}% bigger; a folder keeps it small.` : 'Where the pictures go in an HTML export'}>
          <select
            value={pictures}
            onchange={(e) => (chosen = e.currentTarget.value as 'embed' | 'folder')}
            aria-label="Pictures in HTML"
          >
            <option value="embed">Pictures inside the file</option>
            <option value="folder">Pictures in a folder</option>
          </select>
        </label>
        {#if suggest && pictures === 'embed'}
          <span class="hint">Pictures make this {Math.round(growth * 100)}% bigger</span>
        {/if}
      {/if}
      <button disabled={saving} onclick={onsavemarkdown}>Save as Markdown…</button>
      <button onclick={onclose}>Close</button>
      <button class="primary" bind:this={saveButton} disabled={saving} onclick={() => onsave(pictures, activeCss)}>
        Save as HTML…
      </button>
    </header>
    <div class="styles">
      <label>
        Style
        <select value={styleId} onchange={(e) => choose(e.currentTarget.value)} aria-label="Export style" disabled={editing}>
          {#if styles.some((x) => x.builtin)}
            <optgroup label="Built in">
              {#each styles.filter((x) => x.builtin) as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
            </optgroup>
          {/if}
          {#if styles.some((x) => !x.builtin)}
            <optgroup label="Yours">
              {#each styles.filter((x) => !x.builtin) as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
            </optgroup>
          {/if}
        </select>
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
          <input bind:value={draftName} placeholder="Style name" aria-label="Style name" />
          <input bind:value={draftDescription} placeholder="Description (optional)" aria-label="Style description" />
        </div>
        <textarea
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
    border: none;
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
    padding: 5px 8px;
    font: inherit;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 5px;
  }
  .editor textarea {
    height: 180px;
    resize: vertical;
    padding: 8px;
    font: 12.5px/1.45 ui-monospace, Menlo, Consolas, monospace;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 5px;
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
    color: #c0392b;
    font-size: 12px;
  }
  button.danger {
    color: #c0392b;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgb(0 0 0 / 0.35);
    z-index: 10;
  }
  .dialog {
    width: min(860px, calc(100vw - 48px));
    height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.3);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  button {
    font: inherit;
    padding: 5px 12px;
    color: inherit;
    background: var(--pane);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  button:disabled {
    opacity: 0.6;
  }
  .pdf {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  select {
    font: inherit;
    color: inherit;
    background: var(--pane);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 6px;
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
