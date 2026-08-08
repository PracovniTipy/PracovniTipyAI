"use strict";

// Runtime guard/normalizer for Make -> Render.
// - collects up to 5 HeroHero jobs from one or several bundles
// - guarantees 2 IG candidates when at least 2 usable jobs exist
// - permanently blocks assembly / "montážní dělník" offers
// - prioritizes farm, harvest, cleaning and gastro low-skill roles

const express = require("express");

const HERO_BATCH = 5;
const IG_BATCH = 2;
const CACHE_TTL_MS = 45 * 60 * 1000;
const RECENT_TTL_MS = 6 * 60 * 60 * 1000;

let candidateCache = [];
let generatedCache = [];
let generatedAt = 0;
let pendingHero = [];
let pendingAt = 0;
let publishChain = Promise.resolve();
const recent = new Map();

const COUNTRY_ALIASES = new Map([
  ["austria", "austria"], ["at", "austria"], ["rakousko", "austria"],
  ["belgium", "belgium"], ["be", "belgium"], ["belgie", "belgium"],
  ["denmark", "denmark"], ["dk", "denmark"], ["dánsko", "denmark"], ["dansko", "denmark"],
  ["estonia", "estonia"], ["ee", "estonia"], ["estonsko", "estonia"],
  ["finland", "finland"], ["fi", "finland"], ["finsko", "finland"],
  ["france", "france"], ["fr", "france"], ["francie", "france"],
  ["netherlands", "netherlands"], ["nl", "netherlands"], ["holland", "netherlands"], ["holandsko", "netherlands"], ["nizozemsko", "netherlands"], ["nizozemí", "netherlands"],
  ["ireland", "ireland"], ["ie", "ireland"], ["irsko", "ireland"],
  ["italy", "italy"], ["it", "italy"], ["itálie", "italy"], ["italie", "italy"],
  ["cyprus", "cyprus"], ["cy", "cyprus"], ["kypr", "cyprus"],
  ["malta", "malta"], ["mt", "malta"],
  ["germany", "germany"], ["de", "germany"], ["německo", "germany"], ["nemecko", "germany"],
  ["norway", "norway"], ["no", "norway"], ["norsko", "norway"],
  ["greece", "greece"], ["gr", "greece"], ["řecko", "greece"], ["recko", "greece"],
  ["spain", "spain"], ["es", "spain"], ["španělsko", "spain"], ["spanelsko", "spain"],
  ["sweden", "sweden"], ["se", "sweden"], ["švédsko", "sweden"], ["svedsko", "sweden"]
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseJsonString(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function flattenText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value).map(flattenText).filter(Boolean).join(" ");
  return String(value);
}

function titleOf(job) {
  return clean(
    job?.job_title_cz || job?.title_cz || job?.jobTitleCz || job?.position_cz ||
    job?.job_title || job?.jobTitle || job?.title || job?.position || job?.role ||
    job?.name || job?.position_name || job?.jobName
  );
}

function linkOf(job) {
  return clean(
    job?.link || job?.apply_url || job?.applyUrl || job?.url || job?.job_url ||
    job?.jobUrl || job?.job_link || job?.jobLink || job?.application_url ||
    job?.applicationUrl || job?.offer_url || job?.offerUrl || job?.details_url ||
    job?.detailsUrl || job?.external_url || job?.externalUrl || job?.direct_link ||
    job?.directLink
  );
}

function countryValue(job) {
  return clean(
    job?.country_code || job?.countryCode || job?.country || job?.country_name ||
    job?.countryName || job?.location_country || job?.locationCountry
  ).toLocaleLowerCase("cs-CZ");
}

function countryOf(job) {
  const direct = countryValue(job);
  if (COUNTRY_ALIASES.has(direct)) return COUNTRY_ALIASES.get(direct);

  const haystack = clean([job?.location, job?.location_cz, job?.address].filter(Boolean).join(" "))
    .toLocaleLowerCase("cs-CZ");
  for (const [alias, canonical] of COUNTRY_ALIASES.entries()) {
    if (alias.length > 2 && haystack.includes(alias)) return canonical;
  }
  return "";
}

function cityOf(job) {
  const direct = clean(job?.city_cz || job?.city || job?.location_city || job?.locationCity);
  if (direct) return direct;
  const location = clean(job?.location_cz || job?.location);
  return location ? location.split(",")[0].trim() : "";
}

function looksLikeJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  if (!titleOf(job)) return false;
  return Boolean(
    linkOf(job) || countryOf(job) || job.location || job.city || job.description ||
    job.requirements || job.salary || job.salary_czk_month || job.housing || job.accommodation
  );
}

function isForbiddenJob(job) {
  const text = clean([
    titleOf(job),
    flattenText(job?.description),
    flattenText(job?.requirements),
    flattenText(job?.category),
    flattenText(job?.job_category)
  ].join(" ")).toLocaleLowerCase("cs-CZ");

  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(text);
}

