<script lang="ts">
  import MonadoGuideBody from "./MonadoGuideBody.svelte";
  import Icon from "./Icon.svelte";

  let { open = false, onclose }: { open?: boolean; onclose: () => void } = $props();

  let body = $state<ReturnType<typeof MonadoGuideBody>>();

  function onKey(e: KeyboardEvent) {
    if (open && e.key === "Escape" && !body?.back()) onclose();
  }
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1" aria-label="Get a UDCAP-ready Monado">
      <div class="head">
        <h2>Get a UDCAP-ready Monado</h2>
        <button class="iconbtn" aria-label="Close" onclick={onclose}><Icon name="close" size={16} stroke={2} /></button>
      </div>
      <MonadoGuideBody bind:this={body} />
    </div>
  </div>
{/if}

<svelte:window onkeydown={onKey} />

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.55);
    animation: fade 0.12s var(--ease);
  }
  .modal {
    width: min(560px, 100%);
    max-height: 86vh;
    overflow-y: auto;
    padding: 18px 22px 22px;
    background: var(--card);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-menu);
    animation: pop 0.14s var(--ease);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .head h2 {
    flex: 1;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
</style>
