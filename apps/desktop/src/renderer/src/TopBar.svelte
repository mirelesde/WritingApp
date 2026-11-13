<script lang="ts">
  interface Props {
    sidebarCollapsed: boolean
    /** True when a sheet is open, so formatting and export have something to act on. */
    canFormat: boolean
    onsidebar: () => void
    onnew: () => void
    onsearch: () => void
    onformat: (kind: 'bold' | 'italic' | 'link') => void
    onexport: () => void
  }

  let { sidebarCollapsed, canFormat, onsidebar, onnew, onsearch, onformat, onexport }: Props =
    $props()

  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'
  const shift = navigator.platform.startsWith('Mac') ? '⇧' : 'Shift+'

  /** Clicking a button must not take focus (or the selection) away from the editor. */
  function keepFocus(e: MouseEvent): void {
    e.preventDefault()
  }
</script>

<div class="bar" role="toolbar" aria-label="Toolbar">
  <div class="group">
    <button
      title="{sidebarCollapsed ? 'Show' : 'Hide'} sidebar ({mod}\)"
      aria-label="{sidebarCollapsed ? 'Show' : 'Hide'} sidebar"
      aria-pressed={sidebarCollapsed}
      onmousedown={keepFocus}
      onclick={onsidebar}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        <path d="M8 3.5v13" />
        {#if !sidebarCollapsed}<path d="M4.2 7h2.1M4.2 9.5h2.1M4.2 12h2.1" />{/if}
      </svg>
    </button>
    <button
      title="New sheet ({mod}N)"
      aria-label="New sheet"
      onmousedown={keepFocus}
      onclick={onnew}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M11 3H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V8" />
        <path d="M11 3l4.5 4.5" />
        <path d="M16.5 2.5l1.5 1.5-5.5 5.5-2.2.7.7-2.2z" />
      </svg>
    </button>
    <button
      title="Find in library ({mod}{shift}F)"
      aria-label="Find in library"
      onmousedown={keepFocus}
      onclick={onsearch}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5" />
        <path d="M12.3 12.3L17 17" />
      </svg>
    </button>
  </div>

  <div class="group">
    <button
      title="Bold ({mod}B)"
      aria-label="Bold"
      disabled={!canFormat}
      onmousedown={keepFocus}
      onclick={() => onformat('bold')}
    >
      <span class="letter bold">B</span>
    </button>
    <button
      title="Italic ({mod}I)"
      aria-label="Italic"
      disabled={!canFormat}
      onmousedown={keepFocus}
      onclick={() => onformat('italic')}
    >
      <span class="letter italic">I</span>
    </button>
    <button
      title="Link ({mod}K)"
      aria-label="Link"
      disabled={!canFormat}
      onmousedown={keepFocus}
      onclick={() => onformat('link')}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" />
        <path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" />
      </svg>
    </button>
  </div>

  <div class="group right">
    <button
      title="Export ({mod}E)"
      aria-label="Export"
      onmousedown={keepFocus}
      onclick={onexport}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6.5 7H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14 7h-.5" />
        <path d="M10 12.5V3M6.8 6.2L10 3l3.2 3.2" />
      </svg>
    </button>
  </div>
</div>

<style>
  .bar {
    height: var(--topbar-height);
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0 8px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    user-select: none;
  }
  .group {
    display: flex;
    gap: 2px;
  }
  .right {
    justify-content: flex-end;
  }
  button {
    width: 30px;
    height: 28px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: default;
  }
  button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  button[aria-pressed='true'] {
    color: var(--accent);
  }
  button:disabled {
    opacity: 0.35;
  }
  button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .letter {
    font-family: Georgia, serif;
    font-size: 16px;
    line-height: 1;
  }
  .bold {
    font-weight: 700;
  }
  .italic {
    font-style: italic;
  }
</style>
