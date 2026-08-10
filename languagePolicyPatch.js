"use strict";

// Loaded before allCandidatesPatch.js and stablePipelinePatch.js.
// The old language filters treated every mention of a local language as a
// hard requirement. That incorrectly rejected jobs such as "Dutch preferred",
// "Dutch is a plus" or "English or Dutch" even though English alone is enough.
// This loader also enforces the minimum data required for a publishable job:
// real city + monthly salary in CZK. Missing values must never reach images or
// HeroHero/Instagram captions.

const Module = require("module");
const fs = require("fs");
const path = require("path");
const originalJsLoader = Module._extensions[".js"];

const TARGETS = new Set(["allCandidatesPatch.js", "stablePipelinePatch.js"]);

const improvedStripFunction = String.raw`function stripNegatedLanguages(text) {
  return clean(text)
    // Explicitly not required.
    .replace(/(?:no|not|without)\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)(?:\s+(?:required|needed|necessary))?/giu, " ")
    .replace(/(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)\s+(?:is\s+)?not\s+(?:required|needed|necessary)/giu, " ")
    .replace(/(?:knowledge|command)\s+of\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese)(?:\s+is)?\s+not\s+(?:required|needed|necessary)/giu, " ")

    // Optional / preferred local language is allowed. English/Czech remains
    // the language that must actually be sufficient for the job.
    .replace(/(?:knowledge|command)\s+of\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)\s+(?:is\s+)?(?:preferred|optional|desirable|welcome|a\s+plus|an\s+advantage|nice\s+to\s+have)/giu, " ")
    .replace(/(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)\s+(?:is\s+)?(?:preferred|optional|desirable|welcome|a\s+plus|an\s+advantage|nice\s+to\s+have)/giu, " ")
    .replace(/(?:znalost\s+)?(?:nizozemštiny|nizozemstiny|holandštiny|holandstiny|němčiny|nemciny|francouzštiny|francouzstiny|španělštiny|spanelstiny|italštiny|italstiny|dánštiny|danstiny|švédštiny|svedstiny|norštiny|norstiny|finštiny|finstiny|řečtiny|rectiny|estonštiny|estonstiny|polštiny|polstiny|slovenštiny|slovenstiny)\s+(?:je\s+)?(?:výhodou|vyhodou|vítána|vitana|preferována|preferovana|nepovinná|nepovinna)/giu, " ")
    .replace(/(?:bez|není\s+nutná|neni\s+nutna|není\s+vyžadována|neni\s+vyzadovana)\s+(?:nizozemštiny|holandštiny|němčiny|nemciny|francouzštiny|francouzstiny|španělštiny|spanelstiny|italštiny|italstiny|dánštiny|danstiny|švédštiny|svedstiny|norštiny|norstiny|finštiny|finstiny|řečtiny|rectiny|estonštiny|estonstiny|polštiny|polstiny|slovenštiny|slovenstiny)/giu, " ")

    // Explicit alternatives mean English/Czech is sufficient on its own.
    // "English AND Dutch" is intentionally not stripped and still fails.
    .replace(/(?:english|angličtina|anglictina|czech|čeština|cestina)\s+(?:or|nebo)\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese)/giu, match => /czech|češt|cest/i.test(match) ? " czech " : " english ")
    .replace(/(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese)\s+(?:or|nebo)\s+(?:english|angličtina|anglictina|czech|čeština|cestina)/giu, match => /czech|češt|cest/i.test(match) ? " czech " : " english ");
}`;

function replaceTextFunction(source, name, replacement) {
  const pattern = new RegExp(`function ${name}\\(text\\) \\{[\\s\\S]*?\\n\\}\\n\\n(?=function )`);
  if (!pattern.test(source)) {
    console.warn(`[LANGUAGE POLICY] ${name} pattern not found.`);
    return source;
  }
  return source.replace(pattern, `${replacement}\n\n`);
}

