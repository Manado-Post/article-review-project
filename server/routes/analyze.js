import { Router } from "express";
import {
  analyzeStruktur,
  analyzeBahasaHeuristic,
  analyzeSEO,
  analyzeTeknis,
  analyzeMachineReadability,
  analyzeKonten,
  analyzeEtika,
  analyzeAudiens,
} from "../services/heuristics.js";
import { evaluateWithLLM, reviseText, classifyArticle, analyzeHookMeter } from "../services/llmEvaluator.js";
import { hashText, getCached, setCached } from "../services/cache.js";
import { fetchArticleFromUrl } from "../services/urlScraper.js";
import { extractVerificationFlags } from "../services/factExtractor.js";
import { config } from "../config.js";

const router = Router();

// Cache versioning - increment when structure changes
const CACHE_VERSION = 'v4';

// Weights (8 dimensions)
const WEIGHTS = {
  struktur: 0.20,
  bahasa: 0.15,
  seo: 0.10,
  audiens: 0.05,
  teknis: 0.05,
};

// Thresholds for LLM bypass (cost optimization)
const HIGH_THRESHOLD = 85;
const LOW_THRESHOLD = 50;

const estimateHeuristicScore = (struktur, bahasa, seo, audiens, teknis) => {
  const heuristicScore = Math.round(
    struktur.score * WEIGHTS.struktur +
      bahasa.score * WEIGHTS.bahasa +
      seo.score * WEIGHTS.seo +
      audiens.score * WEIGHTS.audiens +
      teknis.score * WEIGHTS.teknis,
  );
  return {
    heuristicOnly: heuristicScore,
    estimated: heuristicScore + 30 // proxy for avg konten+etika
  };
};

/**
 * Estimate LLM scores using heuristics (local mode)
 */
const estimateLLMScores = (struktur, bahasa, seo, text) => {
  const wordCount = (text.trim().split(/\s+/)).length;
  
  // Estimate konten score based on SEO, structure, and word count
  let kontenEstimate = 60;
  if (seo.score >= 80 && wordCount >= 400) kontenEstimate += 15;
  else if (seo.score >= 60 && wordCount >= 300) kontenEstimate += 10;
  if (struktur.score >= 80) kontenEstimate += 10;
  if (seo.score >= 70) kontenEstimate += 5;
  
  // Estimate etika score based on attribution and content patterns
  let etikaEstimate = 70;
  const hasOfficialSources = /\b(BNPB|BPS|Kemendagri|Kementerian|BMKG|BPK|PUPR|Pemerintah)\b/i.test(text);
  const hasDefamationRisk = /koruptor|tersangka|pelaku.*tanpa.*diduga/i.test(text);
  const hasMultipleSides = (text.match(/,/g) || []).length > 5; // Multiple sources
  
  if (hasOfficialSources) etikaEstimate += 10;
  if (hasMultipleSides) etikaEstimate += 5;
  if (hasDefamationRisk) etikaEstimate -= 20;
  
  return {
    konten: { 
      score: Math.min(100, Math.max(30, kontenEstimate)), 
      note: "[Estimasi otomatis - mode lokal]" 
    },
    etika: { 
      score: Math.min(100, Math.max(30, etikaEstimate)), 
      note: "[Estimasi otomatis - mode lokal]" 
    }
  };
};

