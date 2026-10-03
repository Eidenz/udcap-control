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
    width: 48px;
    height: 28px;
    padding: 0;
    border-radius: var(--radius-pill);
    border: 2px solid var(--muted);
    background: var(--surface-hi);
    transition: background 0.15s var(--ease), border-color 0.15s var(--ease);
  }
  .sw.on {
    background: var(--primary);
    border-color: var(--primary);
  }
  .knob {
    position: absolute;
    top: 50%;
    left: 4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--muted);
    transform: translateY(-50%);
    transition: transform 0.15s var(--ease), background 0.15s var(--ease), width 0.15s var(--ease), height 0.15s var(--ease);
  }
  .sw.on .knob {
    width: 20px;
    height: 20px;
    background: var(--on-primary);
    transform: translate(18px, -50%);
  }
</style>
