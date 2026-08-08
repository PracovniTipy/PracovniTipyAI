"use strict";

// Single compatibility layer for Make -> /generate and Make Iterator -> /publishHeroHero.
// It never invents jobs. It only normalizes real jobs already present in the payload.

const express = require("express");

const HERO_TARGET = 5;
const IG_TARGET = 2;
const CACHE_TTL_MS = 60 * 60 * 1000;

let rollingJobs = [];
let rollingAt = 0;

const COUNTRY_ALIASES = new Map([
  ["austria", "Austria"], ["at", "Austria"], ["rakousko", "Austria"],
  ["belgium", "Belgium"], ["be", "Belgium"], ["belgie", "Belgium"],
  ["denmark", "Denmark"], ["dk", "Denmark"], ["dánsko", "Denmark"], ["dansko", "Denmark"],
  ["estonia", "Estonia"], ["ee", "Estonia"], ["estonsko", "Estonia"],
  ["finland", "Finland"], ["fi", "Finland"], ["finsko", "Finland"],
  ["france", "France"], ["fr", "France"], ["francie", "France"],
  ["netherlands", "Netherlands"], ["nl", "Netherlands"], ["holland", "Netherlands"], ["holandsko", "Netherlands"], ["nizozemsko", "Netherlands"], ["nizozemí", "Netherlands"],
  ["ireland", "Ireland"], ["ie", "Ireland"], ["irsko", "Ireland"],
  ["italy", "Italy"], ["it", "Italy"], ["itálie", "Italy"], ["italie", "Italy"],
  ["cyprus", "Cyprus"], ["cy", "Cyprus"], ["kypr", "Cyprus"],
  ["malta", "Malta"], ["mt", "Malta"],
  ["germany", "Germany"], ["de", "Germany"], ["německo", "Germany"], ["nemecko", "Germany"],
  ["norway", "Norway"], ["no", "Norway"], ["norsko", "Norway"],
  ["greece", "Greece"], ["gr", "Greece"], ["řecko", "Greece"], ["recko", "Greece"],
  ["spain", "Spain"], ["es", "Spain"], ["španělsko", "Spain"], ["spanelsko", "Spain"],
  ["sweden", "Sweden"], ["se", "Sweden"], ["švédsko", "Sweden"], ["svedsko", "Sweden"]
]);

const ALLOWED_LANGUAGE = /(?:\benglish\b|angličtin|anglictin|anglick|\baj\b|\bczech\b|češtin|cestin|česk(?:y|ý|á|a)|\bcz\b)/iu;
const ENGLISH_LANGUAGE = /(?:\benglish\b|angličtin|anglictin|anglick|\baj\b)/iu;
const CZECH_LANGUAGE = /(?:\bczech\b|češtin|cestin|česk(?:y|ý|á|a)|\bcz\b)/iu;
const FORBIDDEN_LANGUAGE = /(?:\bdutch\b|nizozemštin|nizozemstin|holandštin|holandstin|\bgerman\b|němčin|nemcin|\bfrench\b|francouzštin|francouzstin|\bspanish\b|španělštin|spanelstin|\bitalian\b|italštin|italstin|\bdanish\b|dánštin|danstin|\bswedish\b|švédštin|svedstin|\bnorwegian\b|norštin|norstin|\bfinnish\b|finštin|finstin|\bgreek\b|řečtin|rectin|\bestonian\b|estonštin|estonstin|\bpolish\b|polštin|polstin|\bslovak\b|slovenštin|slovenstin|\bportuguese\b|portugalštin|portugalstin|\bhungarian\b|maďarštin|madarstin|\bromanian\b|rumunštin|rumunstin|\bbulgarian\b|bulharštin|bulharstin|\bcroatian\b|chorvatštin|chorvatstin|\bslovenian\b|slovinštin|slovinstin|\blithuanian\b|litevštin|litevstin|\blatvian\b|lotyštin|lotystin|\bmaltese\b|maltštin|maltstin|local language|místní jazyk|mistni jazyk)/iu;

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
    job?.name || job?.position_name || job?.jobName
  );
}

