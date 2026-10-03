<script lang="ts">
  import { onMount } from "svelte";
  import { app, openMonadoGuide } from "$lib/state.svelte";
  import {
    pairStart,
    pairStop,
    setChannel,
    PAIR,
    udevStatus,
    udevInstall,
    steamvrStatus,
    steamvrInstall,
    steamvrRemove,
    type UdevStatus,
    type SteamvrStatus,
  } from "$lib/api";
  import Page from "$lib/components/Page.svelte";
  import Select from "$lib/components/Select.svelte";
  import Icon from "$lib/components/Icon.svelte";

  const CHANNELS = Array.from({ length: 10 }, (_, n) => String(n)); // 0–9 (known-good range)
  const PAIR_SECS = 60;
  const PAIR_STEPS = [
    "Plug in only that glove's receiver",
    "Power on only that glove",
    "Press Pair on its receiver here",
    "Hold the glove's power button about 3 s, until both lights flash green",
  ];

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const receivers = $derived(live ? (shm?.receivers ?? []) : []);

  // Guided pairing for one receiver at a time. We mirror the server's
  // pair_state but only accept SUCCESS after we've seen it enter SEARCHING, so a
  // lingering SUCCESS from a previous pair can't trigger a false completion.
  let active = $state<number | null>(null);
  let armed = $state(false);
  let paired = $state(false);
  let elapsed = $state(0);
  let ticker: ReturnType<typeof setInterval> | undefined;
  function startPair(i: number) {
    active = i;
    armed = false;
    paired = false;
    elapsed = 0;
    pairStart(i).catch(() => {});
    clearInterval(ticker);
    ticker = setInterval(() => {
      elapsed += 1;
      if (elapsed >= PAIR_SECS) cancelPair(); // safety timeout
    }, 1000);
  }
  function cancelPair() {
    clearInterval(ticker);
    if (active !== null) pairStop(active).catch(() => {});
    active = null;
    armed = false;
    paired = false;
    elapsed = 0;
  }
  $effect(() => {
    if (active === null || paired) return;
    const r = receivers[active];
    if (!r) return;
    if (r.pair_state === PAIR.SEARCHING) armed = true;
    if (armed && r.pair_state === PAIR.SUCCESS) {
      paired = true;
      setTimeout(cancelPair, 2200); // show "Paired" briefly, then leave pairing mode
    }
  });
  const handName = (h: number) => (h === 0 ? "Left glove" : h === 1 ? "Right glove" : "Unbound receiver");

  // Drivers and permissions.
  let udev = $state<UdevStatus | null>(null);
  let svr = $state<SteamvrStatus | null>(null);
  let busy = $state<"udev" | "svr" | null>(null);
  let svrError = $state<string | null>(null);
  async function refresh() {
    udev = await udevStatus().catch(() => null);
    svr = await steamvrStatus().catch(() => null);
  }
  onMount(refresh);
  async function installUdev() {
    busy = "udev";
    try {
      await udevInstall();
    } catch {
      /* cancelled at the password prompt */
    } finally {
      await refresh();
      busy = null;
    }
  }
  async function svrAction(fn: () => Promise<unknown>) {
    busy = "svr";
    svrError = null;
    try {
      await fn();
    } catch (e) {
      svrError = String(e);
    } finally {
      await refresh();
      busy = null;
    }
  }
  const udevOk = $derived(!!udev && udev.installed && udev.up_to_date);
</script>