function publishable(job) {
  return Boolean(
    looksLikeJob(job) &&
    !isForbiddenJob(job) &&
    linkOf(job) &&
    countryOf(job)
  );
}

function collectJobs(input, { skipReels = true } = {}, seen = new Set(), out = []) {
  if (input == null || out.length >= 300) return out;

  if (typeof input === "string") {
    const parsed = parseJsonString(input);
    if (parsed) collectJobs(parsed, { skipReels }, seen, out);
    return out;
  }

  if (typeof input !== "object" || seen.has(input)) return out;
  seen.add(input);

  if (Array.isArray(input)) {
    for (const item of input) collectJobs(item, { skipReels }, seen, out);
    return out;
  }

  if (looksLikeJob(input)) out.push(input);

  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.toLocaleLowerCase("en-US");
    if (skipReels && ["instagram", "ig", "reels"].includes(normalizedKey)) continue;
    collectJobs(value, { skipReels }, seen, out);
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
    return result.filter(job => !isForbiddenJob(job)).slice(0, IG_BATCH);
  }

  for (const key of ["reels", "instagram", "ig"]) {
    const value = input[key];
    if (Array.isArray(value)) return value.filter(job => !isForbiddenJob(job)).slice(0, IG_BATCH);
    if (typeof value === "string") {
      const parsed = parseJsonString(value);
      if (Array.isArray(parsed)) return parsed.filter(job => !isForbiddenJob(job)).slice(0, IG_BATCH);
    }
  }

  for (const value of Object.values(input)) {
    const nested = collectReels(value, seen);
    if (nested.length) return nested.slice(0, IG_BATCH);
  }
  return [];
}

function keyOf(job) {
  return clean(
    job?.postId || job?.id || linkOf(job) || `${titleOf(job)}|${cityOf(job)}|${countryOf(job)}`
  ).toLocaleLowerCase("cs-CZ");
}

function dedupe(jobs, limit = 300) {
  const result = [];
  const seen = new Set();
  for (const job of jobs) {
    if (!job || typeof job !== "object" || isForbiddenJob(job)) continue;
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
    titleOf(job), flattenText(job?.description), flattenText(job?.requirements),
    flattenText(job?.category), flattenText(job?.job_category)
  ].join(" ")).toLocaleLowerCase("cs-CZ");

  let value = 0;
  if (/farm|farma|zeměděl|zemedel|agricultur|greenhouse|skleník|sklenik/.test(text)) value += 220;
  if (/sběr|sber|skliz|ovoce|zelenin|fruit|vegetable|berry|berries|jahod|jablk|hrozn|harvest|picker/.test(text)) value += 210;
  if (/úklid|uklid|cleaner|cleaning|housekeep|pokojsk|room attendant|myč|myc|dishwasher/.test(text)) value += 180;
  if (/gastro|kuch|restaurant|restaur|číš|cis|servír|servir|barista|kitchen|catering/.test(text)) value += 150;
  if (/hotel|resort|hostel/.test(text)) value += 90;
  if (/sklad|warehouse|logisti|balen|packing|packer/.test(text)) value += 50;
  if (/výrob|vyrob|production|factory/.test(text)) value += 30;

  if (/bez zkušen|bez zkusen|no experience|experience not required|entry.level|unskilled|bez vzděl|bez vzdel|no degree|no qualification|training provided|zaškol|zaskol/.test(text)) value += 140;
  if (/university|bachelor|master|degree|required education|vysoká škola|vysoka skola|maturit|vyučen|vyucen/.test(text)) value -= 220;
  if (/certificate|required certification|licen[cs]e|průkaz|prukaz|svářeč|svarec|forklift licence/.test(text)) value -= 180;
  if (/(?:[2-9]|[1-9][0-9])\+?\s*(?:years?|let)\s+(?:of\s+)?experience|minimum\s+(?:[2-9]|[1-9][0-9])\s*(?:years?|let)/.test(text)) value -= 160;
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

