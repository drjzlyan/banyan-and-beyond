import type { CastKind, LocationId } from "./world.ts";

/**
 * Plot seeds for standalone stories, retold gently from public-domain Indian tales (Panchatantra,
 * Jataka, Hitopadesha, Tenali Raman, Akbar-Birbal) plus simple village stories. A premise gives the
 * planner a real plot with a twist, which is what the free-form prompt never produced: without one,
 * the model looped the same "secret box" beat. Kept kind: no deaths, no one is eaten or hurt.
 */
export interface Premise {
  id: string;
  /** the value it teaches (themes.ts id) */
  theme: string;
  source: string;
  /** working title; the planner may polish it */
  title: string;
  /** the plot in two or three sentences, including the twist */
  plot: string;
  cast: CastKind[];
  locations: LocationId[];
}

export const PREMISES: Premise[] = [
  // honesty
  { id: "woodcutter-axe", theme: "honesty", source: "Aesop / Indian folk retelling", title: "The Shiny Axe in the River",
    plot: "A poor woodcutter drops his old axe in the river. A playful river spirit offers him a gold axe, then a silver one, and he says no to both, so he is given all three. His greedy neighbour throws his axe in on purpose, lies, and comes home with nothing.",
    cast: ["farmer", "boy"], locations: ["forest", "river-bank", "village-lane"] },
  { id: "empty-pot", theme: "honesty", source: "Asian folk tale", title: "The Empty Flower Pot",
    plot: "The king gives every child a seed and says the best flower wins. One girl's seed never grows however hard she tries, while the others bring big flowers. She brings her empty pot, and the king smiles: he had boiled every seed, so only she told the truth.",
    cast: ["girl", "king", "mother"], locations: ["courtyard", "palace"] },
  { id: "birbal-stick", theme: "honesty", source: "Akbar-Birbal", title: "Birbal and the Magic Sticks",
    plot: "Someone in the palace kitchen keeps eating the sweets. Birbal gives every cook a stick and says the guilty one's stick will grow by morning. The guilty cook cuts his stick shorter at night, and in the morning his short stick tells the truth.",
    cast: ["minister", "king", "shopkeeper"], locations: ["palace"] },
  { id: "milkmaid-water", theme: "honesty", source: "Indian village tale", title: "The Milk That Was Half Water",
    plot: "A milk seller adds river water to her milk to sell more. A clever monkey grabs her coin bag and drops one coin in the river for every coin in the bag, one by one, keeping just half. She laughs and learns that what you take dishonestly floats away.",
    cast: ["shopkeeper", "monkey", "girl"], locations: ["river-bank", "market"] },
  { id: "found-purse", theme: "honesty", source: "Village story", title: "The Purse Under the Bench",
    plot: "A boy finds a purse full of coins under the school bench and dreams of all the sweets he could buy. He searches the whole village for the owner, getting it wrong twice. It belongs to the old sweet seller, who was saving for his granddaughter's new school bag.",
    cast: ["boy", "shopkeeper", "teacher"], locations: ["school", "market", "village-lane"] },
  // kindness
  { id: "lion-mouse", theme: "kindness", source: "Panchatantra", title: "The Tiny Friend",
    plot: "A big elephant lets a tiny rabbit go when she squeaks for mercy, laughing that something so small could ever help him. Later the elephant's leg gets tangled in a farmer's rope, and no big animal can untie it. The rabbit nibbles the knot free.",
    cast: ["elephant", "rabbit", "farmer"], locations: ["forest", "field"] },
  { id: "dove-ant", theme: "kindness", source: "Panchatantra", title: "The Ant and the Leaf Boat",
    plot: "An ant falls into the pond and a sparrow drops a leaf for her to float on. Days later a boy with a catapult aims at the sparrow, just for fun. The ant gives his toe a tiny nip, he jumps, and the sparrow flies away safe.",
    cast: ["sparrow", "boy"], locations: ["forest", "river-bank"] },
  { id: "thirsty-dog", theme: "kindness", source: "Village story", title: "Water for the Thirsty Puppy",
    plot: "On the hottest day a girl sees a thirsty puppy by the dry well. Her bucket is too small and the rope too short; she tries twice and fails. With her friends she makes a long chain of hands, and the puppy follows them home and becomes the lane's guard.",
    cast: ["girl", "dog", "grandmother"], locations: ["village-lane", "courtyard"] },
  { id: "new-girl", theme: "kindness", source: "Village story", title: "The Quiet New Girl",
    plot: "A new girl joins the village school and sits alone because she speaks a different language. A boy tries to talk with words and fails, then tries drawing and fails. Finally he teaches her a clapping game, and laughing needs no language.",
    cast: ["boy", "girl", "teacher"], locations: ["school"] },
  { id: "old-tortoise", theme: "kindness", source: "Jataka retelling", title: "The Slow Tortoise's Shortcut",
    plot: "The forest animals race to the festival and leave the slow tortoise behind. A monkey turns back to carry her on a log boat across the river. At the festival only the tortoise remembers the way through the hidden gate, and everyone gets in.",
    cast: ["tortoise", "monkey", "parrot"], locations: ["forest", "river-bank"] },
  // duty
  { id: "little-lamp", theme: "duty", source: "Village story", title: "The Little Lamp Keeper",
    plot: "A girl's job is to light the lamp at the river crossing every evening. One festival night she wants to watch the fireworks instead. She runs back, lights the lamp, and her father's bullock cart finds the crossing safely in the dark.",
    cast: ["girl", "father", "cow"], locations: ["river-bank", "village-lane"] },
  { id: "ant-grasshopper", theme: "duty", source: "Aesop / Panchatantra retelling", title: "The Busy Ants and the Singing Goat",
    plot: "All summer the ants carry grain while a goat sings and dances. When the rains come the goat has no food. The ants share, and the goat makes them a promise: next summer he sings while he works, and the work goes twice as fast.",
    cast: ["goat", "farmer"], locations: ["field"] },
  { id: "cow-shepherd", theme: "duty", source: "Village story", title: "Who Will Mind Gauri?",
    plot: "A boy is asked to mind Gauri the cow while his father goes to the market. He gets busy flying his kite and Gauri wanders off. He searches the field and the river, and finds her by following her bell, and he never lets go of the rope again.",
    cast: ["boy", "cow", "father"], locations: ["field", "river-bank", "courtyard"] },
  { id: "crow-pitcher", theme: "duty", source: "Panchatantra", title: "The Clever Thirsty Crow",
    plot: "A crow must bring water to her thirsty babies, but the water in the pot is too low. She tries tipping the pot and fails, then tries breaking it and fails. She drops pebbles in one by one until the water rises to the top.",
    cast: ["crow", "girl"], locations: ["courtyard", "village-lane"] },
  { id: "tenali-garden", theme: "duty", source: "Tenali Raman", title: "Tenali and the Dry Garden",
    plot: "Tenali's garden needs water but the well is deep and he is tired. He hears thieves planning to steal his treasure, so he says loudly that his gold is in the well. All night the thieves pull up bucket after bucket, watering his whole garden.",
    cast: ["minister", "farmer"], locations: ["courtyard", "field"] },
  // courage
  { id: "brave-sparrow", theme: "courage", source: "Panchatantra retelling", title: "The Sparrow Who Spoke Up",
    plot: "A big elephant keeps trampling a sparrow's tree by accident. The tiny sparrow is scared but asks her friends the frog and the parrot for help. Together they politely show the elephant a new path, and he says sorry and waters her tree.",
    cast: ["sparrow", "elephant", "parrot"], locations: ["forest"] },
  { id: "stage-fright", theme: "courage", source: "Village story", title: "The Song at the Festival",
    plot: "A shy boy is chosen to sing at the village festival. He practises for the cow, then for his grandmother, and both times his voice wobbles. On stage he looks at his grandmother's smile, takes a big breath, and sings so well the whole village sings along.",
    cast: ["boy", "grandmother", "cow"], locations: ["courtyard", "village-lane"] },
  { id: "rabbit-well", theme: "courage", source: "Panchatantra", title: "The Rabbit and the Bossy Elephant King",
    plot: "A bossy elephant king says every animal must bring him all their fruit. The little rabbit is scared but brave, and tells him another king lives in the well. The elephant looks in, sees his own grumpy face, and laughs at himself, and he shares from then on.",
    cast: ["rabbit", "elephant", "monkey"], locations: ["forest"] },
  { id: "dark-path", theme: "courage", source: "Village story", title: "The Path in the Dark",
    plot: "A girl must take medicine to her grandmother across the field at dusk. The swaying scarecrow and the hooting owl make her jump twice. She sings her favourite song, walks on, and finds the scarecrow was only waving in the wind.",
    cast: ["girl", "grandmother", "mother"], locations: ["field", "courtyard"] },
  { id: "birbal-sorry", theme: "courage", source: "Akbar-Birbal", title: "The King's Mistake",
    plot: "The king blames the gardener for a broken pot and everyone is too scared to say it was the king's own cat. Birbal bravely tells a funny riddle that helps the king see the truth. The king laughs, says sorry to the gardener and gives him a new pot.",
    cast: ["king", "minister", "cat"], locations: ["palace"] },
  // respect
  { id: "monkey-cap", theme: "respect", source: "Indian folk tale", title: "The Cap Seller and the Copycat Monkeys",
    plot: "A cap seller naps under a tree and naughty monkeys steal all his caps. He shouts, waves and stamps, and the monkeys copy everything. He bows politely and throws his own cap down, the monkeys copy him, and he learns that a calm bow works better than shouting.",
    cast: ["shopkeeper", "monkey"], locations: ["forest", "market"] },
  { id: "elder-advice", theme: "respect", source: "Jataka retelling", title: "Listen to Grandmother",
    plot: "The children laugh when grandmother says to plant the mango seedlings near the pond. They plant them on the hill instead and the seedlings droop twice. They listen at last, plant by the pond, and grandmother tells them she learned it from her own grandmother.",
    cast: ["grandmother", "girl", "boy"], locations: ["field", "river-bank"] },
  { id: "tortoise-talker", theme: "respect", source: "Panchatantra", title: "The Tortoise Who Would Not Listen",
    plot: "Two geese carry their tortoise friend to a new pond on a stick she holds in her mouth. They beg her to listen and stay quiet, but she cannot resist shouting hello to the children below. She splashes gently into a muddy pond, safe, and laughs that next time she will listen.",
    cast: ["tortoise", "parrot", "boy"], locations: ["forest", "river-bank"] },
  { id: "teacher-chalk", theme: "respect", source: "Village story", title: "The Mystery of the Missing Chalk",
    plot: "The teacher's chalk keeps disappearing and the children blame each other. They set a trap with flour on the floor. The footprints are tiny: a squirrel is building a white nest, and the children make a chalk-sharing rule for everyone.",
    cast: ["teacher", "boy", "girl"], locations: ["school"] },
  // sharing
  { id: "stone-soup", theme: "sharing", source: "European folk tale, Indian village retelling", title: "The Magic Stone Khichdi",
    plot: "A hungry traveller says he can cook khichdi from a stone. Curious villagers each add a little rice, dal, salt and vegetables to make it even better. The whole lane eats together and laughs when he reveals the stone was just a stone.",
    cast: ["farmer", "grandmother", "boy"], locations: ["village-lane", "courtyard"] },
  { id: "two-cats-bread", theme: "sharing", source: "Panchatantra", title: "Two Cats and One Roti",
    plot: "Two cats fight over one roti and ask a monkey to split it fairly. The monkey takes a bite from the bigger half, then the other, again and again. Soon only crumbs are left, and the cats share them, laughing that they should have shared from the start.",
    cast: ["cat", "monkey"], locations: ["courtyard", "village-lane"] },
  { id: "mango-tree", theme: "sharing", source: "Village story", title: "The Mango Tree That Belonged to Everyone",
    plot: "A boy says the mango tree by his house is only his. The tree gives so many mangoes that they rot, and the tree droops. He gives mangoes to the whole lane, and next summer the tree is fuller than ever and everyone helps him pick.",
    cast: ["boy", "grandmother", "parrot"], locations: ["courtyard", "village-lane"] },
  { id: "umbrella", theme: "sharing", source: "Village story", title: "One Umbrella for Five",
    plot: "Rain pours on the way home from school and only one girl has an umbrella. She tries walking each friend home one by one but it takes forever. They squeeze under together and sing all the way.",
    cast: ["girl", "boy", "teacher"], locations: ["school", "village-lane"] },
  { id: "kite-festival", theme: "sharing", source: "Village story", title: "The Kite with the Long Tail",
    plot: "At the kite festival a boy wins the biggest kite but has no one to fly it with. His kite will not rise alone; he tries twice. He shares the string with the smallest girl and they fly it highest of all.",
    cast: ["boy", "girl", "father"], locations: ["field", "village-lane"] },
  // cleanliness
  { id: "messy-monkey", theme: "cleanliness", source: "Village story", title: "Bandar's Messy Tree",
    plot: "A monkey drops banana peels everywhere and laughs. He slips on his own peels twice, splat and splat. He makes a peel basket for the whole forest and becomes the tidiest monkey around.",
    cast: ["monkey", "parrot", "elephant"], locations: ["forest"] },
  { id: "clean-river", theme: "cleanliness", source: "Village story", title: "Why Is the River Sad?",
    plot: "The fish stop jumping and the river looks grey. The children find wrappers and old pots stuck in the reeds. They clean it together, and the next morning the river sparkles and the fish leap again.",
    cast: ["girl", "boy", "farmer"], locations: ["river-bank", "village-lane"] },
  { id: "handwash", theme: "cleanliness", source: "Village story", title: "The Germ Hunt",
    plot: "A boy runs in from playing in the mud and grabs a laddoo. Grandmother sprinkles turmeric on his hands to show where the invisible germs hide, in a gentle and funny way. He scrubs twice and the yellow stays, and the third time with soap the yellow is gone.",
    cast: ["boy", "grandmother", "dog"], locations: ["courtyard", "field"] },
  { id: "festival-lane", theme: "cleanliness", source: "Village story", title: "The Lane for the Festival",
    plot: "The lane is dusty and messy before Diwali. Everyone says it is someone else's job. A girl starts sweeping alone, then her friend joins, then the whole lane, and they light lamps in the cleanest lane in the village.",
    cast: ["girl", "shopkeeper", "mother"], locations: ["village-lane"] },
  // gratitude
  { id: "tree-gift", theme: "gratitude", source: "Indian folk tale", title: "The Neem Tree's Secret",
    plot: "A boy only takes from the old tree: shade, swings and twigs. One hot summer the tree looks thirsty. He waters it every day, and in the monsoon it gives the best swing of all.",
    cast: ["boy", "grandmother", "sparrow"], locations: ["courtyard", "field"] },
  { id: "farmer-rain", theme: "gratitude", source: "Village story", title: "Thank You, Rain Cloud",
    plot: "A farmer grumbles at the rain, then the sun, then the wind. His daughter makes him a game: name one good thing about each. When the harvest comes he thanks all three, and the whole village dances in the field.",
    cast: ["farmer", "girl", "cow"], locations: ["field", "courtyard"] },
  { id: "elephant-thorn", theme: "gratitude", source: "Jataka retelling", title: "The Elephant Who Remembered",
    plot: "A girl pulls a thorn from a young elephant's foot. Years later at the festival the big elephant gets loose and everyone runs. It walks straight to her and bows, and gives her a ride around the fair.",
    cast: ["elephant", "girl", "father"], locations: ["forest", "market"] },
  { id: "thank-you-letter", theme: "gratitude", source: "Village story", title: "The Postman's Surprise",
    plot: "The postman brings letters to everyone but no one writes to him. A girl and her friends write him thank-you letters and hide them in his bag. He finds them one by one and dances down the lane.",
    cast: ["girl", "boy", "shopkeeper"], locations: ["village-lane", "school"] },
];

export const premiseById = (id: string) => PREMISES.find((p) => p.id === id);

/** Least-recently-used premise for a theme: skips any used recently, else the oldest. */
export function selectPremise(themeId: string, recentPremiseIds: string[]): Premise {
  const pool = PREMISES.filter((p) => p.theme === themeId);
  const all = pool.length ? pool : PREMISES;
  return all.find((p) => !recentPremiseIds.includes(p.id)) ?? all[recentPremiseIds.length % all.length]!;
}
