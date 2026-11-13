<script lang="ts">
  import {
    FONTS,
    MAX_FONT_SIZE,
    MIN_FONT_SIZE,
    THEMES,
    type ViewSettings
  } from '@writingapp/core'

  interface Props {
    view: ViewSettings
    onchange: (patch: Partial<ViewSettings>) => void
    onclose: () => void
  }

  let { view, onchange, onclose }: Props = $props()

  const themeNames: Record<(typeof THEMES)[number], string> = {
    system: 'Match system',
    light: 'Light',
    dark: 'Dark'
  }
  const fontNames: Record<(typeof FONTS)[number], string> = {
    serif: 'Serif',
    sans: 'Sans',
    mono: 'Mono'
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
    }
  }

  function focusDialog(node: HTMLElement): void {
    node.focus()
  }
</script>

<div class="backdrop" role="presentation" onmousedown={onclose}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-label="Preferences"
    tabindex="-1"
    use:focusDialog
    onmousedown={(e) => e.stopPropagation()}
    onkeydown={keydown}
  >
    <header>
      <h2>Preferences</h2>
      <button class="close" aria-label="Close" onclick={onclose}>×</button>
    </header>

    <section>
      <h3>Appearance</h3>
      <div class="row">
        <span id="pref-theme">Theme</span>
        <div class="segments" role="radiogroup" aria-labelledby="pref-theme">
          {#each THEMES as theme (theme)}
            <button
              role="radio"
              aria-checked={view.theme === theme}
              onclick={() => onchange({ theme })}>{themeNames[theme]}</button
            >
          {/each}
        </div>
      </div>
      <div class="row">
        <span id="pref-font">Editor font</span>
        <div class="segments" role="radiogroup" aria-labelledby="pref-font">
          {#each FONTS as font (font)}
            <button
              role="radio"
              aria-checked={view.font === font}
              onclick={() => onchange({ font })}>{fontNames[font]}</button
            >
          {/each}
        </div>
      </div>
      <div class="row">
        <span id="pref-size">Text size</span>
        <div class="stepper" role="group" aria-labelledby="pref-size">
          <button
            aria-label="Smaller"
            disabled={view.fontSize <= MIN_FONT_SIZE}
            onclick={() => onchange({ fontSize: view.fontSize - 1 })}>−</button
          >
          <output>{view.fontSize} px</output>
          <button
            aria-label="Larger"
            disabled={view.fontSize >= MAX_FONT_SIZE}
            onclick={() => onchange({ fontSize: view.fontSize + 1 })}>+</button
          >
        </div>
      </div>
    </section>

    <section>
      <h3>Writing</h3>
      <label class="row">
        <span>Focus mode<small>Dim everything but the paragraph being written</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.focusMode}
          onchange={(e) => onchange({ focusMode: e.currentTarget.checked })}
        />
      </label>
      <label class="row">
        <span>Typewriter scrolling<small>Keep the line being written in the middle</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.typewriter}
          onchange={(e) => onchange({ typewriter: e.currentTarget.checked })}
        />
      </label>
    </section>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 10vh;
    background: rgb(0 0 0 / 0.25);
    z-index: 40;
  }
  .dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: 80vh;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.3);
    padding: 6px 20px 14px;
    outline: none;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0 4px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
  }
  h3 {
    margin: 14px 0 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .close {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: none;
    font-size: 18px;
    line-height: 1;
    color: var(--muted);
  }
  .close:hover {
    background: var(--hover);
    color: var(--text);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .row:last-child {
    border-bottom: none;
  }
  small {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: var(--muted);
  }
  .segments {
    display: flex;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    border-radius: 8px;
    padding: 2px;
  }
  .segments button,
  .stepper button {
    font: inherit;
    font-size: 13px;
    color: var(--text);
    background: none;
    border: none;
    border-radius: 6px;
    padding: 4px 11px;
  }
  .segments button[aria-checked='true'] {
    background: var(--bg);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .stepper button {
    width: 28px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }
  .stepper button:disabled {
    opacity: 0.35;
  }
  output {
    min-width: 52px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .switch {
    appearance: none;
    flex: none;
    width: 36px;
    height: 20px;
    margin: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 20%, transparent);
    position: relative;
    transition: background 120ms;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 120ms;
  }
  .switch:checked {
    background: var(--accent);
  }
  .switch:checked::after {
    transform: translateX(16px);
  }
  button:focus-visible,
  .switch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
