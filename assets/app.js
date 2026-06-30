import { CHORD_LIBRARY, CHORD_SHAPES } from "./chord-data.js";
import {
  averagePcpFrames,
  chooseNextChordId,
  createCalibrationProfile,
  detectStrumOnset,
  evaluateChordStrum,
  getDetectionStatus,
  getDiagramFretLabel,
  parseChordInput,
  pcpEnergy,
  pcpFromFrequencyBins,
  validateChordSelection,
} from "./chord-core.js";

const selectionScreen = document.querySelector("#selectionScreen");
const practiceScreen = document.querySelector("#practiceScreen");
const chordEntryForm = document.querySelector("#chordEntryForm");
const chordInput = document.querySelector("#chordInput");
const selectedChips = document.querySelector("#selectedChips");
const selectedCount = document.querySelector("#selectedCount");
const selectionHint = document.querySelector("#selectionHint");
const startPracticeButton = document.querySelector("#startPracticeButton");
const diagramToggle = document.querySelector("#diagramToggle");
const calibrationToggle = document.querySelector("#calibrationToggle");
const calibrationSummary = document.querySelector("#calibrationSummary");
const resetCalibrationButton = document.querySelector("#resetCalibrationButton");
const backButton = document.querySelector("#backButton");
const pauseButton = document.querySelector("#pauseButton");
const currentPreview = document.querySelector("#currentPreview");
const nextPreview = document.querySelector("#nextPreview");
const practiceTitle = document.querySelector("#practiceTitle");
const diagramSlot = document.querySelector("#diagramSlot");
const progressFill = document.querySelector("#progressFill");
const scoreText = document.querySelector("#scoreText");
const statusText = document.querySelector("#statusText");

const CALIBRATION_STORAGE_KEY = "guitar-chord-trainer-calibration-v1";
const CALIBRATION_SAMPLES_PER_CHORD = 3;

const state = {
  selectedIds: [],
  inputText: "",
  inputPending: false,
  inputUnknownTokens: [],
  inputDuplicateTokens: [],
  showDiagram: true,
  useCalibration: true,
  calibrationProfiles: loadCalibrationProfiles(),
  calibration: {
    active: false,
    chordIds: [],
    index: 0,
    samplesByChordId: {},
  },
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
  lastOnsetAt: null,
  previousEnergy: 0,
  analysisWindow: null,
  passProgressMs: 0,
};

const audioSettings = {
  minFrequency: 70,
  maxFrequency: 1400,
  noiseFloor: 18,
  minEnergy: 90,
  matchThreshold: 0.72,
  marginThreshold: 0.08,
  analysisWindowMs: 180,
  onsetMinRiseAmount: 45,
  onsetMinRiseRatio: 1.35,
  onsetRefractoryMs: 260,
  passCooldownMs: 800,
  harmonicWeights: [1, 0.18, 0.08, 0.06],
  magnitudePower: 1.12,
};

function loadCalibrationProfiles() {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([, profile]) => {
        return (
          profile &&
          typeof profile.chordId === "string" &&
          Array.isArray(profile.prototypePcp) &&
          profile.prototypePcp.length === 12
        );
      })
    );
  } catch {
    return {};
  }
}

function saveCalibrationProfiles() {
  try {
    localStorage.setItem(
      CALIBRATION_STORAGE_KEY,
      JSON.stringify(state.calibrationProfiles)
    );
  } catch {
    setStatus("无法保存校准数据，浏览器本地存储不可用", "error");
  }
}

function getCalibratedSelectedCount() {
  return state.selectedIds.filter((id) => state.calibrationProfiles[id]).length;
}

function getMissingCalibrationIds() {
  if (!state.useCalibration) {
    return [];
  }
  return state.selectedIds.filter((id) => !state.calibrationProfiles[id]);
}

function applyChordInput() {
  const result = parseChordInput(chordInput.value, CHORD_LIBRARY);
  state.selectedIds = result.selectedIds;
  state.inputText = chordInput.value;
  state.inputPending = false;
  state.inputUnknownTokens = result.unknownTokens;
  state.inputDuplicateTokens = result.duplicateTokens;
  renderSelectionState();
}

