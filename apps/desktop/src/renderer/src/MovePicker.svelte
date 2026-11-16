<script lang="ts">
  import { filterTargets, type MoveTarget } from './organise'

  interface Props {
    /** What is being moved, for the heading. */
    heading: string
    targets: MoveTarget[]
    onpick: (path: string) => void
    oncancel: () => void
  }

  let { heading, targets, onpick, oncancel }: Props = $props()
  let query = $state('')
  let index = $state(0)

  const matches = $derived(filterTargets(targets, query))

  function focusInput(input: HTMLInputElement): void {
    input.focus()
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') oncancel()
    else if (e.key === 'ArrowDown') index = Math.min(index + 1, matches.length - 1)
    else if (e.key === 'ArrowUp') index = Math.max(index - 1, 0)
    else if (e.key === 'Enter') {
      const target = matches[index]
      if (target) onpick(target.path)
    } else return
    e.preventDefault()
  }
</script>

<div class="dlg-backdrop" role="presentation" onmousedown={oncancel}>
  <div
    class="dlg dialog"
    role="dialog"
    aria-modal="true"
    aria-label={heading}
    tabindex="-1"
    onmousedown={(e) => e.stopPropagation()}
    onkeydown={keydown}
  >
    <p class="heading">{heading}</p>
    <input
      class="input"
      use:focusInput
      bind:value={query}
      oninput={() => (index = 0)}
      placeholder="Type to find a group"
      aria-label="Find a group"
    />
    <ul role="listbox">
      {#each matches as target, i (target.path)}
        <li role="presentation">
          <button
            role="option"
            aria-selected={i === index}
            class:active={i === index}
            tabindex="-1"
            onclick={() => onpick(target.path)}>{target.label}</button
          >
        </li>
      {:else}
        <li class="none">No matching group</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .dialog {
    width: min(460px, calc(100vw - 32px));
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .heading {
    margin: 0;
    padding: 12px 14px 4px;
    color: var(--muted);
    font-size: calc(12px * var(--ui-scale, 1));
  }
  input {
    margin: 10px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 6px 8px;
    overflow-y: auto;
  }
  button {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 7px 10px;
    cursor: default;
  }
  button.active {
    background: var(--accent);
    color: var(--on-accent);
  }
  .none {
    padding: 8px 10px;
    color: var(--muted);
  }
</style>
