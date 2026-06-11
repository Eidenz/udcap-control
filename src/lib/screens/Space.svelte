<script lang="ts">
  import {
    config,
    saveConfig,
    spaceConfig,
    gripConfig,
    appMode,
    TRACKER_PRESETS,
    presetOffsets,
    BUILTIN_GRIP,
    saveSpace,
    saveGrip,
  } from "$lib/state.svelte";
  import { setOffset, setGrip } from "$lib/api";
  import Select from "$lib/components/Select.svelte";
  import Segmented from "$lib/components/Segmented.svelte";

  type Hand = "left" | "right";
  type Kind = "pos" | "deg" | "gripPos" | "grip";

  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const idxOf = (hand: Hand) => (hand === "left" ? 0 : 1);
  const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
  const axes = ["X", "Y", "Z"];

  function arr(hand: Hand, kind: Kind): number[] {
    if (kind === "pos") return spaceConfig.offsets[hand].pos;
    if (kind === "deg") return spaceConfig.offsets[hand].deg;
    if (kind === "gripPos") return gripConfig.values[hand].pos;
    return gripConfig.values[hand].rot;
  }

  function applyTrackerHand(hand: Hand) {
    const o = spaceConfig.offsets[hand];
    setOffset(idxOf(hand), o.pos.map(r3), o.deg.map(r3)).catch(() => {});
  }
  function applyGripHand(hand: Hand) {
    const v = gripConfig.values[hand];
    setGrip(idxOf(hand), v.pos.map(r3), v.rot.map(r3)).catch(() => {});
  }

  function edit(hand: Hand, kind: Kind, axis: number, value: number) {
    arr(hand, kind)[axis] = r3(value);
    if (kind === "pos" || kind === "deg") {
      spaceConfig.preset = "Custom";
      applyTrackerHand(hand);
      saveSpace();
    } else {
      gripConfig.mode = "Custom";
      applyGripHand(hand);
      saveGrip();
    }
  }

  function selectTracker(name: string) {
    spaceConfig.preset = name;
    if (name !== "Custom" && TRACKER_PRESETS[name]) {
      spaceConfig.offsets = clone(presetOffsets(name, appMode.mode));
      applyTrackerHand("left");
      applyTrackerHand("right");
    }
    saveSpace();
  }
  function selectGrip(name: string) {
    gripConfig.mode = name;
    if (name === "Built-in") {
      gripConfig.values = clone(BUILTIN_GRIP);
      applyGripHand("left");
      applyGripHand("right");
    }
    saveGrip();
  }
</script>

{#snippet field(hand: Hand, kind: Kind, axis: number, step: number)}
  <div class="field">
    <button class="step state-layer" onclick={() => edit(hand, kind, axis, arr(hand, kind)[axis] - step)}>−</button>
    <input
      type="number"
      {step}
      value={arr(hand, kind)[axis]}
      oninput={(e) => edit(hand, kind, axis, parseFloat(e.currentTarget.value) || 0)}
    />
    <button class="step state-layer" onclick={() => edit(hand, kind, axis, arr(hand, kind)[axis] + step)}>+</button>
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
      <p class="muted">
        Align the hands to the trackers{appMode.mode === "monado" ? ", and place VRChat's menu" : ""}. Saved
        and applied live.
      </p>
    </div>
    <span class="modechip">{appMode.mode === "steamvr" ? "SteamVR" : "Monado"} offsets</span>
  </div>

  <div class="section">
    <span>Hand alignment</span>
    <Select bind:value={spaceConfig.preset} options={[...Object.keys(TRACKER_PRESETS), "Custom"]} onchange={selectTracker} />
  </div>
  <div class="cols">
    {@render handCard("left", "Left")}
    {@render handCard("right", "Right")}
  </div>

  {#if appMode.mode === "monado"}
    <div class="section">
      <span>Grip / menu <em>— position &amp; rotation of VRChat's menu anchor</em></span>
      <Segmented bind:value={gripConfig.mode} options={["Built-in", "Custom"]} onchange={selectGrip} />
    </div>
    <div class="cols">
      {@render gripCard("left", "Left")}
      {@render gripCard("right", "Right")}
    </div>
  {/if}

  <div class="card trackers">
    <div class="hl">
      <h3>Tracker mapping</h3>
      <p class="muted">Lighthouse tracker serial mounted on each glove (used when the server starts).</p>
    </div>
    <div class="trow">
      <label>Left<input class="text" placeholder="LHR-…" bind:value={config.trackerLeft} /></label>
      <label>Right<input class="text" placeholder="LHR-…" bind:value={config.trackerRight} /></label>
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
  .modechip {
    flex: none;
    align-self: flex-start;
    padding: 4px 12px;
    border-radius: var(--radius-pill);
    background: var(--primary-container);
    color: var(--on-primary-container);
    font-size: 12px;
    font-weight: 700;
  }
  .section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
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
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
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
    color: var(--on-surface);
    font-family: inherit;
    font-size: 14px;
    outline: none;
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
  input.text {
    background: var(--surface-2);
    border: 1px solid var(--outline-dim);
    color: var(--on-surface);
    border-radius: var(--radius-s);
    height: 40px;
    padding: 0 12px;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    outline: none;
  }
  input.text:focus {
    border-color: var(--primary);
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
