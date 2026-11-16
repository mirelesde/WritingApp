<script lang="ts">
  import { textStats } from '@writingapp/core'

  interface Props {
    /** The sheet's file name, for the heading. */
    name: string
    /** The text that was in the editor when the app stopped. */
    recovered: string
    /** What the file holds now. */
    disk: string
    /** When the text was last kept safe, in ms since 1970. */
    savedAt: number
    /** The file is gone, so restoring creates it again. */
    missing?: boolean
    /** Where this one stands when several sheets were recovered. */
    position: number
    total: number
    onrestore: () => void
    ondiscard: () => void
  }

  let { name, recovered, disk, savedAt, missing = false, position, total, onrestore, ondiscard }: Props = $props()

  const words = (text: string): string => `${textStats(text).words.toLocaleString()} words`
  const when = $derived(
    new Date(savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  )

  function focusFirst(node: HTMLElement): void {
    node.focus()
  }
</script>

<div class="dlg-backdrop centered modal" role="presentation">
  <div class="dlg dialog" role="alertdialog" aria-modal="true" aria-labelledby="recovery-title" tabindex="-1" use:focusFirst>
    <h2 id="recovery-title">
      Recovered unsaved changes to “{name}”
      {#if total > 1}<small>{position} of {total}</small>{/if}
    </h2>
    <p>
      {#if missing}
        The app closed before this text was saved, and the sheet has since been deleted, renamed or
        moved. The text was kept safe at {when}. Restore it to make the sheet again, or throw it away.
      {:else}
        The app closed before this text was saved. It was kept safe at {when}. Restore it to put it back
        in the sheet, or keep the file as it is now.
      {/if}
    </p>
    <div class="versions" class:single={missing}>
      <section>
        <h3>Recovered text <small>{words(recovered)}</small></h3>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <pre tabindex="0">{recovered}</pre>
      </section>
      {#if !missing}
      <section>
        <h3>In the file now <small>{words(disk)}</small></h3>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <pre tabindex="0">{disk}</pre>
      </section>
      {/if}
    </div>
    <div class="buttons">
      <button onclick={ondiscard}>{missing ? 'Throw it away' : 'Keep the file as it is'}</button>
      <button class="primary" onclick={onrestore}>{missing ? 'Restore as a sheet' : 'Restore recovered text'}</button>
    </div>
  </div>
</div>

<style>
  .dialog {
    width: min(860px, 92vw);
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 22px;
  }
  h2 small {
    font-weight: 400;
    color: var(--muted);
    margin-left: 6px;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: calc(13px * var(--ui-scale, 1));
  }
  .versions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    min-height: 0;
  }
  .versions.single {
    grid-template-columns: 1fr;
  }
  section {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  h3 {
    margin: 0 0 4px;
    font-size: calc(13px * var(--ui-scale, 1));
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
    font: 13px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    background: var(--list);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
</style>
