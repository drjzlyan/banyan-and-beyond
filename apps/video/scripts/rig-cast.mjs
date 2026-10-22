#!/usr/bin/env node
// Cut story-character SVGs into puppet parts (art/cast-rig.json). See that file's $comment.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { $comment, ...rigs } = JSON.parse(readFileSync(join(root, "art/cast-rig.json"), "utf8"));
void $comment;
mkdirSync(join(root, "src/art/cast"), { recursive: true });

const box = ([x0, y0, x1, y1]) => `M ${x0},${y0} H ${x1} V ${y1} H ${x0} Z`;
const poly = (pts) => `M ${pts.map(([x, y]) => `${x},${y}`).join(" L ")} Z`;
/** A capsule from a to b with radius r: the rounded cut that hides a joint's seam when it bends. */
function capsule([ax, ay], [bx, by], r) {
  const a = Math.atan2(by - ay, bx - ax), nx = -Math.sin(a) * r, ny = Math.cos(a) * r;
  return `M ${ax + nx},${ay + ny} L ${bx + nx},${by + ny} A ${r} ${r} 0 0 0 ${bx - nx},${by - ny} L ${ax - nx},${ay - ny} A ${r} ${r} 0 0 0 ${ax + nx},${ay + ny} Z`;
}
/** Bounding box of a path's points (absolute commands, as Inspyry writes them), in the art's frame. */
function bbox(d, [tx, ty]) {
  const n = d.match(/-?\d+\.?\d*/g).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0).map((x) => x + tx), ys = n.filter((_, i) => i % 2 === 1).map((y) => y + ty);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const inside = ([x0, y0, x1, y1], [a0, b0, a1, b1]) => x0 >= a0 && y0 >= b0 && x1 <= a1 && y1 <= b1;

for (const [id, rig] of Object.entries(rigs)) {
  const svg = readFileSync(join(root, rig.source), "utf8");
  const open = svg.slice(0, svg.indexOf(">") + 1);
  const vb = open.match(/viewBox="([^"]+)"/)[1].split(/[ ,]+/).map(Number);
  if (vb.join() !== rig.viewBox.join()) throw new Error(`${id}: viewBox ${vb} != cast-rig.json ${rig.viewBox}; re-measure the rig`);
  const paths = [...svg.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]);
  const info = paths.map((p) => {
    const t = p.match(/translate\(([^,]+),([^)]+)\)/);
    return { tag: p, box: bbox(p.match(/ d="([^"]+)"/)[1], t ? [Number(t[1]), Number(t[2])] : [0, 0]) };
  });
  const limbShapes = new Set(Object.values(rig.parts).flatMap((p) => p.shapes ?? []));
  const detailOwner = new Map();
  for (const [name, part] of Object.entries(rig.parts)) {
    if (!part.details) continue;
    info.forEach((p, i) => { if (!limbShapes.has(i) && inside(p.box, part.details) && !detailOwner.has(i)) detailOwner.set(i, name); });
  }
  for (const [name, part] of Object.entries(rig.parts)) {
    const cid = `${id}-${name}`;
    let body;
    if (part.shapes) {
      const own = part.shapes.map((i) => paths[i]);
      const outline = own.map((t) => t.replace(/fill="[^"]+"/, `fill="${rig.outline.colour}" stroke="${rig.outline.colour}" stroke-width="${rig.outline.width}" stroke-linejoin="round"`));
      const details = info.flatMap((p, i) => (detailOwner.get(i) === name ? [p.tag] : []));
      // the clip is a capsule (rounded at the joint, at the limb's half-width) plus boxes for hands and feet
      const clipParts = [...(part.capsule ? [capsule(...part.capsule)] : []), ...(part.boxes ?? []).map(box)];
      // one <path> per shape: a clipPath unions its children, whereas one combined path cancels where
      // a capsule and a box run in opposite directions (it left a hole at the ankles)
      const clip = clipParts.length ? clipParts : null;
      // a skin-coloured capsule under the shapes covers notches where the art let something cross the limb
      if (part.fill) outline.push(`<path d="${capsule(part.fill[1], part.fill[2], part.fill[3])}" fill="${part.fill[0]}"/>`);
      body = clip
        ? `<defs><clipPath id="${cid}">${clip.map((d) => `<path d="${d}"/>`).join("")}</clipPath></defs><g clip-path="url(#${cid})">${outline.join("")}${own.join("")}${details.join("")}</g>`
        : `${outline.join("")}${own.join("")}${details.join("")}`;
    } else {
      const skip = new Set([...(part.skip ?? []), ...detailOwner.keys()]);
      const kept = paths.filter((_, i) => !skip.has(i)).join("");
      // the region plus extra boxes, minus boxes cut out (evenodd works for non-overlapping holes)
      // holes are clamped to the region's bounds: under evenodd, a hole poking outside would add area instead
      const xs = part.clip.map(([x]) => x), ys = part.clip.map(([, y]) => y);
      const clamp = ([x0, y0, x1, y1]) => [Math.max(x0, Math.min(...xs)), Math.max(y0, Math.min(...ys)), Math.min(x1, Math.max(...xs)), Math.min(y1, Math.max(...ys))];
      const d = [poly(part.clip), ...(part.plus ?? []).map(box), ...(part.minus ?? []).map(clamp).map(box)].join(" ");
      body = `<defs><clipPath id="${cid}"><path clip-rule="${part.minus ? "evenodd" : "nonzero"}" d="${d}"/></clipPath></defs><g clip-path="url(#${cid})">${kept}</g>`;
    }
    writeFileSync(join(root, `src/art/cast/${id}.${name}.svg`), `${open}${body}</svg>`);
  }
  console.log(`✓ ${id}: ${Object.keys(rig.parts).join(", ")}`);
}
