"use strict";

// ============================================================================
// Plně serverová automatizace "SPUST HH+IG" + odpovídání na komentáře / DM.
//
//  POST /daily-run      – volá Make každý den ve 12:00. Najde 5 nových
//                         reálných nabídek (europeanjobdays.eu), vygeneruje
//                         obrázky + 2 reely (/generate), na pozadí publikuje
//                         5 příspěvků na HeroHero a vrátí 2 reely pro Make,
//                         který je zveřejní na Instagramu.
//  GET  /daily-run/status – stav posledního běhu (pro kontrolu).
//  Komentáře pod reely – veřejná odpověď + DM, max 1× na člověka a příspěvek.
//  DM – uvítací zpráva, max 1× za 12 h stejnému člověku.
//
// Stav (už použité nabídky, zodpovězené komentáře, poslední běh) se ukládá
// jako JSON soubor na Cloudinary, takže přežije restart i nový deploy.
// ============================================================================


const SUPPORTED = {
    Austria: "Rakousko", Belgium: "Belgie", Cyprus: "Kypr", Denmark: "Dánsko",
    Estonia: "Estonsko", Finland: "Finsko", France: "Francie", Germany: "Německo",
    Greece: "Řecko", Ireland: "Irsko", Italy: "Itálie", Malta: "Malta",
    Netherlands: "Nizozemsko", Norway: "Norsko", Spain: "Španělsko", Sweden: "Švédsko"
};

const KEYWORDS = [
    "picker", "harvest", "farm", "fruit", "greenhouse", "agriculture",
    "cleaner", "housekeeping", "room attendant",
    "kitchen", "chef", "cook", "dishwasher", "waiter", "bartender",
    "hotel", "receptionist",
    "warehouse", "forklift", "packing", "logistics",
    "production", "factory", "food", "meat"
];

const CATEGORY_HINT = /(pick|harvest|farm|fruit|vegetable|berr|greenhouse|agricult|clean|housekeep|room attendant|maid|kitchen|chef|cook|dishwash|waiter|waitress|bartender|barista|restaurant|hotel|reception|warehouse|forklift|logistic|packing|packer|production|factory|meat|fish|food|bakery|slaughter|butcher)/i;
const EXCLUDE_HINT = /(engineer|nurse|doctor|physician|teacher|developer|programmer|accountant|physio|pharmac|software|scientist|researcher|lawyer|architect|phd|professor|manager|supervisor|technician|mechanic|officer|\blead\b|driver|administrat|coordinator|director|\bhead\b|electrician|plumber)/i;
const NON_LATIN = /[Ͱ-ϿЀ-ӿ]/; // řečtina, azbuka
const OTHER_LANGUAGE = /(german|french|italian|spanish|dutch|swedish|norwegian|danish|finnish|greek|estonian|polish|portuguese|slovak|slovenian|croatian|serbian|bulgarian|hungarian|romanian|lithuanian|latvian|maltese|russian|ukrainian)/i;
const BLOCKED_WORDS = /mont|assembl/i;

const ACCOMMODATION_VALUES = ["Ubytování zdarma", "Ubytování zajištěno", "Ubytování k dispozici", "Pomoc s ubytováním", ""];
const CATEGORIES = ["Práce s ovocem/zeleninou", "Práce na farmách", "Úklid", "Gastronomie", "Hotelové práce", "Sklady", "Továrny"];

const PUBLIC_REPLIES = [
    "Ahoj! 👋 Díky za komentář! Poslali jsme ti víc info do zpráv 📩",
    "Díky za komentář! 😊 Mrkni do zpráv, poslali jsme ti odkaz na aktuální nabídky 📩",
    "Super, že ses ozval/a! 🙌 Podrobnosti máš ve zprávách 📩",
    "Ahoj, děkuju za komentář! 🙂 Víc info najdeš ve zprávách 📩"
];

