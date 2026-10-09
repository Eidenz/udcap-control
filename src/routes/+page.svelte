<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import {
    app,
    appMode,
    setMode,
    server,
    startServer,
    stopServer,
    startPolling,
    stopPolling,
    unlockAudio,
    monadoNotice,
    closeMonadoGuide,
    syncCloseToTray,
    setup,
    finishSetup,
    trackersFocus,
    minimal,
    stickNotice,
    finishStickNotice,
    requestStickCalibScroll,
    type Tab,
  } from "$lib/state.svelte";
  import { sendCommand, setMinimalMode, CMD } from "$lib/api";
  import { onAction, toMini, type MiniAction } from "$lib/windows";
  import MonadoGuide from "$lib/components/MonadoGuide.svelte";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Page from "$lib/components/Page.svelte";
  import HomeScreen from "$lib/screens/Home.svelte";
  import HandsScreen from "$lib/screens/Hands.svelte";
  import ControlsScreen from "$lib/screens/Controls.svelte";
  import AlignmentScreen from "$lib/screens/Alignment.svelte";
  import DevicesScreen from "$lib/screens/Devices.svelte";
  import SettingsScreen from "$lib/screens/Settings.svelte";
  import DebugScreen from "$lib/screens/Debug.svelte";
  import SetupScreen from "$lib/screens/Setup.svelte";

  // Minimalist mode: the mini window is home, so this one drops its Home tab.
  const minimalOn = $derived(minimal.on && setup.done);
  let tab = $state<Tab>(minimal.on && setup.done ? "hands" : "home");
  const go = (t: Tab) => (tab = t);
  $effect(() => {
    if (minimalOn && tab === "home") tab = "hands";
  });

  // Tell the backend which window is home. The first call reports the mode
  // the launch window should have had (see set_minimal_mode).
  let launching = true;
  $effect(() => {
    setMinimalMode(minimalOn, launching).catch(() => {});
    launching = false;
  });

  // Setup hands over to the app: on the page it asks for, or (skipped) to the
  // mini window alone in minimalist mode.
  function setupFinished(next: Tab | null) {
    if (next === "alignment") trackersFocus.request = true;
    tab = next ?? (minimal.on ? "hands" : "home");
    finishSetup();
    if (!next && minimal.on) getCurrentWindow().hide();
  }

  async function openTab(t: Tab) {
    tab = t;
    const win = getCurrentWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
  }
  function act(a: MiniAction) {
    if (a.kind === "hello") sendMeta();
    else if (a.kind === "start") startServer();
    else if (a.kind === "stop") stopServer();
    else if (a.kind === "calibrate") {
      sendCommand(CMD.CALIB_AUTO).catch(() => {});
      openTab("hands");
    } else if (a.kind === "open") openTab(a.tab);
    else if (a.kind === "sticks") {
      requestStickCalibScroll();
      openTab("controls");
    } else if (a.kind === "dismissSticks") finishStickNotice();
  }

  onMount(() => {
    syncCloseToTray();
    startPolling();
    // Unlock audio on the first interaction (webview autoplay policy).
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    const unlisten = onAction(act);
    return () => unlisten.then((f) => f());
  });
  onDestroy(stopPolling);

  const shm = $derived(app.status?.shm ?? null);
  // Did this app start the server, and is a server (ours or not) publishing?
  const running = $derived(app.status?.server_running ?? false);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const linked = $derived(live && shm ? shm.hands.filter((h) => h.present && h.link === 3).length : 0);

  // Keep the mini window's copy of what it can't read itself up to date.
  const stickNudge = $derived(
    live && !stickNotice.done && !!shm?.hands.some((h) => h.present && h.controller_version === 2),
  );
  const sendMeta = () =>
    toMini({ mode: appMode.mode, busy: server.busy, error: server.error, stickNotice: stickNudge });
  $effect(() => {
    sendMeta();
  });

  const serverLabel = $derived(live ? "Server running" : running ? "Server starting" : "Server stopped");
  const gloves = $derived(linked === 0 ? "no gloves yet" : linked === 1 ? "1 glove linked" : "2 gloves linked");
  const serverMeta = $derived(
    live
      ? `${running ? `pid ${shm?.server_pid}` : "Started outside the app"} · ${gloves}`
      : running
        ? "Waiting for the server…"
        : "Gloves offline",
  );

  const nav: { id: Tab; label: string; icon: IconName }[] = [
    { id: "home", label: "Home", icon: "home" },
    { id: "hands", label: "Hands", icon: "hand" },
    { id: "controls", label: "Controls", icon: "gamepad" },
    { id: "alignment", label: "Alignment", icon: "axes" },
    { id: "devices", label: "Devices", icon: "radio" },
  ];
  const settingsItem = { id: "settings" as Tab, label: "Settings", icon: "settings" as IconName };
