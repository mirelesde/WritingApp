<script lang="ts">
  import { onMount } from 'svelte'

  let {
    title,
    html,
    sheets,
    saving,
    onsave,
    onclose
  }: {
    title: string
    html: string
    sheets: number
    saving: boolean
    onsave: () => void
    onclose: () => void
  } = $props()

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
      <button onclick={onclose}>Close</button>
      <button class="primary" bind:this={saveButton} disabled={saving} onclick={onsave}>
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
  iframe {
    flex: 1;
    border: none;
    background: #fff;
  }
</style>
