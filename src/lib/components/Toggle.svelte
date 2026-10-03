<script lang="ts">
  let {
    checked = false,
    label,
    onchange,
  }: { checked?: boolean; label: string; onchange: (v: boolean) => void } = $props();
</script>

<button type="button" role="switch" aria-checked={checked} aria-label={label} class="sw" class:on={checked} onclick={() => onchange(!checked)}>
  <span class="knob"></span>
</button>

<style>
  .sw {
    flex: none;
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: var(--radius-pill);
    background: var(--control-hi);
    box-shadow: inset 0 0 0 1px var(--outline);
    transition: background 0.15s var(--ease), box-shadow 0.15s var(--ease);
  }
  .sw.on {
    background: var(--accent);
    box-shadow: none;
  }
  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-3);
    transition: transform 0.15s var(--ease), background 0.15s var(--ease);
  }
  .sw.on .knob {
    transform: translateX(16px);
    background: var(--on-accent);
  }
</style>
