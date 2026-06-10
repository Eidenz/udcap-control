<script lang="ts">
  import { app, config, saveConfig } from "$lib/state.svelte";
  import { setOffset, setGrip } from "$lib/api";
  import Select from "$lib/components/Select.svelte";

  type Hand = "left" | "right";
  type Kind = "pos" | "deg" | "gripPos" | "grip";

  const vals = $state({
    left: { pos: [0, 0, 0], deg: [0, 0, 0], gripPos: [0, 0, 0], grip: [0, 0, 0] },
    right: { pos: [0, 0, 0], deg: [0, 0, 0], gripPos: [0, 0, 0], grip: [0, 0, 0] },
  });
  let initialized = $state(false);

  // Initialise from the live shm once it's available.
  $effect(() => {
    const h = app.status?.shm?.hands;
    if (!initialized && h && h.length === 2) {
      vals.left.pos = [...h[0].offset_pos];
      vals.left.deg = [...h[0].offset_deg];
      vals.right.pos = [...h[1].offset_pos];
      vals.right.deg = [...h[1].offset_deg];
      vals.left.gripPos = [...h[0].grip_pos];
      vals.right.gripPos = [...h[1].grip_pos];
      vals.left.grip = [...h[0].grip_rot];
      vals.right.grip = [...h[1].grip_rot];
      initialized = true;
    }
  });

  const presets: Record<string, { left: any; right: any }> = {
    "Vive Tracker 3.0": {
      left: { pos: [0, 0, 0], deg: [45, 85, 0] },
      right: { pos: [0, 0, 0], deg: [45, -85, 0] },
    },
    Custom: { left: { pos: [0, 0, 0], deg: [0, 0, 0] }, right: { pos: [0, 0, 0], deg: [0, 0, 0] } },
  };
  let preset = $state("Vive Tracker 3.0");

  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  const idxOf = (hand: Hand) => (hand === "left" ? 0 : 1);
  function apply(hand: Hand) {
    setOffset(idxOf(hand), vals[hand].pos.map(r3), vals[hand].deg.map(r3)).catch(() => {});
  }
  function applyGrip(hand: Hand) {
    setGrip(idxOf(hand), vals[hand].gripPos.map(r3), vals[hand].grip.map(r3)).catch(() => {});
  }
  function edit(hand: Hand, kind: Kind, axis: number, value: number) {
    vals[hand][kind][axis] = r3(value);
    if (kind === "grip" || kind === "gripPos") applyGrip(hand);
    else apply(hand);
  }
  function applyPreset(name: string) {
    preset = name;
    if (name === "Custom") return;
    const p = presets[name];
    for (const hand of ["left", "right"] as Hand[]) {
      vals[hand].pos = [...p[hand].pos];
      vals[hand].deg = [...p[hand].deg];
      apply(hand);
    }
  }

  const axes = ["X", "Y", "Z"];
</script>

{#snippet field(hand: Hand, kind: Kind, axis: number, step: number)}
  <div class="field">
    <button class="step state-layer" onclick={() => edit(hand, kind, axis, vals[hand][kind][axis] - step)}>−</button>
    <input
      type="number"
      {step}
      value={vals[hand][kind][axis]}
      oninput={(e) => edit(hand, kind, axis, parseFloat(e.currentTarget.value) || 0)}
    />
    <button class="step state-layer" onclick={() => edit(hand, kind, axis, vals[hand][kind][axis] + step)}>+</button>
  </div>
{/snippet}

{#snippet axisRow(hand: Hand, label: string, unit: string, kind: Kind, step: number)}
  <div class="group">
    <span class="glabel">{label} <em>({unit})</em></span>
    <div class="row">
      {#each axes as a, i}
        <div class="axis"><span>{a}</span>{@render field(hand, kind, i, step)}</div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet handCard(hand: Hand, name: string)}
  <div class="card">
    <h3>{name} hand</h3>
    {@render axisRow(hand, "Position", "m", "pos", 0.01)}
    {@render axisRow(hand, "Rotation", "°", "deg", 1)}
  </div>
{/snippet}

{#snippet gripCard(hand: Hand, name: string)}
  <div class="card">
    <h3>{name} hand</h3>
    {@render axisRow(hand, "Position", "m", "gripPos", 0.01)}
    {@render axisRow(hand, "Rotation", "°", "grip", 5)}
  </div>
{/snippet}

<div class="screen">
  <div class="card head">
    <div class="hl">
      <h3>Space orientation</h3>
      <p class="muted">Align the hands to the trackers, and place VRChat's menu. Applies live in VR.</p>
    </div>
    <div class="preset">
      <span class="plabel">Tracker</span>
      <Select bind:value={preset} options={Object.keys(presets)} onchange={applyPreset} />
    </div>
  </div>

  <div class="section">Hand alignment</div>
  <div class="cols">
    {@render handCard("left", "Left")}
    {@render handCard("right", "Right")}
  </div>

  <div class="section">Grip / menu <em>— position &amp; rotation of VRChat's menu anchor</em></div>
  <div class="cols">
    {@render gripCard("left", "Left")}
    {@render gripCard("right", "Right")}
  </div>

  <div class="card trackers">
    <div class="hl">
      <h3>Tracker mapping</h3>
      <p class="muted">Lighthouse tracker serial mounted on each glove (used when the server starts).</p>
    </div>
    <div class="trow">
      <label>Left<input placeholder="LHR-…" bind:value={config.trackerLeft} /></label>
      <label>Right<input placeholder="LHR-…" bind:value={config.trackerRight} /></label>
      <button class="btn tonal state-layer" onclick={saveConfig}>Save</button>
    </div>
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 880px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .muted {
    color: var(--muted);
    margin: 4px 0 0;
    font-size: 13px;
  }
  .preset {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .plabel {
    font-size: 12px;
    color: var(--muted);
  }
  input {
    background: var(--surface-2);
    border: 1px solid var(--outline-dim);
    color: var(--on-surface);
    border-radius: var(--radius-s);
    height: 38px;
    padding: 0 12px;
    font-family: inherit;
    font-size: 14px;
    outline: none;
  }
  input:focus {
    border-color: var(--primary);
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .section {
    font-size: 13px;
    font-weight: 700;
    color: var(--on-surface-var);
    margin: 4px 2px -4px;
  }
  .section em {
    font-style: normal;
    font-weight: 500;
    color: var(--muted);
  }
  .group {
    margin-top: 16px;
  }
  .glabel {
    font-size: 12px;
    color: var(--on-surface-var);
    font-weight: 600;
  }
  .glabel em {
    color: var(--muted);
    font-style: normal;
  }
  .row {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }
  .axis {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .axis > span {
    font-size: 11px;
    color: var(--muted);
    text-align: center;
  }
  .field {
    display: flex;
    align-items: center;
    background: var(--surface-2);
    border-radius: var(--radius-s);
    overflow: hidden;
  }
  .field input {
    border: none;
    background: none;
    text-align: center;
    width: 100%;
    padding: 0 2px;
    -moz-appearance: textfield;
  }
  .field input::-webkit-outer-spin-button,
  .field input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .step {
    width: 30px;
    height: 38px;
    color: var(--primary);
    font-size: 18px;
    flex: none;
  }
  .trackers .trow {
    display: flex;
    gap: 12px;
    margin-top: 14px;
    align-items: flex-end;
  }
  .trow label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
