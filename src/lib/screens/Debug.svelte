<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { app, appMode } from "$lib/state.svelte";
  import { appVersion, shmVersion, saveDebugReport, FINGERS, type HandView } from "$lib/api";

  let { onBack }: { onBack: () => void } = $props();

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(shm?.hands ?? []);
  const linked = $derived(hands.filter((h) => h.present && h.link === 3).length);

  let appVer = $state("");
  let shmVer = $state(0);
  onMount(async () => {
    try {
      appVer = await appVersion();
    } catch {
      appVer = "";
    }
    try {
      shmVer = await shmVersion();
    } catch {
      shmVer = 0;
    }
  });

  const HAND_NAMES = ["Left", "Right"];
  const LINK_NAMES: Record<number, string> = { 0: "init", 1: "not connected", 2: "connected", 3: "linked" };
  // The 12 calibrated sensor channels are raw sensors f4..f15. Indices 4/7/10
  // are the splay (abduction) channels for index/ring/little; the rest flex.
  const SPLAY_CH = new Set([4, 7, 10]);
  const chName = (i: number) => `f${i + 4}`;
  const chKind = (i: number) => (SPLAY_CH.has(i) ? "splay" : "flex");

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const pct = (n: number) => Math.round(n * 100);

  // Calibration span quality. Mirrors the core: |span| > 25 = "significant"
  // (tracks well), the MIN_SPAN floor is 15, below which a joint barely responds.
  type Q = { label: string; cls: string };
  function spanQuality(open: number, fist: number): Q {
    const s = Math.abs(fist - open);
    if (s >= 25) return { label: "Good", cls: "q-good" };
    if (s >= 15) return { label: "Fair", cls: "q-fair" };
    if (s >= 8) return { label: "Poor", cls: "q-poor" };
    return { label: "Very poor", cls: "q-dead" };
  }
  // Observed normalized-curl range (from the guided test) -> quality.
  function rangeQuality(range: number): Q {
    if (range >= 0.6) return { label: "Good", cls: "q-good" };
    if (range >= 0.35) return { label: "Fair", cls: "q-fair" };
    if (range >= 0.15) return { label: "Poor", cls: "q-poor" };
    return { label: "No motion", cls: "q-dead" };
  }

  // ---- Guided diagnostic recording -------------------------------------------
  type Step = { emoji: string; title: string; hint: string; secs: number; tag: string };
  const TEST_STEPS: Step[] = [
    { emoji: "🖐️", title: "Relax your hands", hint: "Let both hands rest, open and still.", secs: 3, tag: "relax" },
    { emoji: "✊", title: "Make a full fist", hint: "Curl every finger as far as it will go.", secs: 3, tag: "fist" },
    { emoji: "🖐️", title: "Spread fingers wide", hint: "Flat hand, fingers splayed apart.", secs: 3, tag: "spread" },
    { emoji: "👋", title: "Wiggle your thumb", hint: "Curl and extend just the thumb, a few times.", secs: 3, tag: "wiggle-0" },
    { emoji: "👋", title: "Wiggle your index finger", hint: "Curl and extend just the index finger.", secs: 3, tag: "wiggle-1" },
    { emoji: "👋", title: "Wiggle your middle finger", hint: "Curl and extend just the middle finger.", secs: 3, tag: "wiggle-2" },
    { emoji: "👋", title: "Wiggle your ring finger", hint: "Curl and extend just the ring finger.", secs: 3, tag: "wiggle-3" },
    { emoji: "👋", title: "Wiggle your pinky", hint: "Curl and extend just the pinky.", secs: 3, tag: "wiggle-4" },
  ];

  type Sample = { t: number; step: string; hands: ({ curl: number[]; cali_live: number[] } | null)[] };
  type PerFinger = { min: number; max: number; range: number; quality: string };

  let testPhase = $state<"idle" | "ready" | "running" | "done">("idle");
  let stepIdx = $state(0);
  let stepLeft = $state(0);
  let samples: Sample[] = [];
  // per-hand, per-finger observed min/max of normalized curl over the whole run.
  let obsMin: number[][] = [];
  let obsMax: number[][] = [];
  let testResult = $state<null | {
    startedAt: string;
    durationMs: number;
    sampleCount: number;
    perFinger: PerFinger[][]; // [hand][finger]
    samples: Sample[];
  }>(null);

  let sampler: ReturnType<typeof setInterval> | undefined;
  let stepper: ReturnType<typeof setInterval> | undefined;
  let t0 = 0;

  function stopTimers() {
    if (sampler) clearInterval(sampler);
    if (stepper) clearInterval(stepper);
    sampler = undefined;
    stepper = undefined;
  }
  onDestroy(stopTimers);

  function startTest() {
    if (testPhase !== "idle" && testPhase !== "done") return;
    testResult = null;
    samples = [];
    obsMin = [
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
    ];
    obsMax = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    testPhase = "ready";
    stepLeft = 3;
    stepper = setInterval(() => {
      stepLeft -= 1;
      if (stepLeft <= 0) beginRecording();
    }, 1000);
  }

  function beginRecording() {
    stopTimers();
    testPhase = "running";
    stepIdx = 0;
    stepLeft = TEST_STEPS[0].secs;
    t0 = Date.now();

    sampler = setInterval(() => {
      const s: Sample = {
        t: Date.now() - t0,
        step: TEST_STEPS[stepIdx]?.tag ?? "",
        hands: hands.map((h) =>
          h?.present ? { curl: h.curl.map(r3), cali_live: (h.cali_live ?? []).map(r1) } : null,
        ),
      };
      samples.push(s);
      for (let hh = 0; hh < hands.length && hh < 2; hh++) {
        const h = hands[hh];
        if (!h?.present) continue;
        for (let f = 0; f < 5; f++) {
          const c = h.curl[f] ?? 0;
          if (c < obsMin[hh][f]) obsMin[hh][f] = c;
          if (c > obsMax[hh][f]) obsMax[hh][f] = c;
        }
      }
    }, 50);

    stepper = setInterval(() => {
      stepLeft -= 1;
      if (stepLeft <= 0) {
        if (stepIdx >= TEST_STEPS.length - 1) return finishRecording();
        stepIdx += 1;
        stepLeft = TEST_STEPS[stepIdx].secs;
      }
    }, 1000);
  }

  function finishRecording() {
    const dur = Date.now() - t0;
    stopTimers();
    const perFinger: PerFinger[][] = [0, 1].map((hh) =>
      [0, 1, 2, 3, 4].map((f) => {
        const mn = obsMin[hh][f];
        const mx = obsMax[hh][f];
        const range = Math.max(0, mx - mn);
        return { min: r3(mn > mx ? 0 : mn), max: r3(mx), range: r3(range), quality: rangeQuality(range).label };
      }),
    );
    testResult = {
      startedAt: new Date(t0).toISOString(),
      durationMs: dur,
      sampleCount: samples.length,
      perFinger,
      samples,
    };
    testPhase = "done";
  }

  function cancelTest() {
    stopTimers();
    testPhase = "idle";
  }

  // ---- Report build / export -------------------------------------------------
  function collectConfig(): Record<string, unknown> {
    const cfg: Record<string, unknown> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("udcap.")) continue;
        const v = localStorage.getItem(k);
        try {
          cfg[k] = v ? JSON.parse(v) : v;
        } catch {
          cfg[k] = v;
        }
      }
    } catch {
      /* localStorage unavailable */
    }
    return cfg;
  }

  function handReport(h: HandView, i: number) {
    const channels = Array.from({ length: 12 }, (_, c) => {
      const open = h.cali_open?.[c] ?? 0;
      const fist = h.cali_fist?.[c] ?? 0;
      return {
        ch: chName(c),
        kind: chKind(c),
        open: r1(open),
        fist: r1(fist),
        span: r1(fist - open),
        live: r1(h.cali_live?.[c] ?? 0),
        quality: h.cali_valid ? spanQuality(open, fist).label : "n/a",
      };
    });
    return {
      side: HAND_NAMES[i] ?? `hand${i}`,
      present: h.present,
      link: h.link,
      link_name: LINK_NAMES[h.link] ?? String(h.link),
      calibrated: h.calibrated,
      cali_valid: h.cali_valid,
      battery_level: h.battery, // 0..5 (raw level, ~20% each), not a percentage
      fps: r1(h.fps),
      fw: h.fw,
      glove_serial: h.glove_serial,
      tracker_serial: h.tracker_serial,
      curl_live: h.curl.map(r3),
      curl_min: h.curl_min,
      curl_max: h.curl_max,
      offset_pos: h.offset_pos,
      offset_deg: h.offset_deg,
      grip_pos: h.grip_pos,
      grip_rot: h.grip_rot,
      channels,
    };
  }

  function buildReport() {
    return {
      schema: "udcap-debug/1",
      generatedAt: new Date().toISOString(),
      app: { version: appVer, shm_contract: shmVer, mode: appMode.mode },
      server: { live, linked },
      config: collectConfig(),
      hands: hands.map((h, i) => handReport(h, i)),
      receivers: shm?.receivers ?? [],
      test: testResult,
    };
  }

  function stamp() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  let savedPath = $state<string | null>(null);
  let saveErr = $state<string | null>(null);
  let copied = $state(false);
  let saving = $state(false);

  async function save() {
    saving = true;
    saveErr = null;
    try {
      const json = JSON.stringify(buildReport(), null, 2);
      savedPath = await saveDebugReport(`udcap-debug-${stamp()}.json`, json);
    } catch (e) {
      saveErr = String(e);
    } finally {
      saving = false;
    }
  }
  const reveal = () => savedPath && revealItemInDir(savedPath).catch(() => {});

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildReport(), null, 2));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      saveErr = "Clipboard unavailable — use Save instead.";
    }
  }
