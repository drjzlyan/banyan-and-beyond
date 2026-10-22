/**
 * The sound vocabulary and how cues are chosen. Sounds are picked by what the words say, not by a
 * quota: the old prompt asked for "3 to 5 cues per part" and got filler (a splash before a cow
 * mooed, a drum before Meena spoke). Now:
 * - a cue the model wrote survives only if its line, or the next one, talks about that sound;
 * - strong sound or action words ("splash", "knock", "giggled", "slipped") add their cue in code;
 * - quick foley ("overlay") plays exactly on the word that triggered it, under the voice;
 *   "beat" sounds (animals, music, weather) get a short gap of their own before the line.
 * Every id here has a sample or a synth in apps/video/src/sfx.ts.
 */
export type SoundKind = "beat" | "overlay";

interface SoundDef {
  /** what it is, shown to the model */
  label: string;
  /** comic sound word drawn on screen */
  word: string;
  kind: SoundKind;
  /** words that mean this sound is happening (relevance check, and word sync for overlays) */
  related: RegExp;
  /** words strong enough to add the cue on their own */
  auto?: RegExp;
}

const r = (s: string) => new RegExp(`\\b(${s})\\b`, "i");

export const SFX = {
  // world
  birds: { label: "birds chirping", word: "Tweet tweet!", kind: "beat", related: r("birds?|sparrows?|tweet\\w*|chirp\\w*|morning"), auto: r("tweet(-tweet)?|chirp(ed|ing)?") },
  wind: { label: "a breeze through the leaves", word: "Whoosh!", kind: "beat", related: r("wind\\w*|breeze|blew|blowing|whoosh\\w*|leaves|kite"), auto: r("whoosh(ed)?|breeze") },
  rain: { label: "gentle rain", word: "Pitter patter", kind: "beat", related: r("rain\\w*|drops?|monsoon|clouds?|pitter|umbrella|wet"), auto: r("rain(ed|ing)?|pitter|patter") },
  river: { label: "a flowing stream", word: "Gurgle gurgle", kind: "beat", related: r("river|stream|pond|water|well|gurgl\\w*|fish") },
  bell: { label: "a temple bell", word: "Ding dong!", kind: "beat", related: r("bells?|ding|dong|temple|rang|ring\\w*"), auto: r("ding(-dong)?|dong|rang") },
  crickets: { label: "crickets at night", word: "Chirp chirp", kind: "beat", related: r("night|dark|evening|crickets?|moon|stars?"), auto: r("crickets?") },
  footsteps: { label: "small footsteps", word: "Tap tap tap", kind: "overlay", related: r("walk\\w*|steps?|stepped|tap(-tap)*|came|went|followed|tiptoe\\w*") },
  splash: { label: "a water splash", word: "Splish splash!", kind: "overlay", related: r("splash\\w*|splish|plop|jumped in|fell in|water|puddle"), auto: r("splash(ed|ing)?|splish|plop") },
  knock: { label: "a knock on a door", word: "Knock knock!", kind: "overlay", related: r("knock\\w*|door|tap(ped)?"), auto: r("knock(ed|ing)?") },
  door: { label: "a creaky door opening", word: "Creeeak", kind: "overlay", related: r("door|gate|opened|creak\\w*|lid"), auto: r("creak(ed|y)?") },
  cart: { label: "bullock cart wheels", word: "Clip clop", kind: "beat", related: r("cart|wheels?|bullocks?|road|clip|clop"), auto: r("clip-?clop") },
  market: { label: "busy market voices", word: "Hustle bustle", kind: "beat", related: r("market|bazaar|stalls?|crowd|shop\\w*|sellers?") },
  rooster: { label: "a rooster crowing", word: "Cock-a-doodle!", kind: "beat", related: r("roosters?|morning|sunrise|dawn|woke"), auto: r("cock-a-doodle-doo|rooster") },
  // music
  drum: { label: "a happy dholak beat", word: "Dhin dhin!", kind: "beat", related: r("drums?|dholak|danc\\w*|festival|music|celebrat\\w*|party"), auto: r("dhin|dholak|drum\\w*") },
  flute: { label: "a short flute tune", word: "La la la", kind: "beat", related: r("flute|bansuri|sang|sing\\w*|song|tune|music|hum\\w*"), auto: r("flute|bansuri") },
  chime: { label: "a twinkly magic chime", word: "Twinkle!", kind: "beat", related: r("magic\\w*|twinkl\\w*|sparkl\\w*|shin\\w*|idea|surprise|wish|glitter\\w*") },
  // animals
  moo: { label: "a cow mooing", word: "Mooo!", kind: "beat", related: r("cow|cows|calf|moo+\\w*|bull"), auto: r("moo+(ed)?") },
  bark: { label: "a puppy barking", word: "Woof woof!", kind: "beat", related: r("dog|dogs|pupp(y|ies)|bark\\w*|woof"), auto: r("woof|bark(ed|ing)?") },
  meow: { label: "a cat meowing", word: "Meow!", kind: "beat", related: r("cats?|kitten|meow\\w*|purr\\w*"), auto: r("meow\\w*|purr\\w*") },
  monkey: { label: "monkey chatter", word: "Ooh ooh aah!", kind: "beat", related: r("monkeys?|bandar|chatter\\w*"), auto: r("chatter(ed|ing)?|ooh ooh") },
  parrot: { label: "a parrot squawk", word: "Squawk!", kind: "beat", related: r("parrots?|squawk\\w*|mitthu"), auto: r("squawk\\w*") },
  peacock: { label: "a peacock call", word: "Mee-ow!", kind: "beat", related: r("peacocks?|peahen|feathers") },
  elephant: { label: "an elephant trumpet", word: "Pa-waaa!", kind: "beat", related: r("elephants?|trunk|trumpet\\w*"), auto: r("trumpet(ed|ing)?") },
  goat: { label: "a goat bleating", word: "Meh-eh-eh!", kind: "beat", related: r("goats?|kid goat|bleat\\w*"), auto: r("bleat(ed|ing)?|meh+") },
  crow: { label: "a crow cawing", word: "Caw caw!", kind: "beat", related: r("crows?|caw\\w*"), auto: r("caw(ed|ing)?") },
  // cartoon foley (played on the word, under the voice)
  boing: { label: "a springy boing", word: "Boing!", kind: "overlay", related: r("jump\\w*|hopp?\\w*|bounc\\w*|boing|leap\\w*|sprang"), auto: r("boing|bounced|hopped|leapt|sprang") },
  slip: { label: "a slide-whistle slip", word: "Wheee-oops!", kind: "overlay", related: r("slip\\w*|slid\\w*|tumbl\\w*|fell|oops|wobbl\\w*"), auto: r("slipped|slid|tumbled|oops") },
  bonk: { label: "a soft cartoon bonk", word: "Bonk!", kind: "overlay", related: r("bump\\w*|bonk|thud|bang\\w*|fell|hit|landed|crash\\w*"), auto: r("bonk|thud|bumped") },
  pop: { label: "a bubbly pop", word: "Pop!", kind: "overlay", related: r("pop\\w*|appeared|peeked|burst|out came"), auto: r("pop(ped)?") },
  zip: { label: "a zippy zoom", word: "Zoom!", kind: "overlay", related: r("ran|run\\w*|zoom\\w*|raced|rushed|dashed|hurried|flew|quick\\w*"), auto: r("zoom(ed)?|dashed|raced|whizzed") },
  tiptoe: { label: "sneaky tiptoe plinks", word: "Tip tip tip", kind: "overlay", related: r("tiptoe\\w*|sneak\\w*|crept|quiet\\w*|shh+|softly"), auto: r("tiptoe(d|ing)?|crept|sneaked") },
  squeak: { label: "a tiny squeak", word: "Squeak!", kind: "overlay", related: r("squeak\\w*|mouse|tiny|little voice"), auto: r("squeak(ed|y)?") },
  gulp: { label: "a big gulp", word: "Gulp!", kind: "overlay", related: r("gulp\\w*|drank|drink\\w*|swallow\\w*"), auto: r("gulp(ed)?") },
  munch: { label: "crunchy munching", word: "Munch munch!", kind: "overlay", related: r("munch\\w*|crunch\\w*|ate|eat\\w*|bite|bit|nibbl\\w*|yum\\w*"), auto: r("munch(ed|ing)?|crunch(ed|ing)?|nibbled|yum+") },
  swish: { label: "a quick swish", word: "Swish!", kind: "overlay", related: r("swish\\w*|swoosh\\w*|waved|threw|tossed|swung|flapped"), auto: r("swish(ed)?|swoosh(ed)?") },
  // reactions
  giggle: { label: "children giggling", word: "Hee hee!", kind: "overlay", related: r("giggl\\w*|laugh\\w*|hee|haha|funny|silly"), auto: r("giggled|laughed|hee hee|haha") },
  gasp: { label: "a surprised gasp", word: "Ooooh!", kind: "overlay", related: r("gasp\\w*|surpris\\w*|wow|oh no|ooh|whoa"), auto: r("gasped|wow|whoa") },
  cheer: { label: "a happy cheer", word: "Hooray!", kind: "beat", related: r("cheer\\w*|hooray|yay|hurray|celebrat\\w*|won|did it"), auto: r("cheered|hooray|hurray|yay") },
  clap: { label: "happy clapping", word: "Clap clap!", kind: "overlay", related: r("clap\\w*|applau\\w*"), auto: r("clapp?(ed|ing)?") },
  yawn: { label: "a sleepy yawn", word: "Yaaawn", kind: "overlay", related: r("yawn\\w*|sleep\\w*|tired|nap\\w*"), auto: r("yawn(ed|ing)?") },
  snore: { label: "a gentle snore", word: "Zzz...", kind: "beat", related: r("snor\\w*|asleep|nap\\w*|zzz"), auto: r("snored|snoring|zzz") },
} as const satisfies Record<string, SoundDef>;

