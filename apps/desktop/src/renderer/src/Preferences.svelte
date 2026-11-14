<script lang="ts">
  import Select from './Select.svelte'
  import {
    CHOICES,
    FONTS,
    MAX_LINE_SPACING,
    MIN_LINE_SPACING,
    MAX_FONT_SIZE,
    MIN_FONT_SIZE,
    THEMES,
    type ColorTheme,
    type ViewSettings
  } from '@writingapp/core'

  interface Props {
    view: ViewSettings
    themes: ColorTheme[]
    onrefreshthemes: () => void
    onchange: (patch: Partial<ViewSettings>) => void
    onclose: () => void
  }

  let { view, themes, onrefreshthemes, onchange, onclose }: Props = $props()

  /** Accent presets; the first keeps the theme's own colour. */
  const ACCENTS: [string, string][] = [
    ['Default', ''],
    ['Blue', '#3d6fd9'],
    ['Purple', '#8a5cd0'],
    ['Pink', '#d0488a'],
    ['Orange', '#d9722b'],
    ['Green', '#4c9a3f']
  ]

  type Choice = keyof typeof CHOICES

  /** Display names for the named choices. */
  const names: Record<Choice, Record<string, string>> = {
    columnWidth: {
      compact: 'Compact',
      narrow: 'Narrow',
      medium: 'Medium',
      wide: 'Wide',
      'extra-wide': 'Wider',
      full: 'Full'
    },
    paragraphSpacing: { compact: 'Compact', normal: 'Normal', airy: 'Airy' },
    currentLine: { off: 'Off', subtle: 'Subtle' },
    caretWidth: { thin: 'Thin', normal: 'Normal', thick: 'Thick' },
    focusScope: { line: 'Line', sentence: 'Sentence', paragraph: 'Paragraph' },
    focusDim: { light: 'Light', medium: 'Medium', strong: 'Strong' },
    typewriterPosition: { centre: 'Middle', upper: 'Upper third' },
    textAlign: { left: 'Left', justify: 'Justified' },
    sheetSort: {}
  }

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

{#snippet choice(label: string, key: Choice)}
  <div class="row">
    <span id="pref-{key}">{label}</span>
    <div class="segments" role="radiogroup" aria-labelledby="pref-{key}">
      {#each CHOICES[key] as value (value)}
        <button
          role="radio"
          aria-checked={view[key] === value}
          onclick={() => onchange({ [key]: value })}>{names[key][value]}</button
        >
      {/each}
    </div>
  </div>
{/snippet}

<div class="dlg-backdrop" role="presentation" onmousedown={onclose}>
  <div
    class="dlg dialog"
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
        <span id="pref-accent">Accent colour</span>
        <div class="swatches" role="radiogroup" aria-labelledby="pref-accent">
          {#each ACCENTS as [name, hex] (name)}
            <button
              role="radio"
              class="swatch"
              style:background={hex || 'var(--accent)'}
              aria-label={name}
              title={name}
              aria-checked={view.accent === hex}
              onclick={() => onchange({ accent: hex })}
            ></button>
          {/each}
          <input
            type="color"
            aria-label="Custom accent colour"
            value={view.accent || '#2f6f6a'}
            onchange={(e) => onchange({ accent: e.currentTarget.value })}
          />
        </div>
      </div>
      <div class="row">
        <span>Colour theme<small>Theme files live in a folder you can open</small></span>
        <div class="theme-pick">
          <Select label="Colour theme" value={view.colorTheme} options={[{ value: '', label: 'None' }, ...themes.map((t) => ({ value: t.id, label: t.name }))]} onchange={(colorTheme) => onchange({ colorTheme })} />
          <button
            class="link"
            onclick={async () => {
              await window.api.openThemesFolder()
              onrefreshthemes()
            }}>Open folder</button
          >
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
      <h3>Page</h3>
      {@render choice('Text column', 'columnWidth')}
      <div class="row">
        <span id="pref-spacing">Line spacing</span>
        <div class="stepper" role="group" aria-labelledby="pref-spacing">
          <button
            aria-label="Tighter"
            disabled={view.lineSpacing <= MIN_LINE_SPACING}
            onclick={() => onchange({ lineSpacing: view.lineSpacing - 0.1 })}>−</button
          >
          <output>{view.lineSpacing.toFixed(2)}</output>
          <button
            aria-label="Looser"
            disabled={view.lineSpacing >= MAX_LINE_SPACING}
            onclick={() => onchange({ lineSpacing: view.lineSpacing + 0.1 })}>+</button
          >
        </div>
      </div>
      <label class="row">
        <span>Indent paragraphs<small>Indent each paragraph and close the gaps between them, in the editor and in exports</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.paragraphIndent}
          onchange={(e) => onchange({ paragraphIndent: e.currentTarget.checked })}
        />
      </label>
      {#if !view.paragraphIndent}
        {@render choice('Space between paragraphs', 'paragraphSpacing')}
      {/if}
      <label class="row">
        <span>Hang heading marks<small>Keep the # in the margin so headings line up with the text</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.hangHeadings}
          onchange={(e) => onchange({ hangHeadings: e.currentTarget.checked })}
        />
      </label>
      <label class="row">
        <span>Hide Markdown marks<small>Hide ** and # and link addresses except on the line you are editing</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.hideMarkers}
          onchange={(e) => onchange({ hideMarkers: e.currentTarget.checked })}
        />
      </label>
      {@render choice('Alignment', 'textAlign')}
      {@render choice('Cursor width', 'caretWidth')}
      {@render choice('Highlight current line', 'currentLine')}
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
      {@render choice('Focus on', 'focusScope')}
      {@render choice('Fade the rest', 'focusDim')}
      <label class="row">
        <span>Typewriter scrolling<small>Keep the line being written in the middle</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.typewriter}
          onchange={(e) => onchange({ typewriter: e.currentTarget.checked })}
        />
      </label>
      {@render choice('Typewriter line sits', 'typewriterPosition')}
      <label class="row">
        <span>Scroll past the end<small>Leave room below the last line</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.scrollPastEnd}
          onchange={(e) => onchange({ scrollPastEnd: e.currentTarget.checked })}
        />
      </label>
      <label class="row">
        <span>Smart punctuation<small>Curly quotes, – and — dashes, and … as you type</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.smartTypography}
          onchange={(e) => onchange({ smartTypography: e.currentTarget.checked })}
        />
      </label>
      <label class="row">
        <span>Line numbers<small>Show a number beside each line of a sheet</small></span>
        <input
          type="checkbox"
          class="switch"
          checked={view.lineNumbers}
          onchange={(e) => onchange({ lineNumbers: e.currentTarget.checked })}
        />
      </label>
    </section>
  </div>
</div>

<style>
  .swatches,
  .theme-pick {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
    outline: 1px solid var(--border);
    outline-offset: 1px;
  }
  .swatch[aria-checked='true'] {
    border-color: var(--bg);
    outline: 2px solid var(--text);
  }
  .swatches input[type='color'] {
    width: 26px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 13px;
    padding: 0;
  }
  .dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: 84vh;
    overflow-y: auto;
    padding: 6px 20px 14px;
  }
  header {
    display: flex;
    align-items: center;
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