router.post("/analyze", async (req, res) => {
  const { text, url, mode: requestedMode } = req.body;

  try {
    // Determine mode: requested mode takes priority, then config
    const mode = requestedMode || config.mode;
    
    // If local mode requested but API key exists, still use local
    const useLocalMode = mode === 'local' || 
      (mode === 'hybrid' && !config.anthropicApiKey) ||
      (mode === 'llm' && !config.anthropicApiKey);
    
    let articleText = text;
    let sourceUrl = null;
    let sourceDomain = null;

    // Fetch article from URL if provided
    if ((!articleText || !articleText.trim()) && url && url.trim()) {
      try {
        const scraped = await fetchArticleFromUrl(url);
        articleText = scraped.text;
        sourceUrl = url;
        sourceDomain = scraped.domain;
      } catch (scrapeError) {
        return res.status(400).json({ error: scrapeError.message });
      }
    }

    // Validate input
    if (!articleText || !articleText.trim()) {
      return res
        .status(400)
        .json({ error: "Teks artikel atau URL diperlukan." });
    }

    // Check cache (include mode and version in cache key)
    const cacheKey = hashText(articleText + `|mode:${mode}|ver:${CACHE_VERSION}`);
    const cached = getCached(cacheKey);
    if (cached && cached.mode === mode) {
      return res.json({ 
        ...cached, 
        fromCache: true,
        sourceUrl: sourceUrl,
        sourceDomain: sourceDomain,
      });
    }

    // 1. Run all heuristics (instant, free)
    const struktur = analyzeStruktur(articleText);
    const bahasaHeuristik = analyzeBahasaHeuristic(articleText);
    const seo = analyzeSEO(articleText);
    const audiens = analyzeAudiens(articleText);
    const teknis = analyzeTeknis(articleText);
    const machineReadability = analyzeMachineReadability(articleText);
    const konten = analyzeKonten(articleText);
    const etika = analyzeEtika(articleText);
    
    // Extract verification flags for UI
    const verificationFlags = extractVerificationFlags(articleText);

    // 2. Decide whether to use LLM
    const { heuristicOnly, estimated } = estimateHeuristicScore(struktur, bahasaHeuristik, seo, audiens, teknis);
    const skipLLM = useLocalMode || estimated >= HIGH_THRESHOLD || estimated < LOW_THRESHOLD;

    let llmResult;
    let skippedLLM = skipLLM;

    if (!skipLLM) {
      // 3. Call LLM for konten & etika
      llmResult = await evaluateWithLLM(articleText);
    } else {
      // Use real heuristic analysis for LLM scores (local mode)
      llmResult = {
        konten: { 
          score: konten.score,
          note: konten.notes[0] || "Analisis heuristik selesai",
          strengths: konten.strengths,
          weaknesses: konten.weaknesses
        },
        etika: { 
          score: etika.score,
          note: etika.notes[0] || "Analisis heuristik selesai",
          strengths: etika.strengths,
          weaknesses: etika.weaknesses
        },
        highlights: [],
        // Include full detail for UI
        kontenDetail: konten,
        etikaDetail: etika
      };
    }

    // 4. Calculate weighted overall score (8 dimensions)
    const overallScore = Math.round(
      llmResult.konten.score * 0.30 +
        struktur.score * 0.20 +
        bahasaHeuristik.score * 0.15 +
        llmResult.etika.score * 0.15 +
        seo.score * 0.10 +
        audiens.score * 0.05 +
        teknis.score * 0.05,
    );

    const verdict =
      overallScore >= 75
        ? "Layak terbit"
        : overallScore >= 50
          ? "Perlu revisi"
          : "Ditolak";

    const result = {
      overallScore,
      verdict,
      summary: llmResult.konten.note,
      mode: useLocalMode ? 'local' : (mode === 'llm' ? 'llm' : 'hybrid'),
      details: [
        { 
          name: "Konten & Sumber", 
          value: String(llmResult.konten.score), 
          text: llmResult.konten.note,
          notes: llmResult.konten.notes || [],
          strengths: llmResult.konten.strengths || [],
          weaknesses: llmResult.konten.weaknesses || [],
          meta: {
            newsValueScore: konten.meta?.newsValueScore,
            originalityScore: konten.meta?.originalityScore,
            sumberScore: konten.meta?.sumberScore,
            quoteCount: konten.meta?.quoteCount,
          }
        },
        { 
          name: "Struktur/Format", 
          value: String(struktur.score), 
          text: struktur.notes?.join(' ') || '',
          notes: struktur.notes || [],
          strengths: struktur.strengths || [],
          weaknesses: struktur.weaknesses || [],
          meta: {
            leadWords: struktur.meta?.leadWords,
            headingCount: struktur.meta?.headingCount,
            headlineWords: struktur.meta?.headlineWords,
            headlineIsActive: struktur.meta?.headlineIsActive,
            has5W1H: struktur.meta?.has5W1H,
            w1hCount: struktur.meta?.w1hElements?.count,
            pyramidScore: struktur.meta?.pyramidScore,
            nutGraf: struktur.meta?.nutGraf,
          }
        },
        { 
          name: "Bahasa & Gaya", 
          value: String(bahasaHeuristik.score), 
          text: bahasaHeuristik.notes?.join(' ') || '',
          notes: bahasaHeuristik.notes || [],
          strengths: bahasaHeuristik.strengths || [],
          weaknesses: bahasaHeuristik.weaknesses || [],
          meta: {
            readability: bahasaHeuristik.meta?.readability,
            passiveRatio: bahasaHeuristik.meta?.passiveRatio,
            puebiScore: bahasaHeuristik.meta?.puebiScore,
            toneScore: bahasaHeuristik.meta?.toneScore,
          }
        },
        { 
          name: "Etika & Legalitas", 
          value: String(llmResult.etika.score), 
          text: llmResult.etika.note,
          notes: llmResult.etika.notes || [],
          strengths: llmResult.etika.strengths || [],
          weaknesses: llmResult.etika.weaknesses || [],
          meta: {
            defamationRisk: etika.meta?.defamationRisk,
            perspectiveBalance: etika.meta?.perspectiveBalance,
            privacyRisks: etika.meta?.privacyRisks,
          }
        },
        { 
          name: "SEO", 
          value: String(seo.score), 
          text: seo.notes?.join(' ') || '',
          notes: seo.notes || [],
          strengths: seo.strengths || [],
          weaknesses: seo.weaknesses || [],
          meta: {
            wordCount: seo.meta?.wordCount,
            factCount: seo.meta?.factCount,
            keywordDensity: seo.meta?.keywordDensity,
            internalLinkCount: seo.meta?.internalLinkCount,
            externalLinkCount: seo.meta?.externalLinkCount,
            clickWorthyScore: seo.meta?.clickWorthyScore,
            isShortArticle: seo.meta?.isShortArticle,
          }
        },
        { 
          name: "Audiens", 
          value: String(audiens.score), 
          text: audiens.notes?.join(' ') || '',
          notes: audiens.notes || [],
          strengths: audiens.strengths || [],
          weaknesses: audiens.weaknesses || [],
          meta: {
            readability: audiens.meta?.readability,
            avgWordsPerSentence: audiens.meta?.avgWordsPerSentence,
            headlineWordCount: audiens.meta?.headlineWordCount,
            impactKeywords: audiens.meta?.impactKeywords,
            paragraphCount: audiens.meta?.paragraphCount,
          }
        },
        { 
          name: "Pemeriksaan Teknis", 
          value: String(teknis.score), 
          text: teknis.notes?.join(' ') || '',
          notes: teknis.notes || [],
          strengths: teknis.strengths || [],
          weaknesses: teknis.weaknesses || [],
          meta: {
            doubleSpaces: teknis.meta?.doubleSpaces,
            trailingSpaces: teknis.meta?.trailingSpaces,
            headingScore: teknis.meta?.headingScore,
            plagiarismScore: teknis.meta?.plagiarismScore,
            imageCount: teknis.meta?.imageCount,
          }
        },
        { 
          name: "Mesin-Baca (AI-SEO)", 
          value: String(machineReadability.score), 
          text: machineReadability.notes?.join(' ') || 'Skor keterbacaan untuk mesin (Google AI, LLM)',
          notes: machineReadability.notes || [],
          meta: {
            leadScore: machineReadability.meta?.leadScore,
            headingScore: machineReadability.meta?.headingScore,
            sectionScore: machineReadability.meta?.sectionScore,
            factDensityScore: machineReadability.meta?.factDensityScore,
            attributionScore: machineReadability.meta?.attributionScore,
          }
        },
      ],
      highlights: Array.isArray(llmResult.highlights) ? llmResult.highlights : [],
      verificationFlags: Array.isArray(verificationFlags.flags) ? verificationFlags.flags : [],
      verificationSummary: verificationFlags.summary,
      sourceUrl: sourceUrl,
      sourceDomain: sourceDomain,
      fromCache: false,
      skippedLLM: skippedLLM
    };

    setCached(cacheKey, result);

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err.message || "Terjadi kesalahan saat analisis." });
  }
});

