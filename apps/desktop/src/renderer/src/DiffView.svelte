<script lang="ts">
  import { changeCount, diffHunks, diffWords, mergeHunks } from '@writingapp/core'

  interface Props {
    /** The left-hand text and its heading. */
    a: string
    b: string
    labelA: string
    labelB: string
    /** Which side each difference starts on. */
    start?: 'a' | 'b'
    /** The text with the chosen side of every difference; kept up to date. */
    result?: string
    /** How many differences are set to the right-hand side. */
    chosenB?: number
  }

  let { a, b, labelA, labelB, start = 'a', result = $bindable(''), chosenB = $bindable(0) }: Props = $props()

  const hunks = $derived(diffHunks(a, b))
  const total = $derived(changeCount(hunks))
  // Reset whenever the texts change; clicking a button overwrites it.
  let picks = $derived<('a' | 'b')[]>(Array.from({ length: total }, () => start))

  $effect(() => {
    result = mergeHunks(hunks, picks.length === total ? picks : Array.from({ length: total }, () => start))
    chosenB = picks.filter((p) => p === 'b').length
  })

  /** Unchanged stretches longer than this are folded to their edges. */
  const CONTEXT = 2
  let open = $state<Record<number, boolean>>({})

  interface Row {
    kind: 'same' | 'fold' | 'change'
    lines?: string[]
    hidden?: number
    index?: number
    n?: number
    a?: { text: string; changed: boolean }[]
    b?: { text: string; changed: boolean }[]
    hasA?: boolean
    hasB?: boolean
  }

  const rows = $derived.by(() => {
    const out: Row[] = []
    let n = 0
    hunks.forEach((h, index) => {
      if (h.kind === 'change') {
        const words = diffWords(h.a.join('\n'), h.b.join('\n'))
        out.push({ kind: 'change', n: n++, index, a: words.a, b: words.b, hasA: h.a.length > 0, hasB: h.b.length > 0 })
      } else if (h.lines.length > CONTEXT * 2 + 2 && !open[index]) {
        const first = index === 0
        const last = index === hunks.length - 1
        const head = first ? 0 : CONTEXT
        const tail = last ? 0 : CONTEXT
        if (head) out.push({ kind: 'same', lines: h.lines.slice(0, head) })
        out.push({ kind: 'fold', index, hidden: h.lines.length - head - tail })
        if (tail) out.push({ kind: 'same', lines: h.lines.slice(h.lines.length - tail) })
      } else {
        out.push({ kind: 'same', lines: h.lines })
      }
    })
    return out
  })

  function pick(n: number, side: 'a' | 'b'): void {
    picks = picks.map((p, i) => (i === n ? side : p))
  }
  function setAll(side: 'a' | 'b'): void {
    picks = picks.map(() => side)
  }
</script>

<div class="diff">
  <div class="bar">
    <span>{total === 0 ? 'The two versions are identical.' : `${total} difference${total === 1 ? '' : 's'}`}</span>
    {#if total > 1}
      <span class="all">
        Take all from <button onclick={() => setAll('a')}>{labelA}</button>
        <button onclick={() => setAll('b')}>{labelB}</button>
      </span>
    {/if}
  </div>
  <div class="heads"><span>{labelA}</span><span>{labelB}</span></div>
  <div class="rows" role="list">
    {#each rows as row, i (i)}
      {#if row.kind === 'same'}
        <div class="same" role="listitem">{row.lines?.join('\n')}</div>
      {:else if row.kind === 'fold'}
        <button class="fold" onclick={() => (open[row.index ?? 0] = true)}>
          {row.hidden} unchanged line{row.hidden === 1 ? '' : 's'} — show
        </button>
      {:else}
        {@const n = row.n ?? 0}
        <div class="change" role="listitem">
          <div class="side a" class:chosen={picks[n] === 'a'} class:empty={!row.hasA}>
            <pre>{#if row.hasA}{#each row.a ?? [] as seg, k (k)}<span class:mark={seg.changed}>{seg.text}</span>{/each}{:else}(nothing){/if}</pre>
            <button class="choose" aria-pressed={picks[n] === 'a'} onclick={() => pick(n, 'a')}>
              {picks[n] === 'a' ? '✓ Using this' : 'Use this'}
            </button>
          </div>
          <div class="side b" class:chosen={picks[n] === 'b'} class:empty={!row.hasB}>
            <pre>{#if row.hasB}{#each row.b ?? [] as seg, k (k)}<span class:mark={seg.changed}>{seg.text}</span>{/each}{:else}(nothing){/if}</pre>
            <button class="choose" aria-pressed={picks[n] === 'b'} onclick={() => pick(n, 'b')}>
              {picks[n] === 'b' ? '✓ Using this' : 'Use this'}
            </button>
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .diff {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 6px;
  }
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    color: var(--muted);
  }
  .all button {
    font: inherit;
    font-size: 12px;
    padding: 2px 8px;
    margin-left: 4px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--hover);
    color: var(--text);
  }
  .heads {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    font-size: 13px;
    font-weight: 600;
  }
  .rows {
    height: 44vh;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--list);
    font: 13px/1.5 ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  }
  .same {
    padding: 2px 10px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--muted);
  }
  .fold {
    display: block;
    width: 100%;
    font: inherit;
    font-size: 12px;
    text-align: center;
    padding: 3px;
    border: 0;
    border-block: 1px dashed var(--border);
    background: transparent;
    color: var(--muted);
  }
  .change {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    margin: 4px 0;
    background: var(--border);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 10px;
    background: var(--list);
    opacity: 0.6;
  }
  .side.chosen {
    opacity: 1;
    background: color-mix(in srgb, var(--accent) 10%, var(--list));
  }
  .side.empty pre {
    font-style: italic;
    color: var(--muted);
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font: inherit;
  }
  .mark {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 2px;
  }
  .choose {
    align-self: flex-start;
    font: inherit;
    font-size: 12px;
    padding: 1px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--hover);
    color: var(--text);
  }
  .side.chosen .choose {
    border-color: var(--accent);
  }
</style>
