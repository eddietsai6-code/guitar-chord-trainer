import { CHORD_LIBRARY, CHORD_SHAPES, CHORD_TYPES } from "./chord-data.js";
import {
  chooseNextChordId,
  clampSelection,
  filterChordLibrary,
  getDetectionStatus,
  getDiagramFretLabel,
  pcpFromFrequencyBins,
  scoreTargetChord,
  shouldPassChordFrame,
  validateChordSelection,
} from "./chord-core.js";

const selectionScreen = document.querySelector("#selectionScreen");
const practiceScreen = document.querySelector("#practiceScreen");
const chordGrid = document.querySelector("#chordGrid");
const filterRow = document.querySelector("#filterRow");
const searchInput = document.querySelector("#searchInput");
const selectedCount = document.querySelector("#selectedCount");
const selectionHint = document.querySelector("#selectionHint");
const startPracticeButton = document.querySelector("#startPracticeButton");
const diagramToggle = document.querySelector("#diagramToggle");
const backButton = document.querySelector("#backButton");
const pauseButton = document.querySelector("#pauseButton");
const currentPreview = document.querySelector("#currentPreview");
const nextPreview = document.querySelector("#nextPreview");
const practiceTitle = document.querySelector("#practiceTitle");
const diagramSlot = document.querySelector("#diagramSlot");
const progressFill = document.querySelector("#progressFill");
const scoreText = document.querySelector("#scoreText");
const statusText = document.querySelector("#statusText");

const state = {
  selectedIds: [],
  activeCategory: "all",
  searchText: "",
  showDiagram: true,
  practiceQueue: [],
  currentIndex: 0,
  currentChordId: null,
  nextChordId: null,
  passedCount: 0,
  paused: false,
  audioContext: null,
  analyser: null,
  micSource: null,
  micStream: null,
  frequencyData: null,
  rafId: null,
  lastFrameAt: 0,
  lastPassAt: null,
  passProgressMs: 0,
};

const audioSettings = {
  minFrequency: 70,
  maxFrequency: 1400,
  noiseFloor: 18,
  minEnergy: 90,
  matchThreshold: 0.72,
  passCooldownMs: 800,
};

const categoryOptions = [
  { id: "all", label: "全部" },
  ...Array.from(
    new Map(CHORD_TYPES.map((type) => [type.category, type.category]))
  ).map(([id, label]) => ({ id, label })),
];

function getVisibleChords() {
  return filterChordLibrary(CHORD_LIBRARY, {
    category: state.activeCategory,
    query: state.searchText,
  });
}

function renderFilters() {
  filterRow.replaceChildren(
    ...categoryOptions.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-button${
        option.id === state.activeCategory ? " active" : ""
      }`;
      button.textContent = option.label;
      button.addEventListener("click", () => {
        state.activeCategory = option.id;
        render();
      });
      return button;
    })
  );
}

function renderChordGrid() {
  const visibleChords = getVisibleChords();
  chordGrid.replaceChildren(
    ...visibleChords.map((chord) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chord-button${
        state.selectedIds.includes(chord.id) ? " selected" : ""
      }`;
      button.textContent = chord.name;
      button.addEventListener("click", () => {
        state.selectedIds = clampSelection(state.selectedIds, chord.id);
        render();
      });
      return button;
    })
  );
}

function renderSelectionState() {
  const validation = validateChordSelection(state.selectedIds);
  selectedCount.textContent = `已选 ${state.selectedIds.length} / 8`;
  selectionHint.textContent = validation.valid ? "准备好了。" : validation.reason;
  startPracticeButton.disabled = !validation.valid;
}

function render() {
  state.showDiagram = diagramToggle.checked;
  renderFilters();
  renderChordGrid();
  renderSelectionState();
}

function getChordById(id) {
  return CHORD_LIBRARY.find((chord) => chord.id === id);
}

function setStatus(message, variant = "normal") {
  statusText.textContent = message;
  statusText.classList.toggle("error", variant === "error");
  statusText.classList.toggle("success", variant === "success");
}

function resetPassProgress() {
  state.passProgressMs = 0;
  progressFill.style.width = "0%";
}

function renderPauseButton() {
  pauseButton.textContent = state.paused ? "▶" : "Ⅱ";
  pauseButton.setAttribute(
    "aria-label",
    state.paused ? "继续练习" : "暂停练习"
  );
}

