<script lang="ts">
  let {
    value = $bindable(),
    options,
    onchange,
    full = false,
  }: { value: string; options: string[]; onchange?: (v: string) => void; full?: boolean } = $props();

  function pick(o: string) {
    if (o === value) return;
    value = o;
    onchange?.(o);
  }
</script>

<div class="seg" class:full>
  {#each options as o}
    <button type="button" class="segbtn" class:active={value === o} aria-pressed={value === o} onclick={() => pick(o)}>{o}</button>
  {/each}
</div>

<style>
  .seg {
    display: inline-grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 2px;
    padding: 3px;
    background: #0a0a0c;
    border: 1px solid #222227;
    border-radius: 9px;
    flex: none;
  }
  .seg.full {
    display: grid;
    width: 100%;
  }
  .segbtn {
    height: 28px;
    padding: 0 12px;
    border-radius: 6px;
    color: var(--text-3);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    transition: background 0.15s var(--ease), color 0.15s var(--ease);
  }
  .segbtn:hover {
    color: var(--text);
  }
  .segbtn.active {
    background: var(--control);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }
</style>
