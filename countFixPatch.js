"use strict";

// Runs after runtimePatch. Make can send one job per bundle, so this layer keeps
// a short rolling pool and feeds index.js up to 5 real HeroHero jobs and 2 real
// Instagram candidates instead of losing the previous bundles.

const express = require("express");

const HERO_COUNT = 5;
const IG_COUNT = 2;
const WINDOW_MS = 30 * 60 * 1000;

let rollingJobs = [];
let rollingStartedAt = 0;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

function cityOf(job) {
  const direct = clean(job?.city_cz || job?.city || job?.location_city || job?.locationCity);
  if (direct) return direct;
  const location = clean(job?.location_cz || job?.location);
  return location ? location.split(",")[0].trim() : "";
}

function countryOf(job) {
  return clean(job?.country_code || job?.countryCode || job?.country || job?.country_name || job?.countryName);
}

function flatten(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value).map(flatten).filter(Boolean).join(" ");
  return String(value);
}

function isForbidden(job) {
  const text = clean([
    titleOf(job), flatten(job?.description), flatten(job?.requirements),
    flatten(job?.category), flatten(job?.job_category)
  ].join(" ")).toLocaleLowerCase("cs-CZ");

  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(text);
}

function looksLikeJob(job) {
  return Boolean(job && typeof job === "object" && !Array.isArray(job) && titleOf(job) && !isForbidden(job));
}

function keyOf(job) {
  return clean(
    job?.postId || job?.id || linkOf(job) ||
    `${titleOf(job)}|${cityOf(job)}|${countryOf(job)}`
  ).toLocaleLowerCase("cs-CZ");
}

function dedupe(items, limit = 100) {
  const result = [];
  const seen = new Set();
  for (const item of items || []) {
    if (!looksLikeJob(item)) continue;
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function priority(job) {
  const text = clean([
    titleOf(job), flatten(job?.description), flatten(job?.requirements),
    flatten(job?.category), flatten(job?.job_category)
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
  return value;
}

function prioritize(items) {
  return dedupe(items)
    .map((job, index) => ({ job, index, priority: priority(job) }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map(item => item.job);
}

function resetWindowIfNeeded() {
  const now = Date.now();
  if (!rollingStartedAt || now - rollingStartedAt > WINDOW_MS) {
    rollingJobs = [];
    rollingStartedAt = now;
  }
}

function collectCurrent(body) {
  const jobs = Array.isArray(body?.jobs) ? body.jobs : [];
  const reels = Array.isArray(body?.reels) ? body.reels : [];
  return dedupe([...jobs, ...reels]);
}

const previousPost = express.application.post;

express.application.post = function countFixPost(path, ...handlers) {
  if (path === "/generate") {
    const accumulate = (req, res, next) => {
      resetWindowIfNeeded();

      const current = collectCurrent(req.body);
      rollingJobs = prioritize([...current, ...rollingJobs]).slice(0, 50);

      const heroJobs = rollingJobs.filter(job => linkOf(job)).slice(0, HERO_COUNT);
      const igJobs = rollingJobs.slice(0, IG_COUNT);

      // Never fabricate job offers. The pool grows as Make sends its bundles.
      req.body = {
        jobs: heroJobs,
        reels: igJobs
      };

      console.log(`[COUNT FIX] rolling=${rollingJobs.length} hero=${heroJobs.length}/${HERO_COUNT} ig=${igJobs.length}/${IG_COUNT}`);

      const previousJson = res.json.bind(res);
      res.json = body => {
        if (body && typeof body === "object") {
          if (Array.isArray(body.herohero)) body.herohero = body.herohero.slice(0, HERO_COUNT);
          if (Array.isArray(body.instagram)) body.instagram = body.instagram.slice(0, IG_COUNT);
        }
        return previousJson(body);
      };

      next();
    };

    return previousPost.call(this, path, accumulate, ...handlers);
  }

  return previousPost.call(this, path, ...handlers);
};

console.log("[COUNT FIX] rolling 5 HeroHero / 2 Instagram bundle accumulator active.");