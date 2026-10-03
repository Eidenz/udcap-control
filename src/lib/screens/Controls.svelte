<script lang="ts">
  import { app, io, saveIo, applyHandIo, defaultHandIo, stickNotice, finishStickNotice, moduleSeen } from "$lib/state.svelte";
  import { testVibration, sendCommandArg, CMD, JOY_CALIB, BTN_SOURCES, FINGER_SEL, type HandView } from "$lib/api";
  import Page from "$lib/components/Page.svelte";
  import Select from "$lib/components/Select.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import DualRange from "$lib/components/DualRange.svelte";
  import Icon from "$lib/components/Icon.svelte";

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(live ? (shm?.hands ?? []) : []);

  // Which hand the cards edit. With "Both hands" every edit goes to both, so
  // hand 0 stands in for the pair.
  let pick = $state(0);
  const ed = $derived(io.linked ? 0 : pick);
  const cfg = $derived(io.hands[ed]);

  // Control module on the edited hand: live, else last seen, else the other hand.
  const versionOf = (h: number) => (hands[h]?.present ? hands[h].controller_version : 0) || moduleSeen[h];
  const moduleV = $derived(versionOf(ed) || versionOf(1 - ed) || 2);

  function setLinked(v: string) {
    io.linked = v === "Both hands";
    if (io.linked) {
      io.hands[1] = JSON.parse(JSON.stringify(io.hands[0]));
      applyHandIo(1);
    }
    saveIo();
  }
  function commit(fn: (h: number) => void) {
    for (const h of io.linked ? [0, 1] : [ed]) {
      fn(h);
      applyHandIo(h);
    }
    saveIo();
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const editBtn = (out: number, name: string) => commit((h) => (io.hands[h].btn[out] = Math.max(0, BTN_SOURCES.indexOf(name))));
  const editFinger = (which: "tFinger" | "gFinger", name: string) =>
    commit((h) => (io.hands[h][which] = Math.max(0, FINGER_SEL.indexOf(name))));
  const editRange = (kind: "t" | "g", lo: number, hi: number) =>
    commit((h) => {
      if (kind === "t") {
        io.hands[h].tMin = r2(lo);
        io.hands[h].tMax = r2(hi);
      } else {
        io.hands[h].gMin = r2(lo);
        io.hands[h].gMax = r2(hi);
      }
    });
  const editIoNum = (key: "deadzone" | "trackpad", v: number) => commit((h) => (io.hands[h][key] = r2(v)));
  function reset() {
    io.hands = [defaultHandIo(), defaultHandIo()];
    applyHandIo(0);
    applyHandIo(1);
    saveIo();
  }

  // Live reading of the finger that drives an axis (5 = average of M+R+P).
  function fingerLive(h: HandView | undefined, f: number): number | null {
    if (!h?.present) return null;
    if (f < 5) return h.curl[f] ?? 0;
    return ((h.curl[2] ?? 0) + (h.curl[3] ?? 0) + (h.curl[4] ?? 0)) / 3;
  }

  // Button outputs (index = output) for the table on a Control Module 2.0.
  const OUTPUTS = [
    { o: 0, out: "A button", desc: "Primary face button" },
    { o: 1, out: "B button", desc: "Secondary face button" },
    { o: 2, out: "System", desc: "Menu or dashboard" },
    { o: 3, out: "Stick click", desc: "Pressing the thumbstick in" },
    { o: 4, out: "Trigger click", desc: "Forces the trigger to 100%" },
    { o: 5, out: "Grip click", desc: "Forces the grip to 100%" },
  ];
  // Pickers on the original module's hand drawing, at its dotted-line ends.
  // top/x are percentages of the map box; x is the gap from the hand side.
  const NODES = [
    { o: 3, label: "Stick", top: 11, x: 56 },
    { o: 1, label: "B", top: 25, x: 53 },
    { o: 0, label: "A", top: 34, x: 70 },
    { o: 2, label: "System", top: 44, x: 55 },
    { o: 4, label: "Trigger", top: 65, x: 52 },
    { o: 5, label: "Grip", top: 86, x: 52 },
  ];

  // Thumbstick calibration. The server reports progress in joy_calib_state; a
  // Control Module 2.0 runs the capture on the module itself, the original
  // module is captured in software. Both hands are calibrated together.
  const joyState = $derived(live ? (shm?.joy_calib_state ?? JOY_CALIB.IDLE) : JOY_CALIB.IDLE);
  const anyV2 = $derived(hands.some((h) => h.present && h.controller_version === 2));
  const joyCmd = (code: number) => sendCommandArg(code, -1).catch(() => {});

  // One-time Control Module 2.0 nudge (shared with Home). "Show me" scrolls to the
  // stick card and briefly highlights it; arriving from Home does the same via
  // stickNotice.scrollTo once this screen is mounted.
  const showStickNotice = $derived(!stickNotice.done && anyV2);
  let joycalEl = $state<HTMLElement | undefined>();
  let joycalFlash = $state(false);
  function scrollToJoycal() {
    finishStickNotice();
    joycalEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    joycalFlash = true;
    setTimeout(() => (joycalFlash = false), 1800);
  }
  $effect(() => {
    if (stickNotice.scrollTo && joycalEl) {
      stickNotice.scrollTo = false;
      scrollToJoycal();
    }
  });

  const fill = (v: number, hi: number) => `${(v / hi) * 100}%`;
</script>

{#snippet bar(label: string, v: number)}
  <div class="bar">
    <span class="bl">{label}</span>
    <span class="track"><span style="width:{v * 100}%"></span></span>
    <span class="bv">{Math.round(v * 100)}%</span>
  </div>
{/snippet}

{#snippet liveRow(h: HandView | undefined, name: string, i: number)}
  <div class="lrow">
    <div class="ltop">
      <span class="lname">{name}</span>
      {#if h?.present}
        <div class="pills">
          <span class="pill" class:on={h.btn_a}>A</span>
          <span class="pill" class:on={h.btn_b}>B</span>
          <span class="pill" class:on={h.btn_menu}>{h.controller_version === 2 ? "Sys" : "Menu"}</span>
          <span class="pill" class:on={h.btn_joy}>Stick</span>
          <span class="pill" class:on={h.btn_power}>Pwr</span>
        </div>
        <span class="grow"></span>
        <span class="stick" class:click={h.btn_joy} title="Thumbstick">
          <span style="left:{50 + h.joy_x * 34}%;top:{50 - h.joy_y * 34}%"></span>
        </span>
      {:else}
        <span class="hint grow">Not connected</span>
      {/if}
      <button
        class="btn tonal sm vib"
        aria-label="Test vibration, {name.toLowerCase()} glove"
        title="Test vibration"
        disabled={!h?.present}
        onclick={() => testVibration(i, 1, 0.25)}><Icon name="vibrate" size={16} /></button
      >
    </div>
    {#if h?.present}
      <div class="bars">
        {@render bar("Trigger", h.trigger)}
        {@render bar("Grip", h.grip)}
        {@render bar("Trackpad", h.trackpad)}
      </div>
    {/if}
  </div>
{/snippet}

<Page title="Controls" subtitle="Buttons, trigger, grip and thumbstick">
  {#snippet actions()}
    {#if !io.linked}
      <Segmented value={pick === 0 ? "Left" : "Right"} options={["Left", "Right"]} onchange={(v) => (pick = v === "Left" ? 0 : 1)} />
    {/if}
    <Segmented value={io.linked ? "Both hands" : "Per hand"} options={["Both hands", "Per hand"]} onchange={setLinked} />
  {/snippet}

  {#if showStickNotice}
    <div class="card banner">
      <Icon name="info" />
      <p><b>Control Module 2.0 detected.</b> Calibrate the thumbsticks once if they drift at rest or clip at the edges.</p>
      <button class="btn text sm" onclick={finishStickNotice}>Dismiss</button>
      <button class="btn tonal sm" onclick={scrollToJoycal}>Show me</button>
    </div>
  {/if}

  <section class="card" aria-label="Live inputs">
    <div class="lrows">
      {@render liveRow(hands[0], "Left", 0)}
      {@render liveRow(hands[1], "Right", 1)}
    </div>
  </section>

  <section class="card" aria-labelledby="map-h">
    <div class="card-head">
      <div class="grow inline">
        <h2 id="map-h">Button mapping</h2>
        <p class="hint">Which input on the module drives each controller button.</p>
      </div>
      {#if !io.linked}<span class="chip accent">{pick === 0 ? "Left" : "Right"} hand</span>{/if}
      <button class="btn text sm" onclick={reset}>Reset</button>
    </div>

    {#if moduleV === 1}
      <div class="handmap" class:mirror={ed === 1}>
        <img class="handimg" src="/hand.png" alt="Control module 1.0 on the hand" />
        {#each NODES as n}
          <div class="hnode" class:assigned={cfg.btn[n.o] !== 0} style="top:{n.top}%;{ed === 1 ? 'right' : 'left'}:{n.x}%">
            <span class="hlabel">{n.label}</span>
            <Select
              compact
              value={BTN_SOURCES[cfg.btn[n.o]] ?? "None"}
              options={BTN_SOURCES}
              ariaLabel="Input for {n.label}"
              onchange={(name) => editBtn(n.o, name)}
            />
          </div>
        {/each}
      </div>
    {:else}
      <div class="mapping">
        <figure class="schematic">
          <svg viewBox="0 0 206 150" role="img" aria-label="Control Module 2.0 inputs">
            <rect x="8" y="10" width="190" height="112" rx="30" fill="#232329" stroke="#34343b" />
            <circle cx="62" cy="66" r="28" fill="#18181c" stroke="#3a3a42" />
            <circle cx="62" cy="66" r="13" fill="#2e2e35" stroke="var(--accent)" stroke-width="2" />
            <rect x="112" y="28" width="30" height="11" rx="5.5" fill="#2e2e35" stroke="#3a3a42" />
            <circle cx="164" cy="56" r="13" fill="#2e2e35" stroke="#3a3a42" />
            <circle cx="140" cy="84" r="13" fill="#2e2e35" stroke="#3a3a42" />
            <text x="164" y="60" text-anchor="middle" class="key">B</text>
            <text x="140" y="88" text-anchor="middle" class="key">A</text>
            <text x="62" y="112" text-anchor="middle" class="lbl">Stick</text>
            <text x="127" y="22" text-anchor="middle" class="lbl">System</text>
            <text x="103" y="142" text-anchor="middle" class="cap">Control Module 2.0, schematic</text>
          </svg>
        </figure>
        <div class="mapgrid">
          {#each OUTPUTS as m}
            <div class="mapitem">
              <div class="grow">
                <div class="mout">{m.out}</div>
                <div class="hint">{m.desc}</div>
              </div>
              <Select
                width="140px"
                value={BTN_SOURCES[cfg.btn[m.o]] ?? "None"}
                options={BTN_SOURCES}
                ariaLabel="Input for {m.out}"
                onchange={(name) => editBtn(m.o, name)}
              />
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <div class="duo grow-y">
    <section class="card col" aria-labelledby="axes-h">
      <h2 id="axes-h">Trigger and grip</h2>
      <p class="desc">Which finger drives each axis, and the curl range that maps to 0–100%.</p>
      <div class="axes">
        <div class="axis">
          <div class="arow">
            <span class="aname">Trigger</span>
            <Select width="150px" value={FINGER_SEL[cfg.tFinger]} options={FINGER_SEL.slice(0, 5)} ariaLabel="Finger for the trigger" onchange={(n) => editFinger("tFinger", n)} />
            <span class="arange">{cfg.tMin.toFixed(2)}–{cfg.tMax.toFixed(2)}</span>
          </div>
          <div class="drow">
            <DualRange label="Trigger" low={cfg.tMin} high={cfg.tMax} live={fingerLive(hands[ed], cfg.tFinger)} onchange={(lo, hi) => editRange("t", lo, hi)} />
          </div>
        </div>
        <div class="axis">
          <div class="arow">
            <span class="aname">Grip</span>
            <Select width="150px" value={FINGER_SEL[cfg.gFinger]} options={FINGER_SEL} ariaLabel="Finger for the grip" onchange={(n) => editFinger("gFinger", n)} />
            <span class="arange">{cfg.gMin.toFixed(2)}–{cfg.gMax.toFixed(2)}</span>
          </div>
          <div class="drow">
            <DualRange label="Grip" low={cfg.gMin} high={cfg.gMax} live={fingerLive(hands[ed], cfg.gFinger)} onchange={(lo, hi) => editRange("g", lo, hi)} />
          </div>
        </div>
      </div>
    </section>

    <section class="card col" aria-labelledby="stick-h">
      <h2 id="stick-h">Thumbstick and trackpad</h2>
      <div class="joycal" class:flash={joycalFlash} bind:this={joycalEl}>
      <div class="jtop">
        <span class="jtitle">Stick calibration</span>
        {#if joyState === JOY_CALIB.DONE}
          <span class="chip sm good"><span class="pip"></span>Calibrated</span>
        {:else if joyState === JOY_CALIB.CENTERED || joyState === JOY_CALIB.RANGING}
          <span class="chip sm accent">{joyState === JOY_CALIB.CENTERED ? "Centre stored" : "Capturing range"}</span>
        {/if}
        <span class="grow"></span>
        {#if joyState === JOY_CALIB.CENTERED}
          <button class="btn filled sm" onclick={() => joyCmd(CMD.JOY_CALIB_RANGE_START)}>Next: capture range</button>
        {:else if joyState === JOY_CALIB.RANGING}
          <button class="btn filled sm" onclick={() => joyCmd(CMD.JOY_CALIB_RANGE_STOP)}>Finish</button>
        {:else}
          <button class="btn tonal sm" disabled={!live} onclick={() => joyCmd(CMD.JOY_CALIB_CENTER)}>
            {joyState === JOY_CALIB.DONE ? "Recalibrate" : "Calibrate"}
          </button>
        {/if}
      </div>
      <p class="hint">
        {#if joyState === JOY_CALIB.CENTERED}
          Centre stored. Click Next, then roll each stick slowly around its full edge a few times.
        {:else if joyState === JOY_CALIB.RANGING}
          Keep circling both sticks to their edges, then click Finish.
        {:else if anyV2}
          Stored on the module. Redo it if a stick drifts or won't reach its edges. Hands off both sticks, then click.
        {:else}
          Captures each stick's centre and travel, both hands at once. Hands off both sticks, then click.
        {/if}
      </p>
    </div>
    <div class="sliders">
        <label>
          <span class="shead"><span>Stick deadzone</span><b>{Math.round(cfg.deadzone * 100)}%</b></span>
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.01"
            value={cfg.deadzone}
            style="--fill:{fill(cfg.deadzone, 0.5)}"
            oninput={(e) => editIoNum("deadzone", parseFloat(e.currentTarget.value))}
          />
          <span class="hint">Ignore small movement near the centre so the stick doesn't drift.</span>
        </label>
        <label>
          <span class="shead"><span>Trackpad touch</span><b>{Math.round(cfg.trackpad * 100)}%</b></span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={cfg.trackpad}
            style="--fill:{fill(cfg.trackpad, 1)}"
            oninput={(e) => editIoNum("trackpad", parseFloat(e.currentTarget.value))}
          />
          <span class="hint">How far the thumb moves on the pad before it counts as resting there.</span>
        </label>
      </div>
    </section>
  </div>
</Page>

<style>
  .grow {
    flex: 1;
    min-width: 0;
  }
  .inline {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--accent);
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

  /* live inputs */
  .lrows {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 8px;
  }
  .lrow {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    background: var(--inset);
    border-radius: var(--radius-inner);
  }
  .ltop {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lname {
    width: 40px;
    font-size: 13px;
    font-weight: 600;
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
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--text-3);
  }
  .bl {
    width: 52px;
  }
  .bv {
    width: 32px;
    text-align: right;
    font-family: var(--font-mono);
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
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: var(--radius-inner);
    background: var(--well);
    border: 1px solid var(--border-input);
  }
  .stick.click {
    border-color: var(--accent);
  }
  .stick span {
    position: absolute;
    width: 9px;
    height: 9px;
    margin: -4.5px 0 0 -4.5px;
    border-radius: 50%;
    background: var(--accent);
  }
  .vib {
    width: 36px;
    padding: 0;
  }

  /* mapping: Control Module 2.0 */
  .mapping {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    align-items: flex-start;
    margin-top: 14px;
  }
  .schematic {
    margin: 0;
    flex: 0 1 210px;
    padding: 12px;
    background: var(--inset);
    border-radius: var(--radius-inner);
  }
  .schematic svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .schematic .key {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    fill: var(--text);
  }
  .schematic .lbl {
    font-family: var(--font);
    font-size: 11px;
    fill: var(--text-3);
  }
  .schematic .cap {
    font-family: var(--font);
    font-size: 11px;
    fill: var(--text-4);
  }
  .mapgrid {
    flex: 1 1 400px;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
    gap: 8px;
  }
  .mapitem {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 12px;
    background: var(--inset);
    border-radius: var(--radius-inner);
  }
  .mout {
    font-size: 13px;
    font-weight: 600;
  }

  /* mapping: original module, pickers on the hand drawing */
  .handmap {
    position: relative;
    width: 100%;
    max-width: 680px;
    aspect-ratio: 680 / 380;
    margin: 14px auto 0;
  }
  .handimg {
    position: absolute;
    left: 1%;
    top: 50%;
    transform: translateY(-50%);
    height: 88%;
    width: auto;
    opacity: 0.8;
    pointer-events: none;
    user-select: none;
  }
  .mirror .handimg {
    left: auto;
    right: 1%;
    transform: translateY(-50%) scaleX(-1);
  }
  .hnode {
    position: absolute;
    transform: translateY(-50%);
    width: 132px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .hlabel {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-2);
    padding-left: 3px;
  }
  .hnode.assigned .hlabel {
    color: var(--accent);
  }

  /* trigger & grip */
  .axes {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
  }
  .duo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: 14px;
  }
  .col {
    display: flex;
    flex-direction: column;
  }
  .col .axes {
    flex: 1;
  }
  .col .axis {
    flex: 1;
    justify-content: center;
  }
  .axis {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--inset);
    border-radius: var(--radius-inner);
  }
  .arow {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .drow {
    display: flex;
  }
  .aname {
    width: 52px;
    font-size: 13px;
    font-weight: 600;
  }
  .arange {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-2);
  }

  /* thumbstick */
  .joycal {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 14px;
    padding: 12px;
    background: var(--inset);
    border-radius: var(--radius-inner);
    box-shadow: 0 0 0 0 transparent;
    transition: box-shadow 0.4s var(--ease);
  }
  .joycal.flash {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .jtop {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .jtitle {
    font-size: 13px;
    font-weight: 600;
  }
  .sliders {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 14px 24px;
    margin-top: 14px;
  }
  .sliders label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .shead {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 14px;
    font-weight: 600;
  }
  .shead b {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
  }
</style>
