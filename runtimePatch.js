"use strict";

// Preload patch for the Make -> Render workflow.
// It fixes HeroHero batch collection without rewriting index.js and ranks
// simple manual jobs before specialized positions.

const express = require("express");

const BATCH_SIZE = 5;
const CACHE_TTL_MS = 30 * 60 * 1000;
const RECENT_TTL_MS = 60 * 60 * 1000;

let generatedCache = [];
let generatedHistory = [];
let generatedAt = 0;
let pending = [];
let pendingAt = 0;
let publishChain = Promise.resolve();
const recent = new Map();

const supportedCountries = new Set([
  "austria", "at", "rakousko",
  "belgium", "be", "belgie",
  "denmark", "dk", "dánsko", "dansko",
  "estonia", "ee", "estonsko",
  "finland", "fi", "finsko",
  "france", "fr", "francie",
  "netherlands", "nl", "holland", "holandsko", "nizozemsko", "nizozemí",
  "ireland", "ie", "irsko",
  "italy", "it", "itálie", "italie",
  "cyprus", "cy", "kypr",
  "malta", "mt",
  "germany", "de", "německo", "nemecko",
  "norway", "no", "norsko",
  "greece", "gr", "řecko", "recko",
  "spain", "es", "španělsko", "spanelsko",
  "sweden", "se", "švédsko", "svedsko"
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseJsonString(value) {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function titleOf(job) {
  return clean(
    job?.job_title_cz || job?.title_cz || job?.jobTitleCz || job?.position_cz ||
    job?.job_title || job?.jobTitle || job?.title || job?.position || job?.role || job?.name
  );
}

function countryOf(job) {
  return clean(job?.country_code || job?.country).toLocaleLowerCase("cs-CZ");
}

function linkOf(job) {
  return clean(job?.link || job?.apply_url || job?.applyUrl || job?.url);
}

function cityOf(job) {
  const direct = clean(job?.city_cz || job?.city);
  if (direct) return direct;
  const location = clean(job?.location_cz || job?.location);
  return location ? location.split(",")[0].trim() : "";
}

function flattenText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.values(value).map(flattenText).filter(Boolean).join(" ");
  }
  return String(value);
}

function looksLikeJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  const title = titleOf(job);
  if (!title) return false;
  return Boolean(
    linkOf(job) || job.country || job.country_code || job.location || job.city ||
    job.description || job.requirements || job.salary || job.salary_czk_month
  );
}

function publishable(job) {
  return Boolean(
    looksLikeJob(job) &&
    linkOf(job) &&
    supportedCountries.has(countryOf(job))
  );
}

function collectJobs(input, options = {}, seen = new Set(), out = []) {
  const { skipReels = true } = options;
  if (input == null || out.length >= 200) return out;

  if (typeof input === "string") {
    const parsed = parseJsonString(input);
    if (parsed) collectJobs(parsed, options, seen, out);
    return out;
  }

  if (typeof input !== "object" || seen.has(input)) return out;
  seen.add(input);

  if (Array.isArray(input)) {
    for (const item of input) collectJobs(item, options, seen, out);
    return out;
  }

  if (looksLikeJob(input)) out.push(input);

  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.toLocaleLowerCase("en-US");
    if (skipReels && ["instagram", "ig", "reels"].includes(normalizedKey)) continue;
    collectJobs(value, options, seen, out);
  }
  return out;
}

function collectReels(input, seen = new Set()) {
  if (input == null) return [];
  if (typeof input === "string") {
    const parsed = parseJsonString(input);
    return parsed ? collectReels(parsed, seen) : [];
  }
  if (typeof input !== "object" || seen.has(input)) return [];
  seen.add(input);

  if (Array.isArray(input)) {
    const result = [];
    for (const item of input) result.push(...collectReels(item, seen));
    return result;
  }

  for (const key of ["reels", "instagram", "ig"]) {
    if (Array.isArray(input[key])) return input[key].slice(0, 2);
    if (typeof input[key] === "string") {
      const parsed = parseJsonString(input[key]);
      if (Array.isArray(parsed)) return parsed.slice(0, 2);
    }
  }

  for (const value of Object.values(input)) {
    const nested = collectReels(value, seen);
    if (nested.length) return nested.slice(0, 2);
  }
  return [];
}

function keyOf(job) {
  return clean(
    job?.postId || job?.id || linkOf(job) ||
    `${titleOf(job)}|${cityOf(job)}|${countryOf(job)}`
  ).toLocaleLowerCase("cs-CZ");
}

function dedupe(jobs, limit = 200) {
  const result = [];
  const seen = new Set();
  for (const job of jobs) {
    if (!job || typeof job !== "object") continue;
    const key = keyOf(job);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(job);
    if (result.length >= limit) break;
  }
  return result;
}

