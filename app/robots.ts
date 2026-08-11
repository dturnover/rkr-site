import type { MetadataRoute } from "next";
import { sitemapChunkCount } from "@/lib/seo";
import { SITE_URL } from "@/lib/siteUrl";

// Cache the generated robots.txt for a day. It reads the catalogue size to
// list the child sitemaps (below), and crawlers refetch robots.txt rarely, so
// there's no reason to recompute it per request.
export const revalidate = 86400;

// Crawlers that collect pages to train generative AI models, or to fetch
// source material at answer time so an assistant can reply without sending
// anyone here. The catalogue should stay findable in search and shareable
// between collectors; it should not be quietly absorbed into someone's model.
//
// The important subtlety is that the big companies run SEPARATE agents for
// indexing vs. AI, precisely so a site can opt out of one without the other:
//   Googlebot          -> Google Search indexing        (ALLOWED)
//   Google-Extended    -> Gemini / Vertex AI training   (blocked)
//   Applebot           -> Siri / Spotlight search       (ALLOWED)
//   Applebot-Extended  -> Apple Intelligence training   (blocked)
//   DuckDuckBot        -> DuckDuckGo search             (ALLOWED)
//   DuckAssistBot      -> DuckDuckGo AI answers         (blocked)
//   YandexBot          -> Yandex search                 (ALLOWED)
//   YandexAdditional   -> Yandex AI                     (blocked)
// Blocking the AI-side agents has no effect on search ranking or inclusion.
//
// DELIBERATELY NOT BLOCKED, despite appearing on public AI-crawler lists —
// each of these would cost something the site actually wants:
//   Applebot            Siri and Spotlight search results
//   facebookexternalhit link previews when a record is shared on
//                       WhatsApp / Messenger / Facebook — collectors share
//                       these links constantly, and blocking it turns every
//                       shared link into a blank grey box
//   PetalBot            Huawei's Petal Search index
//   Bravebot            Brave Search index
// Flip any of them into the list below if that trade stops being worth it.
//
// One honest limit: robots.txt is a request, not a wall. It binds crawlers
// that choose to read it. Anything determined to take the data can ignore
// this file or lie about its user-agent, and several operators on this list
// have been caught doing exactly that. Enforcement would need edge blocking.
const AI_CRAWLERS = [
  // ---- Google (AI only; Googlebot itself stays allowed) ----
  "Google-Extended",
  "Google-CloudVertexBot",
  "CloudVertexBot",
  "Google-Agent",
  "Google-Firebase",
  "Google-Gemini-CLI",
  "Google-NotebookLM",
  "Gemini-Deep-Research",
  "GoogleAgent-Mariner",
  "GoogleAgent-URLContext",
  "GoogleOther",
  "GoogleOther-Image",
  "GoogleOther-Video",
  "NotebookLM",

  // ---- OpenAI ----
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ChatGPT Agent",
  "OpenAI",
  "Operator",

  // ---- Anthropic ----
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Claude-SearchBot",
  "Claude-Code",
  "anthropic-ai",

  // ---- Apple (Applebot itself stays allowed — Siri/Spotlight search) ----
  "Applebot-Extended",

  // ---- Meta (facebookexternalhit stays allowed — link previews) ----
  // robots.txt user-agent matching is case-insensitive (RFC 9309), so the
  // lowercase spellings these bots also identify with are already covered.
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
  "meta-webindexer",
  "FacebookBot",

  // ---- Amazon ----
  "Amazonbot",
  "amazon-kendra",
  "amazon-QBusiness",
  "AmazonBuyForMe",
  "Amzn-SearchBot",
  "Amzn-User",
  "bedrockbot",

  // ---- Microsoft / Azure ----
  "AzureAI-SearchBot",

  // ---- Common Crawl and bulk dataset builders. Not AI companies as such,
  //      but their archives are the single largest source of training data
  //      for everyone else, so they matter most on this list. ----
  "CCBot",
  "img2dataset",
  "laion-huggingface-processor",
  "LAIONDownloader",
  "VelenPublicWebCrawler",
  "Webzio-Extended",
  "omgili",
  "omgilibot",

  // ---- AI search / answer engines ----
  "PerplexityBot",
  "Perplexity-User",
  "YouBot",
  "DuckAssistBot",
  "kagi-fetcher",
  "ExaBot",
  "TavilyBot",
  "LinerBot",
  "iAskBot",
  "iaskspider",
  "iaskspider/2.0",
  "PhindBot",
  "Andibot",
  "bigsur.ai",
  "LinkupBot",
  "Querit-SearchBot",
  "QueritBot",
  "Aranet-SearchBot",
  "AddSearchBot",
  "Channel3Bot",
  "AIWebIndex",
  "newsai",
  "UseAI",

  // ---- Yandex AI (YandexBot search stays allowed) ----
  "YandexAdditional",
  "YandexAdditionalBot",

  // ---- Other model builders ----
  "cohere-ai",
  "cohere-training-data-crawler",
  "DeepSeekBot",
  "MistralAI-User",
  "MistralAI-User/1.0",
  "Bytespider",
  "TikTokSpider",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "AI2Bot-DeepResearchEval",
  "PanguBot",
  "TongyiBot",
  "YiyanBot",
  "ChatGLM-Spider",
  "Kimi-User",
  "SBIntuitionsBot",
  "WRTNBot",
  "ZanistaBot",
  "Shap-User",
  "ShapBot",
  "Poggio-Citations",
  "TwinAgent",
  "Mozilla-Tabstack",
  "GeistHaus-PageFetcher",

  // ---- Coding / browsing agents ----
  "Cursor",
  "Devin",
  "opencode",
  "Trae",
  "Code",
  "NovaAct",
  "Manus-User",
  "Crawl4AI",
  "FirecrawlAgent",
  "ApifyBot",
  "ApifyWebsiteContentCrawler",
  "Crawlspace",
  "Scrapy",
  "Spider",
  "CragCrawler",
  "Cloudflare-AutoRAG",

  // ---- Scrapers, data brokers, and content-monitoring crawlers ----
  "Diffbot",
  "ImagesiftBot",
  "imageSpider",
  "Timpibot",
  "Kangaroo Bot",
  "Awario",
  "Brightbot",
  "Brightbot 1.0",
  "BuddyBot",
  "Cotoyogi",
  "Datenbank Crawler",
  "Echobot Bot",
  "EchoboxBot",
  "Factset_spyderbot",
  "FriendlyCrawler",
  "HenkBot",
  "IbouBot",
  "ICC-Crawler",
  "ISSCyberRiskCrawler",
  "KlaviyoAIBot",
  "KunatoCrawler",
  "LCC",
  "Linguee Bot",
  "MyCentralAIScraperBot",
  "NagetBot",
  "netEstate Imprint Crawler",
  "Panscient",
  "panscient.com",
  "Poseidon Research Crawler",
  "QualifiedBot",
  "QuillBot",
  "quillbot.com",
  "SemrushBot-OCOB",
  "SemrushBot-SWA",
  "Sidetrade indexer bot",
  "Terra Cotta",
  "TerraCotta",
  "Thinkbot",
  "WARDBot",
  "wpbot",
  "YaK",
  "AgentTimes",
  "aiHitBot",
  "Anomura",
  "atlassian-bot",
];

