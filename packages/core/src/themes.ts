import type { StoryKind, Theme } from "./types.ts";

/** Curated value themes. One theme per episode; cooldown enforced in selection.ts. */
export const THEMES: Theme[] = [
  { id: "honesty", valueWord: "Honesty", moral: "Telling the truth keeps friendships strong.", virtues: ["truthfulness", "courage"] },
  { id: "kindness", valueWord: "Kindness", moral: "Small kind acts make the whole village happy.", virtues: ["compassion", "helpfulness"] },
  { id: "duty", valueWord: "Duty", moral: "Doing our work well is how we care for others.", virtues: ["responsibility", "perseverance"] },
  { id: "courage", valueWord: "Courage", moral: "Being brave means doing right even when afraid.", virtues: ["bravery", "honesty"] },
  { id: "respect", valueWord: "Respect", moral: "Listening to elders and friends shows respect.", virtues: ["humility", "patience"] },
  { id: "sharing", valueWord: "Sharing", moral: "What we share grows sweeter for everyone.", virtues: ["generosity", "fairness"] },
  { id: "cleanliness", valueWord: "Cleanliness", moral: "A clean home and street keep everyone healthy.", virtues: ["discipline", "care"] },
  { id: "gratitude", valueWord: "Gratitude", moral: "Saying thank you makes givers and receivers glad.", virtues: ["thankfulness", "humility"] },
];

export const STORY_KINDS: StoryKind[] = ["folk-tale", "village-story", "parable"];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}
