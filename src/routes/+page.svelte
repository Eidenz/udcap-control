<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { app, config, startPolling, stopPolling } from "$lib/state.svelte";
  import { serverStart, serverStop } from "$lib/api";
  import StatusScreen from "$lib/screens/Status.svelte";
  import CalibrationScreen from "$lib/screens/Calibration.svelte";
  import SpaceScreen from "$lib/screens/Space.svelte";
  import WindowControls from "$lib/components/WindowControls.svelte";

  let tab = $state<"status" | "calibration" | "space">("status");
  let busy = $state(false);

  onMount(startPolling);
  onDestroy(stopPolling);

  const shm = $derived(app.status?.shm ?? null);
  const running = $derived(app.status?.server_running ?? false);
  const live = $derived(!!shm && shm.server_pid !== 0);
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
    { id: "calibration", label: "Calibrate" },
    { id: "space", label: "Space" },
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
          {:else if item.id === "calibration"}
            <svg viewBox="0 0 24 24" width="24" height="24"
              ><path
                fill="currentColor"
                d="M7 11V6a1.5 1.5 0 0 1 3 0v4h1V4a1.5 1.5 0 0 1 3 0v6h1V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-5-2.7l-2.3-3.4a1.4 1.4 0 0 1 2-1.9L7 11Z"
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
      {:else if tab === "calibration"}
        <CalibrationScreen />
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
