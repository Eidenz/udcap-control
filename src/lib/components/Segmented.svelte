<script lang="ts">
  let {
    value = $bindable(),
    options,
    onchange,
  }: { value: string; options: string[]; onchange?: (v: string) => void } = $props();

  function pick(o: string) {
    value = o;
    onchange?.(o);
  }
</script>

<div class="seg">
  {#each options as o}
    <button type="button" class="segbtn" class:active={value === o} onclick={() => pick(o)}>{o}</button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    background: var(--surface-2);
    border-radius: var(--radius-pill);
    padding: 3px;
    gap: 2px;
  }
  .segbtn {
    padding: 7px 18px;
    border-radius: var(--radius-pill);
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    transition:
      background 0.14s var(--ease),
      color 0.14s var(--ease);
  }
  .segbtn:hover {
    color: var(--on-surface);
  }
  .segbtn.active {
    background: var(--primary);
    color: var(--on-primary);
  }
</style>
