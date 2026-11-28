/**
 * AD Music PWA — Clean Modular Engine (v4.5 + Dedicated Radio Audio & Reactor Mode Switch)
 * Features: .webm + .webp fast rendering, 100-200% Auto-Unlock Boost, RAM Preload (Next 2),
 * Smart 2s Silence Auto-Skip, 10-Band Web Audio EQ, Quota-Safe LocalStorage, Admin Controls, Live FM Radio
 */

const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwSr-j8h-BR8mgzU2c-9K0yuLokz7qcTAV8uxsW3ih8XLOADPCamdIg6OxIt7sNsZqQ/exec";

const DEFAULT_RADIOS = [
  { id: "rad_1", name: "Radio City Hindi", genre: "Bollywood Hindi", streamUrl: "https://stream.zeno.fm/9phrkb1e3v8uv", active: true },
  { id: "rad_2", name: "Radio Mirchi 98.3 FM", genre: "Bollywood Chartbusters", streamUrl: "https://stream.zeno.fm/wgaznsmt92quv", active: true },
  { id: "rad_3", name: "Ishq FM", genre: "Bollywood Romantic", streamUrl: "https://drive.uber.radio/uber/bollywoodlove/icecast.audio", active: true },
  { id: "rad_4", name: "AIR FM Rainbow Delhi", genre: "Hindi & Bollywood", streamUrl: "https://radioindia.net/in/fmrainbowdelhi/icecast.audio", active: true },
  { id: "rad_5", name: "AIR FM Gold Delhi", genre: "Hindi News & Hits", streamUrl: "https://new.radiosolo.ru/in/fmgolddelhi/icecast.audio", active: true },
  { id: "rad_6", name: "90s Bollywood Retro", genre: "Evergreen Old Hits", streamUrl: "https://stream.zeno.fm/f3wvbbqmdg8uv", active: true },
  { id: "rad_7", name: "Red FM / Desi Hits", genre: "Non-Stop Hindi", streamUrl: "https://stream.zeno.fm/0r0xa792kwzuv", active: true },
  { id: "rad_8", name: "Bangla Live FM", genre: "Bengali Hits", streamUrl: "https://stream.zeno.fm/dbstwo3dvhhtv", active: true },
  { id: "rad_9", name: "Tamil FM", genre: "Tamil Hits", streamUrl: "https://radios.crabdance.com:8002/5", active: true },
  { id: "rad_10", name: "Suryan FM", genre: "Tamil Chartbusters", streamUrl: "https://radios.crabdance.com:8002/2", active: true },
  { id: "rad_11", name: "94.3 Club FM", genre: "Malayalam Hits", streamUrl: "https://strw3.openstream.co/1452", active: true },
  { id: "rad_12", name: "Mohammed Rafi Radio", genre: "Retro Legend", streamUrl: "https://stream.zeno.fm/2xx62x8ztm0uv", active: true },
  { id: "rad_13", name: "Kishore Kumar Radio", genre: "Retro Legend", streamUrl: "https://stream.zeno.fm/0ghtfp8ztm0uv", active: true },
  { id: "rad_14", name: "Radio Lata Mangeshkar", genre: "Retro Legend", streamUrl: "https://stream.zeno.fm/87xam8pf7tzuv", active: true },
  { id: "rad_15", name: "Hits Of Bollywood", genre: "Bollywood Hits", streamUrl: "https://stream.zeno.fm/a2gyqzwpwfeuv", active: true },
  { id: "rad_16", name: "New Hits of Bollywood", genre: "Latest Bollywood", streamUrl: "https://stream.zeno.fm/rqqps6cbe3quv", active: true },
  { id: "rad_17", name: "Radio Hungama Evergreen Bollywood", genre: "Evergreen Hindi", streamUrl: "https://server.mixify.in:8010/radio.mp3", active: true },
  { id: "rad_18", name: "Non Stop Hindi Radio", genre: "Bollywood Non-Stop", streamUrl: "https://s5.voscast.com:8217/stream", active: true },
  { id: "rad_19", name: "Radio Hungama 90s Once Again", genre: "90s Bollywood", streamUrl: "https://stream.zeno.fm/rm4i9pdex3cuv", active: true },
  { id: "rad_20", name: "Radio Retro Bollywood", genre: "Retro Hits", streamUrl: "https://stream.zeno.fm/g372rxef798uv", active: true },
  { id: "rad_21", name: "Bollywood Radio and Beyond", genre: "Bollywood & Indie", streamUrl: "https://s6.yesstreaming.net/proxy/john1237?mp=/live", active: true },
  { id: "rad_22", name: "Hindi Desi Bollywood Evergreen Hits", genre: "Evergreen Hits", streamUrl: "https://cast2.asurahosting.com/proxy/hindides/stream", active: true },
  { id: "rad_23", name: "Hindi Desi Bollywood Evergreen Hits - Ch 2", genre: "Evergreen Hits Ch 2", streamUrl: "https://eu1.reliastream.com/proxy/hindi?mp=/stream", active: true },
  { id: "rad_24", name: "Telugu NRI Radio", genre: "Telugu Hits", streamUrl: "https://cast5.asurahosting.com:2199/proxy/telugunr?mp=/stream", active: true },
  { id: "rad_25", name: "Kiss FM", genre: "English / Pop", streamUrl: "https://srv02.onlineradio.voaplus.com/kissfm", active: true },
  { id: "rad_26", name: "Gold FM Live", genre: "Classic English Hits", streamUrl: "https://radio.lotustechnologieslk.net:2020/stream/goldfmgarden", active: true }
];

