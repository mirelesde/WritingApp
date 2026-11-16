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
      class:dirty={hasChanges(path)}
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
        title={path === '' ? 'New tab' : (titles.get(path) ?? path)}
        onclick={() => onshow(i)}
        onauxclick={(e) => {
          if (e.button === 1) onclose(i)
        }}
      >
        {path === '' ? 'New tab' : (titles.get(path) ?? 'Untitled')}
      </button>
      <button class="tab-close" aria-label={hasChanges(path) ? 'Close tab, unsaved changes' : 'Close tab'} onclick={() => onclose(i)}>
        <span class="x">×</span>
        <span class="dot"></span>
      </button>
    </div>
  {/each}
  <button class="tab-new" aria-label="New tab" title="New tab ({keyMod}T)" onclick={onnew}>+</button>
</div>

<style>
  /* VS Code's tab strip: a darker bar, square tabs divided by thin lines, and the front tab
     on the editor's own colour with a line along its top. */
  .tabs {
    display: flex;
    align-items: stretch;
    padding: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    user-select: none;
    background: var(--sidebar);
    border-bottom: 1px solid var(--border);
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 1 180px;
    min-width: 90px;
    height: 35px;
    box-sizing: border-box;
    border-right: 1px solid var(--border);
    color: var(--muted);
    background: var(--sidebar);
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.active {
    margin-bottom: -1px;
    height: 36px;
    color: var(--text);
    background: var(--bg);
  }
  .tab.before::before,
  .tab.after::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
  }
  .tab.before::before {
    left: -1px;
  }
  .tab.after::after {
    right: -1px;
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
    align-self: stretch;
    min-width: 0;
    padding: 0 4px 0 12px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab.dirty .tab-label {
    font-style: italic;
  }
  .tab-close {
    position: relative;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    margin-right: 6px;
    padding: 0;
    border-radius: 4px;
    line-height: 1;
    opacity: 0;
  }
  .tab-close > * {
    grid-area: 1 / 1;
  }
  .tab:hover .tab-close,
  .tab.active .tab-close,
  .tab.dirty .tab-close,
  .tab-close:focus-visible {
    opacity: 0.7;
  }
  .tab-close:hover {
    opacity: 1;
    background: var(--hover);
  }
  /* An unsaved tab shows a dot where the close mark goes, and the mark on hover. */
  .dot {
    display: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  .tab.dirty .dot {
    display: block;
  }
  .tab.dirty .x {
    display: none;
  }
  .tab.dirty:hover .dot,
  .tab.dirty .tab-close:focus-visible .dot {
    display: none;
  }
  .tab.dirty:hover .x,
  .tab.dirty .tab-close:focus-visible .x {
    display: block;
  }
  /* The new-tab button shows only while the pointer is over the bar. */
  .tabs .tab-new {
    flex-shrink: 0;
    padding: 0 12px;
    color: var(--muted);
    opacity: 0;
  }
  .tabs:hover .tab-new,
  .tabs .tab-new:focus-visible {
    opacity: 1;
  }
  .tabs .tab-new:hover {
    color: var(--text);
  }
</style>
