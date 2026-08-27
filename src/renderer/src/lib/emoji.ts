/**
 * Bibliothèque d'icônes de repli, pour les services dont le favicon est absent,
 * illisible ou trop générique. Volontairement courte et classée par usage :
 * une grille exhaustive d'emojis ferait perdre plus de temps qu'elle n'en gagne.
 */
export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Communication',
    emojis: ['✉️', '📬', '💬', '📞', '🎥', '📣', '🔔', '📨']
  },
  {
    label: 'Travail',
    emojis: ['📁', '📊', '📈', '🗓️', '✅', '📝', '📌', '🗂️']
  },
  {
    label: 'Création',
    emojis: ['🎨', '✏️', '🖼️', '🎬', '🎧', '📷', '🖌️', '✨']
  },
  {
    label: 'Technique',
    emojis: ['⚙️', '🛠️', '🐙', '🚀', '🧩', '🖥️', '🗄️', '🔐']
  },
  {
    label: 'Repères',
    emojis: ['🏠', '🏢', '🌍', '⭐', '🔥', '💡', '🧭', '☁️']
  }
];
