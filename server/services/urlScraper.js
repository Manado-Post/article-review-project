// URL Scraper - Extract article text from web pages
// Uses cheerio to parse HTML and extract article content
// Implements AMP fallback for JavaScript-rendered sites
// Uses Puppeteer for sites requiring "Show All" pagination

import * as cheerio from "cheerio";
import puppeteer from "puppeteer-core";
import pLimit from "p-limit";
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

// Common Chrome/Edge paths for different environments
const CHROME_PATHS = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\polob\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ],
};

/**
 * Validate URL format
 * @param {string} url
 * @returns {boolean}
 */
const isValidUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

// Puppeteer concurrency control — max 3 concurrent browser instances
const PUPPETEER_CONCURRENCY = 3;
const puppeteerQueue = pLimit(PUPPETEER_CONCURRENCY);

// Browser pool — reuse one browser instance for all scraping
let browserPool = null;
const BROWSER_TIMEOUT_MS = 60000; // 60s per scraping job

const getBrowser = async () => {
  if (!browserPool || !browserPool.connected) {
    const chromePath = findChromePath();
    if (!chromePath) return null;
    browserPool = await puppeteer.launch({
      executablePath: chromePath,
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920x1080",
      ],
    });
  }
  return browserPool;
};

/**
 * Construct AMP URL from original URL
 * Supports various Indonesian news sites
 * @param {string} url
 * @returns {string|null}
 */
const AMP_SITES = [
  "jawapos.com",
  "detik.com",
  "kompas.com",
  "tribunnews.com",
  "sindonews.com",
  "republika.co.id",
  "merdeka.com",
  "cnnindonesia.com",
  "jpnn.com",
];

