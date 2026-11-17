<script lang="ts">
  interface Props {
    /** The sheets with changes, by title. */
    names: string[]
    /** What closing would do: close one tab, or the whole window. */
    what: 'tab' | 'window' | 'library'
    onsave: () => void
    ondiscard: () => void
    oncancel: () => void
  }

  let { names, what, onsave, ondiscard, oncancel }: Props = $props()

  const heading = $derived(
    names.length === 1
      ? `Do you want to save the changes to “${names[0]}”?`
      : `Do you want to save the changes to ${names.length} sheets?`
  )
  const consequence = $derived(
    what === 'tab'
      ? 'Your changes will be lost if you close this tab without saving them.'
      : what === 'library'
        ? 'Your changes will be lost if you leave this library without saving them.'
        : 'Your changes will be lost if you close this window without saving them.'
  )

  function focusFirst(node: HTMLElement): void {
    node.focus()
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      oncancel()
    }
  }
</script>

<div class="dlg-backdrop centered modal" role="presentation">
  <div
    class="dlg dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="unsaved-title"
    tabindex="-1"
    use:focusFirst
    onkeydown={keydown}
  >
    <h2 id="unsaved-title">{heading}</h2>
    {#if names.length > 1}
      <ul>
        {#each names.slice(0, 6) as name, i (i)}<li>{name}</li>{/each}
        {#if names.length > 6}<li>and {names.length - 6} more</li>{/if}
      </ul>
    {/if}
    <p>{consequence}</p>
    <div class="buttons">
      <button onclick={ondiscard}>Don’t Save</button>
      <button onclick={oncancel}>Cancel</button>
      <button class="primary" onclick={onsave}>{names.length > 1 ? 'Save All' : 'Save'}</button>
    </div>
  </div>
</div>

<style>
  .dialog {
    width: min(440px, 92vw);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 22px;
  }
  h2 {
    margin: 0;
    font-size: calc(15px * var(--ui-scale, 1));
  }
  p {
    margin: 0;
    font-size: calc(13px * var(--ui-scale, 1));
    color: var(--muted);
  }
  ul {
    margin: 0;
    padding-left: 18px;
    font-size: calc(13px * var(--ui-scale, 1));
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
</style>
