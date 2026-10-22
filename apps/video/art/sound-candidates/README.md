# Sound candidates, round 2 (2026-10-22)

The owner rejected 21 sounds on the Banyan Sound Check page. `build-candidates.py` makes 2–3 candidates for each: BigSoundBank (CC0 1.0 when the sound's page says "Free and Royalty Free", checked per file) and Wikimedia Commons (public domain). It picks the loudest window of the target length, backs up to the onset, and normalises. `round2.json` records each candidate's source, licence, author and cut.

Synth candidates (`apps/video/dev/variants.tsx`): drum A (keherwa) and B (festive chaal) are built from the jingle's tabla strokes, and slip A and B are slide whistles. The gasp candidates are the Kid's Aura-2 voice (iris) saying "Ooooh!", "Wow!" and "Whoa!", raised to her 1.25× pitch.

The owner picks on https://claude.ai/artifact/Srjrbe1cuxrxeVtuHnESLA, saved in the db collection `round2`, one doc per sound with `{ pick }`. To apply the picks:
1. Add each picked recording to `apps/video/sounds.json`. `build-sounds.py` needs a `bigsoundbank` source kind, plus a `tts` kind for the gasp.
2. Move picked synths into `SYNTH` in `src/sfx.ts`.
3. Rebuild with `pnpm --filter @banyan/video sounds`.
