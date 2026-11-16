<script lang="ts">
  import type { LibraryInfo } from '../../preload/api'
  import GroupTree from './GroupTree.svelte'
  import ToolButton from './ToolButton.svelte'
  import type { TreeDnd } from './organise'

  interface Props {
    library: LibraryInfo
    selectedGroup: string
    expanded: Record<string, boolean>
    renaming: string | null
    /** An error, or else a passing message, shown at the foot of the pane. */
    notice: string
    info: string
    conflictCount: number
    keyMod: string
    /** Show the number of sheets beside each group. */
    showCounts: boolean
    keyShift: string
    el: HTMLElement | undefined
    dnd: TreeDnd
    onkeydown: (e: KeyboardEvent) => void
    onmousedown: (e: MouseEvent) => void
    onfocusout: (e: FocusEvent & { currentTarget: HTMLElement }) => void
    onnewgroup: () => void
    onhide: () => void
    onselect: (path: string) => void
    ontoggle: (path: string) => void
    onstartrename: (path: string) => void
    oncommitrename: (path: string, name: string) => void
    oncancelrename: () => void
    oncolor: (path: string, color: string | null) => void
    onnodemenu: (kind: 'root' | 'group', path: string, at: { x: number; y: number }) => void
    onconflicts: () => void
  }

  let {
    library,
    selectedGroup,
    expanded,
    renaming,
    notice,
    info,
    conflictCount,
    keyMod,
    showCounts,
    keyShift,
    el = $bindable(),
    dnd,
    onkeydown,
    onmousedown,
    onfocusout,
    onnewgroup,
    onhide,
    onselect,
    ontoggle,
    onstartrename,
    oncommitrename,
    oncancelrename,
    oncolor,
    onnodemenu,
    onconflicts
  }: Props = $props()
</script>

<div
  class="pane library"
  class:no-counts={!showCounts}
  role="tree"
  aria-label="Library"
  tabindex="0"
  bind:this={el}
  {onfocusout}
  {onkeydown}
  {onmousedown}
>
  <header class="library-bar">
    <span class="tools">
      <ToolButton icon="new-group" label="New group" hint="{keyMod}{keyShift}N" onclick={onnewgroup} />
      <ToolButton icon="sidebar" label="Hide sidebar" hint={keyMod + "\\"} onclick={onhide} />
    </span>
  </header>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="project"
    class:selected={selectedGroup === library.tree.path}
    oncontextmenu={(e) => {
      e.preventDefault()
      onnodemenu('root', library.tree.path, { x: e.clientX, y: e.clientY })
    }}
  >
    <button
      class="project-title"
      tabindex="-1"
      title={library.path}
      onclick={() => onselect(library.tree.path)}>{library.tree.name}</button
    >
  </div>
  <ul role="none">
    <GroupTree
      hideRoot
      group={library.tree}
      selected={selectedGroup}
      {expanded}
      {renaming}
      {onselect}
      {ontoggle}
      {onstartrename}
      {oncommitrename}
      {oncancelrename}
      {oncolor}
      oncontext={(path, at) => onnodemenu(path === library.tree.path ? 'root' : 'group', path, at)}
      dnd={dnd}
    />
  </ul>
  {#if conflictCount > 0}
    <button class="conflict-banner" onclick={onconflicts}>
      {conflictCount} sync conflict{conflictCount === 1 ? '' : 's'} — compare and resolve
    </button>
  {/if}
  {#if notice}
    <p class="notice" role="alert">{notice}</p>
  {:else if info}
    <p class="info" role="status">{info}</p>
  {/if}
</div>

<style>
  .no-counts :global(.count) {
    display: none;
  }
  .pane:focus {
    outline: none;
  }
  .pane {
    overflow-y: auto;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px 0 14px;
    min-height: var(--topbar-height);
    position: sticky;
    top: 0;
    background: inherit;
  }
  .tools {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .library {
    background: var(--sidebar);
  }
  header.library-bar {
    justify-content: flex-end;
  }
  /* The library's name, big and bold above its projects. */
  .project {
    padding: 4px 14px 10px 34px;
  }
  .project-title {
    display: block;
    max-width: 100%;
    background: none;
    border: none;
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: 8px;
    cursor: default;
    font-size: calc(24px * var(--ui-scale, 1));
    font-weight: 700;
    letter-spacing: -0.01em;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project.selected .project-title {
    background: var(--selected);
  }
  .library ul {
    padding-bottom: 12px;
  }
  .info {
    margin: 0;
    padding: 8px 14px;
    color: var(--muted);
    font-size: calc(12px * var(--ui-scale, 1));
  }
  .conflict-banner {
    margin: 6px 10px;
    padding: 6px 10px;
    font: inherit;
    font-size: calc(12px * var(--ui-scale, 1));
    text-align: left;
    border: 1px solid var(--accent);
    border-radius: 7px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--text);
  }
  .notice {
    margin: 0;
    padding: 8px 14px;
    color: var(--danger);
    font-size: calc(12px * var(--ui-scale, 1));
  }
</style>