const state = {
  user: JSON.parse(localStorage.getItem("admusic_user") || "null"),
  songs: [],
  filteredSongs: [],
  radios: [...DEFAULT_RADIOS],
  currentIndex: -1,
  lastSongIndex: 0,
  isRadioMode: false,
  radioIndex: -1,
  isPlaying: false,
  shuffle: false,
  loop: false,
  favorites: new Set(JSON.parse(localStorage.getItem("admusic_favs") || "[]")),
  offlineIds: new Set(JSON.parse(localStorage.getItem("admusic_offline_ids") || "[]")),
  subTab: "all",
  selectedAlbum: null,
  blobCache: new Map(), // RAM cache for next 2 tracks
  silenceCounter: 0
};

// Audio & Web Audio DSP Nodes
const audio = new Audio();
audio.crossOrigin = "anonymous";
const radioAudio = new Audio(); // Dedicated clean audio engine for Live FM Radio (avoids Web Audio CORS mute)

let audioCtx, sourceNode, gainNode, compressorNode, analyserNode;
const eqFilters = [];
const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_LABELS = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
const EQ_PRESETS = {
  normal: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  dance: [5, 4, 2, 0, -1, 1, 3, 4, 4, 3],
  folk: [3, 2, 0, 1, 2, 1, 0, 2, 3, 2],
  hiphop: [6, 5, 3, 1, -1, -1, 1, 2, 3, 3],
  pop: [-1, 1, 3, 4, 3, 1, -1, 1, 3, 4]
};

/* ==================== INITIALIZATION ==================== */
document.addEventListener("DOMContentLoaded", () => {
  initEQUI();
  bindEvents();
  renderRadioList();
  const savedAccent = localStorage.getItem("admusic_accent");
  if (savedAccent) setAccentColor(savedAccent);

  if (!state.user) {
    document.getElementById("authScreen").classList.remove("hidden");
  } else {
    renderProfile();
    loadSongs();
  }
});

function initAudioGraph() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaElementSource(audio);
  gainNode = audioCtx.createGain();
  compressorNode = audioCtx.createDynamicsCompressor();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 256;

  let prev = sourceNode;
  EQ_FREQS.forEach(freq => {
    const f = audioCtx.createBiquadFilter();
    f.type = "peaking";
    f.frequency.value = freq;
    f.Q.value = 1.4;
    f.gain.value = 0;
    prev.connect(f);
    prev = f;
    eqFilters.push(f);
  });

  prev.connect(compressorNode);
  compressorNode.connect(gainNode);
  gainNode.connect(analyserNode);
  analyserNode.connect(audioCtx.destination);
}

/* ==================== JSONP HELPER (CORS-SAFE) ==================== */
function jsonpRequest(url) {
  return new Promise((resolve, reject) => {
    const cbName = "ad_cb_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    const script = document.createElement("script");
    window[cbName] = data => {
      delete window[cbName];
      script.remove();
      resolve(data);
    };
    script.onerror = () => {
      delete window[cbName];
      script.remove();
      reject(new Error("JSONP request failed"));
    };
    script.src = `${url}&callback=${cbName}`;
    document.body.appendChild(script);
  });
}

/* ==================== AUTH & LIBRARY LOADING ==================== */
async function handleAuth() {
  const email = document.getElementById("authEmail").value.trim();
  const name = document.getElementById("authName").value.trim();
  const accessCode = document.getElementById("authCode").value.trim();
  const errEl = document.getElementById("authError");
  errEl.textContent = "";

  try {
    const res = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      body: JSON.stringify({ action: "auth", email, name, accessCode })
    });
    const data = await res.json();
    if (!data.ok) {
      errEl.textContent = data.error || "Sign in failed";
      return;
    }
    state.user = data.user;
    localStorage.setItem("admusic_user", JSON.stringify(data.user));
    document.getElementById("authScreen").classList.add("hidden");
    renderProfile();
    loadSongs();
  } catch (e) {
    errEl.textContent = "Network error. Check Apps Script URL.";
  }
}