// Get supported modes
router.get("/modes", (req, res) => {
  res.json({
    modes: [
      { 
        id: 'local', 
        name: 'Mode Lokal', 
        description: 'Gratis, instan (~70% akurat)',
        requiresApiKey: false,
        features: ['Heuristic scoring', 'Basic fact extraction']
      },
      { 
        id: 'hybrid', 
        name: 'Mode Hybrid', 
        description: 'Akurat (~85% akurat), hemat biaya',
        requiresApiKey: true,
        features: ['Heuristic + LLM', 'Smart bypass', 'Fact extraction']
      },
      { 
        id: 'llm', 
        name: 'Mode LLM Penuh', 
        description: 'Paling akurat (~95%), biaya lebih tinggi',
        requiresApiKey: true,
        features: ['Full LLM analysis', 'Complete evaluation']
      },
    ],
    currentMode: config.mode,
    hasApiKey: !!config.anthropicApiKey,
  });
});

// Endpoint for AI-based text revision with category selection
router.post("/revise", async (req, res) => {
  const { text, categories = [] } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Teks artikel diperlukan." });
  }

  if (categories.length === 0) {
    return res.status(400).json({ error: "Pilih minimal satu kategori untuk direvisi." });
  }

  try {
    const result = await reviseText(text, categories);
    return res.json(result);
  } catch (err) {
    console.error("Revisi error:", err);
    return res.status(500).json({ error: err.message || "Gagal melakukan revisi." });
  }
});

