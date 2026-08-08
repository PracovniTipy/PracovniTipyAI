"use strict";

const express = require("express");

const HERO_TARGET = 5;
const IG_TARGET = 2;
const CACHE_TTL_MS = 60 * 60 * 1000;

let heroCache = [];
let heroCacheAt = 0;
let publishedKeys = new Set();

const COUNTRY_ALIASES = new Map([
  ["austria", "Austria"], ["at", "Austria"], ["rakousko", "Austria"], ["österreich", "Austria"], ["osterreich", "Austria"],
  ["belgium", "Belgium"], ["be", "Belgium"], ["belgie", "Belgium"], ["belgië", "Belgium"], ["belgie", "Belgium"], ["belgique", "Belgium"],
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

const ALLOWED_LANGUAGE = /(?:\benglish\b|angličtin|anglictin|anglick|\baj\b|\bczech\b|češtin|cestin|česk(?:y|ý|á|a)|\bcz\b)/iu;
const ENGLISH_LANGUAGE = /(?:\benglish\b|angličtin|anglictin|anglick|\baj\b)/iu;
const CZECH_LANGUAGE = /(?:\bczech\b|češtin|cestin|česk(?:y|ý|á|a)|\bcz\b)/iu;
const FORBIDDEN_LANGUAGE = /(?:\bdutch\b|nizozemštin|nizozemstin|holandštin|holandstin|\bgerman\b|němčin|nemcin|\bfrench\b|francouzštin|francouzstin|\bspanish\b|španělštin|spanelstin|\bitalian\b|italštin|italstin|\bdanish\b|dánštin|danstin|\bswedish\b|švédštin|svedstin|\bnorwegian\b|norštin|norstin|\bfinnish\b|finštin|finstin|\bgreek\b|řečtin|rectin|\bestonian\b|estonštin|estonstin|\bpolish\b|polštin|polstin|\bslovak\b|slovenštin|slovenstin|\bportuguese\b|portugalštin|portugalstin|\bhungarian\b|maďarštin|madarstin|\bromanian\b|rumunštin|rumunstin|\bbulgarian\b|bulharštin|bulharstin|\bcroatian\b|chorvatštin|chorvatstin|\bslovenian\b|slovinštin|slovinstin|\blithuanian\b|litevštin|litevstin|\blatvian\b|lotyštin|lotystin|\bmaltese\b|maltštin|maltstin|local language|místní jazyk|mistni jazyk)/iu;
const PLACEHOLDER_LANGUAGE = /^(?:dle nabídky|dle nabidky|neuveden(?:o|ý|á)?|není uveden(?:o|ý|á)?|neni uveden(?:o|y|a)?|not specified|not provided|unknown|n\/?a)$/iu;

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
  const direct = clean(
    job?.link || job?.apply_url || job?.applyUrl || job?.url || job?.job_url || job?.jobUrl ||
    job?.job_link || job?.jobLink || job?.application_url || job?.applicationUrl ||
    job?.offer_url || job?.offerUrl || job?.details_url || job?.detailsUrl ||
    job?.external_url || job?.externalUrl || job?.direct_link || job?.directLink ||
    job?.apply_link || job?.applyLink || job?.source_url || job?.sourceUrl ||
    job?.job_posting_url || job?.jobPostingUrl || job?.job_details_url || job?.jobDetailsUrl
  );
  if (direct) return direct;
  const text = flatten([job?.text, job?.textHtml, job?.description, job?.caption, job?.content]);
  const match = text.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? match[0] : "";
}

function imageOf(job) {
  return clean(job?.imageUrl || job?.image_url || job?.image || job?.previewUrl || job?.preview_url);
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
  const location = clean([job?.location_cz, job?.location, job?.address].filter(Boolean).join(" ")).toLocaleLowerCase("cs-CZ");
  for (const [alias, canonical] of COUNTRY_ALIASES.entries()) {
    if (alias.length > 2 && location.includes(alias)) return canonical;
  }
  return "";
}

function directLanguageText(job) {
  const values = [
    job?.language_cz, job?.languages_cz, job?.language, job?.languages,
    job?.required_language, job?.required_languages, job?.language_requirement,
    job?.language_requirements, job?.requiredLanguage, job?.requiredLanguages,
    job?.jazyk, job?.jazyky, job?.pozadovany_jazyk, job?.požadovaný_jazyk,
    job?.languageName, job?.language_name, job?.requiredLanguageName,
    job?.english_required, job?.englishRequired, job?.english, job?.czech_required, job?.czechRequired
  ];

  for (const [key, value] of Object.entries(job || {})) {
    const normalizedKey = key.toLocaleLowerCase("cs-CZ").replace(/[\s_-]+/g, "");
    if (/(?:language|jazyk|english|anglict|czech|cestin)/u.test(normalizedKey)) values.push(value);
  }

  return clean(values.map(flatten).filter(Boolean).join(" "));
}

function stripNegatedLanguages(text) {
  return clean(text)
    .replace(/(?:no|not|without)\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese|hungarian|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|maltese)(?:\s+(?:required|needed|necessary))?/giu, " ")
    .replace(/(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish|greek|estonian|polish|slovak|portuguese)\s+(?:is\s+)?not\s+(?:required|needed|necessary)/giu, " ")
    .replace(/(?:knowledge|command)\s+of\s+(?:dutch|german|french|spanish|italian|danish|swedish|norwegian|finnish)\s+(?:is\s+)?not\s+(?:required|needed|necessary)/giu, " ")
    .replace(/(?:bez|není\s+nutná|neni\s+nutna|není\s+vyžadována|neni\s+vyzadovana)\s+(?:nizozemštiny|holandštiny|němčiny|nemciny|francouzštiny|francouzstiny|španělštiny|spanelstiny|italštiny|italstiny|dánštiny|danstiny|švédštiny|svedstiny|norštiny|norstiny|finštiny|finstiny|řečtiny|rectiny|estonštiny|estonstiny|polštiny|polstiny|slovenštiny|slovenstiny)/giu, " ");
}

