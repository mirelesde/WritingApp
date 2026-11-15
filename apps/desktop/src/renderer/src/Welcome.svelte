<script lang="ts">
  /** The first screen: blank while the library loads, then an invitation to choose a folder. */
  let { loading = false, onchoose }: { loading?: boolean; onchoose?: () => void } = $props()
</script>

<main class="empty">
  {#if !loading}
    <h1>WritingApp</h1>
    <p>
      Choose a folder to use as your library. Its folders become projects and groups, and its
      Markdown files become sheets.
    </p>
    <button class="primary" onclick={onchoose}>Choose library folder…</button>
  {/if}
</main>

<style>
  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
  }
  .empty h1 {
    margin: 0;
    font-size: 1.25rem;
  }
  .empty p {
    margin: 0;
    max-width: 380px;
    color: var(--muted);
    line-height: 1.5;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border: none;
    border-radius: var(--radius-sm);
    font-size: 13px;
    padding: 5px 12px;
    cursor: default;
  }
</style>
