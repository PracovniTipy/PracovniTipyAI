"use strict";

// Loaded before allCandidatesPatch.js and stablePipelinePatch.js.
// The old language filters treated every mention of a local language as a
// hard requirement. That incorrectly rejected jobs such as "Dutch preferred",
// "Dutch is a plus" or "English or Dutch" even though English alone is enough.
// This loader only changes the language-evidence helpers; it does not relax
// genuinely mandatory non-English/Czech language requirements.

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

function replaceFunction(source, name, replacement) {
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
  const oldAllowed = String.raw`function languageAllowed(job) {
  const normalized = normalizeLanguageEvidence(job);
  const { checkedDirect, checkedContext } = languageEvidence(normalized);
  const combined = clean(\`${checkedDirect} ${checkedContext}\`);
  if (!combined) return false;
  if (FORBIDDEN.test(combined)) return false;
  return ENGLISH.test(combined) || CZECH.test(combined);
}`;

  const newAllowed = String.raw`function languageAllowed(job) {
  const normalized = normalizeLanguageEvidence(job);
  const { checkedDirect, checkedContext } = languageEvidence(normalized);
  const directHasUsefulEvidence = ENGLISH.test(checkedDirect) || CZECH.test(checkedDirect) || FORBIDDEN.test(checkedDirect);
  const source = clean(directHasUsefulEvidence ? checkedDirect : checkedContext);
  if (!source) return false;
  if (FORBIDDEN.test(source)) return false;
  return ENGLISH.test(source) || CZECH.test(source);
}`;

  if (!source.includes(oldAllowed)) {
    console.warn("[LANGUAGE POLICY] languageAllowed pattern not found.");
    return source;
  }
  return source.replace(oldAllowed, newAllowed);
}

Module._extensions[".js"] = function languagePolicyLoader(module, filename) {
  const basename = path.basename(filename);
  if (!TARGETS.has(basename)) return originalJsLoader(module, filename);

  let source = fs.readFileSync(filename, "utf8");
  source = replaceFunction(source, "stripNegatedLanguages", improvedStripFunction);
  if (basename === "allCandidatesPatch.js") source = patchAllCandidates(source);

  module._compile(source, filename);
};

console.log("[LANGUAGE POLICY] Optional/preferred/OR language handling active; mandatory local languages remain blocked.");
