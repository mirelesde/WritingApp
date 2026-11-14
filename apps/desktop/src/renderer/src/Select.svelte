<script lang="ts">
  import { tick } from 'svelte'

  export interface Option {
    value: string
    label: string
    /** Options with the same group are listed together under its heading. */
    group?: string
  }

  interface Props {
    value: string
    options: Option[]
    onchange: (value: string) => void
    label: string
    disabled?: boolean
  }

  let { value, options, onchange, label, disabled = false }: Props = $props()

  let open = $state(false)
  let active = $state(0)
  let button = $state<HTMLButtonElement>()
  let list = $state<HTMLUListElement>()
  let place = $state({ left: 0, top: 0, minWidth: 0, maxHeight: 280 })

  const current = $derived(options.find((o) => o.value === value))

  async function show(): Promise<void> {
    if (disabled || !button) return
    const r = button.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const flip = below < 160 && above > below
    place = {
      left: r.left,
      top: flip ? 0 : r.bottom + 4,
      minWidth: r.width,
      maxHeight: Math.min(280, flip ? above : below)
    }
    button.focus()
    active = Math.max(0, options.findIndex((o) => o.value === value))
    open = true
    await tick()
    if (flip && list) place.top = r.top - 4 - list.offsetHeight
    list?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }

  function close(): void {
    open = false
    button?.focus()
  }

  function pick(index: number): void {
    const option = options[index]
    if (option && option.value !== value) onchange(option.value)
    close()
  }

  function move(step: number): void {
    active = (active + step + options.length) % options.length
    void tick().then(() => list?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }))
  }

  function keydown(e: KeyboardEvent): void {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        void show()
      }
      return
    }
    if (e.key === 'Escape') {
      // Closes the list, not the dialog around it.
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(-1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      pick(active)
    } else if (e.key === 'Tab') {
      open = false
    }
  }

  const heading = (i: number): string | undefined =>
    options[i].group && options[i].group !== options[i - 1]?.group ? options[i].group : undefined
</script>

<svelte:window onresize={() => (open = false)} />

<button
  bind:this={button}
  type="button"
  class="select input"
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={label}
  {disabled}
  onclick={() => (open ? close() : void show())}
  onkeydown={keydown}
>
  <span class="value">{current?.label ?? ''}</span>
  <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" /></svg>
</button>

{#if open}
  <div class="scrim" role="presentation" onmousedown={() => (open = false)}></div>
  <ul
    bind:this={list}
    class="menu"
    role="listbox"
    aria-label={label}
    style:left="{place.left}px"
    style:top="{place.top}px"
    style:min-width="{place.minWidth}px"
    style:max-height="{place.maxHeight}px"
  >
    {#each options as option, i (option.value)}
      {#if heading(i)}<li class="group" role="presentation">{heading(i)}</li>{/if}
      <li
        role="option"
        aria-selected={option.value === value}
        class:active={i === active}
        onmouseenter={() => (active = i)}
        onmousedown={(e) => {
          e.preventDefault()
          pick(i)
        }}
      >
        <span class="tick">{option.value === value ? '✓' : ''}</span>{option.label}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .select {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    text-align: left;
    cursor: default;
    white-space: nowrap;
  }
  .select:disabled {
    opacity: 0.45;
  }
  .value {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  svg {
    flex: none;
    width: 10px;
    height: 10px;
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-modal) + 1);
  }
  .menu {
    position: fixed;
    z-index: calc(var(--z-modal) + 2);
    margin: 0;
    padding: 5px;
    list-style: none;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-popover);
    font-size: 13px;
  }
  li {
    display: flex;
    align-items: center;
    padding: 5px 9px 5px 4px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    cursor: default;
  }
  li.active {
    background: var(--accent);
    color: var(--on-accent);
  }
  .tick {
    width: 16px;
    flex: none;
    text-align: center;
    font-size: 12px;
  }
  .group {
    padding: 6px 9px 2px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
</style>
