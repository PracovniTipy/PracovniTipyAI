"use strict";

const express = require("express");

const HERO_COUNT = 5;
const IG_COUNT = 2;
const POOL_TTL_MS = 60 * 60 * 1000;
const RECENT_TTL_MS = 12 * 60 * 60 * 1000;

let rollingPool = [];
let generatedPool = [];
let poolStartedAt = 0;
let publishChain = Promise.resolve();
const scheduled = new Set();
const recent = new Map();

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
  return clean(job?.job_title_cz || job?.title_cz || job?.jobTitleCz || job?.position_cz || job?.job_title || job?.jobTitle || job?.title || job?.position || job?.role || job?.name || job?.position_name || job?.jobName);
}

function linkOf(job) {
  return clean(job?.link || job?.apply_url || job?.applyUrl || job?.url || job?.job_url || job?.jobUrl || job?.job_link || job?.jobLink || job?.application_url || job?.applicationUrl || job?.offer_url || job?.offerUrl || job?.details_url || job?.detailsUrl || job?.external_url || job?.externalUrl || job?.direct_link || job?.directLink);
}

function cityOf(job) {
  const direct = clean(job?.city_cz || job?.city || job?.location_city || job?.locationCity);
  if (direct) return direct;
  const location = clean(job?.location_cz || job?.location || job?.address);
  return location ? location.split(",")[0].trim() : "";
}

function canonicalCountry(job) {
  const values = [job?.country_code, job?.countryCode, job?.country, job?.country_name, job?.countryName, job?.location_country, job?.locationCountry];
  for (const value of values) {
    const key = clean(value).toLocaleLowerCase("cs-CZ");
    if (COUNTRY_ALIASES.has(key)) return COUNTRY_ALIASES.get(key);
  }
  const location = clean([job?.location, job?.location_cz, job?.address].filter(Boolean).join(" ")).toLocaleLowerCase("cs-CZ");
  for (const [alias, canonical] of COUNTRY_ALIASES.entries()) {
    if (alias.length > 2 && location.includes(alias)) return canonical;
  }
  return "";
}

function jobText(job) {
  return clean([
    titleOf(job), flatten(job?.description), flatten(job?.requirements), flatten(job?.category),
    flatten(job?.job_category), flatten(job?.work_category), flatten(job?.text), flatten(job?.textHtml)
  ].join(" ")).toLocaleLowerCase("cs-CZ");
}

function directLanguageText(job) {
  const values = [
    job?.language_cz, job?.languages_cz, job?.language, job?.languages,
    job?.required_language, job?.required_languages, job?.language_requirement,
    job?.language_requirements, job?.requiredLanguage, job?.requiredLanguages,
    job?.jazyk, job?.jazyky, job?.pozadovany_jazyk, job?.požadovaný_jazyk
  ];
  for (const [key, value] of Object.entries(job || {})) {
    const normalizedKey = key.toLocaleLowerCase("cs-CZ").replace(/[\s_-]+/g, "");
    if (/(?:language|languages|requiredlanguage|languagerequirement|jazyk|jazyky|pozadovanyjazyk|požadovanýjazyk)/u.test(normalizedKey)) values.push(value);
  }
  return clean(values.map(flatten).filter(Boolean).join(" "));
}

function stripNegatedForbiddenLanguage(text) {
  return clean(text)
    .replace(/(?:no|not|required\s+not|without)\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)(?:\s+(?:required|needed|necessary))?/giu, " ")
    .replace(/(?:bez|není\s+nutná|neni\s+nutna|není\s+vyžadována|neni\s+vyzadovana)\s+(?:nizozemštiny|holandštiny|němčiny|nemciny|francouzštiny|francouzstiny|španělštiny|spanelstiny|italštiny|italstiny|dánštiny|danstiny|švédštiny|svedstiny|norštiny|norstiny|finštiny|finstiny|řečtiny|rectiny|estonštiny|estonstiny|polštiny|polstiny|slovenštiny|slovenstiny)/giu, " ");
}

