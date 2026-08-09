"use strict";

// Runs before stablePipelinePatch.js. It exposes real jobs found anywhere in
// the Make/OpenAI payload, keeps a short rolling pool and deliberately feeds
// the downstream selector candidates from as many supported countries as
// possible. It never invents jobs or countries.

const express = require("express");

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_POOL = 15;
let rolling = [];
let rollingAt = 0;

const SUPPORTED_COUNTRIES = [
  "Austria", "Belgium", "Cyprus", "Denmark", "Estonia", "Finland", "France",
  "Germany", "Greece", "Ireland", "Italy", "Malta", "Netherlands", "Norway",
  "Spain", "Sweden"
];

const COUNTRY_ALIASES = new Map([
  ["austria", "Austria"], ["at", "Austria"], ["rakousko", "Austria"], ["österreich", "Austria"], ["osterreich", "Austria"],
  ["belgium", "Belgium"], ["be", "Belgium"], ["belgie", "Belgium"], ["belgië", "Belgium"], ["belgique", "Belgium"],
  ["cyprus", "Cyprus"], ["cy", "Cyprus"], ["kypr", "Cyprus"],
  ["denmark", "Denmark"], ["dk", "Denmark"], ["dánsko", "Denmark"], ["dansko", "Denmark"], ["danmark", "Denmark"],
  ["estonia", "Estonia"], ["ee", "Estonia"], ["estonsko", "Estonia"], ["eesti", "Estonia"],
  ["finland", "Finland"], ["fi", "Finland"], ["finsko", "Finland"], ["suomi", "Finland"],
  ["france", "France"], ["fr", "France"], ["francie", "France"],
  ["germany", "Germany"], ["de", "Germany"], ["německo", "Germany"], ["nemecko", "Germany"], ["deutschland", "Germany"],
  ["greece", "Greece"], ["gr", "Greece"], ["řecko", "Greece"], ["recko", "Greece"], ["hellas", "Greece"],
  ["ireland", "Ireland"], ["ie", "Ireland"], ["irsko", "Ireland"], ["éire", "Ireland"],
  ["italy", "Italy"], ["it", "Italy"], ["itálie", "Italy"], ["italie", "Italy"], ["italia", "Italy"],
  ["malta", "Malta"], ["mt", "Malta"],
  ["netherlands", "Netherlands"], ["nl", "Netherlands"], ["holland", "Netherlands"], ["holandsko", "Netherlands"], ["nizozemsko", "Netherlands"], ["nizozemí", "Netherlands"], ["nederland", "Netherlands"],
  ["norway", "Norway"], ["no", "Norway"], ["norsko", "Norway"], ["norge", "Norway"],
  ["spain", "Spain"], ["es", "Spain"], ["španělsko", "Spain"], ["spanelsko", "Spain"], ["españa", "Spain"], ["espana", "Spain"],
  ["sweden", "Sweden"], ["se", "Sweden"], ["švédsko", "Sweden"], ["svedsko", "Sweden"], ["sverige", "Sweden"]
]);

const ENGLISH = /(?:\benglish\b|angličtin|anglictin|anglick|\baj\b)/iu;
const CZECH = /(?:\bczech\b|češtin|cestin|česk(?:y|ý|á|a)|\bcz\b)/iu;
const FORBIDDEN = /(?:\bdutch\b|nizozemštin|nizozemstin|holandštin|holandstin|\bgerman\b|němčin|nemcin|\bfrench\b|francouzštin|francouzstin|\bspanish\b|španělštin|spanelstin|\bitalian\b|italštin|italstin|\bdanish\b|dánštin|danstin|\bswedish\b|švédštin|svedstin|\bnorwegian\b|norštin|norstin|\bfinnish\b|finštin|finstin|\bgreek\b|řečtin|rectin|\bestonian\b|estonštin|estonstin|\bpolish\b|polštin|polstin|\bslovak\b|slovenštin|slovenstin|\bportuguese\b|portugalštin|portugalstin|local language|místní jazyk|mistni jazyk)/iu;
const LEVEL_ONLY = /^(?:(?:cefr\s*)?[abc][12](?:\s*[-–/]\s*[abc][12])?|basic|intermediate|advanced|fluent|good|very good|communicative|communication level)$/iu;
const FORBIDDEN_JOB = /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|montáž\w*\s+(?:výrob|stroj|součást|soucast|auto)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/iu;

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

function stripNegatedLanguages(text) {
  return clean(text)
    .replace(/(?:no|not|without)\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese)(?:\s+(?:required|needed|necessary))?/giu, " ")
    .replace(/(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese)\s+(?:is\s+)?not\s+(?:required|needed|necessary)/giu, " ")
    .replace(/(?:bez|není\s+nutná|neni\s+nutna|není\s+vyžadována|neni\s+vyzadovana)\s+(?:nizozemštiny|holandštiny|němčiny|nemciny|francouzštiny|francouzstiny|španělštiny|spanelstiny|italštiny|italstiny|dánštiny|danstiny|švédštiny|svedstiny|norštiny|norstiny|finštiny|finstiny|řečtiny|rectiny|estonštiny|estonstiny|polštiny|polstiny|slovenštiny|slovenstiny)/giu, " ");
}

