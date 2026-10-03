<script lang="ts">
  import Icon from "./Icon.svelte";

  // A searchable dropdown for long lists: type to filter, arrows + Enter to
  // pick, and (with oncreate) a "Create" action for a name that isn't there.
  let {
    items,
    selected,
    onselect,
    oncreate,
    ariaLabel,
    searchLabel = "Search",
    newLabel = "New",
    width = "280px",
  }: {
    items: { id: string; label: string }[];
    selected: string;
    onselect: (id: string) => void;
    oncreate?: (name: string) => void;
    ariaLabel: string;
    searchLabel?: string;
    newLabel?: string;
    width?: string;
  } = $props();

  let open = $state(false);
  let q = $state("");
  let hi = $state(0);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let search = $state<HTMLInputElement>();
  let place = $state("");

  const current = $derived(items.find((i) => i.id === selected)?.label ?? "");
  const needle = $derived(q.trim().toLowerCase());
  const shown = $derived(items.filter((i) => i.label.toLowerCase().includes(needle)));
  const exact = $derived(items.some((i) => i.label.toLowerCase() === needle));
  const createName = $derived(q.trim() && !exact ? q.trim() : "");

  function toggle() {
    open = !open;
    q = "";
    hi = Math.max(0, items.findIndex((i) => i.id === selected));
  }
  function pick(id: string) {
    open = false;
    q = "";
    if (id !== selected) onselect(id);
  }
  function create() {
    const name = createName;
    open = false;
    q = "";
    oncreate?.(name);
  }
  function onkey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      hi = Math.min(hi + 1, shown.length - 1);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      hi = Math.max(hi - 1, 0);
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (shown[hi]) pick(shown[hi].id);
      else if (oncreate) create();
      e.preventDefault();
    } else if (e.key === "Escape") {
      open = false;
    }
  }
  function onSearch(e: Event) {
    q = (e.currentTarget as HTMLInputElement).value;
    hi = 0;
  }

  // Same placement as Select: on <body>, against the viewport.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
  $effect(() => {
    if (!open || !trigger || !menu) return;
    const r = trigger.getBoundingClientRect();
    const h = menu.offsetHeight;
    const below = window.innerHeight - r.bottom - 6;
    // Opening upward, pin the bottom edge so filtering shrinks it toward the trigger.
    const up = h > below && r.top - 6 > below;
    const edge = up ? `bottom:${window.innerHeight - r.top + 6}px` : `top:${r.bottom + 6}px`;
    place = `${edge};left:${r.left}px;width:${Math.max(r.width, 300)}px`;
    search?.focus();
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
  // Keep the highlighted row in view while arrowing through a long list.
  $effect(() => {
    if (open) menu?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  });
</script>

<div class="combo" style="width:{width}">
  <button
    type="button"
    class="trigger"
    class:open
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={ariaLabel}
    bind:this={trigger}
    onclick={toggle}
  >
    <span class="lead"><Icon name="gamepad" size={16} /></span>
    <span class="cur">{current}</span>
    <span class="count">{items.length}</span>
    <span class="arrow"><Icon name="chevron" size={14} stroke={2} /></span>
  </button>
  {#if open}
    <div use:portal>
      <button type="button" class="backdrop" aria-label="Close" onclick={() => (open = false)}></button>
      <div class="menu" bind:this={menu} style={place}>
        <label class="search">
          <Icon name="search" size={15} stroke={2} />
          <input bind:this={search} type="text" aria-label={searchLabel} placeholder={searchLabel} value={q} oninput={onSearch} onkeydown={onkey} />
        </label>
        <ul role="listbox" aria-label={ariaLabel}>
          {#each shown as item, i (item.id)}
            <li>
              <button
                type="button"
                class="opt"
                class:sel={item.id === selected}
                class:hi={i === hi}
                data-i={i}
                role="option"
                aria-selected={item.id === selected}
                onclick={() => pick(item.id)}
                onmouseenter={() => (hi = i)}
              >
                <span class="name">{item.label}</span>
                {#if item.id === selected}<span class="tick"><Icon name="check" size={15} stroke={2.5} /></span>{/if}
              </button>
            </li>
          {/each}
        </ul>
        {#if shown.length === 0}<p class="empty">Nothing matches.</p>{/if}
        {#if oncreate}
          <div class="sep"></div>
          <button type="button" class="opt create" onclick={create}>
            <Icon name="plus" size={14} stroke={2.25} />
            <span class="name">{createName ? `Create “${createName}”` : newLabel}</span>
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .combo {
    position: relative;
    flex: none;
  }
  .trigger {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 36px;
    padding: 0 10px 0 12px;
    background: var(--well);
    border: 1px solid var(--border-input);
    border-radius: var(--radius-control);
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    transition: border-color 0.15s var(--ease);
  }
  .trigger:hover,
  .trigger.open {
    border-color: var(--accent-line);
  }
  .lead,
  .arrow {
    display: grid;
    color: var(--text-3);
  }
  .arrow {
    transition: transform 0.15s var(--ease);
  }
  .trigger.open .arrow {
    transform: rotate(180deg);
  }
  .cur {
    flex: 1;
    min-width: 0;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    color: var(--text-3);
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
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    background: var(--raised);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    box-shadow: var(--shadow-menu);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 10px;
    border-radius: var(--radius-control);
    background: var(--well);
    border: 1px solid var(--border-input);
    color: var(--text-3);
  }
  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    user-select: text;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 238px;
    overflow-y: auto;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border-radius: 7px;
    color: var(--text-2);
    font-size: 13px;
    text-align: left;
  }
  .opt.hi {
    background: var(--control-hi);
    color: var(--text);
  }
  .opt.sel {
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tick {
    display: grid;
    color: var(--accent);
  }
  .empty {
    padding: 8px 10px;
    font-size: 12px;
    color: var(--text-3);
  }
  .sep {
    height: 1px;
    margin: 2px 4px;
    background: var(--border-strong);
  }
  .create {
    color: var(--accent);
    font-weight: 600;
  }
  .create:hover {
    background: var(--control-hi);
  }
</style>
