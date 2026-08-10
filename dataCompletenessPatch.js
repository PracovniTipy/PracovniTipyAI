"use strict";

const Module = require("module");
const fs = require("fs");
const path = require("path");
const originalJsLoader = Module._extensions[".js"];

Module._extensions[".js"] = function dataCompletenessLoader(module, filename) {
  if (path.basename(filename) !== "stablePipelinePatch.js") {
    return originalJsLoader(module, filename);
  }

  let source = fs.readFileSync(filename, "utf8");

  const helpers = String.raw`function validCityOf(job) {
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
  const fields = [job?.salary_czk_month, job?.monthly_salary_czk, job?.salary_month_czk, job?.salary_monthly_czk];
  for (const value of fields) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(Math.round(value)) + " Kč / měsíc";
    const text = clean(value);
    if (!text) continue;
    if (/^\d[\d .]*(?:,\d+)?$/.test(text)) return text + " Kč / měsíc";
    if (/(?:kč|czk)/i.test(text)) return text;
  }
  const salary = clean(job?.salary);
  if (salary && /(?:kč|czk)/i.test(salary) && /(?:měs(?:íc|íčně)?|month(?:ly)?)/i.test(salary)) return salary;
  return "";
}
`;

  const insertBefore = "function safeJob(job, requireLink = false) {";
  if (!source.includes(insertBefore)) {
    console.warn("[DATA COMPLETENESS] safeJob marker not found.");
    return module._compile(source, filename);
  }
  source = source.replace(insertBefore, helpers + "\n" + insertBefore);

  const oldSafe = String.raw`function safeJob(job, requireLink = false) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  if (!titleOf(job) || !countryOf(job) || forbiddenJob(job)) return false;
  if (!languageDecision(job).allowed) return false;
  if (requireLink && !linkOf(job)) return false;
  return true;
}`;

  const newSafe = String.raw`function safeJob(job, requireLink = false) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return false;
  if (!titleOf(job) || !countryOf(job) || forbiddenJob(job)) return false;
  if (!monthlySalaryOf(job)) return false;
  if (!languageDecision(job).allowed) return false;
  if (requireLink && !linkOf(job)) return false;
  return true;
}`;

  if (source.includes(oldSafe)) source = source.replace(oldSafe, newSafe);
  else console.warn("[DATA COMPLETENESS] exact safeJob source not found.");

  const oldDebug = "              missingLinks: normalizedJobs.filter(job => !linkOf(job)).map(titleOf).slice(0, 10)";
  const newDebug = oldDebug + ",\n              missingCities: allJobs.filter(job => !validCityOf(job)).map(titleOf).filter(Boolean).slice(0, 10),\n              missingSalaries: allJobs.filter(job => !monthlySalaryOf(job)).map(titleOf).filter(Boolean).slice(0, 10)";
  if (source.includes(oldDebug)) source = source.replace(oldDebug, newDebug);

  console.log("[DATA COMPLETENESS] Required country + monthly CZK salary active; city optional.");
  module._compile(source, filename);
};
