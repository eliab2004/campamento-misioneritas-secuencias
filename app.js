import { SoundTouchNode } from "https://cdn.jsdelivr.net/npm/@soundtouchjs/audio-worklet@2.1.1/.dist/index.js";

const SOUND_TOUCH_PROCESSOR = "https://cdn.jsdelivr.net/npm/@soundtouchjs/audio-worklet@2.1.1/.dist/soundtouch-processor.js";

const app = {
  catalog: [],
  selectedSet: "Todas",
  selectedSong: null,
  audio: [],
  playing: false,
  playhead: 0,
  lastTick: 0,
  mutedAll: false,
  timer: null,
  duration: 0,
  audioContext: null,
  workletReady: null
};

const $ = (id) => document.getElementById(id);
const config = window.SEQUENCE_CONFIG || { releaseBaseUrl: "" };

function safeUrl(file) {
  const base = config.releaseBaseUrl || "";
  return base + file.split("/").map(encodeURIComponent).join("/");
}

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function sets() {
  return ["Todas", ...new Set(app.catalog.map((song) => song.set))];
}

function renderTabs() {
  const root = $("set-tabs");
  root.replaceChildren();
  for (const set of sets()) {
    const button = document.createElement("button");
    button.className = "set-tab";
    button.type = "button";
    button.textContent = set;
    button.setAttribute("aria-pressed", String(app.selectedSet === set));
    button.addEventListener("click", () => {
      app.selectedSet = set;
      renderTabs();
      renderSongs();
    });
    root.append(button);
  }
}

function filteredSongs() {
  const query = $("search").value.trim().toLocaleLowerCase("es");
  return app.catalog.filter((song) => {
    const inSet = app.selectedSet === "Todas" || song.set === app.selectedSet;
    const matches = !query || `${song.title} ${song.set}`.toLocaleLowerCase("es").includes(query);
    return inSet && matches;
  });
}

function renderSongs() {
  const root = $("song-list");
  root.replaceChildren();
  const songs = filteredSongs();
  if (!songs.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No encontré alabanzas con ese nombre.";
    root.append(empty);
    return;
  }
  songs.forEach((song, index) => {
    const button = document.createElement("button");
    button.className = "song-card";
    button.type = "button";
    button.setAttribute("aria-pressed", String(app.selectedSong?.id === song.id));
    const number = document.createElement("span");
    number.className = "song-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const details = document.createElement("span");
    const title = document.createElement("span");
    title.className = "song-name";
    title.textContent = song.title;
    const meta = document.createElement("span");
    meta.className = "song-meta";
    meta.textContent = `${song.set} · ${song.tracks.length} pistas`;
    details.append(title, meta);
    const play = document.createElement("span");
    play.className = "song-play";
    play.setAttribute("aria-hidden", "true");
    play.textContent = app.selectedSong?.id === song.id && app.playing ? "Ⅱ" : "▶";
    button.append(number, details, play);
    button.addEventListener("click", () => loadSong(song));
    root.append(button);
  });
}

function report(message, error = false) {
  const box = $("player-message");
  box.textContent = message;
  box.classList.toggle("error", error);
}

function stopAudio() {
  app.playing = false;
  clearInterval(app.timer);
  for (const item of app.audio) {
    item.el.pause();
    item.el.removeAttribute("src");
    item.el.load();
    item.sourceNode?.disconnect();
    item.pitchNode?.disconnect();
  }
  app.audio = [];
}

function makeTrackRow(track, index) {
  const row = document.createElement("div");
  row.className = "track-row";
  const name = document.createElement("span");
  name.className = "track-name";
  name.title = track.name;
  name.textContent = track.name;
  const mute = document.createElement("button");
  mute.className = "mute-button";
  mute.type = "button";
  mute.textContent = "◖";
  mute.title = `Silenciar ${track.name}`;
  mute.setAttribute("aria-label", `Silenciar ${track.name}`);
  mute.setAttribute("aria-pressed", "false");
  const volume = document.createElement("input");
  volume.className = "track-volume";
  volume.type = "range";
  volume.min = "0";
  volume.max = "100";
  volume.value = "85";
  volume.setAttribute("aria-label", `Volumen de ${track.name}`);
  const audio = new Audio();
  audio.preload = "metadata";
  audio.src = safeUrl(track.file);
  audio.volume = 0.85;
  const entry = { el: audio, track, muted: false, volume: 0.85, offset: track.offset || 0, failed: false, sourceNode: null, pitchNode: null };
  audio.addEventListener("error", () => {
    if (!entry.failed) {
      entry.failed = true;
      report(`No pude cargar la pista “${track.name}”. Revisa el enlace de audio publicado.`, true);
    }
  });
  audio.addEventListener("loadedmetadata", () => {
    const end = entry.offset + (Number.isFinite(audio.duration) ? audio.duration : track.duration || 0);
    app.duration = Math.max(app.duration, end);
    updateTimeline();
  });
  mute.addEventListener("click", () => {
    entry.muted = !entry.muted;
    audio.muted = entry.muted || app.mutedAll;
    mute.setAttribute("aria-pressed", String(entry.muted));
    mute.textContent = entry.muted ? "×" : "◖";
    mute.title = entry.muted ? `Activar ${track.name}` : `Silenciar ${track.name}`;
  });
  volume.addEventListener("input", () => {
    entry.volume = Number(volume.value) / 100;
    audio.volume = entry.volume;
  });
  row.append(name, mute, volume);
  app.audio.push(entry);
  return row;
}