function score(job) {
  const text = clean([
    titleOf(job),
    flattenText(job?.description),
    flattenText(job?.requirements),
    flattenText(job?.category),
    flattenText(job?.job_category)
  ].join(" ")).toLocaleLowerCase("cs-CZ");

  let value = 0;

  if (/farm|farma|zeměděl|zemedel|agricultur|greenhouse|skleník|sklenik/.test(text)) value += 170;
  if (/sběr|sber|skliz|ovoce|zelenin|fruit|vegetable|berry|berries|jahod|jablk|hrozn|harvest|picker/.test(text)) value += 165;
  if (/úklid|uklid|cleaner|cleaning|housekeep|pokojsk|room attendant|myč|myc|dishwasher/.test(text)) value += 145;
  if (/gastro|kuch|restaurant|restaur|číš|cis|servír|servir|barista|kitchen|catering/.test(text)) value += 120;
  if (/hotel|resort|hostel/.test(text)) value += 80;
  if (/sklad|warehouse|logisti|balen|packing|packer/.test(text)) value += 45;
  if (/výrob|vyrob|production|factory/.test(text)) value += 35;

  if (/bez zkušen|bez zkusen|no experience|experience not required|entry.level|unskilled|bez vzděl|bez vzdel|no degree|no qualification|training provided|zaškol|zaskol/.test(text)) value += 100;

  if (/university|bachelor|master|degree|required education|vysoká škola|vysoka skola|maturit|vyučen|vyucen/.test(text)) value -= 150;
  if (/certificate|required certification|licen[cs]e|průkaz|prukaz|svářeč|svarec|forklift licence/.test(text)) value -= 130;
  if (/(?:[2-9]|[1-9][0-9])\+?\s*(?:years?|let)\s+(?:of\s+)?experience|minimum\s+(?:[2-9]|[1-9][0-9])\s*(?:years?|let)/.test(text)) value -= 110;

  return value;
}

