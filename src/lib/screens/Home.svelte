<script lang="ts">
  import { onMount } from "svelte";
  import {
    app,
    appMode,
    config,
    openMonadoGuide,
    stickNotice,
    finishStickNotice,
    requestStickCalibScroll,
    type Tab,
  } from "$lib/state.svelte";
  import {
    udevStatus,
    udevInstall,
    steamvrStatus,
    steamvrInstall,
    sendCommand,
    CMD,
    FINGERS,
    type HandView,
    type UdevStatus,
    type SteamvrStatus,
  } from "$lib/api";
  import Page from "$lib/components/Page.svelte";
  import HandGlyph from "$lib/components/HandGlyph.svelte";
  import Icon from "$lib/components/Icon.svelte";

  let { go }: { go: (t: Tab) => void } = $props();

  // --- Setup state (permissions, SteamVR driver) ------------------------------
  let udev = $state<UdevStatus | null>(null);
  let svr = $state<SteamvrStatus | null>(null);
  let busy = $state<"udev" | "svr" | null>(null);
  let actionError = $state<string | null>(null);

  async function refreshUdev() {
    udev = await udevStatus().catch(() => null);
  }
  async function refreshSvr() {
    svr = await steamvrStatus().catch(() => null);
  }
  onMount(refreshUdev);
  $effect(() => {
    if (appMode.mode === "steamvr") refreshSvr();
  });
  async function run(kind: "udev" | "svr", fn: () => Promise<unknown>, refresh: () => Promise<void>) {
    busy = kind;
    actionError = null;
    try {
      await fn();
      await refresh();
    } catch (e) {
      // The udev install is cancelled by closing the password prompt: not an error.
      if (kind === "svr") actionError = String(e);
    } finally {
      busy = null;
    }
  }
  const installUdev = () => run("udev", udevInstall, refreshUdev);
  const installSvr = () => run("svr", steamvrInstall, refreshSvr);

  const udevOk = $derived(!!udev && udev.installed && udev.up_to_date);
  const trackersSet = $derived(!!config.trackerLeft.trim() && !!config.trackerRight.trim());
  const steam = $derived(appMode.mode === "steamvr");

  type Row = {
    title: string;
    desc: string;
    mono?: boolean;
    done: boolean;
    info?: boolean;
    action?: { label: string; run: () => void; disabled?: boolean };
  };
  const permissionsRow = $derived<Row>({
    title: "Device permissions",
    desc: udevOk
      ? "Installed. The app can reach the glove dongles without sudo."
      : udev?.installed
        ? "The installed udev rule is out of date."
        : "Lets the app reach the glove dongles without sudo. Asks for your password once.",
    done: udevOk,
    action: udevOk
      ? undefined
      : { label: busy === "udev" ? "Installing…" : udev?.installed ? "Update" : "Install", run: installUdev, disabled: !!busy },
  });
  const runtimeRow = $derived<Row>(
    steam
      ? {
          title: "SteamVR driver",
          desc: svr?.registered
            ? "Installed. SteamVR sees the gloves as Index controllers."
            : svr && !svr.paths_file_found
              ? "Launch SteamVR once, then install the driver here."
              : "Shows the gloves as Index controllers in SteamVR.",
          done: !!svr?.registered,
          action: svr?.registered
            ? undefined
            : { label: busy === "svr" ? "Installing…" : "Install", run: installSvr, disabled: !!busy || !svr?.paths_file_found },
        }
      : {
          title: "Monado with the glove driver",
          desc: "Monado compiles its drivers in, so it needs the UDCAP fork.",
          done: false,
          info: true,
          action: { label: "Show me how", run: openMonadoGuide },
        },
  );
  const trackersRow = $derived<Row>({
    title: "Trackers",
    desc: trackersSet ? `${config.trackerLeft} · ${config.trackerRight}` : "The Lighthouse tracker serial on each glove.",
    mono: trackersSet,
    done: trackersSet,
    action: trackersSet ? undefined : { label: "Assign", run: () => go("alignment") },
  });
  // --- Live state --------------------------------------------------------------
  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const shmError = $derived(app.status?.server_running ? (app.status?.shm_error ?? null) : null);
  const hands = $derived(live ? (shm?.hands ?? []) : []);
  const linkedHands = $derived(hands.filter((h) => h.present && h.link === 3));
  const allCalibrated = $derived(linkedHands.length > 0 && linkedHands.every((h) => h.calibrated));
  const ready = $derived(linkedHands.length === 2 && allCalibrated);
  const canCalibrate = $derived(live && linkedHands.length > 0);
  const runtimeName = $derived(steam ? "SteamVR" : "Monado");

  const subtitle = $derived(
    !live
      ? "Server stopped. Start it to connect the gloves."
      : linkedHands.length === 2
        ? `Both gloves linked and streaming to ${runtimeName}`
        : linkedHands.length === 1
          ? "One glove linked"
          : "Waiting for the gloves",
  );
  const showStickNotice = $derived(!stickNotice.done && hands.some((h) => h.present && h.controller_version === 2));

  function calibrate() {
    sendCommand(CMD.CALIB_AUTO).catch(() => {});
    go("hands");
  }
  function calibrateSticks() {
    requestStickCalibScroll();
    go("controls");
  }

  const moduleName = (v: number) => (v === 2 ? "Module 2.0" : v === 1 ? "Module 1.0" : "");
  function meta(h: HandView | undefined, i: number, on: boolean) {
    const tracker = (on && h?.tracker_serial) || (i === 0 ? config.trackerLeft : config.trackerRight);
    const parts = on && h ? [moduleName(h.controller_version), h.fw ? `fw ${h.fw}` : ""] : [];
    parts.push(tracker ? (on ? tracker : `Tracker ${tracker}`) : "No tracker assigned");
    return parts.filter(Boolean).join(" · ");
  }