function createStringMarker(shape, stringIndex) {
  const marker = document.createElement("span");
  marker.className = "string-marker";
  if (shape.muted.includes(stringIndex)) {
    marker.textContent = "X";
  } else if (shape.open.includes(stringIndex)) {
    marker.textContent = "O";
  }
  return marker;
}

function setPosition(element, { left, top, width }) {
  if (left !== undefined) {
    element.style.left = `${left}px`;
  }
  if (top !== undefined) {
    element.style.top = `${top}px`;
  }
  if (width !== undefined) {
    element.style.width = `${width}px`;
  }
}

function renderChordDiagram(chordId) {
  const shape = CHORD_SHAPES[chordId];
  diagramSlot.replaceChildren();

  if (!state.showDiagram) {
    diagramSlot.classList.add("hidden");
    return;
  }

  diagramSlot.classList.remove("hidden");

  if (!shape) {
    const fallback = document.createElement("p");
    fallback.className = "diagram-fallback";
    fallback.textContent = "暂无指法图";
    diagramSlot.appendChild(fallback);
    return;
  }

  const stringLeft = 16;
  const stringSpacing = 37;
  const fretSpacing = 54;
  const dotOffset = 13;

  const diagram = document.createElement("div");
  diagram.className = `chord-diagram${shape.baseFret > 1 ? " high-position" : ""}`;

  const markers = document.createElement("div");
  markers.className = "string-markers";
  markers.replaceChildren(
    ...Array.from({ length: 6 }, (_, index) => createStringMarker(shape, index))
  );

  const fretboard = document.createElement("div");
  fretboard.className = "fretboard";

  const label = getDiagramFretLabel(shape);
  if (label) {
    const baseFret = document.createElement("span");
    baseFret.className = "base-fret";
    baseFret.textContent = label;
    fretboard.appendChild(baseFret);
  }

  for (let index = 0; index < 6; index += 1) {
    const string = document.createElement("span");
    string.className = "string-line";
    setPosition(string, { left: stringLeft + index * stringSpacing });
    fretboard.appendChild(string);
  }

  for (let fret = 0; fret < 5; fret += 1) {
    const fretLine = document.createElement("span");
    fretLine.className = "fret-line";
    setPosition(fretLine, { top: fret * fretSpacing });
    fretboard.appendChild(fretLine);
  }

  shape.barres.forEach((barre) => {
    const relativeFret = barre.fret - shape.baseFret + 1;
    const bar = document.createElement("span");
    bar.className = "barre";
    bar.textContent = barre.finger;
    setPosition(bar, {
      left: stringLeft + barre.fromString * stringSpacing - dotOffset,
      top: 13 + (relativeFret - 1) * fretSpacing,
      width: 30 + (barre.toString - barre.fromString) * stringSpacing,
    });
    fretboard.appendChild(bar);
  });

  shape.frets.forEach((fretValue, stringIndex) => {
    if (fretValue === 0 || fretValue === "x") {
      return;
    }

    const isCoveredByBarre = shape.barres.some(
      (barre) =>
        fretValue === barre.fret &&
        stringIndex >= barre.fromString &&
        stringIndex <= barre.toString
    );
    if (isCoveredByBarre) {
      return;
    }

    const relativeFret = fretValue - shape.baseFret + 1;
    const dot = document.createElement("span");
    dot.className = "finger-dot";
    dot.textContent = shape.fingers[stringIndex] || "";
    setPosition(dot, {
      left: stringLeft + stringIndex * stringSpacing - dotOffset,
      top: 13 + (relativeFret - 1) * fretSpacing,
    });
    fretboard.appendChild(dot);
  });

  diagram.append(markers, fretboard);
  diagramSlot.appendChild(diagram);
}

function renderPractice() {
  const currentId = state.currentChordId;
  const nextId = state.nextChordId;
  const current = getChordById(currentId);
  const next = getChordById(nextId);

  currentPreview.textContent = current?.name ?? "--";
  nextPreview.textContent = next?.name ?? "--";
  practiceTitle.textContent = current?.name ?? "--";
  scoreText.textContent = `通过 ${state.passedCount}`;
  setStatus(state.paused ? "已暂停" : "等待麦克风");
  renderPauseButton();
  renderChordDiagram(currentId);
}

function advancePractice() {
  if (!state.practiceQueue.length) {
    return;
  }

  state.passedCount += 1;
  state.currentChordId =
    state.nextChordId ?? chooseNextChordId(state.practiceQueue, state.currentChordId);
  state.nextChordId = chooseNextChordId(state.practiceQueue, state.currentChordId);
  resetPassProgress();
  renderPractice();
}

