<script lang="ts">
  import { app, io, saveIo, applyHandIo, defaultHandIo } from "$lib/state.svelte";
  import { testVibration, BTN_SOURCES, FINGER_SEL, type HandView } from "$lib/api";
  import Select from "$lib/components/Select.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import DualRange from "$lib/components/DualRange.svelte";

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(shm?.hands ?? []);

  // Displayed columns: one when linked, two when per-hand.
  const cols = $derived(io.linked ? [0] : [0, 1]);
  const colName = (h: number) => (io.linked ? "Both hands" : h === 0 ? "Left" : "Right");

  // Source-picker nodes, positioned at the hand image's dashed-line endpoints.
  // o = output index (0 A, 1 B, 2 System, 3 Stick, 4 Trigger, 5 Grip).
  // top/x are percentages of the map box; x is the gap from the hand side.
  const NODES = [
    { o: 3, label: "Stick", top: 11, x: 56 },
    { o: 1, label: "B", top: 25, x: 53 },
    { o: 0, label: "A", top: 34, x: 70 },
    { o: 2, label: "System", top: 44, x: 55 },
    { o: 4, label: "Trigger", top: 65, x: 52 },
    { o: 5, label: "Grip", top: 86, x: 52 },
  ];

  function commit(hand: number, fn: (h: number) => void) {
    const targets = io.linked ? [0, 1] : [hand];
    for (const h of targets) {
      fn(h);
      applyHandIo(h);
    }
    saveIo();
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const editBtn = (hand: number, out: number, name: string) =>
    commit(hand, (h) => (io.hands[h].btn[out] = Math.max(0, BTN_SOURCES.indexOf(name))));
  const editFinger = (hand: number, which: "tFinger" | "gFinger", name: string) =>
    commit(hand, (h) => (io.hands[h][which] = Math.max(0, FINGER_SEL.indexOf(name))));
  const editNum = (hand: number, key: "tMin" | "tMax" | "gMin" | "gMax", v: number) =>
    commit(hand, (h) => (io.hands[h][key] = r2(v)));
  const editRange = (hand: number, kind: "t" | "g", lo: number, hi: number) =>
    commit(hand, (h) => {
      if (kind === "t") {
        io.hands[h].tMin = r2(lo);
        io.hands[h].tMax = r2(hi);
      } else {
        io.hands[h].gMin = r2(lo);
        io.hands[h].gMax = r2(hi);
      }
    });
  function reset() {
    io.hands = [defaultHandIo(), defaultHandIo()];
    applyHandIo(0);
    applyHandIo(1);
    saveIo();
  }
</script>

{#snippet bar(label: string, v: number)}
  <div class="abar">
    <span class="al">{label}</span>
    <div class="atrack"><div class="afill" style="width:{v * 100}%"></div></div>
    <b class="av">{Math.round(v * 100)}%</b>
  </div>
{/snippet}

{#snippet pad(h: HandView | undefined, name: string, hand: number)}
  <div class="card">
    <div class="chead">
      <div class="cname">
        <span class="dot" class:on={h?.present && h.link === 3}></span>
        <h3>{name}</h3>
      </div>
      <button class="btn tonal state-layer" disabled={!h?.present} onclick={() => testVibration(hand, 140, 0.25)}>
        Test vibration
      </button>
    </div>
    {#if !h?.present}
      <p class="muted">No glove connected.</p>
    {:else}
      <div class="top">
        <div class="joy" class:click={h.btn_joy}>
          <span class="jdot" style="left:{50 + h.joy_x * 38}%;top:{50 - h.joy_y * 38}%"></span>
        </div>
        <div class="btns">
          <span class="pill" class:on={h.btn_a}>A</span>
          <span class="pill" class:on={h.btn_b}>B</span>
          <span class="pill" class:on={h.btn_menu}>Menu</span>
          <span class="pill wide" class:on={h.btn_joy}>Stick click</span>
          <span class="pill wide" class:on={h.btn_power}>Power</span>
        </div>
      </div>
      <div class="analogs">
        {@render bar("Trigger", h.trigger)}
        {@render bar("Grip", h.grip)}
        {@render bar("Trackpad", h.trackpad)}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet numField(hand: number, key: "tMin" | "tMax" | "gMin" | "gMax", val: number)}
  <input
    class="num"
    type="number"
    min="0"
    max="1"
    step="0.05"
    value={val}
    oninput={(e) => editNum(hand, key, parseFloat(e.currentTarget.value) || 0)}
  />
{/snippet}

{#snippet handmap(hand: number, mirror: boolean)}
  <div class="handmap" class:mirror>
    <img class="hand" src="/hand.png" alt="hand" />
    {#each NODES as n}
      <div
        class="hnode"
        class:assigned={io.hands[hand].btn[n.o] !== 0}
        style="top:{n.top}%;{mirror ? 'right' : 'left'}:{n.x}%"
      >
        <span class="hlabel">{n.label}</span>
        <Select
          compact
          value={BTN_SOURCES[io.hands[hand].btn[n.o]] ?? "None"}
          options={BTN_SOURCES}
          onchange={(name) => editBtn(hand, n.o, name)}
        />
      </div>
    {/each}
  </div>
{/snippet}

<div class="screen">
  {#if !live}
    <div class="card banner"><p>Start the server and connect gloves to see live inputs.</p></div>
  {/if}
  <div class="cols2">
    {@render pad(hands[0], "Left", 0)}
    {@render pad(hands[1], "Right", 1)}
  </div>

  <div class="card">
    <div class="mhead">
      <div>
        <h3>Button mapping</h3>
        <p class="muted">Pick which glove input drives each controller button. Trigger/Grip force the analog to full.</p>
      </div>
      <div class="hctl">
        <Segmented
          value={io.linked ? "Both hands" : "Per hand"}
          options={["Both hands", "Per hand"]}
          onchange={(v) => {
            io.linked = v === "Both hands";
            if (io.linked) {
              io.hands[1] = JSON.parse(JSON.stringify(io.hands[0]));
              applyHandIo(1);
            }
            saveIo();
          }}
        />
        <button class="btn text state-layer" onclick={reset}>Reset</button>
      </div>
    </div>
    <div class="maps">
      {#each cols as hand}
        <div class="padcol">
          {#if !io.linked}<div class="colh">{colName(hand)}</div>{/if}
          {@render handmap(hand, !io.linked && hand === 0)}
        </div>
      {/each}
    </div>
  </div>

  <div class="card">
    <h3>Trigger &amp; grip</h3>
    <p class="muted">Which finger drives each analog axis, and the curl range that maps to 0–100%.</p>
    <div class="grid" style="grid-template-columns: repeat({cols.length}, 1fr)">
      {#each cols as hand}
        <div class="col">
          {#if !io.linked}<div class="colh">{colName(hand)}</div>{/if}
          <div class="analog">
            <div class="arow">
              <span class="ml">Trigger</span>
              <Select value={FINGER_SEL[io.hands[hand].tFinger]} options={FINGER_SEL.slice(0, 5)} onchange={(n) => editFinger(hand, "tFinger", n)} />
            </div>
            <div class="arow">
              <DualRange low={io.hands[hand].tMin} high={io.hands[hand].tMax} onchange={(lo, hi) => editRange(hand, "t", lo, hi)} />
              <span class="mm">min{@render numField(hand, "tMin", io.hands[hand].tMin)}</span>
              <span class="mm">max{@render numField(hand, "tMax", io.hands[hand].tMax)}</span>
            </div>
          </div>
          <div class="analog">
            <div class="arow">
              <span class="ml">Grip</span>
              <Select value={FINGER_SEL[io.hands[hand].gFinger]} options={FINGER_SEL} onchange={(n) => editFinger(hand, "gFinger", n)} />
            </div>
            <div class="arow">
              <DualRange low={io.hands[hand].gMin} high={io.hands[hand].gMax} onchange={(lo, hi) => editRange(hand, "g", lo, hi)} />
              <span class="mm">min{@render numField(hand, "gMin", io.hands[hand].gMin)}</span>
              <span class="mm">max{@render numField(hand, "gMax", io.hands[hand].gMax)}</span>
            </div>
          </div>
        </div>
      {/each}
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
  .banner p {
    margin: 0;
    color: var(--on-surface-var);
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
  .cols2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .chead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
  }
  .cname {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .top {
    display: flex;
    gap: 18px;
    margin-bottom: 18px;
  }
  .joy {
    width: 96px;
    height: 96px;
    flex: none;
    border-radius: 50%;
    background: var(--surface-2);
    position: relative;
    border: 1px solid var(--outline-dim);
  }
  .joy.click {
    border-color: var(--primary);
  }
  .jdot {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary);
    transform: translate(-50%, -50%);
    transition: all 0.06s linear;
  }
  .btns {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 6px;
  }
  .pill {
    height: 32px;
    min-width: 36px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--muted);
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 13px;
    transition: all 0.1s var(--ease);
  }
  .pill.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .analogs {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .abar {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }
  .al {
    width: 64px;
    color: var(--on-surface-var);
    font-weight: 600;
  }
  .atrack {
    flex: 1;
    height: 10px;
    background: var(--track);
    border-radius: var(--radius-pill);
    overflow: hidden;
  }
  .afill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), #8f8bff);
    border-radius: var(--radius-pill);
    transition: width 0.08s linear;
  }
  .av {
    width: 40px;
    text-align: right;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .mhead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }
  .mhead .muted {
    margin: 4px 0 0;
  }
  .hctl {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .grid {
    display: grid;
    gap: 16px 28px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .colh {
    font-size: 12px;
    font-weight: 700;
    color: var(--on-surface-var);
  }
  .maps {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .padcol {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .handmap {
    position: relative;
    width: 100%;
    max-width: 680px;
    aspect-ratio: 680 / 380;
  }
  .hand {
    position: absolute;
    left: 1%;
    top: 50%;
    transform: translateY(-50%);
    height: 88%;
    width: auto;
    opacity: 0.8;
    pointer-events: none;
    user-select: none;
  }
  .mirror .hand {
    left: auto;
    right: 1%;
    transform: translateY(-50%) scaleX(-1);
  }
  .hnode {
    position: absolute;
    transform: translateY(-50%);
    width: 110px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .hlabel {
    font-size: 11px;
    font-weight: 700;
    color: var(--on-surface-var);
    padding-left: 3px;
  }
  .hnode.assigned .hlabel {
    color: var(--primary);
  }
  .ml {
    font-size: 14px;
    font-weight: 600;
    color: var(--on-surface-var);
  }
  .analog {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .arow {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .arow .ml {
    width: 56px;
    flex: none;
  }
  .mm {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .num {
    width: 56px;
    background: var(--surface-2);
    border: 1px solid var(--outline-dim);
    color: var(--on-surface);
    border-radius: var(--radius-s);
    height: 34px;
    padding: 0 8px;
    font-family: inherit;
    font-size: 13px;
    text-align: center;
    outline: none;
    -moz-appearance: textfield;
  }
  .num::-webkit-outer-spin-button,
  .num::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .num:focus {
    border-color: var(--primary);
  }
</style>
