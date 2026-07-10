// Panggil LLM HANYA untuk kriteria yang butuh judgment kualitatif
// (Konten & Sumber, Etika & Legalitas) - bagian lain sudah dinilai heuristik,
// supaya hemat token & biaya.

import { config } from "../config.js";

// OPTIMIZED: ~300 tokens (was ~800 tokens)
// Prioritas: akurat tapi ringkas
const SYSTEM_PROMPT = `Anda redaktur senior media Indonesia. Nilai artikel ini:

1. KONTEN & SUMBER (0-100): newsworthiness, originalitas, relevansi audiens.

2. ETIKA & LEGALITAS (0-100): bias/keberimbangan, fitnah (tuduhan tanpa bukti), privasi.

CATATAN: Maksimal 80 karakter per note. Highlight SINGKAT 1-2 per dimensi.

BALAS HANYA JSON valid:
{"konten":{"score":0,"note":""},"etika":{"score":0,"note":""},"nadaNote":"","highlights":[]}`;

const parseJSON = (text) => {
  let clean = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  // Try normal parse first
  try {
    return JSON.parse(clean);
  } catch {
    // Truncated JSON - try to extract complete objects
    // Find closing brace for konten and etika (required fields)
    const kontenMatch = clean.match(
      /"konten"\s*:\s*\{\s*"score"\s*:\s*(\d+)\s*,\s*"note"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/,
    );
    const etikaMatch = clean.match(
      /"etika"\s*:\s*\{\s*"score"\s*:\s*(\d+)\s*,\s*"note"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/,
    );

    if (kontenMatch && etikaMatch) {
      // Extract highlights array if present
      const highlightsMatch = clean.match(/"highlights"\s*:\s*\[([^\]]*)/);
      const nadaMatch = clean.match(/"nadaNote"\s*:\s*"([^"]*)"/);
      return {
        konten: { score: parseInt(kontenMatch[1]), note: kontenMatch[2] || "" },
        etika: { score: parseInt(etikaMatch[1]), note: etikaMatch[2] || "" },
        nadaNote: nadaMatch ? nadaMatch[1] : "",
        highlights: [],
      };
    }

    throw new Error(`JSON tidak valid: ${clean.slice(0, 150)}...`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const evaluateWithLLM = async (articleText, retries = 2) => {
  // OPTIMIZED: Truncate to ~4000 chars (was 6000) - lead + samples enough
  // Keep first 3000 chars + last 1000 chars for context
  let truncatedText = articleText;
  if (articleText.length > 4000) {
    const first = articleText.slice(0, 3000);
    const last = articleText.slice(-1000);
    truncatedText = first + "\n...[middle omitted]...\n" + last;
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        "https://gateway.olagon.site/anthropic/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.anthropicApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-5",
            max_tokens: 600,
            system: SYSTEM_PROMPT,
            messages: [
              { role: "user", content: `Artikel:\n"""\n${truncatedText}\n"""` },
            ],
          }),
        }
      );

      // Handle overload (529) with retry
      if (response.status === 529 || response.status === 429) {
        if (attempt < retries) {
          await sleep((attempt + 1) * 2000); // 2s, 4s backoff
          continue;
        }
        throw new Error(`API overloaded. Coba lagi nanti.`);
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((c) => c.type === "text");
      if (!textBlock) throw new Error("Respons LLM tidak mengandung teks.");

      return parseJSON(textBlock.text);
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep((attempt + 1) * 1000);
    }
  }
};

// ============================================================================
// ARTICLE CLASSIFICATION
// ============================================================================

const ARTICLE_TYPES = {
  NARRATIVE_ELIGIBLE: ['feature', 'deep_dive', 'long_form', 'human_interest', 'narrative', 'profile', 'biography', 'investigative'],
  SKIP: ['straight_news', 'breaking', 'briefing', 'tips', 'how_to', 'data_dump', 'press_release', 'opinion', 'quick_update']
};