async function loadSongs() {
  const cached = localStorage.getItem("admusic_songs_meta");
  if (cached) {
    try {
      state.songs = JSON.parse(cached);
      renderLibrary();
    } catch (_) {}
  }

  try {
    const url = `${GAS_WEBAPP_URL}?action=getLibrary&email=${encodeURIComponent(state.user.email)}`;
    const data = await jsonpRequest(url);
    if (!data.ok) {
      if (data.error && data.error.includes("Unauthorized")) signOut();
      return;
    }
    state.songs = data.songs || [];
    if (Array.isArray(data.radios) && data.radios.length > 0) {
      const sheetRadios = data.radios.filter(r => r.active !== false);
      const sheetUrls = new Set(sheetRadios.map(r => (r.streamUrl || r.url || "").trim()));
      const extraDefaults = DEFAULT_RADIOS.filter(d => !sheetUrls.has(d.streamUrl.trim()));
      state.radios = [...sheetRadios, ...extraDefaults];
    }
    saveSongsCacheSafely(state.songs);
    renderLibrary();
    renderRadioList();
    if (state.user.role === "ADMIN") loadAdminData();
  } catch (e) {
    showToast("Offline mode: Loaded cached tracks");
  }
}

function saveSongsCacheSafely(songs) {
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith("admusic_cached_songs_")) localStorage.removeItem(k);
  });
  const compact = songs.map(s => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    album: cleanAlbumName(s.album),
    sourceType: s.sourceType,
    fileId: s.fileId,
    audioUrl: s.sourceType === "CLOUD" ? s.audioUrl : "",
    coverUrl: s.coverUrl
  }));
  try {
    localStorage.setItem("admusic_songs_meta", JSON.stringify(compact));
  } catch (e) {
    console.warn("Storage quota tight, skipping metadata cache.");
  }
}

/* ==================== PLAYBACK, RAM PRELOAD & SILENCE SKIP ==================== */
async function resolveAudioSrc(song) {
  if (!song) return "";
  if (state.offlineIds.has(song.id) && "caches" in window) {
    const cache = await caches.open("admusic-offline-v1");
    const match = await cache.match(`/offline-track/${song.id}`);
    if (match) {
      const blob = await match.blob();
      return URL.createObjectURL(blob);
    }
  }
  if (state.blobCache.has(song.id)) {
    return state.blobCache.get(song.id);
  }
  if (song.sourceType === "CLOUD" && song.audioUrl) return song.audioUrl;

  const url = `${GAS_WEBAPP_URL}?action=streamAudio&email=${encodeURIComponent(state.user.email)}&fileId=${encodeURIComponent(song.fileId)}`;
  const data = await jsonpRequest(url);
  if (!data.ok) throw new Error(data.error || "Stream failed");

  const byteChars = atob(data.base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNums)], { type: data.mimeType || "audio/webm" });
  const blobUrl = URL.createObjectURL(blob);
  state.blobCache.set(song.id, blobUrl);
  return blobUrl;
}

async function playSongAtIndex(idx) {
  if (idx < 0 || idx >= state.songs.length) return;
  initAudioGraph();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  // Stop radio cleanly
  radioAudio.pause();
  radioAudio.src = "";

  state.currentIndex = idx;
  state.lastSongIndex = idx;
  state.isRadioMode = false;
  state.radioIndex = -1;
  syncModeSwitchUI(false);
  audio.crossOrigin = "anonymous";
  state.silenceCounter = 0;
  const song = state.songs[idx];

  document.getElementById("playerTitle").textContent = song.title;
  document.getElementById("playerArtist").textContent = `${song.artist} • ${cleanAlbumName(song.album)}`;
  updateCoverDisplay(song);
  updateUtilityStates(song);
  renderLibrary();
  renderRadioList();

  try {
    const src = await resolveAudioSrc(song);
    audio.src = src;
    await audio.play();
    setPlayingState(true);
    preloadNextTwo(idx);
  } catch (err) {
    showToast("Playback error: " + err.message);
    setPlayingState(false);
  }
}

function preloadNextTwo(currentIdx) {
  const toggle = document.getElementById("preloadToggle");
  if (!toggle || !toggle.checked || !state.songs.length) return;
  [1, 2].forEach(offset => {
    const nextIdx = (currentIdx + offset) % state.songs.length;
    const nextSong = state.songs[nextIdx];
    if (nextSong && !state.blobCache.has(nextSong.id)) {
      resolveAudioSrc(nextSong).catch(() => {});
    }
  });
}

function updateCoverDisplay(song) {
  const img = document.getElementById("playerCoverImg");
  const fb = document.getElementById("playerCoverFallback");
  fb.textContent = (song.title || "AD").slice(0, 2).toUpperCase();

  if (song.coverUrl) {
    img.style.display = "block";
    fb.style.display = "none";
    img.src = song.coverUrl;
    img.onerror = () => {
      img.style.display = "none";
      fb.style.display = "flex";
    };
  } else {
    img.style.display = "none";
    fb.style.display = "flex";
  }
}

function setPlayingState(playing) {
  state.isPlaying = playing;
  const btn = document.getElementById("playPauseBtn");
  if (btn) btn.classList.toggle("playing", playing);
  renderRadioList();
}

