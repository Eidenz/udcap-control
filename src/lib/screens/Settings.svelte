<script lang="ts">
  import { onMount } from "svelte";
  import { getServerBin, setServerBin, shmVersion, appVersion } from "$lib/api";
  import { closeToTray, toggleCloseToTray, calibSound, toggleCalibSound, type Tab } from "$lib/state.svelte";
  import Page from "$lib/components/Page.svelte";
  import Toggle from "$lib/components/Toggle.svelte";

  let { go }: { go: (t: Tab) => void } = $props();

  let bin = $state("");
  let saved = $state(false);
  let shmVer = $state(0);
  let appVer = $state("");

  onMount(async () => {
    bin = await getServerBin().catch(() => "");
    shmVer = await shmVersion().catch(() => 0);
    appVer = await appVersion().catch(() => "");
  });
  async function saveBin() {
    await setServerBin(bin);
    saved = true;
    setTimeout(() => (saved = false), 1500);
  }

  const CREDITS = [
    { who: "OldestNova", what: "UDCAP glove decoding, the Community Hand Driver Core this app is built on (MIT)" },
    { who: "Valve", what: "OpenVR and the SteamVR driver SDK, plus the hand-skeleton sample used for finger tracking (BSD-3)" },
    { who: "Monado", what: "the open-source OpenXR runtime the native driver plugs into" },
  ];
</script>

<Page title="Settings" subtitle={appVer ? `UDCAP Control ${appVer}` : "UDCAP Control"}>
  <h2 class="section-label">General</h2>
  <section class="card list" aria-label="General">
    <div class="item">
      <div class="grow">
        <div class="ititle">Keep running in the tray</div>
        <div class="hint">Closing the window leaves the server and your gloves running. Quit from the tray icon.</div>
      </div>
      <Toggle label="Keep running in the tray" checked={closeToTray.on} onchange={() => toggleCloseToTray()} />
    </div>
    <div class="item">
      <div class="grow">
        <div class="ititle">Calibration voice cues</div>
        <div class="hint">A spoken cue at each pose, so you can calibrate without looking.</div>
      </div>
      <Toggle label="Calibration voice cues" checked={calibSound.on} onchange={() => toggleCalibSound()} />
    </div>
  </section>

  <h2 class="section-label">Advanced</h2>
  <section class="card list" aria-label="Advanced">
    <div class="item col">
      <div>
        <label class="ititle" for="bin">Server binary</label>
        <div class="hint">Leave empty to use the one bundled with the app. Override only if your <code>udcap-server</code> lives elsewhere.</div>
      </div>
      <div class="binrow">
        <input id="bin" class="field mono" placeholder="Auto-detect" bind:value={bin} />
        <button class="btn tonal" onclick={saveBin}>{saved ? "Saved" : "Save"}</button>
      </div>
    </div>
    <div class="item">
      <div class="grow">
        <div class="ititle">Diagnostics</div>
        <div class="hint">Live readings, calibration quality, a guided test and a report to share when tracking misbehaves.</div>
      </div>
      <button class="btn tonal sm" onclick={() => go("debug")}>Open</button>
    </div>
  </section>

  <h2 class="section-label">About</h2>
  <section class="card list about grow-y" aria-label="About">
    <div>
      <div class="kv"><span>Version</span><b>{appVer || "—"}</b></div>
      <div class="kv"><span>Shared-memory contract</span><b>{shmVer ? `v${shmVer}` : "—"}</b></div>
      <div class="kv"><span>Runtimes</span><b>Monado · SteamVR</b></div>
      <div class="kv"><span>Author</span><b>Eidenz</b></div>
    </div>
    <div class="credits">
      <span class="ctitle">Built on</span>
      {#each CREDITS as c}
        <p class="hint"><b>{c.who}</b> · {c.what}</p>
      {/each}
    </div>
  </section>
</Page>

<style>
  .grow {
    flex: 1;
    min-width: 0;
  }
  h2.section-label {
    margin: 4px 0 -6px;
  }
  .list {
    padding: 4px 16px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .item.col {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .item:last-child {
    border-bottom: none;
  }
  .ititle {
    font-size: 14px;
    font-weight: 600;
  }
  .binrow {
    display: flex;
    gap: 8px;
  }
  .binrow .field {
    flex: 1;
    min-width: 0;
  }
  code {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .about {
    display: grid;
    align-content: start;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    column-gap: 32px;
  }
  .kv:last-child {
    border-bottom: none;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .kv span {
    color: var(--text-3);
  }
  .kv b {
    font-weight: 600;
  }
  .credits {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
  }
  .ctitle {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
  }
  .credits b {
    color: var(--text);
    font-weight: 600;
  }
</style>
