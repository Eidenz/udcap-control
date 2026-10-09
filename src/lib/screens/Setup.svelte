<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import {
    appMode,
    config,
    setup,
    chooseRuntime,
    setMonadoReady,
    type AppMode,
    type Tab,
  } from "$lib/state.svelte";
  import { udevStatus, udevInstall, steamvrStatus, steamvrInstall, type UdevStatus, type SteamvrStatus } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import RuntimeBadge from "$lib/components/RuntimeBadge.svelte";
  import MonadoGuideBody from "$lib/components/MonadoGuideBody.svelte";
  import WindowControls from "$lib/components/WindowControls.svelte";

  // First-launch setup, shown in place of the app until it's finished. `onfinish`
  // gets the page to open next, or null when the user skipped what was left.
  let { onfinish }: { onfinish: (next: Tab | null) => void } = $props();

  let udev = $state<UdevStatus | null>(null);
  let svr = $state<SteamvrStatus | null>(null);
  let busy = $state<"udev" | "svr" | null>(null);
  let svrError = $state<string | null>(null);
  const refreshUdev = async () => (udev = await udevStatus().catch(() => null));
  const refreshSvr = async () => (svr = await steamvrStatus().catch(() => null));

  async function installUdev() {
    busy = "udev";
    try {
      await udevInstall();
    } catch {
      // Closing the password prompt cancels it: not an error worth showing.
    } finally {
      await refreshUdev();
      busy = null;
    }
  }
  async function installSvr() {
    busy = "svr";
    svrError = null;
    try {
      await steamvrInstall();
    } catch (e) {
      svrError = String(e);
    } finally {
      await refreshSvr();
      busy = null;
    }
  }

  const steam = $derived(appMode.mode === "steamvr");
  const udevOk = $derived(!!udev && udev.installed && udev.up_to_date);
  const trackersSet = $derived(!!config.trackerLeft.trim() && !!config.trackerRight.trim());

  type Step = { title: string; done: boolean; summary: string };
  const steps = $derived<Step[]>([
    { title: "Your VR runtime", done: setup.runtimeChosen, summary: steam ? "SteamVR" : "Monado" },
    { title: "Device permissions", done: udevOk, summary: "Installed" },
    steam
      ? { title: "SteamVR driver", done: !!svr?.registered, summary: "Installed" }
      : { title: "Monado with the glove driver", done: setup.monadoReady, summary: "Ready" },
    { title: "Trackers", done: false, summary: "" },
  ]);

  // One step open at a time: the first one left to do, then the next one each
  // time a step gets done. Done steps fold up and can be reopened.
  let active = $state(0);
  const nextAfter = (i: number) => {
    for (let j = i + 1; j < steps.length; j++) if (!steps[j].done) return j;
    return steps.length - 1;
  };
  let wasDone: boolean[] = [];
  $effect(() => {
    const now = steps.map((s) => s.done);
    if (now[active] && wasDone[active] === false) active = nextAfter(active);
    wasDone = now;
  });
  // Everything past the runtime depends on it, so that one comes first.
  const reachable = (i: number) => i === 0 || setup.runtimeChosen;

  const RUNTIMES: { id: AppMode; name: string; sub: string }[] = [
    { id: "steamvr", name: "SteamVR", sub: "Valve's runtime, through Steam" },
    { id: "monado", name: "Monado", sub: "The open-source OpenXR runtime" },
  ];
  function pickRuntime(m: AppMode) {
    chooseRuntime(m);
    active = nextAfter(0);
  }
  function monadoDone() {
    setMonadoReady(true);
    active = nextAfter(2);
  }

  // --- Intro: the logo lands at the head of the step rail, which then grows
  // out of it, popping each step's node along the way.
  let logoEl = $state<HTMLElement>();
  let revealed = $state(false);
  onMount(() => {
    Promise.all([refreshUdev(), refreshSvr()]).then(() => {
      wasDone = [];
      active = steps.findIndex((s, i) => !s.done && reachable(i));
    });
    if (!logoEl || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealed = true;
      return;
    }
    const r = logoEl.getBoundingClientRect();
    const dx = innerWidth / 2 - (r.left + r.width / 2);
    const dy = innerHeight / 2 - 30 - (r.top + r.height / 2);
    const away = `translate(${dx}px, ${dy}px)`;
    const glow = "0 0 90px 0 rgba(157, 140, 255, 0.45)";
    logoEl.animate(
      [
        { transform: `${away} scale(0.3)`, opacity: 0, boxShadow: "none" },
        { transform: `${away} scale(2.4)`, opacity: 1, boxShadow: glow, offset: 0.3 },
        { transform: `${away} scale(2.4)`, opacity: 1, boxShadow: glow, offset: 0.5 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 1700, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)", fill: "backwards" },
    );
    const t = setTimeout(() => (revealed = true), 1250);
    return () => clearTimeout(t);
  });
</script>

<div class="setup" class:revealed>
  <header class="top" data-tauri-drag-region>
    <button class="btn text sm skipall" onclick={() => onfinish(null)}>Skip setup</button>
    <WindowControls />
  </header>

  <div class="scroll">
    <div class="col">
      <div class="hero">
        <div class="logo" bind:this={logoEl} aria-hidden="true">U</div>
        <div class="titles">
          <h1>Welcome to UDCAP Control</h1>
          <p>A few one-time steps to get your gloves into VR.</p>
        </div>
      </div>

      <ol class="steps">
        {#each steps as st, i}
          {@const open = i === active}
          <li class="step" class:open class:done={st.done} style="--i:{i}">
            <span class="node" aria-hidden="true">
              {#if st.done && !open}<Icon name="check" size={14} stroke={3} />{:else}{i + 1}{/if}
            </span>
            <div class="sbody">
              <button class="shead" disabled={open || !reachable(i)} onclick={() => (active = i)}>
                <span class="stitle">{st.title}</span>
                {#if st.done && !open}<span class="chip sm" class:good={i > 0}>{st.summary}</span>{/if}
              </button>

              {#if open}
                <div class="content card" transition:slide={{ duration: 220 }}>
                  {#if i === 0}
                    <p class="desc">Which one runs your headset? You can change this later in Settings.</p>
                    <div class="choices">
                      {#each RUNTIMES as r}
                        <button
                          class="choice"
                          class:selected={setup.runtimeChosen && appMode.mode === r.id}
                          onclick={() => pickRuntime(r.id)}
                        >
                          <RuntimeBadge runtime={r.id} connected status={false} size={44} />
                          <span class="ctext"><b>{r.name}</b><span class="hint">{r.sub}</span></span>
                        </button>
                      {/each}
                    </div>
                  {:else if i === 1}
                    <p class="desc">
                      {udev?.installed && !udev.up_to_date
                        ? "The installed udev rule is out of date."
                        : "Lets the app reach the glove dongles without sudo. Asks for your password once."}
                    </p>
                    <div class="row">
                      {#if udevOk}
                        <span class="chip good"><Icon name="check" size={13} stroke={3} />Installed</span>
                      {:else}
                        <button class="btn filled" disabled={!!busy} onclick={installUdev}>
                          {busy === "udev" ? "Installing…" : udev?.installed ? "Update" : "Install"}
                        </button>
                      {/if}
                    </div>
                  {:else if i === 2 && steam}
                    {#if svr?.registered}
                      <p class="desc">Installed. SteamVR sees the gloves as Index controllers, and the app keeps the driver up to date.</p>
                      <span class="chip good"><Icon name="check" size={13} stroke={3} />Installed</span>
                    {:else if svr && !svr.paths_file_found}
                      <p class="desc">SteamVR hasn't run on this computer yet. Launch it once, then check again.</p>
                      <button class="btn tonal" onclick={refreshSvr}><Icon name="refresh" size={16} />Check again</button>
                    {:else}
                      <p class="desc">Shows the gloves as Index controllers in SteamVR. The app keeps the driver up to date.</p>
                      <button class="btn filled" disabled={!!busy || !svr} onclick={installSvr}>
                        {busy === "svr" ? "Installing…" : "Install driver"}
                      </button>
                    {/if}
                    {#if svrError}<p class="err">{svrError}</p>{/if}
                  {:else if i === 2}
                    <div class="guide"><MonadoGuideBody /></div>
                    <div class="row">
                      <button class="btn filled" onclick={monadoDone}>I'm all set</button>
                    </div>
                  {:else}
                    <p class="desc">
                      The Lighthouse tracker on each glove, so the hands follow them. The gloves work without, so this can wait.
                    </p>
                    {#if trackersSet}
                      <p class="mono trk">{config.trackerLeft} · {config.trackerRight}</p>
                    {/if}
                    <div class="row">
                      {#if trackersSet}
                        <button class="btn filled" onclick={() => onfinish(null)}>Finish</button>
                        <button class="btn tonal" onclick={() => onfinish("alignment")}>Change</button>
                      {:else}
                        <button class="btn filled" onclick={() => onfinish("alignment")}>Assign</button>
                        <button class="btn text" onclick={() => onfinish(null)}>Skip</button>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    </div>
  </div>
</div>

<style>
  .setup {
    flex: 1;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(60% 50% at 50% -10%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%),
      var(--bg);
  }
  .top {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    height: 52px;
    padding: 8px 14px;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
  }
  .col {
    width: min(640px, 100% - 48px);
    margin: 0 auto;
    padding: max(16px, 5vh) 0 48px;
  }

  /* The rail: logo, then one node per step, joined by a line down the first column. */
  .hero,
  .step {
    position: relative;
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    column-gap: 18px;
  }
  .hero {
    align-items: center;
    padding-bottom: 30px;
  }
  .hero::after,
  .step::before {
    content: "";
    position: absolute;
    left: 27px;
    width: 2px;
    background: var(--border-strong);
    transform-origin: top;
  }
  .hero::after {
    top: 64px;
    bottom: 0;
  }
  .step::before {
    top: 0;
    bottom: 0;
  }
  .step:last-child::before {
    bottom: auto;
    height: 16px;
  }
  .logo {
    width: 56px;
    height: 56px;
    display: grid;
    place-items: center;
    border-radius: 17px;
    background: linear-gradient(135deg, #c3c0ff, #8f8bff);
    color: #2a2870;
    font-size: 28px;
    font-weight: 700;
    position: relative;
    z-index: 2;
  }
  h1 {
    font-family: var(--font-display);
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .titles p {
    margin-top: 4px;
    font-size: 14px;
    color: var(--text-3);
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .step {
    padding-bottom: 20px;
  }
  .node {
    position: relative;
    z-index: 1;
    justify-self: center;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--bg);
    box-shadow: inset 0 0 0 1.5px var(--outline);
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    transition: background 0.2s var(--ease), color 0.2s var(--ease), box-shadow 0.2s var(--ease);
  }
  .step.done .node {
    background: #1b2a22;
    box-shadow: none;
    color: var(--success-text);
  }
  .step.open .node {
    background: var(--accent);
    box-shadow: 0 0 0 5px var(--accent-soft);
    color: var(--on-accent);
  }
  .shead {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 32px;
    text-align: left;
  }
  .shead:disabled {
    cursor: default;
  }
  .stitle {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-2);
  }
  .step.open .stitle {
    color: var(--text);
  }
  .shead:not(:disabled):hover .stitle {
    color: var(--text);
  }
  .step:not(.done):not(.open) .stitle {
    color: var(--text-3);
  }
  .content {
    margin-top: 10px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
  .content .desc {
    margin: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chip :global(svg) {
    margin-left: -2px;
  }
  .err {
    font-size: 12px;
    color: var(--danger-text);
  }
  .trk {
    font-size: 13px;
    color: var(--text-2);
  }
  .guide {
    align-self: stretch;
    padding: 16px;
    background: var(--inset);
    border: 1px solid var(--border);
    border-radius: var(--radius-inner);
  }

  .choices {
    align-self: stretch;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    text-align: left;
    background: var(--inset);
    border: 1px solid var(--border);
    border-radius: var(--radius-inner);
    transition: border-color 0.15s var(--ease), background 0.15s var(--ease);
  }
  .choice:hover {
    background: var(--raised);
    border-color: var(--border-strong);
  }
  .choice.selected {
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }
  .ctext {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ctext b {
    font-size: 15px;
    font-weight: 600;
  }

  /* Intro: hidden until the logo lands, then the rail grows step by step. */
  .setup:not(.revealed) :is(.titles, .steps, .skipall) {
    opacity: 0;
  }
  .setup:not(.revealed) .hero::after {
    transform: scaleY(0);
  }
  .revealed .titles {
    animation: rise 0.5s var(--ease) both;
  }
  .revealed .skipall {
    animation: rise 0.5s var(--ease) 0.6s both;
  }
  .revealed .hero::after {
    animation: grow 0.25s ease-in 0.25s both;
  }
  .revealed .step::before {
    animation: grow 0.28s linear calc(0.5s + var(--i) * 0.28s) both;
  }
  .revealed .node {
    animation: pop 0.38s cubic-bezier(0.3, 1.6, 0.5, 1) calc(0.45s + var(--i) * 0.28s) both;
  }
  .revealed .sbody {
    animation: rise 0.45s var(--ease) calc(0.55s + var(--i) * 0.28s) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .revealed :is(.titles, .skipall, .node, .sbody),
    .revealed .hero::after,
    .revealed .step::before {
      animation: none;
    }
  }
</style>