const CLASSIFY_SYSTEM_PROMPT = `Anda klasifikator artikel berita Indonesia.

TUGAS: Klasifikasikan tipa artikel dan tentukan apakah eligible untuk penilaian storytelling ("Hook Meter").

JENIS ARTIKEL:
- feature: Artikel feature dengan angle cerita, emosional
- deep_dive: Eksplorasi topik mendalam, komprehensif
- long_form: Artikel panjang (>1000 kata)
- human_interest: Fokus pada orang/orang-orang
- narrative: Narrative journalism dengan arc cerita
- profile: Profil seseorang atau organisasi
- biography: Biografi seseorang
- investigative: Laporan investigasi
- straight_news: Berita straight (inverted pyramid, fakta langsung)
- breaking: Berita singkat, urgent
- briefing: Pemberitahuan singkat
- tips: Tips atau panduan langkah
- how_to: Tutorial
- data_dump: Artikel berbasis data/fakta semata
- press_release: Rilis pers
- opinion: Opini redaksi
- quick_update: Update singkat

ATURAN ELIGIBILITY:
- Hook Meter diterapkan JIKA: wordCount >= 400 DAN type IN [feature, deep_dive, long_form, human_interest, narrative, profile, biography, investigative]
- Hook Meter DITOLAK JIKA: wordCount < 400 ATAU type IN [straight_news, breaking, briefing, tips, how_to, data_dump, press_release, opinion, quick_update]

BALAS HANYA JSON valid:
{"type":"nama_tipe","subtype":"subtipe_jika_ada","wordCount":500,"eligibleForHookMeter":true,"reason":"penjelasan_singkat"}`;

export const classifyArticle = async (text, retries = 2) => {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  
  // Quick check for obvious types based on content patterns
  const quickChecks = {
    wordCount,
    hasHowToPatterns: /\d+\s+ langkah|caranya\s*:|tips\s*:|tutorial/i.test(text),
    isStraightNews: /^([A-Z][a-z]+\s+){1,3}(menyatakan|mengatakan|menambahkan|melaporkan)/.test(text) && wordCount < 400,
    hasStepByStep: /\d+\.\s+[A-Z]|langkah\s+\d+|pertama|kedua|ketiga/i.test(text)
  };
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch("https://gateway.olagon.site/anthropic/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 300,
          system: CLASSIFY_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: `Klasifikasikan artikel ini:\n"""\n${text.slice(0, 2000)}\n"""` }
          ],
        }),
      });

      if (response.status === 529 || response.status === 429) {
        if (attempt < retries) {
          await sleep((attempt + 1) * 2000);
          continue;
        }
        throw new Error("API overload. Coba lagi nanti.");
      }

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((c) => c.type === "text");
      if (!textBlock) throw new Error("Respons LLM tidak mengandung teks.");

      const result = JSON.parse(textBlock.text.trim());
      return {
        ...result,
        wordCount
      };
    } catch (err) {
      if (attempt === retries) {
        // Fallback: assume not eligible
        return {
          type: 'unknown',
          wordCount,
          eligibleForHookMeter: false,
          reason: 'Klasifikasi gagal, default tidak eligible'
        };
      }
      await sleep((attempt + 1) * 1000);
    }
  }
};

// ============================================================================
// HOOK METER - STORYTELLING ANALYSIS
// ============================================================================

const HOOK_METER_PROMPT = `Anda redaktur senior media Indonesia dengan keahlian storytelling journalism.

TUGAS: Analisis kualitas storytelling artikel dengan 5 dimensi.

DIMENSI PENILAIAN:

1. OPENING HOOK (25% bobot)
   - Opening sentence menarik perhatian?
   - Ada pertanyaan, statistik mengejutkan, atau scene langsung engage?
   - Lead langsung ke inti berita?

2. CHARACTER PRESENCE (20% bobot)
   - Ada orang nyata dengan perspektif/kutipan langsung?
   - Ada karakter yang bisa dibayangkan pembaca?
   - Sudut pandang manusia (bukan hanya data/fakta)?

3. NARRATIVE ARC (20% bobot)
   - Ada konflik atau masalah yang dibangun?
   - Ada perkembangan cerita dari awal ke akhir?
   - Ada resolusi atau lessons learned?

4. SENSORY DETAILS (15% bobot)
   - Ada deskripsi spesifik (waktu, tempat, suasana)?
   - Atau hanya statement abstrak/generic?
   - Ada details yang membuat pembaca "see the scene"?

5. EMOTIONAL RESONANCE (20% bobot)
   - Bisa membangun emosi pembaca (empati, curiosity, urgency)?
   - Word choice evocative atau flat?
   - Ada element yang relatable untuk audiens?

SCORING: 0-100 per dimensi, 0-100 total

BALAS HANYA JSON valid:
{
  "score": 0-100,
  "level": "excellent|good|average|below_average|poor",
  "metrics": {
    "openingHook": {"score": 0-100, "strength": "kekuatan di dimensi ini", "weakness": "kelemahan di dimensi ini"},
    "characterPresence": {"score": 0-100, "strength": "...", "weakness": "..."},
    "narrativeArc": {"score": 0-100, "strength": "...", "weakness": "..."},
    "sensoryDetails": {"score": 0-100, "strength": "...", "weakness": "..."},
    "emotionalResonance": {"score": 0-100, "strength": "...", "weakness": "..."}
  },
  "summary": "ringkasan keseluruhan storytelling quality",
  "suggestions": ["suggestion1", "suggestion2", "suggestion3"]
}`;

