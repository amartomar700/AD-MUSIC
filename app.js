/* AD Music v3.4.0 — Glowing Spinning Logo Play/Pause, Track Cover Art, Random Shuffle & Folder Albums */
(() => {
  "use strict";

  const APP_VERSION = "3.4.0";
  const OFFLINE_CACHE_NAME = "ad-music-offline-audio-v1";
  const SONGS_CACHE_KEY = "admusic_cached_songs_v34";
  const CIRCUMFERENCE = 641;
  const API_URL = "https://script.google.com/macros/s/AKfycbwSr-j8h-BR8mgzU2c-9K0yuLokz7qcTAV8uxsW3ih8XLOADPCamdIg6OxIt7sNsZqQ/exec";

  const THEME_PRESETS = {
    neonwave: { pink: "#ff3f82", cyan: "#55d7ff" },
    emerald: { pink: "#00d285", cyan: "#00cec9" },
    gold: { pink: "#ffb300", cyan: "#ff6f00" },
    violet: { pink: "#a855f7", cyan: "#38bdf8" }
  };

  const EQ_PRESETS = {
    normal: [2, 11, 18, 8],
    classic: [4, 2, -1, 4],
    flat: [0, 0, 0, 0],
    bass: [12, 5, 0, 2],
    club: [10, 4, 3, 9]
  };

  const COVER_GRADIENTS = [
    "linear-gradient(135deg, #ff3f82, #55d7ff)",
    "linear-gradient(135deg, #00d285, #0984e3)",
    "linear-gradient(135deg, #a855f7, #ec4899)",
    "linear-gradient(135deg, #f59e0b, #ef4444)",
    "linear-gradient(135deg, #06b6d4, #6366f1)",
    "linear-gradient(135deg, #10b981, #f59e0b)"
  ];

  const state = {
    user: JSON.parse(localStorage.getItem("admusic_user") || "null"),
    songs: [],
    favorites: new Set(JSON.parse(localStorage.getItem("admusic_favorites") || "[]")),
    offlineIds: new Set(JSON.parse(localStorage.getItem("admusic_offline_ids") || "[]")),
    currentSong: null,
    activeAlbumName: null,
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    shuffle: true, // Songs har baar randomly play honge
    repeat: false,
    liveRadio: false,
    selectedCategory: "ALL",
    searchQuery: "",
    settings: JSON.parse(localStorage.getItem("admusic_settings") || JSON.stringify({
      primaryColor: "#ff3f82",
      secondaryColor: "#55d7ff",
      themePreset: "neonwave",
      visualizer: "on",
      cardRadius: 28
    }))
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    $("toastContainer").appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function shuffleArray(list) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function extractDriveId(input) {
    if (!input) return null;
    const raw = input.trim();
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]{20,})/,
      /[?&]id=([a-zA-Z0-9_-]{20,})/,
      /\/d\/([a-zA-Z0-9_-]{20,})/
    ];
    for (const p of patterns) {
      const m = raw.match(p);
      if (m) return m[1];
    }
    if (/^[a-zA-Z0-9_-]{24,48}$/.test(raw) && !raw.includes(".")) return raw;
    return null;
  }

  function resolveCoverUrl(rawCover) {
    const c = (rawCover || "").trim();
    if (!c) return "";
    const id = extractDriveId(c);
    if (id && (c.includes("drive.google.com") || c.includes("googleusercontent.com"))) {
      return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=s600`;
    }
    return c;
  }

  function resolveAudioSource(song) {
    const rawUrl = (song.audioUrl || song.url || "").trim();
    const explicitType = (song.sourceType || "").toUpperCase();
    const driveId = extractDriveId(rawUrl) || (song.driveId ? song.driveId.trim() : null);

    if (explicitType === "R2" || (!driveId && /^https?:\/\//i.test(rawUrl) && !rawUrl.includes("google.com"))) {
      return { type: "CLOUD", streamUrl: rawUrl, downloadUrl: rawUrl };
    }

    const id = driveId || rawUrl;
    const gdDirect = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
    const proxyUrl = `${API_URL}?action=stream&id=${encodeURIComponent(id)}`;
    return { type: "GD", driveId: id, streamUrl: gdDirect, proxyUrl, downloadUrl: gdDirect };
  }

  async function fetchGdProxyBlobUrl(proxyUrl) {
    const res = await fetch(proxyUrl);
    const text = await res.text();
    if (!text || text.trim().startsWith("{")) throw new Error("GD audio unavailable");
    const byteChars = atob(text.trim());
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNums)], { type: "audio/mpeg" });
    return { blob, blobUrl: URL.createObjectURL(blob) };
  }

  function normalizeTitle(title) {
    return (title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  function getCleanAlbumName(song) {
    const cat = String(song.category || "").trim();
    const alb = String(song.album || "").trim();
    if (!alb && !cat) return "Singles";
    if (!alb) return cat;
    if (!cat || cat.toLowerCase() === alb.toLowerCase()) return alb;
    return `${cat} — ${alb}`;
  }

  function autoCoverHtml(label, coverUrl) {
    const clean = String(label || "AD").trim();
    let hash = 0;
    for (let i = 0; i < clean.length; i++) hash = clean.charCodeAt(i) + ((hash << 5) - hash);
    const grad = COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];
    const initials = clean.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "AD";

    const fallback = `<div class="auto-cover-art" style="background:${grad}"><span>${escapeHtml(initials)}</span><small>♪</small></div>`;
    if (coverUrl) {
      return `<img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" onerror="this.remove()" />${fallback}`;
    }
    return fallback;
  }

  // --- Audio & Equalizer ---
  const audio = new Audio();
  audio.preload = "metadata";
  let audioCtx = null, sourceNode = null, bandFilters = [], bassFilter = null, trebleFilter = null, webAudioReady = false;

  function initWebAudioForMain() {
    if (webAudioReady) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      sourceNode = audioCtx.createMediaElementSource(audio);
      const freqs = [230, 910, 3600, 14000];
      bandFilters = freqs.map((freq, idx) => {
        const f = audioCtx.createBiquadFilter();
        f.type = "peaking";
        f.frequency.value = freq;
        f.Q.value = 1.1;
        f.gain.value = Number($(`eqBand${idx}`).value);
        return f;
      });
      bassFilter = audioCtx.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 120;
      bassFilter.gain.value = Number($("eqBassKnob").value);

      trebleFilter = audioCtx.createBiquadFilter();
      trebleFilter.type = "highshelf";
      trebleFilter.frequency.value = 8000;
      trebleFilter.gain.value = Number($("eqTrebleKnob").value);

      sourceNode.connect(bassFilter);
      bassFilter.connect(bandFilters[0]);
      for (let i = 0; i < bandFilters.length - 1; i++) bandFilters[i].connect(bandFilters[i + 1]);
      bandFilters[bandFilters.length - 1].connect(trebleFilter);
      trebleFilter.connect(audioCtx.destination);
      webAudioReady = true;
    } catch (_) {}
  }

  async function apiCall(action, payload = {}) {
    const body = JSON.stringify({
      action,
      token: state.user?.token || "",
      userId: state.user?.id || "",
      ...payload
    });
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
    const data = await res.json();
    if (!data.ok) {
      if (data.blocked) logoutUser("Account blocked by administrator.");
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  function renderAuthState() {
    if (!state.user) {
      $("authOverlay").classList.remove("hidden");
      return;
    }
    $("authOverlay").classList.add("hidden");
    $("userDisplayName").textContent = state.user.name || state.user.email;
    $("roleBadge").textContent = (state.user.role || "user").toUpperCase();
    $("adminNavBtn").classList.toggle("hidden", state.user.role !== "admin");
    updateDjLockState();
  }

  function updateDjLockState() {
    const unlocked = state.user?.role === "admin" || Boolean(state.user?.djUnlocked);
    $("djLockIcon").textContent = unlocked ? "🔓" : "🔒";
    $("djLockedPanel").classList.toggle("hidden", unlocked);
    $("djStudioPanel").classList.toggle("hidden", !unlocked);
  }

  function logoutUser(msg) {
    state.user = null;
    localStorage.removeItem("admusic_user");
    audio.pause();
    setPlayingVisuals(false);
    renderAuthState();
    if (msg) toast(msg, "error");
  }

  // --- Instant Cache + Re-Sync ---
  function hydrateSongs(rawList) {
    state.songs = (rawList || []).map((s) => ({
      ...s,
      cleanAlbum: getCleanAlbumName(s),
      resolvedCover: resolveCoverUrl(s.coverUrl || s.thumbnail || s.thumb || s.image),
      resolved: resolveAudioSource(s)
    }));
    if (!state.queue.length && state.songs.length) {
      state.queue = shuffleArray(state.songs);
    }
    populateCategories();
    renderAllViews();
    populateDJSelectors();
  }

  async function loadSongs(forceFresh = false) {
    if (!state.user) return;
    if (forceFresh) {
      localStorage.removeItem(SONGS_CACHE_KEY);
      toast("Re-syncing library from server...", "info");
    } else {
      const cached = localStorage.getItem(SONGS_CACHE_KEY);
      if (cached && !state.songs.length) {
        try { hydrateSongs(JSON.parse(cached)); } catch (_) {}
      }
    }

    try {
      const data = await apiCall("getSongs");
      localStorage.setItem(SONGS_CACHE_KEY, JSON.stringify(data.songs || []));
      hydrateSongs(data.songs || []);

      if (typeof data.djUnlocked === "boolean") {
        state.user.djUnlocked = data.djUnlocked;
        localStorage.setItem("admusic_user", JSON.stringify(state.user));
        updateDjLockState();
      }
      if (typeof data.pendingCount === "number" && state.user.role === "admin") {
        const badge = $("pendingBadge");
        badge.textContent = data.pendingCount;
        badge.classList.toggle("hidden", data.pendingCount === 0);
      }
      if (forceFresh) toast(`Synced ${state.songs.length} tracks!`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function populateCategories() {
    const sel = $("categoryFilter");
    const datalist = $("categorySuggestions");
    const cats = [...new Set(state.songs.map((s) => s.category || "General"))].sort();
    sel.innerHTML = `<option value="ALL">All Categories</option>` +
      cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    sel.value = state.selectedCategory;
    datalist.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join("");
  }

  function getFilteredSongs() {
    const q = state.searchQuery.toLowerCase();
    return state.songs.filter((s) => {
      const catOk = state.selectedCategory === "ALL" || (s.category || "General") === state.selectedCategory;
      const qOk = !q || [s.title, s.artist, s.cleanAlbum, s.category].some((f) => (f || "").toLowerCase().includes(q));
      return catOk && qOk;
    });
  }

  function createSongRow(song, index, list, isOfflineView = false) {
    const row = document.createElement("div");
    row.className = `song-row ${state.currentSong?.id === song.id ? "playing" : ""}`;
    const isFav = state.favorites.has(song.id);
    const isOffline = state.offlineIds.has(song.id);
    const srcType = song.resolved?.type || "GD";

    row.innerHTML = `
      <div class="song-thumb">${autoCoverHtml(song.title, song.resolvedCover)}</div>
      <div class="song-info">
        <h4>${escapeHtml(song.title)}</h4>
        <p>${escapeHtml(song.artist)} &bull; ${escapeHtml(song.cleanAlbum)} &bull; ${formatTime(Number(song.durationSec || 0))}</p>
      </div>
      <div class="song-actions">
        <span class="hd-badge">${srcType}</span>
        <button type="button" class="neo-pill-btn fav-btn" title="Favorite">${isFav ? "❤️" : "♡"}</button>
        ${isOfflineView
          ? `<button type="button" class="neo-pill-btn danger-text del-offline-btn" title="Delete Offline">🗑️</button>`
          : `<button type="button" class="neo-pill-btn dl-btn" title="Download Offline">${isOffline ? "✅" : "⬇️"}</button>`
        }
      </div>
    `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".fav-btn")) return toggleFavorite(song.id);
      if (e.target.closest(".dl-btn")) return downloadSongOffline(song);
      if (e.target.closest(".del-offline-btn")) return removeSingleOfflineSong(song);
      state.queue = list;
      playSongAtIndex(index);
      document.querySelector('[data-view="nowPlayingView"]').click();
    });
    return row;
  }

  function renderSongCollection(containerId, list, isOfflineView = false) {
    const box = $(containerId);
    box.innerHTML = list.length ? "" : `<p class="muted small">No tracks found.</p>`;
    list.forEach((song, idx) => box.appendChild(createSongRow(song, idx, list, isOfflineView)));
  }

  function renderAlbums() {
    const grid = $("albumGrid");
    const songBox = $("albumSongList");
    grid.className = "stack";
    grid.classList.remove("hidden");
    songBox.classList.add("hidden");
    $("backToAlbumsBtn").classList.add("hidden");

    const map = new Map();
    state.songs.forEach((s) => {
      const key = s.cleanAlbum;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });

    grid.innerHTML = map.size ? "" : `<p class="muted small">No albums available.</p>`;
    map.forEach((tracks, albumName) => {
      const row = document.createElement("div");
      row.className = `album-list-row ${state.activeAlbumName === albumName ? "active-album" : ""}`;
      const inheritedCover = tracks.find((t) => t.resolvedCover)?.resolvedCover || "";

      row.innerHTML = `
        <div class="album-row-thumb">${autoCoverHtml(albumName, inheritedCover)}</div>
        <div class="album-row-info">
          <h4>${escapeHtml(albumName)}</h4>
          <p>${tracks.length} song(s)</p>
        </div>
        <div class="album-row-actions">
          <button type="button" class="neo-pill-btn album-play-pill play-album-btn" title="Play Only This Album">▶ Play</button>
          <button type="button" class="neo-pill-btn dl-album-btn" title="Download Album Offline">⬇️</button>
        </div>
      `;

      row.addEventListener("click", (e) => {
        if (e.target.closest(".play-album-btn")) {
          playAlbumTracks(albumName, tracks);
          return;
        }
        if (e.target.closest(".dl-album-btn")) {
          downloadAlbumOffline(albumName, tracks);
          return;
        }
        grid.classList.add("hidden");
        songBox.classList.remove("hidden");
        $("backToAlbumsBtn").classList.remove("hidden");
        songBox.innerHTML = `
          <div class="album-list-row active-album">
            <div class="album-row-thumb">${autoCoverHtml(albumName, inheritedCover)}</div>
            <div class="album-row-info">
              <h4>${escapeHtml(albumName)}</h4>
              <p>Album Queue &bull; ${tracks.length} song(s)</p>
            </div>
            <div class="album-row-actions">
              <button type="button" id="openAlbumPlayBtn" class="neo-pill-btn album-play-pill">▶ Play Album</button>
              <button type="button" id="openAlbumDlBtn" class="neo-pill-btn">⬇️ Save All</button>
            </div>
          </div>
        `;
        $("openAlbumPlayBtn").onclick = () => playAlbumTracks(albumName, tracks);
        $("openAlbumDlBtn").onclick = () => downloadAlbumOffline(albumName, tracks);
        tracks.forEach((song, idx) => songBox.appendChild(createSongRow(song, idx, tracks, false)));
      });

      grid.appendChild(row);
    });
  }

  function playAlbumTracks(albumName, tracks) {
    if (!tracks.length) return;
    state.activeAlbumName = albumName;
    state.queue = state.shuffle ? shuffleArray(tracks) : [...tracks];
    playSongAtIndex(0);
    toast(`Playing Album: ${albumName} (${tracks.length} songs)`, "success");
    document.querySelector('[data-view="nowPlayingView"]').click();
  }

  async function downloadAlbumOffline(albumName, tracks) {
    toast(`Downloading ${tracks.length} songs from "${albumName}"...`, "info");
    for (const song of tracks) {
      if (!state.offlineIds.has(song.id)) {
        await downloadSongOffline(song, true);
      }
    }
    renderAllViews();
    toast(`Album "${albumName}" saved offline!`, "success");
  }

  function renderAllViews() {
    const filtered = getFilteredSongs();
    $("libraryStats").textContent = `${filtered.length} approved track(s) • Cloud + GD`;
    $("offlineStats").textContent = `${state.offlineIds.size} track(s) saved offline`;
    renderSongCollection("songList", filtered, false);
    renderSongCollection("favoritesList", state.songs.filter((s) => state.favorites.has(s.id)), false);
    renderSongCollection("offlineList", state.songs.filter((s) => state.offlineIds.has(s.id)), true);
    renderAlbums();
  }

  // --- Playback, Center Track Cover & Glowing Spinning Logo ---
  function setPlayingVisuals(playing) {
    state.isPlaying = playing;
    $("playPauseIcon").textContent = playing ? "Ⅱ" : "▶";
    $("playPauseBtn").classList.toggle("is-playing", playing);
    $("visualWrap").classList.toggle("playing", playing);
  }

  async function playSongAtIndex(index) {
    if (!state.queue.length) return;
    const safeIdx = ((index % state.queue.length) + state.queue.length) % state.queue.length;
    state.currentIndex = safeIdx;
    const song = state.queue[safeIdx];
    state.currentSong = song;

    const src = song.resolved || resolveAudioSource(song);
    let playableUrl = src.streamUrl;

    if (state.offlineIds.has(song.id) && "caches" in window) {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      const match = await cache.match(src.streamUrl);
      if (match) playableUrl = URL.createObjectURL(await match.blob());
    }

    audio.crossOrigin = src.type === "CLOUD" ? "anonymous" : null;
    audio.src = playableUrl;
    audio.volume = Number($("masterVolume").value);
    $("dialProgressCircle").style.strokeDashoffset = CIRCUMFERENCE;

    updatePlayerBar(song, src.type);

    initWebAudioForMain();
    if (audioCtx && audioCtx.state === "suspended") await audioCtx.resume();

    try {
      await audio.play();
      setPlayingVisuals(true);
    } catch (_) {
      if (src.proxyUrl && playableUrl !== src.proxyUrl) {
        try {
          const { blobUrl } = await fetchGdProxyBlobUrl(src.proxyUrl);
          audio.crossOrigin = null;
          audio.src = blobUrl;
          await audio.play();
          setPlayingVisuals(true);
        } catch (err) {
          setPlayingVisuals(false);
          toast("Unable to play audio: " + err.message, "error");
        }
      } else {
        setPlayingVisuals(false);
      }
    }

    renderAllViews();
  }

  function updatePlayerBar(song, srcType) {
    $("playerTitle").textContent = song.title;
    $("playerArtist").textContent = `${song.artist} • ${song.cleanAlbum}`;
    $("sourceTypeBadge").textContent = srcType;
    $("playerFavBtn").classList.toggle("active", state.favorites.has(song.id));

    const coverImg = $("playerCover");
    const fallbackEl = $("coverFallback");
    const thumbUrl = (song.resolvedCover || "").trim();

    if (thumbUrl) {
      coverImg.src = thumbUrl;
      coverImg.classList.remove("hidden");
      fallbackEl.classList.add("hidden");
      coverImg.onerror = () => {
        coverImg.src = "logo.png";
      };
    } else {
      coverImg.src = "logo.png";
      coverImg.classList.remove("hidden");
      fallbackEl.classList.add("hidden");
    }
  }

  function getRandomNextIndex() {
    const total = state.queue.length;
    if (total <= 1) return 0;
    let randIdx;
    do {
      randIdx = Math.floor(Math.random() * total);
    } while (randIdx === state.currentIndex);
    return randIdx;
  }

  function nextTrack() {
    if (!state.queue.length) return;
    if (state.shuffle || state.liveRadio) {
      return playSongAtIndex(getRandomNextIndex());
    }
    playSongAtIndex(state.currentIndex + 1);
  }

  function prevTrack() {
    if (!state.queue.length) return;
    if (state.shuffle) {
      return playSongAtIndex(getRandomNextIndex());
    }
    playSongAtIndex(state.currentIndex - 1);
  }

  function skipSeconds(delta) {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
  }

  function toggleFavorite(songId) {
    if (state.favorites.has(songId)) state.favorites.delete(songId);
    else state.favorites.add(songId);
    localStorage.setItem("admusic_favorites", JSON.stringify([...state.favorites]));
    if (state.currentSong?.id === songId) {
      $("playerFavBtn").classList.toggle("active", state.favorites.has(songId));
    }
    renderAllViews();
  }

  async function downloadSongOffline(song, silent = false) {
    const src = song.resolved || resolveAudioSource(song);
    try {
      if (!silent) toast(`Saving "${song.title}" offline...`);
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      if (src.type === "GD" && src.proxyUrl) {
        const { blob } = await fetchGdProxyBlobUrl(src.proxyUrl);
        await cache.put(src.streamUrl, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
      } else {
        const res = await fetch(src.downloadUrl);
        await cache.put(src.streamUrl, res);
      }
      state.offlineIds.add(song.id);
      localStorage.setItem("admusic_offline_ids", JSON.stringify([...state.offlineIds]));
      if (!silent) {
        renderAllViews();
        toast(`Saved "${song.title}" offline!`, "success");
      }
    } catch (err) {
      if (!silent) toast("Offline save failed: " + err.message, "error");
    }
  }

  async function removeSingleOfflineSong(song) {
    const src = song.resolved || resolveAudioSource(song);
    if ("caches" in window) {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      await cache.delete(src.streamUrl);
    }
    state.offlineIds.delete(song.id);
    localStorage.setItem("admusic_offline_ids", JSON.stringify([...state.offlineIds]));
    renderAllViews();
    toast(`Removed "${song.title}" from offline.`, "info");
  }

  async function clearOfflineCache() {
    if ("caches" in window) await caches.delete(OFFLINE_CACHE_NAME);
    state.offlineIds.clear();
    localStorage.setItem("admusic_offline_ids", "[]");
    renderAllViews();
    toast("All offline songs deleted.", "success");
  }

  // --- Equalizer ---
  function formatDb(val) {
    const n = Number(val);
    return (n >= 0 ? "+" : "-") + String(Math.abs(n)).padStart(2, "0");
  }

  function syncEqVisuals() {
    for (let i = 0; i < 4; i++) {
      const val = Number($(`eqBand${i}`).value);
      $(`valBand${i}`).textContent = formatDb(val);
      const pct = ((val + 12) / 30) * 100;
      $(`fillBand${i}`).style.height = `${Math.max(6, Math.min(100, pct))}%`;
      if (bandFilters[i]) bandFilters[i].gain.value = val;
    }
    const bassVal = Number($("eqBassKnob").value);
    $("bassKnobVal").textContent = formatDb(bassVal);
    $("bassKnobCap").style.transform = `rotate(${(bassVal / 18) * 135}deg)`;
    if (bassFilter) bassFilter.gain.value = bassVal;

    const trebVal = Number($("eqTrebleKnob").value);
    $("trebleKnobVal").textContent = formatDb(trebVal);
    $("trebleKnobCap").style.transform = `rotate(${(trebVal / 18) * 135}deg)`;
    if (trebleFilter) trebleFilter.gain.value = trebVal;
  }

  // --- DJ PRO Studio ---
  const decks = {
    A: { audio: new Audio(), playing: false, angle: 0, song: null, vol: 1, ctx: null, filters: {} },
    B: { audio: new Audio(), playing: false, angle: 0, song: null, vol: 1, ctx: null, filters: {} }
  };

  function setupDeckEq(k) {
    const d = decks[k];
    if (d.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      d.ctx = new Ctx();
      const src = d.ctx.createMediaElementSource(d.audio);
      const low = d.ctx.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 200;
      const mid = d.ctx.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 1200;
      const high = d.ctx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 6000;
      src.connect(low); low.connect(mid); mid.connect(high); high.connect(d.ctx.destination);
      d.filters = { low, mid, high };
    } catch (_) {}
  }

  function applyDjCrossfader() {
    const x = Number($("djCrossfader").value);
    decks.A.audio.volume = Math.min(1, decks.A.vol * Math.cos(x * 0.5 * Math.PI));
    decks.B.audio.volume = Math.min(1, decks.B.vol * Math.cos((1 - x) * 0.5 * Math.PI));
    $("crossfaderVal").textContent = `${Math.round((1 - x) * 100)} / ${Math.round(x * 100)}`;
  }

  function populateDJSelectors() {
    const opts = `<option value="">-- Select Track --</option>` +
      state.songs.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)} — ${escapeHtml(s.artist)}</option>`).join("");
    $("deckASelect").innerHTML = opts;
    $("deckBSelect").innerHTML = opts;
  }

  function loadDeck(k, songId) {
    const song = state.songs.find((s) => s.id === songId);
    if (!song) return;
    const d = decks[k];
    const src = song.resolved || resolveAudioSource(song);
    d.song = song;
    d.audio.src = src.streamUrl;
    d.playing = false;
    $(`deck${k}TrackTitle`).textContent = `${song.title} — ${song.artist}`;
    $(`deck${k}Label`).textContent = song.title.slice(0, 10).toUpperCase();
    $(`deck${k}PlayBtn`).textContent = "▶";
    applyDjCrossfader();
  }

  function bindTurntableScratch(k) {
    const platter = $(`platter${k}`);
    let dragging = false, lastX = 0;
    const start = (x) => { dragging = true; lastX = x; };
    const move = (x) => {
      if (!dragging) return;
      const dx = x - lastX;
      lastX = x;
      decks[k].angle += dx * 1.8;
      platter.style.transform = `rotate(${decks[k].angle}deg)`;
      if (Number.isFinite(decks[k].audio.duration)) {
        decks[k].audio.currentTime = Math.max(0, Math.min(decks[k].audio.duration, decks[k].audio.currentTime + dx * 0.03));
      }
    };
    const end = () => { dragging = false; };
    platter.addEventListener("mousedown", (e) => start(e.clientX));
    window.addEventListener("mousemove", (e) => move(e.clientX));
    window.addEventListener("mouseup", end);
    platter.addEventListener("touchstart", (e) => start(e.touches[0].clientX), { passive: true });
    platter.addEventListener("touchmove", (e) => move(e.touches[0].clientX), { passive: true });
    platter.addEventListener("touchend", end);
  }

  setInterval(() => {
    ["A", "B"].forEach((k) => {
      if (decks[k].playing && !decks[k].audio.paused) {
        decks[k].angle = (decks[k].angle + 3 * decks[k].audio.playbackRate) % 360;
        $(`platter${k}`).style.transform = `rotate(${decks[k].angle}deg)`;
      }
    });
  }, 30);

  // --- Admin ---
  async function loadAdminData() {
    if (state.user?.role !== "admin") return;
    try {
      const data = await apiCall("getAdminDashboard");
      renderPendingSongs(data.pendingSongs || []);
      renderAccessCodes(data.accessCodes || []);
      renderAdminUsers(data.users || []);
    } catch (err) {
      toast("Admin load error: " + err.message, "error");
    }
  }

  function renderPendingSongs(list) {
    const box = $("pendingSongsList");
    const badge = $("pendingBadge");
    badge.textContent = list.length;
    badge.classList.toggle("hidden", list.length === 0);
    box.innerHTML = list.length ? "" : `<p class="muted small">No pending songs.</p>`;

    list.forEach((s) => {
      const item = document.createElement("div");
      item.className = "admin-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(s.title)}</strong>
          <div class="muted small">${escapeHtml(s.artist)} • ${escapeHtml(getCleanAlbumName(s))} • ${s.durationSec}s</div>
        </div>
        <div class="inline-row">
          <button type="button" class="neo-btn neo-btn-primary approve-btn">Approve</button>
          <button type="button" class="neo-btn danger-text reject-btn">Reject</button>
        </div>
      `;
      item.querySelector(".approve-btn").onclick = async () => {
        await apiCall("reviewSong", { songId: s.id, decision: "Approved" });
        toast("Song approved!", "success");
        loadAdminData();
        loadSongs(true);
      };
      item.querySelector(".reject-btn").onclick = async () => {
        await apiCall("reviewSong", { songId: s.id, decision: "Rejected" });
        toast("Song rejected.", "info");
        loadAdminData();
      };
      box.appendChild(item);
    });
  }

  function renderAccessCodes(list) {
    const box = $("accessCodesList");
    box.innerHTML = list.length ? "" : `<p class="muted small">No codes yet.</p>`;
    list.forEach((c) => {
      const item = document.createElement("div");
      item.className = "admin-item";
      item.innerHTML = `
        <div>
          <strong><code>${escapeHtml(c.code)}</code></strong>
          <div class="muted small">${escapeHtml(c.role)} • Used ${c.usedCount}/${c.maxUses} • ${c.active ? "Active" : "Revoked"}</div>
        </div>
        ${c.active ? `<button type="button" class="neo-btn danger-text revoke-btn">Revoke</button>` : `<span class="muted small">Revoked</span>`}
      `;
      const btn = item.querySelector(".revoke-btn");
      if (btn) {
        btn.onclick = async () => {
          await apiCall("revokeAccessCode", { code: c.code });
          toast("Code revoked.", "info");
          loadAdminData();
        };
      }
      box.appendChild(item);
    });
  }

  function renderAdminUsers(list) {
    const box = $("adminUsersList");
    box.innerHTML = list.length ? "" : `<p class="muted small">No registered users.</p>`;

    list.forEach((u) => {
      const item = document.createElement("div");
      item.className = "admin-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(u.name)} (${escapeHtml(u.email)})</strong>
          <div class="muted small">
            Code: <code>${escapeHtml(u.accessCode || "-")}</code> &bull;
            Status: ${u.blocked ? "BLOCKED" : "Active"} &bull;
            DJ PRO: ${u.djUnlocked ? "Unlocked 🔓" : "Locked 🔒"}
          </div>
        </div>
        <div class="inline-row">
          <button type="button" class="neo-btn toggle-dj-btn">${u.djUnlocked ? "Lock DJ 🔒" : "Unlock DJ 🔓"}</button>
          <button type="button" class="neo-btn ${u.blocked ? "neo-btn-primary" : "danger-text"} toggle-block-btn">${u.blocked ? "Unblock" : "Block"}</button>
          ${u.codeActive ? `<button type="button" class="neo-btn danger-text revoke-user-code-btn">Revoke Code</button>` : ""}
        </div>
      `;

      item.querySelector(".toggle-dj-btn").onclick = async () => {
        await apiCall("setUserDj", { targetUserId: u.id, djUnlocked: !u.djUnlocked });
        toast(`DJ PRO ${!u.djUnlocked ? "unlocked" : "locked"} for ${u.name}.`, "success");
        loadAdminData();
      };
      item.querySelector(".toggle-block-btn").onclick = async () => {
        await apiCall("setUserBlock", { targetUserId: u.id, blocked: !u.blocked });
        toast(`User ${u.blocked ? "unblocked" : "blocked"}.`, "success");
        loadAdminData();
      };
      const revBtn = item.querySelector(".revoke-user-code-btn");
      if (revBtn) {
        revBtn.onclick = async () => {
          await apiCall("revokeAccessCode", { code: u.accessCode });
          toast(`Code ${u.accessCode} revoked.`, "info");
          loadAdminData();
        };
      }
      box.appendChild(item);
    });
  }

  // --- Customization Settings ---
  function applySettings() {
    document.documentElement.style.setProperty("--pink", state.settings.primaryColor);
    document.documentElement.style.setProperty("--cyan", state.settings.secondaryColor);
    document.documentElement.style.setProperty("--card-radius", `${state.settings.cardRadius}px`);
    $("settingPrimaryColor").value = state.settings.primaryColor;
    $("settingSecondaryColor").value = state.settings.secondaryColor;
    $("settingThemePreset").value = state.settings.themePreset;
    $("settingVisualizer").value = state.settings.visualizer;
    $("settingCardRadius").value = state.settings.cardRadius;
    $("radiusVal").textContent = state.settings.cardRadius;
    $("visualWrap").classList.toggle("static-mode", state.settings.visualizer === "off");
    localStorage.setItem("admusic_settings", JSON.stringify(state.settings));
  }

  async function checkUpdates() {
    $("versionCheckStatus").textContent = "Checking for updates...";
    try {
      const data = await apiCall("getVersion");
      const remote = data.version || APP_VERSION;
      if (remote !== APP_VERSION) {
        $("remoteVersionText").textContent = `v${remote}`;
        $("updateBanner").classList.remove("hidden");
        $("versionCheckStatus").textContent = `Update available: v${remote}`;
      } else {
        $("versionCheckStatus").textContent = `Up to date (v${APP_VERSION}).`;
      }
    } catch (err) {
      $("versionCheckStatus").textContent = err.message;
    }
  }

  async function applyUpdateNow() {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== OFFLINE_CACHE_NAME).map((k) => caches.delete(k)));
    }
    window.location.reload();
  }

  // --- Events ---
  function bindEvents() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
        btn.classList.add("active");
        $(btn.dataset.view).classList.add("active");
        if (btn.dataset.view === "adminView") loadAdminData();
      });
    });

    document.querySelectorAll(".sub-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".sub-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".lib-panel").forEach((p) => p.classList.add("hidden"));
        tab.classList.add("active");
        $(tab.dataset.libTab).classList.remove("hidden");
      });
    });

    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const isLogin = tab.dataset.authTab === "login";
        $("loginForm").classList.toggle("hidden", !isLogin);
        $("registerForm").classList.toggle("hidden", isLogin);
      });
    });

    $("loginForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await apiCall("login", {
          identifier: $("loginIdentifier").value.trim(),
          accessCode: $("loginAccessCode").value.trim()
        });
        state.user = res.user;
        localStorage.setItem("admusic_user", JSON.stringify(state.user));
        renderAuthState();
        loadSongs(true);
        toast(`Welcome back, ${state.user.name}!`, "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };

    $("registerForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await apiCall("register", {
          name: $("regName").value.trim(),
          email: $("regEmail").value.trim(),
          accessCode: $("regAccessCode").value.trim()
        });
        state.user = res.user;
        localStorage.setItem("admusic_user", JSON.stringify(state.user));
        renderAuthState();
        loadSongs(true);
        toast("Account created!", "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };

    $("searchInput").oninput = (e) => { state.searchQuery = e.target.value; renderAllViews(); };
    $("categoryFilter").onchange = (e) => { state.selectedCategory = e.target.value; renderAllViews(); };
    $("refreshLibraryBtn").onclick = () => loadSongs(true);
    $("backToAlbumsBtn").onclick = renderAlbums;

    $("playPauseBtn").onclick = async () => {
      if (!state.currentSong) {
        const pool = getFilteredSongs();
        if (pool.length) {
          state.queue = state.shuffle ? shuffleArray(pool) : pool;
          playSongAtIndex(0);
        }
        return;
      }
      if (audio.paused) {
        await audio.play();
        setPlayingVisuals(true);
      } else {
        audio.pause();
        setPlayingVisuals(false);
      }
    };

    $("nextBtn").onclick = nextTrack;
    $("prevBtn").onclick = prevTrack;
    $("rewind10Btn").onclick = () => skipSeconds(-10);
    $("forward10Btn").onclick = () => skipSeconds(10);

    $("shuffleBtn").classList.toggle("active", state.shuffle);
    $("shuffleBtn").onclick = () => {
      state.shuffle = !state.shuffle;
      $("shuffleBtn").classList.toggle("active", state.shuffle);
      if (state.shuffle && state.queue.length > 1) {
        state.queue = shuffleArray(state.queue);
      }
      toast(state.shuffle ? "Random Shuffle ON" : "Sequential Order", "info");
    };
    $("repeatBtn").onclick = () => {
      state.repeat = !state.repeat;
      audio.loop = state.repeat;
      $("repeatBtn").classList.toggle("active", state.repeat);
    };
    $("liveRadioBtn").onclick = () => {
      state.liveRadio = !state.liveRadio;
      $("liveRadioBtn").classList.toggle("active", state.liveRadio);
      $("liveRadioBadge").classList.toggle("hidden", !state.liveRadio);
      if (state.liveRadio && !state.isPlaying && state.songs.length) {
        state.activeAlbumName = null;
        state.queue = shuffleArray(state.songs);
        playSongAtIndex(0);
      }
    };

    $("masterVolume").oninput = (e) => {
      audio.volume = Number(e.target.value);
      $("volumeValue").textContent = `${Math.round(audio.volume * 100)}%`;
    };
    $("seekBar").oninput = (e) => {
      if (Number.isFinite(audio.duration)) audio.currentTime = (Number(e.target.value) / 100) * audio.duration;
    };

    audio.ontimeupdate = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      $("seekBar").value = pct;
      $("currentTimeLabel").textContent = formatTime(audio.currentTime);
      $("durationLabel").textContent = formatTime(audio.duration);
      $("remainingTimeLabel").textContent = `-${formatTime(Math.max(0, audio.duration - audio.currentTime))}`;
      $("dialProgressCircle").style.strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * pct) / 100;
    };
    audio.onended = () => { if (!state.repeat) nextTrack(); };
    audio.onpause = () => setPlayingVisuals(false);
    audio.onplay = () => setPlayingVisuals(true);

    $("playerFavBtn").onclick = () => { if (state.currentSong) toggleFavorite(state.currentSong.id); };
    $("downloadOfflineBtn").onclick = () => { if (state.currentSong) downloadSongOffline(state.currentSong); };

    // Equalizer
    document.querySelectorAll(".eq-preset-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".eq-preset-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const vals = EQ_PRESETS[tab.dataset.preset] || EQ_PRESETS.flat;
        vals.forEach((v, i) => { $(`eqBand${i}`).value = v; });
        syncEqVisuals();
      });
    });
    for (let i = 0; i < 4; i++) $(`eqBand${i}`).oninput = syncEqVisuals;
    $("eqBassKnob").oninput = syncEqVisuals;
    $("eqTrebleKnob").oninput = syncEqVisuals;

    // DJ Decks
    ["A", "B"].forEach((k) => {
      $(`deck${k}Select`).onchange = (e) => loadDeck(k, e.target.value);
      $(`deck${k}PlayBtn`).onclick = async () => {
        const d = decks[k];
        if (!d.song) return toast(`Load Track ${k} first.`, "error");
        setupDeckEq(k);
        if (d.audio.paused) {
          try { await d.audio.play(); } catch (_) {
            const src = d.song.resolved || resolveAudioSource(d.song);
            const { blobUrl } = await fetchGdProxyBlobUrl(src.proxyUrl);
            d.audio.src = blobUrl;
            await d.audio.play();
          }
          d.playing = true;
          $(`deck${k}PlayBtn`).textContent = "Ⅱ";
        } else {
          d.audio.pause();
          d.playing = false;
          $(`deck${k}PlayBtn`).textContent = "▶";
        }
      };
      $(`deck${k}CueBtn`).onclick = () => { decks[k].audio.currentTime = 0; };
      $(`deck${k}Pitch`).oninput = (e) => {
        const r = Number(e.target.value);
        decks[k].audio.playbackRate = r;
        $(`deck${k}PitchVal`).textContent = `${r.toFixed(2)}x`;
      };
      $(`deck${k}Vol`).oninput = (e) => {
        decks[k].vol = Number(e.target.value);
        $(`deck${k}VolVal`).textContent = `${Math.round(decks[k].vol * 100)}%`;
        applyDjCrossfader();
      };
      $(`deck${k}EqLow`).oninput = (e) => { if (decks[k].filters.low) decks[k].filters.low.gain.value = Number(e.target.value); };
      $(`deck${k}EqMid`).oninput = (e) => { if (decks[k].filters.mid) decks[k].filters.mid.gain.value = Number(e.target.value); };
      $(`deck${k}EqHigh`).oninput = (e) => { if (decks[k].filters.high) decks[k].filters.high.gain.value = Number(e.target.value); };
      bindTurntableScratch(k);
    });
    $("djCrossfader").oninput = applyDjCrossfader;

    // Upload
    $("uploadSourceType").onchange = (e) => {
      const mode = e.target.value;
      $("filePickerGroup").classList.toggle("hidden", mode !== "FILE");
      $("urlInputGroup").classList.toggle("hidden", mode === "FILE");
      $("audioSourceLabel").textContent = mode === "R2" ? "Cloud Direct Audio Link" : "GD Link or File ID";
    };

    $("uploadAudioFile").onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!$("uploadTitle").value.trim()) $("uploadTitle").value = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ");
      const tempAudio = new Audio(URL.createObjectURL(file));
      tempAudio.onloadedmetadata = () => { $("uploadDuration").value = Math.min(600, Math.round(tempAudio.duration)); };
    };

    $("probeDurationBtn").onclick = () => {
      const raw = $("uploadSourceUrl").value.trim();
      if (!raw) return toast("Enter an audio link first.", "error");
      const src = resolveAudioSource({ audioUrl: raw, sourceType: $("uploadSourceType").value });
      const probe = new Audio(src.streamUrl);
      probe.onloadedmetadata = () => { $("uploadDuration").value = Math.round(probe.duration); toast(`Duration: ${Math.round(probe.duration)}s`, "success"); };
    };

    $("uploadForm").onsubmit = async (e) => {
      e.preventDefault();
      const mode = $("uploadSourceType").value;
      const title = $("uploadTitle").value.trim();
      const artist = $("uploadArtist").value.trim();
      const album = $("uploadAlbum").value.trim();
      const category = $("uploadCategory").value.trim();
      const coverUrl = $("uploadCoverUrl").value.trim();
      const durationSec = Number($("uploadDuration").value);

      if (state.songs.some((s) => normalizeTitle(s.title) === normalizeTitle(title))) {
        return toast("Duplicate rejected: Song title already exists.", "error");
      }

      try {
        if (mode === "FILE") {
          const file = $("uploadAudioFile").files?.[0];
          if (!file) return toast("Select an audio file first.", "error");
          if (file.size > 25 * 1024 * 1024) return toast("Max file size 25MB.", "error");
          $("uploadStatusMsg").textContent = "Uploading to GD...";
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          await apiCall("uploadSongFile", {
            fileBase64: base64, mimeType: file.type || "audio/mpeg", fileName: file.name,
            title, artist, album, category, coverUrl, durationSec
          });
        } else {
          $("uploadStatusMsg").textContent = "Submitting track...";
          await apiCall("uploadSong", {
            sourceType: mode, audioUrl: $("uploadSourceUrl").value.trim(),
            title, artist, album, category, coverUrl, durationSec
          });
        }
        $("uploadForm").reset();
        $("uploadSourceType").dispatchEvent(new Event("change"));
        $("uploadStatusMsg").textContent = "Submitted for Admin Approval!";
        toast("Submitted for Admin Approval!", "success");
      } catch (err) {
        $("uploadStatusMsg").textContent = err.message;
        toast(err.message, "error");
      }
    };

    // Admin & Settings Customization
    $("adminRefreshBtn").onclick = () => { loadAdminData(); loadSongs(true); };
    $("createCodeForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await apiCall("createAccessCode", {
          role: $("newCodeRole").value, maxUses: Number($("newCodeMaxUses").value)
        });
        toast(`Generated code: ${res.code}`, "success");
        loadAdminData();
      } catch (err) {
        toast(err.message, "error");
      }
    };

    $("settingPrimaryColor").oninput = (e) => { state.settings.primaryColor = e.target.value; applySettings(); };
    $("settingSecondaryColor").oninput = (e) => { state.settings.secondaryColor = e.target.value; applySettings(); };
    $("settingThemePreset").onchange = (e) => {
      const preset = THEME_PRESETS[e.target.value];
      if (preset) {
        state.settings.themePreset = e.target.value;
        state.settings.primaryColor = preset.pink;
        state.settings.secondaryColor = preset.cyan;
        applySettings();
      }
    };
    $("settingVisualizer").onchange = (e) => { state.settings.visualizer = e.target.value; applySettings(); };
    $("settingCardRadius").oninput = (e) => { state.settings.cardRadius = Number(e.target.value); applySettings(); };

    $("settingsClearCacheBtn").onclick = clearOfflineCache;
    $("checkUpdatesBtn").onclick = checkUpdates;
    $("updateNowBtn").onclick = applyUpdateNow;
    $("bannerUpdateNowBtn").onclick = applyUpdateNow;
    $("logoutBtn").onclick = () => logoutUser("Signed out.");
    $("userBadgeBtn").onclick = () => document.querySelector('[data-view="settingsView"]').click();
  }

  function init() {
    applySettings();
    syncEqVisuals();
    bindEvents();
    renderAuthState();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
    if (state.user) {
      loadSongs(false);
      checkUpdates();
    }
  }

  init();
})();
