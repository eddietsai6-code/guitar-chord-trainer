export const MIN_SELECTED_CHORDS = 4;
export const MAX_SELECTED_CHORDS = 8;

const PITCH_CLASS_ALIASES = new Map([
  ["C", 0],
  ["B#", 0],
  ["C#", 1],
  ["DB", 1],
  ["D", 2],
  ["D#", 3],
  ["EB", 3],
  ["E", 4],
  ["FB", 4],
  ["E#", 5],
  ["F", 5],
  ["F#", 6],
  ["GB", 6],
  ["G", 7],
  ["G#", 8],
  ["AB", 8],
  ["A", 9],
  ["A#", 10],
  ["BB", 10],
  ["B", 11],
  ["CB", 11],
]);

export function validateChordSelection(selectedIds) {
  const count = Array.isArray(selectedIds) ? selectedIds.length : 0;

  if (count < MIN_SELECTED_CHORDS) {
    return { valid: false, reason: "Select at least 4 chords." };
  }

  if (count > MAX_SELECTED_CHORDS) {
    return { valid: false, reason: "Select no more than 8 chords." };
  }

  return { valid: true, reason: "" };
}

export function clampSelection(selectedIds, chordId) {
  const selected = Array.isArray(selectedIds) ? [...selectedIds] : [];
  const index = selected.indexOf(chordId);

  if (index >= 0) {
    selected.splice(index, 1);
    return selected;
  }

  if (selected.length >= MAX_SELECTED_CHORDS) {
    return selected;
  }

  selected.push(chordId);
  return selected;
}

export function normalizePitchClass(value) {
  return ((value % 12) + 12) % 12;
}

export function pitchClassFromName(name) {
  const key = String(name).trim().toUpperCase();
  if (!PITCH_CLASS_ALIASES.has(key)) {
    throw new Error(`Unknown pitch class: ${name}`);
  }
  return PITCH_CLASS_ALIASES.get(key);
}

export function buildChordTemplate(rootPc, intervals) {
  return intervals.map((interval) => normalizePitchClass(rootPc + interval));
}

export function slugifyChordPart(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace("#", "sharp")
    .replace("/", "-")
    .replace(/\s+/g, "-");
}

export function buildChordLibrary(roots, chordTypes) {
  return roots.flatMap((root) => {
    const rootPc = pitchClassFromName(root.name);

    return chordTypes.map((type) => {
      const id = `${slugifyChordPart(root.name)}-${type.id}`;
      const suffix = type.symbol ?? type.label;
      const name = type.id === "major" ? root.label : `${root.label}${suffix}`;

      return {
        id,
        name,
        root: root.name,
        rootLabel: root.label,
        rootPc,
        typeId: type.id,
        typeLabel: type.label,
        category: type.category,
        aliases: root.aliases ?? [],
        template: buildChordTemplate(rootPc, type.intervals),
      };
    });
  });
}

export function filterChordLibrary(chords, { category = "all", query = "" } = {}) {
  const normalizedQuery = String(query).trim().toLowerCase();

  return chords.filter((chord) => {
    const categoryMatch = category === "all" || chord.category === category;
    const nameMatch =
      !normalizedQuery ||
      chord.name.toLowerCase().includes(normalizedQuery) ||
      chord.rootLabel.toLowerCase().includes(normalizedQuery) ||
      chord.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery));
    return categoryMatch && nameMatch;
  });
}

export function createEmptyPcp() {
  return Array.from({ length: 12 }, () => 0);
}

export function vectorMagnitude(values) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

export function normalizeVector(values) {
  const magnitude = vectorMagnitude(values);
  if (!magnitude) {
    return values.map(() => 0);
  }
  return values.map((value) => value / magnitude);
}

export function templateToVector(template) {
  const vector = createEmptyPcp();
  template.forEach((pitchClass) => {
    vector[normalizePitchClass(pitchClass)] = 1;
  });
  return normalizeVector(vector);
}

export function scoreTargetChord(pcp, template) {
  const normalizedPcp = normalizeVector(pcp);
  const normalizedTemplate = templateToVector(template);
  return normalizedPcp.reduce(
    (score, value, index) => score + value * normalizedTemplate[index],
    0
  );
}

export function updatePassProgress({
  previousProgressMs,
  deltaMs,
  matchesTarget,
  stableMs = 600,
  decayMultiplier = 1,
}) {
  const nextProgress = matchesTarget
    ? previousProgressMs + deltaMs
    : previousProgressMs - deltaMs * decayMultiplier;
  const progressMs = Math.min(stableMs, Math.max(0, nextProgress));
  const progressRatio = stableMs > 0 ? progressMs / stableMs : 0;

  return {
    passed: progressMs >= stableMs,
    progressMs,
    progressRatio,
  };
}

export function getDiagramFretLabel(shape) {
  const baseFret = Number(shape?.baseFret ?? 1);
  return baseFret > 1 ? `${baseFret}f` : "";
}

export function chooseNextChordId(chordIds, currentChordId, random = Math.random) {
  const ids = Array.isArray(chordIds) ? chordIds.filter(Boolean) : [];
  if (!ids.length) {
    return null;
  }

  const candidates =
    ids.length > 1 ? ids.filter((id) => id !== currentChordId) : ids;
  const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
  return candidates[Math.floor(roll * candidates.length)];
}

export function frequencyToPitchClass(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }

  const semitonesFromA4 = Math.round(12 * Math.log2(frequency / 440));
  return normalizePitchClass(9 + semitonesFromA4);
}

export function pcpFromFrequencyBins(
  bins,
  { minFrequency = 70, maxFrequency = 1400, sampleRate, fftSize, noiseFloor = 0 } = {}
) {
  const pcp = createEmptyPcp();
  if (!Array.isArray(bins) && !(bins instanceof Uint8Array) && !(bins instanceof Float32Array)) {
    return pcp;
  }

  Array.from(bins).forEach((bin, index) => {
    const frequency =
      typeof bin === "number" ? (index * sampleRate) / fftSize : bin.frequency;
    const magnitude = typeof bin === "number" ? bin : bin.magnitude;

    if (
      !Number.isFinite(frequency) ||
      !Number.isFinite(magnitude) ||
      frequency < minFrequency ||
      frequency > maxFrequency ||
      magnitude <= noiseFloor
    ) {
      return;
    }

    const pitchClass = frequencyToPitchClass(frequency);
    if (pitchClass !== null) {
      pcp[pitchClass] += magnitude;
    }
  });

  return pcp;
}

export function getDetectionStatus({ energy, minEnergy, matchesTarget }) {
  if (energy < minEnergy) {
    return { message: "在你的吉他上弹奏", variant: "normal" };
  }

  if (matchesTarget) {
    return { message: "保持住", variant: "success" };
  }

  return { message: "听到了，继续找目标和弦", variant: "normal" };
}
