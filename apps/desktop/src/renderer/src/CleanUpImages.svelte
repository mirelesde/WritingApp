<script lang="ts">
  interface Props {
    /** Pictures in the library that no sheet mentions. */
    images: { name: string; size: number }[]
    /** Called with the names to move to the trash. */
    onclean: (names: string[]) => void
    oncancel: () => void
  }

  let { images, onclean, oncancel }: Props = $props()

  // Everything starts ticked; the user can keep any of them.
  let kept = $state<Record<string, boolean>>({})
  const chosen = $derived(images.filter((i) => !kept[i.name]))
  const bytes = (n: number): string =>
    n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
  const total = $derived(chosen.reduce((sum, i) => sum + i.size, 0))

  function focusFirst(node: HTMLElement): void {
    node.focus()
  }
</script>

<div class="backdrop" role="presentation">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="clean-title"
    tabindex="-1"
    use:focusFirst
    onkeydown={(e) => e.key === 'Escape' && oncancel()}
  >
    <h2 id="clean-title">Unused images</h2>
    {#if images.length === 0}
      <p>Every picture in the library is used by a sheet.</p>
    {:else}
      <p>
        No sheet mentions these pictures. They move to the system trash, so they can be put back from
        there. Untick any you want to keep.
      </p>
      <ul>
        {#each images as image (image.name)}
          <li>
            <label>
              <input
                type="checkbox"
                checked={!kept[image.name]}
                onchange={(e) => (kept[image.name] = !e.currentTarget.checked)}
              />
              <img src={`wa-asset://library/${encodeURIComponent(image.name)}`} alt="" />
              <span class="name">{image.name}</span>
              <span class="size">{bytes(image.size)}</span>
            </label>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="buttons">
      <button onclick={oncancel}>{images.length === 0 ? 'Close' : 'Cancel'}</button>
      {#if images.length > 0}
        <button class="primary" disabled={chosen.length === 0} onclick={() => onclean(chosen.map((i) => i.name))}>
          Move {chosen.length} to Trash ({bytes(total)})
        </button>
      {/if}
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
    width: min(560px, 92vw);
    max-height: 80vh;
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
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--list);
  }
  li + li {
    border-top: 1px solid var(--border);
  }
  label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    font-size: 13px;
  }
  img {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .size {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
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
  button:disabled {
    opacity: 0.5;
  }
</style>
