<script lang="ts">
  // Controlled two-thumb range. Reports new (low, high) via onchange; the parent
  // owns the values, so it stays in sync with the number inputs beside it.
  let {
    min = 0,
    max = 1,
    step = 0.05,
    low,
    high,
    onchange,
  }: {
    min?: number;
    max?: number;
    step?: number;
    low: number;
    high: number;
    onchange?: (low: number, high: number) => void;
  } = $props();

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
</script>

<div class="dual">
  <div class="rail"></div>
  <div class="sel" style="left:{pct(low)}%;right:{100 - pct(high)}%"></div>
  <input
    class="r"
    type="range"
    {min}
    {max}
    {step}
    value={low}
    oninput={(e) => onchange?.(Math.min(+e.currentTarget.value, high), high)}
  />
  <input
    class="r"
    type="range"
    {min}
    {max}
    {step}
    value={high}
    oninput={(e) => onchange?.(low, Math.max(+e.currentTarget.value, low))}
  />
</div>

<style>
  .dual {
    position: relative;
    height: 26px;
    flex: 1;
    min-width: 130px;
  }
  .rail,
  .sel {
    position: absolute;
    top: 50%;
    height: 4px;
    transform: translateY(-50%);
    border-radius: var(--radius-pill);
    pointer-events: none;
  }
  .rail {
    left: 0;
    right: 0;
    background: var(--track);
  }
  .sel {
    background: var(--primary);
  }
  .r {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    background: none;
    pointer-events: none; /* only the thumbs are interactive (overlapping inputs) */
    -webkit-appearance: none;
    appearance: none;
  }
  .r::-webkit-slider-thumb {
    -webkit-appearance: none;
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary);
    border: 2px solid var(--surface);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    cursor: pointer;
  }
  .r::-moz-range-thumb {
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary);
    border: 2px solid var(--surface);
    cursor: pointer;
  }
</style>
