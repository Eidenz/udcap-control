<script lang="ts">
  import { app } from "$lib/state.svelte";
  import { pairStart, pairStop, setChannel, PAIR } from "$lib/api";
  import Select from "$lib/components/Select.svelte";

  const CHANNELS = Array.from({ length: 10 }, (_, n) => String(n)); // 0–9 (known-good range)

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const receivers = $derived(shm?.receivers ?? []);

  // Guided pairing flow for one receiver at a time. We mirror the server's
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
      if (elapsed >= 60) cancelPair(); // safety timeout
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
      setTimeout(cancelPair, 2200); // show "Paired!" briefly, then leave pairing mode
    }
  });

  const handName = (h: number) => (h === 0 ? "Left glove" : h === 1 ? "Right glove" : "Unbound receiver");
</script>

<div class="screen">
  <div class="card head">
    <div>
      <h3>Devices</h3>
      <p class="muted">
        Pair gloves to their wireless receivers, and switch RF channel if you hit interference. Pairing is a
        safe radio bind — no firmware is touched.
      </p>
    </div>
  </div>

  {#if !live}
    <div class="card banner"><p>Start the server to manage receivers.</p></div>
  {:else if receivers.length === 0}
    <div class="card banner"><p>No wireless receivers detected. Plug a USB receiver in and it'll appear here.</p></div>
  {:else}
    <div class="card tip">
      <b>For a clean pair, do one receiver at a time:</b> plug in only the one you're pairing, power on only that
      glove, click <em>Pair</em>, then hold the glove's power button ~3&nbsp;seconds until its two lights flash green.
    </div>

    {#each receivers as r, i (r.serial + i)}
      <div class="card recv">
        <div class="rhead">
          <div>
            <h3>{handName(r.hand)}</h3>
            <span class="serial">SN&nbsp;{r.serial || "—"}</span>
          </div>
          <span class="chip" class:on={r.linked}>{r.linked ? "Connected" : "No glove"}</span>
        </div>

        {#if active === i}
          {#if paired}
            <div class="psearch ok">
              <span class="big">✅</span>
              <div><b>Paired!</b><p class="muted">{handName(r.hand)} connected.</p></div>
            </div>
          {:else}
            <div class="psearch">
              <span class="spin"></span>
              <div>
                <b>Searching… ({60 - elapsed}s)</b>
                <p class="muted">Hold the glove's power button ~3&nbsp;seconds until the two lights flash green.</p>
              </div>
              <button class="btn text state-layer" onclick={cancelPair}>Cancel</button>
            </div>
          {/if}
        {:else}
          <div class="ractions">
            <button class="btn tonal state-layer" onclick={() => startPair(i)} disabled={active !== null}>
              {r.linked ? "Re-pair" : "Pair glove"}
            </button>

            <div class="chan" class:dim={!r.linked}>
              <span class="clabel">RF channel</span>
              {#if r.linked && r.channel >= 0}
                <Select compact value={String(r.channel)} options={CHANNELS} onchange={(v) => setChannel(i, parseInt(v))} />
              {:else}
                <span class="cval">—</span>
              {/if}
            </div>
          </div>
          {#if !r.linked}
            <p class="hint muted">Connect a glove first — channel switching needs a live link.</p>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 880px;
  }
  .muted {
    color: var(--muted);
    margin: 4px 0 0;
    font-size: 13px;
  }
  .banner p {
    margin: 0;
    color: var(--on-surface-var);
  }
  .tip {
    font-size: 13px;
    color: var(--on-surface-var);
    line-height: 1.5;
    border: 1px solid var(--outline-dim);
  }
  .tip em {
    font-style: normal;
    color: var(--primary);
    font-weight: 700;
  }
  .recv {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .rhead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .serial {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    color: var(--muted);
  }
  .chip {
    flex: none;
    padding: 4px 12px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
  }
  .chip.on {
    background: rgba(132, 224, 164, 0.16);
    color: var(--success);
  }
  .ractions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .chan {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .chan.dim {
    opacity: 0.5;
  }
  .clabel {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
  }
  .cval {
    min-width: 34px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .hint {
    font-size: 12px;
  }
  .psearch {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--surface-2);
    border-radius: var(--radius-m);
    padding: 16px;
  }
  .psearch.ok {
    background: rgba(132, 224, 164, 0.12);
  }
  .psearch b {
    font-size: 15px;
  }
  .psearch > div {
    flex: 1;
  }
  .big {
    font-size: 32px;
    line-height: 1;
  }
  .spin {
    width: 26px;
    height: 26px;
    flex: none;
    border-radius: 50%;
    border: 3px solid var(--track);
    border-top-color: var(--primary);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