const constructAmpUrl = (url) => {
  try {
    const parsed = new URL(url);
    const cleanPath = parsed.pathname.replace(/^\/amp\//, "");
    parsed.pathname = "/amp" + cleanPath;
    return parsed.toString();
  } catch {
    return null;
  }
};

/**
 * Extract article from JSON payload in data-page attribute
 * Used by manadopost and similar sites that embed full content in initial HTML
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @returns {{text: string, title: string}|null}
 */
const extractFromJsonPayload = ($) => {
  try {
    // Look for data-page attribute containing JSON with article content
    const dataPage = $("[data-page]").attr("data-page");
    if (!dataPage) return null;

    // Decode HTML entities if present (cheerio returns decoded, but sometimes raw)
    let jsonString = dataPage;
    try {
      // Try parsing directly first (cheerio usually decodes)
      JSON.parse(jsonString);
    } catch {
      // If failed, try decoding common HTML entities
      jsonString = dataPage
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
    }

    // Parse JSON
    let pageData;
    try {
      pageData = JSON.parse(jsonString);
    } catch (parseError) {
      // Final attempt: decode all HTML entities
      const textarea = cheerio.load(null)._root;
      // Use a temporary element to decode
      const tempDiv = cheerio.load(`<div>${dataPage}</div>`)('div').html();
      if (tempDiv) {
        try {
          pageData = JSON.parse(tempDiv);
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }
    
    // Navigate to article content (structure varies by site)
    // Common structures: pageData.article.content, pageData.content, pageData.post, pageData.data, pageData.props.pageProps.article
    let content = 
      pageData.article?.content 
      || pageData.post?.content
      || pageData.content 
      || pageData.data?.content
      || pageData.props?.pageProps?.article?.content
      || pageData.props?.pageProps?.content
      || pageData.initialData?.content
      || pageData.article?.body
      || pageData.post?.body
      || pageData.body
      || null;

    let title = 
      pageData.article?.title 
      || pageData.post?.title
      || pageData.title 
      || pageData.data?.title
      || pageData.props?.pageProps?.article?.title
      || pageData.props?.pageProps?.title
      || pageData.initialData?.title
      || null;

    // Handle nested content arrays (manadopost often has array of paragraphs)
    if (Array.isArray(content)) {
      content = content.map(item => {
        if (typeof item === 'string') return item;
        if (item.text) return typeof item.text === 'string' ? item.text : extractTextFromNodes(item.text);
        if (item.content) return typeof item.content === 'string' ? item.content : extractTextFromNodes(item.content);
        if (item.p) return typeof item.p === 'string' ? item.p : extractTextFromNodes(item.p);
        return null;
      }).filter(Boolean).join('\n\n');
    } else if (typeof content === 'object' && content !== null) {
      content = extractTextFromNodes(content);
    }

    // Return content if found (even if short - let comparison decide)
    if (content && typeof content === 'string' && content.trim().length > 0) {
      return { text: content.trim(), title: title || null };
    }

    return null;
  } catch (e) {
    // JSON parse failed or structure unexpected
    return null;
  }
};

/**
 * Recursively extract text from node objects
 * @param {any} node - JSON node
 * @returns {string}
 */
const extractTextFromNodes = (node) => {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  
  // Check common text fields
  if (node.text) return typeof node.text === 'string' ? node.text : '';
  if (node.content) return typeof node.content === 'string' ? node.content : '';
  if (node.p) return typeof node.p === 'string' ? node.p : '';
  if (node.paragraph) return typeof node.paragraph === 'string' ? node.paragraph : '';
  
  // Recurse into children
  let text = '';
  if (Array.isArray(node.content)) {
    text = node.content.map(extractTextFromNodes).filter(Boolean).join('\n\n');
  } else if (Array.isArray(node.children)) {
    text = node.children.map(extractTextFromNodes).filter(Boolean).join('\n\n');
  } else if (Array.isArray(node.paragraphs)) {
    text = node.paragraphs.map(extractTextFromNodes).filter(Boolean).join('\n\n');
  }
  
  return text;
};

/**
 * Extract article text from HTML using cheerio
 * @param {string} html
 * @param {string} url - Original URL for context
 * @returns {{text: string, title: string}}
 */
const extractArticleText = (html, url) => {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $(
    "script, style, nav, header, footer, aside, .ads, .advertisement, .sidebar, .menu, .navigation, .comments, .social-share, .related-articles, .breadcrumb, .breaking-news, .breaking, .breaking-banner",
  ).remove();

  // Extract title
  let title =
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    $("h2").first().text().trim() ||
    "";

  // Try JSON payload extraction first (manadopost and similar sites)
  const jsonResult = extractFromJsonPayload($);
  if (jsonResult && jsonResult.text.length > 100) {
    return {
      text: jsonResult.text,
      title: jsonResult.title || title,
    };
  }

  // Try AMP-specific selectors first (AMP pages have specific structure)
  const ampSelectors = [
    "article.content",
    "article.post-content",
    ".amp-content",
    ".amp-article",
    ".story-body",
    ".article-body",
  ];

  // Common article content selectors (priority order)
  const articleSelectors = [
    "article",
    '[role="article"]',
    ".article-content",
    ".article-body",
    ".post-content",
    ".entry-content",
    ".content-body",
    ".story-content",
    ".berita-content",
    ".news-content",
    ".main-content",
    "main",
    "#article",
    "#content",
    ".content",
    ".amp-wp-content", // WordPress AMP
    ".amp-entry-content", // WordPress AMP alternative
  ];

  let articleText = "";

  // Try AMP-specific selectors first
  for (const selector of ampSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      const paragraphs = element.find("p");
      if (paragraphs.length > 0) {
        articleText = paragraphs
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((text) => text.length > 20)
          .join("\n\n");

        if (articleText.length > 200) break;
      }
    }
  }

  // Try standard selectors
  if (!articleText || articleText.length < 200) {
    for (const selector of articleSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        const paragraphs = element.find("p, h2, h3, h4, li, blockquote");
        if (paragraphs.length > 0) {
          articleText = paragraphs
            .map((_, el) => $(el).text().trim())
            .get()
            .filter((text) => text.length > 20)
            .join("\n\n");

          if (articleText.length > 200) break;
        }
      }
    }
  }

  // Fallback: get all paragraph-like content from body
  if (!articleText || articleText.length < 200) {
    const allContent = $("p, h2, h3, h4, li, blockquote")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((text) => text.length > 30)
      .join("\n\n");

    if (allContent.length > articleText.length) {
      articleText = allContent;
    }
  }

  return { text: articleText, title };
};

/**
 * Extract Open Graph description as fallback
 * @param {string} html
 * @returns {string|null}
 */
const extractOgDescription = (html) => {
  const $ = cheerio.load(html);
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const metaDesc = $('meta[name="description"]').attr("content");
  return ogDesc || metaDesc || null;
};

/**
 * Fetch HTML from a URL with standard headers
 * @param {string} url
 * @returns {Promise<string>}
 */
const fetchHtml = async (url) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error("Not HTML");
  }

  return response.text();
};

