<script lang="ts">
  import {
    app,
    curl,
    saveCurlGain,
    curlRanges,
    saveCurlRanges,
    applyCurlRange,
    CURL_GAIN_MAX,
  } from "$lib/state.svelte";
  import { FINGERS, setCurlGain } from "$lib/api";
  import FingerRange from "$lib/components/FingerRange.svelte";

  const GAIN_MIN = 0.3;
  function editGain(v: number) {
    curl.gain = Math.round(v * 100) / 100;
    setCurlGain(curl.gain).catch(() => {});
    saveCurlGain();
  }

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(shm?.hands ?? []);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  function change(hand: number, finger: number, min: number, max: number) {
    curlRanges[hand][finger] = [min, max];
    applyCurlRange(hand, finger);
    saveCurlRanges();
  }
  function reset(hand: number) {
    for (let f = 0; f < 5; f++) change(hand, f, 0, 1);
  }
  // Range calibration: wiggle each finger through its full motion; we track the
  // smoothed min/max it reaches per finger (the EMA keeps a stray spike from
  // setting the extreme), then write those as the per-finger range.
  let wigglePhase = $state<"idle" | "ready" | "recording">("idle");
  let wiggleCount = $state(0);
  let wMin: number[][] = [];
  let wMax: number[][] = [];
  let wEma: number[][] = [];
  let wSampler: ReturnType<typeof setInterval> | undefined;

  function startWiggle() {
    if (wigglePhase !== "idle") return;
    wigglePhase = "ready";
    wiggleCount = 3;
    const ready = () => {
      wiggleCount -= 1;
      if (wiggleCount <= 0) recordWiggle();
      else setTimeout(ready, 1000);
    };
    setTimeout(ready, 1000);
  }
  function recordWiggle() {
    wigglePhase = "recording";
    wiggleCount = 6;
    wMin = [[], []];
    wMax = [[], []];
    wEma = [[], []];
    for (let h = 0; h < 2; h++)
      for (let f = 0; f < 5; f++) {
        const c = hands[h]?.curl[f] ?? 0;
        wEma[h][f] = c;
        wMin[h][f] = c;
        wMax[h][f] = c;
      }
    wSampler = setInterval(() => {
      for (let h = 0; h < 2; h++) {
        if (!hands[h]?.present) continue;
        for (let f = 0; f < 5; f++) {
          wEma[h][f] = 0.5 * wEma[h][f] + 0.5 * (hands[h].curl[f] ?? 0);
          const s = wEma[h][f];
          if (s < wMin[h][f]) wMin[h][f] = s;
          if (s > wMax[h][f]) wMax[h][f] = s;
        }
      }
    }, 40);
    const cd = () => {
      wiggleCount -= 1;
      if (wiggleCount <= 0) {
        clearInterval(wSampler);
        finishWiggle();
      } else setTimeout(cd, 1000);
    };
    setTimeout(cd, 1000);
  }
  function finishWiggle() {
    for (let h = 0; h < 2; h++) {
      if (!hands[h]?.present) continue;
      for (let f = 0; f < 5; f++) {
        const mn = Math.max(0, r2(wMin[h][f]));
        const mx = Math.min(1, r2(wMax[h][f]));
        if (mx - mn >= 0.08) change(h, f, mn, mx); // only if a real range was seen
      }
    }
    wigglePhase = "idle";
  }
</script>

{#snippet handCard(hand: number, name: string)}
  <div class="card">
    <div class="chead">
      <h3>{name} hand</h3>
      <button class="btn text state-layer" onclick={() => reset(hand)}>Reset</button>
    </div>
    {#if !hands[hand]?.present}
      <p class="muted">No glove — connect to tune.</p>
    {:else}
      <div class="rows">
        {#each FINGERS as f, i}
          <FingerRange
            label={f}
            raw={hands[hand].curl[i] ?? 0}
            min={curlRanges[hand][i][0]}
            max={curlRanges[hand][i][1]}
            onchange={(mn, mx) => change(hand, i, mn, mx)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="screen">
  <div class="card head">
    <div>
      <h3>Finger curl ranges</h3>
      <p class="muted">
        Drag the handles to set where each finger reaches 0% and 100% curl. The green line is the
        live reading; the bar below is what the game receives. Applies instantly.
      </p>
    </div>
  </div>

  <div class="card strength">
    <div class="sh">
      <div>
        <h3>Curl strength</h3>
        <p class="muted">How far a full curl closes the hand. Turn down if your avatar's fingers over-curl.</p>
      </div>
      <span class="sval">{Math.round((curl.gain / CURL_GAIN_MAX) * 100)}%</span>
    </div>
    <input
      type="range"
      min={GAIN_MIN}
      max={CURL_GAIN_MAX}
      step="0.05"
      value={curl.gain}
      oninput={(e) => editGain(parseFloat(e.currentTarget.value))}
    />
  </div>

  {#if !live}
    <div class="card banner"><p>Start the server and connect gloves to see live readings.</p></div>
  {/if}

  <div class="cols">
    {@render handCard(0, "Left")}
    {@render handCard(1, "Right")}
  </div>

  <div class="card quickset">
    <div class="qhead">
      <h3>Finger range calibration</h3>
      <p class="muted">
        Click, then wiggle each finger through its full motion (open ⇄ fully curled) a few times. It records
        the smoothed min/max each finger reaches and sets the per-finger range — so anatomy-limited fingers
        (the ring rests slightly curled, the thumb's range is shorter) map cleanly. Saved automatically.
      </p>
    </div>
    <div class="qbtns">
      <button class="btn tonal state-layer wide" disabled={!live || wigglePhase !== "idle"} onclick={startWiggle}>
        {#if wigglePhase === "ready"}
          Get ready… {wiggleCount}
        {:else if wigglePhase === "recording"}
          Wiggle your fingers! {wiggleCount}
        {:else}
          Calibrate finger range
        {/if}
      </button>
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
  .muted {
    color: var(--muted);
    margin: 4px 0 0;
    font-size: 13px;
  }
  .banner p {
    margin: 0;
    color: var(--on-surface-var);
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .quickset {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .qhead p {
    margin: 4px 0 0;
    max-width: 58ch;
  }
  .qbtns {
    display: flex;
    gap: 10px;
    flex: none;
  }
  .chead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .sh {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
  }
  .sval {
    font-size: 20px;
    font-weight: 800;
    color: var(--primary);
    font-variant-numeric: tabular-nums;
  }
  .strength input[type="range"] {
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--track);
    outline: none;
  }
  .strength input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--primary);
    border: 2px solid var(--surface-1);
    cursor: pointer;
  }
  .strength input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--primary);
    border: 2px solid var(--surface-1);
    cursor: pointer;
  }
</style>
