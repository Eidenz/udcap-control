<script lang="ts">
  import { onMount } from "svelte";
  import {
    app,
    calibSound,
    toggleCalibSound,
    curl,
    saveCurlGain,
    splay,
    saveSplayGain,
    curlRanges,
    saveCurlRanges,
    applyCurlRange,
    CURL_GAIN_MAX,
    SPLAY_GAIN_MAX,
  } from "$lib/state.svelte";
  import { sendCommand, CMD, FINGERS, setCurlGain, setSplayGain } from "$lib/api";
  import Page from "$lib/components/Page.svelte";
  import HandPose, { type Pose } from "$lib/components/HandPose.svelte";
  import RangeV from "$lib/components/RangeV.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import Icon from "$lib/components/Icon.svelte";

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(live ? (shm?.hands ?? []) : []);
  const linkedHands = $derived(hands.filter((h) => h.present && h.link === 3));
  const allCalibrated = $derived(linkedHands.length > 0 && linkedHands.every((h) => h.calibrated));

  // --- Calibration ----------------------------------------------------------
  // The server drives the timed sequence (so the glove button works too); we
  // reflect calib_state: 7 = get ready, 1..3 = holding a pose, 4 = captured,
  // 5 = done, 6 = failed.
  const POSES: { short: string; title: string; hint: string; stage: string; pose: Pose }[] = [
    { short: "Fist", title: "Make a fist", hint: "Curl every finger", stage: "Curl all fingers loosely.", pose: "fist" },
    { short: "Together", title: "Fingers together", hint: "Flat, straight, touching", stage: "Flat hands, fingers straight and touching. Hold still.", pose: "together" },
    { short: "Spread", title: "Spread fingers", hint: "Flat, spread wide", stage: "Flat hands, fingers spread wide apart.", pose: "spread" },
  ];
  const HOLD = 4;
  const READY = 3;
  const RING = 2 * Math.PI * 56;

  const calibState = $derived(live ? (shm?.calib_state ?? 0) : 0);
  const running = $derived(calibState === 7 || (calibState >= 1 && calibState <= 4));
  const getReady = $derived(calibState === 7);
  const poseIndex = $derived(Math.max(0, Math.min(2, calibState - 1)));
  const captured = $derived(calibState === 4);
  const failed = $derived(calibState === 6);
  const canCalibrate = $derived(live && linkedHands.length > 0);

  let countdown = $state(READY);
  $effect(() => {
    countdown = calibState === 7 ? READY : HOLD; // restart on each step
  });
  onMount(() => {
    const t = setInterval(() => {
      if (countdown > 0) countdown -= 1;
    }, 1000);
    return () => clearInterval(t);
  });
  const ringOffset = $derived(RING * (1 - countdown / (getReady ? READY : HOLD)));

  const start = () => sendCommand(CMD.CALIB_AUTO).catch(() => {});
  const cancel = () => sendCommand(CMD.CALIB_CANCEL).catch(() => {});

  // --- Finger ranges -----------------------------------------------------------
  function change(hand: number, finger: number, min: number, max: number) {
    curlRanges[hand][finger] = [min, max];
    applyCurlRange(hand, finger);
    saveCurlRanges();
  }
  function resetRanges() {
    for (let h = 0; h < 2; h++) for (let f = 0; f < 5; f++) change(h, f, 0, 1);
  }

  // Auto-range: open and close the hands for a few seconds; we keep the
  // smoothed min/max each finger reaches (the EMA keeps a stray spike from
  // setting the extreme), then write those as its range.
  const r2 = (n: number) => Math.round(n * 100) / 100;
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

  // --- Strength ------------------------------------------------------------------
  const GAIN_MIN = 0.3;
  function editGain(v: number) {
    curl.gain = r2(v);
    setCurlGain(curl.gain).catch(() => {});
    saveCurlGain();
  }
  function editSplay(v: number) {
    splay.gain = r2(v);
    setSplayGain(splay.gain).catch(() => {});
    saveSplayGain();
  }
  const fill = (v: number, lo: number, hi: number) => `${((v - lo) / (hi - lo)) * 100}%`;
</script>

