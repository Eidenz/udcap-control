<script lang="ts">
  import type { Snippet } from "svelte";
  import WindowControls from "./WindowControls.svelte";

  // One screen: a header (title, subtitle, actions, window buttons; it drags
  // the frameless window) over a scrolling column of cards.
  let {
    title,
    subtitle = "",
    actions,
    children,
  }: { title: string; subtitle?: string; actions?: Snippet; children: Snippet } = $props();
</script>

<div class="page">
  <header data-tauri-drag-region>
    <div class="titles" data-tauri-drag-region>
      <h1 data-tauri-drag-region>{title}</h1>
      {#if subtitle}<p data-tauri-drag-region>{subtitle}</p>{/if}
    </div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
    <WindowControls />
  </header>
  <div class="body">
    <div class="inner">{@render children()}</div>
  </div>
</div>

<style>
  .page {
    flex: 1;
    min-width: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 8px 14px 8px 24px;
    border-bottom: 1px solid #202025;
  }
  .titles {
    flex: 1 1 auto;
    min-width: 0;
  }
  h1 {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.2;
  }
  p {
    margin-top: 2px;
    font-size: 13px;
    color: var(--text-3);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  /* At least as tall as the window, so a screen's .grow-y part takes up the
     slack and every screen ends on the same bottom line. */
  .inner {
    flex: 1 0 auto;
    max-width: 1040px;
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