/**
 * Find Chrome executable path for Puppeteer
 * @returns {string|null}
 */
const findChromePath = () => {
  const platform = process.platform;
  const paths = CHROME_PATHS[platform] || [];
  
  for (const chromePath of paths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  return null;
};

/**
 * Check if URL is from manadopost or similar jawapos network
 * @param {string} url
 * @returns {boolean}
 */
const isManadoPostSite = (url) => {
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes('manadopost') || 
           hostname.includes('jawapos') ||
           hostname.includes('radar') ||
           hostname.includes('jjmn');
  } catch {
    return false;
  }
};

/**
 * Extract article using Puppeteer (headless Chrome) for JavaScript-rendered content
 * Handles "Show All" pagination buttons
 * Uses browser pool (reuses single browser instance) + concurrency queue (max 3)
 * @param {string} url - The URL to fetch
 * @returns {Promise<{text: string, title: string, metadata: object}|null>}
 */
const fetchWithPuppeteer = async (url) => {
  return puppeteerQueue(async () => {
    const browser = await getBrowser();
    if (!browser) {
      logger.warn({ url }, "Puppeteer skipped: Chrome not found");
      return null;
    }

    let page;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Navigate with individual timeout
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      // Wait for JS rendering
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Click "Show All" buttons if present
      const showAllSelectors = [
        "button:has-text('Show All')", "button:has-text('Show all')",
        "button:has-text('Lihat Semua')", "button:has-text('Lihat semua')",
        "button:has-text('Baca Selengkapnya')", "button:has-text('Selengkapnya')",
        "a:has-text('Show All')", "a:has-text('Lihat Semua')",
        "[data-load-more]", ".load-more", ".show-more", "#show-more", ".btn-show-all",
      ];

      for (const selector of showAllSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.evaluate((el) => el.scrollIntoView({ behavior: "instant", block: "center" }));
            await new Promise(resolve => setTimeout(resolve, 500));
            await button.click();
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch { /* skip individual button errors */ }
      }

      // Scroll to load lazy content
      for (let i = 0; i < 2; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const isManadoPost = isManadoPostSite(url);
      const result = await page.evaluate((isManadoPost) => {
      // Remove unwanted elements
      const removeSelectors = [
        "script", "style", "nav", "header", "footer", "aside",
        ".ads", ".advertisement", ".sidebar", ".menu", ".navigation",
        ".comments", ".social-share", ".related-articles", ".breadcrumb",
        ".breaking-news", ".breaking", ".breaking-banner", "iframe"
      ];
      
      removeSelectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });

      // Get title
      const title =
        document.querySelector("h1")?.textContent?.trim() ||
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector('meta[name="twitter:title"]')?.content ||
        document.querySelector("title")?.textContent?.trim() ||
        "";

      // Extract metadata
      const metadata = {
        author: 
          document.querySelector('meta[name="content_Author"]')?.content ||
          document.querySelector('meta[property="article:author"]')?.content ||
          null,
        category: 
          document.querySelector('meta[name="content_Category"]')?.content ||
          document.querySelector('meta[property="article:section"]')?.content ||
          null,
        publishedDate:
          document.querySelector('meta[property="article:published_time"]')?.content ||
          document.querySelector('meta[name="content_PublishedDate"]')?.content ||
          null,
        description:
          document.querySelector('meta[property="og:description"]')?.content ||
          document.querySelector('meta[name="description"]')?.content ||
          null,
      };

      // Try to get author/penulis from dataLayer script
      try {
        const dataLayerMatch = document.body.innerHTML.match(/dataLayer\s*=\s*(\[.*?\])/);
        if (dataLayerMatch) {
          const dataLayer = JSON.parse(dataLayerMatch[1]);
          if (dataLayer[0]) {
            metadata.author = metadata.author || dataLayer[0].penulis || dataLayer[0].author || null;
            metadata.category = metadata.category || dataLayer[0].rubrik || dataLayer[0].category || null;
          }
        }
      } catch (e) {
        // dataLayer parse failed, continue without it
      }

      let contentText = "";

      // For manadopost/jawapos sites: use specific selectors
      if (isManadoPost) {
        // Primary: p.isSelectedEnd - collect ALL paragraphs, not just first match
        // manadopost has paragraphs with class "isSelectedEnd" containing article text
        const manadoParagraphs = [];
        
        // Selector 1: p.isSelectedEnd span (paragraphs with span inside)
        document.querySelectorAll("p.isSelectedEnd").forEach(el => {
          const span = el.querySelector("span");
          const text = span ? span.textContent?.trim() : el.textContent?.trim();
          if (text && text.length > 10 && !text.match(/^\s*&nbsp;\s*$/)) {
            manadoParagraphs.push(text);
          }
        });
        
        // Selector 2: .artikel .rt-Text p (alternative structure)
        if (manadoParagraphs.length < 5) {
          document.querySelectorAll(".artikel .rt-Text p").forEach(el => {
            const text = el.textContent?.trim();
            if (text && text.length > 10 && !text.match(/^\s*&nbsp;\s*$/) && !el.classList.contains("isSelectedEnd")) {
              manadoParagraphs.push(text);
            }
          });
        }
        
        // Selector 3: .artikel container direct text (last resort)
        if (manadoParagraphs.length < 5) {
          const artikelEl = document.querySelector(".artikel");
          if (artikelEl) {
            // Get all text nodes from article container
            const walker = document.createTreeWalker(
              artikelEl,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            let textNode;
            while (textNode = walker.nextNode()) {
              const text = textNode.textContent?.trim();
              if (text && text.length > 20 && !text.match(/^\s*&nbsp;/) && !text.match(/MANADOPOST\.ID/)) {
                manadoParagraphs.push(text);
              }
            }
          }
        }
        
        if (manadoParagraphs.length > 0) {
          contentText = manadoParagraphs.join("\n\n");
        }
      }

      // Fallback: standard selectors for other sites
      if (!contentText || contentText.length < 200) {
        const articleSelectors = [
          "article",
          '[role="article"]',
          ".article-content",
          ".article-body",
          ".post-content",
          ".entry-content",
          ".content-body",
          ".story-content",
          ".berita-content",
          ".news-content",
          ".main-content",
          "main",
          "#article",
          ".amp-wp-content",
        ];

        for (const selector of articleSelectors) {
          const article = document.querySelector(selector);
          if (article) {
            const paragraphs = article.querySelectorAll("p, h2, h3, h4, li, blockquote");
            if (paragraphs.length > 0) {
              contentText = Array.from(paragraphs)
                .map((p) => p.textContent?.trim())
                .filter((text) => text && text.length > 20)
                .join("\n\n");
              
              if (contentText.length > 200) break;
            }
          }
        }
      }

      // Last fallback: all paragraphs
      if (!contentText || contentText.length < 200) {
        const paragraphs = document.querySelectorAll("p, h2, h3, h4, li, blockquote");
        contentText = Array.from(paragraphs)
          .map((p) => p.textContent?.trim())
          .filter((text) => text && text.length > 30)
          .join("\n\n");
      }

      return { title, text: contentText, metadata };
    }, isManadoPost);

    if (!result.text || result.text.length < 100) {
      return null;
    }

    return {
      text: result.text,
      title: result.title,
      metadata: result.metadata || {}
    };
    } finally {
      // Close page (not browser — reuse from pool)
      if (page) await page.close().catch(() => {});
    }
  });
};

