import test from "node:test";
import assert from "node:assert/strict";
import * as chordCore from "../assets/chord-core.js";

import {
  MAX_SELECTED_CHORDS,
  MIN_SELECTED_CHORDS,
  clampSelection,
  validateChordSelection,
} from "../assets/chord-core.js";

test("selection limits match the first-version practice rule", () => {
  assert.equal(MIN_SELECTED_CHORDS, 4);
  assert.equal(MAX_SELECTED_CHORDS, 8);
});

test("validateChordSelection rejects fewer than four chords", () => {
  const result = validateChordSelection(["G", "D", "Em"]);

  assert.equal(result.valid, false);
  assert.equal(result.reason, "Select at least 4 chords.");
});

test("validateChordSelection accepts four to eight chords", () => {
  assert.deepEqual(validateChordSelection(["G", "D", "Em", "C"]), {
    valid: true,
    reason: "",
  });

  assert.deepEqual(
    validateChordSelection(["G", "D", "Em", "C", "A", "E", "Am", "F"]),
    { valid: true, reason: "" }
  );
});

test("validateChordSelection rejects more than eight chords", () => {
  const result = validateChordSelection([
    "G",
    "D",
    "Em",
    "C",
    "A",
    "E",
    "Am",
    "F",
    "Dm",
  ]);

  assert.equal(result.valid, false);
  assert.equal(result.reason, "Select no more than 8 chords.");
});

test("clampSelection keeps existing choices and rejects the ninth chord", () => {
  const selected = ["G", "D", "Em", "C", "A", "E", "Am", "F"];

  assert.deepEqual(clampSelection(selected, "Dm"), selected);
  assert.deepEqual(clampSelection(selected, "A"), [
    "G",
    "D",
    "Em",
    "C",
    "E",
    "Am",
    "F",
  ]);
});

import {
  buildChordLibrary,
  buildChordTemplate,
  normalizePitchClass,
  pitchClassFromName,
} from "../assets/chord-core.js";

import { CHORD_TYPES, ROOTS } from "../assets/chord-data.js";

test("pitchClassFromName supports sharp and flat aliases", () => {
  assert.equal(pitchClassFromName("C"), 0);
  assert.equal(pitchClassFromName("C#"), 1);
  assert.equal(pitchClassFromName("Db"), 1);
  assert.equal(pitchClassFromName("Bb"), 10);
  assert.equal(pitchClassFromName("A#"), 10);
});

test("normalizePitchClass wraps intervals into one octave", () => {
  assert.equal(normalizePitchClass(14), 2);
  assert.equal(normalizePitchClass(-1), 11);
});

test("buildChordTemplate shifts intervals from the root pitch class", () => {
  assert.deepEqual(buildChordTemplate(7, [0, 4, 7]), [7, 11, 2]);
  assert.deepEqual(buildChordTemplate(9, [0, 3, 7, 10]), [9, 0, 4, 7]);
});

test("buildChordLibrary creates all root and common type combinations", () => {
  const library = buildChordLibrary(ROOTS, CHORD_TYPES);
  const expectedCount = ROOTS.length * CHORD_TYPES.length;

  assert.equal(library.length, expectedCount);
  assert.ok(library.some((chord) => chord.id === "g-major"));
  assert.ok(library.some((chord) => chord.id === "asharp-maj7"));
  assert.deepEqual(
    library.find((chord) => chord.id === "g-major").template,
    [7, 11, 2]
  );
});

import { filterChordLibrary } from "../assets/chord-core.js";
import { CHORD_LIBRARY, CHORD_SHAPES } from "../assets/chord-data.js";

test("filterChordLibrary filters by category", () => {
  const basicChords = filterChordLibrary(CHORD_LIBRARY, {
    category: "basic",
    query: "",
  });

  assert.ok(basicChords.length > 0);
  assert.ok(basicChords.every((chord) => chord.category === "basic"));
});

test("filterChordLibrary searches chord names and aliases", () => {
  const emResults = filterChordLibrary(CHORD_LIBRARY, {
    category: "all",
    query: "Em",
  });
  const bbResults = filterChordLibrary(CHORD_LIBRARY, {
    category: "all",
    query: "Bb",
  });

  assert.ok(emResults.some((chord) => chord.id === "e-minor"));
  assert.ok(bbResults.some((chord) => chord.id === "asharp-major"));
});

