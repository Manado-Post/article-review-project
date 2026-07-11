// URL Scraper - Extract article text from web pages
// Uses cheerio to parse HTML and extract article content
// Implements AMP fallback for JavaScript-rendered sites
// Uses Puppeteer for sites requiring "Show All" pagination

import * as cheerio from "cheerio";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

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
 * Fetch article using Puppeteer (headless Chrome) for JavaScript-rendered content
 * Handles "Show All" pagination buttons
 * @param {string} url - The URL to fetch
 * @returns {Promise<{text: string, title: string}>}
 */
const fetchWithPuppeteer = async (url) => {
  const chromePath = await findChromePath();
  if (!chromePath) {
    throw new Error("Chrome not found. Cannot use Puppeteer mode.");
  }

  const browser = await puppeteer.launch({
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

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Navigate to URL
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for content to load (use Promise-based timeout for compatibility)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to click "Show All" buttons
    const showAllSelectors = [
      "button:has-text('Show All')",
      "button:has-text('Show all')",
      "button:has-text('Lihat Semua')",
      "button:has-text('Lihat semua')",
      "button:has-text('Baca Selengkapnya')",
      "button:has-text('Selengkapnya')",
      "a:has-text('Show All')",
      "a:has-text('Lihat Semua')",
      "[data-load-more]",
      ".load-more",
      ".show-more",
      "#show-more",
      ".btn-show-all",
    ];

    for (const selector of showAllSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          // Scroll button into view first
          await button.evaluate((el) => el.scrollIntoView({ behavior: "instant", block: "center" }));
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Click the button
          await button.click();
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for content to load
        }
      } catch {
        // Button not found or cannot click, continue
      }
    }

    // Scroll page to trigger lazy loading (infinite scroll sites)
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try scrolling again (some sites need multiple scrolls)
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Extract article content
    const result = await page.evaluate(() => {
      // Remove unwanted elements
      const removeSelectors = [
        "script", "style", "nav", "header", "footer", "aside",
        ".ads", ".advertisement", ".sidebar", ".menu", ".navigation",
        ".comments", ".social-share", ".related-articles", ".breadcrumb",
        ".breaking-news", ".breaking", ".breaking-banner"
      ];
      
      removeSelectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });

      // Get title
      const title =
        document.querySelector("h1")?.textContent?.trim() ||
        document.querySelector("title")?.textContent?.trim() ||
        "";

      // Try article elements
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

      let contentText = "";

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

      // Fallback to all paragraphs
      if (!contentText || contentText.length < 200) {
        const paragraphs = document.querySelectorAll("p, h2, h3, h4, li, blockquote");
        contentText = Array.from(paragraphs)
          .map((p) => p.textContent?.trim())
          .filter((text) => text && text.length > 30)
          .join("\n\n");
      }

      return { title, text: contentText };
    });

    if (!result.text || result.text.length < 100) {
      throw new Error("Puppeteer: No content extracted");
    }

    return result;
  } finally {
    await browser.close();
  }
};

/**
 * Fetch article content from URL with multiple extraction methods
 * Compares results and returns the longest content
 * @param {string} url - The URL to fetch
 * @returns {Promise<{text: string, title: string, domain: string}>}
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

  try {
    // Collect all extraction results
    const results = [];
    
    // Step 1: Try to fetch main URL with JSON extraction + cheerio
    let html = await fetchHtml(url);
    let extracted = extractArticleText(html, url);
    if (extracted.text && extracted.text.length >= 100) {
      results.push({
        text: extracted.text,
        title: extracted.title,
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
            method: 'amp',
            length: ampExtracted.text.length
          });
        }
      } catch {
        // AMP fetch failed
      }
    }

    // Step 3: Try Puppeteer for JS-rendered content / Show All pagination
    try {
      const puppeteerResult = await fetchWithPuppeteer(url);
      if (puppeteerResult.text && puppeteerResult.text.length >= 100) {
        results.push({
          text: puppeteerResult.text,
          title: puppeteerResult.title,
          method: 'puppeteer',
          length: puppeteerResult.text.length
        });
      }
    } catch (puppeteerError) {
      console.log("Puppeteer failed:", puppeteerError.message);
    }

    // Find the longest result
    if (results.length > 0) {
      const best = results.reduce((a, b) => a.length > b.length ? a : b);
      console.log(`Best extraction: ${best.method} (${best.length} chars) from ${results.length} methods`);
      return {
        text: best.text,
        title: best.title,
        domain: domain,
      };
    }

    // Step 4: Try to get og:description as last resort
    const ogDesc = extractOgDescription(html);
    if (ogDesc && ogDesc.length > 50) {
      return {
        text: `[Cuplikan artikel - konten lengkap memerlukan JavaScript rendering]\n\n${ogDesc}`,
        title: extracted.title,
        domain: domain,
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