/* ==================== LIVE FM RADIO ENGINE & MODE SWITCH ==================== */
function syncModeSwitchUI(isRadio) {
  const toggle = document.getElementById("modeReactorToggle");
  const lblMusic = document.getElementById("modeLblMusic");
  const lblRadio = document.getElementById("modeLblRadio");
  if (toggle) toggle.checked = !!isRadio;
  if (lblMusic) lblMusic.classList.toggle("active", !isRadio);
  if (lblRadio) {
    lblRadio.classList.toggle("active", !!isRadio);
    lblRadio.classList.toggle("radio-on", !!isRadio);
  }
}

function renderRadioList() {
  const box = document.getElementById("radioListContainer");
  if (!box) return;
  const q = (document.getElementById("radioSearchInput")?.value || "").toLowerCase().trim();
  const list = state.radios.length ? state.radios : DEFAULT_RADIOS;

  const countBadge = document.getElementById("radioCountBadge");
  if (countBadge) countBadge.textContent = `${list.length} Stations`;

  box.innerHTML = "";
  list.forEach((rad, idx) => {
    if (q && !rad.name.toLowerCase().includes(q) && !(rad.genre || "").toLowerCase().includes(q)) return;

    const isActive = state.isRadioMode && state.radioIndex === idx;
    const row = document.createElement("div");
    row.className = "track-item" + (isActive ? " now-active" : "");
    row.style.cssText = `
      display:flex; justify-content:space-between; align-items:center;
      padding:11px 14px; border-radius:14px; cursor:pointer;
      background:${isActive ? "rgba(168,85,247,0.18)" : "rgba(255,255,255,0.04)"};
      border:1px solid ${isActive ? "#a855f7" : "rgba(255,255,255,0.08)"};
    `;
    row.innerHTML = `
      <div class="item-info">
        <div class="item-title">📻 ${rad.name}</div>
        <div class="item-sub">${rad.genre || "Live FM"}</div>
      </div>
      <div class="item-actions">
        <button class="mini-btn">${isActive && !radioAudio.paused ? "❚❚" : "▶"}</button>
      </div>
    `;
    row.onclick = () => playRadioAtIndex(idx);
    box.appendChild(row);
  });
}

async function playRadioAtIndex(idx) {
  const list = state.radios.length ? state.radios : DEFAULT_RADIOS;
  if (!list.length) return;

  const safeIdx = ((idx % list.length) + list.length) % list.length;
  const rad = list[safeIdx];
  const stream = rad.streamUrl || rad.url;

  // Pause normal song player
  audio.pause();

  state.isRadioMode = true;
  state.radioIndex = safeIdx;
  state.currentIndex = -1;
  state.silenceCounter = 0;
  syncModeSwitchUI(true);

  document.getElementById("playerTitle").textContent = rad.name;
  document.getElementById("playerArtist").textContent = `🔴 LIVE FM • ${rad.genre || "Radio"}`;
  updateCoverDisplay({ title: "FM", coverUrl: rad.logoUrl || "logo.png" });

  // Sync current volume slider to dedicated radioAudio
  const volSlider = document.getElementById("volSlider");
  radioAudio.volume = volSlider ? Number(volSlider.value) / 100 : 1;

  radioAudio.src = stream;

  renderLibrary();
  renderRadioList();
  switchTab("playerTab");

  try {
    await radioAudio.play();
    setPlayingState(true);
  } catch (e) {
    setPlayingState(false);
    showToast(`${rad.name} offline — tap Next ⏭`);
  }
}

/* ==================== ALBUMS (SHORT UNIQUE NAMES) & LIBRARY RENDER ==================== */
function cleanAlbumName(raw) {
  if (!raw) return "Singles";
  const parts = String(raw).split(/[\\/]/).map(p => p.trim()).filter(Boolean);
  const unique = [...new Set(parts)];
  const shortName = unique[unique.length - 1] || "Singles";
  return shortName.length > 24 ? shortName.slice(0, 22) + "…" : shortName;
}