function languageDecision(job) {
  const direct = directLanguageText(job);
  const context = clean([flatten(job?.requirements), flatten(job?.description), flatten(job?.text), flatten(job?.textHtml)].join(" "));
  const source = direct || context;
  if (!source) return { allowed: false, normalized: "", reason: "missing" };

  const checked = stripNegatedForbiddenLanguage(source);
  if (FORBIDDEN_LANGUAGE.test(checked)) return { allowed: false, normalized: "", reason: "forbidden" };
  if (!ALLOWED_LANGUAGE.test(checked)) return { allowed: false, normalized: "", reason: "not-english-czech" };

  const hasEnglish = ENGLISH_LANGUAGE.test(checked);
  const hasCzech = CZECH_LANGUAGE.test(checked);
  const normalized = hasEnglish && hasCzech ? "angličtina / čeština" : hasEnglish ? "angličtina" : "čeština";
  return { allowed: true, normalized, reason: "ok" };
}

function isForbiddenJob(job) {
  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(jobText(job));
}

function looksLikeJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  if (!titleOf(job) || isForbiddenJob(job)) return false;
  return Boolean(linkOf(job) || canonicalCountry(job) || job?.location || job?.city || job?.description || job?.requirements || job?.salary || job?.salary_czk_month || job?.housing || job?.accommodation);
}

function jsonCandidates(text) {
  if (typeof text !== "string") return [];
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = [];
  const tryParse = value => { try { parsed.push(JSON.parse(value)); return true; } catch { return false; } };
  if (cleaned && tryParse(cleaned)) return parsed;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenced.exec(text))) tryParse(match[1].trim());
  return parsed;
}

function collectJobs(input, seen = new Set(), out = []) {
  if (input == null || out.length >= 500) return out;
  if (typeof input === "string") {
    for (const parsed of jsonCandidates(input)) collectJobs(parsed, seen, out);
    return out;
  }
  if (typeof input !== "object" || seen.has(input)) return out;
  seen.add(input);
  if (Array.isArray(input)) {
    for (const item of input) collectJobs(item, seen, out);
    return out;
  }
  if (looksLikeJob(input)) out.push(input);
  for (const value of Object.values(input)) collectJobs(value, seen, out);
  return out;
}

function keyOf(job) {
  return clean(job?.postId || job?.id || linkOf(job) || `${titleOf(job)}|${cityOf(job)}|${canonicalCountry(job)}`).toLocaleLowerCase("cs-CZ");
}

