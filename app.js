/* AD Music v2.0.0 — Hybrid Cloud (R2 + Drive), Pro DJ, EQ, Offline Cache, Auth & Admin */
(() => {
  "use strict";

  const APP_VERSION = "2.0.0";
  const OFFLINE_CACHE_NAME = "ad-music-offline-audio-v1";
  const HARDCODED_API_URL = "https://script.google.com/macros/s/AKfycbwSr-j8h-BR8mgzU2c-9K0yuLokz7qcTAV8uxsW3ih8XLOADPCamdIg6OxIt7sNsZqQ/exec";
  const DEFAULT_API_URL = localStorage.getItem("admusic_api_url") || HARDCODED_API_URL;

  const EQ_PRESETS = {
    flat: [0, 0, 0, 0, 0],
    bass: [7, 4, 0, -1, 0],
    vocal: [-2, 1, 5, 4, 1],
    club: [6, 3, -1, 3, 5],
    rock: [5, 2, -1, 3, 5],
    treble: [0, 0, 1, 5, 8]
  };

  const state = {
    apiUrl: DEFAULT_API_URL,
    user: JSON.parse(localStorage.getItem("admusic_user") || "null"),
    songs: [],
    favorites: new Set(JSON.parse(localStorage.getItem("admusic_favorites") || "[]")),
    offlineIds: new Set(JSON.parse(localStorage.getItem("admusic_offline_ids") || "[]")),
    currentSong: null,
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    shuffle: false,
    repeat: false,
    liveRadio: false,
    selectedCategory: "ALL",
    searchQuery: "",
    settings: JSON.parse(localStorage.getItem("admusic_settings") || JSON.stringify({
      theme: "dark",
      accent: "#6c5ce7",
      crossfade: 2,
      visualizer: "on"
    }))
  };

  // --- DOM Helpers ---
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
    setTimeout(() => el.remove(), 3500);
  }

  // --- Hybrid Source Resolver (Cloudflare R2 Direct vs Google Drive) ---
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

  function resolveAudioSource(song) {
    const rawUrl = (song.audioUrl || song.url || "").trim();
    const explicitType = (song.sourceType || "").toUpperCase();
    const driveId = extractDriveId(rawUrl) || (song.driveId ? song.driveId.trim() : null);

    // Direct R2 / HTTP audio links skip Drive ID conversion
    if (explicitType === "R2" || (!driveId && /^https?:\/\//i.test(rawUrl))) {
      return {
        type: "R2",
        streamUrl: rawUrl,
        downloadUrl: rawUrl
      };
    }

    // Google Drive direct stream + Apps Script Base64 proxy fallback
    const id = driveId || rawUrl;
    const driveDirect = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
    const proxyUrl = state.apiUrl
      ? `${state.apiUrl}?action=stream&id=${encodeURIComponent(id)}`
      : driveDirect;

    return {
      type: "DRIVE",
      driveId: id,
      streamUrl: driveDirect,
      proxyUrl,
      downloadUrl: driveDirect
    };
  }

  // Converts Apps Script Base64 stream response into a playable Audio Blob URL
  async function fetchDriveProxyBlobUrl(proxyUrl) {
    const res = await fetch(proxyUrl);
    const text = await res.text();
    if (!text || text.trim().startsWith("{")) {
      let errMsg = "Drive file inaccessible";
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) errMsg = parsed.error;
      } catch (_) {}
      throw new Error(errMsg);
    }
    const byteChars = atob(text.trim());
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNums[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNums)], { type: "audio/mpeg" });
    return { blob, blobUrl: URL.createObjectURL(blob) };
  }

  function normalizeTitle(title) {
    return (title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  // --- Primary Audio + Web Audio EQ Engine ---
  const audio = new Audio();
  audio.preload = "metadata";
  let audioCtx = null;
  let sourceNode = null;
  let analyser = null;
  let eqFilters = [];
  let webAudioReady = false;

  function initWebAudioForMain() {
    if (webAudioReady) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      sourceNode = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      const freqs = [100, 350, 1000, 3500, 10000];
      eqFilters = freqs.map((freq, idx) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = idx === 0 ? "lowshelf" : idx === freqs.length - 1 ? "highshelf" : "peaking";
        filter.frequency.value = freq;
        filter.Q.value = 1.0;
        filter.gain.value = 0;
        return filter;
      });

      sourceNode.connect(eqFilters[0]);
      for (let i = 0; i < eqFilters.length - 1; i++) {
        eqFilters[i].connect(eqFilters[i + 1]);
      }
      eqFilters[eqFilters.length - 1].connect(analyser);
      analyser.connect(audioCtx.destination);
      webAudioReady = true;
      drawVisualizer();
    } catch (err) {
      console.warn("Web Audio EQ unavailable, using native playback:", err);
    }
  }

  function drawVisualizer() {
    const canvas = $("visualizerCanvas");
    const ctx = canvas.getContext("2d");
    const render = () => {
      requestAnimationFrame(render);
      if (state.settings.visualizer === "off" || !analyser || !state.isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      canvas.width = canvas.clientWidth || 400;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barW = canvas.width / data.length;
      data.forEach((val, i) => {
        const h = (val / 255) * canvas.height;
        ctx.fillStyle = i % 2 === 0 ? state.settings.accent : "#00cec9";
        ctx.fillRect(i * barW + 2, canvas.height - h, Math.max(2, barW - 4), h);
      });
    };
    render();
  }

  // --- API Client (Apps Script JSON POST via text/plain to avoid CORS preflight) ---
  async function apiCall(action, payload = {}) {
    if (!state.apiUrl) {
      throw new Error("Backend Web App URL is not configured in Settings.");
    }
    const body = JSON.stringify({
      action,
      token: state.user?.token || "",
      userId: state.user?.id || "",
      ...payload
    });
    const res = await fetch(state.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
    const data = await res.json();
    if (!data.ok) {
      if (data.blocked) {
        logoutUser("Your account has been blocked by an administrator.");
      }
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  // --- Auth & Session ---
  function renderAuthState() {
    if (!state.user) {
      $("authOverlay").classList.remove("hidden");
      return;
    }
    $("authOverlay").classList.add("hidden");
    $("userDisplayName").textContent = state.user.name || state.user.email;
    $("roleBadge").textContent = (state.user.role || "user").toUpperCase();
    $("adminNavBtn").classList.toggle("hidden", state.user.role !== "admin");
  }

  function logoutUser(msg) {
    state.user = null;
    localStorage.removeItem("admusic_user");
    audio.pause();
    state.isPlaying = false;
    $("playPauseBtn").textContent = "▶";
    renderAuthState();
    if (msg) toast(msg, "error");
  }

  // --- Library Loading & Filtering ---
  async function loadSongs() {
    if (!state.apiUrl || !state.user) return;
    try {
      const data = await apiCall("getSongs");
      state.songs = (data.songs || []).map((s) => ({
        ...s,
        resolved: resolveAudioSource(s)
      }));
      if (typeof data.pendingCount === "number" && state.user.role === "admin") {
        const badge = $("pendingBadge");
        badge.textContent = data.pendingCount;
        badge.classList.toggle("hidden", data.pendingCount === 0);
      }
      populateCategories();
      renderAllViews();
      populateDJSelectors();
      handleDeepLinkSong();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function handleDeepLinkSong() {
    const songId = new URLSearchParams(window.location.search).get("song");
    if (!songId || state.currentSong) return;
    const list = getFilteredSongs();
    const idx = list.findIndex((s) => s.id === songId);
    if (idx !== -1) {
      state.queue = list;
      state.currentIndex = idx;
      state.currentSong = list[idx];
      updatePlayerBar(list[idx], list[idx].resolved?.type || "R2");
    }
  }

  function populateCategories() {
    const sel = $("categoryFilter");
    const cats = [...new Set(state.songs.map((s) => s.category || "General"))].sort();
    sel.innerHTML = `<option value="ALL">All Categories</option>` +
      cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    sel.value = state.selectedCategory;
  }

  function getFilteredSongs() {
    const q = state.searchQuery.toLowerCase();
    return state.songs.filter((s) => {
      const catOk = state.selectedCategory === "ALL" || (s.category || "General") === state.selectedCategory;
      const qOk = !q || [s.title, s.artist, s.album, s.category].some((f) => (f || "").toLowerCase().includes(q));
      return catOk && qOk;
    });
  }

  function createSongRow(song, index, list) {
    const row = document.createElement("div");
    row.className = `song-row ${state.currentSong?.id === song.id ? "playing" : ""}`;
    const isFav = state.favorites.has(song.id);
    const isOffline = state.offlineIds.has(song.id);
    const srcType = song.resolved?.type || "R2";

    row.innerHTML = `
      <div class="song-thumb">${song.coverUrl ? `<img src="${escapeHtml(song.coverUrl)}" alt="" style="width:100%;height:100%;object-fit:cover">` : "🎵"}</div>
      <div class="song-info">
        <h4>${escapeHtml(song.title)}</h4>
        <p>${escapeHtml(song.artist)} &bull; ${escapeHtml(song.album || "Singles")} &bull; ${formatTime(Number(song.durationSec || 0))}</p>
      </div>
      <div class="song-actions">
        <span class="source-pill ${srcType === "DRIVE" ? "drive" : ""}">${srcType}</span>
        <button type="button" class="icon-btn fav-btn" title="Favorite">${isFav ? "❤️" : "♡"}</button>
        <button type="button" class="icon-btn dl-btn" title="Offline">${isOffline ? "✅" : "⬇️"}</button>
      </div>
    `;

    row.addEventListener("click", (e) => {
      if (e.target.closest(".fav-btn")) {
        toggleFavorite(song.id);
        return;
      }
      if (e.target.closest(".dl-btn")) {
        downloadSongOffline(song);
        return;
      }
      state.queue = list;
      playSongAtIndex(index);
    });
    return row;
  }

  function renderSongCollection(containerId, list) {
    const box = $(containerId);
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = `<p class="muted small">No tracks found.</p>`;
      return;
    }
    list.forEach((song, idx) => box.appendChild(createSongRow(song, idx, list)));
  }

  function renderAlbums() {
    const grid = $("albumGrid");
    const songBox = $("albumSongList");
    grid.classList.remove("hidden");
    songBox.classList.add("hidden");
    $("backToAlbumsBtn").classList.add("hidden");

    const map = new Map();
    state.songs.forEach((s) => {
      const key = `${s.category || "General"} / ${s.album || "Singles"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });

    grid.innerHTML = "";
    if (!map.size) {
      grid.innerHTML = `<p class="muted small">No albums available.</p>`;
      return;
    }

    map.forEach((tracks, folderName) => {
      const card = document.createElement("div");
      card.className = "album-card";
      const cover = tracks.find((t) => t.coverUrl)?.coverUrl;
      card.innerHTML = `
        <div class="album-art">${cover ? `<img src="${escapeHtml(cover)}" alt="">` : "📁"}</div>
        <h4>${escapeHtml(folderName)}</h4>
        <p class="muted small">${tracks.length} track(s)</p>
      `;
      card.addEventListener("click", () => {
        grid.classList.add("hidden");
        songBox.classList.remove("hidden");
        $("backToAlbumsBtn").classList.remove("hidden");
        renderSongCollection("albumSongList", tracks);
      });
      grid.appendChild(card);
    });
  }

  function renderAllViews() {
    const filtered = getFilteredSongs();
    $("libraryStats").textContent = `${filtered.length} approved track(s) • Hybrid R2 + Drive`;
    $("offlineStats").textContent = `${state.offlineIds.size} track(s) cached locally`;
    renderSongCollection("songList", filtered);
    renderSongCollection("favoritesList", state.songs.filter((s) => state.favorites.has(s.id)));
    renderSongCollection("offlineList", state.songs.filter((s) => state.offlineIds.has(s.id)));
    renderAlbums();
  }

  // --- Playback ---
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
      if (match) {
        const blob = await match.blob();
        playableUrl = URL.createObjectURL(blob);
      }
    }

    audio.crossOrigin = src.type === "R2" ? "anonymous" : null;
    audio.src = playableUrl;
    audio.volume = Number($("masterVolume").value);

    initWebAudioForMain();
    if (audioCtx && audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    try {
      await audio.play();
      state.isPlaying = true;
    } catch (err) {
      if (audio.crossOrigin) {
        audio.crossOrigin = null;
        audio.src = playableUrl;
        try {
          await audio.play();
          state.isPlaying = true;
        } catch (_) {}
      }

      if (!state.isPlaying && src.proxyUrl && playableUrl !== src.proxyUrl) {
        try {
          toast("Loading via Drive stream proxy...", "info");
          const { blobUrl } = await fetchDriveProxyBlobUrl(src.proxyUrl);
          audio.crossOrigin = null;
          audio.src = blobUrl;
          await audio.play();
          state.isPlaying = true;
        } catch (proxyErr) {
          toast("Unable to play audio source: " + proxyErr.message, "error");
        }
      } else if (!state.isPlaying) {
        toast("Playback failed: " + err.message, "error");
      }
    }

    updatePlayerBar(song, src.type);
    renderAllViews();
    updateUrlHash(song.id);
  }

  function updatePlayerBar(song, srcType) {
    $("playerTitle").textContent = song.title;
    $("playerArtist").textContent = `${song.artist} • ${song.album || "Singles"}`;
    $("sourceTypeBadge").textContent = srcType;
    $("sourceTypeBadge").className = `source-pill ${srcType === "DRIVE" ? "drive" : ""}`;
    $("playPauseBtn").textContent = state.isPlaying ? "⏸" : "▶";
    $("playerFavBtn").textContent = state.favorites.has(song.id) ? "❤️" : "♡";

    if (song.coverUrl) {
      $("playerCover").src = song.coverUrl;
      $("playerCover").classList.remove("hidden");
      $("playerCoverFallback").classList.add("hidden");
    } else {
      $("playerCover").classList.add("hidden");
      $("playerCoverFallback").classList.remove("hidden");
    }
  }

  function updateUrlHash(songId) {
    const url = new URL(window.location.href);
    url.searchParams.set("song", songId);
    window.history.replaceState({}, "", url.toString());
  }

  function nextTrack() {
    if (!state.queue.length) return;
    if (state.shuffle || state.liveRadio) {
      const nextIdx = Math.floor(Math.random() * state.queue.length);
      playSongAtIndex(nextIdx);
      return;
    }
    playSongAtIndex(state.currentIndex + 1);
  }

  function prevTrack() {
    if (!state.queue.length) return;
    playSongAtIndex(state.currentIndex - 1);
  }

  // --- Favorites & Offline Cache ---
  function toggleFavorite(songId) {
    if (state.favorites.has(songId)) state.favorites.delete(songId);
    else state.favorites.add(songId);
    localStorage.setItem("admusic_favorites", JSON.stringify([...state.favorites]));
    if (state.currentSong?.id === songId) {
      $("playerFavBtn").textContent = state.favorites.has(songId) ? "❤️" : "♡";
    }
    renderAllViews();
  }

  async function downloadSongOffline(song) {
    const src = song.resolved || resolveAudioSource(song);
    if (!("caches" in window)) {
      toast("Offline Cache API not supported in this browser.", "error");
      return;
    }
    try {
      toast(`Caching "${song.title}" for offline use...`);
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      if (src.type === "DRIVE" && src.proxyUrl) {
        const { blob } = await fetchDriveProxyBlobUrl(src.proxyUrl);
        await cache.put(src.streamUrl, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
      } else {
        const res = await fetch(src.downloadUrl);
        if (!res.ok) throw new Error("Network response not ok");
        await cache.put(src.streamUrl, res);
      }
      state.offlineIds.add(song.id);
      localStorage.setItem("admusic_offline_ids", JSON.stringify([...state.offlineIds]));
      renderAllViews();
      toast(`Saved "${song.title}" offline!`, "success");
    } catch (err) {
      toast("Offline save failed: " + err.message, "error");
    }
  }

  async function clearOfflineCache() {
    if ("caches" in window) {
      await caches.delete(OFFLINE_CACHE_NAME);
    }
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "CLEAR_AUDIO_CACHE" });
    }
    state.offlineIds.clear();
    localStorage.setItem("admusic_offline_ids", "[]");
    renderAllViews();
    toast("Offline audio cache cleared.", "success");
  }

  // --- Pro DJ Dual-Deck Engine + Realistic Scratch Synthesis ---
  const decks = {
    A: { audio: new Audio(), playing: false, angle: 0, song: null, vol: 1 },
    B: { audio: new Audio(), playing: false, angle: 0, song: null, vol: 1 }
  };
  let djCtx = null;

  function ensureDjAudioCtx() {
    if (!djCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      djCtx = new Ctx();
    }
    if (djCtx.state === "suspended") djCtx.resume();
  }

  function playScratchSound(velocity) {
    try {
      ensureDjAudioCtx();
      const duration = 0.07;
      const bufferSize = Math.floor(djCtx.sampleRate * duration);
      const buffer = djCtx.createBuffer(1, bufferSize, djCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
      }
      const noise = djCtx.createBufferSource();
      noise.buffer = buffer;

      const filter = djCtx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = Math.min(2600, Math.max(450, 900 + Math.abs(velocity) * 24));
      filter.Q.value = 3.2;

      const gain = djCtx.createGain();
      gain.gain.setValueAtTime(0.18, djCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, djCtx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(djCtx.destination);
      noise.start();
    } catch (_) {}
  }

  function applyDjCrossfader() {
    const x = Number($("djCrossfader").value);
    const gainA = Math.cos(x * 0.5 * Math.PI);
    const gainB = Math.cos((1 - x) * 0.5 * Math.PI);
    decks.A.audio.volume = Math.min(1, decks.A.vol * gainA);
    decks.B.audio.volume = Math.min(1, decks.B.vol * gainB);
    $("crossfaderVal").textContent = `${Math.round((1 - x) * 100)} / ${Math.round(x * 100)}`;
  }

  function populateDJSelectors() {
    const opts = `<option value="">-- Select Track --</option>` +
      state.songs.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.title)} — ${escapeHtml(s.artist)}</option>`).join("");
    $("deckASelect").innerHTML = opts;
    $("deckBSelect").innerHTML = opts;
  }

  function loadDeck(deckKey, songId) {
    const song = state.songs.find((s) => s.id === songId);
    if (!song) return;
    const deck = decks[deckKey];
    const src = song.resolved || resolveAudioSource(song);
    deck.song = song;
    deck.audio.src = src.streamUrl;
    deck.playing = false;
    $(`deck${deckKey}TrackTitle`).textContent = `${song.title} — ${song.artist}`;
    $(`deck${deckKey}Label`).textContent = song.title.slice(0, 10).toUpperCase();
    $(`deck${deckKey}PlayBtn`).textContent = "▶ Play";
    applyDjCrossfader();
  }

  function bindTurntableScratch(deckKey) {
    const platter = $(`platter${deckKey}`);
    let dragging = false;
    let lastX = 0;

    const onStart = (clientX) => {
      dragging = true;
      lastX = clientX;
      ensureDjAudioCtx();
    };
    const onMove = (clientX) => {
      if (!dragging) return;
      const dx = clientX - lastX;
      lastX = clientX;
      if (Math.abs(dx) < 1) return;
      const deck = decks[deckKey];
      deck.angle += dx * 1.8;
      platter.style.transform = `rotate(${deck.angle}deg)`;
      if (Number.isFinite(deck.audio.duration)) {
        deck.audio.currentTime = Math.max(0, Math.min(deck.audio.duration, deck.audio.currentTime + dx * 0.03));
      }
      playScratchSound(dx);
    };
    const onEnd = () => { dragging = false; };

    platter.addEventListener("mousedown", (e) => onStart(e.clientX));
    window.addEventListener("mousemove", (e) => onMove(e.clientX));
    window.addEventListener("mouseup", onEnd);

    platter.addEventListener("touchstart", (e) => onStart(e.touches[0].clientX), { passive: true });
    platter.addEventListener("touchmove", (e) => onMove(e.touches[0].clientX), { passive: true });
    platter.addEventListener("touchend", onEnd);
  }

  setInterval(() => {
    ["A", "B"].forEach((k) => {
      if (decks[k].playing && !decks[k].audio.paused) {
        decks[k].angle = (decks[k].angle + 3 * decks[k].audio.playbackRate) % 360;
        $(`platter${k}`).style.transform = `rotate(${decks[k].angle}deg)`;
      }
    });
  }, 30);

  // --- Upload Rules & Probe ---
  function probeAudioDuration(url) {
    return new Promise((resolve, reject) => {
      const probe = new Audio();
      probe.preload = "metadata";
      const timer = setTimeout(() => reject(new Error("Timed out reading audio metadata")), 10000);
      probe.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve(Math.round(probe.duration));
      };
      probe.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Could not inspect audio URL metadata"));
      };
      probe.src = url;
    });
  }

  // --- Admin Dashboard ---
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
          <div class="muted small">${escapeHtml(s.artist)} • ${escapeHtml(s.category)}/${escapeHtml(s.album)} • ${s.durationSec}s (${escapeHtml(s.sourceType)})</div>
        </div>
        <div class="inline-row">
          <button type="button" class="btn btn-green approve-btn">Approve</button>
          <button type="button" class="btn btn-danger reject-btn">Reject</button>
        </div>
      `;
      item.querySelector(".approve-btn").onclick = async () => {
        await apiCall("reviewSong", { songId: s.id, decision: "Approved" });
        toast("Song approved!", "success");
        loadAdminData();
        loadSongs();
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
        ${c.active ? `<button type="button" class="btn btn-danger revoke-btn">Revoke</button>` : ""}
      `;
      const btn = item.querySelector(".revoke-btn");
      if (btn) {
        btn.onclick = async () => {
          await apiCall("revokeAccessCode", { code: c.code });
          toast("Access code revoked.", "info");
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
          <div class="muted small">Role: ${escapeHtml(u.role)} • Status: ${u.blocked ? "BLOCKED" : "Active"}</div>
        </div>
        <button type="button" class="btn ${u.blocked ? "btn-green" : "btn-danger"} toggle-block-btn">
          ${u.blocked ? "Unblock" : "Block"}
        </button>
      `;
      item.querySelector(".toggle-block-btn").onclick = async () => {
        await apiCall("setUserBlock", { targetUserId: u.id, blocked: !u.blocked });
        toast(`User ${u.blocked ? "unblocked" : "blocked"}.`, "success");
        loadAdminData();
      };
      box.appendChild(item);
    });
  }

  // --- Version & Update Checker ---
  async function checkUpdates() {
    $("versionCheckStatus").textContent = "Checking remote version...";
    try {
      const data = await apiCall("getVersion");
      const remote = data.version || APP_VERSION;
      if (remote !== APP_VERSION) {
        $("remoteVersionText").textContent = `v${remote}`;
        $("updateBanner").classList.remove("hidden");
        $("versionCheckStatus").textContent = `Update available: v${remote} (current v${APP_VERSION})`;
      } else {
        $("versionCheckStatus").textContent = `You are up to date (v${APP_VERSION}).`;
      }
    } catch (err) {
      $("versionCheckStatus").textContent = "Version check failed: " + err.message;
    }
  }

  async function applyUpdateNow() {
    toast("Clearing Service Worker caches and updating...", "info");
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k !== OFFLINE_CACHE_NAME).map((k) => caches.delete(k))
        );
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          if (reg.waiting) reg.waiting.postMessage({ type: "FORCE_UPDATE" });
          await reg.update();
        }
      }
    } catch (_) {}
    window.location.reload();
  }

  // --- Settings & Theme ---
  function applySettings() {
    document.documentElement.setAttribute("data-theme", state.settings.theme);
    document.documentElement.style.setProperty("--accent", state.settings.accent);
    $("settingTheme").value = state.settings.theme;
    $("settingAccent").value = state.settings.accent;
    $("settingCrossfade").value = state.settings.crossfade;
    $("settingCrossfadeVal").textContent = state.settings.crossfade;
    $("settingVisualizer").value = state.settings.visualizer;
    $("settingApiUrl").value = state.apiUrl;
    $("visualizerWrap").classList.toggle("hidden", state.settings.visualizer === "off");
    localStorage.setItem("admusic_settings", JSON.stringify(state.settings));
  }

  // --- Event Bindings ---
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

    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const isLogin = tab.dataset.authTab === "login";
        $("loginForm").classList.toggle("hidden", !isLogin);
        $("registerForm").classList.toggle("hidden", isLogin);
      });
    });

    $("guestConfigBtn").onclick = () => {
      const url = prompt("Enter Google Apps Script Web App URL:", state.apiUrl);
      if (url !== null) {
        state.apiUrl = url.trim();
        localStorage.setItem("admusic_api_url", state.apiUrl);
        $("settingApiUrl").value = state.apiUrl;
        toast("Backend URL saved.", "success");
      }
    };

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
        loadSongs();
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
        loadSongs();
        toast("Registration successful!", "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };

    $("searchInput").oninput = (e) => { state.searchQuery = e.target.value; renderAllViews(); };
    $("categoryFilter").onchange = (e) => { state.selectedCategory = e.target.value; renderAllViews(); };
    $("refreshLibraryBtn").onclick = loadSongs;
    $("backToAlbumsBtn").onclick = renderAlbums;

    $("playPauseBtn").onclick = async () => {
      if (!state.currentSong) {
        if (state.songs.length) {
          state.queue = getFilteredSongs();
          playSongAtIndex(0);
        }
        return;
      }
      if (audio.paused) {
        await audio.play();
        state.isPlaying = true;
      } else {
        audio.pause();
        state.isPlaying = false;
      }
      $("playPauseBtn").textContent = state.isPlaying ? "⏸" : "▶";
    };

    $("nextBtn").onclick = nextTrack;
    $("prevBtn").onclick = prevTrack;
    $("shuffleBtn").onclick = () => {
      state.shuffle = !state.shuffle;
      $("shuffleBtn").classList.toggle("active", state.shuffle);
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
        state.queue = state.songs;
        playSongAtIndex(Math.floor(Math.random() * state.songs.length));
      }
      toast(state.liveRadio ? "Live Radio Mode ON" : "Live Radio Mode OFF");
    };

    $("masterVolume").oninput = (e) => { audio.volume = Number(e.target.value); };
    $("seekBar").oninput = (e) => {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = (Number(e.target.value) / 100) * audio.duration;
      }
    };
    audio.ontimeupdate = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      $("seekBar").value = (audio.currentTime / audio.duration) * 100;
      $("currentTimeLabel").textContent = formatTime(audio.currentTime);
      $("durationLabel").textContent = formatTime(audio.duration);
    };
    audio.onended = () => { if (!state.repeat) nextTrack(); };

    $("playerFavBtn").onclick = () => { if (state.currentSong) toggleFavorite(state.currentSong.id); };
    $("downloadOfflineBtn").onclick = () => { if (state.currentSong) downloadSongOffline(state.currentSong); };
    $("shareSongBtn").onclick = () => {
      navigator.clipboard?.writeText(window.location.href);
      toast("Online song link copied!", "success");
    };

    // Equalizer
    const eqIds = ["eqBass", "eqLowMid", "eqMid", "eqHighMid", "eqTreble"];
    const eqValIds = ["eqBassVal", "eqLowMidVal", "eqMidVal", "eqHighMidVal", "eqTrebleVal"];
    eqIds.forEach((id, idx) => {
      $(id).oninput = (e) => {
        const val = Number(e.target.value);
        $(eqValIds[idx]).textContent = `${val} dB`;
        if (eqFilters[idx]) eqFilters[idx].gain.value = val;
      };
    });
    $("eqPresetSelect").onchange = (e) => {
      const preset = EQ_PRESETS[e.target.value] || EQ_PRESETS.flat;
      preset.forEach((val, idx) => {
        $(eqIds[idx]).value = val;
        $(eqValIds[idx]).textContent = `${val} dB`;
        if (eqFilters[idx]) eqFilters[idx].gain.value = val;
      });
    };

    // DJ Mode
    $("djToggleActiveBtn").onclick = () => {
      ensureDjAudioCtx();
      audio.pause();
      state.isPlaying = false;
      $("playPauseBtn").textContent = "▶";
      toast("Pro DJ Dual-Deck Engine Ready!", "success");
    };
    ["A", "B"].forEach((k) => {
      $(`deck${k}Select`).onchange = (e) => loadDeck(k, e.target.value);
      $(`deck${k}PlayBtn`).onclick = async () => {
        const d = decks[k];
        if (!d.song) return toast(`Load a track into Deck ${k} first.`, "error");
        ensureDjAudioCtx();
        if (d.audio.paused) {
          try {
            await d.audio.play();
          } catch (_) {
            const src = d.song.resolved || resolveAudioSource(d.song);
            if (src.proxyUrl) {
              const { blobUrl } = await fetchDriveProxyBlobUrl(src.proxyUrl);
              d.audio.src = blobUrl;
              await d.audio.play();
            }
          }
          d.playing = true;
          $(`deck${k}PlayBtn`).textContent = "⏸ Pause";
        } else {
          d.audio.pause();
          d.playing = false;
          $(`deck${k}PlayBtn`).textContent = "▶ Play";
        }
      };
      $(`deck${k}CueBtn`).onclick = () => { decks[k].audio.currentTime = 0; };
      $(`deck${k}Pitch`).oninput = (e) => {
        const rate = Number(e.target.value);
        decks[k].audio.playbackRate = rate;
        $(`deck${k}PitchVal`).textContent = `${rate.toFixed(2)}x`;
      };
      $(`deck${k}Vol`).oninput = (e) => {
        decks[k].vol = Number(e.target.value);
        $(`deck${k}VolVal`).textContent = `${Math.round(decks[k].vol * 100)}%`;
        applyDjCrossfader();
      };
      bindTurntableScratch(k);
    });
    $("djCrossfader").oninput = applyDjCrossfader;

    // Upload Form + Strict Frontend Validation
    $("uploadSourceType").onchange = (e) => {
      const isR2 = e.target.value === "R2";
      $("audioSourceLabel").textContent = isR2
        ? "Cloudflare R2 Public Audio URL"
        : "Google Drive Share Link or File ID";
      $("uploadSourceUrl").placeholder = isR2
        ? "https://pub-xxxx.r2.dev/song.mp3"
        : "https://drive.google.com/file/d/.../view";
    };

    $("probeDurationBtn").onclick = async () => {
      const raw = $("uploadSourceUrl").value.trim();
      const srcType = $("uploadSourceType").value;
      if (!raw) return toast("Enter an audio URL first.", "error");
      const resolved = resolveAudioSource({ audioUrl: raw, sourceType: srcType });
      try {
        const sec = await probeAudioDuration(resolved.streamUrl);
        $("uploadDuration").value = sec;
        if (sec > 600) toast(`Duration is ${sec}s (> 600s limit)!`, "error");
        else toast(`Verified audio duration: ${sec}s`, "success");
      } catch (err) {
        toast(err.message, "error");
      }
    };

    $("uploadForm").onsubmit = async (e) => {
      e.preventDefault();
      const title = $("uploadTitle").value.trim();
      const durationSec = Number($("uploadDuration").value);

      const norm = normalizeTitle(title);
      if (state.songs.some((s) => normalizeTitle(s.title) === norm)) {
        return toast("Duplicate rejected: A song with this title already exists.", "error");
      }
      if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 600) {
        return toast("Duration rejected: Tracks must be between 1 and 600 seconds (10 minutes).", "error");
      }

      try {
        $("uploadStatusMsg").textContent = "Submitting track...";
        await apiCall("uploadSong", {
          sourceType: $("uploadSourceType").value,
          audioUrl: $("uploadSourceUrl").value.trim(),
          title,
          artist: $("uploadArtist").value.trim(),
          album: $("uploadAlbum").value.trim(),
          category: $("uploadCategory").value.trim(),
          coverUrl: $("uploadCoverUrl").value.trim(),
          durationSec
        });
        $("uploadForm").reset();
        $("uploadStatusMsg").textContent = "Submitted! Pending Admin Approval.";
        toast("Upload submitted for Admin Approval!", "success");
      } catch (err) {
        $("uploadStatusMsg").textContent = err.message;
        toast(err.message, "error");
      }
    };

    // Admin actions
    $("adminRefreshBtn").onclick = loadAdminData;
    $("createCodeForm").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const res = await apiCall("createAccessCode", {
          role: $("newCodeRole").value,
          maxUses: Number($("newCodeMaxUses").value)
        });
        toast(`Generated code: ${res.code}`, "success");
        loadAdminData();
      } catch (err) {
        toast(err.message, "error");
      }
    };

    // Settings, Theme, Cache & Update
    $("themeToggleBtn").onclick = () => {
      state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
      applySettings();
    };
    $("settingTheme").onchange = (e) => { state.settings.theme = e.target.value; applySettings(); };
    $("settingAccent").oninput = (e) => { state.settings.accent = e.target.value; applySettings(); };
    $("settingCrossfade").oninput = (e) => { state.settings.crossfade = Number(e.target.value); applySettings(); };
    $("settingVisualizer").onchange = (e) => { state.settings.visualizer = e.target.value; applySettings(); };

    $("saveApiUrlBtn").onclick = () => {
      state.apiUrl = $("settingApiUrl").value.trim();
      localStorage.setItem("admusic_api_url", state.apiUrl);
      toast("Google Apps Script URL saved!", "success");
      if (state.user) loadSongs();
    };

    $("clearOfflineBtn").onclick = clearOfflineCache;
    $("settingsClearCacheBtn").onclick = clearOfflineCache;
    $("checkUpdatesBtn").onclick = checkUpdates;
    $("updateNowBtn").onclick = applyUpdateNow;
    $("bannerUpdateNowBtn").onclick = applyUpdateNow;
    $("logoutBtn").onclick = () => logoutUser("Signed out.");
    $("userBadgeBtn").onclick = () => {
      document.querySelector('[data-view="settingsView"]').click();
    };
  }

  // --- Service Worker Registration ---
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "UPDATE_READY") {
        window.location.reload();
      }
    });
  }

  // --- Init ---
  function init() {
    applySettings();
    bindEvents();
    renderAuthState();
    registerServiceWorker();
    if (state.user && state.apiUrl) {
      loadSongs();
      checkUpdates();
    }
  }

  init();
})();
