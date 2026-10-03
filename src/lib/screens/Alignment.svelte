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
    profiles,
    activeProfile,
    selectProfile,
    createProfile,
    renameProfile,
    deleteProfile,
  } from "$lib/state.svelte";
  import { setOffset, setGrip } from "$lib/api";
  import Page from "$lib/components/Page.svelte";
  import Select from "$lib/components/Select.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Combobox from "$lib/components/Combobox.svelte";
  import Stepper from "$lib/components/Stepper.svelte";
  import Icon from "$lib/components/Icon.svelte";

  type Hand = "left" | "right";
  type Kind = "pos" | "deg" | "gripPos" | "grip";
  const HANDS: Hand[] = ["left", "right"];
  const AXES = ["X", "Y", "Z"];
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const idxOf = (hand: Hand) => (hand === "left" ? 0 : 1);
  const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
  const monado = $derived(appMode.mode === "monado");

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

  // Profiles: pick or create in the dropdown; rename inline; two-step delete.
  let renaming = $state(false);
  let draft = $state("");
  let nameInput = $state<HTMLInputElement | undefined>();
  let confirmDelete = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  function startRename() {
    renaming = true;
    draft = activeProfile().name;
    setTimeout(() => {
      nameInput?.focus();
      nameInput?.select();
    }, 0);
  }
  function commitRename() {
    if (draft.trim()) renameProfile(activeProfile().id, draft);
    renaming = false;
  }
  function onNameKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") renaming = false;
  }
  function remove() {
    clearTimeout(confirmTimer);
    if (!confirmDelete) {
      confirmDelete = true;
      confirmTimer = setTimeout(() => (confirmDelete = false), 3000);
      return;
    }
    confirmDelete = false;
    deleteProfile(activeProfile().id);
  }

  let trackersSaved = $state(false);
  function saveTrackers() {
    saveConfig();
    trackersSaved = true;
    setTimeout(() => (trackersSaved = false), 1500);
  }

  const num = (n: number, d: number) => n.toFixed(d).replace("-", "−");
  const gripSummary = (hand: Hand) => {
    const v = gripConfig.values[hand];
    return `${v.pos.map((n) => num(n, 2)).join(", ")} m · ${v.rot.map((n) => num(n, 0) + "°").join(", ")}`;
  };
</script>

