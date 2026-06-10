<script lang="ts">
  import { app } from "$lib/state.svelte";
  import { sendCommand, CMD, FINGERS } from "$lib/api";

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(shm?.hands ?? []);
  const linked = $derived(hands.filter((h) => h.present && h.link === 3).length);

  // 0 intro · 1 fist · 2 together · 3 spread · 4 done
  let step = $state(0);

  const poses = [
    { emoji: "✊", title: "Lightly make a fist", hint: "Curl all fingers loosely.", cmd: CMD.CALIB_FIST },
    { emoji: "🤚", title: "Close five fingers together", hint: "Flat hand, fingers straight and touching.", cmd: CMD.CALIB_TOGETHER },
    { emoji: "🖐️", title: "Spread out five fingers", hint: "Flat hand, fingers spread wide apart.", cmd: CMD.CALIB_SPREAD },
  ];

  async function start() {
    await sendCommand(CMD.CALIB_START);
    step = 1;
  }
  async function capture() {
    const pose = poses[step - 1];
    await sendCommand(pose.cmd);
    if (step === 3) {
      await sendCommand(CMD.CALIB_COMPLETE);
      step = 4;
    } else {
      step += 1;
    }
  }
  function restart() {
    step = 0;
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
    {:else if step === 0}
      <div class="center">
        <h2>Calibrate both hands</h2>
        <p class="muted">Put the gloves on. We'll capture three quick poses on each hand.</p>
        <div class="poserow">
          {#each poses as p}
            <div class="posecard"><span class="pemoji">{p.emoji}</span><span>{p.title}</span></div>
          {/each}
        </div>
        <button class="btn filled state-layer" onclick={start}>Start calibration</button>
        {#if linked === 1}<p class="warn">Only one glove is linked — the other won't be calibrated.</p>{/if}
      </div>
    {:else if step >= 1 && step <= 3}
      {@const pose = poses[step - 1]}
      <div class="center">
        <div class="steps">
          {#each [1, 2, 3] as s}<span class="sdot" class:done={step > s} class:active={step === s}></span>{/each}
        </div>
        <div class="big">{pose.emoji}</div>
        <h2>{pose.title}</h2>
        <p class="muted">{pose.hint}  Hold the pose, then capture.</p>

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

        <button class="btn filled state-layer" onclick={capture}>
          {step === 3 ? "Capture & finish" : "Capture"}
        </button>
      </div>
    {:else}
      <div class="center">
        <div class="big">✅</div>
        <h2>Calibration complete</h2>
        <p class="muted">Finger tracking should now match your hands.</p>
        <button class="btn tonal state-layer" onclick={restart}>Calibrate again</button>
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
  .muted {
    color: var(--muted);
    margin: 0;
    max-width: 420px;
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
    height: 60px;
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
