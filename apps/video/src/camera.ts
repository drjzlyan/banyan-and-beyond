import { shotAt, type Shot, type ShotKind } from "@banyan/core";
import { Easing } from "remotion";

/**
 * The virtual camera: each shot kind is a framing of the 1280×720 world (centre + zoom), with a
 * slow push-in while it holds. Moves between shots ease in and out; close-up to close-up is a cut.
 * Framings put faces in the upper third, clear of the caption bubble.
 */
export type Camera = { x: number; y: number; z: number };

const W = 1280;
const H = 720;
export const MOVE_SECONDS = 1.3;

const POSES: Record<ShotKind, Camera & { drift: number }> = {
  establish: { x: 640, y: 320, z: 1.12, drift: -0.1 }, // opens a little close and pulls back to reveal the scene
  wide: { x: 640, y: 360, z: 1, drift: 0.03 },
  two: { x: 636, y: 440, z: 1.27, drift: 0.04 },
  ajja: { x: 437, y: 462, z: 1.8, drift: 0.06 },
  kid: { x: 833, y: 492, z: 1.8, drift: 0.06 },
};

const easeMove = Easing.bezier(0.65, 0, 0.35, 1);
const easeDrift = Easing.bezier(0.33, 0, 0.2, 1);

function pose(kind: ShotKind, held: number): Camera {
  const p = POSES[kind];
  // drift over ~10 s, then hold still (a slow push-in reads as "alive" without smearing the encode)
  return { x: p.x, y: p.y, z: p.z * (1 + p.drift * easeDrift(Math.min(1, held / 10))) };
}

/** Keep the frame inside the world so no edge ever shows. */
function clamp(c: Camera): Camera {
  const z = Math.max(1, c.z);
  const hw = W / 2 / z, hh = H / 2 / z;
  return { z, x: Math.min(W - hw, Math.max(hw, c.x)), y: Math.min(H - hh, Math.max(hh, c.y)) };
}

export function cameraAt(shots: Shot[], time: number): Camera {
  if (!shots.length) return { x: W / 2, y: H / 2, z: 1 };
  const { shot, prev, held } = shotAt(shots, time);
  const to = pose(shot.kind, held);
  if (!prev || shot.cut || held >= MOVE_SECONDS) return clamp(to);
  const from = pose(prev.kind, shot.at - prev.at);
  const k = easeMove(held / MOVE_SECONDS);
  return clamp({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k });
}

/** CSS transform placing a world layer under the camera; `depth` < 1 is further away (moves less). */
export function layerTransform(cam: Camera, depth: number): string {
  const z = 1 + (cam.z - 1) * depth;
  const x = W / 2 + (cam.x - W / 2) * depth;
  const y = H / 2 + (cam.y - H / 2) * depth;
  return `translate(${W / 2}px, ${H / 2}px) scale(${z}) translate(${-x}px, ${-y}px)`;
}
