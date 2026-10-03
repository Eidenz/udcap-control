<script lang="ts">
  // Horizontal 0..1 range with two handles and an optional live marker.
  // Controlled: reports new (low, high) via onchange.
  let {
    low,
    high,
    live = null,
    label = "Range",
    onchange,
  }: {
    low: number;
    high: number;
    live?: number | null;
    label?: string;
    onchange: (low: number, high: number) => void;
  } = $props();

  let track = $state<HTMLDivElement>();
  let dragging: "low" | "high" | null = null;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  function set(which: "low" | "high", v: number) {
    v = r2(Math.max(0, Math.min(1, v)));
    if (which === "low") onchange(Math.min(v, r2(high - 0.05)), high);
    else onchange(low, Math.max(v, r2(low + 0.05)));
  }
  function down(which: "low" | "high", e: PointerEvent) {
    dragging = which;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!dragging || !track) return;
    const r = track.getBoundingClientRect();
    set(dragging, (e.clientX - r.left) / r.width);
  }
  function key(which: "low" | "high", e: KeyboardEvent) {
    const d = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01 }[e.key];
    if (!d) return;
    e.preventDefault();
    set(which, (which === "low" ? low : high) + d);
  }
</script>

<div class="dual" bind:this={track}>
  <div class="rail"></div>
  <div class="sel" style="left:{low * 100}%;width:{(high - low) * 100}%"></div>
  {#if live !== null}<div class="live" style="left:{Math.max(0, Math.min(1, live)) * 100}%"></div>{/if}
  {#each ["low", "high"] as const as which}
    <button
      type="button"
      class="handle"
      style="left:calc({(which === 'low' ? low : high) * 100}% - 8px)"
      aria-label="{label} {which === 'low' ? '0%' : '100%'} point"
      onpointerdown={(e) => down(which, e)}
      onpointermove={move}
      onpointerup={() => (dragging = null)}
      onpointercancel={() => (dragging = null)}
      onkeydown={(e) => key(which, e)}
    ></button>
  {/each}
</div>

<style>
  .dual {
    position: relative;
    height: 24px;
    flex: 1;
    min-width: 140px;
    touch-action: none;
  }
  .rail,
  .sel {
    position: absolute;
    top: 9px;
    height: 6px;
    border-radius: 3px;
  }
  .rail {
    left: 0;
    right: 0;
    background: var(--track);
  }
  .sel {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent-line);
  }
  .live {
    position: absolute;
    top: 4px;
    width: 2px;
    height: 16px;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--text);
    transition: left 0.1s linear;
    pointer-events: none;
  }
  .handle {
    position: absolute;
    top: 4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text);
    border: 3px solid var(--accent);
    cursor: ew-resize;
  }
</style>