</script>

{#snippet bar(label: string, v: number)}
  <div class="bar"><span>{label}</span><span class="track"><span style="width:{v * 100}%"></span></span></div>
{/snippet}

{#snippet handCard(h: HandView | undefined, name: string, i: number)}
  <section class="card hand" aria-label={name}>
    {#if h && live && h.present}
      <div class="hhead">
        <h2>{name}</h2>
        {#if h.link === 3}
          <span class="chip sm good"><span class="pip"></span>Linked</span>
          {#if !h.calibrated}<span class="chip sm warn">Not calibrated</span>{/if}
        {:else}
          <span class="chip sm warn"><span class="pip"></span>Connecting</span>
        {/if}
        <span class="grow"></span>
        {#if h.battery}<span class="stat" title="Battery"><Icon name="battery" size={16} />{h.battery * 20}%</span>{/if}
        <span class="stat" title="Frame rate"><Icon name="activity" size={16} />{Math.round(h.fps)} fps</span>
      </div>
      <div class="stage"><HandGlyph curls={h.curl} mirror={i === 1} /></div>
      <div class="fingers">
        {#each FINGERS as f, k}
          <div><span>{f}</span><b>{Math.round((h.curl[k] ?? 0) * 100)}%</b></div>
        {/each}
      </div>
      <div class="inputs">
        <div class="pills">
          <span class="pill" class:on={h.btn_a}>A</span>
          <span class="pill" class:on={h.btn_b}>B</span>
          <span class="pill" class:on={h.btn_menu}>{h.controller_version === 2 ? "Sys" : "Menu"}</span>
        </div>
        <div class="bars">
          {@render bar("Trigger", h.trigger)}
          {@render bar("Grip", h.grip)}
        </div>
        <span class="stick" class:click={h.btn_joy} title="Thumbstick">
          <span style="left:{50 + h.joy_x * 34}%;top:{50 - h.joy_y * 34}%"></span>
        </span>
      </div>
      <div class="meta">{meta(h, i, true)}</div>
    {:else}
      <div class="hhead">
        <h2>{name}</h2>
        <span class="chip sm"><span class="pip"></span>Offline</span>
      </div>
      <div class="stage"><HandGlyph mirror={i === 1} dim /></div>
      <div class="fingers">
        {#each FINGERS as f}
          <div><span>{f}</span><b class="off">—</b></div>
        {/each}
      </div>
      <p class="offline">
        {live ? "Power on the glove. It links on its own." : "Start the server, then power on the glove. It links on its own."}
      </p>
      <div class="meta">{meta(h, i, false)}</div>
    {/if}
  </section>
{/snippet}

<Page title="Home" {subtitle}>
  {#snippet actions()}
    {#if ready}
      <span class="chip good"><span class="pip"></span>Ready for VR</span>
    {:else if canCalibrate && !allCalibrated}
      <span class="chip warn"><span class="pip"></span>Calibration needed</span>
    {:else if live}
      <span class="chip"><span class="pip"></span>{linkedHands.length ? "One glove linked" : "Waiting for gloves"}</span>
    {:else}
      <span class="chip"><span class="pip"></span>Gloves offline</span>
    {/if}
  {/snippet}

  {#if shmError}
    <div class="card banner bad">
      <Icon name="alert" />
      <p>The server is running but its shared memory can't be read: <code>{shmError}</code></p>
    </div>
  {/if}
  {#if showStickNotice}
    <div class="card banner">
      <Icon name="info" />
      <p>
        <b>Control Module 2.0 detected.</b> It keeps its own thumbstick calibration. Redo it once if a stick drifts at
        rest or clips into a square.
      </p>
      <button class="btn text sm" onclick={finishStickNotice}>Dismiss</button>
      <button class="btn tonal sm" onclick={calibrateSticks}>Calibrate sticks</button>
    </div>
  {/if}

  <div class="grid2 grow-y">
    {@render handCard(hands[0], "Left glove", 0)}
    {@render handCard(hands[1], "Right glove", 1)}
  </div>

  <div class="grid2">
    <section class="card cal" aria-labelledby="cal-h">
      <div class="calhead">
        {#if allCalibrated}
          <span class="calicon ok"><Icon name="check" stroke={2.25} /></span>
        {:else if canCalibrate}
          <span class="calicon warn"><Icon name="alert" /></span>
        {:else}
          <span class="calicon"><Icon name="hand" /></span>
        {/if}
        <div>
          <h2 id="cal-h">{allCalibrated ? "Calibrated" : canCalibrate ? "Calibration needed" : "Calibration"}</h2>
          <p class="desc">
            {#if allCalibrated}
              {linkedHands.length === 2 ? "Both hands." : "The linked hand."} Recalibrate if a finger drifts or won't close all the way.
            {:else if canCalibrate}
              Run it with the gloves on, so finger tracking matches your hands.
            {:else}
              Available once the gloves are linked.
            {/if}
          </p>
        </div>
      </div>
      <div class="row">
        <button class="btn filled" disabled={!canCalibrate} onclick={calibrate}>{allCalibrated ? "Recalibrate" : "Calibrate"}</button>
        <button class="btn tonal" onclick={() => go("hands")}>Tune fingers</button>
      </div>
      <p class="hint">In VR, press a glove's power button to start a calibration.</p>
    </section>

    <section class="card checks" aria-labelledby="checks-h">
      <h2 id="checks-h">Setup</h2>
      {#each [permissionsRow, trackersRow, runtimeRow] as r}
        <div class="check">
          {#if r.done}
            <span class="cbadge ok"><Icon name="check" size={12} stroke={3} /></span>
          {:else if r.info}
            <span class="cbadge info">i</span>
          {:else}
            <span class="cbadge todo">!</span>
          {/if}
          <div class="grow">
            <div class="stitle">{r.title}</div>
            <div class="hint" class:mono={r.mono}>{r.desc}</div>
          </div>
          {#if r.action}
            <button class="link" disabled={r.action.disabled} onclick={r.action.run}>{r.action.label === "Show me how" ? "Guide" : r.action.label}</button>
          {/if}
        </div>
      {/each}
      {#if actionError}<p class="err">{actionError}</p>{/if}
    </section>
  </div>
</Page>

<style>
  .grow {
    flex: 1;
    min-width: 0;
  }
  .grid2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 16px;
  }
  .err {
    margin-top: 10px;
    font-size: 12px;
    color: var(--danger-text);
  }

  .stitle {
    font-size: 14px;
    font-weight: 600;
  }
  .check .stitle {
    font-size: 13px;
  }
  /* banners */
  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--accent);
  }
  .banner.bad {
    color: var(--danger-text);
    border-color: var(--danger-soft);
  }
  .banner p {
    flex: 1;
    font-size: 13px;
    color: var(--text-2);
  }
  .banner b {
    color: var(--text);
    font-weight: 600;
  }

  /* glove cards */
  .hand {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .hhead {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hhead h2 {
    font-size: 14px;
    margin-right: 2px;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text-2);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .stat + .stat {
    margin-left: 6px;
  }
  .stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 0 4px;
    background: var(--inset);
    border-radius: var(--radius-inner);
  }
  .fingers {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    text-align: center;
  }
  .fingers span {
    display: block;
    font-size: 11px;
    color: var(--text-3);
  }
  .fingers b {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
  }
  .fingers b.off {
    color: var(--text-off);
  }
  .inputs {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .offline {
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--text-3);
  }
  .pills {
    display: flex;
    gap: 4px;
  }
  .pill {
    display: inline-grid;
    place-items: center;
    min-width: 30px;
    height: 26px;
    padding: 0 7px;
    border-radius: 7px;
    background: var(--raised);
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
  }
  .pill.on {
    background: var(--accent-soft);
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent-line);
  }
  .bars {
    flex: 1;
    min-width: 90px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--text-3);
  }
  .bar > span:first-child {
    width: 42px;
  }
  .track {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: var(--track);
    overflow: hidden;
  }
  .track span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.1s linear;
  }
  .stick {
    position: relative;
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 9px;
    background: var(--well);
    border: 1px solid var(--border-input);
  }
  .stick.click {
    border-color: var(--accent);
  }
  .stick span {
    position: absolute;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    border-radius: 50%;
    background: var(--accent);
  }
  .meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-4);
  }

  /* calibration + setup cards */
  .cal {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .calhead {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .calicon {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--radius-inner);
    background: var(--control);
    color: var(--text-3);
  }
  .calicon.ok {
    background: var(--success-soft);
    color: var(--success-text);
  }
  .calicon.warn {
    background: var(--warn-soft);
    color: var(--warn-text);
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .checks h2 {
    margin-bottom: 6px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .check:last-of-type {
    border-bottom: none;
  }
  .cbadge {
    width: 22px;
    height: 22px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
  }
  .cbadge.ok {
    background: var(--success-soft);
    color: var(--success-text);
  }
  .cbadge.info {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .cbadge.todo {
    background: var(--warn-soft);
    color: var(--warn-text);
  }
  .link {
    flex: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
  }
  .link:hover {
    text-decoration: underline;
  }
  .link:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    text-decoration: none;
  }
  code {
    font-family: var(--font-mono);
    font-size: 12px;
  }
</style>
