// Panggil LLM HANYA untuk kriteria yang butuh judgment kualitatif.
// Konten & Sumber, Etika, Revisi, Hook Meter — sisanya sudah dinilai heuristik.

import { config } from "../config.js";
import { logger } from "./logger.js";
import { metrics } from "./metrics.js";

// OPTIMIZED: ~300 tokens (was ~800 tokens)
// Prioritas: akurat tapi ringkas
const SYSTEM_PROMPT = `Anda redaktur senior media Indonesia. Nilai artikel ini:

1. KONTEN & SUMBER (0-100): newsworthiness, originalitas, relevansi audiens.

2. ETIKA & LEGALITAS (0-100): bias/keberimbangan, fitnah (tuduhan tanpa bukti), privasi.

CATATAN: Maksimal 80 karakter per note. Highlight SINGKAT 1-2 per dimensi.
WAJIB GUNAKAN BAHASA INDONESIA SAJA. Jangan campur bahasa asing termasuk bahasa China (新闻 dll).

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

// Helper to strip markdown and parse JSON from LLM response
const parseLLMResponse = (text) => {
  const clean = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  
  try {
    return JSON.parse(clean);
  } catch (err) {
    // Extract metrics from truncated JSON
    const extractMetric = (json, name) => {
      const re = new RegExp(`"${name}"\\s*:\\s*\\{[^}]*"score"\\s*:\\s*(\\d+)`);
      const m = json.match(re);
      return m ? parseInt(m[1]) : null;
    };
    
    const extractText = (json, name, field) => {
      const re = new RegExp(`"${name}"\\s*:\\s*\\{[^}]*"${field}"\\s*:\\s*"([^"]+)"`);
      const m = json.match(re);
      return m ? m[1] : '';
    };
    
    const buildMetric = (name) => ({
      score: extractMetric(clean, name) || 0,
      strength: extractText(clean, name, 'strength') || '',
      weakness: extractText(clean, name, 'weakness') || ''
    });
    
    const scoreMatch = clean.match(/"score":\s*(\d+)/);
    const levelMatch = clean.match(/"level":\s*"([^"]+)"/);
    const summaryMatch = clean.match(/"summary"\s*:\s*"([^"]+)"/);
    const suggestionMatch = clean.match(/"suggestions"\s*:\s*\[([^\]]+)\]/);
    
    if (scoreMatch && levelMatch) {
      const suggestions = suggestionMatch
        ? suggestionMatch[1].split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean)
        : [];
      
      return {
        score: parseInt(scoreMatch[1]),
        level: levelMatch[1],
        metrics: {
          openingHook: buildMetric('openingHook'),
          characterPresence: buildMetric('characterPresence'),
          narrativeArc: buildMetric('narrativeArc'),
          sensoryDetails: buildMetric('sensoryDetails'),
          emotionalResonance: buildMetric('emotionalResonance')
        },
        summary: summaryMatch ? summaryMatch[1] : 'Analisis terpotong - periksa detail di bawah',
        suggestions,
        _partial: true,
        _error: err.message
      };
    }
    
    throw new Error(`JSON tidak valid: ${err.message}. Response: ${clean.slice(0, 200)}...`);
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

PENTING: BALAS HANYA JSON TANPA MARKDOWN.
JANGAN gunakan kode blok markdown.
BALAS LANGSUNG OBJEK JSON SAJA:
{"type":"nama_tipe","subtype":"subtipe_jika_ada","wordCount":500,"eligibleForHookMeter":true,"reason":"penjelasan_singkat"}`;

// Tebak tipe artikel (straight_news, feature, human_interest, dll).
// Pakai quick-check patterns sebelum call LLM buat skip yang jelas-jelas.
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
        const errText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      
      // Check for API error
      if (data.error) {
        throw new Error(`API Error: ${data.error.type || 'unknown'} - ${data.error.message || JSON.stringify(data.error)}`);
      }
      
      // Check content structure
      if (!data.content || !Array.isArray(data.content)) {
        throw new Error(`Respons API tidak valid: content type is ${typeof data.content}`);
      }
      
      const textBlock = data.content?.find((c) => c.type === "text");
      if (!textBlock || !textBlock.text) {
        throw new Error("Respons LLM tidak mengandung teks.");
      }

      const result = parseLLMResponse(textBlock.text);
      return {
        ...result,
        wordCount
      };
    } catch (err) {
      logger.warn({ attempt: attempt + 1, error: err.message }, "Classify attempt failed");
      if (attempt === retries) {
        // Fallback: assume not eligible
        return {
          type: 'unknown',
          wordCount,
          eligibleForHookMeter: false,
          reason: `Klasifikasi gagal: ${err.message}`
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

PENTING: strength dan weakness maksimal 1 kalimat singkat per field. summary 1-2 kalimat.
suggestions maksimal 2 saran singkat.

SCORING: 0-100 per dimensi, 0-100 total

PENTING: BALAS HANYA JSON TANPA MARKDOWN.
JANGAN gunakan kode blok markdown.
BALAS LANGSUNG OBJEK JSON SAJA:
{
  "score": 0-100,
  "level": "excellent|good|average|below_average|poor",
  "metrics": {
    "openingHook": {"score": 0-100, "strength": "kekuatan singkat", "weakness": "kelemahan singkat"},
    "characterPresence": {"score": 0-100, "strength": "...", "weakness": "..."},
    "narrativeArc": {"score": 0-100, "strength": "...", "weakness": "..."},
    "sensoryDetails": {"score": 0-100, "strength": "...", "weakness": "..."},
    "emotionalResonance": {"score": 0-100, "strength": "...", "weakness": "..."}
  },
  "summary": "ringkasan 1-2 kalimat",
  "suggestions": ["saran singkat 1", "saran singkat 2"]
}`;

