<script lang="ts" module>
  // Stroke icons on a 24px grid (Lucide shapes), one path string each.
  const PATHS = {
    home: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    hand: "M18 11V6a2 2 0 0 0-4 0 M14 10V4a2 2 0 0 0-4 0v2 M10 10.5V6a2 2 0 0 0-4 0v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
    gamepad:
      "M6 11h4 M8 9v4 M15 12h.01 M18 10h.01 M17.32 5H6.68a4 4 0 0 0-3.978 3.59C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258A4 4 0 0 0 17.32 5z",
    axes: "M5 3v16h16 M5 19l6-6 M2 6l3-3 3 3 M18 16l3 3-3 3",
    radio: "M4.9 19.1C1 15.2 1 8.8 4.9 4.9 M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5 M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5 M19.1 4.9C23 8.8 23 15.1 19.1 19 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
    settings: "M20 7h-9 M14 17H5 M17 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z M3 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z",
    battery: "M4 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z M22 11v2 M6 10v4 M10 10v4 M14 10v4",
    activity:
      "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
    check: "M20 6 9 17l-5-5",
    info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 16v-4 M12 8h.01",
    alert: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 8v4 M12 16h.01",
    search: "m21 21-4.3-4.3 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
    plus: "M12 5v14M5 12h14",
    pencil: "M12 20h9 M16.4 3.6a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z",
    trash: "M3 6h18 M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6",
    chevron: "m6 9 6 6 6-6",
    refresh: "M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5",
    speaker: "M11 5 6 9H2v6h4l5 4V5Z M15.5 8.5a5 5 0 0 1 0 7 M19 5a10 10 0 0 1 0 14",
    vibrate: "m2 8 2 2-2 2 2 2-2 2 M22 8l-2 2 2 2-2 2 2 2 M8 5h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
    back: "m12 19-7-7 7-7 M19 12H5",
    close: "M6 6l12 12M18 6 6 18",
    minimize: "M5 12h14",
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18, stroke = 1.75 }: { name: IconName; size?: number; stroke?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  style="flex: none"><path d={PATHS[name]} /></svg
>
