// Emojis, stickers y reacciones del chat (puro: sin Supabase, se puede testear).

/** Tienen que coincidir con el CHECK de message_reactions.emoji en la base. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '⚽', '🔥'] as const;

export const EMOJIS: { name: string; list: string[] }[] = [
  { name: 'Fútbol', list: ['⚽', '🥅', '🏆', '🥇', '🥈', '🥉', '🎖️', '🧤', '👟', '🟨', '🟥', '⏱️', '📣', '🏟️', '🔥', '💯', '⭐', '🎯', '🐐', '🧱', '🚑', '🍻', '🍕', '🥩'] },
  { name: 'Caras', list: ['😀', '😁', '😂', '🤣', '😅', '😊', '😉', '😍', '😘', '😎', '🤩', '🥳', '🤔', '🤨', '😐', '🙄', '😏', '😴', '😮', '😱', '😭', '😢', '😡', '🤬', '🤯', '🥶', '🥵', '🤮', '🤡', '💀', '👻', '🫠'] },
  { name: 'Gestos', list: ['👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '✌️', '🤞', '🤙', '👊', '✊', '👋', '🫡', '🤌', '👀', '🤷', '🤦', '🏃', '🕺'] },
  { name: 'Corazones', list: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❤️‍🔥'] },
];

/** "Stickers": combinaciones que se mandan solas y se ven grandes. */
export const STICKERS = ['⚽🔥', '🏆', '🥅😱', '🧤🧱', '🟥😡', '🟨', '👏👏👏', '🤣🤣', '🍻', '🐐', '🤡', '💪⚽', '🚑', '😭', '🫡', '🎯', '🙌', '😎'];

const PICT = /\p{Extended_Pictographic}/gu;
const ONLY_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

/** Mensaje de 1 a 3 emojis (sin texto): se muestra grande, sin burbuja, como en WhatsApp. */
export function isJumbo(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 40 || !ONLY_EMOJI.test(t)) return false;
  const n = t.match(PICT)?.length ?? 0;
  return n >= 1 && n <= 3;
}