// Analisis kualitas storytelling: opening hook, karakter, alur cerita,
// detail sensori, dan resonansi emosi. Skip kalau artikel <400 kata.
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
          max_tokens: 2000,
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
        const errText = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      
      // Debug: log response metadata only — never log LLM content
      logger.debug({ status: data.status, model: data.model }, "Hook Meter response");
      
      // Check for API error in response
      if (data.error) {
        throw new Error(`API Error: ${data.error.type || 'unknown'} - ${data.error.message || JSON.stringify(data.error)}`);
      }
      
      // Check content structure
      if (!data.content || !Array.isArray(data.content)) {
        throw new Error(`Respons API tidak valid: content type is ${typeof data.content}`);
      }
      
      // Find text block
      const textBlock = data.content?.find((c) => c.type === "text");
      if (!textBlock || !textBlock.text) {
        // Try to find any block with text
        const anyBlock = data.content.find((c) => c.text);
        if (anyBlock) {
          const result = parseLLMResponse(anyBlock.text);
          return {
            ...result,
            wordCount,
            analyzedAt: new Date().toISOString()
          };
        }
        throw new Error("Respons LLM tidak mengandung teks.");
      }

      const result = parseLLMResponse(textBlock.text);
      return {
        ...result,
        wordCount,
        analyzedAt: new Date().toISOString()
      };
    } catch (err) {
      logger.warn({ attempt: attempt + 1, error: err.message }, "Hook Meter attempt failed");
      if (attempt === retries) {
        // Return skipped result instead of throwing
        return {
          skipped: true,
          reason: `Analisis gagal: ${err.message}`,
          score: null,
          wordCount
        };
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
    label: "SEO & Audiens",
    rule: "PERINGATAN: Menggunakan prompt khusus SEO & Audiens."
  },
  konten: {
    label: "Konten & Sumber",
    rule: "PERINGATAN: Menggunakan prompt khusus Konten & Sumber."
  },
  mesinBaca: {
    label: "Mesin-Baca",
    rule: "PERINGATAN: Menggunakan prompt khusus Mesin-Baca."
  },
  hookMeter: {
    label: "Storytelling",
    rule: "PERINGATAN: Menggunakan prompt khusus Storytelling."
  }
};