</script>

{#snippet navItem(item: { id: Tab; label: string; icon: IconName })}
  {@const active = tab === item.id || (item.id === "settings" && tab === "debug")}
  <button class="navitem" class:active aria-current={active ? "page" : undefined} onclick={() => (tab = item.id)}>
    <Icon name={item.icon} />
    <span>{item.label}</span>
  </button>
{/snippet}

{#if !setup.done}
  <SetupScreen onfinish={setupFinished} />
{:else}
  <div class="app">
    <nav class="side" aria-label="Main" data-tauri-drag-region>
      <div class="brand" data-tauri-drag-region>
        <div class="logo" aria-hidden="true">U</div>
        <div data-tauri-drag-region>
          <div class="bname">UDCAP Control</div>
          <div class="bsub">Udexreal gloves</div>
        </div>
      </div>

      <section class="server" aria-label="Server">
        <div class="srow">
          <span class="dot" class:on={live} class:warn={running && !live}></span>
          <span class="slabel">{serverLabel}</span>
        </div>
        <div class="smeta">{serverMeta}</div>
        {#if running}
          <button class="btn tonal sm" disabled={server.busy} onclick={stopServer}>{server.busy ? "Stopping…" : "Stop server"}</button>
        {:else if !live}
          <button class="btn filled sm" disabled={server.busy} onclick={startServer}>{server.busy ? "Starting…" : "Start server"}</button>
        {/if}
        {#if server.error}<p class="serr">{server.error}</p>{/if}
      </section>

      <div class="runtime">
        <span class="section-label">Runtime</span>
        <Segmented
          full
          value={appMode.mode === "steamvr" ? "SteamVR" : "Monado"}
          options={["Monado", "SteamVR"]}
          onchange={(v) => setMode(v === "SteamVR" ? "steamvr" : "monado")}
        />
      </div>

      <div class="nav">
        {#each nav as item}
          {#if !(minimalOn && item.id === "home")}{@render navItem(item)}{/if}
        {/each}
      </div>

      <div class="nav bottom">
        {@render navItem(settingsItem)}
      </div>
    </nav>

    <main class="main">
      {#if tab === "home"}
        <HomeScreen {go} />
      {:else if tab === "hands"}
        <HandsScreen />
      {:else if tab === "controls"}
        <ControlsScreen />
      {:else if tab === "alignment"}
        <AlignmentScreen />
      {:else if tab === "devices"}
        <DevicesScreen />
      {:else if tab === "settings"}
        <SettingsScreen {go} />
      {:else}
        <Page title="Diagnostics" subtitle="Live readings, calibration quality and a report to share">
          {#snippet actions()}
            <button class="btn text sm" onclick={() => (tab = "settings")}><Icon name="back" size={16} />Settings</button>
          {/snippet}
          <DebugScreen />
        </Page>
      {/if}
    </main>
  </div>
{/if}

<MonadoGuide open={monadoNotice.guideOpen} onclose={closeMonadoGuide} />

<style>
  .app {
    display: flex;
    height: 100vh;
  }
  .side {
    width: 224px;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 18px 12px 20px;
    background: var(--bg-sidebar);
    border-right: 1px solid #1f1f24;
    overflow-y: auto;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 6px;
  }
  .logo {
    width: 34px;
    height: 34px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 11px;
    background: linear-gradient(135deg, #c3c0ff, #8f8bff);
    color: #2a2870;
    font-size: 18px;
    font-weight: 700;
  }
  .bname {
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }
  .bsub {
    font-size: 11px;
    color: var(--text-3);
    line-height: 1.3;
  }
  .server {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: #18181c;
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .srow {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .slabel {
    font-size: 13px;
    font-weight: 600;
  }
  .smeta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-3);
    line-height: 1.5;
  }
  .server .btn {
    width: 100%;
    height: 32px;
    margin-top: 2px;
  }
  .serr {
    font-size: 11px;
    color: var(--danger-text);
    word-break: break-word;
  }
  .runtime {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .runtime .section-label {
    padding: 0 6px;
  }
  .nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* Settings sits at the foot of the sidebar, apart from the screens. */
  .nav.bottom {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #1f1f24;
  }
  .navitem {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 40px;
    padding: 0 12px;
    border-radius: var(--radius-control);
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    transition: background 0.15s var(--ease), color 0.15s var(--ease);
  }
  .navitem :global(svg) {
    color: var(--text-3);
  }
  .navitem:hover {
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
  }
  .navitem.active {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
  .navitem.active :global(svg) {
    color: var(--accent);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
  }
</style>