function patchAllCandidates(source) {
  // When an explicit language field already says English/Czech, the full job
  // description must not reclassify the job merely because it mentions a
  // local language somewhere in unrelated text. Context is fallback evidence.
  const newAllowed = String.raw`function languageAllowed(job) {
  const normalized = normalizeLanguageEvidence(job);
  const { checkedDirect, checkedContext } = languageEvidence(normalized);
  const directHasUsefulEvidence = ENGLISH.test(checkedDirect) || CZECH.test(checkedDirect) || FORBIDDEN.test(checkedDirect);
  const source = clean(directHasUsefulEvidence ? checkedDirect : checkedContext);
  if (!source) return false;
  if (FORBIDDEN.test(source)) return false;
  return ENGLISH.test(source) || CZECH.test(source);
}`;

  const pattern = /function languageAllowed\(job\) \{[\s\S]*?\n\}\n\n(?=function jobText)/;
  if (!pattern.test(source)) {
    console.warn("[LANGUAGE POLICY] languageAllowed pattern not found.");
    return source;
  }
  return source.replace(pattern, `${newAllowed}\n\n`);
}

function patchStableCompleteness(source) {
  const replacement = String.raw`function validCityOf(job) {
  const city = clean(cityOf(job));
  if (!city) return "";
  const country = clean(countryOf(job));
  const rawCountry = clean(job?.country || job?.country_code || job?.countryName || job?.country_name);
  const normalizedCity = city.toLocaleLowerCase("cs-CZ");
  if (country && normalizedCity === country.toLocaleLowerCase("cs-CZ")) return "";
  if (rawCountry && normalizedCity === rawCountry.toLocaleLowerCase("cs-CZ")) return "";
  return city;
}

function monthlySalaryOf(job) {
  const monthlyFields = [
    job?.salary_czk_month,
    job?.monthly_salary_czk,
    job?.salary_month_czk,
    job?.salary_monthly_czk
  ];

  for (const value of monthlyFields) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return `${Math.round(value).toLocaleString("cs-CZ")} Kč / měsíc`;
    }
    const text = clean(value);
    if (!text) continue;
    if (/^\d[\d .]*(?:,\d+)?$/.test(text)) return `${text} Kč / měsíc`;
    if (/(?:kč|czk)/i.test(text)) return text;
  }

  const salary = clean(job?.salary);
  if (salary && /(?:kč|czk)/i.test(salary) && /(?:měs(?:íc|íčně)?|month(?:ly)?)/i.test(salary)) {
    return salary;
  }
  return "";
}

function safeJob(job, requireLink = false) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  if (!titleOf(job) || !countryOf(job) || forbiddenJob(job)) return false;
  if (!validCityOf(job)) return false;
  if (!monthlySalaryOf(job)) return false;
  if (!languageDecision(job).allowed) return false;
  if (requireLink && !linkOf(job)) return false;
  return true;
}`;

  const safePattern = /function safeJob\(job, requireLink = false\) \{[\s\S]*?\n\}\n\n(?=function dedupeAndSort)/;
  if (!safePattern.test(source)) {
    console.warn("[DATA COMPLETENESS] safeJob pattern not found.");
    return source;
  }
  source = source.replace(safePattern, `${replacement}\n\n`);

  const oldDebug = `              missingLinks: normalizedJobs.filter(job => !linkOf(job)).map(titleOf).slice(0, 10)`;
  const newDebug = `              missingLinks: normalizedJobs.filter(job => !linkOf(job)).map(titleOf).slice(0, 10),\n              missingCities: allJobs.filter(job => !validCityOf(job)).map(titleOf).filter(Boolean).slice(0, 10),\n              missingSalaries: allJobs.filter(job => !monthlySalaryOf(job)).map(titleOf).filter(Boolean).slice(0, 10)`;
  if (source.includes(oldDebug)) source = source.replace(oldDebug, newDebug);
  else console.warn("[DATA COMPLETENESS] debug pattern not found.");

  return source;
}

Module._extensions[".js"] = function languagePolicyLoader(module, filename) {
  const basename = path.basename(filename);
  if (!TARGETS.has(basename)) return originalJsLoader(module, filename);

  let source = fs.readFileSync(filename, "utf8");
  source = replaceTextFunction(source, "stripNegatedLanguages", improvedStripFunction);
  if (basename === "allCandidatesPatch.js") source = patchAllCandidates(source);
  if (basename === "stablePipelinePatch.js") source = patchStableCompleteness(source);

  module._compile(source, filename);
};

console.log("[LANGUAGE POLICY] Optional/preferred/OR language handling + required city/monthly CZK salary active.");
