const $ = (id) => document.getElementById(id);
let items = [],
  busy = false;
const action = async (item, action, value) => {
  try {
    const r = await chrome.tabs.sendMessage(
      item.tabId,
      { type: "mediaAction", id: item.id, action, value },
      { frameId: item.frameId },
    );
    if (!r?.ok) throw Error(r?.error || "Media no longer available");
    return true;
  } catch (e) {
    $("status").textContent = e.message;
    return false;
  }
};
function render() {
  $("items").replaceChildren();
  $("summary").textContent =
    `${new Set(items.map((i) => i.tabId)).size} media tabs · ${items.filter((i) => !i.paused).length} playing`;
  if (!items.length)
    $("items").textContent =
      "No accessible audio or video found. Start playback and refresh.";
  $("muteAll").textContent =
    items.length && items.every((i) => i.muted) ? "Unmute all" : "Mute all";
  for (const i of items) {
    const card = document.createElement("section");
    card.className = "item";
    const top = document.createElement("div");
    top.className = "row";
    if (i.icon) {
      const img = document.createElement("img");
      img.src = i.icon;
      img.alt = "";
      top.append(img);
    }
    const site = document.createElement("span");
    site.className = "site";
    site.textContent = i.site;
    const state = document.createElement("span");
    state.className = "state";
    state.textContent = i.paused ? "Paused" : "Playing";
    top.append(site, state);
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = i.title;
    title.title = i.title;
    const row = document.createElement("div");
    row.className = "row";
    const play = document.createElement("button");
    play.textContent = i.paused ? "▶" : "Ⅱ";
    play.title = i.paused ? "Play" : "Pause";
    play.onclick = async () => {
      if (await action(i, i.paused ? "play" : "pause")) {
        i.paused = !i.paused;
        render();
      }
    };
    const mute = document.createElement("button");
    mute.textContent = i.muted ? "🔇" : "🔊";
    mute.title = i.muted ? "Unmute" : "Mute";
    mute.onclick = async () => {
      if (await action(i, "mute", !i.muted)) {
        i.muted = !i.muted;
        render();
      }
    };
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 0;
    slider.max = 100;
    slider.value = Math.round(i.volume * 100);
    slider.setAttribute("aria-label", "Volume for " + i.title);
    const out = document.createElement("output");
    out.textContent = slider.value + "%";
    const closeBtn = document.createElement("button");
    closeBtn.className = "close-tab";
    closeBtn.textContent = "✕";
    closeBtn.title = "Close this tab";

    closeBtn.onclick = async () => {
      try {
        await chrome.tabs.remove(i.tabId);

        // Remove every media entry belonging to the closed tab
        items = items.filter((item) => item.tabId !== i.tabId);

        render();
      } catch (err) {
        $("status").textContent = "Could not close tab: " + err.message;
      }
    };
    slider.oninput = () => {
      out.textContent = slider.value + "%";
      i.volume = Number(slider.value) / 100;
      action(i, "volume", i.volume);
    };
    row.append(play, mute, slider, out, closeBtn);
    card.append(top, title, row);
    $("items").append(card);
  }
}
// Find the best media player in each tab: currently playing first, then video.
function primaryMedia(entries) {
  return entries.sort(
    (a, b) =>
      Number(a.paused) - Number(b.paused) ||
      Number(b.kind === "VIDEO") - Number(a.kind === "VIDEO") ||
      Number(b.frameId === 0) - Number(a.frameId === 0),
  )[0];
}

async function scan() {
  if (busy) return;
  busy = true;
  const status = document.getElementById("status");

  if (status) {
    status.textContent = "Refreshing...";
    status.classList.add("active");
  }

  const refreshBtn = document.getElementById("refresh");

  refreshBtn.disabled = true;
  refreshBtn.classList.add("refreshing");
  refreshBtn.setAttribute("aria-busy", "true");

  if (status) {
    status.textContent = "Refreshing media tabs...";
  }

  try {
    const tabs = await chrome.tabs.query({});

    const results = await Promise.all(
      tabs.map(async (t) => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: t.id, allFrames: true },
            files: ["content.js"],
          });

          const frames = await chrome.scripting.executeScript({
            target: { tabId: t.id, allFrames: true },
            func: () => globalThis.__mediaControlScan?.() || [],
          });

          let site;

          try {
            site = new URL(t.url).hostname.replace(/^www\./, "");
          } catch {
            site = t.title || "Unknown site";
          }

          const media = frames.flatMap((f) =>
            (f.result || []).map((i) => ({
              ...i,
              title: i.title || t.title || "Untitled media",
              tabId: t.id,
              frameId: f.frameId,
              site,
              icon: t.favIconUrl,
            })),
          );

          return media.length ? primaryMedia(media) : null;
        } catch {
          return null;
        }
      }),
    );

    items = results
      .filter(Boolean)
      .sort((a, b) => Number(a.paused) - Number(b.paused));

    render();

    if (status) {
      status.textContent = `Updated: ${items.length} media tab${items.length === 1 ? "" : "s"}`;
    }
  } catch (err) {
    if (status) {
      status.textContent = `Refresh failed: ${err.message}`;
    }
  } finally {
    if (status) {
      status.classList.remove("active");
    }
    busy = false;

    refreshBtn.disabled = false;
    refreshBtn.classList.remove("refreshing");
    refreshBtn.removeAttribute("aria-busy");
  }
}

$("refresh").onclick = scan;
$("pauseAll").onclick = async () => {
  await Promise.all(
    items.map(async (i) => {
      if (await action(i, "pause")) i.paused = true;
    }),
  );
  render();
};
$("muteAll").onclick = async () => {
  const value = !items.every((i) => i.muted);
  await Promise.all(
    items.map(async (i) => {
      if (await action(i, "mute", value)) i.muted = value;
    }),
  );
  render();
};
scan();
document.getElementById("settingsBtn")?.addEventListener("click", () => {
  chrome.tabs.create({
    url: `chrome://extensions/?id=${chrome.runtime.id}`,
  });
});
// Display the currently assigned shortcut
chrome.commands.getAll((commands) => {
  const shortcut = commands.find(
    (command) => command.name === "_execute_action",
  );

  if (document.getElementById("currentShortcut")) {
    document.getElementById("currentShortcut").textContent =
      shortcut?.shortcut || "Not assigned";
  }
});

// Open Brave's shortcut settings
document.getElementById("changeShortcut")?.addEventListener("click", () => {
  chrome.tabs.create({
    url: "brave://extensions/shortcuts",
  });
});
