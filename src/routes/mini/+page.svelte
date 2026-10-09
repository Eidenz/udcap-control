<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
  import { poll, appVersion, sendCommand, CMD, type Status, type HandView } from "$lib/api";
  import { toMain, onMeta, type MiniMeta } from "$lib/windows";
  import type { Tab } from "$lib/state.svelte";
  import HandGlyph from "$lib/components/HandGlyph.svelte";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import WindowControls from "$lib/components/WindowControls.svelte";
  import RuntimeBadge from "$lib/components/RuntimeBadge.svelte";

  // Minimalist mode's status window. It only reads the shared memory; anything
  // that needs the app's settings (starting the server, opening a page) is
  // asked of the full window, which keeps running hidden.
  let status = $state<Status | null>(null);
  let meta = $state<MiniMeta>({ mode: "monado", busy: false, error: null, stickNotice: false });
  let version = $state("");
  let menuOpen = $state(false);

  onMount(() => {
    const tick = async () => {
      try {
        status = await poll();
      } catch {
        /* next tick */
      }
    };
    tick();
    const timer = setInterval(tick, 100);
    const unlisten = onMeta((m) => (meta = m));
    unlisten.then(() => toMain({ kind: "hello" }));
    appVersion()
      .then((v) => (version = v))
      .catch(() => {});
    return () => {
      clearInterval(timer);
      unlisten.then((f) => f());
    };
  });

  const shm = $derived(status?.shm ?? null);
  const running = $derived(status?.server_running ?? false);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(live ? (shm?.hands ?? []) : []);
  const isLinked = (h: HandView | undefined) => !!h && h.present && h.link === 3;
  const linked = $derived(hands.filter(isLinked));
  const allCalibrated = $derived(linked.length > 0 && linked.every((h) => h.calibrated));
  const shmError = $derived(running ? (status?.shm_error ?? null) : null);
  const runtime = $derived(meta.mode === "steamvr" ? "SteamVR" : "Monado");

  // Blue once the selected runtime's driver is attached to this server.
  const runtimeLinked = $derived(live && !!status?.runtimes?.[meta.mode]);

  // calib_state: 7 = get ready, 1..3 = holding a pose, 4 = captured, 6 = failed.
  const calib = $derived(live ? (shm?.calib_state ?? 0) : 0);
  const calibrating = $derived(calib === 7 || (calib >= 1 && calib <= 4));
  const STEPS: Record<number, string> = {
    7: "Get ready. Relax your hands.",
    1: "Make a fist.",
    2: "Fingers together, flat and straight.",
    3: "Spread your fingers wide.",
    4: "Checking the calibration…",
  };

  type View = { heading: string; line: string; tone?: "warn" | "bad" };
  const view = $derived.by<View>(() => {
    if (shmError) return { heading: "Server problem", line: shmError, tone: "bad" };
    if (!live) {
      if (running || meta.busy || pending === "start") return { heading: "Starting", line: "Waiting for the server…" };
      if (meta.error) return { heading: "Couldn't start", line: meta.error, tone: "bad" };
      return { heading: "Stopped", line: "Start the server to connect the gloves." };
    }
    if (calibrating) return { heading: "Calibrating", line: STEPS[calib] };
    if (linked.length === 0) return { heading: "No gloves", line: "Turn on the gloves. They link on their own." };
    if (calib === 6) return { heading: "Calibration failed", line: "Try again with full, steady poses.", tone: "warn" };
    if (!allCalibrated) return { heading: "Not calibrated", line: "Put the gloves on and calibrate.", tone: "warn" };
    const which = linked.length === 2 ? "Both gloves" : isLinked(hands[0]) ? "Left glove" : "Right glove";
    return { heading: "Working", line: runtimeLinked ? `${which} streaming to ${runtime}` : `${which} ready` };
  });
  const needsCalibration = $derived(calib === 6 || !allCalibrated);

  // Start / Stop grey out on the click itself: the full window only reports
  // busy once the request reaches it. Cleared when it was busy and is done
  // (succeeded or failed), or after a while if it never answered.
  let pending = $state<"start" | "stop" | null>(null);
  let sawBusy = false;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  function power() {
    pending = running || live ? "stop" : "start";
    sawBusy = false;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => (pending = null), 10000);
    toMain({ kind: pending });
  }
  $effect(() => {
    if (!pending) return;
    if (meta.busy) sawBusy = true;
    else if (sawBusy) pending = null;
  });
  const powerBusy = $derived(pending !== null || meta.busy);

  const MENU: { tab: Tab; label: string; icon: IconName }[] = [
    { tab: "hands", label: "Hands", icon: "hand" },
    { tab: "controls", label: "Controls", icon: "gamepad" },
    { tab: "alignment", label: "Alignment", icon: "axes" },
    { tab: "devices", label: "Devices", icon: "radio" },
    { tab: "settings", label: "Settings", icon: "settings" },
  ];
  function pick(tab: Tab) {
    menuOpen = false;
    toMain({ kind: "open", tab });
  }

  // The window is as tall as the deck: one fixed size at a time (min = max),
  // which tiling compositors float instead of tiling. Resizes queue up so a
  // burst of changes lands on the last one.
  const WIDTH = 380;
  let deckH = $state(0);
  let wantH: number | null = null;
  let resizing = false;
  async function drainResize() {
    resizing = true;
    const win = getCurrentWindow();
    while (wantH !== null) {
      const h = Math.round(wantH);
      wantH = null;
      try {
        await win.setSizeConstraints({ minWidth: WIDTH, maxWidth: WIDTH, minHeight: h, maxHeight: h });
        await win.setSize(new LogicalSize(WIDTH, h));
      } catch {
        /* the next change re-applies */
      }
    }
    resizing = false;
  }
  $effect(() => {
    if (deckH <= 0) return;
    wantH = deckH;
    if (!resizing) drainResize();
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (menuOpen = false)} />

{#snippet glove(h: HandView | undefined, i: number)}
  {@const on = isLinked(h)}
  <div class="glove" class:on>
    <HandGlyph size={58} mirror={i === 1} curls={on ? h?.curl : undefined} dim={!on} />
    <div class="gstats">
      <span class="gname">{i === 0 ? "Left" : "Right"}</span>
      {#if on && h}
        {#if h.battery}
          <span class="gstat" class:low={h.battery <= 1}><Icon name="battery" size={14} />{h.battery * 20}%</span>
        {/if}
        <span class="gstat"><Icon name="activity" size={14} />{Math.round(h.fps)} fps</span>
      {:else}
        <span class="gstat off">{live && h?.present ? "Connecting" : "Offline"}</span>
      {/if}
    </div>
  </div>
{/snippet}

<div class="deck" bind:clientHeight={deckH}>
  <header data-tauri-drag-region>
    <div class="burger">
      <button class="iconbtn menubtn" aria-label="Menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
        <Icon name="menu" size={16} stroke={2} />
      </button>
      {#if menuOpen}
        <button class="scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
        <div class="menu" role="menu">
          {#each MENU as item}
            <button class="item" role="menuitem" onclick={() => pick(item.tab)}>
              <Icon name={item.icon} size={16} />{item.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <span class="name" data-tauri-drag-region>UDCAP Control</span>
    {#if version}<span class="ver" data-tauri-drag-region>{version}</span>{/if}
    <span class="spacer" data-tauri-drag-region></span>
    <WindowControls />
  </header>

  <section class="status" data-tauri-drag-region>
    <div class="hrow" data-tauri-drag-region>
      <h1 data-tauri-drag-region>{view.heading}</h1>
      <!-- Like the full window's server button: no stopping a server this app didn't start. -->
      {#if !live && !running}
        <button class="btn filled sm" disabled={powerBusy} onclick={power}>{powerBusy ? "Starting…" : "Start"}</button>
      {:else if running}
        <button class="btn tonal sm" disabled={powerBusy} onclick={power}>
          {pending === "stop" || (meta.busy && live) ? "Stopping…" : meta.busy ? "Starting…" : "Stop"}
        </button>
      {/if}
    </div>
    <div class="lrow" data-tauri-drag-region>
      <p class="line {view.tone ?? ''}" title={view.line} data-tauri-drag-region>{view.line}</p>
      {#if calibrating}
        <button class="pill" onclick={() => sendCommand(CMD.CALIB_CANCEL).catch(() => {})}>Cancel</button>
      {:else if live && linked.length > 0}
        <button class="pill" class:hot={needsCalibration} onclick={() => toMain({ kind: "calibrate" })}>Calibrate</button>
      {/if}
    </div>
  </section>

  <div class="strip">
    {@render glove(hands[0], 0)}
    {@render glove(hands[1], 1)}
    <span class="spacer"></span>
    <RuntimeBadge runtime={meta.mode} connected={runtimeLinked} />
  </div>

  {#if meta.stickNotice}
    <div class="notice">
      <Icon name="info" size={16} />
      <p>Control Module 2.0 detected. Redo its stick calibration if a stick drifts.</p>
      <button class="link" onclick={() => toMain({ kind: "sticks" })}>Calibrate</button>
      <button class="iconbtn x" aria-label="Dismiss" onclick={() => toMain({ kind: "dismissSticks" })}>
        <Icon name="close" size={14} stroke={2} />
      </button>
    </div>
  {/if}
</div>

<style>
  .deck {
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(120% 90% at 20% -20%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 60%),
      var(--bg);
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 4px 4px 4px 6px;
  }
  .menubtn {
    width: 32px;
    height: 32px;
  }
  .name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-2);
  }
  .ver {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-4);
  }
  .spacer {
    flex: 1;
    align-self: stretch;
  }

  .burger {
    position: relative;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    cursor: default;
  }
  /* Must fit inside the bare deck (~190px): the window doesn't grow for it. */
  .menu {
    position: absolute;
    top: 34px;
    left: 0;
    z-index: 50;
    min-width: 170px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    background: var(--raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-inner);
    box-shadow: var(--shadow-menu);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 28px;
    padding: 0 10px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--text);
    text-align: left;
  }
  .item :global(svg) {
    color: var(--text-3);
  }
  .item:hover {
    background: var(--control-hi);
  }

  .status {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 2px 16px 14px;
  }
  .hrow,
  .lrow {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  /* Same height with or without their buttons, so the window doesn't jump. */
  .hrow {
    min-height: 34px;
  }
  .lrow {
    min-height: 24px;
  }
  h1 {
    flex: 1;
    min-width: 0;
    font-family: var(--font-display);
    font-size: 25px;
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.15;
  }
  .line {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line.warn {
    color: var(--warn-text);
  }
  .line.bad {
    color: var(--danger-text);
  }
  /* Calibrate, on the status line like the vendor app's. */
  .pill {
    flex: none;
    height: 24px;
    padding: 0 11px;
    border-radius: var(--radius-pill);
    background: var(--control);
    box-shadow: inset 0 0 0 1px var(--border-strong);
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    transition: background 0.15s var(--ease);
  }
  .pill:hover {
    background: var(--control-hi);
  }
  .pill.hot {
    background: var(--accent);
    box-shadow: none;
    color: var(--on-accent);
  }

  .strip {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 16px;
    padding: 12px 0 14px;
    border-top: 1px solid var(--border);
  }
  .glove {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .gstats {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 66px;
  }
  .gname {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-2);
  }
  .glove:not(.on) .gname {
    color: var(--text-4);
  }
  .gstat {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text-3);
  }
  .gstat.low {
    color: var(--danger-text);
  }
  .gstat.off {
    font-family: var(--font);
    color: var(--text-off);
  }
  .notice {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 8px 8px;
    padding: 8px 6px 8px 12px;
    border-radius: var(--radius-inner);
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--accent);
  }
  .notice p {
    flex: 1;
    font-size: 12px;
    line-height: 1.35;
    color: var(--text-2);
  }
  .link {
    flex: none;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
  }
  .link:hover {
    text-decoration: underline;
  }
  .x {
    width: 26px;
    height: 26px;
  }
</style>
