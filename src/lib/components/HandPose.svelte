<script lang="ts" module>
  export type Pose = "relaxed" | "fist" | "together" | "spread";
</script>

<script lang="ts">
  // Pictogram of a calibration pose, in the same capsule style as HandGlyph:
  // a left hand seen from the back (thumb on the right); `mirror` makes it a
  // right hand. Curled fingers get a stronger fill.
  let {
    pose,
    mirror = false,
    size = 96,
    muted = false,
  }: { pose: Pose; mirror?: boolean; size?: number; muted?: boolean } = $props();

  type Part = { x: number; y: number; w: number; h: number; r?: number; ox?: number; oy?: number; curled?: boolean };
  type Shape = { palm: { x: number; y: number; w: number; h: number }; behind: Part[]; front: Part[] };

  // Each finger rotates `r` degrees about (ox, oy), the middle of its base.
  const finger = (x: number, h: number, r = 0, w = 22, base = 112): Part => ({ x, y: base - h, w, h, r, ox: x + w / 2, oy: base });
  const SHAPES: Record<Pose, Shape> = {
    relaxed: {
      palm: { x: 24, y: 104, w: 112, h: 72 },
      behind: [finger(30, 56), finger(56, 74), finger(82, 82), finger(108, 76), { x: 121, y: 94, w: 22, h: 58, r: 40, ox: 132, oy: 152 }],
      front: [],
    },
    together: {
      palm: { x: 28, y: 104, w: 108, h: 72 },
      behind: [finger(34, 56, 0, 23), finger(57, 74, 0, 23), finger(80, 82, 0, 23), finger(103, 76, 0, 23), { x: 119, y: 98, w: 22, h: 56, r: 14, ox: 130, oy: 154 }],
      front: [],
    },
    spread: {
      palm: { x: 24, y: 104, w: 112, h: 72 },
      behind: [finger(30, 56, -24), finger(56, 74, -9), finger(82, 82), finger(108, 76, 10), { x: 115, y: 96, w: 22, h: 54, r: 72, ox: 126, oy: 150 }],
      front: [],
    },
    fist: {
      palm: { x: 38, y: 88, w: 104, h: 76 },
      behind: [],
      // Rolled fingers over the top of the palm, the thumb folded across them.
      front: [
        { x: 38, y: 64, w: 25, h: 52, curled: true },
        { x: 64, y: 56, w: 25, h: 60, curled: true },
        { x: 90, y: 52, w: 25, h: 64, curled: true },
        { x: 116, y: 56, w: 25, h: 60, curled: true },
        { x: 60, y: 102, w: 92, h: 26, r: -8, ox: 152, oy: 115, curled: true },
      ],
    },
  };
  const shape = $derived(SHAPES[pose]);
  const rot = (p: Part) => (p.r ? `rotate(${p.r} ${p.ox} ${p.oy})` : undefined);
</script>

{#snippet part(p: Part)}
  <rect
    class={p.curled ? "curled" : "finger"}
    x={p.x}
    y={p.y}
    width={p.w}
    height={p.h}
    rx={Math.min(p.w, p.h) / 2}
    transform={rot(p)}
  />
{/snippet}

<svg class="pose" class:muted width={size} height={size} viewBox="0 0 184 184" aria-hidden="true">
  <g transform={mirror ? "translate(184 0) scale(-1 1)" : undefined}>
    {#each shape.behind as p}{@render part(p)}{/each}
    <rect class="palm" x={shape.palm.x} y={shape.palm.y} width={shape.palm.w} height={shape.palm.h} rx="24" />
    {#each shape.front as p}{@render part(p)}{/each}
  </g>
</svg>

<style>
  .pose {
    --line: var(--accent);
    --soft: var(--accent-soft);
    --solid: color-mix(in srgb, var(--accent) 38%, #1c1c20);
    flex: none;
    overflow: visible;
  }
  .pose.muted {
    --line: var(--outline);
    --soft: var(--track);
    --solid: #34343b;
  }
  rect {
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .palm {
    fill: #232329;
    stroke: var(--line);
  }
  .finger {
    fill: var(--soft);
    stroke: var(--line);
  }
  .curled {
    fill: var(--solid);
    stroke: var(--line);
  }
</style>
