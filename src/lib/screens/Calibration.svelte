<script lang="ts">
  import { app } from "$lib/state.svelte";
  import { sendCommand, CMD, FINGERS } from "$lib/api";

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(shm?.hands ?? []);
  const linked = $derived(hands.filter((h) => h.present && h.link === 3).length);

  const poses = [
    { emoji: "✊", title: "Make a fist", hint: "Curl all fingers loosely.", cmd: CMD.CALIB_FIST, sound: "fist" },
    { emoji: "🤚", title: "Fingers together", hint: "Flat hand, fingers straight and touching.", cmd: CMD.CALIB_TOGETHER, sound: "together" },
    { emoji: "🖐️", title: "Spread fingers", hint: "Flat hand, fingers spread wide apart.", cmd: CMD.CALIB_SPREAD, sound: "spread" },
  ];

  const HOLD = 4; // seconds to hold each pose before capture

  let phase = $state<"intro" | "running" | "done">("intro");
  let poseIndex = $state(0);
  let countdown = $state(0); // seconds remaining; 0 = capturing
  let cancelled = false;

  // Voice/sound cues — drop matching mp3s in static/sounds/ (see its README).
  const ls = typeof localStorage !== "undefined" ? localStorage : null;
  let soundOn = $state(ls?.getItem("udcap.calibSound") !== "0");
  function toggleSound() {
    soundOn = !soundOn;
    ls?.setItem("udcap.calibSound", soundOn ? "1" : "0");
  }
  function play(name: string) {
    if (!soundOn) return;
    try {
      new Audio(`/sounds/${name}.mp3`).play().catch(() => {});
    } catch {
      /* missing file / no audio — ignore */
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function run() {
    cancelled = false;
    phase = "running";
    play("start");
    await sendCommand(CMD.CALIB_START);
    for (let i = 0; i < poses.length; i++) {
      poseIndex = i;
      play(poses[i].sound);
      for (let s = HOLD; s > 0; s--) {
        if (cancelled) return;
        countdown = s;
        await sleep(1000);
      }
      if (cancelled) return;
      countdown = 0; // "captured" flash
      play("captured");
      await sendCommand(poses[i].cmd);
      await sleep(500);
    }
    if (cancelled) return;
    play("done");
    await sendCommand(CMD.CALIB_COMPLETE);
    phase = "done";
  }

  function cancel() {
    cancelled = true;
    sendCommand(CMD.CALIB_CANCEL);
    phase = "intro";
  }
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
          Put the gloves on. After you press start, follow the on-screen poses — each is captured
          automatically after a short countdown, so keep both hands free.
        </p>
        <div class="poserow">
          {#each poses as p}
            <div class="posecard"><span class="pemoji">{p.emoji}</span><span>{p.title}</span></div>
          {/each}
        </div>
        <div class="actions">
          <button class="btn filled state-layer" onclick={run}>Start calibration</button>
          <button class="btn text state-layer" onclick={toggleSound} title="Voice cues">
            {soundOn ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
        </div>
        {#if linked === 1}<p class="warn">Only one glove is linked — the other won't be calibrated.</p>{/if}
      </div>
    {:else if phase === "running"}
      {@const pose = poses[poseIndex]}
      <div class="center">
        <div class="steps">
          {#each poses as _, s}<span class="sdot" class:done={poseIndex > s} class:active={poseIndex === s}></span>{/each}
        </div>
        <div class="big">{pose.emoji}</div>
        <h2>{pose.title}</h2>
        <p class="muted">{pose.hint}</p>

        <div class="counter" class:capturing={countdown === 0}>
          {#if countdown > 0}{countdown}{:else}Captured ✓{/if}
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

        <button class="btn text state-layer" onclick={cancel}>Cancel</button>
      </div>
    {:else}
      <div class="center">
        <div class="big">✅</div>
        <h2>Calibration complete</h2>
        <p class="muted">Finger tracking should now match your hands.</p>
        <button class="btn tonal state-layer" onclick={() => (phase = "intro")}>Calibrate again</button>
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
    max-width: 440px;
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
