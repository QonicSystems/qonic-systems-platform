"use client";

import { useState } from "react";

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
}

/**
 * Shows a linked photo, falling back to initials.
 *
 * Photos are remote URLs the user supplies, so a broken or removed link must
 * degrade gracefully rather than leave a broken image icon. `next/image` is not
 * used deliberately: it would need every possible host allow-listed in
 * next.config, which defeats the point of an arbitrary URL.
 */
export function Avatar({ name, photoUrl, size = 40 }: { name: string; photoUrl?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const dimension = { width: size, height: size };

  if (photoUrl && !failed) {
    // next/image requires every remote host to be allow-listed in next.config,
    // which is incompatible with letting people link a photo from anywhere.
    // eslint-disable-next-line @next/next/no-img-element
    return <img
      src={photoUrl}
      alt=""
      className="avatar-photo"
      style={dimension}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
    />;
  }

  return <span className="avatar" style={{ ...dimension, fontSize: size * 0.34 }} aria-hidden="true">{initialsOf(name)}</span>;
}
