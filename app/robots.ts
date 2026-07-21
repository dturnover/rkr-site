import type { MetadataRoute } from "next";

// Crawlers that collect pages to train (or ground) generative AI models.
// This is a deliberately different list from search-engine crawlers: the goal
// is for RKR to be *findable* on Google/Bing while its 132k catalogue entries
// aren't hoovered into someone's training corpus.
//
// The important subtlety is that the big search companies run SEPARATE agents
// for the two jobs, precisely so sites can opt out of one without the other:
//   Googlebot          -> Google Search indexing        (ALLOWED below)
//   Google-Extended    -> Gemini / Vertex AI training   (blocked here)
//   Bingbot            -> Bing Search indexing          (ALLOWED below)
//   Applebot           -> Siri / Spotlight search       (ALLOWED below)
//   Applebot-Extended  -> Apple Intelligence training   (blocked here)
// Blocking the "-Extended" variants has no effect on search ranking or
// inclusion — Google documents this explicitly.
const AI_CRAWLERS = [
  // Google (AI training only — Googlebot itself stays allowed)
  "Google-Extended",
  "Google-CloudVertexBot",
  // OpenAI
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic
  "ClaudeBot",
  "Claude-Web",
  "Claude-SearchBot",
  "anthropic-ai",
  // Apple (Applebot itself stays allowed for Siri/Spotlight search)
  "Applebot-Extended",
  // Meta
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "FacebookBot",
  // Common Crawl — not an AI company itself, but its archive is the single
  // biggest source of training data for everyone else, so it belongs here.
  "CCBot",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Other major model builders / AI search
  "Amazonbot",
  "Bytespider",
  "cohere-ai",
  "cohere-training-data-crawler",
  "DeepSeekBot",
  "MistralAI-User",
  "YouBot",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "Diffbot",
  "ImagesiftBot",
  "Kangaroo Bot",
  "omgili",
  "omgilibot",
  "Webzio-Extended",
  "Timpibot",
  "TikTokSpider",
  "Scrapy",
];

// Not catalogue content — no crawler has any business here.
const PRIVATE_PATHS = ["/admin", "/api/", "/mod-log", "/records/new"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Everything not named below (Googlebot, Bingbot, DuckDuckBot, Applebot,
      // and any well-behaved crawler) may index the catalogue freely. A named
      // group always wins over "*" in the robots.txt spec, so the AI rules
      // that follow take precedence for those agents.
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: AI_CRAWLERS,
        disallow: "/",
      },
    ],
  };
}
