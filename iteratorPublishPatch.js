"use strict";

const express = require("express");

const CACHE_TTL_MS = 60 * 60 * 1000;
let heroCache = [];
let cacheAt = 0;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function flatten(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value).map(flatten).filter(Boolean).join(" ");
  return String(value);
}

function titleOf(job) {
  return clean(
    job?.job_title_cz || job?.title_cz || job?.jobTitleCz || job?.position_cz ||
    job?.job_title || job?.jobTitle || job?.title || job?.position || job?.role || job?.name
  );
}

function linkOf(job) {
  const direct = clean(
    job?.link || job?.apply_url || job?.applyUrl || job?.url || job?.job_url || job?.jobUrl ||
    job?.job_link || job?.jobLink || job?.application_url || job?.applicationUrl ||
    job?.offer_url || job?.offerUrl || job?.details_url || job?.detailsUrl ||
    job?.external_url || job?.externalUrl || job?.direct_link || job?.directLink ||
    job?.apply_link || job?.applyLink
  );
  if (direct) return direct;

  const text = flatten([
    job?.text, job?.textHtml, job?.description, job?.caption, job?.content
  ]);
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? match[0] : "";
}

function imageOf(job) {
  return clean(job?.imageUrl || job?.image_url || job?.image || job?.previewUrl || job?.preview_url);
}

function languageText(job) {
  const direct = clean(flatten([
    job?.language_cz, job?.languages_cz, job?.language, job?.languages,
    job?.required_language, job?.required_languages, job?.jazyk, job?.jazyky
  ]));
  if (direct) return direct;
  return clean(flatten([job?.requirements, job?.description, job?.text, job?.textHtml]));
}

const ALLOWED = /(?:\benglish\b|angličtin|anglictin|anglick|\baj\b|\bczech\b|češtin|cestin|česk(?:y|ý|á|a)|\bcz\b)/iu;
const FORBIDDEN = /(?:\bdutch\b|nizozemštin|nizozemstin|holandštin|holandstin|\bgerman\b|němčin|nemcin|\bfrench\b|francouzštin|francouzstin|\bspanish\b|španělštin|spanelstin|\bitalian\b|italštin|italstin|\bdanish\b|dánštin|danstin|\bswedish\b|švédštin|svedstin|\bnorwegian\b|norštin|norstin|\bfinnish\b|finštin|finstin|\bgreek\b|řečtin|rectin|\bestonian\b|estonštin|estonstin|\bpolish\b|polštin|polstin|\bslovak\b|slovenštin|slovenstin|\bportuguese\b|portugalštin|portugalstin|local language|místní jazyk|mistni jazyk)/iu;

function allowedLanguage(job) {
  const text = languageText(job);
  return Boolean(text && ALLOWED.test(text) && !FORBIDDEN.test(text));
}

function forbiddenJob(job) {
  const text = clean(flatten([titleOf(job), job?.description, job?.requirements])).toLocaleLowerCase("cs-CZ");
  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(text);
}

function collectObjects(value, out = [], seen = new Set()) {
  if (value == null || out.length > 100) return out;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try { collectObjects(JSON.parse(trimmed), out, seen); } catch (_) {}
    }
    return out;
  }
  if (typeof value !== "object" || seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out, seen);
    return out;
  }
  if (titleOf(value) || imageOf(value) || linkOf(value)) out.push(value);
  for (const child of Object.values(value)) collectObjects(child, out, seen);
  return out;
}

function sameTitle(a, b) {
  return titleOf(a).toLocaleLowerCase("cs-CZ") === titleOf(b).toLocaleLowerCase("cs-CZ");
}

function findCached(candidate) {
  if (!heroCache.length || Date.now() - cacheAt > CACHE_TTL_MS) return null;

  const image = imageOf(candidate);
  if (image) {
    const hit = heroCache.find(job => imageOf(job) === image);
    if (hit) return hit;
  }

  const link = linkOf(candidate);
  if (link) {
    const hit = heroCache.find(job => linkOf(job) === link);
    if (hit) return hit;
  }

  const title = titleOf(candidate);
  if (title) {
    const hit = heroCache.find(job => sameTitle(job, candidate));
    if (hit) return hit;
  }

  return null;
}

function hydrate(candidate) {
  const cached = findCached(candidate);
  if (!cached) return candidate;
  const merged = { ...cached, ...candidate };
  if (!linkOf(merged)) merged.link = linkOf(cached);
  if (!languageText(merged)) {
    merged.language = cached.language || cached.language_cz || cached.languages || cached.languages_cz;
  }
  return merged;
}

const previousPost = express.application.post;

express.application.post = function iteratorSafePost(path, ...handlers) {
  if (path === "/generate") {
    const cacheGeneratedHero = (req, res, next) => {
      const originalJson = res.json.bind(res);
      res.json = body => {
        if (body && typeof body === "object" && Array.isArray(body.herohero)) {
          heroCache = body.herohero.slice(0, 5);
          cacheAt = Date.now();
          console.log(`[ITERATOR FIX] cached HeroHero ${heroCache.length}/5`);
        }
        return originalJson(body);
      };
      next();
    };
    return previousPost.call(this, path, cacheGeneratedHero, ...handlers);
  }

  if (path === "/publishHeroHero") {
    const publishOneIteratorItem = async (req, res) => {
      try {
        const raw = collectObjects(req.body);
        const hydrated = raw.map(hydrate);
        const valid = hydrated.filter(job => titleOf(job) && linkOf(job) && allowedLanguage(job) && !forbiddenJob(job));

        console.log(`[ITERATOR FIX] publish raw=${raw.length} valid=${valid.length} cache=${heroCache.length}`);

        if (!valid.length) {
          return res.status(422).json({
            success: false,
            error: "HeroHero Iterator položku se nepodařilo spojit s vygenerovanou nabídkou.",
            debug: {
              cache: heroCache.length,
              raw: raw.length,
              titles: raw.map(titleOf).filter(Boolean).slice(0, 5),
              images: raw.map(imageOf).filter(Boolean).slice(0, 5),
              linksAfterCache: hydrated.map(job => Boolean(linkOf(job))).slice(0, 5),
              languageAllowed: hydrated.map(job => allowedLanguage(job)).slice(0, 5)
            }
          });
        }

        const publishHeroHero = require("./publishHeroHero");
        const job = valid[0];
        job.link = linkOf(job);
        const result = await publishHeroHero(job);
        return res.status(200).json({ success: true, published: 1, title: titleOf(job), result });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    };

    return previousPost.call(this, path, publishOneIteratorItem);
  }

  return previousPost.call(this, path, ...handlers);
};

console.log("[ITERATOR FIX] HeroHero generated-cache iterator publishing active.");
