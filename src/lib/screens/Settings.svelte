<script lang="ts">
  import { onMount } from "svelte";
  import {
    getServerBin,
    setServerBin,
    udevStatus,
    udevInstall,
    shmVersion,
    steamvrStatus,
    steamvrInstall,
    steamvrRemove,
    type UdevStatus,
    type SteamvrStatus,
  } from "$lib/api";

  let bin = $state("");
  let saved = $state(false);
  let udev = $state<UdevStatus | null>(null);
  let installing = $state(false);
  let shmVer = $state(0);

  let svr = $state<SteamvrStatus | null>(null);
  let svrBusy = $state(false);
  let svrError = $state<string | null>(null);
  async function refreshSvr() {
    try {
      svr = await steamvrStatus();
    } catch {
      svr = null;
    }
  }
  async function svrAction(fn: () => Promise<unknown>) {
    svrBusy = true;
    svrError = null;
    try {
      await fn();
      await refreshSvr();
    } catch (e) {
      svrError = String(e);
    } finally {
      svrBusy = false;
    }
  }

  onMount(async () => {
    try {
      bin = await getServerBin();
    } catch {
      bin = "";
    }
    try {
      shmVer = await shmVersion();
    } catch {
      shmVer = 0;
    }
    await refreshUdev();
    await refreshSvr();
  });
  async function refreshUdev() {
    try {
      udev = await udevStatus();
    } catch {
      udev = null;
    }
  }
  async function saveBin() {
    await setServerBin(bin);
    saved = true;
    setTimeout(() => (saved = false), 1500);
  }
  async function installUdev() {
    installing = true;
    try {
      await udevInstall();
      await refreshUdev();
    } catch (_) {
      /* cancelled */
    } finally {
      installing = false;
    }
  }
</script>

<div class="screen">
  <div class="card">
    <h3>Server</h3>
    <p class="muted">
      Leave blank to auto-detect (bundled with the app, next to the executable, or on PATH).
      Override only if your <code>udcap-server</code> lives elsewhere.
    </p>
    <div class="row">
      <input placeholder="auto-detect" bind:value={bin} />
      <button class="btn tonal state-layer" onclick={saveBin}>{saved ? "Saved ✓" : "Save"}</button>
    </div>
  </div>

  <div class="card">
    <h3>Device permissions</h3>
    <p class="muted">
      A udev rule lets the app reach the glove dongles without sudo. Installing asks for your
      password once.
    </p>
    <div class="row between">
      <span class="status">
        <span class="dot" class:on={udev?.installed && udev?.up_to_date} class:warn={udev?.installed && !udev?.up_to_date}></span>
        {#if !udev}
          Checking…
        {:else if udev.installed && udev.up_to_date}
          Installed
        {:else if udev.installed}
          Out of date
        {:else}
          Not installed
        {/if}
      </span>
      <button class="btn tonal state-layer" disabled={installing} onclick={installUdev}>
        {installing ? "Installing…" : udev?.installed ? "Reinstall" : "Install"}
      </button>
    </div>
  </div>

  <div class="card">
    <h3>SteamVR driver</h3>
    <p class="muted">Registers the gloves as Index controllers in SteamVR. Restart SteamVR after any change.</p>
    <div class="row between">
      <span class="status">
        <span class="dot" class:on={svr?.registered} class:warn={svr && !svr.paths_file_found}></span>
        {#if !svr}
          Checking…
        {:else if !svr.paths_file_found}
          Launch SteamVR once first
        {:else if svr.registered}
          Installed
        {:else}
          Not installed
        {/if}
      </span>
      <div class="svr-actions">
        <button class="btn tonal state-layer" disabled={svrBusy} onclick={() => svrAction(steamvrInstall)}>
          {svrBusy ? "Working…" : svr?.registered ? "Reinstall" : "Install"}
        </button>
        {#if svr?.registered}
          <button class="btn text state-layer" disabled={svrBusy} onclick={() => svrAction(steamvrRemove)}>Remove</button>
        {/if}
      </div>
    </div>
    {#if svrError}<p class="muted err">{svrError}</p>{/if}
  </div>

  <div class="card about">
    <h3>About</h3>
    <div class="kv"><span>Application</span><b>UDCAP Control 0.1.0</b></div>
    <div class="kv"><span>Shared-memory contract</span><b>{shmVer ? `v${shmVer}` : "—"}</b></div>
    <div class="kv"><span>Runtimes</span><b>Monado · SteamVR</b></div>
    <div class="kv"><span>Author</span><b>Eidenz</b></div>
    <p class="muted">
      Hand tracking + Index-controller inputs for Udexreal (UDCAP) gloves on Linux. Pose comes from a
      Lighthouse tracker mounted on each glove.
    </p>
  </div>

  <div class="card credits">
    <h3>Credits &amp; acknowledgements</h3>
    <div class="credit">
      <b>OldestNova</b>
      <span>UDCAP glove decoding — the Community Hand Driver Core this app is built on (MIT).</span>
    </div>
    <div class="credit">
      <b>Valve — OpenVR / SteamVR</b>
      <span>SteamVR runtime &amp; driver SDK, plus the OpenVR hand-skeleton sample used for finger tracking (BSD-3).</span>
    </div>
    <div class="credit">
      <b>Monado</b>
      <span>The open-source OpenXR runtime the native driver (drv_udcap) plugs into.</span>
    </div>
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 720px;
  }
  .muted {
    color: var(--muted);
    margin: 6px 0 0;
    font-size: 13px;
  }
  code {
    background: var(--surface-2);
    padding: 1px 5px;
    border-radius: 5px;
    font-size: 12px;
  }
  .row {
    display: flex;
    gap: 12px;
    margin-top: 14px;
    align-items: center;
  }
  .row.between {
    justify-content: space-between;
  }
  input {
    flex: 1;
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
  input:focus {
    border-color: var(--primary);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--on-surface-var);
    font-weight: 600;
  }
  .svr-actions {
    display: flex;
    gap: 8px;
  }
  .err {
    color: #ff8a8a;
  }
  .about .kv {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--outline-dim);
    font-size: 14px;
  }
  .about .kv span {
    color: var(--muted);
  }
  .credit {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 0;
    border-bottom: 1px solid var(--outline-dim);
  }
  .credit:last-child {
    border-bottom: none;
  }
  .credit b {
    font-size: 14px;
    color: var(--on-surface);
  }
  .credit span {
    font-size: 13px;
    color: var(--muted);
  }
</style>
