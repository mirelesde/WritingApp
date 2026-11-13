<script lang="ts">
  import { rankCommands, type PaletteCommand } from './palette'

  let {
    commands,
    onrun,
    oncancel
  }: { commands: PaletteCommand[]; onrun: (command: PaletteCommand) => void; oncancel: () => void } = $props()

  let query = $state('')
  let index = $state(0)
  const results = $derived(rankCommands(commands, query))

  function focusInput(input: HTMLInputElement): void {
    input.focus()
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') oncancel()
    else if (e.key === 'ArrowDown') index = Math.min(index + 1, results.length - 1)
    else if (e.key === 'ArrowUp') index = Math.max(index - 1, 0)
    else if (e.key === 'Enter') {
      const command = results[index]
      if (command) onrun(command)
    } else return
    e.preventDefault()
  }

  function scrollActive(node: HTMLElement, active: boolean): void {
    if (active) node.scrollIntoView({ block: 'nearest' })
  }
</script>

<div class="backdrop" role="presentation" onmousedown={oncancel}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Command palette"
    tabindex="-1"
    onmousedown={(e) => e.stopPropagation()}
    onkeydown={keydown}
  >
    <input
      use:focusInput
      bind:value={query}
      oninput={() => (index = 0)}
      placeholder="Type a command…"
      aria-label="Command"
    />
    <ul role="listbox">
      {#each results as command, i (command.id)}
        <li role="presentation">
          <button
            role="option"
            aria-selected={i === index}
            class:active={i === index}
            tabindex="-1"
            onclick={() => onrun(command)}
            {@attach (node) => scrollActive(node, i === index)}
          >
            <span class="label"><span class="section">{command.section}</span>{command.label}</span>
            {#if command.shortcut}<kbd>{command.shortcut}</kbd>{/if}
          </button>
        </li>
      {:else}
        <li class="none">No command matches</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
    background: rgb(0 0 0 / 0.25);
    z-index: 40;
  }
  .dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.3);
    overflow: hidden;
  }
  input {
    margin: 10px;
    padding: 8px 10px;
    font: inherit;
    color: inherit;
    background: var(--pane);
    border: 1px solid var(--border);
    border-radius: 6px;
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 6px 8px;
    overflow-y: auto;
  }
  button {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    width: 100%;
    text-align: left;
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    border-radius: 6px;
    padding: 7px 10px;
    cursor: default;
  }
  button.active {
    background: var(--accent);
    color: #fff;
  }
  .section {
    font-size: 12px;
    opacity: 0.6;
    margin-right: 8px;
  }
  kbd {
    font: inherit;
    font-size: 12px;
    opacity: 0.7;
    white-space: nowrap;
  }
  .none {
    padding: 10px;
    color: var(--muted);
  }
</style>