function renderLibrary() {
  const container = document.getElementById("tracksListContainer");
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const backBar = document.getElementById("albumBackBar");
  container.innerHTML = "";

  if (state.subTab === "albums" && !state.selectedAlbum && !query) {
    backBar.classList.add("hidden");
    const albumMap = new Map();
    state.songs.forEach(s => {
      const name = cleanAlbumName(s.album);
      if (!albumMap.has(name)) albumMap.set(name, []);
      albumMap.get(name).push(s);
    });

    albumMap.forEach((tracks, albumName) => {
      const cover = tracks.find(t => t.coverUrl)?.coverUrl || "";
      const row = document.createElement("div");
      row.className = "album-item";
      row.innerHTML = `
        <img class="item-thumb" src="${cover}" onerror="this.style.visibility='hidden'" />
        <div class="item-info">
          <div class="item-title">📁 ${albumName}</div>
          <div class="item-sub">${tracks.length} tracks</div>
        </div>
        <div class="item-actions">
          <button class="mini-btn play-alb-btn" title="Play Album">▶</button>
          <button class="mini-btn dl-alb-btn" title="Download Album Offline">⬇</button>
        </div>
      `;
      row.querySelector(".item-info").onclick = () => {
        state.selectedAlbum = albumName;
        renderLibrary();
      };
      row.querySelector(".play-alb-btn").onclick = () => {
        const firstIdx = state.songs.findIndex(s => cleanAlbumName(s.album) === albumName);
        if (firstIdx !== -1) playSongAtIndex(firstIdx);
      };
      row.querySelector(".dl-alb-btn").onclick = () => downloadAlbumOffline(albumName, tracks);
      container.appendChild(row);
    });
    return;
  }

  if (state.subTab === "albums" && state.selectedAlbum) {
    backBar.classList.remove("hidden");
    document.getElementById("activeAlbumTitle").textContent = state.selectedAlbum;
  } else {
    backBar.classList.add("hidden");
  }

  let list = state.songs;
  if (state.subTab === "favorites") list = list.filter(s => state.favorites.has(s.id));
  if (state.subTab === "offline") list = list.filter(s => state.offlineIds.has(s.id));
  if (state.subTab === "albums" && state.selectedAlbum) {
    list = list.filter(s => cleanAlbumName(s.album) === state.selectedAlbum);
  }
  if (query) {
    list = list.filter(s =>
      s.title.toLowerCase().includes(query) ||
      s.artist.toLowerCase().includes(query) ||
      cleanAlbumName(s.album).toLowerCase().includes(query)
    );
  }

  list.forEach(song => {
    const globalIdx = state.songs.findIndex(x => x.id === song.id);
    const isCurrent = !state.isRadioMode && globalIdx === state.currentIndex;
    const isOffline = state.offlineIds.has(song.id);
    const row = document.createElement("div");
    row.className = "track-item" + (isCurrent ? " now-active" : "");
    row.innerHTML = `
      <img class="item-thumb" src="${song.coverUrl || ""}" onerror="this.style.visibility='hidden'" />
      <div class="item-info">
        <div class="item-title">${song.title}</div>
        <div class="item-sub">${cleanAlbumName(song.album)}</div>
      </div>
      <div class="item-actions">
        ${isOffline ? `<button class="mini-btn del-off-btn" title="Remove Offline">🗑</button>` : ""}
        <button class="mini-btn fav-row-btn">${state.favorites.has(song.id) ? "♥" : "♡"}</button>
      </div>
    `;
    row.querySelector(".item-info").onclick = () => {
      playSongAtIndex(globalIdx);
      switchTab("playerTab");
    };
    row.querySelector(".fav-row-btn").onclick = () => toggleFavorite(song.id);
    const delBtn = row.querySelector(".del-off-btn");
    if (delBtn) delBtn.onclick = () => removeOfflineSong(song.id);
    container.appendChild(row);
  });
}

/* ==================== OFFLINE DOWNLOAD & FAVORITES ==================== */
async function saveCurrentOffline() {
  if (state.isRadioMode) {
    showToast("Live Radio cannot be saved offline");
    return;
  }
  const song = state.songs[state.currentIndex];
  if (!song) return;
  showToast("Downloading for offline...");
  try {
    const blobUrl = await resolveAudioSrc(song);
    const resp = await fetch(blobUrl);
    const blob = await resp.blob();
    const cache = await caches.open("admusic-offline-v1");
    await cache.put(`/offline-track/${song.id}`, new Response(blob));
    state.offlineIds.add(song.id);
    localStorage.setItem("admusic_offline_ids", JSON.stringify([...state.offlineIds]));
    updateUtilityStates(song);
    updateOfflineCount();
    showToast("Saved offline!");
  } catch (e) {
    showToast("Offline save failed");
  }
}

async function downloadAlbumOffline(albumName, tracks) {
  showToast(`Downloading ${tracks.length} tracks from ${albumName}...`);
  const cache = await caches.open("admusic-offline-v1");
  for (const song of tracks) {
    if (state.offlineIds.has(song.id)) continue;
    try {
      const blobUrl = await resolveAudioSrc(song);
      const blob = await (await fetch(blobUrl)).blob();
      await cache.put(`/offline-track/${song.id}`, new Response(blob));
      state.offlineIds.add(song.id);
    } catch (_) {}
  }
  localStorage.setItem("admusic_offline_ids", JSON.stringify([...state.offlineIds]));
  updateOfflineCount();
  showToast(`${albumName} saved offline!`);
}

async function removeOfflineSong(songId) {
  const cache = await caches.open("admusic-offline-v1");
  await cache.delete(`/offline-track/${songId}`);
  state.offlineIds.delete(songId);
  localStorage.setItem("admusic_offline_ids", JSON.stringify([...state.offlineIds]));
  updateOfflineCount();
  renderLibrary();
  showToast("Removed from offline");
}

function toggleFavorite(songId) {
  if (!songId) return;
  if (state.favorites.has(songId)) state.favorites.delete(songId);
  else state.favorites.add(songId);
  localStorage.setItem("admusic_favs", JSON.stringify([...state.favorites]));
  if (state.songs[state.currentIndex]) updateUtilityStates(state.songs[state.currentIndex]);
  renderLibrary();
}

