<script lang="ts">
  import type { GroupNode } from '@writingapp/core'
  import GroupTree from './GroupTree.svelte'

  interface Props {
    group: GroupNode
    depth?: number
    selected: string
    expanded: Record<string, boolean>
    onselect: (path: string) => void
    ontoggle: (path: string) => void
  }

  let { group, depth = 0, selected, expanded, onselect, ontoggle }: Props = $props()

  const subgroups = $derived(group.children.filter((c) => c.kind === 'group'))
  const isOpen = $derived(expanded[group.path] === true)
</script>

<li role="none">
  <div class="row" class:selected={selected === group.path} style:padding-left="{8 + depth * 14}px">
    {#if subgroups.length > 0}
      <button
        class="chevron"
        aria-label={isOpen ? `Collapse ${group.name}` : `Expand ${group.name}`}
        aria-expanded={isOpen}
        onclick={() => ontoggle(group.path)}>{isOpen ? '▾' : '▸'}</button
      >
    {:else}
      <span class="chevron"></span>
    {/if}
    <button class="name" onclick={() => onselect(group.path)}>{group.name}</button>
  </div>
  {#if isOpen && subgroups.length > 0}
    <ul role="group">
      {#each subgroups as child (child.path)}
        <GroupTree group={child} depth={depth + 1} {selected} {expanded} {onselect} {ontoggle} />
      {/each}
    </ul>
  {/if}
</li>

<style>
  .row {
    display: flex;
    align-items: center;
    border-radius: 6px;
    margin: 1px 6px;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.selected {
    background: var(--selected);
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
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
