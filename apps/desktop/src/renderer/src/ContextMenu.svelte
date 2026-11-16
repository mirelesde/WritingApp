<script lang="ts">
  import { onMount, tick } from 'svelte'

  import type { MenuItem } from './contextMenu'

  interface Props {
    items: MenuItem[]
    x: number
    y: number
    onchoose: (item: MenuItem) => void
    onclose: () => void
  }

  let { items, x, y, onchoose, onclose }: Props = $props()

  let menu = $state<HTMLUListElement>()
  let pos = $state({ left: 0, top: 0 })
  // Focus stays where it was (the editor keeps its selection), so keys are caught on the window.
  let active = $state(-1)

  const usable = (i: number): boolean => !items[i]?.separator && !items[i]?.disabled

  function step(direction: number): void {
    let next = active
    for (let n = 0; n < items.length; n++) {
      next = (next + direction + items.length) % items.length
      if (usable(next)) {
        active = next
        return
      }
    }
  }

  function choose(i: number): void {
    if (!usable(i)) return
    onchoose(items[i]!)
  }

  function keydown(e: KeyboardEvent): void {
    const handled = ['Escape', 'ArrowDown', 'ArrowUp', 'Enter', 'Home', 'End'].includes(e.key)
    if (!handled) {
      if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'Alt') onclose()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') onclose()
    else if (e.key === 'ArrowDown') step(1)
    else if (e.key === 'ArrowUp') step(-1)
    else if (e.key === 'Home') {
      active = -1
      step(1)
    } else if (e.key === 'End') {
      active = 0
      step(-1)
    } else if (e.key === 'Enter' && active >= 0) choose(active)
  }

  onMount(() => {
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', onclose)
    window.addEventListener('resize', onclose)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', onclose)
      window.removeEventListener('resize', onclose)
    }
  })

  // Placed at the pointer, then pulled back inside the window if it would overflow.
  $effect(() => {
    pos = { left: x, top: y }
    void tick().then(() => {
      if (!menu) return
      const margin = 8
      pos = {
        left: Math.max(margin, Math.min(x, window.innerWidth - menu.offsetWidth - margin)),
        top: Math.max(margin, Math.min(y, window.innerHeight - menu.offsetHeight - margin))
      }
    })
  })
</script>

<!-- A press anywhere else closes the menu; it never reaches what is underneath. -->
<div
  class="scrim"
  role="presentation"
  onmousedown={(e) => {
    e.preventDefault()
    onclose()
  }}
  oncontextmenu={(e) => {
    e.preventDefault()
    onclose()
  }}
></div>
<ul
  bind:this={menu}
  class="menu"
  role="menu"
  style:left="{pos.left}px"
  style:top="{pos.top}px"
>
  {#each items as item, i (i)}
    {#if item.separator}
      <li class="sep" role="separator"></li>
    {:else}
      <!-- Keys are handled on the window while the menu is open, so focus can stay in the text. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        role="menuitem"
        aria-disabled={item.disabled || undefined}
        class:active={i === active}
        class:disabled={item.disabled}
        onmouseenter={() => usable(i) && (active = i)}
        onmouseleave={() => (active = -1)}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => choose(i)}
      >
        <span>{item.label}</span>
        {#if item.hint}<kbd>{item.hint}</kbd>{/if}
      </li>
    {/if}
  {/each}
</ul>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-modal) + 1);
  }
  .menu {
    position: fixed;
    z-index: calc(var(--z-modal) + 2);
    min-width: 190px;
    margin: 0;
    padding: 5px;
    list-style: none;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-popover);
    font-size: calc(13px * var(--ui-scale, 1));
    user-select: none;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding: 5px 10px;
    border-radius: var(--radius-sm);
    white-space: nowrap;
    cursor: default;
  }
  li.active {
    background: var(--accent);
    color: var(--on-accent);
  }
  li.disabled {
    color: var(--faint);
  }
  kbd {
    font: inherit;
    font-size: calc(12px * var(--ui-scale, 1));
    color: var(--muted);
  }
  li.active kbd {
    color: inherit;
    opacity: 0.8;
  }
  .sep {
    height: 1px;
    margin: 4px 2px;
    padding: 0;
    background: var(--border);
  }
</style>