// Custom prompts for special categories
const CUSTOM_PROMPTS = {
  struktur: `PERBAIKAN STRUKTUR & FORMAT:
1. JUDUL: Jika judul menggunakan passive voice (awalan 'di-', 'ter-'), ubah ke aktif. Judul harus 5-9 kata dengan verba aktif di awal. Contoh: "Jembatan diresmikan oleh Presiden" -> "Presiden Resmikan Jembatan"
2. LEAD: Perbaiki agar 40-60 kata, memuat fakta utama + elemen 5W1H lengkap (Siapa, Apa, Di mana, Kapan, Mengapa, Bagaimana)
3. SUBJUDUL H3: Jika artikel >400 kata, tambahkan subjudul ### untuk memecah bagian
4. PIRAMIDA TERBALIK: Fakta penting di awal paragraf, detail pendukung di akhir
5. PARAGRAF: Gabung jika >150 kata, pisah jika <30 kata tanpa fakta
6. PENUTUP: Tambahkan frasa penutup yang baik jika belum ada (contoh: "Lebih lanjut akan dibahas...", "Diesebutkan bahwa...")
7. ATRIBUSI: Jika tidak ada sumber resmi/narasumber, tambahkan paragraf atribusi`,

  seo: `PERBAIKAN SEO & AUDIENS:
1. KEYWORD: Perbaiki keyword density agar 1-2% - tambahkan kata kunci utama secara natural di judul, lead, dan subjudul
2. DEAD PARAGRAPH: Hapus atau perbaiki paragraf "mati" (paragraf tanpa fakta, angka, atau kutipan) - tambahkan data/fakta
3. TAUTAN: Tambahkan 2+ tautan internal ke artikel terkait jika belum ada
4. READABILITY: Sederhanakan kalimat >25 kata. Pecah kalimat kompleks menjadi 2 kalimat pendek
5. KALIMAT PANJANG: Kalimat ideal 10-20 kata. Jika >25 kata, pecah dengan conjunction
6. PARAGRAF: Paragraf untuk pembaca online ideal 30-80 kata. Pecah paragraf >80 kata`,

  konten: `PERBAIKAN KONTEN & SUMBER:
1. NEWS VALUE: Jika topik kurang menarik/dampak, tambahkan sudut berita yang lebih relevan (dampak ke masyarakat, data pendukung, konteks)
2. KUTIPAN: Tambahkan kutipan langsung dari narasumber bernama jelas (nama + jabatan) jika belum ada
3. SUMBER RESMI: Tambahkan sumber dari institusi resmi (BNPB, BPS, Kemendagri, dll) untuk data/angka
4. ANONIM: Jika ada sumber anonim/tanpa nama jelas, ubah ke atribusi bernama atau hapus rujukan anonim
5. KEBERIMBANGAN: Jika hanya satu perspektif, tambahkan sudut pandang pihak lain (pro kontra,responden alternatif)`,

  mesinBaca: `PERBAIKAN MESIN-BACA (READABILITY UNTUK MESIN CRAWLER):
1. LEAD QUALITY: Lead harus memuat siapa, apa, di mana, kapan dalam 40-60 kata di paragraph pertama. Tambahkan elemen 5W1H yang kurang
2. SECTION HEADING: Jika artikel >400 kata tanpa subjudul, tambahkan ### subjudul untuk memecah bagian. Gunakan H3 markdown
3. ATRIBUSI: Setiap klaim/data harus disertai atribusi. Jika ada tanpa sumber, tambahkan "(Sumber: ...)"
4. HEADING HIERARCHY: Pastikan heading konsisten. Jangan lompat dari H2 ke H4. Subjudul gunakan ###`,

  hookMeter: `PERBAIKAN STORYTELLING (HOOK METER):
1. OPENING HOOK: Perbaiki kalimat pertama agar lebih menarik - bisa pakai pertanyaan, statistik mengejutkan, atau scene langsung
2. CHARACTER PRESENCE: Tambahkan perspektif manusia (kutipan langsung, pengalaman personal, tokoh nyata)
3. NARRATIVE ARC: Bangun alur cerita yang jelas - ada konflik/masalah, perkembangan, dan resolusi atau lessons learned
4. SENSORY DETAILS: Tambahkan deskripsi spesifik tentang waktu, tempat, suasana, detail fisik yang membuat pembaca "melihat" kejadian
5. EMOTIONAL RESONANCE: Pilih kata yang lebih evocative, bangun empati atau rasa ingin tahu, buat lebih relatable
PENTING: Jaga fakta, angka, nama, dan data statistik tetap akurat.`
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

PENTING: BALAS HANYA JSON TANPA MARKDOWN.
JANGAN gunakan kode blok markdown.
PERHATIAN: JANGAN buat entry changes jika original === revised.
HANYA buat entry untuk perubahan yang NYATA (original berbeda dari revised).

BALAS LANGSUNG OBJEK JSON SAJA:
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

// Find matching closing quote for a JSON string value, respecting escapes (ponytail: char-by-char over regex)
const findMatchingQuote = (str, start) => {
  let i = start;
  while (i < str.length) {
    if (str[i] === '\\') { i += 2; continue; }
    if (str[i] === '"') return i;
    i++;
  }
  return -1;
};

// Extract revised_text from raw JSON string using char-by-char approach
const extractRevisedText = (str) => {
  const keyIdx = str.indexOf('"revised_text"');
  if (keyIdx === -1) return '';
  const colonIdx = str.indexOf(':', keyIdx);
  if (colonIdx === -1) return '';
  const quoteIdx = str.indexOf('"', colonIdx);
  if (quoteIdx === -1) return '';
  const endIdx = findMatchingQuote(str, quoteIdx + 1);
  if (endIdx === -1) return '';
  return str.slice(quoteIdx + 1, endIdx)
    .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
};

// Extract changes array from raw JSON using bracket matching + object-level fallback
const extractChanges = (str) => {
  const changesStart = str.indexOf('"changes":[');
  if (changesStart === -1) return [];

  // Find matching closing bracket
  let depth = 0, started = false, start = -1, end = -1;
  for (let i = changesStart + '"changes":['.length - 1; i < str.length; i++) {
    if (str[i] === '[' && !started) { started = true; start = i + 1; }
    if (!started) continue;
    if (str[i] === '[') depth++;
    else if (str[i] === ']') {
      if (depth === 0) { end = i; break; }
      depth--;
    }
  }

  if (start === -1 || end === -1 || end <= start) return [];
  const slice = str.slice(start, end);

  const isValidChange = (c) =>
    c.original?.trim() && c.revised?.trim() &&
    c.original.trim() !== c.revised.trim() &&
    c.original.length > 3 && c.revised.length > 3 &&
    !c.original.includes('[DUPLIKAT]') && !c.original.includes('[HAPUS]') &&
    !c.original.includes('[PARAGRAPH]') && !c.original.includes('###');

  try {
    const changes = JSON.parse('[' + slice + ']');
    return changes.filter(isValidChange);
  } catch {
    // Try object-level extraction (each { ... } as separate object)
    const objs = (slice.match(/\{[\s\S]*?\}/g) || [])
      .map(m => { try { return JSON.parse(m); } catch { return null; } })
      .filter(Boolean);
    return objs.filter(isValidChange);
  }
};

// Generate changes from sentence-level diff (fallback when LLM sends no changes)
const generateChangesFromDiff = (originalText, revisedText, categories = []) => {
  const origSents = originalText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
  const revSents = revisedText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
  const generated = [];

  // Use first selected category as type label
  const typeLabel = categories[0] || 'revisi';

  // Check which sentences are different
  revSents.forEach((rev, i) => {
    if (i < origSents.length && origSents[i].trim() !== rev.trim()) {
      generated.push({
        type: typeLabel,
        original: origSents[i].trim().slice(0, 200),
        revised: rev.trim().slice(0, 200),
        reason: 'Teks diperbaiki'
      });
    }
  });

  return generated.slice(0, 10);
};

// Parse revision response
const parseRevisionResponse = (text, originalText, categories = []) => {
  const clean = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    const parsed = JSON.parse(clean);
    const meaningfulChanges = (parsed.changes || []).filter(c =>
      c.original?.trim() && c.revised?.trim() &&
      c.original.trim() !== c.revised.trim() &&
      c.original.length > 3 && c.revised.length > 3
    );
    return { ...parsed, changes: meaningfulChanges };
  } catch {
    // Fallback: try char-by-char extraction
    const revisedText = extractRevisedText(clean);
    const changes = extractChanges(clean);

    // Validation: must have meaningful revised text
    const isValid = revisedText.length > 20 && !revisedText.includes('"revised_text"');
    if (!isValid) {
      // True fallback: plain text response
      return {
        revised_text: clean.slice(0, 5000),
        changes: [],
        wordCount: {
          before: originalText.split(/\s+/).length,
          after: clean.split(/\s+/).length
        }
      };
    }

    // If changes empty but text changed, auto-generate from sentence diff
    let finalChanges = changes;
    if (changes.length === 0 && revisedText.length > 20) {
      const generated = generateChangesFromDiff(originalText, revisedText, categories);
      if (generated.length > 0) {
        finalChanges = generated;
      }
    }

    return {
      revised_text: revisedText,
      changes: finalChanges,
      wordCount: {
        before: originalText.split(/\s+/).length,
        after: revisedText.split(/\s+/).length
      }
    };
  }
};

// Main revision function
export const reviseText = async (text, categories = ['passive', 'complex', 'formal', 'puebi'], retries = 3) => {
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
          max_tokens: 3000,
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

      const result = parseRevisionResponse(textBlock.text, text, categories);

      // Check if parse succeeded — retry if still invalid JSON
      const isValidResult = result.revised_text &&
        result.revised_text.length > 20 &&
        !result.revised_text.includes('"revised_text"');

      if (!isValidResult) {
        if (attempt < retries) {
          await sleep((attempt + 1) * 2000);
          continue;
        }
        // Last attempt — return what we have
        return result;
      }

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
