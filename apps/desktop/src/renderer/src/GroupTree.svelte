<script lang="ts">
  import { GROUP_COLORS, groupLabel, type GroupNode } from '@writingapp/core'
  import GroupTree from './GroupTree.svelte'
  import { dropZone, type TreeDnd } from './organise'

  interface Props {
    group: GroupNode
    depth?: number
    selected: string
    expanded: Record<string, boolean>
    renaming: string | null
    onselect: (path: string) => void
    ontoggle: (path: string) => void
    onstartrename: (path: string) => void
    oncommitrename: (path: string, name: string) => void
    oncancelrename: () => void
    oncolor: (path: string, color: string | null) => void
    oncontext: (path: string, at: { x: number; y: number }) => void
    dnd: TreeDnd
    /** Show only the group's subgroups, not the group itself (its name is shown elsewhere). */
    hideRoot?: boolean
    /** Depth of the first level shown, so a hidden root does not leave an indent. */
    base?: number
  }

  let {
    group,
    depth = 0,
    selected,
    expanded,
    renaming,
    onselect,
    ontoggle,
    onstartrename,
    oncommitrename,
    oncancelrename,
    oncolor,
    oncontext,
    dnd,
    hideRoot = false,
    base = 0
  }: Props = $props()

  /** Focuses a freshly shown input with its text selected. */
  function focusSelect(input: HTMLInputElement): void {
    input.focus()
    input.select()
  }

  const subgroups = $derived(group.children.filter((c) => c.kind === 'group'))
  const sheetCount = $derived(group.children.filter((c) => c.kind === 'sheet').length)
  let picking = $state(false)
  const tint = $derived(group.color ? GROUP_COLORS[group.color] : undefined)
  const isOpen = $derived(expanded[group.path] === true)
</script>

