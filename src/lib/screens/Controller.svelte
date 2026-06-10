<script lang="ts">
  import { app } from "$lib/state.svelte";
  import { testVibration, type HandView } from "$lib/api";

  const shm = $derived(app.status?.shm ?? null);
  const live = $derived(!!shm && shm.server_pid !== 0);
  const hands = $derived(shm?.hands ?? []);
</script>

{#snippet bar(label: string, v: number)}
  <div class="abar">
    <span class="al">{label}</span>
    <div class="atrack"><div class="afill" style="width:{v * 100}%"></div></div>
    <b class="av">{Math.round(v * 100)}%</b>
  </div>
{/snippet}

{#snippet pad(h: HandView | undefined, name: string, hand: number)}
  <div class="card">
    <div class="chead">
      <div class="cname">
        <span class="dot" class:on={h?.present && h.link === 3}></span>
        <h3>{name}</h3>
      </div>
      <button
        class="btn tonal state-layer"
        disabled={!h?.present}
        onclick={() => testVibration(hand, 140, 0.25)}
      >
        Test vibration
      </button>
    </div>

    {#if !h?.present}
      <p class="muted">No glove connected.</p>
    {:else}
      <div class="top">
        <div class="joy" class:click={h.btn_joy}>
          <span class="jdot" style="left:{50 + h.joy_x * 38}%;top:{50 - h.joy_y * 38}%"></span>
        </div>
        <div class="btns">
          <span class="pill" class:on={h.btn_a}>A</span>
          <span class="pill" class:on={h.btn_b}>B</span>
          <span class="pill" class:on={h.btn_menu}>Menu</span>
          <span class="pill wide" class:on={h.btn_joy}>Stick click</span>
          <span class="pill wide" class:on={h.btn_power}>Power</span>
        </div>
      </div>
      <div class="analogs">
        {@render bar("Trigger", h.trigger)}
        {@render bar("Grip", h.grip)}
        {@render bar("Trackpad", h.trackpad)}
      </div>
    {/if}
  </div>
{/snippet}

<div class="screen">
  {#if !live}
    <div class="card banner"><p>Start the server and connect gloves to see live inputs.</p></div>
  {/if}
  <div class="cols">
    {@render pad(hands[0], "Left", 0)}
    {@render pad(hands[1], "Right", 1)}
  </div>
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 880px;
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
    margin-bottom: 18px;
  }
  .cname {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .muted {
    color: var(--muted);
  }
  .top {
    display: flex;
    gap: 18px;
    margin-bottom: 18px;
  }
  .joy {
    width: 96px;
    height: 96px;
    flex: none;
    border-radius: 50%;
    background: var(--surface-2);
    position: relative;
    border: 1px solid var(--outline-dim);
  }
  .joy.click {
    border-color: var(--primary);
  }
  .jdot {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--primary);
    transform: translate(-50%, -50%);
    transition: all 0.06s linear;
  }
  .btns {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 6px;
  }
  .pill {
    height: 32px;
    min-width: 36px;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--muted);
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 13px;
    transition: all 0.1s var(--ease);
  }
  .pill.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .analogs {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .abar {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }
  .al {
    width: 64px;
    color: var(--on-surface-var);
    font-weight: 600;
  }
  .atrack {
    flex: 1;
    height: 10px;
    background: var(--track);
    border-radius: var(--radius-pill);
    overflow: hidden;
  }
  .afill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary), #8f8bff);
    border-radius: var(--radius-pill);
    transition: width 0.08s linear;
  }
  .av {
    width: 40px;
    text-align: right;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
</style>