/**
 * Fetch article content from URL with multiple extraction methods
 * Compares results and returns the longest content
 * @param {string} url - The URL to fetch
 * @returns {Promise<{text: string, title: string, domain: string, metadata: object}>}
 * @throws {Error} - If URL is invalid, fetch fails, or no content extracted
 */
export const fetchArticleFromUrl = async (url) => {
  // Validate URL
  if (!url || !url.trim()) {
    throw new Error("URL tidak boleh kosong.");
  }

  if (!isValidUrl(url)) {
    throw new Error(
      "URL tidak valid. Pastikan URL dimulai dengan http:// atau https://",
    );
  }

  const parsed = new URL(url);
  const domain = parsed.hostname.replace("www.", "");
  const isManadoPost = isManadoPostSite(url);

  try {
    // Collect all extraction results
    const results = [];
    
    // Step 1: Try to fetch main URL with JSON extraction + cheerio
    let html = await fetchHtml(url);
    let extracted = extractArticleText(html, url);
    
    // Also extract metadata from HTML
    const $ = cheerio.load(html);
    const htmlMetadata = {
      author: 
        $('meta[name="content_Author"]').attr("content") ||
        $('meta[property="article:author"]').attr("content") ||
        null,
      category: 
        $('meta[name="content_Category"]').attr("content") ||
        $('meta[property="article:section"]').attr("content") ||
        null,
      publishedDate:
        $('meta[property="article:published_time"]').attr("content") ||
        $('meta[name="content_PublishedDate"]').attr("content") ||
        null,
      description:
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="description"]').attr("content") ||
        null,
    };
    
    // Try to get dataLayer metadata
    try {
      const dataLayerMatch = html.match(/dataLayer\s*=\s*(\[.*?\])/);
      if (dataLayerMatch) {
        const dataLayer = JSON.parse(dataLayerMatch[1]);
        if (dataLayer[0]) {
          htmlMetadata.author = htmlMetadata.author || dataLayer[0].penulis || null;
          htmlMetadata.category = htmlMetadata.category || dataLayer[0].rubrik || null;
        }
      }
    } catch (e) {
      // dataLayer parse failed
    }
    
    if (extracted.text && extracted.text.length >= 100) {
      results.push({
        text: extracted.text,
        title: extracted.title,
        metadata: htmlMetadata,
        method: 'json+cheerio',
        length: extracted.text.length
      });
    }

    // Step 2: Try AMP version
    const ampUrl = constructAmpUrl(url);
    if (ampUrl && ampUrl !== url) {
      try {
        const ampHtml = await fetchHtml(ampUrl);
        const ampExtracted = extractArticleText(ampHtml, ampUrl);
        if (ampExtracted.text && ampExtracted.text.length >= 100) {
          results.push({
            text: ampExtracted.text,
            title: ampExtracted.title,
            metadata: htmlMetadata, // Use same metadata
            method: 'amp',
            length: ampExtracted.text.length
          });
        }
      } catch (ampError) {
        logger.warn({ url: ampUrl, error: ampError.message }, "AMP extraction failed");
      }
    }

    // Step 3: Try Puppeteer for JS-rendered content / Show All pagination
    // This is the MAIN method for manadopost since it's a SPA
    const puppeteerResult = await fetchWithPuppeteer(url);
    if (puppeteerResult) {
      if (puppeteerResult.text && puppeteerResult.text.length >= 100) {
        results.push({
          text: puppeteerResult.text,
          title: puppeteerResult.title,
          metadata: puppeteerResult.metadata || htmlMetadata,
          method: 'puppeteer',
          length: puppeteerResult.text.length
        });
      }
    } else {
      // Chrome not available — skip Puppeteer silently
    }

    // Find the longest result
    if (results.length > 0) {
      const best = results.reduce((a, b) => a.length > b.length ? a : b);
      logger.info({ method: best.method, chars: best.length, methodsTried: results.length }, "URL extraction done");
      return {
        text: best.text,
        title: best.title,
        domain: domain,
        metadata: best.metadata || {},
        extractionMethod: best.method,
        extractionCount: results.length,
      };
    }

    // Step 4: Try to get og:description as last resort
    const ogDesc = extractOgDescription(html);
    if (ogDesc && ogDesc.length > 50) {
      return {
        text: `[Cuplikan artikel - konten lengkap memerlukan JavaScript rendering]\n\n${ogDesc}`,
        title: extracted.title,
        domain: domain,
        metadata: htmlMetadata,
      };
    }

    // All methods failed
    throw new Error(
      "Tidak dapat mengekstrak artikel dari halaman ini. Website mungkin menggunakan konten JavaScript yang tidak bisa di-ekstrak.",
    );
  } catch (error) {
    if (error.name === "AbortError" || error.message.includes("timeout")) {
      throw new Error("Waktu habis. URL terlalu lambat untuk diakses.");
    }

    if (
      error.message.includes("fetch failed") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ENOTFOUND")
    ) {
      throw new Error(
        "Tidak dapat terhubung ke website ini. Pastikan URL benar dan website dapat diakses.",
      );
    }

    // Re-throw our custom errors
    throw error;
  }
};

export default fetchArticleFromUrl;