function prioritize(jobs) {
  return jobs
    .map((job, index) => ({ job, index, score: score(job) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.job);
}

function cleanupRecent() {
  const now = Date.now();
  for (const [key, timestamp] of recent.entries()) {
    if (now - timestamp > RECENT_TTL_MS) recent.delete(key);
  }
}

function isRecent(job) {
  cleanupRecent();
  const key = keyOf(job);
  return Boolean(key && recent.has(key));
}

function markRecent(jobs) {
  cleanupRecent();
  const now = Date.now();
  for (const job of jobs) {
    const key = keyOf(job);
    if (key) recent.set(key, now);
  }
}

function normalizeLanguage(value) {
  const raw = clean(value);
  if (!raw) return "dle nabídky";
  return raw
    .replace(/\bEnglish\b/gi, "angličtina")
    .replace(/\bGerman\b/gi, "němčina")
    .replace(/\bDutch\b/gi, "nizozemština")
    .replace(/\bSpanish\b/gi, "španělština")
    .replace(/\bItalian\b/gi, "italština")
    .replace(/\bFrench\b/gi, "francouzština")
    .replace(/\bDanish\b/gi, "dánština")
    .replace(/\bSwedish\b/gi, "švédština")
    .replace(/\bNorwegian\b/gi, "norština")
    .replace(/\bFinnish\b/gi, "finština")
    .replace(/\bGreek\b/gi, "řečtina")
    .replace(/\bEstonian\b/gi, "estonština");
}

function normalizeHousing(value) {
  const raw = clean(value);
  if (!raw || /not specified|not provided|unknown|n\/?a/i.test(raw)) return "dle nabídky";
  if (/free|included|zdarma/i.test(raw)) return "Ubytování zdarma";
  if (/allowance|contribution|příspěvek/i.test(raw)) return "Příspěvek na ubytování";
  if (/provided|available|arranged|zajiště|poskyt/i.test(raw)) return "Ubytování zajištěno";
  return raw
    .replace(/accommodation/gi, "ubytování")
    .replace(/housing/gi, "ubytování")
    .replace(/provided/gi, "zajištěno")
    .replace(/available/gi, "k dispozici")
    .replace(/included/gi, "v ceně")
    .replace(/free/gi, "zdarma");
}

function prepareForPublish(job) {
  const language = normalizeLanguage(job?.language_cz || job?.languages_cz || job?.language || job?.languages);
  const housing = normalizeHousing(job?.housing_cz || job?.accommodation_cz || job?.housing || job?.accommodation);
  const city = cityOf(job);
  return {
    ...job,
    title: titleOf(job),
    city: city || job?.city,
    location: job?.location || city,
    language_cz: language,
    languages_cz: language,
    language,
    languages: language,
    housing_cz: housing,
    accommodation_cz: housing,
    housing,
    accommodation: housing
  };
}

function scheduleBatch(batch) {
  const jobs = batch.map(prepareForPublish);
  markRecent(jobs);
  const publishHeroHero = require("./publishHeroHero");

  publishChain = publishChain
    .then(async () => {
      console.log(`[HERO PATCH] publishing batch ${jobs.length}/${BATCH_SIZE}`);
      let done = 0;
      for (const job of jobs) {
        let success = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await publishHeroHero(job);
            done++;
            success = true;
            console.log(`[HERO PATCH] published ${done}/${BATCH_SIZE}: ${titleOf(job)}`);
            break;
          } catch (error) {
            console.error(`[HERO PATCH] ${titleOf(job)} attempt ${attempt}/3 failed: ${error.message}`);
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        if (!success) console.error(`[HERO PATCH] permanently failed: ${titleOf(job)}`);
      }
      console.log(`[HERO PATCH] batch finished ${done}/${BATCH_SIZE}`);
    })
    .catch(error => console.error(`[HERO PATCH] worker error: ${error.message}`));
}

function preprocessGenerateBody(body) {
  const candidates = prioritize(
    dedupe(collectJobs(body).filter(publishable))
  );

  if (!candidates.length) return body;

  const reels = collectReels(body).slice(0, 2);
  const jobs = candidates.slice(0, BATCH_SIZE);

  console.log(`[JOB PATCH] candidates=${candidates.length} selectedHeroHero=${jobs.length} suppliedReels=${reels.length}`);
  return { jobs, reels };
}

const originalPost = express.application.post;

express.application.post = function patchedPost(path, ...handlers) {
  if (path === "/generate") {
    const captureAndPrioritize = (req, res, next) => {
      try {
        req.body = preprocessGenerateBody(req.body);
      } catch (error) {
        console.error(`[JOB PATCH] preprocessing failed: ${error.message}`);
      }

      const originalJson = res.json.bind(res);
      res.json = body => {
        if (Array.isArray(body?.herohero)) {
          const current = prioritize(dedupe(body.herohero.filter(publishable))).slice(0, BATCH_SIZE);
          generatedCache = current;
          generatedAt = Date.now();
          generatedHistory = dedupe([...current, ...generatedHistory], 40).filter(job => !isRecent(job));
          console.log(`[JOB PATCH] generated HeroHero cache=${generatedCache.length} history=${generatedHistory.length}`);
        }
        return originalJson(body);
      };
      next();
    };

    return originalPost.call(this, path, captureAndPrioritize, ...handlers);
  }

  if (path === "/publishHeroHero") {
    const patchedPublish = async (req, res) => {
      const now = Date.now();
      if (pending.length && now - pendingAt > CACHE_TTL_MS) {
        pending = [];
        pendingAt = 0;
      }

      const incoming = prioritize(
        dedupe(collectJobs(req.body).filter(publishable)).filter(job => !isRecent(job))
      );
      const cacheFresh = generatedCache.length && now - generatedAt <= CACHE_TTL_MS;
      const cache = cacheFresh ? generatedCache.filter(job => !isRecent(job)) : [];
      const history = generatedHistory.filter(job => !isRecent(job));

      const pool = prioritize(dedupe([...pending, ...incoming, ...cache, ...history], 100));
      console.log(`[HERO PATCH] incoming=${incoming.length} pending=${pending.length} cache=${cache.length} history=${history.length} pool=${pool.length}`);

      if (pool.length < BATCH_SIZE) {
        pending = pool;
        pendingAt = now;
        return res.status(200).json({
          success: true,
          queued: true,
          pending: pending.length,
          needed: BATCH_SIZE - pending.length,
          message: `Čekám na ${BATCH_SIZE - pending.length} další HeroHero nabídky.`
        });
      }

      const batch = pool.slice(0, BATCH_SIZE);
      const batchKeys = new Set(batch.map(keyOf));
      pending = pool.filter(job => !batchKeys.has(keyOf(job)));
      pendingAt = pending.length ? now : 0;
      generatedCache = generatedCache.filter(job => !batchKeys.has(keyOf(job)));
      generatedHistory = generatedHistory.filter(job => !batchKeys.has(keyOf(job)));

      scheduleBatch(batch);

      return res.status(200).json({
        success: true,
        accepted: BATCH_SIZE,
        publishing: true,
        pending: pending.length,
        message: "Přijato 5/5 HeroHero nabídek. Publikují se postupně."
      });
    };

    return originalPost.call(this, path, patchedPublish);
  }

  return originalPost.call(this, path, ...handlers);
};

console.log("[RUNTIME PATCH] HeroHero 5-post queue + low-skill job priority active.");
