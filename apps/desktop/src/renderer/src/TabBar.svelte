<script lang="ts">
  interface Props {
    paths: string[]
    active: number
    /** Where a dragged tab would land, as an index into `paths`, or null. */
    hint: number | null
    titles: Map<string, string>
    keyMod: string
    hasChanges: (path: string) => boolean
    onshow: (i: number) => void
    onclose: (i: number) => void
    onnew: () => void
    ondragstart: (i: number, e: DragEvent) => void
    ondragend: (e: DragEvent) => void
  }

  let { paths, active, hint, titles, keyMod, hasChanges, onshow, onclose, onnew, ondragstart, ondragend }: Props =
    $props()
</script>

<div class="tabs" role="tablist" aria-label="Open sheets">
  {#each paths as path, i (i)}
    <div
      class="tab"
      class:active={i === active}
      class:before={hint === i}
      class:after={hint === paths.length && i === paths.length - 1}
      data-tab={i}
      draggable="true"
      role="presentation"
      ondragstart={(e) => ondragstart(i, e)}
      {ondragend}
    >
      <button
        class="tab-label"
        role="tab"
        aria-selected={i === active}
        title={titles.get(path) ?? path}
        onclick={() => onshow(i)}
        onauxclick={(e) => {
          if (e.button === 1) onclose(i)
        }}
      >
        {#if hasChanges(path)}<span class="tab-dot" role="img" aria-label="Unsaved changes"></span>{/if}
        {titles.get(path) ?? 'Untitled'}
      </button>
      <button class="tab-close" aria-label="Close tab" onclick={() => onclose(i)}>×</button>
    </div>
  {/each}
  <button class="tab-new" aria-label="New tab" title="New tab ({keyMod}T)" onclick={onnew}>+</button>
</div>

<style>
  .tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 10px 4px;
    overflow-x: auto;
    user-select: none;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    display: flex;
    align-items: center;
    flex: 0 1 180px;
    min-width: 90px;
    border-bottom: 2px solid transparent;
    color: var(--muted);
  }
  .tab {
    position: relative;
  }
  .tab.before::before,
  .tab.after::after {
    content: '';
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: 2px;
    border-radius: 1px;
    background: var(--accent);
  }
  .tab.before::before {
    left: -2px;
  }
  .tab.after::after {
    right: -2px;
  }
  .tab-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 6px;
    border-radius: 50%;
    background: var(--accent);
    vertical-align: 1px;
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.active {
    border-bottom-color: var(--accent);
    color: var(--text);
  }
  .tab button,
  .tabs .tab-new {
    font: inherit;
    font-size: 13px;
    color: inherit;
    background: transparent;
    border: 0;
    cursor: default;
  }
  .tab-label {
    flex: 1;
    min-width: 0;
    padding: 4px 4px 4px 10px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab-close {
    padding: 2px 7px;
    opacity: 0;
  }
  .tab:hover .tab-close,
  .tab.active .tab-close,
  .tab-close:focus-visible {
    opacity: 0.7;
  }
  .tab-close:hover {
    opacity: 1;
    background: var(--border);
  }
  .tabs .tab-new {
    flex-shrink: 0;
    padding: 2px 9px;
    color: var(--muted);
  }
  .tabs .tab-new:hover {
    color: var(--text);
  }
</style>
