<script lang="ts">
  import type { GroupNode } from '@writingapp/core'
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
    dnd: TreeDnd
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
    dnd
  }: Props = $props()

  /** Focuses a freshly shown input with its text selected. */
  function focusSelect(input: HTMLInputElement): void {
    input.focus()
    input.select()
  }

  const subgroups = $derived(group.children.filter((c) => c.kind === 'group'))
  const isOpen = $derived(expanded[group.path] === true)
</script>

<li role="none">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="row"
    class:selected={selected === group.path}
    class:drop-inside={dnd.hint?.path === group.path && dnd.hint.zone === 'inside'}
    class:drop-before={dnd.hint?.path === group.path && dnd.hint.zone === 'before'}
    class:drop-after={dnd.hint?.path === group.path && dnd.hint.zone === 'after'}
    style:padding-left="{8 + depth * 14}px"
    draggable={depth > 0 && renaming !== group.path}
    ondragstart={(e) => dnd.start(group.path, e)}
    ondragend={() => dnd.end()}
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
        aria-label={isOpen ? `Collapse ${group.name}` : `Expand ${group.name}`}
        aria-expanded={isOpen}
        onclick={() => ontoggle(group.path)}>{isOpen ? '▾' : '▸'}</button
      >
    {:else}
      <span class="chevron"></span>
    {/if}
    {#if renaming === group.path}
      <input
        class="rename"
        value={group.name}
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
        class="name"
        tabindex="-1"
        onclick={() => onselect(group.path)}
        ondblclick={() => depth > 0 && onstartrename(group.path)}>{group.name}</button
      >
    {/if}
  </div>
  {#if isOpen && subgroups.length > 0}
    <ul role="group">
      {#each subgroups as child (child.path)}
        <GroupTree
          group={child}
          depth={depth + 1}
          {selected}
          {expanded}
          {renaming}
          {onselect}
          {ontoggle}
          {onstartrename}
          {oncommitrename}
          {oncancelrename}
          {dnd}
        />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .row {
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
  .row.drop-before {
    box-shadow: 0 -2px 0 var(--accent);
  }
  .row.drop-after {
    box-shadow: 0 2px 0 var(--accent);
  }
  .row.selected {
    background: var(--selected);
  }
  :global(.pane:focus) .row.selected {
    background: var(--accent);
    color: #fff;
  }
  button {
    background: none;
    border: none;
    padding: 0;
    cursor: default;
  }
  .chevron {
    width: 18px;
    color: var(--muted);
    font-size: 11px;
    flex: none;
  }
  .name {
    flex: 1;
    text-align: left;
    padding: 5px 6px 5px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
