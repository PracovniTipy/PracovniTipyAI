"use strict";

// Runs before stablePipelinePatch.js. Its only job is to expose every real job
// already present anywhere in the Make/OpenAI payload instead of letting the
// downstream parser stop at the first small array.

const express = require("express");

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
let rolling = [];
let rollingAt = 0;

const COUNTRY_ALIASES = new Map([
  ["austria", "Austria"], ["at", "Austria"], ["rakousko", "Austria"], ["österreich", "Austria"], ["osterreich", "Austria"],
  ["belgium", "Belgium"], ["be", "Belgium"], ["belgie", "Belgium"], ["belgië", "Belgium"], ["belgique", "Belgium"],
  ["denmark", "Denmark"], ["dk", "Denmark"], ["dánsko", "Denmark"], ["dansko", "Denmark"], ["danmark", "Denmark"],
  ["estonia", "Estonia"], ["ee", "Estonia"], ["estonsko", "Estonia"], ["eesti", "Estonia"],
  ["finland", "Finland"], ["fi", "Finland"], ["finsko", "Finland"], ["suomi", "Finland"],
  ["france", "France"], ["fr", "France"], ["francie", "France"],
  ["netherlands", "Netherlands"], ["nl", "Netherlands"], ["holland", "Netherlands"], ["holandsko", "Netherlands"], ["nizozemsko", "Netherlands"], ["nizozemí", "Netherlands"], ["nederland", "Netherlands"],
  ["ireland", "Ireland"], ["ie", "Ireland"], ["irsko", "Ireland"], ["éire", "Ireland"],
  ["italy", "Italy"], ["it", "Italy"], ["itálie", "Italy"], ["italie", "Italy"], ["italia", "Italy"],
  ["cyprus", "Cyprus"], ["cy", "Cyprus"], ["kypr", "Cyprus"],
  ["malta", "Malta"], ["mt", "Malta"],
  ["germany", "Germany"], ["de", "Germany"], ["německo", "Germany"], ["nemecko", "Germany"], ["deutschland", "Germany"],
  ["norway", "Norway"], ["no", "Norway"], ["norsko", "Norway"], ["norge", "Norway"],
  ["greece", "Greece"], ["gr", "Greece"], ["řecko", "Greece"], ["recko", "Greece"], ["hellas", "Greece"],
  ["spain", "Spain"], ["es", "Spain"], ["španělsko", "Spain"], ["spanelsko", "Spain"], ["españa", "Spain"], ["espana", "Spain"],
  ["sweden", "Sweden"], ["se", "Sweden"], ["švédsko", "Sweden"], ["svedsko", "Sweden"], ["sverige", "Sweden"]
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function titleOf(job) {
  return clean(
    job?.job_title_cz || job?.title_cz || job?.jobTitleCz || job?.position_cz ||
    job?.job_title || job?.jobTitle || job?.title || job?.position || job?.role ||
    job?.name || job?.position_name || job?.positionName || job?.jobName
  );
}

function linkOf(job) {
  return clean(
    job?.link || job?.apply_url || job?.applyUrl || job?.url || job?.job_url || job?.jobUrl ||
    job?.job_link || job?.jobLink || job?.application_url || job?.applicationUrl ||
    job?.offer_url || job?.offerUrl || job?.details_url || job?.detailsUrl ||
    job?.external_url || job?.externalUrl || job?.direct_link || job?.directLink ||
    job?.source_url || job?.sourceUrl || job?.job_posting_url || job?.jobPostingUrl
  );
}

function countryOf(job) {
  const directValues = [
    job?.country_code, job?.countryCode, job?.country_cz, job?.country,
    job?.country_name, job?.countryName, job?.location_country, job?.locationCountry
  ];
  for (const value of directValues) {
    const key = clean(value).toLocaleLowerCase("cs-CZ");
    if (COUNTRY_ALIASES.has(key)) return COUNTRY_ALIASES.get(key);
  }

  const haystack = clean([
    job?.location_cz, job?.location, job?.address, job?.city,
    job?.company_location, job?.work_location, job?.workLocation
  ].filter(Boolean).join(" ")).toLocaleLowerCase("cs-CZ");

  for (const [alias, canonical] of COUNTRY_ALIASES.entries()) {
    if (alias.length > 2 && haystack.includes(alias)) return canonical;
  }
  return "";
}

function normalizeCountry(job) {
  const country = countryOf(job);
  if (!country) return job;
  return {
    ...job,
    country,
    country_code: country
  };
}

function parseJson(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch (_) { return null; }
}

function collect(value, out = [], seen = new Set()) {
  if (value == null || out.length >= 500) return out;

  if (typeof value === "string") {
    const parsed = parseJson(value);
    if (parsed) collect(parsed, out, seen);
    return out;
  }

  if (typeof value !== "object" || seen.has(value)) return out;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collect(item, out, seen);
    return out;
  }

  if (titleOf(value)) out.push(normalizeCountry(value));
  for (const child of Object.values(value)) collect(child, out, seen);
  return out;
}

function keyOf(job) {
  return clean(
    job?.postId || job?.id || linkOf(job) ||
    `${titleOf(job)}|${clean(job?.location || job?.city)}|${countryOf(job)}`
  ).toLocaleLowerCase("cs-CZ");
}

function dedupe(items) {
  const seen = new Set();
  const result = [];
  for (const job of items || []) {
    if (!job || typeof job !== "object" || !titleOf(job)) continue;
    const key = keyOf(job);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(job);
  }
  return result;
}

function refreshRolling(items) {
  const now = Date.now();
  if (!rollingAt || now - rollingAt > CACHE_TTL_MS) rolling = [];
  rollingAt = now;
  rolling = dedupe([...items, ...rolling]).slice(0, 200);
}

const previousPost = express.application.post;

express.application.post = function collectAllCandidatesPost(path, ...handlers) {
  if (path !== "/generate") return previousPost.call(this, path, ...handlers);

  const collectBeforeStable = (req, res, next) => {
    try {
      const current = dedupe(collect(req.body));
      refreshRolling(current);

      // Give stablePipelinePatch every candidate found anywhere in the payload,
      // across all 16 supported countries. It remains responsible for the hard
      // rules: AJ/CZ only and no assembly/montáž roles.
      if (rolling.length) {
        req.body = {
          jobs: rolling,
          reels: rolling.slice(0, 2)
        };
      }

      const byCountry = {};
      for (const job of rolling) {
        const country = countryOf(job) || "unknown";
        byCountry[country] = (byCountry[country] || 0) + 1;
      }
      console.log(`[ALL CANDIDATES] current=${current.length} rolling=${rolling.length} countries=${JSON.stringify(byCountry)}`);
    } catch (error) {
      console.error(`[ALL CANDIDATES] ${error.message}`);
    }
    next();
  };

  return previousPost.call(this, path, collectBeforeStable, ...handlers);
};

console.log("[ALL CANDIDATES] Full nested payload collector for all 16 countries active.");