function renderSelectedChips() {
  if (!state.selectedIds.length) {
    selectedChips.replaceChildren();
    return;
  }

  selectedChips.replaceChildren(
    ...state.selectedIds.map((id) => {
      const chord = getChordById(id);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "selected-chip";
      chip.setAttribute("aria-label", `移除 ${chord?.name ?? id}`);
      chip.textContent = chord?.name ?? id;
      chip.addEventListener("click", () => {
        state.selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
        chordInput.value = state.selectedIds
          .map((selectedId) => getChordById(selectedId)?.name ?? selectedId)
          .join("、");
        state.inputText = chordInput.value;
        state.inputPending = false;
        state.inputUnknownTokens = [];
        state.inputDuplicateTokens = [];
        renderSelectionState();
      });
      return chip;
    })
  );
}

function selectionReasonMessage(reason) {
  if (reason === "Select at least 4 chords.") {
    return "请输入至少 4 个和弦。";
  }
  if (reason === "Select no more than 8 chords.") {
    return "最多输入 8 个和弦。";
  }
  return reason;
}

function renderSelectionState() {
  const validation = validateChordSelection(state.selectedIds);
  const calibratedCount = getCalibratedSelectedCount();
  const missingCount = getMissingCalibrationIds().length;
  const hasUnknownTokens = state.inputUnknownTokens.length > 0;
  selectedCount.textContent = `已选 ${state.selectedIds.length} / 8`;
  renderSelectedChips();
  if (state.inputPending) {
    selectionHint.textContent = "点击确认应用这些和弦。";
  } else if (hasUnknownTokens) {
    selectionHint.textContent = `未识别：${state.inputUnknownTokens.join("、")}`;
  } else if (state.inputDuplicateTokens.length) {
    selectionHint.textContent = `已忽略重复：${state.inputDuplicateTokens.join("、")}`;
  } else {
    selectionHint.textContent = validation.valid
      ? "准备好了。"
      : selectionReasonMessage(validation.reason);
  }
  calibrationSummary.textContent = state.useCalibration
    ? `已选和弦中 ${calibratedCount} 个有个人指纹，${missingCount} 个会在开始前校准。`
    : "关闭后将只使用通用和弦模板。";
  resetCalibrationButton.disabled = calibratedCount === 0;
  startPracticeButton.disabled = state.inputPending || hasUnknownTokens || !validation.valid;
}

function render() {
  state.showDiagram = diagramToggle.checked;
  state.useCalibration = calibrationToggle.checked;
  renderSelectionState();
}

function getChordById(id) {
  return CHORD_LIBRARY.find((chord) => chord.id === id);
}

function getPracticeCandidates() {
  return state.practiceQueue.map((id) => {
    const chord = getChordById(id);
    if (!chord) {
      return null;
    }

    const calibrationProfile = state.useCalibration
      ? state.calibrationProfiles[id]
      : null;
    return calibrationProfile ? { ...chord, calibrationProfile } : chord;
  }).filter(Boolean);
}

function setStatus(message, variant = "normal") {
  statusText.textContent = message;
  statusText.classList.toggle("error", variant === "error");
  statusText.classList.toggle("success", variant === "success");
}

function getStrumResultStatus(result) {
  if (result.reason === "wrong-chord" && result.best?.name) {
    return {
      message: `更像 ${result.best.name}，再试一次`,
      variant: "normal",
    };
  }

  if (result.reason === "ambiguous") {
    return { message: "听到了，但和弦不够清楚，再刷一次", variant: "normal" };
  }

  if (result.reason === "low-confidence") {
    return { message: "听到了，但音不够完整，再刷一次", variant: "normal" };
  }

  if (result.reason === "quiet") {
    return { message: "声音太小，再刷一次", variant: "normal" };
  }

  if (result.reason === "cooldown") {
    return { message: "通过后稍等一下", variant: "normal" };
  }

  return { message: "听到了，继续找目标和弦", variant: "normal" };
}

function resetPassProgress() {
  state.passProgressMs = 0;
  state.analysisWindow = null;
  progressFill.style.width = "0%";
}

