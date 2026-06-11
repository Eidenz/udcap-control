<script lang="ts">
  import { onMount } from "svelte";
  import { app, appMode, setMode } from "$lib/state.svelte";
  import { FINGERS, udevStatus, udevInstall, type HandView, type UdevStatus } from "$lib/api";
  import Segmented from "$lib/components/Segmented.svelte";

  let { onCalibrate }: { onCalibrate: () => void } = $props();

  let udev = $state<UdevStatus | null>(null);
  let installing = $state(false);
  const udevOk = $derived(!!udev && udev.installed && udev.up_to_date);

  onMount(refreshUdev);
  async function refreshUdev() {
    try {
      udev = await udevStatus();
    } catch {
      udev = null;
    }
  }
  async function installUdev() {
    installing = true;
    try {
      await udevInstall();
      await refreshUdev();
    } catch (_) {
      /* user cancelled */
    } finally {
      installing = false;
    }
  }

  const shm = $derived(app.status?.shm ?? null);
  const running = $derived(app.status?.server_running ?? false);
  const live = $derived(running || (!!shm && shm.server_pid !== 0));
  const shmError = $derived(app.status?.shm_error ?? null);
  const hands = $derived(shm?.hands ?? []);
  const ready = $derived(hands.length === 2 && hands.every((h) => h.present && h.calibrated));

  const fingerKey = ["T", "I", "M", "R", "P"];
</script>