function linkOf(job) {
  return clean(
    job?.link || job?.apply_url || job?.applyUrl || job?.url || job?.job_url || job?.jobUrl ||
    job?.job_link || job?.jobLink || job?.application_url || job?.applicationUrl ||
    job?.offer_url || job?.offerUrl || job?.details_url || job?.detailsUrl ||
    job?.external_url || job?.externalUrl || job?.direct_link || job?.directLink ||
    job?.apply_link || job?.applyLink
  );
}

function cityOf(job) {
  const direct = clean(job?.city_cz || job?.city || job?.location_city || job?.locationCity || job?.town);
  if (direct) return direct;
  const location = clean(job?.location_cz || job?.location || job?.address);
  return location ? location.split(",")[0].trim() : "";
}

function countryOf(job) {
  const values = [
    job?.country_code, job?.countryCode, job?.country_cz, job?.country,
    job?.country_name, job?.countryName, job?.location_country, job?.locationCountry
  ];
  for (const value of values) {
    const key = clean(value).toLocaleLowerCase("cs-CZ");
    if (COUNTRY_ALIASES.has(key)) return COUNTRY_ALIASES.get(key);
  }

  const haystack = clean([job?.location_cz, job?.location, job?.address].filter(Boolean).join(" "))
    .toLocaleLowerCase("cs-CZ");
  for (const [alias, canonical] of COUNTRY_ALIASES.entries()) {
    if (alias.length > 2 && haystack.includes(alias)) return canonical;
  }
  return "";
}

function languageText(job) {
  const direct = [
    job?.language_cz, job?.languages_cz, job?.language, job?.languages,
    job?.required_language, job?.required_languages, job?.language_requirement,
    job?.language_requirements, job?.requiredLanguage, job?.requiredLanguages,
    job?.jazyk, job?.jazyky
  ].map(flatten).filter(Boolean);

  if (direct.length) return clean(direct.join(" "));

  // If there is no dedicated language field, inspect only requirements/description.
  return clean([
    flatten(job?.requirements),
    flatten(job?.description),
    flatten(job?.text),
    flatten(job?.textHtml)
  ].join(" "));
}

function stripNegatedLanguages(text) {
  return clean(text)
    .replace(/(?:no|not|without)\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)(?:\s+(?:required|needed|necessary))?/giu, " ")
    .replace(/(?:bez|není\s+nutná|neni\s+nutna|není\s+vyžadována|neni\s+vyzadovana)\s+(?:nizozemštiny|holandštiny|němčiny|nemciny|francouzštiny|francouzstiny|španělštiny|spanelstiny|italštiny|italstiny|dánštiny|danstiny|švédštiny|svedstiny|norštiny|norstiny|finštiny|finstiny|řečtiny|rectiny|estonštiny|estonstiny|polštiny|polstiny|slovenštiny|slovenstiny)/giu, " ");
}

function languageDecision(job) {
  const source = languageText(job);
  if (!source) return { allowed: false, normalized: "", reason: "missing" };
  const checked = stripNegatedLanguages(source);
  if (FORBIDDEN_LANGUAGE.test(checked)) return { allowed: false, normalized: "", reason: "forbidden-language" };
  if (!ALLOWED_LANGUAGE.test(checked)) return { allowed: false, normalized: "", reason: "not-english-czech" };

  const en = ENGLISH_LANGUAGE.test(checked);
  const cz = CZECH_LANGUAGE.test(checked);
  return {
    allowed: true,
    normalized: en && cz ? "angličtina / čeština" : en ? "angličtina" : "čeština",
    reason: "ok"
  };
}

function jobText(job) {
  return clean([
    titleOf(job), flatten(job?.description), flatten(job?.requirements),
    flatten(job?.category), flatten(job?.job_category), flatten(job?.work_category)
  ].join(" ")).toLocaleLowerCase("cs-CZ");
}

function isForbiddenJob(job) {
  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(jobText(job));
}

