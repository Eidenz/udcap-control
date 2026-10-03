<script lang="ts">
  // A hand drawn as five finger capsules on a palm, each filled by how far that
  // finger is curled (0 open, 1 closed). Drawn as a left hand seen from the
  // back; `mirror` makes it a right hand.
  let {
    curls = [0, 0, 0, 0, 0],
    mirror = false,
    spread = false,
    size = 184,
    dim = false,
  }: { curls?: number[]; mirror?: boolean; spread?: boolean; size?: number; dim?: boolean } = $props();

  // thumb, index, middle, ring, pinky on a 184px box; `sp` = extra tilt when spread.
  const GEO = [
    { x: 121, y: 94, h: 58, rot: 40, sp: 22 },
    { x: 108, y: 36, h: 74, rot: 0, sp: 9 },
    { x: 82, y: 30, h: 80, rot: 0, sp: 0 },
    { x: 56, y: 38, h: 72, rot: 0, sp: -8 },
    { x: 30, y: 56, h: 54, rot: 0, sp: -17 },
  ];
  const k = $derived(size / 184);
  const pct = (v: number | undefined) => Math.max(0, Math.min(1, v || 0)) * 100;
</script>

<div class="glyph" class:dim style="width:{size}px;height:{size}px" aria-hidden="true">
  <div
    class="box"
    style="left:{(size - 184) / 2}px;top:{(size - 184) / 2}px;transform:scale({mirror ? -k : k}, {k})"
  >
    {#each GEO as g, i}
      <div class="finger" style="left:{g.x}px;top:{g.y}px;height:{g.h}px;transform:rotate({g.rot + (spread ? g.sp : 0)}deg)">
        <div class="fill" style="height:{pct(curls[i])}%"></div>
      </div>
    {/each}
    <div class="palm"><div class="pod"><div class="led"></div></div></div>
  </div>
</div>

<style>
  .glyph {
    position: relative;
    flex: none;
  }
  .glyph.dim {
    opacity: 0.35;
  }
  .box {
    position: absolute;
    width: 184px;
    height: 184px;
    transform-origin: 50% 50%;
  }
  .finger {
    position: absolute;
    width: 22px;
    border-radius: 11px;
    background: var(--track);
    box-shadow: inset 0 0 0 1px #34343b;
    overflow: hidden;
    transform-origin: 50% 100%;
  }
  .fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 11px;
    background: var(--accent);
    transition: height 0.1s linear;
  }
  .palm {
    position: absolute;
    left: 24px;
    top: 104px;
    width: 112px;
    height: 72px;
    border-radius: 18px 18px 30px 30px;
    background: #232329;
    border: 1px solid #34343b;
  }
  .pod {
    position: absolute;
    left: 37px;
    top: 28px;
    width: 36px;
    height: 14px;
    border-radius: 7px;
    background: #2e2e35;
    border: 1px solid #3a3a42;
  }
  .led {
    position: absolute;
    left: 5px;
    top: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
</style>
