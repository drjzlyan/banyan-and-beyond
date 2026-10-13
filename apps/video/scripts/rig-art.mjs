#!/usr/bin/env node
// Split the character SVGs into head + body for the cut-out rig (art/rig.json). Re-run after regenerating ajja/kid.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { $comment, ...rig } = JSON.parse(readFileSync(join(root, "art/rig.json"), "utf8"));
void $comment;
const pts = (poly) => poly.map(([x, y]) => `${x},${y}`).join(" ");

for (const [id, r] of Object.entries(rig)) {
  const svg = readFileSync(join(root, `src/art/${id}.svg`), "utf8");
  const open = svg.slice(0, svg.indexOf(">") + 1);
  const body = svg.slice(open.length, svg.lastIndexOf("</svg>"));
  const [x, y, w, h] = open.match(/viewBox="([^"]+)"/)[1].split(/[ ,]+/).map(Number);
  if ([x, y, w, h].join() !== r.viewBox.join()) throw new Error(`${id}: viewBox ${[x, y, w, h]} != rig.json ${r.viewBox}; re-measure the rig`);
  // the head clip reaches `neck` units below the cut, so the seam is covered when the head turns
  const bottom = Math.max(...r.headPoly.map(([, py]) => py)) - 60;
  const head = r.headPoly.map(([px, py]) => [px, py > bottom ? py + r.neck : py]);
  const clip = (name, d, rule = "nonzero") =>
    `${open}<defs><clipPath id="${name}"><path clip-rule="${rule}" d="${d}"/></clipPath></defs><g clip-path="url(#${name})">${body}</g></svg>`;
  writeFileSync(join(root, `src/art/${id}.head.svg`), clip(`${id}-head`, `M ${pts(head)} Z`));
  writeFileSync(join(root, `src/art/${id}.body.svg`), clip(`${id}-body`, `M ${x},${y} h ${w} v ${h} h ${-w} Z M ${pts(r.headPoly)} Z`, "evenodd"));
  console.log(`✓ ${id}.head.svg ${id}.body.svg`);
}