function updateUtilityStates(song) {
  document.getElementById("favBtn").classList.toggle("active-state", state.favorites.has(song.id));
  document.getElementById("offlineBtn").classList.toggle("active-state", state.offlineIds.has(song.id));
}

/* ==================== 10-BAND EQUALIZER UI ==================== */
function initEQUI() {
  const grid = document.getElementById("eqBandsGrid");
  if (!grid) return;
  EQ_LABELS.forEach((lbl, idx) => {
    const col = document.createElement("div");
    col.className = "eq-band-col";
    col.innerHTML = `
      <input type="range" min="-12" max="12" step="1" value="0" data-band="${idx}" />
      <span>${lbl}</span>
    `;
    col.querySelector("input").oninput = e => {
      initAudioGraph();
      if (document.getElementById("eqMasterToggle").checked && eqFilters[idx]) {
        eqFilters[idx].gain.value = Number(e.target.value);
      }
    };
    grid.appendChild(col);
  });
}

/* ==================== ADMIN & UPLOAD ==================== */
async function uploadNewSong() {
  const title = document.getElementById("upTitle").value.trim();
  const artist = document.getElementById("upArtist").value.trim();
  const album = document.getElementById("upAlbum").value.trim();
  const file = document.getElementById("upFile").files[0];
  const statusEl = document.getElementById("uploadStatus");

  if (!title || !file) {
    statusEl.textContent = "Please enter Title and select an audio file.";
    return;
  }
  statusEl.textContent = "Encoding & uploading...";

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];
    try {
      const res = await fetch(GAS_WEBAPP_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "uploadSong",
          email: state.user.email,
          title,
          artist,
          album,
          sourceType: "DRIVE",
          fileName: file.name,
          mimeType: file.type || "audio/webm",
          base64
        })
      });
      const data = await res.json();
      statusEl.textContent = data.message || data.error;
      if (data.ok) loadSongs();
    } catch (e) {
      statusEl.textContent = "Upload failed.";
    }
  };
  reader.readAsDataURL(file);
}

async function loadAdminData() {
  try {
    const url = `${GAS_WEBAPP_URL}?action=getAdminData&email=${encodeURIComponent(state.user.email)}`;
    const data = await jsonpRequest(url);
    if (!data.ok) return;

    document.getElementById("pendingCount").textContent = data.pendingSongs.length;
    const pList = document.getElementById("adminPendingList");
    pList.innerHTML = data.pendingSongs.map(s => `
      <div class="admin-row">
        <span>${s.title} (${s.uploadedBy})</span>
        <div>
          <button class="mini-btn" onclick="reviewSong('${s.id}','APPROVE')">✓</button>
          <button class="mini-btn" onclick="reviewSong('${s.id}','REJECT')">✕</button>
        </div>
      </div>
    `).join("") || `<div class="muted">No pending songs</div>`;

    const cList = document.getElementById("adminCodesList");
    cList.innerHTML = data.codes.map(c => `
      <div class="admin-row">
        <span><strong>${c.code}</strong> (${c.role}) • ${c.usedCount}/${c.maxUses} • ${c.status}</span>
        ${c.status === "ACTIVE" ? `<button class="mini-btn" onclick="revokeCode('${c.code}')">Revoke</button>` : ""}
      </div>
    `).join("");

    const uList = document.getElementById("adminUsersList");
    uList.innerHTML = data.users.map(u => `
      <div class="admin-row">
        <div>
          <strong>${u.name}</strong> (${u.role})<br/>
          <span class="muted">${u.email} • ${u.status}</span>
        </div>
        <div class="item-actions">
          <button class="mini-btn" onclick="toggleBlockUser('${u.email}','${u.status === "BLOCKED" ? "ACTIVE" : "BLOCKED"}')">
            ${u.status === "BLOCKED" ? "Unblock" : "Block"}
          </button>
          <button class="mini-btn" onclick="toggleBlockUser('${u.email}','REVOKED')">Revoke</button>
        </div>
      </div>
    `).join("");
  } catch (_) {}
}

window.reviewSong = async (songId, decision) => {
  await fetch(GAS_WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify({ action: "reviewSong", email: state.user.email, songId, decision })
  });
  loadAdminData();
  loadSongs();
};

window.revokeCode = async (code) => {
  await fetch(GAS_WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify({ action: "manageCode", email: state.user.email, subAction: "REVOKE", code })
  });
  loadAdminData();
};

window.toggleBlockUser = async (targetEmail, status) => {
  await fetch(GAS_WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify({ action: "manageUser", email: state.user.email, targetEmail, status })
  });
  showToast(`User ${targetEmail} set to ${status}`);
  loadAdminData();
};