</script>

<div class="screen">
  <div class="topline">
    <button class="btn text state-layer" onclick={onBack}>← Back</button>
    <h2>Debug &amp; diagnostics</h2>
  </div>
  <p class="muted intro">
    Capture what the app sees for troubleshooting. Run the guided test, then <b>Save</b> or
    <b>Copy</b> the report and send it over so tracking data can be compared against a known-good setup.
    Nothing is uploaded, the report is a local file / clipboard text.
  </p>

  <!-- System -->
  <div class="card">
    <h3>System</h3>
    <div class="kvs">
      <div class="kv"><span>Application</span><b>UDCAP Control{appVer ? ` ${appVer}` : ""}</b></div>
      <div class="kv"><span>Shared-memory contract</span><b>{shmVer ? `v${shmVer}` : "—"}</b></div>
      <div class="kv"><span>Runtime mode</span><b>{appMode.mode}</b></div>
      <div class="kv">
        <span>Server</span>
        <b>{live ? `running · ${linked} glove${linked === 1 ? "" : "s"} linked` : "offline"}</b>
      </div>
    </div>
  </div>

  {#if !live}
    <div class="card banner">
      <p>Start the server and connect gloves to capture live data. You can still export whatever the last session left in shared memory.</p>
    </div>
  {/if}

  <!-- Per-hand snapshot -->
  <div class="cols">
    {#each hands as h, i}
      <div class="card hand">
        <div class="chead">
          <h3>{HAND_NAMES[i]} hand</h3>
          <span class="chip">{h.present ? LINK_NAMES[h.link] ?? h.link : "absent"}</span>
        </div>

        {#if !h.present}
          <p class="muted">No glove on this hand.</p>
        {:else}
          <div class="kvs tight">
            <div class="kv"><span>Calibrated</span><b>{h.calibrated ? "yes" : "no"}</b></div>
            <div class="kv"><span>Battery</span><b>{h.battery ? `${h.battery * 20}% (level ${h.battery}/5)` : "—"}</b></div>
            <div class="kv"><span>Packet rate</span><b>{r1(h.fps)}/s</b></div>
            <div class="kv"><span>Firmware</span><b>{h.fw || "—"}</b></div>
            <div class="kv"><span>Glove SN</span><b class="mono">{h.glove_serial || "—"}</b></div>
            <div class="kv"><span>Tracker SN</span><b class="mono">{h.tracker_serial || "—"}</b></div>
          </div>

          <!-- live normalized curl -->
          <h4>Live finger curl</h4>
          <div class="fingers">
            {#each FINGERS as f, fi}
              <div class="frow">
                <span class="flabel">{f}</span>
                <div class="bar"><div class="fill" style={`width:${pct(h.curl[fi] ?? 0)}%`}></div></div>
                <span class="fval">{pct(h.curl[fi] ?? 0)}%</span>
              </div>
            {/each}
          </div>

          <!-- raw calibration quality -->
          <h4>
            Calibration quality
            {#if !h.cali_valid}<span class="muted small"> · not calibrated</span>{/if}
          </h4>
          {#if h.cali_valid}
            <p class="muted small">
              Per raw sensor channel. <b>Span</b> = fist − open; a small span means the sensor barely
              moved between poses, so that joint can't track well.
            </p>
            <div class="chtable">
              <div class="chrow head">
                <span>Ch</span><span>Type</span><span>Open</span><span>Fist</span><span>Span</span><span>Quality</span>
              </div>
              {#each Array(12) as _, c}
                {@const q = spanQuality(h.cali_open[c], h.cali_fist[c])}
                <div class="chrow">
                  <span class="mono">{chName(c)}</span>
                  <span class="kind {chKind(c)}">{chKind(c)}</span>
                  <span class="mono">{r1(h.cali_open[c])}</span>
                  <span class="mono">{r1(h.cali_fist[c])}</span>
                  <span class="mono">{r1(h.cali_fist[c] - h.cali_open[c])}</span>
                  <span class="qchip {q.cls}">{q.label}</span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="muted small">Run calibration (both hands) to populate the reference values.</p>
          {/if}
        {/if}
      </div>
    {/each}
  </div>

  <!-- Guided test -->
  <div class="card test">
    <div class="chead">
      <h3>Guided range test</h3>
      {#if testPhase === "running" || testPhase === "ready"}
        <button class="btn text state-layer" onclick={cancelTest}>Cancel</button>
      {/if}
    </div>

    {#if testPhase === "idle"}
      <p class="muted">
        Follow the on-screen poses (relax → fist → spread → wiggle each finger). We record the curl each
        finger actually reaches and flag any that barely move. Takes about half a minute.
      </p>
      <button class="btn tonal state-layer wide" disabled={!live || linked === 0} onclick={startTest}>
        Start guided test
      </button>
      {#if testResult}
        <div class="results">
          <h4>Last run — observed finger range</h4>
          {#each hands as h, i}
            {#if h.present}
              <div class="rblock">
                <div class="rside">{HAND_NAMES[i]}</div>
                <div class="rgrid">
                  {#each FINGERS as f, fi}
                    {@const pf = testResult.perFinger[i][fi]}
                    {@const q = rangeQuality(pf.range)}
                    <div class="rcell">
                      <span class="flabel">{f}</span>
                      <span class="qchip {q.cls}">{q.label}</span>
                      <span class="rspan mono">{pct(pf.range)}%</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}
          <p class="muted small">{testResult.sampleCount} samples over {r1(testResult.durationMs / 1000)}s. Included in the exported report.</p>
        </div>
      {/if}
    {:else if testPhase === "ready"}
      <div class="pose">
        <div class="pemoji">⏳</div>
        <h2>Get ready…</h2>
        <p class="muted">Put the gloves on and relax.</p>
        <div class="counter">{stepLeft > 0 ? stepLeft : "…"}</div>
      </div>
    {:else if testPhase === "running"}
      {@const step = TEST_STEPS[stepIdx]}
      <div class="pose">
        <div class="steps">
          {#each TEST_STEPS as _, s}<span class="sdot" class:done={stepIdx > s} class:active={stepIdx === s}></span>{/each}
        </div>
        <div class="pemoji">{step.emoji}</div>
        <h2>{step.title}</h2>
        <p class="muted">{step.hint}</p>
        <div class="counter">{stepLeft > 0 ? stepLeft : "…"}</div>
      </div>
    {:else}
      <div class="pose">
        <div class="pemoji">✅</div>
        <h2>Test complete</h2>
        <p class="muted">Results are below and in the export. Save or copy the report to send it.</p>
        <button class="btn tonal state-layer" onclick={() => (testPhase = "idle")}>View results</button>
      </div>
    {/if}
  </div>

  <!-- Export -->
  <div class="card export">
    <h3>Export report</h3>
    <p class="muted">
      Bundles the system info, per-hand calibration data, your settings, and the last guided test into a
      single JSON file.
    </p>
    <div class="ebtns">
      <button class="btn filled state-layer" disabled={saving} onclick={save}>
        {saving ? "Saving…" : "Save report (.json)"}
      </button>
      <button class="btn tonal state-layer" onclick={copy}>{copied ? "Copied ✓" : "Copy to clipboard"}</button>
      {#if savedPath}
        <button class="btn text state-layer" onclick={reveal}>Show file</button>
      {/if}
    </div>
    {#if savedPath}<p class="muted small ok">Saved to {savedPath}</p>{/if}
    {#if saveErr}<p class="muted small err">{saveErr}</p>{/if}
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 940px;
  }
  .topline {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .intro {
    margin-top: -6px;
    max-width: 72ch;
  }
  .muted {
    color: var(--muted);
    margin: 6px 0 0;
    font-size: 13px;
  }
  .small {
    font-size: 12px;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  h4 {
    margin: 16px 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--on-surface-var);
  }
  .banner p {
    margin: 0;
    color: var(--on-surface-var);
  }
  .kvs {
    display: grid;
    gap: 2px;
    margin-top: 10px;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
    border-bottom: 1px solid var(--outline-dim);
    font-size: 13px;
  }
  .kvs.tight .kv {
    padding: 5px 0;
  }
  .kv span {
    color: var(--muted);
  }
  .kv b {
    text-align: right;
    word-break: break-all;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .chead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  /* live curl bars */
  .fingers {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .frow {
    display: grid;
    grid-template-columns: 54px 1fr 40px;
    align-items: center;
    gap: 10px;
  }
  .flabel {
    font-size: 12px;
    color: var(--on-surface-var);
  }
  .bar {
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--track);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--primary);
    border-radius: var(--radius-pill);
    transition: width 0.08s linear;
  }
  .fval {
    font-size: 12px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  /* calibration channel table */
  .chtable {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-s);
    overflow: hidden;
    border: 1px solid var(--outline-dim);
  }
  .chrow {
    display: grid;
    grid-template-columns: 40px 48px 1fr 1fr 1fr 74px;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
  }
  .chrow:nth-child(even) {
    background: var(--surface-2);
  }
  .chrow.head {
    background: var(--surface-2);
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .chrow.head span {
    font-weight: 600;
  }
  .kind {
    font-size: 11px;
    color: var(--muted);
  }
  .kind.splay {
    color: var(--warn);
  }
  .qchip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 20px;
    padding: 0 8px;
    border-radius: var(--radius-pill);
    font-size: 11px;
    font-weight: 700;
  }
  .q-good {
    background: rgba(132, 224, 164, 0.16);
    color: var(--success);
  }
  .q-fair {
    background: rgba(255, 212, 121, 0.16);
    color: var(--warn);
  }
  .q-poor {
    background: rgba(255, 157, 107, 0.18);
    color: #ff9d6b;
  }
  .q-dead {
    background: rgba(255, 180, 171, 0.16);
    color: var(--error);
  }
  /* guided test */
  .test .wide {
    width: 100%;
    margin-top: 12px;
  }
  .pose {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
    padding: 18px 0 6px;
  }
  .pemoji {
    font-size: 60px;
    line-height: 1;
  }
  .steps {
    display: flex;
    gap: 6px;
  }
  .sdot {
    width: 22px;
    height: 5px;
    border-radius: 3px;
    background: var(--track);
  }
  .sdot.active {
    background: var(--primary);
  }
  .sdot.done {
    background: var(--success);
  }
  .counter {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 34px;
    font-weight: 800;
    color: var(--primary);
    background: var(--primary-container);
    font-variant-numeric: tabular-nums;
  }
  .results {
    margin-top: 14px;
  }
  .rblock {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 8px 0;
  }
  .rside {
    width: 46px;
    flex: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--on-surface-var);
    padding-top: 6px;
  }
  .rgrid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    flex: 1;
  }
  .rcell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: var(--surface-2);
    border-radius: var(--radius-s);
    padding: 8px 4px;
  }
  .rspan {
    color: var(--muted);
  }
  .ebtns {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }
  .ok {
    color: var(--success);
    word-break: break-all;
  }
  .err {
    color: var(--error);
  }
</style>