// Odkazy, které už vyšly před spuštěním této automatizace (ať se neopakují).
const SEED_USED_LINKS = [
    "https://europeanjobdays.eu/en/job/open-application-housekeeper-lapland-winter-season-2026-2027-0",
    "https://europeanjobdays.eu/en/job/open-application-chef-lapland-winter-season-2026-2027-0",
    "https://europeanjobdays.eu/en/job/open-application-waitstaff-lapland-winter-season-2026-2027-0",
    "https://europeanjobdays.eu/en/job/open-application-receptionist-lapland-winter-season-2026-2027-0",
    "https://europeanjobdays.eu/en/job/warehouse-employee",
    "https://europeanjobdays.eu/en/job/meat-cutters-finland",
    "https://europeanjobdays.eu/en/job/slaughterer-finland",
    "https://europeanjobdays.eu/en/job/2x-independent-working-chef-level-i-0",
    "https://europeanjobdays.eu/en/job/pizzachef-and-italian-culinary-interest",
    "https://europeanjobdays.eu/en/job/forklift-driver",
    "https://europeanjobdays.eu/en/job/cookchef-1",
    "https://europeanjobdays.eu/en/job/chef-finland-works-2026"
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (...args) => console.log("[AUTOMATION]", ...args);
const logError = (...args) => console.error("[AUTOMATION]", ...args);

function pragueDate(date = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(date);
}

// ---------------------------------------------------------------------------
// Stav na Cloudinary
// ---------------------------------------------------------------------------

function createStateStore(cloudinary) {
    const PUBLIC_ID = "PracovniTipyAI/state/automation-state.json";
    let cache = null;
    let queue = Promise.resolve();

    async function load() {
        if (cache) return cache;
        try {
            const info = await cloudinary.api.resource(PUBLIC_ID, { resource_type: "raw" });
            const res = await fetch(`${info.secure_url}?t=${Date.now()}`);
            cache = await res.json();
        } catch (err) {
            log("Stav zatím neexistuje, zakládám nový:", err && (err.message || (err.error && err.error.message)));
            cache = {};
        }
        cache.usedLinks = Array.isArray(cache.usedLinks) ? cache.usedLinks : [];
        for (const link of SEED_USED_LINKS) {
            if (!cache.usedLinks.includes(link)) cache.usedLinks.push(link);
        }
        cache.repliedComments = Array.isArray(cache.repliedComments) ? cache.repliedComments : [];
        cache.runs = cache.runs && typeof cache.runs === "object" ? cache.runs : {};
        return cache;
    }

    async function save() {
        const state = await load();
        state.usedLinks = state.usedLinks.slice(-3000);
        state.repliedComments = state.repliedComments.slice(-5000);
        const runDates = Object.keys(state.runs).sort();
        for (const old of runDates.slice(0, Math.max(0, runDates.length - 30))) delete state.runs[old];
        const data = Buffer.from(JSON.stringify(state)).toString("base64");
        await cloudinary.uploader.upload(`data:application/json;base64,${data}`, {
            resource_type: "raw",
            public_id: PUBLIC_ID,
            overwrite: true,
            invalidate: true
        });
    }

    // Všechny změny stavu jdou za sebou, aby se navzájem nepřepsaly.
    function update(mutator) {
        const run = queue.then(async () => {
            const state = await load();
            const result = await mutator(state);
            await save();
            return result;
        });
        queue = run.catch(err => logError("Uložení stavu selhalo:", err.message));
        return run;
    }

    return { load, update };
}

// ---------------------------------------------------------------------------
// Sourcing nabídek z europeanjobdays.eu
// ---------------------------------------------------------------------------

function htmlToText(html) {
    return String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<(br|\/p|\/div|\/li|\/h\d|\/dt|\/dd|\/tr)\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#0?39;/g, "'")
        .replace(/&quot;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
}

async function fetchText(url, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "Mozilla/5.0 (PracovniTipy bot)", "Accept-Language": "en" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

async function mapLimit(items, limit, fn) {
    const results = [];
    let index = 0;
    async function worker() {
        while (index < items.length) {
            const i = index++;
            try {
                results[i] = await fn(items[i], i);
            } catch (err) {
                results[i] = null;
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

function field(text, label) {
    const re = new RegExp(`${label}[^:\\n]*:\\s*\\n?\\s*([^\\n]+)`, "i");
    const m = text.match(re);
    return m ? m[1].trim() : "";
}

function parseJobPage(link, html) {
    const text = htmlToText(html);
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = htmlToText(titleMatch ? titleMatch[1] : "");
    const workplace = field(text, "Workplace");
    const country = Object.keys(SUPPORTED).find(c => workplace.toLowerCase().startsWith(c.toLowerCase())) || "";
    const salaryLabelMatch = text.match(/Salary range\s*(\(([^)]*)\))?\s*:\s*\n?\s*([^\n]+)/i);
    const expiry = field(text, "Date of expiry");
    // "Job offer description" je na stránce 2× (záložka nahoře + skutečný text).
    const first = text.indexOf("Job offer description");
    const second = first >= 0 ? text.indexOf("Job offer description", first + 1) : -1;
    const start = second >= 0 ? second : first;
    const end = text.indexOf("Job details", start + 1);
    const body = text.slice(start >= 0 ? start : 0, end > start ? end : start + 4000).slice(0, 3500);

    return {
        link,
        title,
        country,
        workplace,
        languages: field(text, "Language skills"),
        salaryPeriod: salaryLabelMatch && salaryLabelMatch[2] ? salaryLabelMatch[2] : "",
        salaryText: salaryLabelMatch ? salaryLabelMatch[3].trim() : "",
        expired: /This job (offer )?has (already )?expired/i.test(text),
        expiry,
        body
    };
}

function categoryOf(job) {
    const title = String(job.title || "").toLowerCase();
    const text = `${title} ${String(job.body || "").slice(0, 1500).toLowerCase()}`;
    const rules = [
        ["Práce s ovocem/zeleninou", /(pick|harvest|fruit|vegetable|berr|strawberr|apple|grape)/],
        ["Práce na farmách", /(farm|greenhouse|agricult|horticult|nursery)/],
        ["Úklid", /(clean|housekeep|room attendant|maid)/],
        ["Gastronomie", /(chef|cook|kitchen|dishwash|waiter|waitress|waitstaff|bartender|barman|barista|restaurant|pizza|food service|server)/],
        ["Hotelové práce", /(hotel|reception|hospitality|resort)/],
        ["Sklady", /(warehouse|forklift|logistic|order pick|packing|packer)/],
        ["Továrny", /(factory|production|operator|machine|extrusion|cnc|meat|fish|bakery|butcher|slaughter|manufactur)/]
    ];
    // Nejdřív podle názvu pozice, pak podle celého textu.
    for (const [cat, re] of rules) if (re.test(title)) return cat;
    for (const [cat, re] of rules) if (re.test(text)) return cat;
    return "";
}

function isPreEligible(job) {
    if (!job || !job.title || !job.country || job.expired) return false;
    if (job.expiry) {
        const date = new Date(job.expiry.replace(/^[A-Za-z]+,\s*/, ""));
        if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) return false;
    }
    if (!/english/i.test(job.languages) || OTHER_LANGUAGE.test(job.languages)) return false;
    if (EXCLUDE_HINT.test(job.title) || NON_LATIN.test(job.title)) return false;
    if (!CATEGORY_HINT.test(`${job.title} ${job.body.slice(0, 800)}`)) return false;
    return true;
}

// Stejná nabídka bývá na webu pod více adresami (".../nazev" i ".../nazev-0").
function linkKey(link) {
    return String(link || "").trim().toLowerCase().replace(/\/+$/, "").replace(/-\d+$/, "");
}

// ---------------------------------------------------------------------------
// Druhý zdroj: oficiální vyhledávač EURES (europa.eu) – statisíce nabídek.
// Bereme jen inzeráty v angličtině od zaměstnavatelů, kteří výslovně
// nabírají ze zahraničí (EURES vlajka).
// ---------------------------------------------------------------------------
const EURES_COUNTRY = {
    AT: "Austria", BE: "Belgium", CY: "Cyprus", DK: "Denmark", EE: "Estonia", FI: "Finland",
    FR: "France", DE: "Germany", EL: "Greece", GR: "Greece", IE: "Ireland", IT: "Italy",
    MT: "Malta", NL: "Netherlands", NO: "Norway", ES: "Spain", SE: "Sweden"
};
const EURES_KEYWORDS = [
    "fruit picker", "harvest", "farm worker", "greenhouse",
    "housekeeping", "room attendant", "cleaner",
    "kitchen porter", "kitchen helper", "dishwasher", "waiter", "cook",
    "hotel", "warehouse", "order picker", "forklift", "production operator", "factory worker", "meat"
];

async function sourceEures(usedKeys) {
    const out = [];
    const seen = new Set();
    await mapLimit(EURES_KEYWORDS, 3, async keyword => {
        const body = {
            resultsPerPage: 50, page: 1, sortSearch: "MOST_RECENT",
            keywords: [{ keyword, specificSearchCode: "EVERYWHERE" }],
            publicationPeriod: null, occupationUris: [], skillUris: [], requiredExperienceCodes: [],
            positionScheduleCodes: [], sectorCodes: [], educationAndQualificationLevelCodes: [],
            positionOfferingCodes: [], locationCodes: [], euresFlagCodes: ["WITH"], otherBenefitsCodes: [],
            requiredLanguages: [], minNumberPost: null, sessionId: `pt${Date.now()}`
        };
        const res = await fetch("https://europa.eu/eures/api/jv-searchengine/public/jv-search/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0 (PracovniTipy bot)" },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`EURES HTTP ${res.status}`);
        const data = await res.json();
        for (const jv of data.jvs || []) {
            if (!jv || !jv.id || seen.has(jv.id)) continue;
            seen.add(jv.id);
            const langs = jv.availableLanguages || [];
            const en = (jv.translations && jv.translations.en) || (langs[0] === "en" ? jv : null);
            if (!en || langs[0] !== "en") continue; // jen originální anglické inzeráty
            const code = Object.keys(jv.locationMap || {})[0];
            const country = EURES_COUNTRY[code];
            if (!country) continue;
            const link = `https://europa.eu/eures/portal/jv-se/jv-details/${jv.id}?lang=en`;
            if (usedKeys.has(linkKey(link))) continue;
            out.push({
                link, source: "eures",
                title: htmlToText(en.title || jv.title),
                country, workplace: country,
                languages: "English",
                salaryPeriod: "", salaryText: "",
                expired: false, expiry: "",
                body: htmlToText(`${(jv.employer && jv.employer.name) || ""}\n${en.description || jv.description || ""}`).slice(0, 3500)
            });
        }
    });
    return out;
}

async function sourceCandidates(usedLinks) {
    const usedKeys = new Set(usedLinks.map(linkKey));
    const used = { has: link => usedKeys.has(linkKey(link)) };
    const lists = await mapLimit(KEYWORDS, 4, async keyword => {
        const url = `https://europeanjobdays.eu/en/jobs?field_job_status_value=Active&keywords=${encodeURIComponent(keyword)}`;
        const html = await fetchText(url);
        return [...html.matchAll(/href="(https:\/\/europeanjobdays\.eu\/en\/job\/[^"?#]+)"/g)].map(m => m[1]);
    });
    const seenKeys = new Set();
    const links = [...new Set(lists.filter(Boolean).flat())].filter(link => {
        const key = linkKey(link);
        if (used.has(link) || seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
    });
    log(`Nalezeno ${links.length} nových odkazů na nabídky.`);

    const pages = await mapLimit(links.slice(0, 120), 6, async link => parseJobPage(link, await fetchText(link)));
    const eligible = pages.filter(isPreEligible);
    log(`Po předfiltru (země, jen angličtina, kategorie, platnost): ${eligible.length}.`);

    let eures = [];
    try {
        eures = (await sourceEures(usedKeys)).filter(isPreEligible);
        log(`EURES: ${eures.length} vhodných kandidátů po předfiltru.`);
    } catch (err) {
        logError("EURES zdroj selhal:", err.message);
    }
    // EURES střídáme po zemích (jinak převáží Irsko a limit 2/zemi nedá 5 nabídek).
    const byCountry = {};
    for (const job of eures) (byCountry[job.country] = byCountry[job.country] || []).push(job);
    const mixed = [];
    for (let round = 0; mixed.length < eures.length; round++) {
        for (const list of Object.values(byCountry)) if (list[round]) mixed.push(list[round]);
    }
    // Nejdřív European Job Days (mají mzdy), pak EURES; celkem max 36 pro AI.
    return [...eligible, ...mixed].slice(0, 36);
}

// ---------------------------------------------------------------------------
// AI: vyhodnocení a české texty (jen fakta z inzerátu)
// ---------------------------------------------------------------------------

async function enrichWithAI(candidates) {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const system = `Jsi editor účtu "Pracovní tipy" (nabídky práce v zahraničí pro Čechy bez vysoké školy).
Dostaneš JEDNU nabídku. Piš česky, krátce, POUZE fakta z inzerátu, nic si nevymýšlej.
required_languages: seznam jazyků, které inzerát VÝSLOVNĚ vyžaduje (např. ["English"] nebo ["English","Finnish"]); když žádný neuvádí, dej [].
requires_degree_or_license: true jen když inzerát výslovně vyžaduje vysokou školu nebo úřední licenci/průkaz (např. řidičský průkaz C, licence A&P, diplom zdravotní sestry). Praxe ani zkušenost NENÍ licence.
title_cz: max 32 znaků, název pozice česky (např. "Kuchař/ka", "Pokojská", "Skladník", "Sběr jahod"), BEZ názvu země a firmy.
city: město/region z inzerátu (nebo "").
accommodation: přesně jedna z hodnot ${JSON.stringify(ACCOMMODATION_VALUES)} podle inzerátu ("" když se o bydlení nepíše; "Ubytování zajištěno" jen když ho zaměstnavatel opravdu zajišťuje).
no_experience: true jen když inzerát výslovně říká, že praxe není nutná.
description_cz: přesně 3 krátké věty (náplň práce; požadavky; benefity/podmínky).
hook_cz: 1 krátká lákavá věta pro Instagram (fakta, např. ubytování zdarma, bez praxe).
salary: {amount: číslo (střed rozpětí) nebo null, currency: "EUR"/"SEK"/"NOK"/"DKK"/..., period: "hour"|"week"|"biweek"|"month"|"year", net: true/false}. Pozor: když je "měsíční" částka v desítkách tisíc EUR, jde nejspíš o roční mzdu → period "year". Hodinovou sazbu poznáš podle výše (např. 13-19 EUR).
Odpověz JEN tímto JSON objektem (žádný jiný text): {"required_languages":["English"],"requires_degree_or_license":false,"title_cz":"...","city":"...","accommodation":"...","no_experience":false,"description_cz":["..","..",".."],"hook_cz":"...","salary":{"amount":null,"currency":"EUR","period":"month","net":false}}`;

    // Jedno krátké volání na nabídku (omezený výstup + časový limit), přes
    // vestavěný fetch. Hromadné volání generovalo obří odpověď a padalo.
    async function analyze(job) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 60000);
            try {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    signal: controller.signal,
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
                    },
                    body: JSON.stringify({
                        model,
                        temperature: 0.2,
                        max_tokens: 700,
                        response_format: { type: "json_object" },
                        messages: [
                            { role: "system", content: system },
                            {
                                role: "user",
                                content: JSON.stringify({
                                    title: job.title,
                                    workplace: job.workplace,
                                    languages: job.languages,
                                    salary: `${job.salaryPeriod} ${job.salaryText}`.trim(),
                                    text: job.body.slice(0, 2500)
                                })
                            }
                        ]
                    })
                });
                const raw = await res.text();
                if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${raw.slice(0, 200)}`);
                const data = JSON.parse(raw);
                return JSON.parse(data.choices[0].message.content);
            } catch (err) {
                logError(`AI pro "${job.title}" pokus ${attempt}/2 selhal:`, err.message);
                await sleep(3000);
            } finally {
                clearTimeout(timer);
            }
        }
        return null;
    }

    const list = candidates.slice(0, 36);
    const results = await mapLimit(list, 4, analyze);
    const out = list.map((job, i) => ({ job, ai: results[i] })).filter(x => x.ai).map(({ job, ai }) => {
        // Kategorii určujeme sami podle klíčových slov (spolehlivější než AI),
        // AI jen hlídá jazyk a požadavek na VŠ/licenci.
        const category = categoryOf(job);
        ai.category = category;
        const yes = v => v === true || String(v).toLowerCase() === "true";
        const langs = Array.isArray(ai.required_languages) ? ai.required_languages : [];
        ai.requires_other_language = langs.some(l => !/^\s*(english|angličtina|anglictina|en)\s*$/i.test(String(l)));
        ai.blockLang = ai.requires_other_language;
        ai.blockLicense = yes(ai.requires_degree_or_license);
        ai.no_experience = yes(ai.no_experience);
        // Jazyk už hlídá předfiltr (pole "Language skills" = jen angličtina).
        ai.eligible = !!category && !ai.blockLicense && !(job.source === "eures" && ai.blockLang);
        return { job, ai };
    });
    log(`AI vyhodnotila ${out.length} nabídek, vhodných: ${out.filter(x => x.ai.eligible).length}.`);
    return out;
}

async function czkRates() {
    try {
        const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=CZK,SEK,NOK,DKK,PLN,GBP,CHF");
        const data = await res.json();
        const czk = data.rates.CZK;
        const rates = { EUR: czk, CZK: 1 };
        for (const [cur, value] of Object.entries(data.rates)) if (cur !== "CZK") rates[cur] = czk / value;
        return rates;
    } catch (err) {
        logError("Kurzy se nepodařilo načíst, používám zálohu:", err.message);
        return { EUR: 24.5, SEK: 2.15, NOK: 2.1, DKK: 3.28, PLN: 5.7, GBP: 29, CHF: 27.5, CZK: 1 };
    }
}

function monthlyCzk(salary, rates) {
    if (!salary || typeof salary.amount !== "number" || !(salary.amount > 0)) return "";
    const rate = rates[String(salary.currency || "").toUpperCase()];
    if (!rate) return "";
    const factor = { hour: 165, week: 4.33, biweek: 2.17, month: 1, year: 1 / 12 }[salary.period] || 0;
    if (!factor) return "";
    const value = Math.round((salary.amount * factor * rate) / 1000) * 1000;
    if (value < 20000 || value > 250000) return "";
    return `${value.toLocaleString("cs-CZ")} Kč ${salary.net ? "čistého" : "hrubého"}`;
}

function buildJobs(enriched, rates, limit = 5, existingCountries = []) {
    const priority = { "Práce s ovocem/zeleninou": 3, "Práce na farmách": 3 };
    const usable = enriched
        .filter(({ ai }) => ai.eligible && CATEGORIES.includes(ai.category))
        .map(({ job, ai }) => {
            const countryCz = SUPPORTED[job.country];
            const salary = monthlyCzk(ai.salary, rates);
            const accommodation = ACCOMMODATION_VALUES.includes(ai.accommodation) ? ai.accommodation : "";
            const title = String(ai.title_cz || "").trim().slice(0, 40);
            // Pojistka proti nepravdě: "bez praxe" jen když to inzerát opravdu říká.
            const noExpRe = /,?\s*(i\s+)?bez (praxe|zkušeností|předchozích zkušeností)!?/gi;
            const clean = s => (ai.no_experience ? String(s) : String(s).replace(noExpRe, "")).trim();
            ai.hook_cz = clean(ai.hook_cz || "");
            const description = (Array.isArray(ai.description_cz) ? ai.description_cz : []).map(clean).filter(Boolean).slice(0, 3);
            const emoji = { "Práce s ovocem/zeleninou": "🍓", "Práce na farmách": "🚜", "Úklid": "🧹", "Gastronomie": "👨‍🍳", "Hotelové práce": "🏨", "Sklady": "📦", "Továrny": "🏭" }[ai.category] || "💼";
            const caption = [
                `${emoji} ${title} – ${countryCz}${salary ? ` – cca ${salary} / měsíc` : ""}`,
                "",
                String(ai.hook_cz || "").trim(),
                "",
                `Pro více prací ze zahraničí napiš do komentáře "${countryCz}".`
            ].join("\n").replace(/\n\n\n+/g, "\n\n");
            return {
                score: (priority[ai.category] || 1) + (ai.no_experience ? 0.5 : 0) + (salary ? 0.3 : 0) + (accommodation ? 0.3 : 0),
                job: {
                    job_title: title,
                    herohero_title: title,
                    country: job.country,
                    country_code: job.country,
                    city: String(ai.city || "").trim(),
                    location: `${String(ai.city || "").trim() ? `${String(ai.city).trim()}, ` : ""}${countryCz}`,
                    language: "English",
                    accommodation,
                    salary_czk_month: salary,
                    work_category: ai.category,
                    link: job.link,
                    description,
                    caption
                }
            };
        })
        .filter(({ job }) => job.job_title && job.description.length > 0 && !BLOCKED_WORDS.test(`${job.job_title} ${job.description.join(" ")} ${job.city}`))
        .sort((a, b) => b.score - a.score);

    const perCountry = {};
    for (const c of existingCountries) perCountry[c] = (perCountry[c] || 0) + 1;
    const picked = [];
    for (const { job } of usable) {
        if ((perCountry[job.country] || 0) >= 2) continue;
        perCountry[job.country] = (perCountry[job.country] || 0) + 1;
        picked.push(job);
        if (picked.length >= limit) break;
    }
    return picked;
}

// ---------------------------------------------------------------------------
// Denní běh
// ---------------------------------------------------------------------------

function setupAutomation(app, deps) {
    const {
        cloudinary, PORT, IG_BUSINESS_ID,
        postPublicCommentReply, sendInstagramMessage,
        COMMENT_PRIVATE_REPLY_MESSAGE, DM_WELCOME_MESSAGE
    } = deps;
    const store = createStateStore(cloudinary);
    const local = path => `http://127.0.0.1:${PORT}${path}`;
    let running = null;

    async function postLocal(path, body) {
        const res = await fetch(local(path), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        return { status: res.status, data };
    }

    async function publishHeroHeroBatch(date) {
        let failures = 0;
        for (let i = 0; i < 12; i++) {
            const { status, data } = await postLocal("/publishHeroHero", {});
            if (status === 422) break;
            if (status === 200 && data.success) {
                failures = 0;
                const job = data.result && data.result.job;
                const skipped = data.result && data.result.skipped;
                log(`HeroHero ${skipped ? "PŘESKOČENO" : "publikováno"} (${data.batchProgress}): ${data.title}`);
                await store.update(state => {
                    const run = state.runs[date] || (state.runs[date] = {});
                    run.herohero = run.herohero || [];
                    run.herohero.push({ title: data.title, skipped: !!skipped, at: new Date().toISOString() });
                    if (job && job.link && !state.usedLinks.includes(job.link)) state.usedLinks.push(job.link);
                });
                continue;
            }
            failures++;
            logError(`HeroHero publikace selhala (${failures}/3):`, (data && data.error) || status);
            if (failures >= 3) break;
            await sleep(20000);
        }
        await store.update(state => {
            const run = state.runs[date] || (state.runs[date] = {});
            run.heroheroFinishedAt = new Date().toISOString();
        });
    }

    async function dailyRun(force) {
        const date = pragueDate();
        const state = await store.load();
        const previous = state.runs[date];
        // Doplnění: když dnešní běh na HeroHero nedal 5 příspěvků (málo nabídek
        // nebo chyba publikace), další běh dohledá / znovu pošle zbytek.
        const doneTitles = new Set(((previous && previous.herohero) || []).map(h => h.title));
        const carryover = ((previous && previous.jobs) || []).filter(j => !doneTitles.has(j.job_title));
        const topUp = !!(previous && previous.instagram && doneTitles.size < 5);
        if (previous && previous.instagram && !force && !topUp) {
            log(`Dnešní běh (${date}) už proběhl, vracím uložený výsledek.`);
            return { success: true, alreadyRan: true, date, ...previous };
        }

        if (topUp && !previous.heroheroFinishedAt) {
            throw new Error("HeroHero dávka z dnešního běhu ještě běží, doplnění zkusím později.");
        }
        const limit = topUp ? Math.max(0, 5 - doneTitles.size - carryover.length) : 5;
        log(topUp ? `Doplňuji dnešní běh ${date}: ${carryover.length} k opakování, hledám ještě ${limit} nových.` : `Startuji denní běh ${date}.`);
        let candidates = [];
        let review = [];
        let fresh = [];
        if (limit > 0) {
            candidates = await sourceCandidates(state.usedLinks);
            if (candidates.length === 0 && !carryover.length) throw new Error("Nenašla se žádná vhodná aktivní nabídka.");
            const enriched = candidates.length ? await enrichWithAI(candidates) : [];
            review = enriched.map(({ job, ai }) => ({
                title: job.title, country: job.country, eligible: !!ai.eligible, category: ai.category, title_cz: ai.title_cz,
                lang: ai.requires_other_language, lic: ai.requires_degree_or_license
            }));
            log("AI posouzení:", JSON.stringify(review));
            const prevCountries = topUp ? ((previous.selected || []).map(j => j.country)) : [];
            fresh = buildJobs(enriched, await czkRates(), limit, prevCountries);
        }
        const jobs = [...(topUp ? carryover : []), ...fresh];
        log(`Vybráno ${jobs.length} nabídek:`, jobs.map(j => `${j.job_title} (${j.country})`).join(" | "));
        if (jobs.length === 0) throw new Error("AI nevyhodnotila žádnou nabídku jako vhodnou.");

        const { status, data } = await postLocal("/generate", { jobs, reels: [] });
        if (status !== 200 || !data.success) throw new Error(`/generate selhal: ${status} ${data && data.error}`);
        const herohero = data.herohero || [];
        const instagram = (data.instagram || [])
            .filter(r => r.videoUrl && r.link)
            .map(r => ({ link: r.link, caption: r.caption, videoUrl: r.videoUrl, title: r.title || r.job_title }));
        log(`/generate: HeroHero ${herohero.length}, Instagram ${instagram.length}.`);

        await store.update(s => {
            for (const job of jobs) if (!s.usedLinks.includes(job.link)) s.usedLinks.push(job.link);
            const selected = (topUp ? fresh : jobs).map(j => ({ title: j.job_title, country: j.country, category: j.work_category, link: j.link }));
            const prev = s.runs[date];
            if (topUp && prev) {
                const prevIg = prev.instagram || [];
                prev.selected = [...(prev.selected || []), ...selected];
                prev.jobs = [...carryover, ...fresh];
                prev.heroheroQueued = (prev.heroheroQueued || 0) + herohero.length;
                prev.instagram = prevIg.length >= 2 ? prevIg : [...prevIg, ...instagram].slice(0, 2);
                prev.review = review;
                prev.candidates = candidates.length;
                prev.toppedUpAt = new Date().toISOString();
                delete prev.heroheroFinishedAt;
            } else {
                s.runs[date] = {
                    startedAt: new Date().toISOString(),
                    candidates: candidates.length,
                    review,
                    selected,
                    jobs,
                    heroheroQueued: herohero.length,
                    instagram
                };
            }
        });

        // HeroHero trvá ~3 min na příspěvek, proto běží na pozadí.
        publishHeroHeroBatch(date).catch(err => logError("HeroHero dávka spadla:", err.message));

        const saved = (await store.load()).runs[date] || {};
        return { success: true, date, topUp, selected: (saved.selected || []).map(j => `${j.title} (${j.country})`), heroheroQueued: herohero.length, instagram: saved.instagram || instagram };
    }

    // Vlastní plánovač na serveru: každých 5 minut zkontroluje, jestli je po
    // 12:00 (Praha) a dnešní běh ještě neproběhl. Nezávisí na tom, jestli je
    // zapnutý počítač nebo aplikace Claude. Max 3 pokusy denně.
    const attempts = {};
    async function schedulerTick() {
        try {
            const now = new Date();
            const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hour12: false }).format(now));
            if (hour < 12) return;
            const date = pragueDate(now);
            const state = await store.load();
            const today = state.runs[date];
            const doneCount = today ? new Set((today.herohero || []).map(h => h.title)).size : 0;
            if (today && today.instagram && (doneCount >= 5 || !today.heroheroFinishedAt)) return;
            if ((attempts[date] || 0) >= 3) return;
            attempts[date] = (attempts[date] || 0) + 1;
            log(`Plánovač: spouštím denní běh ${date} (pokus ${attempts[date]}/3).`);
            if (!running) running = dailyRun(false).finally(() => { running = null; });
            await running;
        } catch (err) {
            logError("Plánovač: denní běh selhal:", err.message);
        }
    }
    setTimeout(schedulerTick, 60 * 1000);
    setInterval(schedulerTick, 5 * 60 * 1000);

    app.post("/daily-run", async (req, res) => {
        const force = req.query.force === "1";
        try {
            if (!running) running = dailyRun(force).finally(() => { running = null; });
            const result = await running;
            res.json(result);
        } catch (err) {
            logError("Denní běh selhal:", err.stack || err.message);
            res.status(500).json({ success: false, error: err.message, instagram: [] });
        }
    });

    app.get("/daily-run/status", async (req, res) => {
        const state = await store.load();
        const dates = Object.keys(state.runs).sort().slice(-5);
        res.json({
            usedLinks: state.usedLinks.length,
            repliedComments: state.repliedComments.length,
            runs: Object.fromEntries(dates.map(d => [d, {
                candidates: state.runs[d].candidates,
                review: state.runs[d].review,
                selected: state.runs[d].selected,
                instagram: (state.runs[d].instagram || []).map(r => r.title || r.link),
                herohero: state.runs[d].herohero,
                heroheroFinishedAt: state.runs[d].heroheroFinishedAt
            }]))
        });
    });

    // -----------------------------------------------------------------------
    // Komentáře a DM
    // -----------------------------------------------------------------------

    const lastWelcome = new Map();

    async function handleComment(value) {
        const commentId = value && value.id;
        const fromId = value && value.from && value.from.id;
        const username = (value && value.from && value.from.username) || "?";
        const mediaId = (value && value.media && value.media.id) || "nomedia";
        const text = String((value && value.text) || "");
        log(`Komentář ${commentId} od @${username} pod ${mediaId}: "${text.slice(0, 80)}"`);

        if (!commentId || !fromId) return log("Komentář bez id/autora, přeskakuji.");
        if (fromId === IG_BUSINESS_ID) return log("Vlastní komentář, přeskakuji.");
        if (value.parent_id) return log("Odpověď v podvlákně, přeskakuji.");

        const key = `${mediaId}:${fromId}`;
        const isNew = await store.update(state => {
            if (state.repliedComments.includes(key)) return false;
            state.repliedComments.push(key);
            return true;
        });
        if (!isNew) return log(`@${username} už pod tímto příspěvkem odpověď dostal/a, přeskakuji.`);

        await sleep(5000 + Math.floor(Math.random() * 15000));
        await postPublicCommentReply(commentId, PUBLIC_REPLIES[Math.floor(Math.random() * PUBLIC_REPLIES.length)]);
        await sendInstagramMessage({ comment_id: commentId }, COMMENT_PRIVATE_REPLY_MESSAGE);
        log(`Komentář ${commentId}: veřejná odpověď + DM odeslány (detail výše).`);
    }

    async function handleMessaging(event) {
        const senderId = event.sender && event.sender.id;
        const kind = Object.keys(event).filter(k => !["sender", "recipient", "timestamp"].includes(k)).join(",");
        log(`DM událost od ${senderId}: ${kind}${event.message && event.message.is_echo ? " (echo)" : ""}`);
        if (!event.message || event.message.is_echo) return;
        if (!senderId || senderId === IG_BUSINESS_ID) return;
        const last = lastWelcome.get(senderId) || 0;
        if (Date.now() - last < 12 * 60 * 60 * 1000) return log("Uvítací DM už tomuto člověku odešla v posledních 12 h.");
        lastWelcome.set(senderId, Date.now());
        await sendInstagramMessage({ id: senderId }, DM_WELCOME_MESSAGE);
    }

    function handleWebhook(body) {
        if (!body || body.object !== "instagram") {
            log("Webhook s neznámým objektem:", body && body.object);
            return;
        }
        for (const entry of body.entry || []) {
            for (const event of entry.messaging || []) {
                handleMessaging(event).catch(err => logError("DM chyba:", err.message));
            }
            for (const change of entry.changes || []) {
                if (change.field === "comments") {
                    handleComment(change.value || {}).catch(err => logError("Komentář chyba:", err.message));
                } else {
                    log("Webhook změna:", change.field);
                }
            }
        }
    }

    return { handleWebhook };
}

module.exports = setupAutomation;
