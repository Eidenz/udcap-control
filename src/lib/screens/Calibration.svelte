<script lang="ts">
  import { onMount } from "svelte";
  import { app, calibSound, toggleCalibSound } from "$lib/state.svelte";
  import { sendCommand, CMD, FINGERS } from "$lib/api";

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(shm?.hands ?? []);
  const linked = $derived(hands.filter((h) => h.present && h.link === 3).length);

  const poses = [
    { emoji: "✊", title: "Make a fist", hint: "Curl all fingers loosely." },
    { emoji: "🤚", title: "Fingers together", hint: "Flat hand, fingers straight and touching." },
    { emoji: "🖐️", title: "Spread fingers", hint: "Flat hand, fingers spread wide apart." },
  ];
  const HOLD = 4;
  const READY = 3;

  // The server drives the timed sequence (so the glove button works too); we
  // just reflect calib_state. 7=READY, 1=STARTED .. 4=GOT_SPREAD, 5=DONE.
  const calibState = $derived(shm?.calib_state ?? 0);
  const phase = $derived(
    calibState === 5
      ? "done"
      : calibState === 7 || (calibState >= 1 && calibState <= 4)
        ? "running"
        : "intro",
  );
  const getReady = $derived(calibState === 7);
  const poseIndex = $derived(Math.max(0, Math.min(2, calibState - 1)));
  const capturing = $derived(calibState === 4);

  let countdown = $state(READY);
  $effect(() => {
    countdown = calibState === 7 ? READY : HOLD; // reset on each step change
  });
  onMount(() => {
    const t = setInterval(() => {
      if (countdown > 0) countdown -= 1;
    }, 1000);
    return () => clearInterval(t);
  });

  const start = () => sendCommand(CMD.CALIB_AUTO);
  const cancel = () => sendCommand(CMD.CALIB_CANCEL);
</script>

<div class="screen">
  <div class="card panel">
    {#if !live || linked === 0}
      <div class="center">
        <div class="big">🧤</div>
        <h2>Connect your gloves first</h2>
        <p class="muted">Start the server and power on both gloves (linked, not pairing).</p>
      </div>
    {:else if phase === "intro"}
      <div class="center">
        <h2>Calibrate both hands</h2>
        <p class="muted">
          Put the gloves on, then start — or press the <b>side (power) button</b> on a glove any time,
          even in VR. Follow the poses; each is captured automatically after a short countdown.
        </p>
        <div class="poserow">
          {#each poses as p}
            <div class="posecard"><span class="pemoji">{p.emoji}</span><span>{p.title}</span></div>
          {/each}
        </div>
        <div class="actions">
          <button class="btn filled state-layer" onclick={start}>Start calibration</button>
          <button class="btn text state-layer" onclick={toggleCalibSound} title="Voice cues">
            {calibSound.on ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
        </div>
        {#if linked === 1}<p class="warn">Only one glove is linked — the other won't be calibrated.</p>{/if}
      </div>
    {:else if phase === "running"}
      <div class="center">
        {#if getReady}
          <div class="big">⏳</div>
          <h2>Get ready…</h2>
          <p class="muted">Put the gloves on and relax your hands.</p>
          <div class="counter">{countdown > 0 ? countdown : "…"}</div>
        {:else}
          {@const pose = poses[poseIndex]}
          <div class="steps">
            {#each poses as _, s}<span class="sdot" class:done={poseIndex > s} class:active={poseIndex === s}></span>{/each}
          </div>
          <div class="big">{pose.emoji}</div>
          <h2>{pose.title}</h2>
          <p class="muted">{pose.hint}</p>

          <div class="counter" class:capturing={capturing || countdown === 0}>
            {#if capturing}Captured ✓{:else if countdown > 0}{countdown}{:else}…{/if}
          </div>

          <div class="preview">
            {#each hands as h, hi}
              {#if h.present}
                <div class="phand">
                  <span class="plabel">{hi === 0 ? "L" : "R"}</span>
                  {#each FINGERS as _, i}
                    <div class="pbar"><div class="pfill" style="height:{(h.curl[i] ?? 0) * 100}%"></div></div>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <button class="btn text state-layer" onclick={cancel}>Cancel</button>
      </div>
    {:else}
      <div class="center">
        <div class="big">✅</div>
        <h2>Calibration complete</h2>
        <p class="muted">Finger tracking should now match your hands.</p>
        <button class="btn tonal state-layer" onclick={start}>Calibrate again</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .screen {
    max-width: 720px;
    margin: 0 auto;
  }
  .panel {
    padding: 40px;
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
  }
  .big {
    font-size: 72px;
    line-height: 1;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .muted {
    color: var(--muted);
    margin: 0;
    max-width: 460px;
  }
  .warn {
    color: var(--warn);
    margin: 0;
    font-size: 13px;
  }
  .poserow {
    display: flex;
    gap: 12px;
    margin: 8px 0;
  }
  .posecard {
    flex: 1;
    background: var(--surface-2);
    border-radius: var(--radius-m);
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--on-surface-var);
  }
  .pemoji {
    font-size: 34px;
  }
  .steps {
    display: flex;
    gap: 8px;
  }
  .sdot {
    width: 28px;
    height: 5px;
    border-radius: 3px;
    background: var(--track);
  }
  .sdot.active {
    background: var(--primary);
  }
  .sdot.done {
    background: var(--success);
  }
  .counter {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 40px;
    font-weight: 800;
    color: var(--primary);
    background: var(--primary-container);
    font-variant-numeric: tabular-nums;
  }
  .counter.capturing {
    font-size: 20px;
    color: var(--success);
    background: rgba(132, 224, 164, 0.16);
  }
  .preview {
    display: flex;
    gap: 24px;
  }
  .phand {
    display: flex;
    align-items: flex-end;
    gap: 5px;
  }
  .plabel {
    color: var(--muted);
    font-weight: 700;
    align-self: center;
    margin-right: 4px;
  }
  .pbar {
    width: 12px;
    height: 56px;
    background: var(--track);
    border-radius: var(--radius-pill);
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .pfill {
    width: 100%;
    background: var(--primary);
    transition: height 0.08s linear;
  }
</style>
