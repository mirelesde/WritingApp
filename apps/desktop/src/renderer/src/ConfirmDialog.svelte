<script lang="ts">
  interface Props {
    title: string
    body: string
    /** The button that goes ahead, named for what it does. */
    yes: string
    onyes: () => void
    oncancel: () => void
  }

  let { title, body, yes, onyes, oncancel }: Props = $props()

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
    aria-labelledby="confirm-title"
    aria-describedby="confirm-body"
    tabindex="-1"
    use:focusFirst
    onkeydown={keydown}
  >
    <h2 id="confirm-title">{title}</h2>
    <p id="confirm-body">{body}</p>
    <div class="buttons">
      <button onclick={oncancel}>Cancel</button>
      <button class="primary" onclick={onyes}>{yes}</button>
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
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
</style>
