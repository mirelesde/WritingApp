<script lang="ts">
  import type { SaveStatus } from './autosave'
  import type { FormatKind } from './blockStyle'
  import SaveIndicator from './SaveIndicator.svelte'
  import ToolButton from './ToolButton.svelte'

  interface Props {
    sidebarCollapsed: boolean
    sheetsCollapsed: boolean
    outlineOpen: boolean
    canBack: boolean
    canForward: boolean
    /** True while the Find bar is open. */
    finding: boolean
    /** A sheet is open, so the formatting buttons apply. */
    hasSheet: boolean
    styleOpen: boolean
    styleNow: string
    styles: { kind: FormatKind; label: string; hint?: string; keys?: string }[][]
    showSave: boolean
    saveStatus: SaveStatus
    auto: boolean
    keyMod: string
    ontogglesidebar: () => void
    ontogglesheets: () => void
    ontoggleoutline: () => void
    onstep: (direction: -1 | 1) => void
    ontogglefind: () => void
    onformat: (kind: 'bold' | 'italic' | 'link') => void
    oninsertimage: () => void
    onstylemenu: () => void
    onstyleclose: () => void
    onstyle: (kind: FormatKind) => void
    onexport: () => void
  }

  let {
    sidebarCollapsed,
    sheetsCollapsed,
    outlineOpen,
    canBack,
    canForward,
    finding,
    hasSheet,
    styleOpen,
    styleNow,
    styles,
    showSave,
    saveStatus,
    auto,
    keyMod,
    ontogglesidebar,
    ontogglesheets,
    ontoggleoutline,
    onstep,
    ontogglefind,
    onformat,
    oninsertimage,
    onstylemenu,
    onstyleclose,
    onstyle,
    onexport
  }: Props = $props()
</script>

<div class="editor-bar" role="toolbar" aria-label="Editor tools">
  <span class="tools">
    {#if sidebarCollapsed}
      <ToolButton icon="sidebar" label="Show sidebar" hint={keyMod + "\\"} onclick={ontogglesidebar} />
    {/if}
    <ToolButton
      icon={sheetsCollapsed ? 'shrink' : 'expand'}
      label={sheetsCollapsed ? 'Show sheet list' : 'Hide sheet list'}
      onclick={ontogglesheets}
    />
    <ToolButton icon="back" label="Back" hint="{keyMod}[" disabled={!canBack} onclick={() => onstep(-1)} />
    <ToolButton icon="forward" label="Forward" hint="{keyMod}]" disabled={!canForward} onclick={() => onstep(1)} />
    <ToolButton icon="search" label="Find" hint="{keyMod}F" pressed={finding} onclick={ontogglefind} />
  </span>
  <span class="tools">
    <ToolButton icon="bold" label="Bold" hint="{keyMod}B" disabled={!hasSheet} onclick={() => onformat('bold')} />
    <ToolButton icon="italic" label="Italic" hint="{keyMod}I" disabled={!hasSheet} onclick={() => onformat('italic')} />
    <ToolButton icon="link" label="Link" hint="{keyMod}K" disabled={!hasSheet} onclick={() => onformat('link')} />
    <ToolButton icon="image" label="Insert image" hint="{keyMod}⌥I" disabled={!hasSheet} onclick={oninsertimage} />
    <span class="style-wrap">
      <ToolButton icon="style" label="Styles" pressed={styleOpen} disabled={!hasSheet} onclick={onstylemenu} />
      {#if styleOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="scrim" onmousedown={onstyleclose}></div>
        <div class="style-menu" role="menu" tabindex="-1" aria-label="Styles" onmousedown={(e) => e.preventDefault()}>
          {#each styles as group, i (i)}
            {#if i > 0}<hr />{/if}
            {#each group as item (item.kind)}
              <button role="menuitem" class:current={item.kind === styleNow} onclick={() => onstyle(item.kind)}>
                <span>{item.label}</span>
                {#if item.hint}<kbd>{keyMod}⌥{item.hint}</kbd>{:else if item.keys}<kbd>{keyMod}{item.keys}</kbd>{/if}
              </button>
            {/each}
          {/each}
        </div>
      {/if}
    </span>
  </span>
  <span class="tools right">
    {#if showSave}<SaveIndicator status={saveStatus} {auto} />{/if}
    <ToolButton icon="outline" label="{outlineOpen ? 'Hide' : 'Show'} outline" hint="{keyMod}⌥O" pressed={outlineOpen} onclick={ontoggleoutline} />
    <ToolButton icon="export" label="Export" hint="{keyMod}E" onclick={onexport} />
  </span>
</div>

<style>
  .editor-bar {
    grid-column: 1;
    grid-row: 1;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 10px;
    user-select: none;
  }
  .tools {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .style-wrap {
    position: relative;
  }
  .tools.right {
    justify-content: flex-end;
  }
</style>
