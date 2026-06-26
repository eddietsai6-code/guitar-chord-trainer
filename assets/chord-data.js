import {
  buildChordLibrary,
  pitchClassFromName,
  slugifyChordPart,
} from "./chord-core.js";

export const ROOTS = [
  { name: "C", label: "C", aliases: ["B#"] },
  { name: "C#", label: "C# / Db", aliases: ["Db"] },
  { name: "D", label: "D", aliases: [] },
  { name: "D#", label: "D# / Eb", aliases: ["Eb"] },
  { name: "E", label: "E", aliases: ["Fb"] },
  { name: "F", label: "F", aliases: ["E#"] },
  { name: "F#", label: "F# / Gb", aliases: ["Gb"] },
  { name: "G", label: "G", aliases: [] },
  { name: "G#", label: "G# / Ab", aliases: ["Ab"] },
  { name: "A", label: "A", aliases: [] },
  { name: "A#", label: "A# / Bb", aliases: ["Bb"] },
  { name: "B", label: "B", aliases: ["Cb"] },
];

export const CHORD_TYPES = [
  { id: "major", label: "major", symbol: "", category: "basic", intervals: [0, 4, 7] },
  { id: "minor", label: "minor", symbol: "m", category: "basic", intervals: [0, 3, 7] },
  { id: "5", label: "5", symbol: "5", category: "power", intervals: [0, 7] },
  { id: "7", label: "7", symbol: "7", category: "seventh", intervals: [0, 4, 7, 10] },
  { id: "maj7", label: "maj7", symbol: "maj7", category: "seventh", intervals: [0, 4, 7, 11] },
  { id: "m7", label: "m7", symbol: "m7", category: "seventh", intervals: [0, 3, 7, 10] },
  { id: "sus2", label: "sus2", symbol: "sus2", category: "suspended", intervals: [0, 2, 7] },
  { id: "sus4", label: "sus4", symbol: "sus4", category: "suspended", intervals: [0, 5, 7] },
  { id: "add9", label: "add9", symbol: "add9", category: "added", intervals: [0, 4, 7, 14] },
  { id: "dim", label: "dim", symbol: "dim", category: "color", intervals: [0, 3, 6] },
  { id: "aug", label: "aug", symbol: "aug", category: "color", intervals: [0, 4, 8] },
];

export const CHORD_LIBRARY = buildChordLibrary(ROOTS, CHORD_TYPES);

const E_STRING_PC = 4;
const A_STRING_PC = 9;

const MOVABLE_PATTERNS = {
  major: {
    stringPc: E_STRING_PC,
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [1, 3, 4, 2, 1, 1],
    barres: [{ relativeFret: 0, fromString: 0, toString: 5, finger: 1 }],
  },
  minor: {
    stringPc: E_STRING_PC,
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [1, 3, 4, 1, 1, 1],
    barres: [{ relativeFret: 0, fromString: 0, toString: 5, finger: 1 }],
  },
  "5": {
    stringPc: E_STRING_PC,
    frets: [0, 2, 2, "x", "x", "x"],
    fingers: [1, 3, 4, 0, 0, 0],
    barres: [],
  },
  "7": {
    stringPc: E_STRING_PC,
    frets: [0, 2, 0, 1, 0, 0],
    fingers: [1, 3, 1, 2, 1, 1],
    barres: [{ relativeFret: 0, fromString: 0, toString: 5, finger: 1 }],
  },
  maj7: {
    stringPc: E_STRING_PC,
    frets: [0, 2, 1, 1, 0, 0],
    fingers: [1, 3, 2, 2, 1, 1],
    barres: [
      { relativeFret: 0, fromString: 0, toString: 5, finger: 1 },
      { relativeFret: 1, fromString: 2, toString: 3, finger: 2 },
    ],
  },
  m7: {
    stringPc: E_STRING_PC,
    frets: [0, 2, 0, 0, 0, 0],
    fingers: [1, 3, 1, 1, 1, 1],
    barres: [{ relativeFret: 0, fromString: 0, toString: 5, finger: 1 }],
  },
  sus2: {
    stringPc: E_STRING_PC,
    frets: [0, 2, 4, 4, 0, 0],
    fingers: [1, 2, 3, 4, 1, 1],
    barres: [{ relativeFret: 0, fromString: 0, toString: 5, finger: 1 }],
  },
  sus4: {
    stringPc: E_STRING_PC,
    frets: [0, 2, 2, 2, 0, 0],
    fingers: [1, 2, 3, 4, 1, 1],
    barres: [{ relativeFret: 0, fromString: 0, toString: 5, finger: 1 }],
  },
  add9: {
    stringPc: E_STRING_PC,
    frets: [0, 2, 4, 1, 0, 0],
    fingers: [1, 2, 4, 3, 1, 1],
    barres: [{ relativeFret: 0, fromString: 0, toString: 5, finger: 1 }],
  },
  dim: {
    stringPc: A_STRING_PC,
    frets: ["x", 0, 1, 2, 1, "x"],
    fingers: [0, 1, 2, 4, 3, 0],
    barres: [],
  },
  aug: {
    stringPc: E_STRING_PC,
    frets: [0, 3, 2, 1, 1, 0],
    fingers: [1, 4, 3, 2, 2, 1],
    barres: [
      { relativeFret: 0, fromString: 0, toString: 5, finger: 1 },
      { relativeFret: 1, fromString: 3, toString: 4, finger: 2 },
    ],
  },
};