function startPractice() {
  state.showDiagram = diagramToggle.checked;
  state.practiceQueue = [...state.selectedIds];
  state.currentIndex = 0;
  state.currentChordId = chooseNextChordId(state.practiceQueue, null);
  state.nextChordId = chooseNextChordId(state.practiceQueue, state.currentChordId);
  state.passedCount = 0;
  state.paused = false;
  state.lastPassAt = null;
  resetPassProgress();
  selectionScreen.classList.add("hidden");
  practiceScreen.classList.remove("hidden");
  renderPractice();
  startListening();
}

function stopListening({ release = false } = {}) {
  state.listening = false;
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  if (release && state.micStream) {
    state.micStream.getTracks().forEach((track) => track.stop());
    state.micStream = null;
    state.micSource = null;
    state.analyser = null;
    state.frequencyData = null;
  }
}

async function ensureAudioInput() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("media-devices-unavailable");
  }

  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();
  }

  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }

  if (!state.micStream) {
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    state.micSource = state.audioContext.createMediaStreamSource(state.micStream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 4096;
    state.analyser.smoothingTimeConstant = 0.82;
    state.micSource.connect(state.analyser);
    state.frequencyData = new Uint8Array(state.analyser.frequencyBinCount);
  }
}

function readCurrentPcp() {
  state.analyser.getByteFrequencyData(state.frequencyData);
  return pcpFromFrequencyBins(state.frequencyData, {
    sampleRate: state.audioContext.sampleRate,
    fftSize: state.analyser.fftSize,
    minFrequency: audioSettings.minFrequency,
    maxFrequency: audioSettings.maxFrequency,
    noiseFloor: audioSettings.noiseFloor,
  });
}

function processAudioFrame(timestamp) {
  if (!state.analyser || !state.frequencyData) {
    return;
  }

  state.lastFrameAt = timestamp;

  if (!state.paused) {
    const chord = getChordById(state.currentChordId);
    const pcp = readCurrentPcp();
    const energy = pcp.reduce((sum, value) => sum + value, 0);
    const score = chord ? scoreTargetChord(pcp, chord.template) : 0;
    const matchesTarget =
      energy >= audioSettings.minEnergy && score >= audioSettings.matchThreshold;
    const passDecision = shouldPassChordFrame({
      matchesTarget,
      timestampMs: timestamp,
      lastPassAtMs: state.lastPassAt,
      cooldownMs: audioSettings.passCooldownMs,
    });

    progressFill.style.width = matchesTarget ? "100%" : "0%";

    if (passDecision.passed) {
      state.lastPassAt = timestamp;
      advancePractice();
      setStatus("通过，下一题", "success");
    } else {
      const detectionStatus = getDetectionStatus({
        energy,
        minEnergy: audioSettings.minEnergy,
        matchesTarget,
      });
      setStatus(detectionStatus.message, detectionStatus.variant);
    }
  }

  state.rafId = requestAnimationFrame(processAudioFrame);
}

async function startListening() {
  stopListening();
  setStatus("请求麦克风权限");

  try {
    await ensureAudioInput();
    state.lastFrameAt = 0;
    state.rafId = requestAnimationFrame(processAudioFrame);
    setStatus("在你的吉他上弹奏");
  } catch (error) {
    const message =
      error.message === "media-devices-unavailable"
        ? "当前浏览器不支持麦克风"
        : "无法打开麦克风，请允许权限后再试";
    setStatus(message, "error");
  }
}

searchInput.addEventListener("input", () => {
  state.searchText = searchInput.value;
  render();
});

diagramToggle.addEventListener("change", () => {
  state.showDiagram = diagramToggle.checked;
});

startPracticeButton.addEventListener("click", () => {
  startPractice();
});

backButton.addEventListener("click", () => {
  stopListening({ release: true });
  state.paused = false;
  selectionScreen.classList.remove("hidden");
  practiceScreen.classList.add("hidden");
});

pauseButton.addEventListener("click", async () => {
  state.paused = !state.paused;
  renderPauseButton();
  resetPassProgress();

  if (state.paused) {
    if (state.audioContext?.state === "running") {
      await state.audioContext.suspend();
    }
    setStatus("已暂停");
    return;
  }

  if (state.audioContext?.state === "suspended") {
    await state.audioContext.resume();
  }
  state.lastFrameAt = 0;
  setStatus("在你的吉他上弹奏");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || practiceScreen.classList.contains("hidden")) {
    return;
  }

  event.preventDefault();
  advancePractice();
});

render();
