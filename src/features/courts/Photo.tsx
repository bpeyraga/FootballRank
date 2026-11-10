import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

/** Foto de un complejo; sin foto (o si no carga) queda una cancha dibujada sobre el verde de la app. `children` van encima (carteles). */
export function Photo({ url, class: cls = '', children }: { url?: string | null; class?: string; children?: ComponentChildren }) {
  const [bad, setBad] = useState(false);
  return (
    <div class={`cn-ph ${cls}`}>
      {url && !bad
        ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} />
        : (
          <svg class="cn-ph-art" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
              <rect x="16" y="14" width="168" height="92" rx="4" /><path d="M100 14v92" /><circle cx="100" cy="60" r="16" />
              <rect x="16" y="38" width="26" height="44" /><rect x="158" y="38" width="26" height="44" />
            </g>
          </svg>
        )}
      {children}
    </div>
  );
}
