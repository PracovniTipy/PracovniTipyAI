"use strict";

// Global language gate for both HeroHero and Instagram.
// Only job offers requiring English and/or Czech are allowed through.
// Any offer mentioning another required/local language is rejected.

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
  return clean(flatten(
    job?.language_cz ??
    job?.languages_cz ??
    job?.language ??
    job?.languages ??
    job?.required_language ??
    job?.required_languages ??
    job?.language_requirement ??
    job?.language_requirements ??
    job?.requiredLanguage ??
    job?.requiredLanguages
  ));
}

const ALLOWED_LANGUAGE = /(?:\benglish\b|angličtin|anglictin|anglick|\baj\b|\bczech\b|češtin|cestin|česk(?:y|ý|á|a)|\bcz\b)/iu;

const FORBIDDEN_LANGUAGE = /(?:\bdutch\b|nizozemštin|nizozemstin|holandštin|holandstin|\bgerman\b|němčin|nemcin|\bfrench\b|francouzštin|francouzstin|\bspanish\b|španělštin|spanelstin|\bitalian\b|italštin|italstin|\bdanish\b|dánštin|danstin|\bswedish\b|švédštin|svedstin|\bnorwegian\b|norštin|norstin|\bfinnish\b|finštin|finstin|\bgreek\b|řečtin|rectin|\bestonian\b|estonštin|estonstin|\bpolish\b|polštin|polstin|\bslovak\b|slovenštin|slovenstin|\bportuguese\b|portugalštin|portugalstin|\bhungarian\b|maďarštin|madarstin|\bromanian\b|rumunštin|rumunstin|\bbulgarian\b|bulharštin|bulharstin|\bcroatian\b|chorvatštin|chorvatstin|\bslovenian\b|slovinštin|slovinstin|\blithuanian\b|litevštin|litevstin|\blatvian\b|lotyštin|lotystin|\bmaltese\b|maltštin|maltstin|local language|místní jazyk|mistni jazyk)/iu;

function isAllowedLanguageJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return true;

  const text = languageText(job);
  if (!text) return false;
  if (FORBIDDEN_LANGUAGE.test(text)) return false;
  return ALLOWED_LANGUAGE.test(text);
}

function looksLikeJob(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const title = clean(
    obj.job_title_cz || obj.title_cz || obj.jobTitleCz || obj.position_cz ||
    obj.job_title || obj.jobTitle || obj.title || obj.position || obj.role || obj.name
  );
  return Boolean(title);
}

function filterValue(value, seen = new WeakSet()) {
  if (value == null) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(trimmed);
        const filtered = filterValue(parsed, seen);
        return JSON.stringify(filtered);
      } catch (_) {
        return value;
      }
    }
    return value;
  }

  if (typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .map(item => filterValue(item, seen))
      .filter(item => item !== null && item !== undefined);
  }

  if (looksLikeJob(value) && !isAllowedLanguageJob(value)) {
    console.log(`[LANG FILTER] rejected: ${clean(value.title || value.job_title || value.job_title_cz || value.title_cz)} | language="${languageText(value) || "missing"}"`);
    return null;
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const filtered = filterValue(item, seen);
    if (filtered !== null && filtered !== undefined) result[key] = filtered;
  }
  return result;
}

const previousPost = express.application.post;
express.application.post = function languageFilteredPost(path, ...handlers) {
  if (path === "/generate" || path === "/publishHeroHero") {
    const filterMiddleware = (req, res, next) => {
      try {
        const filtered = filterValue(req.body);
        req.body = filtered && typeof filtered === "object" ? filtered : {};
      } catch (error) {
        console.error(`[LANG FILTER] request filtering failed: ${error.message}`);
      }
      next();
    };
    return previousPost.call(this, path, filterMiddleware, ...handlers);
  }
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

console.log("[LANG FILTER] Only English/Czech job offers are allowed.");