function resetRecognitionState() {
  state.lastPassAt = null;
  state.lastOnsetAt = null;
  state.previousEnergy = 0;
  state.analysisWindow = null;
  resetPassProgress();
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

function renderCalibration() {
  const chordId = state.calibration.chordIds[state.calibration.index];
  const nextId = state.calibration.chordIds[state.calibration.index + 1];
  const chord = getChordById(chordId);
  const next = getChordById(nextId);
  const sampleCount = state.calibration.samplesByChordId[chordId]?.length ?? 0;
  const nextSample = Math.min(sampleCount + 1, CALIBRATION_SAMPLES_PER_CHORD);

  currentPreview.textContent = "校准";
  nextPreview.textContent = next?.name ?? "练习";
  practiceTitle.textContent = chord?.name ?? "--";
  scoreText.textContent = `校准 ${state.calibration.index + 1}/${state.calibration.chordIds.length}`;
  setStatus(`刷 ${chord?.name ?? "当前和弦"}：第 ${nextSample}/${CALIBRATION_SAMPLES_PER_CHORD} 次`);
  renderPauseButton();
  renderChordDiagram(chordId);
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

function beginPracticeSession({ keepListening = false } = {}) {
  state.practiceQueue = [...state.selectedIds];
  state.currentIndex = 0;
  state.currentChordId = chooseNextChordId(state.practiceQueue, null);
  state.nextChordId = chooseNextChordId(state.practiceQueue, state.currentChordId);
  state.passedCount = 0;
  state.paused = false;
  state.calibration.active = false;
  resetRecognitionState();
  selectionScreen.classList.add("hidden");
  practiceScreen.classList.remove("hidden");
  renderPractice();
  if (!keepListening) {
    startListening();
  }
}

function startCalibration(chordIds) {
  state.practiceQueue = [...state.selectedIds];
  state.calibration = {
    active: true,
    chordIds,
    index: 0,
    samplesByChordId: {},
  };
  state.currentChordId = chordIds[0] ?? null;
  state.nextChordId = chordIds[1] ?? null;
  state.passedCount = 0;
  state.paused = false;
  resetRecognitionState();
  selectionScreen.classList.add("hidden");
  practiceScreen.classList.remove("hidden");
  renderCalibration();
  startListening();
}

function startPractice() {
  state.showDiagram = diagramToggle.checked;
  state.useCalibration = calibrationToggle.checked;
  const missingCalibrationIds = getMissingCalibrationIds();

  if (state.useCalibration && missingCalibrationIds.length) {
    startCalibration(missingCalibrationIds);
    return;
  }

  beginPracticeSession();
}

function handleCalibrationSample(analysisPcp, timestamp) {
  const chordId = state.calibration.chordIds[state.calibration.index];
  if (!chordId) {
    beginPracticeSession({ keepListening: true });
    return;
  }

  const energy = pcpEnergy(analysisPcp);
  if (energy < audioSettings.minEnergy) {
    progressFill.style.width = "0%";
    setStatus("这次声音太小，再刷一次");
    return;
  }

  const samples = state.calibration.samplesByChordId[chordId] ?? [];
  samples.push(analysisPcp);
  state.calibration.samplesByChordId[chordId] = samples;
  state.lastOnsetAt = timestamp;
  state.previousEnergy = energy;

  if (samples.length < CALIBRATION_SAMPLES_PER_CHORD) {
    progressFill.style.width = `${(samples.length / CALIBRATION_SAMPLES_PER_CHORD) * 100}%`;
    renderCalibration();
    setStatus(`已记录 ${samples.length}/${CALIBRATION_SAMPLES_PER_CHORD}，再刷一次`);
    return;
  }

  state.calibrationProfiles[chordId] = createCalibrationProfile({
    chordId,
    pcps: samples,
    minEnergy: audioSettings.minEnergy,
  });
  saveCalibrationProfiles();
  state.calibration.index += 1;
  resetPassProgress();

  if (state.calibration.index >= state.calibration.chordIds.length) {
    render();
    beginPracticeSession({ keepListening: true });
    setStatus("校准完成，开始练习", "success");
    return;
  }

  state.currentChordId = state.calibration.chordIds[state.calibration.index];
  state.nextChordId = state.calibration.chordIds[state.calibration.index + 1] ?? null;
  renderCalibration();
  setStatus("这个和弦已校准，继续下一个", "success");
}

function stopListening({ release = false } = {}) {
  state.listening = false;
  state.analysisWindow = null;
  state.previousEnergy = 0;
  state.lastOnsetAt = null;
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
    harmonicWeights: audioSettings.harmonicWeights,
    magnitudePower: audioSettings.magnitudePower,
  });
}

