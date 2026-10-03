<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Icon from "./Icon.svelte";
  const win = getCurrentWindow();
</script>

<div class="wc">
  <button class="wcb" aria-label="Minimize" onclick={() => win.minimize()}><Icon name="minimize" size={14} stroke={2} /></button>
  <button class="wcb close" aria-label="Close" onclick={() => win.close()}><Icon name="close" size={14} stroke={2} /></button>
</div>

<style>
  .wc {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: 4px;
  }
  .wcb {
    width: 36px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    color: var(--text-3);
    transition: background 0.12s var(--ease), color 0.12s var(--ease);
  }
  .wcb:hover {
    background: var(--control);
    color: var(--text);
  }
  .wcb.close:hover {
    background: var(--danger-soft);
    color: var(--danger-text);
  }
</style>
