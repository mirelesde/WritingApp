<script lang="ts">
  import { textStats } from '@writingapp/core'

  interface Props {
    /** The sheet's file name, for the heading. */
    name: string
    /** What is in the editor. */
    mine: string
    /** What is on disk now. */
    disk: string
    onkeep: () => void
    onuse: () => void
  }

  let { name, mine, disk, onkeep, onuse }: Props = $props()

  const words = (text: string): string => `${textStats(text).words.toLocaleString()} words`

  function focusFirst(node: HTMLElement): void {
    node.focus()
  }
</script>

<div class="backdrop" role="presentation">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="conflict-title" tabindex="-1" use:focusFirst>
    <h2 id="conflict-title">“{name}” changed outside the app</h2>
    <p>
      Something else, such as a sync client or another editor, saved this sheet while you had
      unsaved changes. Choose which version to keep.
    </p>
    <div class="versions">
      <section>
        <h3>Your version <small>{words(mine)}</small></h3>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <pre tabindex="0">{mine}</pre>
      </section>
      <section>
        <h3>On disk <small>{words(disk)}</small></h3>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <pre tabindex="0">{disk}</pre>
      </section>
    </div>
    <div class="buttons">
      <button onclick={onuse}>Use the disk version</button>
      <button class="primary" onclick={onkeep}>Keep my version</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
  }
  .dialog {
    width: min(860px, 92vw);
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 22px;
    border-radius: 12px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
    outline: none;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .versions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    min-height: 0;
  }
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 13px;
  }
  h3 small {
    font-weight: 400;
    color: var(--muted);
    margin-left: 6px;
  }
  pre {
    margin: 0;
    padding: 10px;
    height: 40vh;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font: 12.5px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    background: var(--list);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button {
    font: inherit;
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--hover);
    color: var(--text);
  }
  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg);
  }
</style>