function rootFretForString(rootName, stringPc) {
  const rootPc = pitchClassFromName(rootName);
  const fret = (rootPc - stringPc + 12) % 12;
  return fret === 0 ? 12 : fret;
}

function buildMovableShape(rootName, typeId) {
  const pattern = MOVABLE_PATTERNS[typeId];
  const baseFret = rootFretForString(rootName, pattern.stringPc);
  const frets = pattern.frets.map((fret) =>
    fret === "x" ? "x" : baseFret + fret
  );

  return {
    baseFret,
    frets,
    fingers: pattern.fingers,
    muted: frets.flatMap((fret, index) => (fret === "x" ? [index] : [])),
    open: [],
    barres: pattern.barres.map((barre) => ({
      fret: baseFret + barre.relativeFret,
      fromString: barre.fromString,
      toString: barre.toString,
      finger: barre.finger,
    })),
  };
}

function buildGeneratedShapes() {
  return Object.fromEntries(
    ROOTS.flatMap((root) =>
      CHORD_TYPES.map((type) => [
        `${slugifyChordPart(root.name)}-${type.id}`,
        buildMovableShape(root.name, type.id),
      ])
    )
  );
}

const OPEN_SHAPE_OVERRIDES = {
  "g-major": {
    baseFret: 1,
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
    muted: [],
    open: [2, 3, 4],
    barres: [],
  },
  "g-7": {
    baseFret: 1,
    frets: [3, 2, 0, 0, 0, 1],
    fingers: [3, 2, 0, 0, 0, 1],
    muted: [],
    open: [2, 3, 4],
    barres: [],
  },
  "d-major": {
    baseFret: 1,
    frets: ["x", "x", 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
    muted: [0, 1],
    open: [2],
    barres: [],
  },
  "d-minor": {
    baseFret: 1,
    frets: ["x", "x", 0, 2, 3, 1],
    fingers: [0, 0, 0, 2, 3, 1],
    muted: [0, 1],
    open: [2],
    barres: [],
  },
  "d-sus4": {
    baseFret: 1,
    frets: ["x", "x", 0, 2, 3, 3],
    fingers: [0, 0, 0, 1, 3, 4],
    muted: [0, 1],
    open: [2],
    barres: [],
  },
  "e-major": {
    baseFret: 1,
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [0, 2, 3, 1, 0, 0],
    muted: [],
    open: [0, 4, 5],
    barres: [],
  },
  "e-minor": {
    baseFret: 1,
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0],
    muted: [],
    open: [0, 3, 4, 5],
    barres: [],
  },
  "e-7": {
    baseFret: 1,
    frets: [0, 2, 0, 1, 0, 0],
    fingers: [0, 2, 0, 1, 0, 0],
    muted: [],
    open: [0, 2, 4, 5],
    barres: [],
  },
  "c-major": {
    baseFret: 1,
    frets: ["x", 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
    muted: [0],
    open: [3, 5],
    barres: [],
  },
  "c-add9": {
    baseFret: 1,
    frets: ["x", 3, 2, 0, 3, 3],
    fingers: [0, 2, 1, 0, 3, 4],
    muted: [0],
    open: [3],
    barres: [],
  },
  "f-major": {
    baseFret: 1,
    frets: [1, 3, 3, 2, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    muted: [],
    open: [],
    barres: [{ fret: 1, fromString: 0, toString: 5, finger: 1 }],
  },
  "a-major": {
    baseFret: 1,
    frets: ["x", 0, 2, 2, 2, 0],
    fingers: [0, 0, 1, 2, 3, 0],
    muted: [0],
    open: [1, 5],
    barres: [],
  },
  "a-minor": {
    baseFret: 1,
    frets: ["x", 0, 2, 2, 1, 0],
    fingers: [0, 0, 2, 3, 1, 0],
    muted: [0],
    open: [1, 5],
    barres: [],
  },
  "a-7": {
    baseFret: 1,
    frets: ["x", 0, 2, 0, 2, 0],
    fingers: [0, 0, 2, 0, 3, 0],
    muted: [0],
    open: [1, 3, 5],
    barres: [],
  },
  "a-dim": {
    baseFret: 1,
    frets: ["x", 0, 1, 2, 1, "x"],
    fingers: [0, 0, 1, 3, 2, 0],
    muted: [0, 5],
    open: [1],
    barres: [],
  },
};

export const CHORD_SHAPES = {
  ...buildGeneratedShapes(),
  ...OPEN_SHAPE_OVERRIDES,
};
