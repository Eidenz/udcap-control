<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    value = $bindable(),
    options,
    onchange,
    compact = false,
    mono = false,
    width = "",
    ariaLabel = undefined,
  }: {
    value: string;
    options: string[];
    onchange?: (v: string) => void;
    compact?: boolean;
    mono?: boolean;
    width?: string;
    ariaLabel?: string;
  } = $props();

  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLUListElement>();
  let place = $state("");

  function pick(o: string) {
    value = o;
    open = false;
    onchange?.(o);
  }

  // The open menu is moved to <body> and placed against the viewport. Inside a
  // transformed ancestor (the 1.0 hand-map nodes) it would share that
  // ancestor's stacking context, so later siblings painted over it, and its
  // click-away backdrop only covered the ancestor's box.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  // Drop below the trigger, or above it when there's more room there.
  $effect(() => {
    if (!open || !trigger || !menu) return;
    const r = trigger.getBoundingClientRect();
    const h = menu.offsetHeight;
    const below = window.innerHeight - r.bottom - 6;
    const top = h > below && r.top - 6 > below ? r.top - 6 - h : r.bottom + 6;
    place = `top:${top}px;right:${window.innerWidth - r.right}px;min-width:${r.width}px`;

    // A scroll or resize would leave the menu behind, so close instead.
    const close = () => (open = false);
    const onScroll = (e: Event) => {
      if (!menu?.contains(e.target as Node)) close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  });
</script>

<svelte:window onkeydown={(e) => open && e.key === "Escape" && (open = false)} />

<div class="select" class:compact style={width ? `width:${width}` : ""}>
  <button
    type="button"
    class="trigger"
    class:open
    class:none={value === "None"}
    class:mono
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={ariaLabel}
    bind:this={trigger}
    onclick={() => (open = !open)}
  >
    <span class="val">{value}</span>
    <span class="arrow"><Icon name="chevron" size={14} stroke={2} /></span>
  </button>
  {#if open}
    <div use:portal>
      <button type="button" class="backdrop" aria-label="Close" onclick={() => (open = false)}></button>
      <ul class="menu" role="listbox" bind:this={menu} style={place}>
        {#each options as o}
          <li>
            <button type="button" class="opt" class:sel={o === value} class:mono role="option" aria-selected={o === value} onclick={() => pick(o)}>
              <span>{o}</span>
              {#if o === value}<span class="tick"><Icon name="check" size={15} stroke={2.5} /></span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .select {
    position: relative;
    flex: none;
  }
  .trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-width: 150px;
    height: 34px;
    padding: 0 10px 0 12px;
    background: var(--well);
    border: 1px solid var(--border-input);
    border-radius: var(--radius-control);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    transition: border-color 0.15s var(--ease);
  }
  .trigger:hover,
  .trigger.open {
    border-color: var(--accent-line);
  }
  .trigger.none .val {
    color: var(--text-3);
  }
  .val {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .compact .trigger {
    min-width: 0;
    height: 32px;
    padding: 0 6px 0 10px;
    font-size: 12px;
  }
  .arrow {
    display: grid;
    color: var(--text-3);
    transition: transform 0.15s var(--ease);
  }
  .trigger.open .arrow {
    transform: rotate(180deg);
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    cursor: default;
  }
  .menu {
    position: fixed;
    z-index: 11;
    max-height: 300px;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 4px;
    background: var(--raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-inner);
    box-shadow: var(--shadow-menu);
  }
  .opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border-radius: 7px;
    color: var(--text-2);
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
  }
  .opt:hover {
    background: var(--control-hi);
    color: var(--text);
  }
  .opt.sel {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
  .tick {
    display: grid;
    color: var(--accent);
  }
</style>