// Not catalogue content — no crawler has any business here. The editor and
// admin pages additionally send a noindex header (see their page metadata),
// which is what actually keeps them out of search results if a URL leaks.
const PRIVATE_PATHS = ["/admin", "/api/", "/mod-log", "/records/new"];

// Crawlers that put the catalogue in front of people looking for it. Exempt
// from the Crawl-delay applied to everything else — slowing these down only
// slows down how much of the discography is findable. Prefix matching means
// "Googlebot" also covers Googlebot-Image, Googlebot-News and the rest.
const SEARCH_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "DuckDuckBot",
  "Applebot",
  "YandexBot",
  "Baiduspider",
  "PetalBot",
  "Bravebot",
  "facebookexternalhit",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // generateSitemaps() emits child sitemaps at /sitemap/0.xml, /sitemap/1.xml,
  // … and this Next version does NOT serve a combined /sitemap.xml index
  // (confirmed: it 404s), so list every child sitemap explicitly.
  // The index is listed first (it's the single URL to hand to Search Console),
  // followed by the children so a crawler that ignores indexes still finds
  // every one.
  const chunks = await sitemapChunkCount();
  const sitemaps = [
    `${SITE_URL}/sitemap_index.xml`,
    ...Array.from({ length: chunks }, (_, i) => `${SITE_URL}/sitemap/${i}.xml`),
  ];

  return {
    rules: [
      // Everything not named below — Googlebot, Bingbot, DuckDuckBot,
      // Applebot, YandexBot, facebookexternalhit and any other well-behaved
      // crawler — may index the catalogue freely. A named group always wins
      // over "*" in the robots.txt spec, so the AI rules take precedence for
      // those agents.
      // The search engines worth being in. Named explicitly so the
      // Crawl-delay on "*" below can't apply to them: a named group wins
      // outright in the robots.txt spec, and these are the crawlers whose
      // speed we do NOT want to limit — every page they fetch is a page that
      // becomes findable.
      {
        userAgent: SEARCH_CRAWLERS,
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      // Everything else: still allowed, but asked to space its requests out.
      // This is aimed at the long tail of SEO tools, monitors and small
      // crawlers that walk every URL in the sitemap back to back; one second
      // apart is no obstacle to reading the site and takes the edge off a
      // full 135k-page sweep.
      //
      // Worth being clear about what this is NOT: Crawl-delay is a request,
      // it is ignored by Google entirely, and anything harvesting the
      // catalogue on purpose will disregard it along with the rest of this
      // file. Actual rate enforcement has to happen at the edge, before a
      // request reaches the app (see the Vercel Firewall rule).
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
        crawlDelay: 1,
      },
      {
        userAgent: AI_CRAWLERS,
        disallow: "/",
      },
    ],
    sitemap: sitemaps,
  };
}