function processAudioFrame(timestamp) {
  if (!state.analyser || !state.frequencyData) {
    return;
  }

  state.lastFrameAt = timestamp;

  if (!state.paused) {
    const pcp = readCurrentPcp();
    const energy = pcpEnergy(pcp);
    let handledFrame = false;

    if (state.analysisWindow) {
      state.analysisWindow.frames.push(pcp);
      const elapsedMs = timestamp - state.analysisWindow.startedAt;
      const progress = Math.min(
        95,
        Math.max(20, (elapsedMs / audioSettings.analysisWindowMs) * 100)
      );
      progressFill.style.width = `${progress}%`;
      setStatus("听到了，正在判断");
      handledFrame = true;

      if (elapsedMs >= audioSettings.analysisWindowMs) {
        const analysisPcp = averagePcpFrames(state.analysisWindow.frames);
        state.analysisWindow = null;

        if (state.calibration.active) {
          handleCalibrationSample(analysisPcp, timestamp);
          state.previousEnergy = energy;
          state.rafId = requestAnimationFrame(processAudioFrame);
          return;
        }

        const result = evaluateChordStrum({
          pcp: analysisPcp,
          candidates: getPracticeCandidates(),
          targetChordId: state.currentChordId,
          minEnergy: audioSettings.minEnergy,
          matchThreshold: audioSettings.matchThreshold,
          marginThreshold: audioSettings.marginThreshold,
          timestampMs: timestamp,
          lastPassAtMs: state.lastPassAt,
          cooldownMs: audioSettings.passCooldownMs,
        });

        if (result.passed) {
          state.lastPassAt = timestamp;
          state.previousEnergy = 0;
          progressFill.style.width = "100%";
          advancePractice();
          setStatus("通过，下一题", "success");
        } else {
          const status = getStrumResultStatus(result);
          progressFill.style.width = "0%";
          setStatus(status.message, status.variant);
        }
      }
    } else {
      const onset = detectStrumOnset({
        energy,
        previousEnergy: state.previousEnergy,
        minEnergy: audioSettings.minEnergy,
        minRiseAmount: audioSettings.onsetMinRiseAmount,
        minRiseRatio: audioSettings.onsetMinRiseRatio,
        timestampMs: timestamp,
        lastOnsetAtMs: state.lastOnsetAt,
        refractoryMs: audioSettings.onsetRefractoryMs,
      });

      if (onset.started) {
        state.lastOnsetAt = timestamp;
        state.analysisWindow = {
          startedAt: timestamp,
          frames: [pcp],
        };
        progressFill.style.width = "20%";
        setStatus("听到了，正在判断");
        handledFrame = true;
      }
    }

    if (!handledFrame) {
      progressFill.style.width = "0%";
      const detectionStatus = getDetectionStatus({
        energy,
        minEnergy: audioSettings.minEnergy,
        matchesTarget: false,
      });
      setStatus(detectionStatus.message, detectionStatus.variant);
    }

    state.previousEnergy = energy;
  }

  state.rafId = requestAnimationFrame(processAudioFrame);
}

async function startListening() {
  stopListening();
  setStatus("请求麦克风权限");

  try {
    await ensureAudioInput();
    state.lastFrameAt = 0;
    state.previousEnergy = 0;
    state.lastOnsetAt = null;
    state.analysisWindow = null;
    state.rafId = requestAnimationFrame(processAudioFrame);
    if (state.calibration.active) {
      renderCalibration();
    } else {
      setStatus("在你的吉他上弹奏");
    }
  } catch (error) {
    const message =
      error.message === "media-devices-unavailable"
        ? "当前浏览器不支持麦克风"
        : "无法打开麦克风，请允许权限后再试";
    setStatus(message, "error");
  }
}

chordEntryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyChordInput();
});

chordInput.addEventListener("input", () => {
  state.inputText = chordInput.value;
  state.inputUnknownTokens = [];
  state.inputDuplicateTokens = [];
  state.inputPending = chordInput.value.trim().length > 0;
  state.selectedIds = [];
  if (!chordInput.value.trim()) {
    state.inputPending = false;
    renderSelectionState();
    return;
  }
  renderSelectionState();
});

diagramToggle.addEventListener("change", () => {
  state.showDiagram = diagramToggle.checked;
});

calibrationToggle.addEventListener("change", () => {
  state.useCalibration = calibrationToggle.checked;
  renderSelectionState();
});

resetCalibrationButton.addEventListener("click", () => {
  state.selectedIds.forEach((id) => {
    delete state.calibrationProfiles[id];
  });
  saveCalibrationProfiles();
  renderSelectionState();
});

startPracticeButton.addEventListener("click", () => {
  startPractice();
});

backButton.addEventListener("click", () => {
  stopListening({ release: true });
  state.paused = false;
  state.calibration.active = false;
  selectionScreen.classList.remove("hidden");
  practiceScreen.classList.add("hidden");
  render();
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
  state.previousEnergy = 0;
  state.lastOnsetAt = null;
  state.analysisWindow = null;
  if (state.calibration.active) {
    renderCalibration();
  } else {
    setStatus("在你的吉他上弹奏");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || practiceScreen.classList.contains("hidden")) {
    return;
  }

  event.preventDefault();
  advancePractice();
});

render();
