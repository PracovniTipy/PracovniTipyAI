"use strict";

const Module = require("module");
const fs = require("fs");
const path = require("path");
const originalLoad = Module._load;
const originalJsLoader = Module._extensions[".js"];

const CANONICAL = new Set([
  "Gastronomie",
  "Práce na farmách",
  "Práce s ovocem/zeleninou",
  "Hotelové práce",
  "Sklady",
  "Továrny",
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
  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|montáž\w*\s+(?:výrob|stroj|součást|soucast|auto)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(text);
}

function normalizeSupplied(value) {
  const raw = clean(value);
  if (CANONICAL.has(raw)) return raw;
  const lower = raw.toLocaleLowerCase("cs-CZ");

  if (/ovoce|zelenin|sběr|sber|skliz|fruit|vegetable|harvest|picker|jahod|borůvk|boruvk|jablk|hrozn|malin|ostruž|ostruz|třešn|tresn|hrušk|hrusk|broskv|meruň|merun|švest|svest|rybíz|rybiz|angrešt|angrest|brusink|citrus|meloun|kiwi/.test(lower)) return "Práce s ovocem/zeleninou";
  if (/farm|farma|zeměděl|zemedel|agricultur|greenhouse|skleník|sklenik|květin|kvetin|flower|horticultur|nursery|vinic|vineyard|orchard|sad(?:u|y)?/.test(lower)) return "Práce na farmách";
  if (/úklid|uklid|clean|housekeep|pokojsk|room attendant|maid|janitor/.test(lower)) return "Úklid";
  if (/gastro|kuch|restaurant|restaur|číš|cis|servír|servir|barista|dishwasher|nádob|nadob|catering|waiter|waitress/.test(lower)) return "Gastronomie";
  if (/hotel|resort|hostel|recep|guest service/.test(lower)) return "Hotelové práce";
  if (/sklad|warehouse|logisti|balen|packing|packer|order picker|vychyst|expedic|zásil|zasil/.test(lower)) return "Sklady";
  if (/ryb|fish|seafood|potravin|food processing|food factory|factory|továr|tovar|pekár|pekar|mlékár|mlekar|maso|meat|production/.test(lower)) return "Továrny";
  return "";
}

function inferCategory(job) {
  const supplied = normalizeSupplied(job?.work_category || job?.job_category || job?.category);
  if (supplied) return supplied;
  return normalizeSupplied(jobText(job));
}

function prepareJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return job;
  if (isForbidden(job)) {
    throw new Error("Zakázaná pozice: montážní dělník / assembly worker.");
  }

  const category = inferCategory(job);
  if (!category) {
    throw new Error(`Pozice mimo podporovane kategorie, preskakuji: ${job?.job_title || job?.title || "?"}`);
  }

  return {
    ...job,
    category,
    work_category: category,
    job_category: category,
    herohero_work_category: category
  };
}

// publishHeroHero.js dříve dovolil pokračovat i tehdy, když se kategorie na
// HeroHero ve skutečnosti neklikla. Při načtení souboru upravíme pouze tuto
// část publisheru: typ práce zkusí otevřít až 3x a před náhledem musí být
// potvrzena jak země, tak pracovní kategorie.
Module._extensions[".js"] = function categoryAwareJsLoader(module, filename) {
  if (!filename.endsWith(`${path.sep}publishHeroHero.js`)) {
    return originalJsLoader(module, filename);
  }

  let source = fs.readFileSync(filename, "utf8");

  const oldWorkPicker = `  const opener = page.getByText("Přidat kategorii", { exact: true }).or(page.getByText("Add category", { exact: true })).first();\n  if (await opener.isVisible().catch(() => false)) await opener.click({ timeout: 10000 }).catch(() => {});\n  await page.waitForTimeout(500);\n  const matches = page.getByText(label, { exact: true });\n  for (let i = 0; i < await matches.count(); i++) {\n    const match = matches.nth(i);\n    if (await match.isVisible().catch(() => false)) { await match.click({ timeout: 10000 }); logStep(\`Kategorie práce vybrána: \${label}\`); return true; }\n  }\n  logStep(\`Kategorie práce nebyla dostupná: \${label}\`);\n  return false;`;

  const newWorkPicker = `  for (let attempt = 1; attempt <= 3; attempt++) {\n    logStep(\`Výběr kategorie práce \${label}, pokus \${attempt}/3\`);\n    const openers = page.getByText("Přidat kategorii", { exact: true }).or(page.getByText("Add category", { exact: true }));\n    for (let i = 0; i < await openers.count(); i++) {\n      const opener = openers.nth(i);\n      if (await opener.isVisible().catch(() => false)) {\n        await opener.click({ timeout: 10000, force: true }).catch(() => {});\n        await page.waitForTimeout(800);\n        break;\n      }\n    }\n\n    const matches = page.getByText(label, { exact: true });\n    for (let i = 0; i < await matches.count(); i++) {\n      const match = matches.nth(i);\n      if (await match.isVisible().catch(() => false)) {\n        await match.click({ timeout: 10000, force: true });\n        await page.waitForTimeout(800);\n        await page.keyboard.press("Escape").catch(() => {});\n        logStep(\`Kategorie práce vybrána: \${label}\`);\n        return true;\n      }\n    }\n\n    await page.keyboard.press("Escape").catch(() => {});\n    await page.waitForTimeout(700);\n  }\n  logStep(\`Kategorie práce nebyla dostupná ani po 3 pokusech: \${label}\`);\n  return false;`;

  if (source.includes(oldWorkPicker)) {
    source = source.replace(oldWorkPicker, newWorkPicker);
  } else {
    console.warn("[CATEGORY PATCH] Work-category picker source pattern nebyl nalezen.");
  }

  const oldCalls = `  await selectCountryCategory(page, job);\n  await selectWorkCategory(page, job);`;
  const newCalls = `  const countryCategorySelected = await selectCountryCategory(page, job);\n  const workCategorySelected = await selectWorkCategory(page, job);\n  logStep(\`HeroHero kategorie (nepovinné): země=\${countryCategorySelected}, práce=\${workCategorySelected}\`);`;

  if (source.includes(oldCalls)) {
    source = source.replace(oldCalls, newCalls);
  } else {
    console.warn("[CATEGORY PATCH] Required-category source pattern nebyl nalezen.");
  }

  module._compile(source, filename);
};

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

console.log("[CATEGORY PATCH] Required HeroHero country + work categories with retry active.");
