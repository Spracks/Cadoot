/**
 * Avatar registry — auto-discovered from the bundled art in
 * `client/src/assets/avatars/`. Dropping a new image in that folder adds it as
 * an option automatically; no code change needed. An avatar travels through the
 * whole stack as its `id` (the filename without extension).
 *
 * Source art lives in the repo-root `./avatars/` folder as SVGs; those are
 * rasterized to small PNGs in the folder globbed below (avatars never render
 * larger than ~80px, so full-size vector/raster art would just bloat the
 * bundle). See the project README for how to regenerate.
 */
const modules = import.meta.glob('./assets/avatars/*.{png,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export interface Avatar {
  id: string;
  src: string;
  label: string;
}

function idFromPath(path: string): string {
  return path.split('/').pop()!.replace(/\.[^.]+$/, '');
}

function labelFromId(id: string): string {
  return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const AVATARS: Avatar[] = Object.entries(modules)
  .map(([path, src]) => {
    const id = idFromPath(path);
    return { id, src, label: labelFromId(id) };
  })
  // Natural sort so e.g. animal_2 comes before animal_10.
  .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

export const DEFAULT_AVATAR = AVATARS[0]?.id ?? '';

/** Image URL for an avatar id, or undefined if the id is unknown. */
export function avatarSrc(id: string | undefined | null): string | undefined {
  return AVATARS.find((a) => a.id === id)?.src;
}
