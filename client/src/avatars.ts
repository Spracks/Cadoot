/**
 * Avatar registry.
 *
 * An avatar travels through the whole stack as its `id` string; everything else
 * (the glyph shown on screen, its label, its category) is resolved here on the
 * client. Swapping or extending the set is a one-file change — no server,
 * socket, or type changes required.
 *
 * The set is currently emoji, grouped into four categories. To restyle a
 * category later (e.g. custom inline SVGs), change how `avatarGlyph` renders for
 * those ids; the ids and data path stay the same.
 */
export type AvatarCategoryId = 'animals' | 'scifi' | 'sports' | 'army';

export interface AvatarCategory {
  id: AvatarCategoryId;
  label: string;
}

export interface Avatar {
  id: string;
  glyph: string;
  label: string;
  category: AvatarCategoryId;
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  { id: 'animals', label: 'Animals' },
  { id: 'scifi', label: 'Sci-Fi' },
  { id: 'sports', label: 'Sports' },
  { id: 'army', label: 'Army' },
];

export const AVATARS: Avatar[] = [
  // ---- Animals / creatures (playful) ----
  { id: 'fox', glyph: '🦊', label: 'Fox', category: 'animals' },
  { id: 'owl', glyph: '🦉', label: 'Owl', category: 'animals' },
  { id: 'cat', glyph: '🐱', label: 'Cat', category: 'animals' },
  { id: 'panda', glyph: '🐼', label: 'Panda', category: 'animals' },
  { id: 'dragon', glyph: '🐲', label: 'Dragon', category: 'animals' },
  { id: 'unicorn', glyph: '🦄', label: 'Unicorn', category: 'animals' },
  { id: 'frog', glyph: '🐸', label: 'Frog', category: 'animals' },
  { id: 'octopus', glyph: '🐙', label: 'Octopus', category: 'animals' },
  { id: 'penguin', glyph: '🐧', label: 'Penguin', category: 'animals' },
  { id: 'dino', glyph: '🦖', label: 'Dino', category: 'animals' },

  // ---- Sci-Fi ----
  { id: 'robot', glyph: '🤖', label: 'Robot', category: 'scifi' },
  { id: 'invader', glyph: '👾', label: 'Space invader', category: 'scifi' },
  { id: 'alien', glyph: '👽', label: 'Alien', category: 'scifi' },
  { id: 'ufo', glyph: '🛸', label: 'UFO', category: 'scifi' },
  { id: 'rocket', glyph: '🚀', label: 'Rocket', category: 'scifi' },
  { id: 'astronaut', glyph: '🧑‍🚀', label: 'Astronaut', category: 'scifi' },
  { id: 'planet', glyph: '🪐', label: 'Planet', category: 'scifi' },
  { id: 'comet', glyph: '☄️', label: 'Comet', category: 'scifi' },
  { id: 'satellite', glyph: '🛰️', label: 'Satellite', category: 'scifi' },
  { id: 'telescope', glyph: '🔭', label: 'Telescope', category: 'scifi' },

  // ---- Sports ----
  { id: 'soccer', glyph: '⚽', label: 'Soccer', category: 'sports' },
  { id: 'basketball', glyph: '🏀', label: 'Basketball', category: 'sports' },
  { id: 'football', glyph: '🏈', label: 'Football', category: 'sports' },
  { id: 'baseball', glyph: '⚾', label: 'Baseball', category: 'sports' },
  { id: 'tennis', glyph: '🎾', label: 'Tennis', category: 'sports' },
  { id: 'volleyball', glyph: '🏐', label: 'Volleyball', category: 'sports' },
  { id: 'hockey', glyph: '🏒', label: 'Hockey', category: 'sports' },
  { id: 'boxing', glyph: '🥊', label: 'Boxing', category: 'sports' },
  { id: 'goldmedal', glyph: '🥇', label: 'Gold medal', category: 'sports' },
  { id: 'trophy', glyph: '🏆', label: 'Trophy', category: 'sports' },

  // ---- Army ----
  { id: 'helmet', glyph: '🪖', label: 'Helmet', category: 'army' },
  { id: 'milmedal', glyph: '🎖️', label: 'Military medal', category: 'army' },
  { id: 'medal', glyph: '🏅', label: 'Medal', category: 'army' },
  { id: 'shield', glyph: '🛡️', label: 'Shield', category: 'army' },
  { id: 'swords', glyph: '⚔️', label: 'Swords', category: 'army' },
  { id: 'parachute', glyph: '🪂', label: 'Parachute', category: 'army' },
  { id: 'helicopter', glyph: '🚁', label: 'Helicopter', category: 'army' },
  { id: 'compass', glyph: '🧭', label: 'Compass', category: 'army' },
  { id: 'target', glyph: '🎯', label: 'Target', category: 'army' },
  { id: 'eagle', glyph: '🦅', label: 'Eagle', category: 'army' },
];

export const DEFAULT_AVATAR = AVATARS[0]!.id;

/** Glyph for an avatar id, with a neutral fallback for unknown/empty ids. */
export function avatarGlyph(id: string | undefined | null): string {
  return AVATARS.find((a) => a.id === id)?.glyph ?? '🎮';
}

/** The category an avatar id belongs to (defaults to the first category). */
export function categoryOf(id: string | undefined | null): AvatarCategoryId {
  return AVATARS.find((a) => a.id === id)?.category ?? AVATAR_CATEGORIES[0]!.id;
}

/** Avatars in one category. */
export function avatarsInCategory(category: AvatarCategoryId): Avatar[] {
  return AVATARS.filter((a) => a.category === category);
}
