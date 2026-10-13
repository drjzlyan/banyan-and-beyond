/**
 * Inspyry-generated storybook art (src/art/<id>.svg, made by `pnpm --filter @banyan/video art`).
 * Bundled as static files, so rendering never calls Inspyry. Missing ids simply aren't drawn.
 */
const files = import.meta.glob("./art/*.svg", { query: "?url", import: "default", eager: true }) as Record<string, string>;

export const ART: Record<string, string> = Object.fromEntries(
  Object.entries(files)
    .map(([path, url]) => [path.replace(/^.*\/([^/]+)\.svg$/, "$1"), url] as const)
    .filter(([id]) => !id.includes(".v")), // ajja.v2.svg etc. are candidates, not picks
);

/** The storybook scene needs at least the two storytellers and the tree. */
export const hasStorybookArt = () => !!(ART.ajja && ART.kid && ART.banyan);
