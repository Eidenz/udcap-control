<script lang="ts">
  let {
    label,
    raw,
    min,
    max,
    onchange,
  }: {
    label: string;
    raw: number;
    min: number;
    max: number;
    onchange: (min: number, max: number) => void;
  } = $props();

  let track: HTMLDivElement;
  let dragging: "min" | "max" | null = null;

  // Remapped output (what the driver produces) for the live preview bar.
  const out = $derived(max - min < 0.01 ? raw : Math.max(0, Math.min(1, (raw - min) / (max - min))));

  function valueFromEvent(e: PointerEvent): number {
    const r = track.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100) / 100;
  }
  function down(which: "min" | "max", e: PointerEvent) {
    dragging = which;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    const v = valueFromEvent(e);
    if (dragging === "min") onchange(Math.min(v, max - 0.05), max);
    else onchange(min, Math.max(v, min + 0.05));
  }
  function up() {
    dragging = null;
  }
</script>

<div class="fr">
  <span class="frlabel">{label}</span>
  <div class="stack">
    <div
      class="track"
      bind:this={track}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    >
      <div class="span" style="left:{min * 100}%;right:{(1 - max) * 100}%"></div>
      <div class="raw" style="left:{raw * 100}%"></div>
      <button class="handle" style="left:{min * 100}%" onpointerdown={(e) => down('min', e)} aria-label="min"></button>
      <button class="handle" style="left:{max * 100}%" onpointerdown={(e) => down('max', e)} aria-label="max"></button>
    </div>
    <div class="outbar"><div class="outfill" style="width:{out * 100}%"></div></div>
  </div>
  <span class="frval">{Math.round(min * 100)}–{Math.round(max * 100)}</span>
</div>

<style>
  .fr {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .frlabel {
    width: 56px;
    font-size: 13px;
    color: var(--on-surface-var);
    font-weight: 600;
  }
  .stack {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .track {
    position: relative;
    height: 26px;
    background: var(--track);
    border-radius: var(--radius-pill);
    touch-action: none;
  }
  .span {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--primary-container);
    border-radius: var(--radius-pill);
  }
  .raw {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 3px;
    background: var(--success);
    border-radius: 2px;
    transform: translateX(-50%);
    transition: left 0.08s linear;
    box-shadow: 0 0 8px rgba(132, 224, 164, 0.6);
  }
  .handle {
    position: absolute;
    top: 50%;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--primary);
    border: 2px solid var(--surface-1);
    transform: translate(-50%, -50%);
    cursor: ew-resize;
  }
  .outbar {
    height: 5px;
    background: var(--track);
    border-radius: var(--radius-pill);
    overflow: hidden;
  }
  .outfill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), #8f8bff);
    transition: width 0.08s linear;
  }
  .frval {
    width: 52px;
    text-align: right;
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