<Page title="Devices" subtitle="Receivers, pairing and drivers">
  <h2 class="section-label">Receivers</h2>
  <section class="card list recvlist grow-y" aria-label="Receivers">
    {#if !live}
      <p class="empty">Start the server to manage receivers.</p>
    {:else if receivers.length === 0}
      <p class="empty">No wireless receivers detected. Plug a USB receiver in and it shows up here.</p>
    {:else}
      {#each receivers as r, i (r.serial + i)}
        <div class="recv" role="group" aria-label={handName(r.hand)}>
          <div class="rrow">
            {#if active === i && !paired}
              <span class="ricon spin" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="var(--border-strong)" stroke-width="2.5" /><path d="M12 3a9 9 0 0 1 9 9" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" /></svg></span>
            {:else}
              <span class="ricon" class:ok={paired && active === i}><Icon name={paired && active === i ? "check" : "radio"} /></span>
            {/if}
            <div class="grow">
              <div class="rhead">
                <h3>{handName(r.hand)}</h3>
                {#if active === i && paired}
                  <span class="chip sm good"><span class="pip"></span>Paired</span>
                {:else if active === i}
                  <span class="chip sm accent">Pairing</span>
                {:else if r.linked}
                  <span class="chip sm good"><span class="pip"></span>Connected</span>
                {:else}
                  <span class="chip sm">No glove</span>
                {/if}
              </div>
              {#if active === i && !paired}
                <div class="hint">Searching for the glove. Hold its power button until both lights flash green.</div>
              {:else}
                <div class="serial">Receiver {r.serial || "—"}</div>
              {/if}
            </div>

            {#if active === i}
              {#if !paired}
                <span class="secs">{PAIR_SECS - elapsed} s</span>
                <button class="btn text sm" onclick={cancelPair}>Cancel</button>
              {/if}
            {:else}
              <div class="chan" class:dim={!r.linked}>
                <span class="hint">RF channel</span>
                {#if r.linked && r.channel >= 0}
                  <Select compact mono width="70px" value={String(r.channel)} options={CHANNELS} ariaLabel="RF channel" onchange={(v) => setChannel(i, parseInt(v))} />
                {:else}
                  <span class="cval">—</span>
                {/if}
              </div>
              <button class="btn sm" class:tonal={r.linked} class:filled={!r.linked} disabled={active !== null} onclick={() => startPair(i)}>
                {r.linked ? "Re-pair" : "Pair glove"}
              </button>
            {/if}
          </div>
          {#if active === i && !paired}
            <div class="progress"><div style="width:{(elapsed / PAIR_SECS) * 100}%"></div></div>
          {/if}
        </div>
      {/each}
    {/if}
    <div class="howto">
      <div class="howhead">
        <span class="section-label">Pairing, one glove at a time</span>
        <span class="hint">A radio bind only; no firmware is touched.</span>
      </div>
      <ol>
        {#each PAIR_STEPS as step, n}
          <li><span class="n">{n + 1}</span>{step}</li>
        {/each}
      </ol>
    </div>
  </section>

  <h2 class="section-label">Drivers and permissions</h2>
  <section class="card list" aria-label="Drivers and permissions">
    <div class="item">
      <div class="grow">
        <div class="ititle">Device permissions</div>
        <div class="hint">A udev rule so the app can reach the dongles without sudo. Installing asks for your password once.</div>
      </div>
      {#if !udev}
        <span class="chip">Checking…</span>
      {:else if udevOk}
        <span class="chip good"><span class="pip"></span>Installed</span>
      {:else if udev.installed}
        <span class="chip warn"><span class="pip"></span>Out of date</span>
      {:else}
        <span class="chip">Not installed</span>
      {/if}
      <div class="acts">
        <button class="btn sm" class:text={udevOk} class:filled={!udevOk} disabled={!!busy} onclick={installUdev}>
          {busy === "udev" ? "Installing…" : udevOk ? "Reinstall" : udev?.installed ? "Update" : "Install"}
        </button>
      </div>
    </div>
    <div class="item">
      <div class="grow">
        <div class="ititle">SteamVR driver</div>
        <div class="hint">Shows the gloves as Index controllers. Restart SteamVR after a change.</div>
        {#if svrError}<div class="err">{svrError}</div>{/if}
      </div>
      {#if !svr}
        <span class="chip">Checking…</span>
      {:else if !svr.paths_file_found}
        <span class="chip warn"><span class="pip"></span>Launch SteamVR once first</span>
      {:else if svr.registered}
        <span class="chip good"><span class="pip"></span>Installed</span>
      {:else}
        <span class="chip">Not installed</span>
      {/if}
      <div class="acts">
        {#if svr?.registered}
          <button class="btn text sm" disabled={!!busy} onclick={() => svrAction(steamvrRemove)}>Remove</button>
        {/if}
        <button
          class="btn sm"
          class:text={svr?.registered}
          class:filled={!svr?.registered}
          disabled={!!busy || !svr?.paths_file_found}
          onclick={() => svrAction(steamvrInstall)}
        >
          {busy === "svr" ? "Working…" : svr?.registered ? "Reinstall" : "Install"}
        </button>
      </div>
    </div>
    <div class="item">
      <div class="grow">
        <div class="ititle">Monado</div>
        <div class="hint">Monado compiles drivers in, so it needs the UDCAP fork. The guide covers Monadeck, Envision and a manual build.</div>
      </div>
      <span class="chip warn"><span class="pip"></span>Fork required</span>
      <div class="acts">
        <button class="btn tonal sm" onclick={openMonadoGuide}>Guide</button>
      </div>
    </div>
  </section>
</Page>

<style>
  .grow {
    flex: 1;
    min-width: 0;
  }
  h2.section-label {
    margin: 4px 0 -4px;
  }
  .recvlist {
    display: flex;
    flex-direction: column;
  }
  .empty {
    margin: auto;
    padding: 24px 0;
    font-size: 13px;
    color: var(--text-2);
    text-align: center;
  }
  .howto {
    margin-top: auto;
    padding: 14px 0;
    border-top: 1px solid var(--border);
  }
  .howhead {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .howto ol {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }
  .howto li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 12px;
    color: var(--text-2);
  }
  .n {
    width: 22px;
    height: 22px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
  }
  .recv {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .recv:last-child {
    border-bottom: none;
  }
  .rrow {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .ricon {
    width: 40px;
    height: 40px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--radius-inner);
    background: var(--raised);
    color: var(--text-2);
  }
  .ricon.ok {
    background: var(--success-soft);
    color: var(--success-text);
  }
  .ricon.spin {
    background: var(--accent-soft);
  }
  .ricon.spin svg {
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .rhead {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h3 {
    font-size: 14px;
    font-weight: 600;
  }
  .serial {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-3);
  }
  .secs {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--text-2);
  }
  .chan {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chan.dim {
    opacity: 0.5;
  }
  .cval {
    font-family: var(--font-mono);
    color: var(--text-3);
  }
  .progress {
    height: 4px;
    margin-top: 12px;
    border-radius: 2px;
    background: var(--track);
    overflow: hidden;
  }
  .progress div {
    height: 100%;
    background: var(--accent);
    transition: width 1s linear;
  }

  .list {
    padding: 4px 16px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .item:last-child {
    border-bottom: none;
  }
  .ititle {
    font-size: 14px;
    font-weight: 600;
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    min-width: 96px;
  }
  .err {
    margin-top: 4px;
    font-size: 12px;
    color: var(--danger-text);
  }
</style>
