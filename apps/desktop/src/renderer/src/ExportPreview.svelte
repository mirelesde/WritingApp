<script lang="ts">
  import { onMount } from 'svelte'
  import { embeddedGrowth, FOLDER_SUGGESTION_GROWTH } from '@writingapp/core'
  import type { PdfOptions } from '../../preload/api'

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
    onsave: (pictures: 'embed' | 'folder') => void
    onsavepdf: (options: PdfOptions) => void
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

  onMount(() => saveButton?.focus())

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
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
      <button disabled={saving} onclick={() => onsavepdf({ pageSize, margin, pageNumbers })}>
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
      <button class="primary" bind:this={saveButton} disabled={saving} onclick={() => onsave(pictures)}>
        Save as HTML…
      </button>
    </header>
    <!-- No sandbox permissions: the preview cannot run scripts or reach the app. -->
    <iframe title="Preview of {title}" sandbox="" srcdoc={html}></iframe>
  </div>
</div>

<style>
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