function isJobLike(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  if (!titleOf(job)) return false;
  return Boolean(
    linkOf(job) || countryOf(job) || job?.location || job?.city || job?.description ||
    job?.requirements || job?.salary || job?.salary_czk_month || job?.housing || job?.accommodation
  );
}

function parseJsonChunks(text) {
  if (typeof text !== "string") return [];
  const source = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const out = [];
  const seen = new Set();

  function push(chunk) {
    const raw = chunk.trim();
    if (!raw || seen.has(raw)) return false;
    try {
      out.push(JSON.parse(raw));
      seen.add(raw);
      return true;
    } catch {
      return false;
    }
  }

  if (push(source)) return out;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenced.exec(text))) push(match[1]);
  if (out.length) return out;

  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{" && text[start] !== "[") continue;
    const opener = text[start];
    const closer = opener === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === opener) depth++;
      if (ch === closer) {
        depth--;
        if (depth === 0) {
          if (push(text.slice(start, i + 1))) start = i;
          break;
        }
      }
    }
  }
  return out;
}

function collectJobs(input, seen = new Set(), out = []) {
  if (input == null || out.length >= 500) return out;

  if (typeof input === "string") {
    for (const parsed of parseJsonChunks(input)) collectJobs(parsed, seen, out);
    return out;
  }

  if (typeof input !== "object" || seen.has(input)) return out;
  seen.add(input);

  if (Array.isArray(input)) {
    for (const item of input) collectJobs(item, seen, out);
    return out;
  }

  if (isJobLike(input)) out.push(input);
  for (const value of Object.values(input)) collectJobs(value, seen, out);
  return out;
}

function keyOf(job) {
  return clean(job?.postId || job?.id || linkOf(job) || `${titleOf(job)}|${cityOf(job)}|${countryOf(job)}`)
    .toLocaleLowerCase("cs-CZ");
}

function dedupe(items) {
  const result = [];
  const seen = new Set();
  for (const job of items || []) {
    if (!isJobLike(job) || isForbiddenJob(job)) continue;
    const key = keyOf(job);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(job);
  }
  return result;
}

function score(job) {
  const text = jobText(job);
  let value = 0;
  if (/jahod|strawberr/.test(text)) value += 700;
  if (/borůvk|boruvk|blueberr/.test(text)) value += 690;
  if (/jablk|\bapple|apples/.test(text)) value += 680;
  if (/hrozn|\bgrape|grapes|vineyard|vinice/.test(text)) value += 670;
  if (/květin|kvetin|flower|floricultur|horticultur|nursery/.test(text)) value += 660;
  if (/ovoce|zelenin|fruit|vegetable|berry|berries|harvest|skliz|sběr|sber|picker/.test(text)) value += 620;
  if (/farm|farma|zeměděl|zemedel|agricultur|greenhouse|skleník|sklenik/.test(text)) value += 580;
  if (/úklid|uklid|cleaner|cleaning|housekeep|pokojsk|room attendant|maid|janitor/.test(text)) value += 260;
  if (/gastro|kuch|restaurant|restaur|číš|cis|servír|servir|barista|dishwasher|waiter|waitress/.test(text)) value += 220;
  if (/bez zkušen|bez zkusen|no experience|experience not required|entry.level|unskilled|bez vzděl|bez vzdel|no degree|no qualification|training provided|zaškol|zaskol/.test(text)) value += 180;
  if (/university|bachelor|master|degree|required education|vysoká škola|vysoka skola|maturit|vyučen|vyucen/.test(text)) value -= 350;
  if (/certificate|required certification|licen[cs]e|průkaz|prukaz|svářeč|svarec|forklift licence/.test(text)) value -= 300;
  return value;
}

