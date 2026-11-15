<script lang="ts">
  import type { SaveStatus } from './autosave'

  /** `auto` is false when autosave is off: then waiting text is "Unsaved" rather than about to be saved. */
  let { status, auto = true }: { status: SaveStatus; auto?: boolean } = $props()

  /** A save finishes in milliseconds; the spinner stays at least this long so it can be seen. */
  const MIN_SPIN_MS = 700

  let shown = $state<'saving' | 'saved' | 'unsaved' | 'error'>('saved')
  let spinningSince = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  $effect(() => {
    const next = status === 'error' ? 'error' : status === 'saved' ? 'saved' : status === 'unsaved' && !auto ? 'unsaved' : 'saving'
    clearTimeout(timer)
    if (next === 'saving') {
      if (shown !== 'saving') spinningSince = Date.now()
      shown = 'saving'
    } else if (shown === 'saving' && next === 'saved') {
      const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - spinningSince))
      timer = setTimeout(() => (shown = 'saved'), wait)
    } else {
      shown = next
    }
    return () => clearTimeout(timer)
  })
</script>

<span class="indicator" class:problem={shown === 'error'} role="status" aria-live="polite">
  {#if shown === 'saving'}
    <svg class="spin" viewBox="0 0 16 16" aria-hidden="true">
      <circle class="track" cx="8" cy="8" r="6" />
      <path d="M8 2a6 6 0 0 1 6 6" />
    </svg>
    <span>{auto ? 'Autosaving' : 'Saving'}</span>
  {:else if shown === 'unsaved'}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
    </svg>
    <span>Unsaved</span>
  {:else if shown === 'saved'}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
    <span>Saved</span>
  {:else}
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.5v5M8 11.5v.01" />
    </svg>
    <span>{auto ? 'Could not save — retrying' : 'Could not save'}</span>
  {/if}
</span>

<style>
  .indicator {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-right: 6px;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    user-select: none;
  }
  .indicator.problem {
    color: var(--danger);
  }
  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .track {
    opacity: 0.25;
  }
  .spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation-duration: 2.4s;
    }
  }
</style>
