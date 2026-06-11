<script lang="ts">
  let {
    value = $bindable(),
    options,
    onchange,
    compact = false,
  }: { value: string; options: string[]; onchange?: (v: string) => void; compact?: boolean } = $props();

  let open = $state(false);

  function pick(o: string) {
    value = o;
    open = false;
    onchange?.(o);
  }
</script>

<div class="select" class:compact>
  <button type="button" class="trigger state-layer" class:open onclick={() => (open = !open)}>
    <span>{value}</span>
    <svg class="arrow" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="m7 10 5 5 5-5z" /></svg>
  </button>
  {#if open}
    <button type="button" class="backdrop" aria-label="Close" onclick={() => (open = false)}></button>
    <ul class="menu">
      {#each options as o}
        <li>
          <button type="button" class="opt state-layer" class:sel={o === value} onclick={() => pick(o)}>
            <span>{o}</span>
            {#if o === value}
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .select {
    position: relative;
  }
  .trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 180px;
    height: 40px;
    padding: 0 8px 0 14px;
    background: var(--surface-2);
    border: 1px solid var(--outline-dim);
    border-radius: var(--radius-s);
    color: var(--on-surface);
    font-size: 14px;
    font-weight: 600;
  }
  .trigger.open {
    border-color: var(--primary);
  }
  .compact .trigger {
    min-width: 0;
    width: 100%;
    height: 34px;
    padding: 0 6px 0 10px;
    font-size: 13px;
  }
  .arrow {
    color: var(--muted);
    transition: transform 0.15s var(--ease);
  }
  .trigger.open .arrow {
    transform: rotate(180deg);
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: none;
    border: none;
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 100%;
    z-index: 11;
    list-style: none;
    margin: 0;
    padding: 6px;
    background: var(--surface-3);
    border: 1px solid var(--outline-dim);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-2);
  }
  .opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    width: 100%;
    height: 38px;
    padding: 0 12px;
    border-radius: var(--radius-s);
    color: var(--on-surface-var);
    font-size: 14px;
    text-align: left;
    white-space: nowrap;
  }
  .opt.sel {
    color: var(--primary);
    font-weight: 600;
  }
</style>
