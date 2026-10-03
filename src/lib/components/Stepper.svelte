<script lang="ts">
  // Number field with − / + buttons. Typed values apply on Enter or blur.
  let {
    value,
    step,
    decimals = 0,
    label,
    disabled = false,
    onchange,
  }: {
    value: number;
    step: number;
    decimals?: number;
    label: string;
    disabled?: boolean;
    onchange: (v: number) => void;
  } = $props();

  const round = (v: number) => Math.round(v * 1000) / 1000;
  const fmt = (v: number) => v.toFixed(decimals);

  function typed(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const v = parseFloat(el.value.replace("−", "-"));
    if (Number.isFinite(v)) onchange(round(v));
    else el.value = fmt(value);
  }
</script>

<div class="stepper" class:disabled>
  <button type="button" aria-label="Decrease {label}" {disabled} onclick={() => onchange(round(value - step))}>−</button>
  <input type="text" inputmode="decimal" aria-label={label} {disabled} value={fmt(value)} onchange={typed} />
  <button type="button" aria-label="Increase {label}" {disabled} onclick={() => onchange(round(value + step))}>+</button>
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    height: 34px;
    border-radius: var(--radius-control);
    background: var(--well);
    border: 1px solid var(--border-input);
    overflow: hidden;
  }
  .stepper:focus-within {
    border-color: var(--accent-line);
  }
  .stepper.disabled {
    opacity: 0.5;
  }
  button {
    width: 34px;
    height: 100%;
    flex: none;
    color: var(--text-3);
    font-size: 16px;
  }
  button:hover:not(:disabled) {
    background: var(--control);
    color: var(--text);
  }
  button:disabled {
    cursor: not-allowed;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    text-align: center;
    font-family: var(--font-mono);
    font-size: 13px;
    user-select: text;
  }
</style>