{#snippet branch()}
  {#if (hideRoot || (isOpen)) && subgroups.length > 0}
    <ul role="group">
      {#each subgroups as child (child.path)}
        <GroupTree
          group={child}
          depth={depth + 1}
          base={hideRoot ? 1 : base}
          {selected}
          {expanded}
          {renaming}
          {onselect}
          {ontoggle}
          {onstartrename}
          {oncommitrename}
          {oncancelrename}
          {oncolor}
          {oncontext}
          {dnd}
        />
      {/each}
    </ul>
  {/if}
{/snippet}

{#if hideRoot}
  {@render branch()}
{:else}
<li role="none">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="row"
    class:selected={selected === group.path}
    class:drop-inside={dnd.hint?.path === group.path && dnd.hint.zone === 'inside'}
    class:drop-before={dnd.hint?.path === group.path && dnd.hint.zone === 'before'}
    class:drop-after={dnd.hint?.path === group.path && dnd.hint.zone === 'after'}
    style:padding-left="{8 + (depth - base) * 14}px"
    draggable={depth > 0 && renaming !== group.path}
    ondragstart={(e) => dnd.start(group.path, e)}
    ondragend={() => dnd.end()}
    oncontextmenu={(e) => {
      e.preventDefault()
      oncontext(group.path, { x: e.clientX, y: e.clientY })
    }}
    ondragover={(e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      dnd.over(group.path, dropZone(e.clientY - rect.top, rect.height), e)
    }}
    ondrop={(e) => {
      const rect = e.currentTarget.getBoundingClientRect()
      dnd.drop(group.path, dropZone(e.clientY - rect.top, rect.height), e)
    }}
  >
    {#if subgroups.length > 0}
      <button
        class="chevron"
        tabindex="-1"
        aria-label={isOpen ? `Collapse ${groupLabel(group)}` : `Expand ${groupLabel(group)}`}
        aria-expanded={isOpen}
        onclick={() => ontoggle(group.path)}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true" class:open={isOpen}>
          <path d="M4.2 2.5L7.8 6l-3.6 3.5" />
        </svg>
      </button>
    {:else}
      <span class="chevron"></span>
    {/if}
    {#if renaming === group.path}
      <input
        class="rename"
        value={groupLabel(group)}
        use:focusSelect
        aria-label="Group name"
        onkeydown={(e) => {
          if (e.key === 'Enter') oncommitrename(group.path, e.currentTarget.value)
          else if (e.key === 'Escape') oncancelrename()
          e.stopPropagation()
        }}
        onblur={(e) => oncommitrename(group.path, e.currentTarget.value)}
      />
    {:else}
      <button
        class="kind"
        tabindex="-1"
        title="Colour"
        aria-label="Choose a colour for {groupLabel(group)}"
        aria-expanded={picking}
        onclick={() => (picking = !picking)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" style:stroke={tint} style:fill={tint ? `${tint}33` : undefined}>
          {#if depth === 0}
            <path d="M4 4.5h9.5A1.5 1.5 0 0 1 15 6v10H5.5A1.5 1.5 0 0 1 4 14.5z" />
            <path d="M4 14.5A1.5 1.5 0 0 1 5.5 13H15" />
          {:else}
            <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 1.8h6A1.5 1.5 0 0 1 16.5 8.3V14A1.5 1.5 0 0 1 15 15.5H4.5A1.5 1.5 0 0 1 3 14z" />
          {/if}
        </svg>
      </button>
      <button
        class="name"
        tabindex="-1"
        onclick={() => onselect(group.path)}
        ondblclick={() => depth > 0 && onstartrename(group.path)}>{groupLabel(group)}</button
      >
      {#if sheetCount > 0}<span class="count">{sheetCount}</span>{/if}
    {/if}
  </div>
  {#if picking}
    <div class="swatches" style:padding-left="{30 + (depth - base) * 14}px" role="group" aria-label="Colour">
      {#each Object.entries(GROUP_COLORS) as [name, hex] (name)}
        <button
          class="swatch"
          class:on={group.color === name}
          style:background={hex}
          title={name}
          aria-label={name}
          tabindex="-1"
          onclick={() => {
            oncolor(group.path, name)
            picking = false
          }}
        ></button>
      {/each}
      <button
        class="swatch none"
        title="No colour"
        aria-label="No colour"
        tabindex="-1"
        onclick={() => {
          oncolor(group.path, null)
          picking = false
        }}>×</button
      >
    </div>
  {/if}
  {@render branch()}
</li>
{/if}

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 8px;
    margin: 1px 8px;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.drop-inside {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  /* A straight line that stops where the row's rounded corners begin. */
  .row.drop-before::before,
  .row.drop-after::after {
    content: '';
    position: absolute;
    left: 8px;
    right: 8px;
    height: 3px;
    border-radius: 1.5px;
    background: var(--accent);
    pointer-events: none;
  }
  .row.drop-before::before {
    top: -2px;
  }
  .row.drop-after::after {
    bottom: -2px;
  }
  .row.selected {
    background: var(--selected);
  }
  :global(.pane:focus) .row.selected {
    background: var(--accent);
    color: var(--on-accent);
  }
  button {
    background: none;
    border: none;
    padding: 0;
    cursor: default;
  }
  .chevron {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    color: var(--muted);
    flex: none;
  }
  .chevron svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 120ms ease-out;
  }
  .chevron svg.open {
    transform: rotate(90deg);
  }
  .chevron:hover {
    color: var(--text);
  }
  .name {
    flex: 1;
    font-size: 13px;
    text-align: left;
    padding: 5px 6px 5px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kind {
    display: grid;
    place-items: center;
    flex: none;
    margin-right: 7px;
  }
  .kind svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .count {
    flex: none;
    margin: 0 8px 0 4px;
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  :global(.pane:focus) .row.selected .kind svg:not([style*='stroke']) {
    stroke: currentColor;
  }
  .swatches {
    display: flex;
    gap: 6px;
    padding: 4px 8px 6px;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    padding: 0;
    line-height: 1;
    font-size: 11px;
    color: var(--muted);
  }
  .swatch.on {
    border-color: var(--text);
  }
  .swatch.none {
    border-color: var(--border);
  }
  :global(.pane:focus) .row.selected .count {
    color: inherit;
    opacity: 0.8;
  }
  .rename {
    flex: 1;
    min-width: 0;
    font: inherit;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--accent);
    border-radius: 4px;
    padding: 3px 5px;
    margin: 1px 4px 1px 0;
    outline: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