function loadSong(song) {
  stopAudio();
  app.selectedSong = song;
  app.playhead = 0;
  app.duration = song.duration || 0;
  app.mutedAll = false;
  $("mute-all").textContent = "Silenciar todo";
  $("now-title").textContent = song.title;
  $("now-set").textContent = song.set.toLocaleUpperCase("es");
  const pitchLabel = song.pitchSemitones ? ` · tono ${song.pitchSemitones > 0 ? "+" : ""}${song.pitchSemitones}` : "";
  $("track-summary").textContent = `${song.tracks.length} pistas sincronizadas${pitchLabel}`;
  $("play-button").disabled = !song.tracks.length;
  $("mute-all").disabled = !song.tracks.length;
  $("seek").disabled = !song.tracks.length;
  $("play-label").textContent = "Reproducir";
  $("play-button").querySelector("span:first-child").textContent = "▶";
  $("tracks").replaceChildren();
  for (const [index, track] of song.tracks.entries()) {
    $("tracks").append(makeTrackRow(track, index));
  }
  report("Listo. Presiona Reproducir para escuchar las pistas juntas.");
  renderSongs();
  updateTimeline();
}

async function start() {
  if (!app.audio.length || !app.selectedSong) return;
  try {
    const semitones = app.selectedSong.pitchSemitones || 0;
    if (semitones) {
      if (!app.audioContext) app.audioContext = new AudioContext();
      if (!app.workletReady) app.workletReady = SoundTouchNode.register(app.audioContext, SOUND_TOUCH_PROCESSOR);
      await app.workletReady;
      for (const item of app.audio) {
        if (item.pitchNode) continue;
        item.sourceNode = app.audioContext.createMediaElementSource(item.el);
        item.pitchNode = new SoundTouchNode({ context: app.audioContext });
        item.pitchNode.pitchSemitones.value = semitones;
        item.pitchNode.playbackRate.value = 1;
        item.sourceNode.connect(item.pitchNode);
        item.pitchNode.connect(app.audioContext.destination);
      }
      await app.audioContext.resume();
    }
  } catch (error) {
    console.error(error);
    report("No se pudo preparar el cambio de tono. Intenta recargar la página.", true);
    return;
  }
  app.playing = true;
  app.lastTick = performance.now();
  for (const item of app.audio) {
    const local = app.playhead - item.offset;
    if (local >= 0 && local < item.el.duration) {
      item.el.currentTime = local;
      item.el.play().catch(() => report("El navegador bloqueó la reproducción. Vuelve a presionar Reproducir.", true));
    }
  }
  $("play-label").textContent = "Pausar";
  $("play-button").querySelector("span:first-child").textContent = "Ⅱ";
  report(`Reproduciendo ${app.selectedSong.title}. Puedes ajustar o silenciar cada pista.`);
  app.timer = setInterval(tick, 100);
  renderSongs();
}

function pause() {
  app.playing = false;
  for (const item of app.audio) item.el.pause();
  clearInterval(app.timer);
  $("play-label").textContent = "Reproducir";
  $("play-button").querySelector("span:first-child").textContent = "▶";
  renderSongs();
}

function tick() {
  if (!app.playing) return;
  const now = performance.now();
  app.playhead += (now - app.lastTick) / 1000;
  app.lastTick = now;
  if (app.playhead >= app.duration) {
    app.playhead = 0;
    pause();
    updateTimeline();
    return;
  }
  for (const item of app.audio) {
    const target = app.playhead - item.offset;
    if (target < 0 || target >= item.el.duration) {
      item.el.pause();
      continue;
    }
    if (item.el.paused) item.el.play().catch(() => {});
    if (Math.abs(item.el.currentTime - target) > 0.4) item.el.currentTime = target;
  }
  updateTimeline();
}

function seekTo(value) {
  app.playhead = Math.max(0, Math.min(app.duration, value));
  for (const item of app.audio) {
    const target = app.playhead - item.offset;
    if (target >= 0 && target < item.el.duration) {
      item.el.currentTime = target;
      if (app.playing) item.el.play().catch(() => {});
    } else {
      item.el.pause();
    }
  }
  updateTimeline();
}

function updateTimeline() {
  $("elapsed").textContent = formatTime(app.playhead);
  $("duration").textContent = formatTime(app.duration);
  $("seek").value = String(app.duration ? Math.round(app.playhead / app.duration * 1000) : 0);
}

async function init() {
  try {
    const response = await fetch("catalog.json");
    if (!response.ok) throw new Error("catalog");
    app.catalog = await response.json();
    $("song-count").textContent = app.catalog.length;
    $("track-count").textContent = app.catalog.reduce((total, song) => total + song.tracks.length, 0);
    renderTabs();
    renderSongs();
  } catch {
    report("No se pudo cargar el catálogo de alabanzas.", true);
  }
  $("search").addEventListener("input", renderSongs);
  $("play-button").addEventListener("click", () => app.playing ? pause() : start());
  $("mute-all").addEventListener("click", () => {
    app.mutedAll = !app.mutedAll;
    for (const item of app.audio) item.el.muted = item.muted || app.mutedAll;
    $("mute-all").textContent = app.mutedAll ? "Activar todo" : "Silenciar todo";
  });
  $("seek").addEventListener("input", (event) => seekTo(Number(event.target.value) / 1000 * app.duration));
}

init();