// Classify article type and determine Hook Meter eligibility
router.post("/classify", async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Teks artikel diperlukan." });
  }

  try {
    const result = await classifyArticle(text);
    return res.json(result);
  } catch (err) {
    console.error("Classification error:", err);
    return res.status(500).json({ error: err.message || "Gagal mengklasifikasikan artikel." });
  }
});

// Analyze Hook Meter (storytelling quality) with caching
router.post("/hook-meter", async (req, res) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Teks artikel diperlukan." });
  }

  const cacheKey = hashText(text + "|hook-meter|v1");
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json({ ...cached, fromCache: true });
  }

  try {
    const result = await analyzeHookMeter(text);
    setCached(cacheKey, result);
    return res.json(result);
  } catch (err) {
    console.error("Hook Meter error:", err);
    return res.status(500).json({ error: err.message || "Gagal menganalisis Hook Meter." });
  }
});

// Combined endpoint: classify + Hook Meter in one call
router.post("/analyze-with-hook-meter", async (req, res) => {
  const { text, url } = req.body;

  let articleText = text;
  
  // Fetch article from URL if provided
  if ((!articleText || !articleText.trim()) && url && url.trim()) {
    try {
      const scraped = await fetchArticleFromUrl(url);
      articleText = scraped.text;
    } catch (scrapeError) {
      return res.status(400).json({ error: scrapeError.message });
    }
  }

  if (!articleText || !articleText.trim()) {
    return res.status(400).json({ error: "Teks artikel atau URL diperlukan." });
  }

  try {
    // Classify article first
    const classification = await classifyArticle(articleText);
    
    // Analyze Hook Meter only if eligible
    let hookMeter = null;
    if (classification.eligibleForHookMeter) {
      hookMeter = await analyzeHookMeter(articleText);
    }
    
    return res.json({
      classification,
      hookMeter
    });
  } catch (err) {
    console.error("Analyze with Hook Meter error:", err);
    return res.status(500).json({ error: err.message || "Gagal menganalisis artikel." });
  }
});

export default router;
