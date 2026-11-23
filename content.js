(() => {
  if (globalThis.__mediaControlInstalled) return;
  globalThis.__mediaControlInstalled = true;
  const ids = new WeakMap();
  let next = 0;
  const media = () =>
    Array.from(document.querySelectorAll("video, audio"))
      .filter(
        (e) =>
          e.currentSrc || e.src || e.srcObject || e.readyState > 0 || !e.paused,
      )
      .sort((a, b) => {
        const score = (e) => {
          const rect = e.getBoundingClientRect();
          const area = rect.width * rect.height;

          return (!e.paused ? 10000000 : 0) + (area > 0 ? 1000000 : 0) + area;
        };

        return score(b) - score(a);
      });
  const id = (e) => {
    if (!ids.has(e)) ids.set(e, ++next);
    return ids.get(e);
  };
  chrome.runtime.onMessage.addListener((m, s, reply) => {
    if (m.type !== "mediaAction") return;

    // Spotify Web Player controls
    if (location.hostname === "open.spotify.com" && m.id === 0) {
      if (m.action === "play" || m.action === "pause") {
        const button = document.querySelector(
          '[data-testid="control-button-playpause"]',
        );

        if (!button) {
          reply({ ok: false, error: "Spotify play button not found" });
          return;
        }

        const label = (button.getAttribute("aria-label") || "").toLowerCase();
        const isPaused = label.includes("play") && !label.includes("pause");

        if (
          (m.action === "play" && isPaused) ||
          (m.action === "pause" && !isPaused)
        ) {
          button.click();
        }

        reply({ ok: true });
        return;
      }

      reply({ ok: false, error: "Spotify volume control not supported yet" });
      return;
    }

    const e = media().find((e) => id(e) === m.id);
    if (!e) {
      reply({ ok: false });
      return;
    }
    try {
      if (m.action === "volume") e.volume = Math.max(0, Math.min(1, m.value));
      if (m.action === "mute") e.muted = m.value;
      if (m.action === "pause") e.pause();
      if (m.action === "play") {
        e.play()
          .then(() => reply({ ok: true }))
          .catch((err) => reply({ ok: false, error: err.message }));
        return true;
      }
      reply({ ok: true });
    } catch (err) {
      reply({ ok: false, error: err.message });
    }
  });
  globalThis.__mediaControlScan = () =>
    media().map((e) => ({
      id: id(e),
      title:
        e.title || navigator.mediaSession?.metadata?.title || document.title,
      volume: e.volume,
      muted: e.muted,
      paused: e.paused,
      kind: e.tagName,
    }));
})();
