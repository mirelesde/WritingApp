<script lang="ts">
  /** A quiet line-icon button for the pane headers. */
  export type Icon =
    | 'sidebar'
    | 'back'
    | 'forward'
    | 'new-sheet'
    | 'new-group'
    | 'search'
    | 'bold'
    | 'italic'
    | 'link'
    | 'outline'
    | 'export'

  interface Props {
    icon: Icon
    label: string
    /** Shown in the tooltip, e.g. the shortcut. */
    hint?: string
    pressed?: boolean
    disabled?: boolean
    onclick: () => void
  }

  let { icon, label, hint, pressed, disabled = false, onclick }: Props = $props()

  /** Clicking a button must not take focus (or the selection) away from the editor. */
  function keepFocus(e: MouseEvent): void {
    e.preventDefault()
  }
</script>

<button
  class="tool"
  title={hint ? `${label} (${hint})` : label}
  aria-label={label}
  aria-pressed={pressed}
  {disabled}
  tabindex="-1"
  onmousedown={keepFocus}
  {onclick}
>
  {#if icon === 'bold' || icon === 'italic'}
    <span class="letter" class:bold={icon === 'bold'} class:italic={icon === 'italic'}>
      {icon === 'bold' ? 'B' : 'I'}
    </span>
  {:else}
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {#if icon === 'sidebar'}
        <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
        <path d="M8 3.5v13" />
      {:else if icon === 'back'}
        <path d="M12 4.5L6.5 10l5.5 5.5" />
      {:else if icon === 'forward'}
        <path d="M8 4.5L13.5 10 8 15.5" />
      {:else if icon === 'new-sheet'}
        <path d="M11 3H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V8" />
        <path d="M11 3l4.5 4.5" />
        <path d="M16.5 2.5l1.5 1.5-5.5 5.5-2.2.7.7-2.2z" />
      {:else if icon === 'new-group'}
        <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3l1.5 1.8h6A1.5 1.5 0 0 1 16.5 8.3V14A1.5 1.5 0 0 1 15 15.5H4.5A1.5 1.5 0 0 1 3 14z" />
        <path d="M10 9.5v3.5M8.25 11.25h3.5" />
      {:else if icon === 'search'}
        <circle cx="8.5" cy="8.5" r="5" />
        <path d="M12.3 12.3L17 17" />
      {:else if icon === 'link'}
        <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.9.9" />
        <path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.9-.9" />
      {:else if icon === 'outline'}
        <path d="M3.5 5h13M6.5 10h10M9.5 15h7" />
      {:else if icon === 'export'}
        <path d="M6.5 7H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14 7h-.5" />
        <path d="M10 12.5V3M6.8 6.2L10 3l3.2 3.2" />
      {/if}
    </svg>
  {/if}
</button>

<style>
  .tool {
    width: 30px;
    height: 28px;
    display: grid;
    place-items: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: default;
    padding: 0;
  }
  .tool:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .tool[aria-pressed='true'] {
    color: var(--accent);
  }
  .tool:disabled {
    opacity: 0.35;
  }
  .tool:focus-visible {
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