function dedupe(items, limit = 500) {
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

function score(job) {
  const text = jobText(job);
  let value = 0;

  if (/jahod|strawberr/.test(text)) value += 620;
  if (/borůvk|boruvk|blueberr/.test(text)) value += 610;
  if (/jablk|apple\b|apples\b/.test(text)) value += 600;
  if (/hrozn|grape\b|grapes\b|vineyard|vinice/.test(text)) value += 590;
  if (/květin|kvetin|flower|floricultur|horticultur|nursery/.test(text)) value += 580;
  if (/ovoce|zelenin|fruit|vegetable|berry|berries|harvest|skliz|sběr|sber|picker/.test(text)) value += 540;
  if (/farm|farma|zeměděl|zemedel|agricultur|greenhouse|skleník|sklenik/.test(text)) value += 500;
  if (/úklid|uklid|cleaner|cleaning|housekeep|pokojsk|room attendant|maid|janitor|myč|myc|dishwasher/.test(text)) value += 220;
  if (/gastro|kuch|restaurant|restaur|číš|cis|servír|servir|barista|kitchen|catering|waiter|waitress/.test(text)) value += 180;
  if (/hotel|resort|hostel/.test(text)) value += 100;
  if (/sklad|warehouse|logisti|balen|packing|packer|order picker|vychyst/.test(text)) value += 60;
  if (/výrob|vyrob|production|factory/.test(text)) value += 30;

  if (/bez zkušen|bez zkusen|no experience|experience not required|entry.level|unskilled|bez vzděl|bez vzdel|no degree|no qualification|training provided|zaškol|zaskol/.test(text)) value += 180;
  if (/university|bachelor|master|degree|required education|vysoká škola|vysoka skola|maturit|vyučen|vyucen/.test(text)) value -= 300;
  if (/certificate|required certification|licen[cs]e|průkaz|prukaz|svářeč|svarec|forklift licence/.test(text)) value -= 260;
  if (/(?:[2-9]|[1-9][0-9])\+?\s*(?:years?|let)\s+(?:of\s+)?experience|minimum\s+(?:[2-9]|[1-9][0-9])\s*(?:years?|let)/.test(text)) value -= 220;
  return value;
}

function prioritize(items) {
  return dedupe(items)
    .map((job, index) => ({ job, index, score: score(job) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.job);
}

function inferCategory(job) {
  const text = jobText(job);
  if (/jahod|borůvk|boruvk|jablk|hrozn|ovoce|zelenin|strawberr|blueberr|apple\b|grape\b|fruit|vegetable|berry|berries|harvest|skliz|sběr|sber|picker/.test(text)) return "Práce s ovocem/zeleninou";
  if (/květin|kvetin|flower|floricultur|horticultur|nursery|farm|farma|zeměděl|zemedel|agricultur|greenhouse|skleník|sklenik/.test(text)) return "Práce na farmách";
  if (/úklid|uklid|clean|housekeep|pokojsk|room attendant|maid|janitor/.test(text)) return "Úklid";
  if (/gastro|kuch|restaurant|restaur|číš|cis|servír|servir|barista|dishwasher|nádob|catering|waiter|waitress/.test(text)) return "Gastronomie";
  if (/hotel|resort|hostel|recep|guest service/.test(text)) return "Hotelové práce";
  if (/sklad|warehouse|logisti|balen|packing|packer|order picker|vychyst/.test(text)) return "Sklady a logistika";
  if (/výrob|vyrob|production|factory|potravin/.test(text)) return "Výroba";
  return clean(job?.work_category || job?.job_category);
}

function prepare(job) {
  const language = languageDecision(job);
  return {
    ...job,
    title: titleOf(job),
    job_title: titleOf(job),
    link: linkOf(job),
    country: canonicalCountry(job) || job?.country,
    city: cityOf(job) || job?.city,
    location: job?.location || cityOf(job),
    work_category: inferCategory(job) || job?.work_category,
    job_category: inferCategory(job) || job?.job_category,
    language_cz: language.normalized,
    languages_cz: language.normalized,
    language: language.normalized,
    languages: language.normalized
  };
}

function cleanupRecent() {
  const now = Date.now();
  for (const [key, at] of recent.entries()) if (now - at > RECENT_TTL_MS) recent.delete(key);
}

function isUsed(job) {
  cleanupRecent();
  const key = keyOf(job);
  return Boolean(key && (scheduled.has(key) || recent.has(key)));
}

function resetPoolIfNeeded() {
  const now = Date.now();
  if (!poolStartedAt || now - poolStartedAt > POOL_TTL_MS) {
    rollingPool = [];
    generatedPool = [];
    poolStartedAt = now;
  }
}

function mergeIntoRolling(jobs) {
  resetPoolIfNeeded();
  rollingPool = prioritize([...jobs, ...rollingPool]).slice(0, 150);
}

function eligibleJobs(items) {
  return prioritize(items).filter(job => {
    const language = languageDecision(job);
    if (!language.allowed) {
      console.log(`[FINAL FIX] rejected language: ${titleOf(job)} (${language.reason})`);
      return false;
    }
    return !isForbiddenJob(job) && canonicalCountry(job);
  });
}

function schedulePublications(batch) {
  const jobs = batch.map(prepare).filter(job => job.title && job.link && !isForbiddenJob(job) && languageDecision(job).allowed);
  if (!jobs.length) return;
  for (const job of jobs) scheduled.add(keyOf(job));

  publishChain = publishChain.then(async () => {
    const publishHeroHero = require("./publishHeroHero");
    for (const job of jobs) {
      const key = keyOf(job);
      let success = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[FINAL FIX] HeroHero publishing: ${job.title} attempt ${attempt}/3`);
          await publishHeroHero(job);
          recent.set(key, Date.now());
          success = true;
          console.log(`[FINAL FIX] HeroHero published: ${job.title}`);
          break;
        } catch (error) {
          console.error(`[FINAL FIX] HeroHero failed: ${job.title} attempt ${attempt}/3: ${error.message}`);
          if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      scheduled.delete(key);
      if (!success) console.error(`[FINAL FIX] HeroHero permanently failed for now: ${job.title}`);
    }
  }).catch(error => console.error(`[FINAL FIX] publish queue error: ${error.message}`));
}

const nativePost = express.application.post;

express.application.post = function finalWorkflowPost(path, ...handlers) {
  if (path === "/generate") {
    const normalizeGenerate = (req, res, next) => {
      try {
        const extracted = eligibleJobs(collectJobs(req.body));
        mergeIntoRolling(extracted);

        const preparedPool = eligibleJobs(rollingPool).map(prepare);
        const heroJobs = preparedPool.filter(job => job.title && job.link && canonicalCountry(job)).slice(0, HERO_COUNT);
        const igJobs = preparedPool.filter(job => job.title && canonicalCountry(job)).slice(0, IG_COUNT);

        req.body = { jobs: heroJobs, reels: igJobs };
        console.log(`[FINAL FIX] /generate extracted=${extracted.length} pool=${preparedPool.length} heroInput=${heroJobs.length}/${HERO_COUNT} igInput=${igJobs.length}/${IG_COUNT}`);

        const originalJson = res.json.bind(res);
        res.json = body => {
          if (body && typeof body === "object") {
            if (Array.isArray(body.herohero)) {
              body.herohero = body.herohero.filter(job => languageDecision(job).allowed && !isForbiddenJob(job)).slice(0, HERO_COUNT);
              generatedPool = prioritize([...body.herohero, ...generatedPool]).slice(0, 100);
            }
            if (Array.isArray(body.instagram)) {
              body.instagram = body.instagram.filter(job => languageDecision(job).allowed && !isForbiddenJob(job)).slice(0, IG_COUNT);
            }
            body.debugCounts = {
              herohero: Array.isArray(body.herohero) ? body.herohero.length : 0,
              instagram: Array.isArray(body.instagram) ? body.instagram.length : 0,
              targetHerohero: HERO_COUNT,
              targetInstagram: IG_COUNT
            };
            console.log(`[FINAL FIX] /generate output hero=${body.debugCounts.herohero}/${HERO_COUNT} ig=${body.debugCounts.instagram}/${IG_COUNT}`);
          }
          return originalJson(body);
        };
      } catch (error) {
        console.error(`[FINAL FIX] /generate normalization failed: ${error.message}`);
      }
      next();
    };
    return nativePost.call(this, path, normalizeGenerate, ...handlers);
  }

  if (path === "/publishHeroHero") {
    const publishRoute = async (req, res) => {
      try {
        const incoming = eligibleJobs(collectJobs(req.body));
        mergeIntoRolling(incoming);

        const pool = eligibleJobs([...generatedPool, ...incoming, ...rollingPool])
          .map(prepare)
          .filter(job => job.title && job.link && canonicalCountry(job) && !isUsed(job));

        const batch = pool.slice(0, HERO_COUNT);
        schedulePublications(batch);

        const batchKeys = new Set(batch.map(keyOf));
        generatedPool = generatedPool.filter(job => !batchKeys.has(keyOf(job)));
        rollingPool = rollingPool.filter(job => !batchKeys.has(keyOf(job)));

        console.log(`[FINAL FIX] /publishHeroHero incoming=${incoming.length} available=${pool.length} accepted=${batch.length}/${HERO_COUNT}`);
        return res.status(200).json({
          success: true,
          accepted: batch.length,
          target: HERO_COUNT,
          publishing: batch.length > 0,
          message: batch.length ? `Publikuji ${batch.length}/${HERO_COUNT} dostupných HeroHero nabídek.` : "Žádná nová vhodná HeroHero nabídka nebyla k publikaci."
        });
      } catch (error) {
        console.error(`[FINAL FIX] /publishHeroHero failed: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message });
      }
    };
    return nativePost.call(this, path, publishRoute);
  }

  return nativePost.call(this, path, ...handlers);
};

console.log("[FINAL FIX] 5 HeroHero / 2 IG + English/Czech + crop priority active.");