function languageDecision(job) {
  let direct = directLanguageText(job);
  if (PLACEHOLDER_LANGUAGE.test(direct)) direct = "";

  const context = clean(flatten([
    job?.requirements, job?.description, job?.text, job?.textHtml,
    job?.qualifications, job?.skills
  ]));
  const source = direct || context;
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

function forbiddenJob(job) {
  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|montáž\w*\s+(?:výrob|stroj)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(jobText(job));
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

function keyOf(job) {
  return clean(job?.postId || job?.id || linkOf(job) || imageOf(job) || `${titleOf(job)}|${cityOf(job)}|${countryOf(job)}`).toLocaleLowerCase("cs-CZ");
}

function normalizeJob(job) {
  const language = languageDecision(job);
  const title = titleOf(job);
  const country = countryOf(job);
  const city = cityOf(job);
  const link = linkOf(job);
  return {
    ...job,
    title,
    job_title: title,
    country: country || job?.country,
    country_code: country || job?.country_code,
    city: city || job?.city,
    location: job?.location || city,
    link: link || job?.link,
    language_cz: language.normalized,
    languages_cz: language.normalized,
    language: language.normalized,
    languages: language.normalized
  };
}

function safeJob(job, requireLink = false) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  if (!titleOf(job) || !countryOf(job(job)) || forbiddenJob(job)) return false;
  if (!languageDecision(job).allowed) return false;
  if (requireLink && !linkOf(job)) return false;
  return true;
}

function dedupeAndSort(items) {
  const seen = new Set();
  return (items || [])
    .filter(Boolean)
    .filter(job => {
      const key = keyOf(job);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((job, index) => ({ job, index, score: score(job) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(x => x.job);
}

function parseJsonString(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch (_) { return null; }
}

function extractPayload(input, seen = new Set()) {
  if (!input) return {};
  if (typeof input === "string") {
    const parsed = parseJsonString(input);
    return parsed ? extractPayload(parsed, seen) : {};
  }
  if (typeof input !== "object" || seen.has(input)) return {};
  seen.add(input);

  if (Array.isArray(input)) {
    const jobs = [];
    const reels = [];
    for (const item of input) {
      const nested = extractPayload(item, seen);
      if (Array.isArray(nested.jobs)) jobs.push(...nested.jobs);
      if (Array.isArray(nested.reels)) reels.push(...nested.reels);
    }
    if (!jobs.length && !reels.length && input.every(x => x && typeof x === "object")) jobs.push(...input);
    return jobs.length || reels.length ? { jobs, reels } : {};
  }

  const copy = { ...input };
  if (copy.jobs === undefined && copy.herohero !== undefined) copy.jobs = copy.herohero;
  if (copy.jobs === undefined && copy.heroHero !== undefined) copy.jobs = copy.heroHero;
  if (copy.reels === undefined && copy.instagram !== undefined) copy.reels = copy.instagram;
  if (copy.reels === undefined && copy.ig !== undefined) copy.reels = copy.ig;

  for (const key of ["jobs", "reels"]) {
    if (typeof copy[key] === "string") {
      const parsed = parseJsonString(copy[key]);
      copy[key] = Array.isArray(parsed) ? parsed : [];
    }
  }
  if (Array.isArray(copy.jobs) || Array.isArray(copy.reels)) return copy;

  const messageContent = input.choices?.[0]?.message?.content;
  if (messageContent !== undefined) {
    const nested = extractPayload(messageContent, seen);
    if (Array.isArray(nested.jobs) || Array.isArray(nested.reels)) return nested;
  }

  for (const key of ["body", "data", "output", "result", "response", "content", "text", "value", "item", "collection", "items", "payload", "json"]) {
    if (input[key] !== undefined) {
      const nested = extractPayload(input[key], seen);
      if (Array.isArray(nested.jobs) || Array.isArray(nested.reels)) return nested;
    }
  }

  const jobLike = ["job_title", "jobTitle", "title", "position", "role", "country_code", "countryCode", "salary"].some(key => input[key] !== undefined);
  if (jobLike) return { jobs: [input], reels: [] };

  for (const value of Object.values(input)) {
    const nested = extractPayload(value, seen);
    if (Array.isArray(nested.jobs) || Array.isArray(nested.reels)) return nested;
  }
  return {};
}

function nextUnusedCached() {
  if (!heroCache.length || Date.now() - heroCacheAt > CACHE_TTL_MS) return null;
  return heroCache.find(job => !publishedKeys.has(keyOf(job))) || null;
}

const originalPost = express.application.post;

express.application.post = function stablePipelinePost(path, ...handlers) {
  if (path === "/generate") {
    const normalizeGenerate = (req, res, next) => {
      try {
        const payload = extractPayload(req.body);
        const allJobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        const allReels = Array.isArray(payload.reels) ? payload.reels : [];

        const normalizedJobs = dedupeAndSort(allJobs.map(normalizeJob).filter(job => safeJob(job, false)));
        const heroJobs = normalizedJobs.filter(job => linkOf(job)).slice(0, HERO_TARGET);
        const reelJobs = dedupeAndSort([...allReels.map(normalizeJob).filter(job => safeJob(job, false)), ...normalizedJobs]).slice(0, IG_TARGET);

        const languageStats = allJobs.reduce((acc, job) => {
          const reason = languageDecision(job).reason;
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {});

        console.log(`[STABLE PIPELINE] source=${allJobs.length} safe=${normalizedJobs.length} hero=${heroJobs.length}/${HERO_TARGET} ig=${reelJobs.length}/${IG_TARGET}`);

        if (heroJobs.length < HERO_TARGET || reelJobs.length < IG_TARGET) {
          return res.status(422).json({
            success: false,
            error: `Není dost vhodných nabídek pro tento běh: HeroHero ${heroJobs.length}/${HERO_TARGET}, Instagram ${reelJobs.length}/${IG_TARGET}.`,
            debug: {
              sourceJobs: allJobs.length,
              safeJobs: normalizedJobs.length,
              heroWithDirectLink: heroJobs.length,
              instagramSafe: reelJobs.length,
              languageStats,
              forbiddenTitles: allJobs.filter(forbiddenJob).map(titleOf).filter(Boolean).slice(0, 10),
              missingLinks: normalizedJobs.filter(job => !linkOf(job)).map(titleOf).slice(0, 10)
            }
          });
        }

        req.body = { jobs: heroJobs, reels: reelJobs };

        const originalJson = res.json.bind(res);
        res.json = body => {
          if (body && typeof body === "object") {
            const rawHero = Array.isArray(body.herohero) ? body.herohero : [];
            const rawIg = Array.isArray(body.instagram) ? body.instagram : [];

            body.herohero = dedupeAndSort(rawHero.filter(job => !forbiddenJob(job) && languageDecision(job).allowed)).slice(0, HERO_TARGET);
            body.instagram = dedupeAndSort(rawIg.filter(job => !forbiddenJob(job) && languageDecision(job).allowed)).slice(0, IG_TARGET);

            body.debugCounts = {
              sourceJobs: allJobs.length,
              selectedHeroInput: heroJobs.length,
              selectedInstagramInput: reelJobs.length,
              rawHerohero: rawHero.length,
              rawInstagram: rawIg.length,
              herohero: body.herohero.length,
              instagram: body.instagram.length,
              targetHerohero: HERO_TARGET,
              targetInstagram: IG_TARGET
            };

            if (body.herohero.length !== HERO_TARGET || body.instagram.length !== IG_TARGET) {
              return res.status(502).json({
                success: false,
                error: `Render nevygeneroval kompletní výstup: HeroHero ${body.herohero.length}/${HERO_TARGET}, Instagram ${body.instagram.length}/${IG_TARGET}.`,
                debugCounts: body.debugCounts
              });
            }

            heroCache = body.herohero.map(normalizeJob);
            heroCacheAt = Date.now();
            publishedKeys = new Set();
            console.log(`[STABLE PIPELINE] generated exact hero=5/5 ig=2/2`);
          }
          return originalJson(body);
        };
      } catch (error) {
        console.error(`[STABLE PIPELINE] /generate failed: ${error.message}`);
        return res.status(500).json({ success: false, error: error.message });
      }
      next();
    };
    return originalPost.call(this, path, normalizeGenerate, ...handlers);
  }

  if (path === "/publishHeroHero") {
    const publishOne = async (req, res) => {
      try {
        const job = nextUnusedCached();
        if (!job) {
          return res.status(422).json({
            success: false,
            error: "V cache není další HeroHero nabídka z aktuálního běhu.",
            debug: { cache: heroCache.length, published: publishedKeys.size }
          });
        }

        const publishHeroHero = require("./publishHeroHero");
        const result = await publishHeroHero(job);
        publishedKeys.add(keyOf(job));

        console.log(`[STABLE PIPELINE] HeroHero published ${publishedKeys.size}/${HERO_TARGET}: ${titleOf(job)}`);
        return res.status(200).json({
          success: true,
          published: 1,
          title: titleOf(job),
          batchProgress: `${publishedKeys.size}/${HERO_TARGET}`,
          result
        });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }
    };
    return originalPost.call(this, path, publishOne);
  }

  return originalPost.call(this, path, ...handlers);
};

console.log("[STABLE PIPELINE] Deterministic exact 5 HeroHero / 2 IG pipeline active.");