function languageEvidence(job) {
  const direct = clean(flatten([
    job?.language_cz, job?.languages_cz, job?.language, job?.languages,
    job?.required_language, job?.required_languages, job?.language_requirement,
    job?.language_requirements, job?.requiredLanguage, job?.requiredLanguages,
    job?.jazyk, job?.jazyky
  ]));
  const context = clean(flatten([
    job?.requirements, job?.description, job?.text, job?.textHtml,
    job?.qualifications, job?.skills
  ]));
  return { direct, context, checkedDirect: stripNegatedLanguages(direct), checkedContext: stripNegatedLanguages(context) };
}

function normalizeLanguageEvidence(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return job;
  const { direct, checkedDirect, checkedContext } = languageEvidence(job);
  const directAlreadyClear = ENGLISH.test(checkedDirect) || CZECH.test(checkedDirect) || FORBIDDEN.test(checkedDirect);
  if (directAlreadyClear) return job;

  const incompleteDirect = !direct || LEVEL_ONLY.test(direct) || /^[abc][12]\b/i.test(direct);
  if (!incompleteDirect || FORBIDDEN.test(checkedContext)) return job;

  const en = ENGLISH.test(checkedContext);
  const cz = CZECH.test(checkedContext);
  if (!en && !cz) return job;

  const normalized = en && cz ? "angličtina / čeština" : en ? "angličtina" : "čeština";
  return {
    ...job,
    language_cz: normalized,
    languages_cz: normalized,
    language: normalized,
    languages: normalized
  };
}

function languageAllowed(job) {
  const normalized = normalizeLanguageEvidence(job);
  const { checkedDirect, checkedContext } = languageEvidence(normalized);
  const combined = clean(`${checkedDirect} ${checkedContext}`);
  if (!combined) return false;
  if (FORBIDDEN.test(combined)) return false;
  return ENGLISH.test(combined) || CZECH.test(combined);
}

function jobText(job) {
  return clean([
    titleOf(job), flatten(job?.description), flatten(job?.requirements),
    flatten(job?.category), flatten(job?.job_category), flatten(job?.work_category)
  ].join(" ")).toLocaleLowerCase("cs-CZ");
}

function normalizeCountry(job) {
  const country = countryOf(job);
  const withCountry = country ? { ...job, country, country_code: country } : job;
  return normalizeLanguageEvidence(withCountry);
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

function diverseEligiblePool(items) {
  const eligible = dedupe(items)
    .map(normalizeCountry)
    .filter(job => SUPPORTED_COUNTRIES.includes(countryOf(job)))
    .filter(job => !FORBIDDEN_JOB.test(jobText(job)))
    .filter(languageAllowed);

  const groups = new Map();
  for (const country of SUPPORTED_COUNTRIES) groups.set(country, []);
  for (const job of eligible) groups.get(countryOf(job))?.push(job);

  // First pass: exactly one candidate from every country that is actually
  // present. This prevents five high-scoring Netherlands jobs from crowding
  // out valid offers from the other supported countries downstream.
  const firstPass = [];
  for (const country of SUPPORTED_COUNTRIES) {
    const group = groups.get(country) || [];
    const withDirectLink = group.find(job => linkOf(job));
    const candidate = withDirectLink || group[0];
    if (candidate) firstPass.push(candidate);
  }

  // If at least five different countries are available, do NOT add duplicate
  // countries. StablePipeline may reorder by job priority, but every candidate
  // it receives still belongs to a different country.
  if (firstPass.length >= 5) return firstPass.slice(0, MAX_POOL);

  // Fewer than five countries are genuinely available. Keep the distinct
  // countries first and only then add additional real jobs to reach a useful
  // fallback pool. No job or country is invented.
  const selected = [...firstPass];
  const used = new Set(selected.map(keyOf));
  for (const job of eligible) {
    if (selected.length >= MAX_POOL) break;
    const key = keyOf(job);
    if (used.has(key)) continue;
    used.add(key);
    selected.push(job);
  }
  return selected;
}

const previousPost = express.application.post;

express.application.post = function collectAllCandidatesPost(path, ...handlers) {
  if (path !== "/generate") return previousPost.call(this, path, ...handlers);

  const collectBeforeStable = (req, res, next) => {
    try {
      const current = dedupe(collect(req.body));
      refreshRolling(current);
      const pool = diverseEligiblePool(rolling);

      if (pool.length) {
        req.body = {
          jobs: pool,
          reels: pool.slice(0, 2)
        };
      }

      const byCountry = {};
      for (const job of rolling) {
        const country = countryOf(job) || "unknown";
        byCountry[country] = (byCountry[country] || 0) + 1;
      }
      const poolCountries = [...new Set(pool.map(countryOf).filter(Boolean))];
      console.log(`[ALL CANDIDATES] current=${current.length} rolling=${rolling.length} pool=${pool.length} poolCountries=${JSON.stringify(poolCountries)} allCountries=${JSON.stringify(byCountry)}`);
    } catch (error) {
      console.error(`[ALL CANDIDATES] ${error.message}`);
    }
    next();
  };

  return previousPost.call(this, path, collectBeforeStable, ...handlers);
};

console.log("[ALL CANDIDATES] Diverse all-16-country collector + AJ/CZ filtering active.");