export const analyzeHookMeter = async (text, retries = 2) => {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  
  // Skip if article too short
  if (wordCount < 400) {
    return {
      skipped: true,
      reason: 'Artikel terlalu pendek untuk storytelling analysis',
      score: null
    };
  }
  
  // Truncate for API efficiency
  let truncatedText = text;
  if (text.length > 5000) {
    truncatedText = text.slice(0, 5000);
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch("https://gateway.olagon.site/anthropic/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 800,
          system: HOOK_METER_PROMPT,
          messages: [
            { role: "user", content: `Analisis storytelling artikel ini:\n"""\n${truncatedText}\n"""` }
          ],
        }),
      });

      if (response.status === 529 || response.status === 429) {
        if (attempt < retries) {
          await sleep((attempt + 1) * 2000);
          continue;
        }
        throw new Error("API overload. Coba lagi nanti.");
      }

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((c) => c.type === "text");
      if (!textBlock) throw new Error("Respons LLM tidak mengandung teks.");

      const result = JSON.parse(textBlock.text.trim());
      return {
        ...result,
        wordCount,
        analyzedAt: new Date().toISOString()
      };
    } catch (err) {
      if (attempt === retries) {
        throw err;
      }
      await sleep((attempt + 1) * 1000);
    }
  }
};

// ============================================================================
// AUTO-REVISION SERVICE
// ============================================================================

// Category descriptions for revision
const CATEGORY_RULES = {
  passive: {
    label: "Kalimat Pasif",
    rule: "Ubah semua kalimat pasif (awalan 'di-', 'ter-') menjadi kalimat aktif. Contoh: 'Proyek diresmikan oleh pemerintah' -> 'Pemerintah meresmikan proyek'."
  },
  complex: {
    label: "Kalimat Panjang",
    rule: "Sederhanakan kalimat yang lebih dari 25 kata tanpa memecah menjadi kalimat terpisah."
  },
  formal: {
    label: "Kata Formal Berulang",
    rule: "Variasikan kata formal yang berulang dengan sinonim atau ungkapan yang lebih natural."
  },
  puebi: {
    label: "Ejaan & PUEBI",
    rule: "Perbaiki semua ejaan sesuai PUEBI (Pedoman Umum Ejaan Bahasa Indonesia)."
  },
  spacing: {
    label: "Spasi Ganda",
    rule: "PERINGATAN: Spasi ganda sudah diperbaiki secara otomatis di frontend. Lewati kategori ini."
  },
  trailing: {
    label: "Spasi di Akhir Baris",
    rule: "PERINGATAN: Spasi trailing sudah diperbaiki secara otomatis di frontend. Lewati kategori ini."
  },
  struktur: {
    label: "Struktur & Format",
    rule: "PERINGATAN: Menggunakan prompt khusus Struktur & Format."
  },
  seo: {
    label: "SEO",
    rule: "PERINGATAN: Menggunakan prompt khusus SEO."
  }
};

