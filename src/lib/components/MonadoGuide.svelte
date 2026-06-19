<script lang="ts">
  import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
  import { saveEnvisionProfile } from "$lib/api";

  let { open = false, onclose }: { open?: boolean; onclose: () => void } = $props();

  // --- Links --------------------------------------------------------------
  // NOTE: verify these before release. The Monadeck repo + the Envision profile
  // are the two most likely to need a real URL once published.
  const MONADO_FORK = "https://github.com/Eidenz/Monado";
  const MONADO_BRANCH = "main";
  const MONADECK = "https://github.com/Eidenz/monadeck";
  const ENVISION = "https://gitlab.com/gabmus/envision";

  type Path = "monadeck" | "envision" | "manual";
  let path = $state<Path | null>(null);
  let copied = $state<string | null>(null);
  let savedPath = $state<string | null>(null);
  let saving = $state(false);
  let saveErr = $state(false);

  const back = () => {
    path = null;
    savedPath = null;
    saveErr = false;
  };
  const close = () => {
    back();
    onclose();
  };

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") (path ? back() : close());
  }

  async function saveProfile() {
    saving = true;
    saveErr = false;
    try {
      savedPath = await saveEnvisionProfile();
    } catch {
      saveErr = true;
    } finally {
      saving = false;
    }
  }
  const reveal = () => savedPath && revealItemInDir(savedPath).catch(() => {});

  const go = (url: string) => {
    if (url) openUrl(url).catch(() => {});
  };

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = id;
      setTimeout(() => (copied === id ? (copied = null) : null), 1400);
    } catch {
      /* clipboard unavailable */
    }
  }

  const MANUAL_CMD = `git clone ${MONADO_FORK}
cd Monado
cmake -B build -DXRT_BUILD_DRIVER_UDCAP=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build`;

  const paths: { id: Path; emoji: string; title: string; sub: string; tag?: string }[] = [
    { id: "monadeck", emoji: "🃏", title: "Monadeck", sub: "One-click launcher for the fork", tag: "Easiest" },
    { id: "envision", emoji: "🛠️", title: "Envision", sub: "Build from a custom profile" },
    { id: "manual", emoji: "💻", title: "Manual build", sub: "Clone & compile yourself" },
  ];
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1" aria-label="Set up Monado for UDCAP">
      <div class="head">
        {#if path}
          <button class="iconbtn state-layer" aria-label="Back" onclick={back}>←</button>
        {/if}
        <h2>Get a UDCAP-ready Monado</h2>
        <button class="iconbtn state-layer" aria-label="Close" onclick={close}>✕</button>
      </div>

      {#if !path}
        <p class="lede">
          Standard Monado, including Envision's default build and distro packages, <b>doesn't include the
          UDCAP glove driver</b>. Unlike SteamVR, Monado compiles its drivers in, so the driver can't be dropped
          into an existing install: you need to run a Monado that was <i>built with it</i>. Pick how:
        </p>

        <div class="paths">
          {#each paths as p}
            <button class="pathcard state-layer" onclick={() => (path = p.id)}>
              <span class="pemoji">{p.emoji}</span>
              <span class="ptxt">
                <span class="ptitle">{p.title}{#if p.tag}<span class="tag">{p.tag}</span>{/if}</span>
                <span class="psub">{p.sub}</span>
              </span>
              <span class="chev">→</span>
            </button>
          {/each}
        </div>
      {:else if path === "monadeck"}
        <p class="lede">
          Monadeck installs and launches our Monado fork (which bundles the UDCAP driver) and sets it as your
          active OpenXR runtime, no terminal needed.
        </p>
        <ol class="steps">
          <li>Install <b>Monadeck</b>, then open it.</li>
          <li>In Monadeck, install / select the <b>UDCAP Monado fork</b> and set it as the active runtime.</li>
          <li>Launch Monado from Monadeck, then come back and start your gloves.</li>
        </ol>
        <button class="btn filled state-layer" onclick={() => go(MONADECK)}>Get Monadeck</button>
      {:else if path === "envision"}
        <p class="lede">
          Envision builds Monado from a profile. Point one at our fork then build it and set it active.
        </p>
        <ol class="steps">
          <li>Install <b>Envision</b> and open it.</li>
          <li>
            Add a profile (or duplicate the default Monado one) and set its <b>XR Service Repo</b> to
            <span class="codeinline">{MONADO_FORK}</span>
            <button class="copy state-layer" onclick={() => copy(MONADO_FORK, "repo")}>
              {copied === "repo" ? "Copied" : "Copy"}
            </button>
            and <b>Branch</b> to <span class="codeinline">{MONADO_BRANCH}</span>.
          </li>
          <li>Build the profile, then set it as the active runtime.</li>
          <li>Start your gloves here, they'll show up as Index controllers.</li>
        </ol>
        <div class="env-actions">
          <button class="btn tonal state-layer" onclick={() => go(ENVISION)}>Get Envision</button>
          <button class="btn text state-layer" disabled={saving} onclick={saveProfile}>
            {saving ? "Saving…" : "Save profile to disk"}
          </button>
        </div>
        {#if savedPath}
          <p class="foot">
            Saved <span class="codeinline">{savedPath}</span>
            <button class="link state-layer" onclick={reveal}>Show file</button> — then use Envision's Import
            (advanced view) to load it.
          </p>
        {:else if saveErr}
          <p class="foot err">Couldn't save the profile — set it up by hand with the steps above instead.</p>
        {:else}
          <p class="foot">Prefer importing? Save our ready-made profile, then import it in Envision's advanced view.</p>
        {/if}
      {:else}
        <p class="lede">
          Build the fork yourself. The key is the <span class="codeinline">XRT_BUILD_DRIVER_UDCAP=ON</span> flag,
          that's what compiles the glove driver in.
        </p>
        <div class="codeblock">
          <pre>{MANUAL_CMD}</pre>
          <button class="copy state-layer" onclick={() => copy(MANUAL_CMD, "manual")}>
            {copied === "manual" ? "Copied" : "Copy"}
          </button>
        </div>
        <ol class="steps">
          <li>Run the commands above (needs Monado's usual build deps).</li>
          <li>
            Make it your active OpenXR runtime, point <span class="codeinline">XR_RUNTIME_JSON</span> at
            <span class="codeinline">build/openxr_monado-dev.json</span>, or symlink it to
            <span class="codeinline">~/.config/openxr/1/active_runtime.json</span>.
          </li>
          <li>Launch <span class="codeinline">monado-service</span>, then start your gloves.</li>
        </ol>
        <button class="btn text state-layer" onclick={() => go(MONADO_FORK)}>Open the fork repo</button>
      {/if}
    </div>
  </div>
{/if}

<svelte:window onkeydown={onKey} />

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: grid;
    place-items: center;
    padding: 24px;
    z-index: 100;
    animation: fade 0.12s var(--ease);
  }
  .modal {
    width: min(560px, 100%);
    max-height: 86vh;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--outline-dim);
    border-radius: var(--radius-l);
    padding: 22px 24px 24px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
    animation: pop 0.14s var(--ease);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .head h2 {
    margin: 0;
    font-size: 18px;
    flex: 1;
  }
  .iconbtn {
    border: none;
    background: transparent;
    color: var(--on-surface-var);
    width: 32px;
    height: 32px;
    border-radius: var(--radius-pill);
    font-size: 15px;
    cursor: pointer;
  }
  .lede {
    color: var(--on-surface-var);
    margin: 0 0 16px;
    line-height: 1.5;
    font-size: 14px;
  }
  .paths {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pathcard {
    display: flex;
    align-items: center;
    gap: 14px;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--outline-dim);
    border-radius: var(--radius-m);
    padding: 14px 16px;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .pathcard:hover {
    border-color: var(--primary-container);
  }
  .pemoji {
    font-size: 26px;
  }
  .ptxt {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  .ptitle {
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tag {
    font-size: 11px;
    font-weight: 700;
    color: var(--on-primary);
    background: var(--primary);
    padding: 1px 8px;
    border-radius: var(--radius-pill);
  }
  .psub {
    font-size: 12.5px;
    color: var(--muted);
  }
  .chev {
    color: var(--muted);
    font-size: 18px;
  }
  .steps {
    margin: 0 0 18px;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 9px;
    color: var(--on-surface-var);
    line-height: 1.5;
    font-size: 14px;
  }
  .codeinline {
    background: var(--surface-2);
    border-radius: 5px;
    padding: 1px 6px;
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 12.5px;
    color: var(--primary);
  }
  .codeblock {
    position: relative;
    background: var(--bg);
    border: 1px solid var(--outline-dim);
    border-radius: var(--radius-s);
    margin: 0 0 16px;
  }
  .codeblock pre {
    margin: 0;
    padding: 14px 16px;
    overflow-x: auto;
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--on-surface);
  }
  .copy {
    position: absolute;
    top: 8px;
    right: 8px;
    border: 1px solid var(--outline);
    background: var(--surface);
    color: var(--on-surface-var);
    border-radius: var(--radius-s);
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .steps .copy {
    position: static;
    margin-left: 6px;
    padding: 1px 8px;
  }
  .env-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .foot {
    margin: 14px 0 0;
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.5;
  }
  .foot.err {
    color: var(--error);
  }
  .foot .codeinline {
    word-break: break-all;
  }
  .link {
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--primary);
    text-decoration: underline;
    cursor: pointer;
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
