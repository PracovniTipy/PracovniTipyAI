"use strict";

// Loaded before allCandidatesPatch.js and stablePipelinePatch.js.
// Local languages are blocked only when they are genuinely required.
// Jobs with no stated language are allowed and marked as "neuveden".

const Module = require("module");
const fs = require("fs");
const path = require("path");
const originalJsLoader = Module._extensions[".js"];

const TARGETS = new Set(["allCandidatesPatch.js", "stablePipelinePatch.js"]);

const improvedStripFunction = String.raw`function stripNegatedLanguages(text) {
  return clean(text)
    .replace(/(?:no|not|without)\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)(?:\s+(?:required|needed|necessary))?/giu, " ")
    .replace(/(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)\s+(?:is\s+)?not\s+(?:required|needed|necessary)/giu, " ")
    .replace(/(?:knowledge|command)\s+of\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese)(?:\s+is)?\s+not\s+(?:required|needed|necessary)/giu, " ")
    .replace(/(?:knowledge|command)\s+of\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)\s+(?:is\s+)?(?:preferred|optional|desirable|welcome|a\s+plus|an\s+advantage|nice\s+to\s+have)/giu, " ")
    .replace(/(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)\s+(?:is\s+)?(?:preferred|optional|desirable|welcome|a\s+plus|an\s+advantage|nice\s+to\s+have)/giu, " ")
    .replace(/(?:znalost\s+)?(?:nizozemštiny|nizozemstiny|holandštiny|holandstiny|němčiny|nemciny|francouzštiny|francouzstiny|španělštiny|spanelstiny|italštiny|italstiny|dánštiny|danstiny|švédštiny|svedstiny|norštiny|norstiny|finštiny|finstiny|řečtiny|rectiny|estonštiny|estonstiny|polštiny|polstiny|slovenštiny|slovenstiny)\s+(?:je\s+)?(?:výhodou|vyhodou|vítána|vitana|preferována|preferovana|nepovinná|nepovinna)/giu, " ")
    .replace(/(?:bez|není\s+nutná|neni\s+nutna|není\s+vyžadována|neni\s+vyzadovana)\s+(?:nizozemštiny|holandštiny|němčiny|nemciny|francouzštiny|francouzstiny|španělštiny|spanelstiny|italštiny|italstiny|dánštiny|danstiny|švédštiny|svedstiny|norštiny|norstiny|finštiny|finstiny|řečtiny|rectiny|estonštiny|estonstiny|polštiny|polstiny|slovenštiny|slovenstiny)/giu, " ")
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
  const newAllowed = String.raw`function languageAllowed(job) {
  const normalized = normalizeLanguageEvidence(job);
  const { checkedDirect, checkedContext } = languageEvidence(normalized);
  const directHasUsefulEvidence = ENGLISH.test(checkedDirect) || CZECH.test(checkedDirect) || FORBIDDEN.test(checkedDirect);
  const evidence = clean(directHasUsefulEvidence ? checkedDirect : checkedContext);

  if (FORBIDDEN.test(evidence)) return false;
  if (ENGLISH.test(evidence) || CZECH.test(evidence)) return true;

  // No explicit language requirement in the offer: allow it.
  return true;
}`;

  const pattern = /function languageAllowed\(job\) \{[\s\S]*?\n\}\n\n(?=function jobText)/;
  if (!pattern.test(source)) {
    console.warn("[LANGUAGE POLICY] languageAllowed pattern not found.");
    return source;
  }
  return source.replace(pattern, `${newAllowed}\n\n`);
}

function patchStablePipeline(source) {
  const newDecision = String.raw`function languageDecision(job) {
  let direct = directLanguageText(job);
  if (PLACEHOLDER_LANGUAGE.test(direct)) direct = "";

  const context = clean(flatten([
    job?.requirements, job?.description, job?.text, job?.textHtml,
    job?.qualifications, job?.skills
  ]));
  const source = direct || context;
  const checked = stripNegatedLanguages(source);

  if (FORBIDDEN_LANGUAGE.test(checked)) {
    return { allowed: false, normalized: "", reason: "forbidden-language" };
  }

  const en = ENGLISH_LANGUAGE.test(checked);
  const cz = CZECH_LANGUAGE.test(checked);
  if (en || cz) {
    return {
      allowed: true,
      normalized: en && cz ? "angličtina / čeština" : en ? "angličtina" : "čeština",
      reason: "ok"
    };
  }

  // The offer does not state a language requirement. Keep the real offer and
  // mark the language as unspecified instead of rejecting it.
  return { allowed: true, normalized: "neuveden", reason: "not-stated" };
}`;

  const pattern = /function languageDecision\(job\) \{[\s\S]*?\n\}\n\n(?=function jobText)/;
  if (!pattern.test(source)) {
    console.warn("[LANGUAGE POLICY] languageDecision pattern not found.");
    return source;
  }
  return source.replace(pattern, `${newDecision}\n\n`);
}

Module._extensions[".js"] = function languagePolicyLoader(module, filename) {
  const basename = path.basename(filename);
  if (!TARGETS.has(basename)) return originalJsLoader(module, filename);

  let source = fs.readFileSync(filename, "utf8");
  source = replaceTextFunction(source, "stripNegatedLanguages", improvedStripFunction);
  if (basename === "allCandidatesPatch.js") source = patchAllCandidates(source);
  if (basename === "stablePipelinePatch.js") source = patchStablePipeline(source);

  module._compile(source, filename);
};

console.log("[LANGUAGE POLICY] Missing language allowed; mandatory local languages blocked.");