function markRecent(job) {
  const key = keyOf(job);
  if (key) recent.set(key, Date.now());
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

function prepare(job) {
  const language = normalizeLanguage(job?.language_cz || job?.languages_cz || job?.language || job?.languages);
  const housing = normalizeHousing(job?.housing_cz || job?.accommodation_cz || job?.housing || job?.accommodation);
  const city = cityOf(job);
  return {
    ...job,
    title: titleOf(job),
    link: linkOf(job),
    country: job?.country || job?.country_name || countryOf(job),
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

function preprocessGenerateBody(body) {
  const current = prioritize(dedupe(collectJobs(body).filter(publishable)));
  const old = candidateCache.filter(job => !isRecent(job));
  candidateCache = prioritize(dedupe([...current, ...old], 100));

  const jobs = candidateCache.slice(0, HERO_BATCH);
  const suppliedReels = collectReels(body).filter(job => !isForbiddenJob(job)).slice(0, IG_BATCH);
  const reels = dedupe([...suppliedReels, ...jobs], IG_BATCH).slice(0, IG_BATCH);

  console.log(`[JOB PATCH] current=${current.length} cache=${candidateCache.length} hero=${jobs.length} reels=${reels.length}`);
  return { jobs, reels };
}

function scheduleBatch(batch) {
  const jobs = batch.map(prepare);
  const publishHeroHero = require("./publishHeroHero");

  publishChain = publishChain
    .then(async () => {
      console.log(`[HERO PATCH] publishing ${jobs.length}/${HERO_BATCH}`);
      let done = 0;
      for (const job of jobs) {
        let success = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await publishHeroHero(job);
            markRecent(job);
            done++;
            success = true;
            console.log(`[HERO PATCH] published ${done}/${HERO_BATCH}: ${titleOf(job)}`);
            break;
          } catch (error) {
            console.error(`[HERO PATCH] ${titleOf(job)} attempt ${attempt}/3 failed: ${error.message}`);
            if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
        if (!success) console.error(`[HERO PATCH] permanently failed: ${titleOf(job)}`);
      }
      console.log(`[HERO PATCH] batch finished ${done}/${HERO_BATCH}`);
    })
    .catch(error => console.error(`[HERO PATCH] worker error: ${error.message}`));
}

const originalPost = express.application.post;

express.application.post = function patchedPost(path, ...handlers) {
  if (path === "/generate") {
    const beforeGenerate = (req, res, next) => {
      try {
        req.body = preprocessGenerateBody(req.body);
      } catch (error) {
        console.error(`[JOB PATCH] preprocess failed: ${error.message}`);
      }

      const originalJson = res.json.bind(res);
      res.json = body => {
        if (Array.isArray(body?.herohero)) {
          const generated = prioritize(
            dedupe(body.herohero.filter(job => publishable(job) && !isForbiddenJob(job)))
          );
          generatedCache = generated.slice(0, HERO_BATCH);
          generatedAt = Date.now();

          const generatedKeys = new Set(generatedCache.map(keyOf));
          candidateCache = candidateCache.filter(job => !generatedKeys.has(keyOf(job)));

          body.herohero = body.herohero.filter(job => !isForbiddenJob(job)).slice(0, HERO_BATCH);
          if (Array.isArray(body.instagram)) {
            body.instagram = body.instagram.filter(job => !isForbiddenJob(job)).slice(0, IG_BATCH);
          }

          console.log(`[JOB PATCH] output hero=${body.herohero.length} ig=${Array.isArray(body.instagram) ? body.instagram.length : 0} generatedCache=${generatedCache.length}`);
        }
        return originalJson(body);
      };
      next();
    };

    return originalPost.call(this, path, beforeGenerate, ...handlers);
  }

  if (path === "/publishHeroHero") {
    const patchedPublish = async (req, res) => {
      const now = Date.now();
      if (pendingHero.length && now - pendingAt > CACHE_TTL_MS) {
        pendingHero = [];
        pendingAt = 0;
      }

      const incoming = prioritize(dedupe(collectJobs(req.body).filter(publishable)));
      const cacheFresh = generatedCache.length && now - generatedAt <= CACHE_TTL_MS;
      const generated = cacheFresh ? generatedCache : [];

      const pool = prioritize(
        dedupe([...pendingHero, ...incoming, ...generated], 100)
      ).filter(job => !isRecent(job));

      console.log(`[HERO PATCH] incoming=${incoming.length} pending=${pendingHero.length} generated=${generated.length} pool=${pool.length}`);

      if (pool.length < HERO_BATCH) {
        pendingHero = pool;
        pendingAt = now;
        return res.status(200).json({
          success: true,
          queued: true,
          pending: pool.length,
          needed: HERO_BATCH - pool.length,
          message: `HeroHero čeká na ${HERO_BATCH - pool.length} další nabídky; nic se neztratilo.`
        });
      }

      const batch = pool.slice(0, HERO_BATCH);
      const batchKeys = new Set(batch.map(keyOf));
      pendingHero = pool.filter(job => !batchKeys.has(keyOf(job)));
      pendingAt = pendingHero.length ? now : 0;
      generatedCache = generatedCache.filter(job => !batchKeys.has(keyOf(job)));

      scheduleBatch(batch);

      return res.status(200).json({
        success: true,
        accepted: HERO_BATCH,
        publishing: true,
        pending: pendingHero.length,
        message: "Přijato 5/5 HeroHero nabídek. Publikují se postupně."
      });
    };

    return originalPost.call(this, path, patchedPublish);
  }

  return originalPost.call(this, path, ...handlers);
};

console.log("[RUNTIME PATCH] v2: 5 HeroHero + 2 IG + assembly-worker ban active.");