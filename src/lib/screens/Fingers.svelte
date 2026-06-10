<script lang="ts">
  import { app } from "$lib/state.svelte";
  import { FINGERS, setCurlRange } from "$lib/api";
  import FingerRange from "$lib/components/FingerRange.svelte";

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(shm?.hands ?? []);

  // Local editable ranges [hand][finger] = [min, max]; the GUI owns these while
  // editing, seeded once from the shm.
  const ranges = $state<number[][][]>([
    [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ],
  ]);
  let initialized = $state(false);

  $effect(() => {
    const h = shm?.hands;
    if (!initialized && h && h.length === 2) {
      for (let hi = 0; hi < 2; hi++)
        for (let f = 0; f < 5; f++) ranges[hi][f] = [h[hi].curl_min[f] ?? 0, h[hi].curl_max[f] ?? 1];
      initialized = true;
    }
  });

  function change(hand: number, finger: number, min: number, max: number) {
    ranges[hand][finger] = [min, max];
    setCurlRange(hand, finger, min, max).catch(() => {});
  }
  function reset(hand: number) {
    for (let f = 0; f < 5; f++) change(hand, f, 0, 1);
  }
</script>

{#snippet handCard(hand: number, name: string)}
  <div class="card">
    <div class="chead">
      <h3>{name} hand</h3>
      <button class="btn text state-layer" onclick={() => reset(hand)}>Reset</button>
    </div>
    {#if !hands[hand]?.present}
      <p class="muted">No glove — connect to tune.</p>
    {:else}
      <div class="rows">
        {#each FINGERS as f, i}
          <FingerRange
            label={f}
            raw={hands[hand].curl[i] ?? 0}
            min={ranges[hand][i][0]}
            max={ranges[hand][i][1]}
            onchange={(mn, mx) => change(hand, i, mn, mx)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="screen">
  <div class="card head">
    <div>
      <h3>Finger curl ranges</h3>
      <p class="muted">
        Drag the handles to set where each finger reaches 0% and 100% curl. The green line is the
        live reading; the bar below is what the game receives. Applies instantly.
      </p>
    </div>
  </div>

  {#if !live}
    <div class="card banner"><p>Start the server and connect gloves to see live readings.</p></div>
  {/if}

  <div class="cols">
    {@render handCard(0, "Left")}
    {@render handCard(1, "Right")}
  </div>
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
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .chead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
