import { avatarSrc } from '../avatars';

/**
 * Renders a player's avatar image. Size comes from CSS (via `className`), so the
 * same badge works from the ~24px lobby chip up to the ~80px player screen.
 * Decorative — nicknames carry the identity — so it's aria-hidden.
 */
export default function AvatarBadge({
  id,
  className,
}: {
  id?: string | null;
  className?: string;
}) {
  const src = avatarSrc(id);
  if (!src) return null;
  return (
    <img
      className={`avatar-img${className ? ' ' + className : ''}`}
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      draggable={false}
    />
  );
}
