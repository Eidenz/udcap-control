<script lang="ts">
  // Vertical 0..1 range for one finger: drag the handles (or arrow keys) to set
  // where it reads 0% and 100%; the white line is the live reading.
  let {
    label,
    min,
    max,
    live = null,
    onchange,
  }: {
    label: string;
    min: number;
    max: number;
    live?: number | null;
    onchange: (min: number, max: number) => void;
  } = $props();

  let track = $state<HTMLDivElement>();
  let dragging: "min" | "max" | null = null;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  function set(which: "min" | "max", v: number) {
    v = r2(Math.max(0, Math.min(1, v)));
    if (which === "min") onchange(Math.min(v, r2(max - 0.05)), max);
    else onchange(min, Math.max(v, r2(min + 0.05)));
  }
  function down(which: "min" | "max", e: PointerEvent) {
    dragging = which;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging || !track) return;
    const r = track.getBoundingClientRect();
    set(dragging, (r.bottom - e.clientY) / r.height);
  }
  function key(which: "min" | "max", e: KeyboardEvent) {
    const d = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01 }[e.key];
    if (!d) return;
    e.preventDefault();
    set(which, (which === "min" ? min : max) + d);
  }
</script>

<div class="rv">
  <div class="track" bind:this={track}>
    <div class="span" style="bottom:{min * 100}%;height:{(max - min) * 100}%"></div>
    {#if live !== null}<div class="live" style="bottom:{Math.max(0, Math.min(1, live)) * 100}%"></div>{/if}
    {#each ["max", "min"] as const as which}
      <button
        type="button"
        class="handle"
        style="bottom:calc({(which === 'min' ? min : max) * 100}% - 3px)"
        aria-label="{label} {which === 'min' ? '0%' : '100%'} point"
        onpointerdown={(e) => down(which, e)}
        onpointermove={move}
        onpointerup={() => (dragging = null)}
        onpointercancel={() => (dragging = null)}
        onkeydown={(e) => key(which, e)}
      ></button>
    {/each}
  </div>
  <span class="name">{label}</span>
  <span class="val">{Math.round(min * 100)}–{Math.round(max * 100)}</span>
</div>

<style>
  .rv {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .track {
    position: relative;
    flex: 1;
    width: 26px;
    min-height: 120px;
    border-radius: var(--radius-control);
    background: var(--well);
    border: 1px solid var(--border-input);
    touch-action: none;
  }
  .span {
    position: absolute;
    left: 3px;
    right: 3px;
    border-radius: 5px;
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent-line);
  }
  .live {
    position: absolute;
    left: -4px;
    right: -4px;
    height: 2px;
    border-radius: 1px;
    background: var(--text);
    transition: bottom 0.1s linear;
    pointer-events: none;
  }
  .handle {
    position: absolute;
    left: 2px;
    right: 2px;
    height: 6px;
    border-radius: 3px;
    background: var(--accent);
    cursor: ns-resize;
  }
  .handle::before {
    content: "";
    position: absolute;
    inset: -6px -4px;
  }
  .name {
    font-size: 11px;
    color: var(--text-2);
  }
  .val {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-3);
  }
</style>
