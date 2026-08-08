"use strict";

const Module = require("module");
const originalLoad = Module._load;

const CANONICAL = new Set([
  "Gastronomie",
  "Práce na farmách",
  "Práce s ovocem/zeleninou",
  "Hotelové práce",
  "Sklady a logistika",
  "Výroba",
  "Úklid"
]);

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

function jobText(job) {
  return clean([
    job?.work_category,
    job?.job_category,
    job?.category,
    job?.job_title_cz,
    job?.title_cz,
    job?.job_title,
    job?.title,
    flatten(job?.description),
    flatten(job?.requirements)
  ].join(" ")).toLocaleLowerCase("cs-CZ");
}

function isForbidden(job) {
  const text = jobText(job);
  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(text);
}

function normalizeSupplied(value) {
  const raw = clean(value);
  if (CANONICAL.has(raw)) return raw;
  const lower = raw.toLocaleLowerCase("cs-CZ");

  if (/ovoce|zelenin|sběr|sber|skliz|fruit|vegetable|harvest|picker/.test(lower)) return "Práce s ovocem/zeleninou";
  if (/farm|farma|zeměděl|zemedel|agricultur|greenhouse|skleník|sklenik/.test(lower)) return "Práce na farmách";
  if (/úklid|uklid|clean|housekeep|pokojsk|room attendant/.test(lower)) return "Úklid";
  if (/gastro|kuch|restaurant|restaur|číš|cis|servír|servir|barista|dishwasher|nádob|catering/.test(lower)) return "Gastronomie";
  if (/hotel|resort|hostel|recep/.test(lower)) return "Hotelové práce";
  if (/sklad|warehouse|logisti|balen|packing|packer|order picker|vychyst/.test(lower)) return "Sklady a logistika";
  if (/výrob|vyrob|production|factory|potravin/.test(lower)) return "Výroba";

  return "";
}

function inferCategory(job) {
  const supplied = normalizeSupplied(job?.work_category || job?.job_category || job?.category);
  if (supplied) return supplied;

  const text = jobText(job);
  if (/ovoce|zelenin|sběr|sber|skliz|fruit|vegetable|berry|berries|jahod|jablk|hrozn|harvest|picker/.test(text)) return "Práce s ovocem/zeleninou";
  if (/farm|farma|zeměděl|zemedel|agricultur|greenhouse|skleník|sklenik/.test(text)) return "Práce na farmách";
  if (/úklid|uklid|cleaner|cleaning|housekeep|pokojsk|room attendant/.test(text)) return "Úklid";
  if (/gastro|kuch|restaurant|restaur|číš|cis|servír|servir|barista|dishwasher|nádob|catering/.test(text)) return "Gastronomie";
  if (/hotel|resort|hostel|recep/.test(text)) return "Hotelové práce";
  if (/sklad|warehouse|logisti|balen|packing|packer|order picker|vychyst/.test(text)) return "Sklady a logistika";
  if (/výrob|vyrob|production|factory|potravin/.test(text)) return "Výroba";
  return "";
}

function prepareJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return job;
  if (isForbidden(job)) {
    throw new Error("Zakázaná pozice: montážní dělník / assembly worker.");
  }

  const category = inferCategory(job);
  if (!category) {
    throw new Error(`Nepodařilo se určit HeroHero kategorii pro pozici: ${clean(job.title || job.job_title || job.job_title_cz || "bez názvu")}`);
  }

  return {
    ...job,
    work_category: category,
    job_category: category
  };
}

Module._load = function patchedLoad(request, parent, isMain) {
  const exported = originalLoad.apply(this, arguments);

  if (request === "./publishHeroHero" || /publishHeroHero(?:\.js)?$/.test(request)) {
    if (typeof exported !== "function" || exported.__categoryPatched) return exported;

    const wrapped = async function categoryPatchedPublish(inputJob) {
      return exported(prepareJob(inputJob));
    };
    Object.defineProperty(wrapped, "__categoryPatched", { value: true });
    return wrapped;
  }

  return exported;
};

console.log("[CATEGORY PATCH] HeroHero work category enforcement active.");
