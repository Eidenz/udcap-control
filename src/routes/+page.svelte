<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { app, config, startPolling, stopPolling, unlockAudio } from "$lib/state.svelte";
  import { serverStart, serverStop } from "$lib/api";
  import StatusScreen from "$lib/screens/Status.svelte";
  import CalibrationScreen from "$lib/screens/Calibration.svelte";
  import FingersScreen from "$lib/screens/Fingers.svelte";
  import SpaceScreen from "$lib/screens/Space.svelte";
  import ControllerScreen from "$lib/screens/Controller.svelte";
  import SettingsScreen from "$lib/screens/Settings.svelte";
  import WindowControls from "$lib/components/WindowControls.svelte";

  type Tab = "status" | "controller" | "calibration" | "fingers" | "space" | "settings";
  let tab = $state<Tab>("status");
  let busy = $state(false);

  onMount(() => {
    startPolling();
    // Unlock audio on the first interaction (webview autoplay policy).
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
  });
  onDestroy(stopPolling);

  const shm = $derived(app.status?.shm ?? null);
  const running = $derived(app.status?.server_running ?? false);
  // "Server up" = our process is alive, or an externally-started server is publishing.
  const live = $derived(running || (!!shm && shm.server_pid !== 0));
  const linked = $derived(shm ? shm.hands.filter((h) => h.present && h.link === 3).length : 0);

  async function toggleServer() {
    busy = true;
    try {
      if (running) await serverStop();
      else await serverStart(config.trackerLeft, config.trackerRight);
    } finally {
      busy = false;
    }
  }

  const nav = [
    { id: "status", label: "Status" },
    { id: "controller", label: "Controls" },
    { id: "calibration", label: "Calibrate" },
    { id: "fingers", label: "Fingers" },
    { id: "space", label: "Space" },
    { id: "settings", label: "Settings" },
  ] as const;
</script>

<div class="app">
  <nav class="rail">
    <div class="brand">U</div>
    {#each nav as item}
      <button
        class="rail-item state-layer"
        class:active={tab === item.id}
        onclick={() => (tab = item.id)}
      >
        <span class="rail-icon">
          {#if item.id === "status"}
            <svg viewBox="0 0 24 24" width="24" height="24"
              ><path fill="currentColor" d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm8 0h8v-9h-8v9Zm0-16v5h8V4h-8Z" /></svg
            >
          {:else if item.id === "controller"}
            <svg viewBox="0 0 24 24" width="24" height="24"
              ><path
                fill="currentColor"
                d="M21 6H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2M11 13H8v3H6v-3H3v-2h3V8h2v3h3v2m4.5 2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m4-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
              /></svg
            >
          {:else if item.id === "calibration"}
            <svg viewBox="0 0 24 24" width="24" height="24"
              ><path
                fill="currentColor"
                d="M7 11V6a1.5 1.5 0 0 1 3 0v4h1V4a1.5 1.5 0 0 1 3 0v6h1V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-5-2.7l-2.3-3.4a1.4 1.4 0 0 1 2-1.9L7 11Z"
              /></svg
            >
          {:else if item.id === "fingers"}
            <svg viewBox="0 0 24 24" width="24" height="24"
              ><path
                fill="currentColor"
                d="M3 17v2h6v-2H3M3 5v2h10V5H3m10 16v-2h8v-2h-8v-2h-2v6h2M7 9v2H3v2h4v2h2V9H7m14 4v-2H11v2h10m-6-4h2V7h4V5h-4V3h-2v6Z"
              /></svg
            >
          {:else if item.id === "settings"}
            <svg viewBox="0 0 24 24" width="24" height="24"
              ><path
                fill="currentColor"
                d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"
              /></svg
            >
          {:else}
            <svg viewBox="0 0 24 24" width="24" height="24"
              ><path
                fill="currentColor"
                d="M12 2 4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-4Zm0 2.2 6 3v4.8c0 3.9-2.5 6.7-6 8-3.5-1.3-6-4.1-6-8V7.2l6-3Z"
              /></svg
            >
          {/if}
        </span>
        <span class="rail-label">{item.label}</span>
      </button>
    {/each}
  </nav>

  <div class="main">
    <header class="topbar" data-tauri-drag-region>
      <div class="title" data-tauri-drag-region>
        <h1>UDCAP Control</h1>
        <span class="subtitle">Udexreal gloves · Monado</span>
      </div>
      <div class="status-cluster">
        <div class="chip">
          <span class="dot" class:on={live && linked > 0} class:warn={live && linked === 0}></span>
          {#if !live}
            Server offline
          {:else if linked === 2}
            Both gloves linked
          {:else if linked === 1}
            1 glove linked
          {:else}
            Waiting for gloves
          {/if}
        </div>
        <button
          class="btn state-layer"
          class:filled={!running}
          class:tonal={running}
          disabled={busy}
          onclick={toggleServer}
        >
          {running ? "Stop server" : "Start server"}
        </button>
        <WindowControls />
      </div>
    </header>

    <section class="content">
      {#if tab === "status"}
        <StatusScreen onCalibrate={() => (tab = "calibration")} />
      {:else if tab === "controller"}
        <ControllerScreen />
      {:else if tab === "calibration"}
        <CalibrationScreen />
      {:else if tab === "fingers"}
        <FingersScreen />
      {:else if tab === "settings"}
        <SettingsScreen />
      {:else}
        <SpaceScreen />
      {/if}
    </section>
  </div>
</div>

<style>
  .app {
    display: flex;
    height: 100vh;
  }
  .rail {
    width: 92px;
    flex: none;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 0;
  }
  .brand {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--primary), #8f8bff);
    color: var(--on-primary);
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 22px;
    margin-bottom: 14px;
  }
  .rail-item {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 0;
    color: var(--muted);
    border-radius: 12px;
    transition: color 0.15s var(--ease);
  }
  .rail-item.active {
    color: var(--on-surface);
  }
  .rail-icon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 32px;
    border-radius: var(--radius-pill);
    transition: background 0.18s var(--ease);
  }
  .rail-item.active .rail-icon {
    background: var(--primary-container);
    color: var(--on-primary-container);
  }
  .rail-label {
    font-size: 12px;
    font-weight: 600;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 22px 28px 14px;
  }
  .title h1 {
    font-size: 22px;
  }
  .subtitle {
    color: var(--muted);
    font-size: 12px;
  }
  .status-cluster {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 6px 28px 28px;
  }
</style>
