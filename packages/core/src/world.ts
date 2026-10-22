/**
 * The story world's fixed vocabulary. The story planner may only cast characters of these kinds
 * and set scenes in these locations, because each one maps to art, a default voice and its own
 * sounds. Add a kind or location here only together with its art (apps/video/art) and sounds.
 */

export const CAST_KINDS = {
  girl: { human: true, voice: "phoebe", pitch: 1.2, sound: "giggle" },
  boy: { human: true, voice: "arcas", pitch: 1.22, sound: "giggle" },
  mother: { human: true, voice: "athena", pitch: 1.0, sound: null },
  father: { human: true, voice: "orion", pitch: 0.95, sound: null },
  grandmother: { human: true, voice: "vesta", pitch: 0.92, sound: null },
  shopkeeper: { human: true, voice: "hermes", pitch: 1.0, sound: null },
  teacher: { human: true, voice: "cora", pitch: 1.0, sound: null },
  farmer: { human: true, voice: "atlas", pitch: 0.95, sound: null },
  king: { human: true, voice: "zeus", pitch: 0.9, sound: null },
  minister: { human: true, voice: "apollo", pitch: 1.0, sound: null },
  cow: { human: false, voice: "jupiter", pitch: 0.82, sound: "moo" },
  dog: { human: false, voice: "mars", pitch: 1.15, sound: "bark" },
  cat: { human: false, voice: "luna", pitch: 1.3, sound: "meow" },
  monkey: { human: false, voice: "aries", pitch: 1.35, sound: "monkey" },
  parrot: { human: false, voice: "thalia", pitch: 1.4, sound: "parrot" },
  elephant: { human: false, voice: "saturn", pitch: 0.78, sound: "elephant" },
  goat: { human: false, voice: "janus", pitch: 1.2, sound: "goat" },
  rabbit: { human: false, voice: "aurora", pitch: 1.35, sound: "boing" },
  crow: { human: false, voice: "draco", pitch: 1.2, sound: "crow" },
  tortoise: { human: false, voice: "neptune", pitch: 0.85, sound: "tiptoe" },
  peacock: { human: false, voice: "electra", pitch: 1.15, sound: "peacock" },
  sparrow: { human: false, voice: "harmonia", pitch: 1.45, sound: "birds" },
} as const;
export type CastKind = keyof typeof CAST_KINDS;
export const CAST_KIND_IDS = Object.keys(CAST_KINDS) as CastKind[];

export const LOCATIONS = {
  "village-lane": "a dusty village lane with huts, a well and marigold pots",
  market: "a busy village market with fruit and sweet stalls",
  courtyard: "a home courtyard with a tulsi plant, a swing and a clay stove",
  "river-bank": "a sunny river bank with smooth stones and reeds",
  school: "a small village school under a neem tree with a blackboard",
  field: "green fields with a scarecrow and a bullock cart",
  forest: "a friendly forest edge with tall trees and a pond",
  palace: "a king's palace hall with pillars and a big throne",
  banyan: "the old banyan tree where Ajja tells stories",
} as const;
export type LocationId = keyof typeof LOCATIONS;
export const LOCATION_IDS = Object.keys(LOCATIONS) as LocationId[];

/** Mood of a scene: picks the music bed and how lively the animation is. */
export const MOODS = ["playful", "curious", "worried", "sad", "triumphant", "calm"] as const;
export type Mood = (typeof MOODS)[number];

/** Speaker tags the planner may not give to a story character. */
export const RESERVED_SPEAKERS = ["AJJA", "KID", "SFX", "SCENE"];

export const isCastKind = (k: unknown): k is CastKind => typeof k === "string" && k in CAST_KINDS;
export const isLocation = (l: unknown): l is LocationId => typeof l === "string" && l in LOCATIONS;
export const isMood = (m: unknown): m is Mood => typeof m === "string" && (MOODS as readonly string[]).includes(m);
