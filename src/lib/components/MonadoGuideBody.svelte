<script lang="ts">
  import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
  import { saveEnvisionProfile } from "$lib/api";
  import Icon, { type IconName } from "./Icon.svelte";

  // How to get a Monado built with the glove driver: pick a path, then its
  // steps. Shown in the Monado guide dialog and inline in the first-launch setup.

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

  // Back to the path list; true if there was somewhere to go back from.
  export function back() {
    if (!path) return false;
    path = null;
    savedPath = null;
    saveErr = false;
    return true;
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

  const paths: { id: Path; icon: IconName; title: string; sub: string; tag?: string }[] = [
    { id: "monadeck", icon: "rocket", title: "Monadeck", sub: "One-click launcher for the fork", tag: "Easiest" },
    { id: "envision", icon: "wrench", title: "Envision", sub: "Build from a custom profile" },
    { id: "manual", icon: "terminal", title: "Manual build", sub: "Clone and compile it yourself" },
  ];
  const current = $derived(paths.find((p) => p.id === path));
</script>

{#if !path}
  <p class="lede">
    Standard Monado, including Envision's default build and distro packages, <b>doesn't include the UDCAP glove
    driver</b>. Monado compiles its drivers in, so it can't be added to an existing install: you need a Monado
    <i>built with it</i>. Pick how:
  </p>
  <div class="paths">
    {#each paths as p}
      <button class="pathcard" onclick={() => (path = p.id)}>
        <span class="picon"><Icon name={p.icon} size={18} /></span>
        <span class="ptxt">
          <span class="ptitle">{p.title}{#if p.tag}<span class="tag">{p.tag}</span>{/if}</span>
          <span class="psub">{p.sub}</span>
        </span>
        <Icon name="next" size={16} />
      </button>
    {/each}
  </div>
{:else}
  <button class="backlink" onclick={back}><Icon name="back" size={14} />All options</button>
  <h3>{current?.title}</h3>
  {#if path === "monadeck"}
    <p class="lede">
      Monadeck installs and launches our Monado fork, which bundles the UDCAP driver, and sets it as your active
      OpenXR runtime. No terminal needed.
    </p>
    <ol class="steps">
      <li>Install <b>Monadeck</b>, then open it.</li>
      <li>In Monadeck, install or select the <b>UDCAP Monado fork</b> and set it as the active runtime.</li>
      <li>Launch Monado from Monadeck, then start your gloves here.</li>
    </ol>
    <div class="actions">
      <button class="btn tonal sm" onclick={() => go(MONADECK)}><Icon name="external" size={15} />Get Monadeck</button>
    </div>
  {:else if path === "envision"}
    <p class="lede">Envision builds Monado from a profile. Point one at our fork, build it and set it active.</p>
    <ol class="steps">
      <li>Install <b>Envision</b> and open it.</li>
      <li>
        Add a profile (or duplicate the default Monado one) and set its <b>XR Service Repo</b> to
        <span class="codeinline">{MONADO_FORK}</span>
        <button class="copy" onclick={() => copy(MONADO_FORK, "repo")}>{copied === "repo" ? "Copied" : "Copy"}</button>
        and <b>Branch</b> to <span class="codeinline">{MONADO_BRANCH}</span>.
      </li>
      <li>Build the profile, then set it as the active runtime.</li>
      <li>Start your gloves here. They show up as Index controllers.</li>
    </ol>
    <div class="actions">
      <button class="btn tonal sm" onclick={() => go(ENVISION)}><Icon name="external" size={15} />Get Envision</button>
      <button class="btn text sm" disabled={saving} onclick={saveProfile}>{saving ? "Saving…" : "Save profile to disk"}</button>
    </div>
    {#if savedPath}
      <p class="foot">
        Saved <span class="codeinline">{savedPath}</span>
        <button class="link" onclick={reveal}>Show file</button>. Load it with Envision's Import, in its advanced view.
      </p>
    {:else if saveErr}
      <p class="foot err">Couldn't save the profile. Set it up by hand with the steps above instead.</p>
    {:else}
      <p class="foot">Prefer importing? Save our ready-made profile, then import it in Envision's advanced view.</p>
    {/if}
  {:else}
    <p class="lede">
      Build the fork yourself. The key is the <span class="codeinline">XRT_BUILD_DRIVER_UDCAP=ON</span> flag: it's
      what compiles the glove driver in.
    </p>
    <div class="codeblock">
      <pre>{MANUAL_CMD}</pre>
      <button class="copy" onclick={() => copy(MANUAL_CMD, "manual")}>{copied === "manual" ? "Copied" : "Copy"}</button>
    </div>
    <ol class="steps">
      <li>Run the commands above (needs Monado's usual build dependencies).</li>
      <li>
        Make it your active OpenXR runtime: point <span class="codeinline">XR_RUNTIME_JSON</span> at
        <span class="codeinline">build/openxr_monado-dev.json</span>, or symlink it to
        <span class="codeinline">~/.config/openxr/1/active_runtime.json</span>.
      </li>
      <li>Launch <span class="codeinline">monado-service</span>, then start your gloves here.</li>
    </ol>
    <div class="actions">
      <button class="btn text sm" onclick={() => go(MONADO_FORK)}><Icon name="external" size={15} />Open the fork repo</button>
    </div>
  {/if}
{/if}

<style>
  .lede {
    margin: 0 0 14px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-2);
  }
  .lede b,
  .steps b {
    color: var(--text);
    font-weight: 600;
  }
  h3 {
    margin: 2px 0 6px;
    font-size: 15px;
    font-weight: 600;
  }
  .paths {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pathcard {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    text-align: left;
    background: var(--inset);
    border: 1px solid var(--border);
    border-radius: var(--radius-inner);
    color: var(--text-3);
    transition: border-color 0.15s var(--ease), background 0.15s var(--ease);
  }
  .pathcard:hover {
    border-color: var(--accent-line);
    background: var(--raised);
  }
  .picon {
    width: 36px;
    height: 36px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: var(--radius-control);
    background: var(--accent-soft);
    color: var(--accent);
  }
  .ptxt {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .ptitle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .tag {
    padding: 1px 8px;
    border-radius: var(--radius-pill);
    background: var(--accent);
    color: var(--on-accent);
    font-size: 11px;
    font-weight: 700;
  }
  .psub {
    font-size: 12px;
    color: var(--text-3);
  }
  .backlink {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-3);
  }
  .backlink:hover {
    color: var(--text);
  }
  .steps {
    margin: 0 0 14px;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-2);
  }
  .codeinline {
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--well);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--accent);
    user-select: text;
  }
  .codeblock {
    position: relative;
    margin: 0 0 14px;
    background: var(--well);
    border: 1px solid var(--border-input);
    border-radius: var(--radius-control);
  }
  .codeblock pre {
    margin: 0;
    padding: 12px 14px;
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.6;
    color: var(--text);
    user-select: text;
  }
  .copy {
    padding: 2px 9px;
    border-radius: 6px;
    background: var(--control);
    border: 1px solid var(--border-strong);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-2);
  }
  .copy:hover {
    color: var(--text);
  }
  .codeblock .copy {
    position: absolute;
    top: 8px;
    right: 8px;
  }
  .steps .copy {
    margin-left: 4px;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .foot {
    margin-top: 12px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-3);
  }
  .foot.err {
    color: var(--danger-text);
  }
  .foot .codeinline {
    word-break: break-all;
  }
  .link {
    font: inherit;
    font-weight: 600;
    color: var(--accent);
  }
  .link:hover {
    text-decoration: underline;
  }
</style>
