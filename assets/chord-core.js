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

export function normalizeChordInputToken(value) {
  return String(value)
    .normalize("NFKC")
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function chordInputSuffix(chord) {
  if (chord.typeId === "major") {
    return "";
  }
  if (chord.typeId === "minor") {
    return "m";
  }
  return chord.typeId;
}

export function buildChordInputLookup(chords) {
  const lookup = new Map();
  const list = Array.isArray(chords) ? chords : [];

  list.forEach((chord) => {
    const suffix = chordInputSuffix(chord);
    const names = [
      chord.name,
      chord.rootLabel,
      `${chord.root}${suffix}`,
      ...(chord.aliases ?? []).map((alias) => `${alias}${suffix}`),
    ];

    names.forEach((name) => {
      const key = normalizeChordInputToken(name);
      if (key && !lookup.has(key)) {
        lookup.set(key, chord.id);
      }
    });
  });

  return lookup;
}

export function parseChordInput(input, chords) {
  const lookup = buildChordInputLookup(chords);
  const tokens = String(input)
    .normalize("NFKC")
    .split(/[\s,，、;；|]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const selectedIds = [];
  const seenIds = new Set();
  const unknownTokens = [];
  const duplicateTokens = [];

  tokens.forEach((token) => {
    const chordId = lookup.get(normalizeChordInputToken(token));
    if (!chordId) {
      unknownTokens.push(token);
      return;
    }

    if (seenIds.has(chordId)) {
      duplicateTokens.push(token);
      return;
    }

    seenIds.add(chordId);
    selectedIds.push(chordId);
  });

  return { selectedIds, unknownTokens, duplicateTokens };
}

export function createEmptyPcp() {
  return Array.from({ length: 12 }, () => 0);
}

export function pcpEnergy(pcp) {
  if (!Array.isArray(pcp) && !(pcp instanceof Float32Array)) {
    return 0;
  }
  return Array.from(pcp).reduce((sum, value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? sum + Math.max(0, numericValue) : sum;
  }, 0);
}

export function addPcpVectors(left, right) {
  const result = createEmptyPcp();
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number(left?.[index] ?? 0) + Number(right?.[index] ?? 0);
  }
  return result;
}

export function averagePcpFrames(frames) {
  if (!Array.isArray(frames) || !frames.length) {
    return createEmptyPcp();
  }

  const total = frames.reduce(
    (sum, frame) => addPcpVectors(sum, frame),
    createEmptyPcp()
  );

  return total.map((value) => value / frames.length);
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

export function scorePcpPrototype(pcp, prototypePcp) {
  const normalizedPcp = normalizeVector(pcp);
  const normalizedPrototype = normalizeVector(prototypePcp);
  return normalizedPcp.reduce(
    (score, value, index) => score + value * normalizedPrototype[index],
    0
  );
}

export function createCalibrationProfile({
  chordId,
  pcps,
  minEnergy = 1,
  timestampMs = Date.now(),
} = {}) {
  if (!chordId) {
    throw new Error("Calibration profile requires a chord id.");
  }

  if (!Array.isArray(pcps) || !pcps.length) {
    throw new Error("Calibration samples are required.");
  }

  const validPcps = pcps.filter((pcp) => pcpEnergy(pcp) >= minEnergy);
  if (!validPcps.length) {
    throw new Error("Calibration samples are too quiet.");
  }

  return {
    chordId,
    prototypePcp: normalizeVector(averagePcpFrames(validPcps)),
    sampleCount: validPcps.length,
    updatedAtMs: timestampMs,
  };
}

export function rankChordCandidates(pcp, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  return list
    .filter((candidate) => candidate?.id && Array.isArray(candidate.template))
    .map((candidate) => ({
      chordId: candidate.id,
      name: candidate.name ?? candidate.id,
      score: Array.isArray(candidate.calibrationProfile?.prototypePcp)
        ? scorePcpPrototype(pcp, candidate.calibrationProfile.prototypePcp)
        : scoreTargetChord(pcp, candidate.template),
      source: Array.isArray(candidate.calibrationProfile?.prototypePcp)
        ? "calibrated"
        : "generic",
    }))
    .sort((left, right) => right.score - left.score);
}

export function shouldPassChordFrame({
  matchesTarget,
  timestampMs,
  lastPassAtMs,
  cooldownMs = 800,
}) {
  const elapsedSincePass =
    Number.isFinite(lastPassAtMs) ? timestampMs - lastPassAtMs : Infinity;
  const cooldownRemainingMs = Math.max(0, cooldownMs - elapsedSincePass);
  const inCooldown = cooldownRemainingMs > 0;

  return {
    passed: Boolean(matchesTarget && !inCooldown),
    inCooldown,
    cooldownRemainingMs,
  };
}

export function evaluateChordStrum({
  pcp,
  candidates,
  targetChordId,
  minEnergy = 90,
  matchThreshold = 0.72,
  marginThreshold = 0.08,
  timestampMs = 0,
  lastPassAtMs = null,
  cooldownMs = 800,
} = {}) {
  const energy = pcpEnergy(pcp);
  const ranked = rankChordCandidates(pcp, candidates);
  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const margin = best ? best.score - (second?.score ?? 0) : 0;
  const targetWins = best?.chordId === targetChordId;
  const confident =
    energy >= minEnergy &&
    targetWins &&
    best.score >= matchThreshold &&
    margin >= marginThreshold;
  const passDecision = shouldPassChordFrame({
    matchesTarget: confident,
    timestampMs,
    lastPassAtMs,
    cooldownMs,
  });

  let reason = "passed";
  if (energy < minEnergy) {
    reason = "quiet";
  } else if (!best) {
    reason = "no-candidates";
  } else if (!targetWins) {
    reason = "wrong-chord";
  } else if (best.score < matchThreshold) {
    reason = "low-confidence";
  } else if (margin < marginThreshold) {
    reason = "ambiguous";
  } else if (passDecision.inCooldown) {
    reason = "cooldown";
  }

  return {
    passed: passDecision.passed,
    reason,
    energy,
    best,
    second,
    margin,
    inCooldown: passDecision.inCooldown,
    cooldownRemainingMs: passDecision.cooldownRemainingMs,
  };
}

export function detectStrumOnset({
  energy = 0,
  previousEnergy = 0,
  minEnergy = 90,
  minRiseAmount = 35,
  minRiseRatio = 1.35,
  minGateRiseAmount = 8,
  timestampMs = 0,
  lastOnsetAtMs = null,
  refractoryMs = 220,
} = {}) {
  const currentEnergy = Number.isFinite(energy) ? energy : 0;
  const previous = Number.isFinite(previousEnergy) ? previousEnergy : 0;
  const rise = currentEnergy - previous;
  const ratio = previous > 0 ? currentEnergy / previous : currentEnergy > 0 ? Infinity : 0;
  const elapsedSinceOnset = Number.isFinite(lastOnsetAtMs)
    ? timestampMs - lastOnsetAtMs
    : Infinity;
  const inRefractory = elapsedSinceOnset < refractoryMs;
  const loudEnough = currentEnergy >= minEnergy;
  const suddenRise = rise >= minRiseAmount || (rise > 0 && ratio >= minRiseRatio);
  const crossedGate =
    previous < minEnergy &&
    loudEnough &&
    rise >= Math.max(1, minGateRiseAmount);

  return {
    started: Boolean(loudEnough && (suddenRise || crossedGate) && !inRefractory),
    inRefractory,
    rise,
    ratio,
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
  {
    minFrequency = 70,
    maxFrequency = 1400,
    sampleRate,
    fftSize,
    noiseFloor = 0,
    harmonicWeights = [1],
    magnitudePower = 1,
  } = {}
) {
  const pcp = createEmptyPcp();
  if (!Array.isArray(bins) && !(bins instanceof Uint8Array) && !(bins instanceof Float32Array)) {
    return pcp;
  }

  const weights =
    Array.isArray(harmonicWeights) && harmonicWeights.length
      ? harmonicWeights
      : [1];

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

    const weightedMagnitude = Math.pow(magnitude, magnitudePower);
    weights.forEach((weight, harmonicIndex) => {
      if (!Number.isFinite(weight) || weight <= 0) {
        return;
      }

      const harmonicNumber = harmonicIndex + 1;
      const inferredFrequency = frequency / harmonicNumber;
      if (inferredFrequency < minFrequency || inferredFrequency > maxFrequency) {
        return;
      }

      const pitchClass = frequencyToPitchClass(inferredFrequency);
      if (pitchClass !== null) {
        pcp[pitchClass] += weightedMagnitude * weight;
      }
    });
  });

  return pcp;
}

export function getDetectionStatus({ energy, minEnergy, matchesTarget }) {
  if (energy < minEnergy) {
    return { message: "在你的吉他上弹奏", variant: "normal" };
  }

  if (matchesTarget) {
    return { message: "识别正确", variant: "success" };
  }

  return { message: "听到了，继续找目标和弦", variant: "normal" };
}