/* ==================== EVENT BINDINGS & TIMERS ==================== */
function bindEvents() {
  document.getElementById("authSubmitBtn").onclick = handleAuth;

  document.querySelectorAll(".nav-tab").forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  document.querySelectorAll(".sub-tab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".sub-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.subTab = btn.dataset.sub;
      state.selectedAlbum = null;
      renderLibrary();
    };
  });

  document.getElementById("backToAlbumsBtn").onclick = () => {
    state.selectedAlbum = null;
    renderLibrary();
  };

  document.getElementById("searchInput").oninput = renderLibrary;
  document.getElementById("resyncQuickBtn").onclick = loadSongs;

  // Mutual Exclusion Reactor Switch (Left = Music Player, Right = Live FM Radio)
  const reactorToggle = document.getElementById("modeReactorToggle");
  if (reactorToggle) {
    reactorToggle.onchange = () => {
      if (reactorToggle.checked) {
        audio.pause();
        const targetRad = state.radioIndex >= 0 ? state.radioIndex : 0;
        playRadioAtIndex(targetRad);
      } else {
        radioAudio.pause();
        radioAudio.src = "";
        state.isRadioMode = false;
        if (state.songs.length) {
          playSongAtIndex(state.lastSongIndex >= 0 ? state.lastSongIndex : 0);
        } else {
          syncModeSwitchUI(false);
          document.getElementById("playerTitle").textContent = "Select a Track";
          document.getElementById("playerArtist").textContent = "AD Music Library";
          setPlayingState(false);
        }
      }
    };
  }

  document.getElementById("playPauseBtn").onclick = () => {
    if (state.isRadioMode) {
      if (radioAudio.paused) {
        radioAudio.play().then(() => setPlayingState(true));
      } else {
        radioAudio.pause();
        setPlayingState(false);
      }
      return;
    }
    if (state.currentIndex === -1 && state.songs.length) {
      playSongAtIndex(0);
      return;
    }
    if (audio.paused) {
      audio.play();
      setPlayingState(true);
    } else {
      audio.pause();
      setPlayingState(false);
    }
  };

  document.getElementById("prevBtn").onclick = () => {
    if (state.isRadioMode) {
      playRadioAtIndex(state.radioIndex - 1);
      return;
    }
    if (!state.songs.length) return;
    const prev = (state.currentIndex - 1 + state.songs.length) % state.songs.length;
    playSongAtIndex(prev);
  };

  document.getElementById("nextBtn").onclick = playNextTrack;
  document.getElementById("rew10Btn").onclick = () => { if (!state.isRadioMode) audio.currentTime = Math.max(0, audio.currentTime - 10); };
  document.getElementById("fwd10Btn").onclick = () => { if (!state.isRadioMode) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); };

  document.getElementById("shuffleBtn").onclick = () => {
    state.shuffle = !state.shuffle;
    document.getElementById("shuffleBtn").classList.toggle("active-state", state.shuffle);
  };

  document.getElementById("loopBtn").onclick = () => {
    state.loop = !state.loop;
    audio.loop = state.loop;
    document.getElementById("loopBtn").classList.toggle("active-state", state.loop);
  };

  document.getElementById("favBtn").onclick = () => {
    if (state.isRadioMode) return;
    const s = state.songs[state.currentIndex];
    if (s) toggleFavorite(s.id);
  };

  document.getElementById("offlineBtn").onclick = saveCurrentOffline;

  document.getElementById("volToggleBtn").onclick = () => {
    document.getElementById("volumeDrawer").classList.toggle("hidden");
  };

  document.getElementById("volSlider").oninput = e => {
    const val = Number(e.target.value);
    document.getElementById("volVal").textContent = val + "%";
    if (state.isRadioMode) {
      radioAudio.volume = val / 100;
      return;
    }
    initAudioGraph();
    const boostLine = document.getElementById("boostLine");
    if (val === 100) {
      boostLine.classList.add("unlocked");
      const boost = Number(document.getElementById("boostSlider").value);
      gainNode.gain.value = boost / 100;
    } else {
      boostLine.classList.remove("unlocked");
      document.getElementById("boostSlider").value = 100;
      document.getElementById("boostVal").textContent = "100%";
      gainNode.gain.value = val / 100;
    }
  };

  document.getElementById("boostSlider").oninput = e => {
    if (state.isRadioMode) return;
    initAudioGraph();
    const boost = Number(e.target.value);
    document.getElementById("boostVal").textContent = boost + "%";
    gainNode.gain.value = boost / 100;
  };

  const seekSlider = document.getElementById("seekSlider");
  seekSlider.oninput = () => {
    if (!state.isRadioMode && audio.duration) audio.currentTime = (seekSlider.value / 100) * audio.duration;
  };

  audio.ontimeupdate = () => {
    if (state.isRadioMode) {
      seekSlider.value = 100;
      document.getElementById("currentTime").textContent = "LIVE";
      document.getElementById("totalTime").textContent = "FM";
      return;
    }
    if (!audio.duration) return;
    seekSlider.value = (audio.currentTime / audio.duration) * 100;
    document.getElementById("currentTime").textContent = formatTime(audio.currentTime);
    document.getElementById("totalTime").textContent = formatTime(audio.duration);

    if (document.getElementById("silenceSkipToggle").checked && analyserNode && audio.duration - audio.currentTime <= 10) {
      const data = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      if (avg < 2) {
        state.silenceCounter += 0.25;
        if (state.silenceCounter >= 2) {
          state.silenceCounter = 0;
          playNextTrack();
        }
      } else {
        state.silenceCounter = 0;
      }
    }
  };

  audio.onended = () => { if (!state.loop && !state.isRadioMode) playNextTrack(); };

  document.querySelectorAll(".eq-preset-btn").forEach(btn => {
    btn.onclick = () => {
      initAudioGraph();
      document.querySelectorAll(".eq-preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const gains = EQ_PRESETS[btn.dataset.preset] || EQ_PRESETS.normal;
      document.querySelectorAll("#eqBandsGrid input").forEach((inp, i) => {
        inp.value = gains[i];
        if (eqFilters[i]) eqFilters[i].gain.value = gains[i];
      });
    };
  });

  document.getElementById("tempoSlider").oninput = e => {
    audio.playbackRate = Number(e.target.value);
    document.getElementById("tempoVal").textContent = e.target.value + "x";
  };

  document.getElementById("compSlider").oninput = e => {
    initAudioGraph();
    const v = Number(e.target.value);
    document.getElementById("compVal").textContent = v;
    compressorNode.ratio.value = Math.max(1, v);
  };

  document.querySelectorAll(".ac-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".ac-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showToast("Acoustic Mode: " + btn.textContent);
    };
  });

  document.querySelectorAll(".dot").forEach(d => {
    d.onclick = () => setAccentColor(d.dataset.color);
  });

  document.getElementById("uploadSongBtn").onclick = uploadNewSong;
  document.getElementById("signOutBtn").onclick = signOut;

  document.getElementById("clearOfflineBtn").onclick = async () => {
    await caches.delete("admusic-offline-v1");
    state.offlineIds.clear();
    localStorage.setItem("admusic_offline_ids", "[]");
    updateOfflineCount();
    renderLibrary();
    showToast("Offline cache cleared");
  };

  document.getElementById("syncDriveBtn").onclick = async () => {
    const msg = document.getElementById("syncStatusMsg");
    msg.textContent = "Syncing .webm & .webp from Drive...";
    const res = await fetch(GAS_WEBAPP_URL, {
      method: "POST",
      body: JSON.stringify({ action: "syncDriveFolder", email: state.user.email })
    });
    const data = await res.json();
    msg.textContent = data.message || data.error;
    if (data.ok) loadSongs();
  };

  document.getElementById("genCodeBtn").onclick = async () => {
    const btn = document.getElementById("genCodeBtn");
    const input = document.getElementById("newCodeInput");
    const role = document.getElementById("newCodeRole").value;
    const finalCode = (input.value.trim() || ("AD-" + Math.random().toString(36).substring(2, 8).toUpperCase())).toUpperCase();

    btn.disabled = true;
    btn.textContent = "Saving...";
    showToast(`Generated: ${finalCode} (1 User Limit)`);

    const cList = document.getElementById("adminCodesList");
    cList.insertAdjacentHTML("afterbegin", `
      <div class="admin-row">
        <span><strong>${finalCode}</strong> (${role}) • 0/1 • ACTIVE</span>
        <button class="mini-btn" onclick="revokeCode('${finalCode}')">Revoke</button>
      </div>
    `);
    input.value = "";

    try {
      await fetch(GAS_WEBAPP_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "manageCode",
          email: state.user.email,
          subAction: "CREATE",
          code: finalCode,
          role,
          maxUses: 1
        })
      });
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate";
    }
  };
}

function playNextTrack() {
  if (state.isRadioMode) {
    playRadioAtIndex(state.radioIndex + 1);
    return;
  }
  if (!state.songs.length) return;
  const next = state.shuffle
    ? Math.floor(Math.random() * state.songs.length)
    : (state.currentIndex + 1) % state.songs.length;
  playSongAtIndex(next);
}

function switchTab(tabId) {
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".tab-view").forEach(v => v.classList.toggle("active", v.id === tabId));
}

function renderProfile() {
  if (!state.user) return;
  document.getElementById("profName").textContent = state.user.name;
  document.getElementById("profEmail").textContent = state.user.email;
  document.getElementById("profRoleBadge").textContent = state.user.role;
  document.getElementById("adminSection").classList.toggle("hidden", state.user.role !== "ADMIN");
  updateOfflineCount();
}

function updateOfflineCount() {
  document.getElementById("offlineCountStat").textContent = state.offlineIds.size;
}

function setAccentColor(hex) {
  document.documentElement.style.setProperty("--accent", hex);
  localStorage.setItem("admusic_accent", hex);
}

function signOut() {
  localStorage.removeItem("admusic_user");
  location.reload();
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function showToast(text) {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.classList.remove("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add("hidden"), 2500);
}