// Custom prompts for special categories
const CUSTOM_PROMPTS = {
  struktur: `PERBAIKAN STRUKTUR & FORMAT:
1. Perbaiki judul agar 5-9 kata dengan verba aktif di awal
2. Perbaiki lead agar 40-60 kata, memuat fakta utama + elemen 5W1H (Siapa, Apa, Di mana, Kapan, Mengapa, Bagaimana)
3. Tambahkan subjudul H3 (### ) jika artikel >400 kata untuk memecah bagian
4. Restrukturasi agar mengikuti piramida terbalik: fakta penting di awal, detail pendukung di akhir
5. Gabungkan atau pisahkan paragraf yang terlalu panjang (>150 kata) atau terlalu pendek (<30 kata)`,
  
  seo: `PERBAIKAN SEO:
1. Perbaiki keyword density agar 1-2% - tambahkan kata kunci secara natural di judul, lead, dan subjudul
2. Hapus atau perbaiki paragraf "mati" (paragraf tanpa fakta, angka, atau kutipan)
3. Tambahkan fakta/data di setiap paragraf agar density 1 fakta per 150-200 kata
4. Pastikan lead mengandung kata kunci utama untuk meta description yang optimal`
};

// Generate dynamic system prompt for revision based on selected categories
const generateRevisionPrompt = (categories) => {
  const basicRules = categories
    .filter(cat => CATEGORY_RULES[cat] && !CUSTOM_PROMPTS[cat])
    .map(cat => `- ${CATEGORY_RULES[cat].rule}`)
    .join('\n');
  
  const customRules = categories
    .filter(cat => CUSTOM_PROMPTS[cat])
    .map(cat => CUSTOM_PROMPTS[cat])
    .join('\n\n');
  
  const categoryList = categories.join('|');
  
  return `Anda redaktur senior media Indonesia.

TUGAS: Revisi teks artikel berdasarkan kategori yang DIPILIH PENGGUNA.

KATEGORI YANG DIPILIH: ${categories.map(c => CATEGORY_RULES[c]?.label || c).join(', ')}

${basicRules ? `ATURAN DASAR:\n${basicRules}` : ''}

${customRules ? customRules : ''}

WAJIB JAGA (JANGAN DIUBAH):
- Fakta, angka, data statistik yang sudah ada
- Nama orang, tempat, institusi
- Tanggal dan waktu
- Struktur paragraf asli (kecuali untuk kategori struktur)

TUGAS KHUSUS:
1. Buat revised_text yang sudah diperbaiki sesuai kategori
2. Identifikasi PER KALIMAT apa yang diubah dan jelaskan alasannya
3. Hitung jumlah kata sebelum dan sesudah

BALAS HANYA JSON valid:
{
  "revised_text": "teks artikel yang sudah direvisi sesuai kategori...",
  "changes": [
    {
      "type": "${categoryList}",
      "original": "kalimat asli yang diubah...",
      "revised": "kalimat yang sudah diperbaiki...",
      "reason": "penjelasan singkat kenapa diubah"
    }
  ],
  "wordCount": {"before": 120, "after": 118}
}`;
};

// Parse revision response
const parseRevisionResponse = (text, originalText) => {
  const clean = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  
  try {
    return JSON.parse(clean);
  } catch {
    // Fallback: just return the text as revised_text
    return {
      revised_text: clean.slice(0, 5000),
      changes: [],
      wordCount: {
        before: originalText.split(/\s+/).length,
        after: clean.split(/\s+/).length
      }
    };
  }
};

// Main revision function
export const reviseText = async (text, categories = ['passive', 'puebi'], retries = 2) => {
  if (!text || !text.trim()) {
    throw new Error("Teks artikel diperlukan");
  }
  
  // Truncate for long articles
  let truncatedText = text;
  if (text.length > 5000) {
    truncatedText = text.slice(0, 5000);
  }
  
  const systemPrompt = generateRevisionPrompt(categories);
  const originalWordCount = text.split(/\s+/).length;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch("https://gateway.olagon.site/anthropic/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [
            { role: "user", content: `Artikel yang akan direvisi:\n"""\n${truncatedText}\n"""` }
          ],
        }),
      });

      if (response.status === 529 || response.status === 429) {
        if (attempt < retries) {
          await sleep((attempt + 1) * 2000);
          continue;
        }
        throw new Error("API overload. Coba lagi nanti.");
      }

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      const textBlock = data.content?.find((c) => c.type === "text");
      if (!textBlock) throw new Error("Respons LLM tidak mengandung teks.");

      const result = parseRevisionResponse(textBlock.text, text);
      
      // Ensure wordCount exists
      if (!result.wordCount) {
        result.wordCount = {
          before: originalWordCount,
          after: result.revised_text ? result.revised_text.split(/\s+/).length : originalWordCount
        };
      }

      return result;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep((attempt + 1) * 1000);
    }
  }
};
