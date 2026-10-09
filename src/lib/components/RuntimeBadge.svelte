<script lang="ts">
  // The runtime's mark, blue while its driver is attached to the gloves and
  // grey otherwise. SteamVR gets its "VR" disc; Monado its logo (Copyright
  // 2023 Collabora, Ltd., CC BY 4.0, from Monado's Android launcher icon).
  let {
    runtime,
    connected,
    size = 40,
    status = true,
  }: { runtime: "steamvr" | "monado"; connected: boolean; size?: number; status?: boolean } = $props();

  // `status` off: just the mark (e.g. in a runtime picker), named plainly.
  const name = $derived(runtime === "steamvr" ? "SteamVR" : "Monado");
  const label = $derived(!status ? name : connected ? `Connected to ${name}` : `${name} isn't connected`);
</script>

<span class="badge" class:on={connected} title={label} role="img" aria-label={label}>
  {#if runtime === "steamvr"}
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <circle class="ring" cx="20" cy="20" r="19" />
      <circle class="disc" cx="20" cy="20" r="13.5" />
      <text class="vr" x="20" y="24.6" text-anchor="middle">VR</text>
    </svg>
  {:else}
    <svg width={size} height={size} viewBox="-6 -9 162.72 162.4" aria-hidden="true">
      <path
        class="mark"
        d="m143.23,19.75L79.85,0.66c-2.93,-0.88 -6.05,-0.88 -8.97,0L7.49,19.75c-4.45,1.34 -7.49,5.43 -7.49,10.08v85.07c0,4.66 3.07,8.77 7.54,10.09l63.43,18.77c2.87,0.85 5.92,0.85 8.79,0l63.43,-18.77c4.47,-1.32 7.54,-5.43 7.54,-10.09L150.72,29.83c0,-4.64 -3.04,-8.74 -7.49,-10.08ZM49.02,104l-17.99,-5.35c-2.52,-0.75 -4.24,-3.06 -4.24,-5.68v-36.81l22.23,30.57v17.28ZM75.36,108.15v0l-0,-0 -0,0v-0L26.79,41.84l17.99,-5.35c2.35,-0.7 4.88,0.12 6.38,2.06l24.19,31.33 24.19,-31.33c1.5,-1.94 4.04,-2.76 6.38,-2.06l17.99,5.35 -48.56,66.3ZM123.93,92.96c0,2.62 -1.72,4.94 -4.24,5.68l-17.99,5.35v-17.28l22.23,-30.57v36.81Z"
      />
    </svg>
  {/if}
</span>

<style>
  .badge {
    display: grid;
    place-items: center;
    flex: none;
    --on: #3d9bff;
    --on-deep: #1d5fc4;
  }
  .ring {
    fill: var(--control-hi);
    transition: fill 0.2s var(--ease);
  }
  .disc {
    fill: #3a3a42;
    transition: fill 0.2s var(--ease);
  }
  .vr {
    font-family: var(--font);
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: -0.02em;
    fill: var(--text-off);
  }
  .on .ring {
    fill: var(--on-deep);
  }
  .on .disc {
    fill: #eef4ff;
  }
  .on .vr {
    fill: var(--on-deep);
  }
  .mark {
    fill: var(--control-hi);
    transition: fill 0.2s var(--ease);
  }
  .on .mark {
    fill: var(--on);
  }
</style>