function prioritize(items) {
  return dedupe(items)
    .map((job, index) => ({ job, index, score: score(job) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(x => x.job);
}

function normalizeJob(job) {
  const language = languageDecision(job);
  const country = countryOf(job);
  const title = titleOf(job);
  const link = linkOf(job);
  const city = cityOf(job);
  return {
    ...job,
    title,
    job_title: title,
    country,
    country_code: country,
    city,
    location: job?.location || city,
    link,
    language_cz: language.normalized,
    languages_cz: language.normalized,
    language: language.normalized,
    languages: language.normalized
  };
}

function eligible(items) {
  return prioritize(items).filter(job => {
    if (isForbiddenJob(job)) return false;
    if (!countryOf(job)) return false;
    return languageDecision(job).allowed;
  });
}

function refreshCache(newJobs) {
  const now = Date.now();
  if (!rollingAt || now - rollingAt > CACHE_TTL_MS) rollingJobs = [];
  rollingAt = now;
  rollingJobs = prioritize([...newJobs, ...rollingJobs]).slice(0, 100);
}

const originalPost = express.application.post;

express.application.post = function normalizedPost(path, ...handlers) {
  if (path === "/generate") {
    const normalizeBeforeGenerate = (req, res, next) => {
      try {
        const extracted = collectJobs(req.body);
        const accepted = eligible(extracted);
        refreshCache(accepted);

        const pool = eligible(rollingJobs).map(normalizeJob);
        const heroJobs = pool.filter(job => job.link).slice(0, HERO_TARGET);
        const reelJobs = pool.slice(0, IG_TARGET);

        console.log(`[INPUT FIX] extracted=${extracted.length} eligible=${accepted.length} cache=${rollingJobs.length} hero=${heroJobs.length}/${HERO_TARGET} ig=${reelJobs.length}/${IG_TARGET}`);

        // Only replace the body when parsing actually succeeded. Never turn a
        // valid Make/OpenAI payload into an empty object again.
        if (heroJobs.length || reelJobs.length) {
          req.body = { jobs: heroJobs, reels: reelJobs };
        }

        const originalJson = res.json.bind(res);
        res.json = body => {
          if (body && typeof body === "object") {
            const heroCount = Array.isArray(body.herohero) ? body.herohero.length : 0;
            const igCount = Array.isArray(body.instagram) ? body.instagram.length : 0;
            body.debugCounts = {
              extracted: extracted.length,
              eligible: accepted.length,
              herohero: heroCount,
              instagram: igCount,
              targetHerohero: HERO_TARGET,
              targetInstagram: IG_TARGET
            };

            // Never silently finish at an empty Iterator again.
            if (body.success === true && heroCount === 0 && igCount === 0) {
              return res.status(422).json({
                success: false,
                error: "Render nenašel žádnou nabídku, kterou lze poslat do Iteratorů.",
                debugCounts: body.debugCounts
              });
            }
          }
          return originalJson(body);
        };
      } catch (error) {
        console.error(`[INPUT FIX] /generate normalization error: ${error.message}`);
      }
      next();
    };

    return originalPost.call(this, path, normalizeBeforeGenerate, ...handlers);
  }

  if (path === "/publishHeroHero") {
    // Make already has an Iterator. Each iterator bundle must publish exactly
    // the one real HeroHero job it contains; the old index route incorrectly
    // required another 5-item batch here.
    const publishIteratorItem = async (req, res) => {
      try {
        const jobs = eligible(collectJobs(req.body)).map(normalizeJob).filter(job => job.link);
        if (!jobs.length) {
          return res.status(422).json({
            success: false,
            error: "Iterator neposlal platnou HeroHero nabídku s AJ/CZ a přímým odkazem."
          });
        }

        const publishHeroHero = require("./publishHeroHero");
        const results = [];
        for (const job of jobs.slice(0, HERO_TARGET)) {
          try {
            const result = await publishHeroHero(job);
            results.push({ success: true, title: job.title, result });
          } catch (error) {
            results.push({ success: false, title: job.title, error: error.message });
          }
        }

        const published = results.filter(x => x.success).length;
        if (!published) return res.status(502).json({ success: false, published: 0, results });
        return res.status(200).json({ success: true, published, results });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    };

    return originalPost.call(this, path, publishIteratorItem);
  }

  return originalPost.call(this, path, ...handlers);
};

console.log("[INPUT FIX] Robust Make parser + 5 HeroHero / 2 IG + per-item HeroHero publish active.");
