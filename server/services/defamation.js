// Shared defamation detection — single source of truth for all modules

// Keywords that indicate accusations needing a qualifier like "diduga" / "konon"
export const DEFAMATION_KEYWORDS = [
  'koruptor', 'pelaku', 'tersangka', 'terdakwa', 'residivis',
  'pencuri', 'penipu', 'korupsi', 'pengedar', 'narkoba',
  'pelaku kekerasan', 'pembunuh', 'teroris',
];

// Words that soften accusations
export const QUALIFIER_WORDS = [
  'diduga', 'konon', 'dikatakannya', 'katanya',
  'dalam proses', 'sedang diselidiki', 'belum terbukti',
];

// Cek risiko fitnah — tuduhan tanpa qualifier seperti "diduga" / "konon"
export const hasDefamationRisk = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return DEFAMATION_KEYWORDS.some(keyword => {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'gi');
    return pattern.test(lower) &&
      !QUALIFIER_WORDS.some(q => lower.includes(q));
  });
};

// Hitung jumlah keyword fitnah yang muncul tanpa qualifier
export const countDefamationKeywords = (text) => {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return DEFAMATION_KEYWORDS.reduce((count, keyword) => {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'gi');
    return count + (pattern.test(lower) ? 1 : 0);
  }, 0);
};