{#snippet group(title: string, what: string, kind: Kind, step: number, decimals: number)}
  <div class="ogroup">
    <span class="gtitle section-label">{title}</span>
    <span></span>
    <span class="colh">Left hand</span>
    <span class="colh">Right hand</span>
    {#each AXES as a, i}
      <span class="axis">{a}</span>
      {#each HANDS as hand}
        <Stepper value={arr(hand, kind)[i]} {step} {decimals} label="{hand} {what} {a}" onchange={(v) => edit(hand, kind, i, v)} />
      {/each}
    {/each}
  </div>
{/snippet}

{#snippet table(kindPos: Kind, kindRot: Kind, posStep: number, rotStep: number)}
  <div class="otable">
    {@render group("Position · metres", "position", kindPos, posStep, 3)}
    {@render group("Rotation · degrees", "rotation", kindRot, rotStep, 0)}
  </div>
{/snippet}

<Page title="Alignment" subtitle="Where the hands sit on the trackers, per game">
  {#snippet actions()}
    <span class="chip accent">{monado ? "Monado" : "SteamVR"} offsets</span>
  {/snippet}

  <div class="profiles">
    <div class="prow">
      <span class="section-label">Profile</span>
      {#if renaming}
        <input class="field name" bind:this={nameInput} bind:value={draft} placeholder="Profile name" aria-label="Profile name" onkeydown={onNameKey} />
        <button class="btn tonal sm" onclick={commitRename}>Save</button>
        <button class="btn text sm" onclick={() => (renaming = false)}>Cancel</button>
      {:else}
        <Combobox
          items={profiles.list.map((p) => ({ id: p.id, label: p.name }))}
          selected={profiles.active}
          onselect={selectProfile}
          oncreate={(name) => createProfile(name || "New profile")}
          ariaLabel="Alignment profile"
          searchLabel="Search profiles"
          newLabel="New profile"
        />
        <button class="iconbtn" aria-label="Rename profile" title="Rename" onclick={startRename}><Icon name="pencil" size={16} /></button>
        <button
          class="iconbtn del"
          class:armed={confirmDelete}
          aria-label={confirmDelete ? "Confirm delete" : "Delete profile"}
          title={profiles.list.length <= 1 ? "The last profile can't be deleted" : "Delete"}
          disabled={profiles.list.length <= 1}
          onclick={remove}
        >
          {#if confirmDelete}Delete?{:else}<Icon name="trash" size={16} />{/if}
        </button>
      {/if}
    </div>
    <p class="hint">One per game. A profile keeps the hand alignment for both runtimes and the menu anchor; a new one starts as a copy of the current profile.</p>
  </div>

  <section class="card handcard grow-y" aria-labelledby="hand-h">
    <div class="card-head">
      <div class="grow">
        <h2 id="hand-h">Hand alignment</h2>
        <p class="desc">The hand's offset from its tracker. Changes apply live.</p>
      </div>
      <Select width="190px" bind:value={spaceConfig.preset} options={[...Object.keys(TRACKER_PRESETS), "Custom"]} ariaLabel="Tracker preset" onchange={selectTracker} />
    </div>
    {@render table("pos", "deg", 0.01, 1)}
  </section>

  {#if monado}
    <section class="card" aria-labelledby="menu-h">
      <div class="card-head">
        <div class="grow">
          <h2 id="menu-h">Menu anchor</h2>
          <p class="desc">Where VRChat's hand menu attaches. Monado only.</p>
        </div>
        <Segmented bind:value={gripConfig.mode} options={["Built-in", "Custom"]} onchange={selectGrip} />
      </div>
      {#if gripConfig.mode === "Custom"}
        {@render table("gripPos", "grip", 0.01, 5)}
      {:else}
        <div class="summaries">
          {#each HANDS as hand}
            <div class="summary">
              <div class="stitle">{hand === "left" ? "Left hand" : "Right hand"}</div>
              <div class="sval">{gripSummary(hand)}</div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <section class="card" aria-labelledby="trk-h">
    <div class="inline">
      <h2 id="trk-h">Trackers</h2>
      <p class="hint">The Lighthouse tracker on each glove. Used when the server starts.</p>
    </div>
    <div class="trow">
      <label>
        Left tracker
        <input class="field mono" placeholder="LHR-…" bind:value={config.trackerLeft} />
      </label>
      <label>
        Right tracker
        <input class="field mono" placeholder="LHR-…" bind:value={config.trackerRight} />
      </label>
      <button class="btn tonal" onclick={saveTrackers}>{trackersSaved ? "Saved" : "Save"}</button>
    </div>
  </section>
</Page>

<style>
  .grow {
    flex: 1;
    min-width: 0;
  }
  .profiles {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .prow .section-label {
    margin-right: 4px;
  }
  .name {
    width: 280px;
  }
  .del.armed {
    width: auto;
    padding: 0 10px;
    background: var(--danger-soft);
    color: var(--danger-text);
    font-size: 13px;
    font-weight: 600;
  }

  .handcard {
    display: flex;
    flex-direction: column;
  }
  .handcard .otable {
    flex: 1;
  }
  .otable {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 16px 28px;
    margin-top: 14px;
  }
  .ogroup {
    display: grid;
    align-content: space-between;
    grid-template-columns: 20px repeat(2, minmax(0, 1fr));
    column-gap: 10px;
    row-gap: 8px;
    align-items: center;
  }
  .gtitle {
    grid-column: 1 / -1;
  }
  .colh {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
  }
  .axis {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-2);
  }

  .summaries {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }
  .summary {
    padding: 10px 12px;
    background: var(--inset);
    border-radius: var(--radius-inner);
  }
  .stitle {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
  }
  .sval {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-3);
  }

  .inline {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .trow {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
  }
  .trow label {
    flex: 1 1 180px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
  }
</style>
