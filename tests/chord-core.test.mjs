import test from "node:test";
import assert from "node:assert/strict";

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
  updatePassProgress,
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

test("updatePassProgress fills after stable target recognition", () => {
  const first = updatePassProgress({
    previousProgressMs: 0,
    deltaMs: 300,
    matchesTarget: true,
    stableMs: 600,
  });

  assert.equal(first.passed, false);
  assert.equal(first.progressMs, 300);
  assert.equal(first.progressRatio, 0.5);

  const second = updatePassProgress({
    previousProgressMs: first.progressMs,
    deltaMs: 300,
    matchesTarget: true,
    stableMs: 600,
  });

  assert.equal(second.passed, true);
  assert.equal(second.progressMs, 600);
  assert.equal(second.progressRatio, 1);
});

test("updatePassProgress decays when target is not matched", () => {
  const result = updatePassProgress({
    previousProgressMs: 400,
    deltaMs: 200,
    matchesTarget: false,
    stableMs: 600,
  });

  assert.equal(result.passed, false);
  assert.equal(result.progressMs, 200);
  assert.equal(result.progressRatio, 1 / 3);
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

import { getDetectionStatus } from "../assets/chord-core.js";

test("getDetectionStatus explains quiet, matching, and nonmatching frames", () => {
  assert.deepEqual(
    getDetectionStatus({ energy: 20, minEnergy: 90, matchesTarget: false }),
    { message: "在你的吉他上弹奏", variant: "normal" }
  );
  assert.deepEqual(
    getDetectionStatus({ energy: 110, minEnergy: 90, matchesTarget: true }),
    { message: "保持住", variant: "success" }
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