<Page title="Hands" subtitle={running ? "Calibrating both hands" : "Calibration and finger tuning"}>
  {#snippet actions()}
    <span class="cues">Voice cues</span>
    <Toggle label="Voice cues" checked={calibSound.on} onchange={() => toggleCalibSound()} />
  {/snippet}

  {#if running}
    {@const pose = POSES[poseIndex]}
    <section class="card stage" aria-label="Calibration in progress" aria-live="polite">
      <ol class="steps">
        {#each POSES as p, s}
          {#if s > 0}<li class="joint" class:done={!getReady && (poseIndex >= s || captured)} aria-hidden="true"></li>{/if}
          <li
            class="step"
            class:done={!getReady && (poseIndex > s || captured)}
            class:cur={!getReady && poseIndex === s && !captured}
            aria-current={!getReady && poseIndex === s && !captured ? "step" : undefined}
          >
            <span class="num">
              {#if !getReady && (poseIndex > s || captured)}<Icon name="check" size={12} stroke={3} />{:else}{s + 1}{/if}
            </span>{p.short}
          </li>
        {/each}
      </ol>

      <div class="stagerow">
        <div class="glyphs">
          <HandPose pose={getReady ? "relaxed" : pose.pose} size={170} muted={getReady} />
          <HandPose pose={getReady ? "relaxed" : pose.pose} size={170} mirror muted={getReady} />
        </div>
        <div class="ring">
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r="56" fill="none" stroke="var(--track)" stroke-width="8" />
            <circle
              class="progress"
              cx="66"
              cy="66"
              r="56"
              fill="none"
              stroke="var(--accent)"
              stroke-width="8"
              stroke-linecap="round"
              stroke-dasharray={RING}
              stroke-dashoffset={captured ? 0 : ringOffset}
              transform="rotate(-90 66 66)"
            />
          </svg>
          <div class="count">
            {#if captured}
              <Icon name="check" size={40} stroke={2.5} />
            {:else}
              <b>{countdown > 0 ? countdown : "…"}</b><span>seconds</span>
            {/if}
          </div>
        </div>
      </div>

      <div class="stagetext">
        <h2>{getReady ? "Get ready" : captured ? "Captured" : pose.title}</h2>
        <p>{getReady ? "Put the gloves on and relax your hands." : captured ? "Checking the calibration…" : pose.stage}</p>
      </div>

      <div class="stagefoot">
        <button class="btn tonal" onclick={cancel}>Cancel</button>
        {#if calibSound.on}<span class="hint cueson"><Icon name="speaker" size={14} />Voice cues on</span>{/if}
      </div>
    </section>
  {:else}
    <section class="card" aria-labelledby="cal-h">
      <div class="card-head">
        <div class="grow">
          <h2 id="cal-h">Calibration</h2>
          <p class="desc">
            {#if !canCalibrate}
              Three poses, both hands at once. Start the server and power on the gloves first.
            {:else if linkedHands.length === 1}
              Only one glove is linked, so only that hand gets calibrated.
            {:else if failed}
              The last calibration didn't finish. Try again with full, steady poses.
            {:else}
              Three poses, about 4 seconds each, both hands at once. A glove's power button starts it too.
            {/if}
          </p>
        </div>
        {#if allCalibrated}<span class="chip good"><span class="pip"></span>Calibrated</span>{/if}
        <button class="btn filled" disabled={!canCalibrate} onclick={start}>{allCalibrated ? "Calibrate again" : "Start calibration"}</button>
      </div>
      <div class="poses">
        {#each POSES as p, i}
          <div class="pose">
            <HandPose pose={p.pose} size={72} />
            <div>
              <div class="pnum">Step {i + 1}</div>
              <div class="ptitle">{p.title}</div>
              <div class="hint">{p.hint}</div>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="card ranges-card grow-y" aria-labelledby="ranges-h">
      <div class="card-head">
        <div class="grow">
          <h2 id="ranges-h">Finger ranges</h2>
          <p class="desc">
            Where each finger reads 0% and 100%. Drag the handles, or use Auto-range and open and close your hands for a
            few seconds.
          </p>
        </div>
        <button class="btn tonal sm" disabled={!live || wigglePhase !== "idle"} onclick={startWiggle}>
          <Icon name="refresh" size={14} stroke={2} />
          {#if wigglePhase === "ready"}
            Get ready… {wiggleCount}
          {:else if wigglePhase === "recording"}
            Open and close… {wiggleCount}
          {:else}
            Auto-range
          {/if}
        </button>
        <button class="btn text sm" onclick={resetRanges}>Reset</button>
      </div>
      <div class="ranges">
        {#each [0, 1] as hand}
          {@const h = hands[hand]}
          <div class="inset">
            <div class="ihead">
              <span>{hand === 0 ? "Left hand" : "Right hand"}</span>
              {#if !h?.present}<span class="hint">No glove</span>{/if}
            </div>
            <div class="gauges">
              {#each FINGERS as f, i}
                <RangeV
                  label={f}
                  min={curlRanges[hand][i][0]}
                  max={curlRanges[hand][i][1]}
                  live={h?.present ? (h.curl[i] ?? 0) : null}
                  onchange={(mn, mx) => change(hand, i, mn, mx)}
                />
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="card strength" aria-label="Strength">
      <label>
        <span class="shead"><span>Curl strength</span><b>{Math.round((curl.gain / CURL_GAIN_MAX) * 100)}%</b></span>
        <input
          type="range"
          min={GAIN_MIN}
          max={CURL_GAIN_MAX}
          step="0.05"
          value={curl.gain}
          style="--fill:{fill(curl.gain, GAIN_MIN, CURL_GAIN_MAX)}"
          oninput={(e) => editGain(parseFloat(e.currentTarget.value))}
        />
        <span class="hint">How far a full curl closes the hand. Lower it if your avatar's fingers over-curl.</span>
      </label>
      <label>
        <span class="shead"><span>Splay strength</span><b>{Math.round((splay.gain / SPLAY_GAIN_MAX) * 100)}%</b></span>
        <input
          type="range"
          min="0"
          max={SPLAY_GAIN_MAX}
          step="0.05"
          value={splay.gain}
          style="--fill:{fill(splay.gain, 0, SPLAY_GAIN_MAX)}"
          oninput={(e) => editSplay(parseFloat(e.currentTarget.value))}
        />
        <span class="hint">How far the fingers spread sideways. 0% turns splay off.</span>
      </label>
    </section>
  {/if}
</Page>

<style>
  .cues {
    font-size: 13px;
    color: var(--text-2);
  }
  .poses {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
    margin-top: 14px;
  }
  .pose {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--inset);
    border-radius: var(--radius-inner);
  }
  .pnum {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-3);
  }
  .ptitle {
    font-size: 13px;
    font-weight: 600;
  }

  .ranges-card {
    display: flex;
    flex-direction: column;
  }
  .ranges {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
    margin-top: 16px;
  }
  .inset {
    display: flex;
    flex-direction: column;
    padding: 14px 12px 12px;
    background: var(--inset);
    border-radius: var(--radius-inner);
  }
  .ihead {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 600;
  }
  .gauges {
    flex: 1;
    display: flex;
    justify-content: space-around;
  }

  .strength {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 24px;
  }
  .strength label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .shead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 14px;
    font-weight: 600;
  }
  .shead b {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
  }

  /* calibration in progress */
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
    padding: 24px;
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-3);
  }
  .step.cur {
    color: var(--text);
    font-weight: 600;
  }
  .step.done {
    color: var(--text-2);
  }
  .num {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--outline);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
  }
  .step.cur .num {
    background: var(--accent);
    box-shadow: none;
    color: var(--on-accent);
  }
  .step.done .num {
    background: var(--success-soft);
    box-shadow: none;
    color: var(--success-text);
  }
  .joint {
    width: 36px;
    height: 2px;
    border-radius: 1px;
    background: var(--border-strong);
  }
  .joint.done {
    background: var(--success);
  }
  .stagerow {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 40px;
    flex-wrap: wrap;
  }
  .glyphs {
    display: flex;
    gap: 8px;
  }
  .ring {
    position: relative;
    width: 132px;
    height: 132px;
    flex: none;
  }
  .progress {
    transition: stroke-dashoffset 1s linear;
  }
  .count {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--success-text);
  }
  .count b {
    font-family: var(--font-display);
    font-size: 46px;
    font-weight: 700;
    line-height: 1;
    color: var(--text);
  }
  .count span {
    font-size: 11px;
    color: var(--text-3);
  }
  .stagetext {
    text-align: center;
  }
  .stagetext h2 {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.015em;
  }
  .stagetext p {
    margin-top: 6px;
    color: var(--text-2);
  }
  .stagefoot {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .cueson {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