export type SfxId = keyof typeof SFX;
export const SFX_IDS = Object.keys(SFX) as SfxId[];
export const isSfxId = (s: string): s is SfxId => s in SFX;

/** Max cues in one story: one every ~10 s keeps it lively without becoming noise. */
export const MAX_SFX_PER_STORY = 40;
/** Never auto-add a cue closer than this many spoken lines to the previous cue. */
export const MIN_LINES_BETWEEN_AUTO_CUES = 2;
/**
 * The same sound must not come back within this many spoken lines, nor more than MAX_SAME_SOUND
 * times a story. Seen live: the model put "bark" before almost every line the puppy spoke (8×).
 */
export const MIN_LINES_BETWEEN_SAME_SOUND = 8;
export const MAX_SAME_SOUND = 3;

/** Is this sound about this line (or the next)? Filters out the model's filler cues. */
export function cueRelevant(id: SfxId, line: string | undefined, next?: string): boolean {
  const re = SFX[id].related;
  return re.test(line ?? "") || re.test(next ?? "");
}

/** Index of the word an overlay sound should land on (the first word that relates to it), or -1. */
export function triggerWord(id: SfxId, text: string): number {
  const words = text.split(/\s+/);
  const def = SFX[id] as SoundDef;
  const re = new RegExp(def.related.source, "i");
  const auto = def.auto ? new RegExp(def.auto.source, "i") : null;
  const clean = (w: string) => w.replace(/[^\w'-]/g, "");
  const hit = auto ? words.findIndex((w) => auto.test(clean(w))) : -1;
  return hit >= 0 ? hit : words.findIndex((w) => re.test(clean(w)));
}

type Row = { kind: "line"; speaker: string; text: string } | { kind: "sfx"; id: string } | { kind: "scene"; n: number };

/**
 * Choose the story's sound cues from its words:
 * 1. drop model cues that are unknown or not about their line (or the next one),
 * 2. add a cue where a line says a strong sound or action word,
 * 3. the first time an animal is named, it makes its sound.
 * Keeps the order of rows; returns the new rows and what was dropped (shown in the Studio).
 */
export function tuneCues(rows: Row[], opts: { animals?: { name: string; sound: SfxId | null }[] } = {}): { rows: Row[]; dropped: string[] } {
  const dropped: string[] = [];
  const nextLine = (i: number, skip = 0) => rows.slice(i + 1).filter((x) => x.kind === "line")[skip] as { text: string } | undefined;
  // 1. relevance filter
  let kept = rows.filter((row, i) => {
    if (row.kind !== "sfx") return true;
    const ok = isSfxId(row.id) && cueRelevant(row.id, nextLine(i)?.text, nextLine(i, 1)?.text);
    if (!ok) dropped.push(`${row.id} before "${(nextLine(i)?.text ?? "").slice(0, 40)}"`);
    return ok;
  });
  // 2 + 3. auto cues, and no sound spammed (model cues included)
  const out: Row[] = [];
  const heard = new Set<string>();
  const lastAt = new Map<string, number>();
  const count = new Map<string, number>();
  let line = 0;
  let sinceCue = Infinity;
  let total = 0;
  const allowed = (id: string) => (count.get(id) ?? 0) < MAX_SAME_SOUND && line - (lastAt.get(id) ?? -Infinity) >= MIN_LINES_BETWEEN_SAME_SOUND && total < MAX_SFX_PER_STORY;
  const take = (id: string) => { out.push({ kind: "sfx", id }); count.set(id, (count.get(id) ?? 0) + 1); lastAt.set(id, line); total++; sinceCue = 0; };
  for (const row of kept) {
    if (row.kind === "sfx") {
      if (allowed(row.id)) take(row.id);
      else dropped.push(`${row.id} again (repeat)`);
      continue;
    }
    if (row.kind !== "line") { out.push(row); continue; }
    const prevIsCue = out[out.length - 1]?.kind === "sfx";
    let add: SfxId | null = null;
    if (!prevIsCue && sinceCue >= MIN_LINES_BETWEEN_AUTO_CUES) {
      for (const a of opts.animals ?? []) {
        if (a.sound && !heard.has(a.name) && new RegExp(`\\b${a.name}\\b`, "i").test(row.text) && allowed(a.sound)) { add = a.sound; break; }
      }
      if (!add) add = (SFX_IDS.find((id) => (SFX[id] as SoundDef).auto?.test(row.text) && allowed(id)) ?? null);
    }
    for (const a of opts.animals ?? []) if (new RegExp(`\\b${a.name}\\b`, "i").test(row.text)) heard.add(a.name);
    if (add) take(add);
    out.push(row);
    line++;
    sinceCue++;
  }
  kept = out;
  return { rows: kept, dropped };
}
