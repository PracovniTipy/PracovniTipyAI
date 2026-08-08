"use strict";

// Final language gate for both HeroHero and Instagram.
// IMPORTANT: /generate input is not mutated anymore. The previous version
// removed Make/OpenAI payloads before index.js could parse them and caused:
// "Musí být předáno jobs nebo reels".

const express = require("express");
const Module = require("module");

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

function languageText(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return "";

  const direct = [
    job.language_cz,
    job.languages_cz,
    job.language,
    job.languages,
    job.required_language,
    job.required_languages,
    job.language_requirement,
    job.language_requirements,
    job.requiredLanguage,
    job.requiredLanguages,
    job.jazyk,
    job.jazyky,
    job.pozadovany_jazyk,
    job.požadovaný_jazyk
  ].map(flatten).filter(Boolean);

  // Make/OpenAI can rename mapped fields. Accept any key that clearly means
  // language instead of deleting the entire job because one exact alias changed.
  for (const [key, value] of Object.entries(job)) {
    const normalizedKey = key
      .toLocaleLowerCase("cs-CZ")
      .replace(/[\s_-]+/g, "");
    if (/(?:language|languages|requiredlanguage|languagerequirement|jazyk|jazyky|pozadovanyjazyk|požadovanýjazyk)/u.test(normalizedKey)) {
      direct.push(flatten(value));
    }
  }

  return clean(direct.filter(Boolean).join(" "));
}

const ALLOWED_LANGUAGE = /(?:\benglish\b|angličtin|anglictin|anglick|\baj\b|\bczech\b|češtin|cestin|česk(?:y|ý|á|a)|\bcz\b)/iu;

const FORBIDDEN_LANGUAGE = /(?:\bdutch\b|nizozemštin|nizozemstin|holandštin|holandstin|\bgerman\b|němčin|nemcin|\bfrench\b|francouzštin|francouzstin|\bspanish\b|španělštin|spanelstin|\bitalian\b|italštin|italstin|\bdanish\b|dánštin|danstin|\bswedish\b|švédštin|svedstin|\bnorwegian\b|norštin|norstin|\bfinnish\b|finštin|finstin|\bgreek\b|řečtin|rectin|\bestonian\b|estonštin|estonstin|\bpolish\b|polštin|polstin|\bslovak\b|slovenštin|slovenstin|\bportuguese\b|portugalštin|portugalstin|\bhungarian\b|maďarštin|madarstin|\bromanian\b|rumunštin|rumunstin|\bbulgarian\b|bulharštin|bulharstin|\bcroatian\b|chorvatštin|chorvatstin|\bslovenian\b|slovinštin|slovinstin|\blithuanian\b|litevštin|litevstin|\blatvian\b|lotyštin|lotystin|\bmaltese\b|maltštin|maltstin|local language|místní jazyk|mistni jazyk)/iu;

function isAllowedLanguageJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  const text = languageText(job);
  if (!text) return false;
  if (FORBIDDEN_LANGUAGE.test(text)) return false;
  return ALLOWED_LANGUAGE.test(text);
}

function filterGeneratedArray(items) {
  if (!Array.isArray(items)) return items;
  return items.filter(job => {
    const allowed = isAllowedLanguageJob(job);
    if (!allowed) {
      console.log(`[LANG FILTER] rejected output: ${clean(job?.title || job?.job_title || job?.job_title_cz || job?.title_cz || "bez názvu")} | language="${languageText(job) || "missing"}"`);
    }
    return allowed;
  });
}

// Do NOT touch req.body on /generate. Only filter the already generated output.
// This keeps Make payload parsing intact and prevents the 400 Bad Request loop.
const previousPost = express.application.post;
express.application.post = function languageFilteredPost(path, ...handlers) {
  if (path === "/generate") {
    const outputFilterMiddleware = (req, res, next) => {
      const originalJson = res.json.bind(res);
      res.json = body => {
        if (body && typeof body === "object") {
          if (Array.isArray(body.herohero)) body.herohero = filterGeneratedArray(body.herohero);
          if (Array.isArray(body.instagram)) body.instagram = filterGeneratedArray(body.instagram);
          if (Array.isArray(body.jobs)) body.jobs = filterGeneratedArray(body.jobs);
          if (Array.isArray(body.reels)) body.reels = filterGeneratedArray(body.reels);
        }
        return originalJson(body);
      };
      next();
    };
    return previousPost.call(this, path, outputFilterMiddleware, ...handlers);
  }

  // /publishHeroHero is not rewritten here either. The publisher wrapper below
  // is the final authority and rejects any job that is not English/Czech.
  return previousPost.call(this, path, ...handlers);
};

const originalLoad = Module._load;
Module._load = function languageFilteredLoad(request, parent, isMain) {
  const exported = originalLoad.apply(this, arguments);

  if (request === "./publishHeroHero" || /publishHeroHero(?:\.js)?$/.test(request)) {
    if (typeof exported !== "function" || exported.__languageFiltered) return exported;

    const wrapped = async function languageFilteredPublish(job) {
      if (!isAllowedLanguageJob(job)) {
        throw new Error(`Nabídka byla odmítnuta: povolená je pouze angličtina nebo čeština. Jazyk: ${languageText(job) || "chybí"}`);
      }
      return exported(job);
    };

    Object.defineProperty(wrapped, "__languageFiltered", { value: true });
    return wrapped;
  }

  return exported;
};

console.log("[LANG FILTER] Safe output-only English/Czech filter active.");