import {
  createEmptyPcp,
  scoreTargetChord,
  shouldPassChordFrame,
  vectorMagnitude,
} from "../assets/chord-core.js";

test("createEmptyPcp returns twelve zeros", () => {
  assert.deepEqual(createEmptyPcp(), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test("vectorMagnitude computes Euclidean length", () => {
  assert.equal(vectorMagnitude([3, 4]), 5);
});

test("scoreTargetChord rewards template notes and penalizes unrelated energy", () => {
  const gTemplate = [7, 11, 2];
  const matchingPcp = createEmptyPcp();
  matchingPcp[7] = 1;
  matchingPcp[11] = 1;
  matchingPcp[2] = 1;

  const unrelatedPcp = createEmptyPcp();
  unrelatedPcp[0] = 1;
  unrelatedPcp[5] = 1;
  unrelatedPcp[9] = 1;

  assert.ok(scoreTargetChord(matchingPcp, gTemplate) > 0.95);
  assert.ok(scoreTargetChord(unrelatedPcp, gTemplate) < 0.2);
});

test("shouldPassChordFrame passes on a single matching strum frame", () => {
  assert.deepEqual(
    shouldPassChordFrame({
      matchesTarget: true,
      timestampMs: 1200,
      lastPassAtMs: null,
      cooldownMs: 800,
    }),
    { passed: true, inCooldown: false, cooldownRemainingMs: 0 }
  );
});

test("shouldPassChordFrame blocks repeated passes during cooldown", () => {
  assert.deepEqual(
    shouldPassChordFrame({
      matchesTarget: true,
      timestampMs: 1500,
      lastPassAtMs: 1000,
      cooldownMs: 800,
    }),
    { passed: false, inCooldown: true, cooldownRemainingMs: 300 }
  );

  assert.deepEqual(
    shouldPassChordFrame({
      matchesTarget: false,
      timestampMs: 1900,
      lastPassAtMs: 1000,
      cooldownMs: 800,
    }),
    { passed: false, inCooldown: false, cooldownRemainingMs: 0 }
  );
});

import { getDiagramFretLabel } from "../assets/chord-core.js";

test("getDiagramFretLabel hides open-position fret labels", () => {
  assert.equal(getDiagramFretLabel({ baseFret: 1 }), "");
});

test("getDiagramFretLabel shows high-position base fret as nf", () => {
  assert.equal(getDiagramFretLabel({ baseFret: 5 }), "5f");
  assert.equal(getDiagramFretLabel({ baseFret: 7 }), "7f");
});

import { chooseNextChordId } from "../assets/chord-core.js";

test("chooseNextChordId keeps a single available chord", () => {
  assert.equal(chooseNextChordId(["g-major"], "g-major"), "g-major");
});

test("chooseNextChordId avoids repeating the current chord when possible", () => {
  const selected = ["g-major", "d-major", "e-minor", "c-major"];

  assert.equal(chooseNextChordId(selected, "g-major", () => 0), "d-major");
  assert.equal(chooseNextChordId(selected, "g-major", () => 0.99), "c-major");
});

import { frequencyToPitchClass, pcpFromFrequencyBins } from "../assets/chord-core.js";

test("frequencyToPitchClass maps reference frequencies to pitch classes", () => {
  assert.equal(frequencyToPitchClass(440), 9);
  assert.equal(frequencyToPitchClass(261.63), 0);
  assert.equal(frequencyToPitchClass(329.63), 4);
  assert.equal(frequencyToPitchClass(0), null);
});

test("pcpFromFrequencyBins accumulates octave-related energy into pitch classes", () => {
  const pcp = pcpFromFrequencyBins([
    { frequency: 110, magnitude: 0.5 },
    { frequency: 220, magnitude: 0.5 },
    { frequency: 329.63, magnitude: 1 },
    { frequency: 40, magnitude: 1 },
  ]);

  assert.equal(pcp[9], 1);
  assert.equal(pcp[4], 1);
  assert.equal(pcp[0], 0);
});

test("pcpFromFrequencyBins can fold strong harmonics back to likely fundamentals", () => {
  const pcp = pcpFromFrequencyBins(
    [{ frequency: 660, magnitude: 1 }],
    { harmonicWeights: [0, 0, 1] }
  );

  assert.ok(pcp[9] > 0.9);
  assert.equal(pcp[4], 0);
});

test("detectStrumOnset starts on a sudden attack, not steady loud audio", () => {
  const detectStrumOnset = chordCore.detectStrumOnset;
  assert.equal(typeof detectStrumOnset, "function");

  assert.equal(
    detectStrumOnset({
      energy: 40,
      previousEnergy: 10,
      minEnergy: 90,
      timestampMs: 1000,
    }).started,
    false
  );

  assert.equal(
    detectStrumOnset({
      energy: 130,
      previousEnergy: 120,
      minEnergy: 90,
      minRiseAmount: 35,
      minRiseRatio: 1.35,
      timestampMs: 1100,
    }).started,
    false
  );

  assert.equal(
    detectStrumOnset({
      energy: 150,
      previousEnergy: 60,
      minEnergy: 90,
      minRiseAmount: 35,
      minRiseRatio: 1.35,
      timestampMs: 1200,
    }).started,
    true
  );

  const refractory = detectStrumOnset({
    energy: 180,
    previousEnergy: 60,
    minEnergy: 90,
    timestampMs: 1300,
    lastOnsetAtMs: 1200,
    refractoryMs: 220,
  });

  assert.equal(refractory.started, false);
  assert.equal(refractory.inRefractory, true);
});

test("evaluateChordStrum only passes when the target wins the selected candidates", () => {
  const evaluateChordStrum = chordCore.evaluateChordStrum;
  assert.equal(typeof evaluateChordStrum, "function");

  const gMajor = { id: "g-major", name: "G", template: [7, 11, 2] };
  const dMajor = { id: "d-major", name: "D", template: [2, 6, 9] };
  const pcp = createEmptyPcp();
  pcp[7] = 80;
  pcp[11] = 80;
  pcp[2] = 80;

  const correct = evaluateChordStrum({
    pcp,
    candidates: [gMajor, dMajor],
    targetChordId: "g-major",
    minEnergy: 90,
    matchThreshold: 0.72,
    marginThreshold: 0.08,
    timestampMs: 2000,
    lastPassAtMs: null,
    cooldownMs: 800,
  });

  assert.equal(correct.passed, true);
  assert.equal(correct.best.chordId, "g-major");
  assert.equal(correct.second.chordId, "d-major");
  assert.ok(correct.margin > 0.08);

  const wrongTarget = evaluateChordStrum({
    pcp,
    candidates: [gMajor, dMajor],
    targetChordId: "d-major",
    minEnergy: 90,
    matchThreshold: 0.72,
    marginThreshold: 0.08,
    timestampMs: 2000,
    lastPassAtMs: null,
    cooldownMs: 800,
  });

  assert.equal(wrongTarget.passed, false);
  assert.equal(wrongTarget.reason, "wrong-chord");

  const ambiguousPcp = createEmptyPcp();
  ambiguousPcp[2] = 120;
  const ambiguous = evaluateChordStrum({
    pcp: ambiguousPcp,
    candidates: [gMajor, dMajor],
    targetChordId: "g-major",
    minEnergy: 90,
    matchThreshold: 0.4,
    marginThreshold: 0.08,
    timestampMs: 2000,
    lastPassAtMs: null,
    cooldownMs: 800,
  });

  assert.equal(ambiguous.passed, false);
  assert.equal(ambiguous.reason, "ambiguous");
});

import { getDetectionStatus } from "../assets/chord-core.js";

test("getDetectionStatus explains quiet, matching, and nonmatching frames", () => {
  assert.deepEqual(
    getDetectionStatus({ energy: 20, minEnergy: 90, matchesTarget: false }),
    { message: "在你的吉他上弹奏", variant: "normal" }
  );
  assert.deepEqual(
    getDetectionStatus({ energy: 110, minEnergy: 90, matchesTarget: true }),
    { message: "识别正确", variant: "success" }
  );
  assert.deepEqual(
    getDetectionStatus({ energy: 110, minEnergy: 90, matchesTarget: false }),
    { message: "听到了，继续找目标和弦", variant: "normal" }
  );
});

test("CHORD_SHAPES contains a diagram shape for every generated chord", () => {
  const missingShapeIds = CHORD_LIBRARY
    .map((chord) => chord.id)
    .filter((id) => !CHORD_SHAPES[id]);

  assert.deepEqual(missingShapeIds, []);
  assert.equal(Object.keys(CHORD_SHAPES).length, CHORD_LIBRARY.length);
});