{#snippet glove(h: HandView | undefined, name: string)}
  <div class="card glove" class:dim={!h?.present}>
    <div class="ghead">
      <div class="gname">
        <span class="dot" class:on={h?.present && h.link === 3} class:warn={h?.present && h.link !== 3}></span>
        <h3>{name}</h3>
      </div>
      {#if h?.present}
        <span class="chip" class:good={h.calibrated}>{h.calibrated ? "Calibrated" : "Not calibrated"}</span>
      {/if}
    </div>

    {#if !h?.present}
      <p class="empty">No glove detected</p>
    {:else}
      <div class="stats">
        <div class="stat">
          <span class="sval">{h.battery ? `${h.battery * 20}%` : "—"}</span><span class="slabel">Battery</span>
        </div>
        <div class="stat">
          <span class="sval">{Math.round(h.fps)}</span><span class="slabel">FPS</span>
        </div>
        <div class="stat">
          <span class="sval mono">{h.fw || "—"}</span><span class="slabel">Firmware</span>
        </div>
      </div>

      <div class="fingers">
        {#each FINGERS as f, i}
          <div class="finger">
            <div class="ftrack"><div class="ffill" style="height:{(h.curl[i] ?? 0) * 100}%"></div></div>
            <span class="flabel">{fingerKey[i]}</span>
          </div>
        {/each}
      </div>

      <div class="controls">
        <div class="btns">
          <span class="pill" class:on={h.btn_a}>A</span>
          <span class="pill" class:on={h.btn_b}>B</span>
          <span class="pill" class:on={h.btn_menu}>☰</span>
        </div>
        <div class="analogs">
          <div class="abar"><span>Trigger</span><div class="atrack"><div class="afill" style="width:{h.trigger * 100}%"></div></div></div>
          <div class="abar"><span>Grip</span><div class="atrack"><div class="afill" style="width:{h.grip * 100}%"></div></div></div>
        </div>
        <div class="joy" class:click={h.btn_joy}>
          <span class="jdot" style="left:{50 + h.joy_x * 38}%;top:{50 - h.joy_y * 38}%"></span>
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<div class="screen">
  <div class="card mode">
    <div>
      <h3>Runtime mode</h3>
      <p class="muted">
        Which VR runtime you play in. This switches the hand-alignment offsets (in the Space tab) to that
        runtime's set — they tune differently.
      </p>
    </div>
    <Segmented
      value={appMode.mode === "steamvr" ? "SteamVR" : "Monado"}
      options={["Monado", "SteamVR"]}
      onchange={(v) => setMode(v === "SteamVR" ? "steamvr" : "monado")}
    />
  </div>

  {#if udev && !udevOk}
    <div class="card setup">
      <div>
        <h3>{udev.installed ? "Update device permissions" : "Set up device permissions"}</h3>
        <p class="muted">
          {udev.installed
            ? "The installed udev rule is out of date — reinstall it."
            : "Install a udev rule so the app can reach the glove dongles without sudo. Asks for your password once."}
        </p>
      </div>
      <button class="btn filled state-layer" disabled={installing} onclick={installUdev}>
        {installing ? "Installing…" : "Install"}
      </button>
    </div>
  {/if}

  {#if !live}
    <div class="card banner">
      <p>The server isn't running. Press <b>Start server</b> (top right) to connect to your gloves.</p>
    </div>
  {:else if shmError}
    <div class="card banner err">
      <p>Server is running but the shared memory can't be read: <code>{shmError}</code></p>
    </div>
  {/if}

  <div class="gloves">
    {@render glove(hands[0], "Left")}
    {@render glove(hands[1], "Right")}
  </div>

  <div class="card cta">
    <div>
      <h3>{ready ? "Ready for VR" : "Calibration needed"}</h3>
      <p class="muted">
        {ready
          ? "Both gloves are calibrated and streaming."
          : "Run a quick calibration so finger tracking is accurate."}
      </p>
    </div>
    <button class="btn filled state-layer" onclick={onCalibrate}>Calibrate</button>
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
  .banner.err {
    border: 1px solid var(--error);
  }
  .banner.err code {
    background: var(--surface-2);
    padding: 1px 6px;
    border-radius: 5px;
    color: var(--error);
    font-size: 12px;
  }
  .setup {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border: 1px solid var(--primary-container);
  }
  .setup p {
    margin: 4px 0 0;
  }
  .mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .mode h3 {
    margin: 0;
  }
  .mode p {
    margin: 4px 0 0;
    max-width: 46ch;
  }
  .gloves {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .glove.dim {
    opacity: 0.6;
  }
  .ghead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .gname {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .chip.good {
    background: rgba(132, 224, 164, 0.16);
    color: var(--success);
  }
  .empty {
    color: var(--muted);
    margin: 8px 0 0;
  }
  .stats {
    display: flex;
    gap: 10px;
    margin-bottom: 18px;
  }
  .stat {
    flex: 1;
    background: var(--surface-2);
    border-radius: var(--radius-m);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sval {
    font-size: 20px;
    font-weight: 700;
  }
  .sval.mono {
    font-size: 14px;
    font-family: ui-monospace, monospace;
  }
  .slabel {
    font-size: 11px;
    color: var(--muted);
  }
  .fingers {
    display: flex;
    gap: 12px;
    justify-content: space-around;
    margin-bottom: 18px;
  }
  .finger {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .ftrack {
    width: 22px;
    height: 96px;
    background: var(--track);
    border-radius: var(--radius-pill);
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .ffill {
    width: 100%;
    background: linear-gradient(var(--primary), #8f8bff);
    border-radius: var(--radius-pill);
    transition: height 0.08s linear;
  }
  .flabel {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .btns {
    display: flex;
    gap: 6px;
  }
  .pill {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--muted);
    display: grid;
    place-items: center;
    font-weight: 700;
    transition: all 0.1s var(--ease);
  }
  .pill.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .analogs {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .abar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--muted);
  }
  .abar span {
    width: 46px;
  }
  .atrack {
    flex: 1;
    height: 8px;
    background: var(--track);
    border-radius: var(--radius-pill);
    overflow: hidden;
  }
  .afill {
    height: 100%;
    background: var(--primary);
    border-radius: var(--radius-pill);
    transition: width 0.08s linear;
  }
  .joy {
    width: 56px;
    height: 56px;
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
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--primary);
    transform: translate(-50%, -50%);
    transition: all 0.06s linear;
  }
  .cta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .cta p {
    margin: 4px 0 0;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
</style>
