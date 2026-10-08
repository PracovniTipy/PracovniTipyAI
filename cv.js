"use strict";

// ============================================================================
// AI generátor životopisu (lákadlo zdarma)
//
//  GET  /cv            – stránka: formulář (jméno, věk, telefon, e-mail,
//                        souhlas) → chat s AI → stažení CV (CZ + EN v PDF).
//  POST /cv/lead       – uloží kontakt, vrátí sessionId.
//  POST /cv/chat       – AI se doptává na praxi (umí dopočítat roky z věku).
//  POST /cv/generate   – vytvoří CV v češtině a angličtině (PDF na Cloudinary),
//                        pošle kontakt + odkazy do Make (env MAKE_LEAD_WEBHOOK),
//                        Make je uloží a pošle e-mail.
//
// Kontakty se navíc zálohují na Cloudinary (PracovniTipyAI/state/cv-leads.json),
// aby se nic neztratilo, ani když Make zrovna neběží.
// ============================================================================

const crypto = require("crypto");
const { TEMPLATES, renderCv, SAMPLE } = require("./cvTemplates");

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const HEROHERO_LINK = "https://herohero.co/devotedzxfepftuubeim";
const log = (...a) => console.log("[CV]", ...a);
const logError = (...a) => console.error("[CV]", ...a);

function currentYear() {
    return Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Prague", year: "numeric" }).format(new Date()));
}

async function openai(messages, { maxTokens = 400, json = false } = {}) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        try {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                signal: controller.signal,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                body: JSON.stringify({
                    model: MODEL,
                    temperature: 0.3,
                    max_tokens: maxTokens,
                    ...(json ? { response_format: { type: "json_object" } } : {}),
                    messages
                })
            });
            const raw = await res.text();
            if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${raw.slice(0, 200)}`);
            return JSON.parse(raw).choices[0].message.content || "";
        } catch (err) {
            logError(`OpenAI pokus ${attempt}/2:`, err.message);
            if (attempt === 2) throw err;
        } finally {
            clearTimeout(timer);
        }
    }
    return "";
}

function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

function cvHtml(cv, lang) {
    const L = lang === "en"
        ? { profile: "Profile", exp: "Work experience", edu: "Education", langs: "Languages", skills: "Skills", contact: "Contact", age: "Age", years: "years" }
        : { profile: "Profil", exp: "Pracovní zkušenosti", edu: "Vzdělání", langs: "Jazyky", skills: "Dovednosti", contact: "Kontakt", age: "Věk", years: "let" };
    const list = arr => (Array.isArray(arr) ? arr : []).filter(Boolean);
    const exp = list(cv.experience).map(e => `
        <div class="item">
          <div class="row"><b>${esc(e.title)}</b><span>${esc(e.period)}</span></div>
          <div class="sub">${esc([e.employer, e.place].filter(Boolean).join(", "))}</div>
          <ul>${list(e.bullets).map(b => `<li>${esc(b)}</li>`).join("")}</ul>
        </div>`).join("");
    const edu = list(cv.education).map(e => `
        <div class="item"><div class="row"><b>${esc(e.title)}</b><span>${esc(e.period)}</span></div>
        <div class="sub">${esc(e.school)}</div></div>`).join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;font-size:12px}
      .head{background:#1f3a5f;color:#fff;padding:28px 36px}
      .head h1{margin:0;font-size:26px}.head p{margin:6px 0 0;font-size:12px;opacity:.9}
      .body{padding:20px 36px}
      h2{font-size:14px;color:#1f3a5f;border-bottom:2px solid #1f3a5f;padding-bottom:3px;margin:18px 0 8px;text-transform:uppercase}
      .item{margin-bottom:10px}.row{display:flex;justify-content:space-between}.row span{color:#555}
      .sub{color:#555;margin:2px 0}ul{margin:4px 0 0 18px;padding:0}li{margin:2px 0}
      .tags span{display:inline-block;background:#eef2f7;border-radius:10px;padding:3px 9px;margin:0 6px 6px 0}
    </style></head><body>
      <div class="head"><h1>${esc(cv.name)}</h1>
        <p>${esc(cv.headline || "")}</p>
        <p>${esc(cv.phone)} · ${esc(cv.email)}${cv.age ? ` · ${L.age}: ${esc(cv.age)} ${L.years}` : ""}</p></div>
      <div class="body">
        ${cv.summary ? `<h2>${L.profile}</h2><p>${esc(cv.summary)}</p>` : ""}
        ${exp ? `<h2>${L.exp}</h2>${exp}` : ""}
        ${edu ? `<h2>${L.edu}</h2>${edu}` : ""}
        ${list(cv.languages).length ? `<h2>${L.langs}</h2><div class="tags">${list(cv.languages).map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
        ${list(cv.skills).length ? `<h2>${L.skills}</h2><div class="tags">${list(cv.skills).map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      </div></body></html>`;
}

async function htmlToPdf(html) {
    const { chromium } = require("playwright");
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
        await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
        return await page.pdf({ format: "A4", printBackground: true });
    } finally {
        await browser.close();
    }
}

const COUNTRY_CZ = { Austria: "Rakousko", Belgium: "Belgie", Cyprus: "Kypr", Denmark: "Dánsko", Estonia: "Estonsko", Finland: "Finsko",
    France: "Francie", Germany: "Německo", Greece: "Řecko", Ireland: "Irsko", Italy: "Itálie", Malta: "Malta", Netherlands: "Nizozemsko",
    Norway: "Norsko", Spain: "Španělsko", Sweden: "Švédsko" };

function setupCv(app, { cloudinary }) {
    // Nabídky z posledních denních běhů (pro doporučení po vytvoření CV).
    let jobsCache = { at: 0, list: [] };
    async function recentJobs() {
        if (Date.now() - jobsCache.at < 10 * 60 * 1000 && jobsCache.list.length) return jobsCache.list;
        try {
            const info = await cloudinary.api.resource("PracovniTipyAI/state/automation-state.json", { resource_type: "raw" });
            const state = await (await fetch(`${info.secure_url}?t=${Date.now()}`)).json();
            const dates = Object.keys(state.runs || {}).sort().reverse().slice(0, 5);
            const seen = new Set();
            const list = [];
            for (const d of dates) {
                const run = state.runs[d];
                for (const j of (run.jobs || run.selected || [])) {
                    const title = String(j.job_title || j.title || "").trim();
                    const country = String(j.country || "").trim();
                    const key = `${title}|${country}`.toLowerCase();
                    if (!title || seen.has(key)) continue;
                    seen.add(key);
                    list.push({ title, country, countryCz: COUNTRY_CZ[country] || country, category: j.work_category || j.category || "", salary: j.salary_czk_month || "", city: (j.city && j.city !== country) ? j.city : "" });
                }
            }
            jobsCache = { at: Date.now(), list };
        } catch (err) {
            logError("Načtení nabídek pro doporučení selhalo:", err.message);
        }
        return jobsCache.list;
    }

    async function matchJobs(cv) {
        const jobs = await recentJobs();
        if (!jobs.length) return [];
        const profile = [cv.headline, ...(cv.experience || []).map(e => e.title), ...(cv.skills || [])].filter(Boolean).join(", ");
        try {
            const raw = await openai([
                { role: "system", content: 'Vyber 3 nabídky práce, které nejlépe sedí k profilu uchazeče (podobná praxe nebo dovednosti; když nic nesedí, vyber nabídky bez nutnosti praxe). Odpověz JSON {"picks":[index,index,index]}.' },
                { role: "user", content: `Profil: ${profile}\nNabídky:\n${jobs.map((j, i) => `${i}: ${j.title} – ${j.countryCz} (${j.category})`).join("\n")}` }
            ], { maxTokens: 60, json: true });
            const picks = (JSON.parse(raw).picks || []).map(Number).filter(i => jobs[i]);
            return [...new Set(picks)].slice(0, 3).map(i => jobs[i]);
        } catch (err) {
            return jobs.slice(0, 3);
        }
    }

    const sessions = new Map();          // sessionId -> { lead, createdAt }
    const hits = new Map();              // ip -> [timestamps]

    // Limity počítáme zvlášť pro každý krok (dřív se zprávy v chatu počítaly
    // do limitu pro vytvoření CV a po pár zprávách to hlásilo chybu).
    function rateLimited(req, max, bucket) {
        const ip = bucket + ":" + String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
        const now = Date.now();
        const list = (hits.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
        list.push(now);
        hits.set(ip, list);
        return list.length > max;
    }

    async function uploadPdf(buffer, name) {
        return await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                // Cloudinary (free) blokuje doručení souborů .pdf, proto ukládáme
                // pod neutrální příponou a PDF posíláme přes vlastní /cv/pdf/...
                { resource_type: "raw", folder: "PracovniTipyAI/cv", public_id: `${name}.cvdata`, overwrite: true },
                (err, result) => (err ? reject(err) : resolve(result.secure_url))
            );
            stream.end(buffer);
        });
    }

    // Záloha kontaktů na Cloudinary (seznam, max 5000 posledních).
    let leadQueue = Promise.resolve();
    function backupLead(entry) {
        leadQueue = leadQueue.then(async () => {
            const PUBLIC_ID = "PracovniTipyAI/state/cv-leads.json";
            let list = [];
            try {
                const info = await cloudinary.api.resource(PUBLIC_ID, { resource_type: "raw" });
                list = await (await fetch(`${info.secure_url}?t=${Date.now()}`)).json();
            } catch (e) { list = []; }
            const i = list.findIndex(x => x.id === entry.id);
            if (i >= 0) list[i] = { ...list[i], ...entry }; else list.push(entry);
            const data = Buffer.from(JSON.stringify(list.slice(-5000))).toString("base64");
            await cloudinary.uploader.upload(`data:application/json;base64,${data}`, {
                resource_type: "raw", public_id: PUBLIC_ID, overwrite: true, invalidate: true
            });
        }).catch(err => logError("Záloha kontaktu selhala:", err.message));
        return leadQueue;
    }

    async function sendToMake(payload) {
        const url = process.env.MAKE_LEAD_WEBHOOK;
        if (!url) return log("MAKE_LEAD_WEBHOOK není nastaven, kontakt jen zálohuji.");
        try {
            const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            log(`Kontakt odeslán do Make (HTTP ${res.status}).`);
        } catch (err) {
            logError("Odeslání do Make selhalo:", err.message);
        }
    }

    app.get("/cv", (req, res) => res.type("html").send(PAGE_HTML));

    // Náhled šablony s ukázkovými daty (pro výběr šablony na stránce).
    app.get("/cv/template/:id", (req, res) => {
        if (!TEMPLATES.some(t => t.id === req.params.id)) return res.status(404).send("Nenalezeno");
        res.type("html").send(renderCv(SAMPLE, req.query.lang === "en" ? "en" : "cz", req.params.id));
    });

    app.get("/cv/pdf/:name", async (req, res) => {
        const name = String(req.params.name || "");
        if (!/^[a-z0-9-]{3,120}-(CZ|EN)$/i.test(name)) return res.status(404).send("Nenalezeno");
        try {
            const cloud = cloudinary.config().cloud_name;
            const r = await fetch(`https://res.cloudinary.com/${cloud}/raw/upload/PracovniTipyAI/cv/${name}.cvdata`);
            if (!r.ok) return res.status(404).send("Životopis nebyl nalezen.");
            const buf = Buffer.from(await r.arrayBuffer());
            res.set("Content-Type", "application/pdf");
            res.set("Content-Disposition", `inline; filename="zivotopis-${name}.pdf"`);
            res.send(buf);
        } catch (err) {
            logError("Stažení PDF selhalo:", err.message);
            res.status(500).send("Chyba při stahování.");
        }
    });

    app.post("/cv/lead", async (req, res) => {
        if (rateLimited(req, 20, "lead")) return res.status(429).json({ error: "Příliš mnoho pokusů, zkus to za chvíli." });
        const b = req.body || {};
        const name = String(b.name || "").trim().slice(0, 80);
        const age = Number(b.age);
        const phone = String(b.phone || "").trim().slice(0, 30);
        const email = String(b.email || "").trim().slice(0, 120);
        if (!name || !(age >= 15 && age <= 80) || !/^[+\d][\d\s-]{6,}$/.test(phone) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || b.consent !== true) {
            return res.status(400).json({ error: "Vyplň prosím správně všechna pole a potvrď souhlas." });
        }
        const id = crypto.randomUUID();
        const template = TEMPLATES.some(t => t.id === b.template) ? b.template : "executive";
        const lead = { id, name, age, phone, email, template, source: String(b.source || "").slice(0, 50), createdAt: new Date().toISOString() };
        sessions.set(id, { lead, createdAt: Date.now() });
        log(`Nový kontakt ${id} (${email}).`);
        backupLead(lead);
        sendToMake({ event: "lead", ...lead });
        res.json({ sessionId: id });
    });

    app.post("/cv/chat", async (req, res) => {
        if (rateLimited(req, 150, "chat")) return res.status(429).json({ error: "Příliš mnoho zpráv, zkus to za chvíli." });
        const session = sessions.get(String((req.body || {}).sessionId || ""));
        if (!session) return res.status(400).json({ error: "Relace vypršela, obnov prosím stránku." });
        const messages = (Array.isArray(req.body.messages) ? req.body.messages : [])
            .slice(-20)
            .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 1500) }));
        const year = currentYear();
        const system = `Jsi přátelský asistent "Pracovní tipy", který pomáhá Čechům sestavit životopis pro práci v zahraničí.
Uživatel: ${session.lead.name}, věk ${session.lead.age} let, aktuální rok ${year}.
Tvůj úkol: krátce se doptat na pracovní zkušenosti, vzdělání, jazyky a dovednosti. Pokládej VŽDY jen 1 krátkou otázku najednou, česky, tykej.
Když člověk neví, kdy pracoval, pomoz mu to odhadnout: zeptej se, kolik mu tehdy bylo let, a rok vezmi z této tabulky (věk → rok): ${Array.from({ length: Math.max(0, session.lead.age - 14) }, (_, i) => `${15 + i}→${year - (session.lead.age - 15 - i)}`).join(", ")}.
Když řekne, že tam byl např. rok nebo do loňska, dopočítej i konec. Neptej se znovu na to, co už řekl. Odhad mu napiš, ať ho potvrdí (např. "To bylo tedy zhruba v roce 2019, sedí to?").
U každé práce zjisti: pozici, kde (firma nebo aspoň typ podniku a město/země), přibližně od kdy do kdy a co tam dělal. Pak vzdělání, jazyky (a úroveň), řidičák, další dovednosti.
Nic si nevymýšlej. Až budeš mít dost informací (nebo po ~8 otázkách), napiš, že může kliknout na "Vytvořit životopis".`;
        try {
            const reply = await openai([{ role: "system", content: system }, ...messages], { maxTokens: 250 });
            res.json({ reply });
        } catch (err) {
            res.status(502).json({ error: "AI teď neodpovídá, zkus to prosím znovu." });
        }
    });

    app.post("/cv/generate", async (req, res) => {
        if (rateLimited(req, 15, "generate")) return res.status(429).json({ error: "Životopis jde vytvořit jen pár krát za hodinu." });
        const session = sessions.get(String((req.body || {}).sessionId || ""));
        if (!session) return res.status(400).json({ error: "Relace vypršela, obnov prosím stránku." });
        const transcript = (Array.isArray(req.body.messages) ? req.body.messages : [])
            .slice(-40)
            .map(m => `${m.role === "assistant" ? "Asistent" : "Uživatel"}: ${String(m.content || "").slice(0, 1500)}`)
            .join("\n");
        const lead = session.lead;
        const year = currentYear();
        const system = `Z rozhovoru vytvoř životopis. Aktuální rok ${year}, věk uživatele ${lead.age}.
PRAVIDLA: Používej jen informace z rozhovoru, nic nevymýšlej (žádné firmy, školy ani certifikáty, které nezazněly). Když název firmy nezazněl, napiš typ podniku a místo (např. "Bar, Praha"). Nejisté roky piš jako "cca 2019 – 2020". Roky počítej přesně: "loni" = ${year - 1}; "3 roky do loňska" = ${year - 4} – ${year - 1}; "byl jsem tam rok" od roku X = X – X+1. Délku praxe ve shrnutí sečti jen z uvedených období, nepřeháněj. Odrážky popisují běžnou náplň uvedené práce realisticky a stručně (2–4 odrážky). Nejnovější práce první.
Vrať JSON: {"cz": CV, "en": CV} kde CV = {"headline":"krátký titulek","summary":"2–3 věty","experience":[{"title":"","employer":"","place":"","period":"","bullets":[""]}],"education":[{"title":"","school":"","period":""}],"languages":[""],"skills":[""]}. "en" je stejný obsah v profesionální angličtině (období "approx. 2019 – 2020").`;
        try {
            const raw = await openai([{ role: "system", content: system }, { role: "user", content: transcript }], { maxTokens: 1800, json: true });
            const data = JSON.parse(raw);
            const base = { name: lead.name, age: lead.age, phone: lead.phone, email: lead.email };
            const slug = `${lead.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${lead.id.slice(0, 8)}`;
            const [czPdf, enPdf] = [await htmlToPdf(renderCv({ ...base, ...data.cz }, "cz", lead.template)), await htmlToPdf(renderCv({ ...base, ...data.en }, "en", lead.template))];
            await Promise.all([uploadPdf(czPdf, `${slug}-CZ`), uploadPdf(enPdf, `${slug}-EN`)]);
            const base_url = `https://${req.get("host")}/cv/pdf/`;
            const cvCz = `${base_url}${slug}-CZ`;
            const cvEn = `${base_url}${slug}-EN`;
            log(`CV vytvořeno pro ${lead.id}.`);
            const entry = { ...lead, cvCz, cvEn, cvCreatedAt: new Date().toISOString() };
            backupLead(entry);
            sendToMake({ event: "cv", ...entry, heroheroLink: HEROHERO_LINK });
            const matches = await matchJobs(data.cz || {}).catch(() => []);
            res.json({ cvCz, cvEn, matches: matches.map(m => ({ title: m.title, country: m.countryCz, city: m.city, salary: m.salary, category: m.category })) });
        } catch (err) {
            logError("Generování CV selhalo:", err.stack || err.message);
            res.status(500).json({ error: "Životopis se nepodařilo vytvořit, zkus to prosím znovu." });
        }
    });

    // Úklid starých relací (24 h).
    setInterval(() => {
        const limit = Date.now() - 24 * 60 * 60 * 1000;
        for (const [id, s] of sessions) if (s.createdAt < limit) sessions.delete(id);
    }, 60 * 60 * 1000);

    log("AI generátor životopisu aktivní na /cv");
}

const PAGE_HTML = `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Životopis zdarma do 5 minut | Pracovní Tipy</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f4f6fa;color:#1d2433}
.wrap{max-width:560px;margin:0 auto;padding:20px 16px 40px}
.hero{text-align:center;padding:12px 0 6px}.hero h1{font-size:24px;margin:6px 0}.hero p{color:#566;margin:6px 0}
.card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 4px 18px rgba(0,0,0,.06);margin-top:14px}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 5px}
input[type=text],input[type=email],input[type=tel],input[type=number],textarea{width:100%;padding:12px;border:1px solid #d6dbe4;border-radius:10px;font-size:16px}
.check{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:#445;margin-top:14px}
button{width:100%;margin-top:16px;padding:14px;border:0;border-radius:12px;background:#1f6feb;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
button.secondary{background:#0f9d58}button:disabled{opacity:.6}
.msgs{height:52vh;overflow-y:auto;padding:4px}
.msg{max-width:85%;padding:10px 13px;border-radius:14px;margin:7px 0;white-space:pre-wrap;line-height:1.35;font-size:15px}
.ai{background:#eef2f9}.me{background:#1f6feb;color:#fff;margin-left:auto}
.row{display:flex;gap:8px;margin-top:10px}.row textarea{height:52px;resize:none}.row button{width:auto;margin:0;padding:0 18px}
.err{color:#c62828;font-size:14px;margin-top:8px}.hidden{display:none}
.done a{display:block;text-align:center;margin-top:12px;padding:14px;border-radius:12px;background:#1f6feb;color:#fff;text-decoration:none;font-weight:700}
.tpls{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tpl{border:2px solid #e3e7ee;border-radius:12px;padding:8px;cursor:pointer;text-align:center;background:#fff}
.tpl.sel{border-color:#1f6feb;box-shadow:0 0 0 3px rgba(31,111,235,.15)}
.tpl b{display:block;margin-top:6px;font-size:14px}.tpl span{display:block;font-size:12px;color:#667}
.thumb{position:relative;width:100%;aspect-ratio:210/297;overflow:hidden;border-radius:6px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.thumb iframe{position:absolute;left:0;top:0;width:794px;height:1123px;border:0;transform-origin:0 0;pointer-events:none}
.job{border:1px solid #e3e7ee;border-radius:12px;padding:12px 14px;margin-top:8px;background:#fafbfd}
.job b{display:block;font-size:15px}.job span{display:block;color:#566;font-size:14px;margin-top:2px}.job em{display:block;font-style:normal;color:#ff5a5f;font-size:13px;font-weight:600;margin-top:6px}
.done a.hh{background:#ff5a5f}.small{font-size:12px;color:#667;text-align:center;margin-top:14px}
</style></head><body><div class="wrap">
<div class="hero"><div style="font-size:34px">📄✨</div><h1>Životopis v češtině i angličtině zdarma</h1>
<p>Stačí napsat, kde jsi pracoval/a – i když si nepamatuješ přesná data. AI to dopočítá a připraví ti CV pro práci v zahraničí.</p></div>

<div class="card" id="step0">
  <h2 style="margin:0 0 4px;font-size:18px">1. Vyber si vzhled životopisu</h2>
  <p style="margin:0 0 10px;color:#566;font-size:14px">Obsah doplní AI podle toho, co jí napíšeš.</p>
  <div class="tpls">${TEMPLATES.map(t => `<div class="tpl" data-id="${t.id}"><div class="thumb"><iframe src="/cv/template/${t.id}" scrolling="no" tabindex="-1" loading="lazy"></iframe></div><b>${t.name}</b><span>${t.desc}</span></div>`).join("")}</div>
  <button id="pick">Pokračovat ➜</button><div class="err" id="err0"></div>
</div>

<div class="card hidden" id="step1">
  <label>Jméno a příjmení</label><input id="name" type="text" autocomplete="name">
  <label>Věk</label><input id="age" type="number" min="15" max="80" inputmode="numeric">
  <label>Telefon</label><input id="phone" type="tel" placeholder="+420 ..." autocomplete="tel">
  <label>E-mail (pošleme ti na něj hotové CV)</label><input id="email" type="email" autocomplete="email">
  <div class="check"><input id="consent" type="checkbox"><span>Souhlasím se zpracováním údajů pro vytvoření životopisu a se zasíláním nabídek práce od Pracovní Tipy. Souhlas můžu kdykoli odvolat. <a href="/privacy" target="_blank">Zásady</a></span></div>
  <button id="start">Pokračovat ➜</button><div class="err" id="err1"></div>
</div>

<div class="card hidden" id="step2">
  <div class="msgs" id="msgs"></div>
  <div class="row"><textarea id="input" placeholder="Napiš odpověď…"></textarea><button id="send">➤</button></div>
  <button class="secondary" id="make">✅ Vytvořit životopis</button><div class="err" id="err2"></div>
</div>

<div class="card hidden done" id="step3">
  <h2 style="margin:0 0 6px">Hotovo! 🎉</h2><p>Tvůj životopis je připravený. Stáhni si ho a ulož do mobilu – hodí se při přihlášce.</p>
  <a id="cz" target="_blank">⬇️ Stáhnout CV česky (PDF)</a>
  <a id="en" target="_blank">⬇️ Stáhnout CV anglicky (PDF)</a>
  <div id="matchesBox" class="hidden"><h3 style="margin:22px 0 4px;font-size:17px">Nabídky, které sedí k tvé praxi 👇</h3>
  <p style="margin:0 0 8px;color:#566;font-size:14px">Vybrali jsme je z aktuálních ověřených nabídek. Plný popis, mzdu a kontakt pro přihlášku najdeš na HeroHero.</p>
  <div id="matches"></div></div>
  <p style="margin-top:18px">Každý den přidáváme 5 nových ověřených nabídek práce v zahraničí, kam se můžeš hned přihlásit:</p>
  <a class="hh" href="${HEROHERO_LINK}" target="_blank">🌍 Zobrazit nabídky práce – 3 dny zdarma</a>
</div>
<p class="small">Pracovní Tipy · práce nezprostředkováváme, jen sdílíme ověřené nabídky</p>
</div>
<script>
const $=id=>document.getElementById(id);const esc=t=>String(t||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));let sid=null;const history=[];let tpl=null;
function fitThumbs(){document.querySelectorAll('.thumb').forEach(t=>{const f=t.querySelector('iframe');f.style.transform='scale('+(t.clientWidth/794)+')'})}
window.addEventListener('resize',fitThumbs);setTimeout(fitThumbs,50);
document.querySelectorAll('.tpl').forEach(el=>el.onclick=()=>{document.querySelectorAll('.tpl').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');tpl=el.dataset.id;$('err0').textContent=''});
$('pick').onclick=()=>{if(!tpl){$('err0').textContent='Vyber si prosím jednu šablonu 🙂';return}$('step0').classList.add('hidden');$('step1').classList.remove('hidden');window.scrollTo(0,0)};
function add(role,text){history.push({role,content:text});const d=document.createElement('div');d.className='msg '+(role==='assistant'?'ai':'me');d.textContent=text;$('msgs').appendChild(d);$('msgs').scrollTop=1e9;}
async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Chyba, zkus to znovu.');return j;}
$('start').onclick=async()=>{$('err1').textContent='';$('start').disabled=true;
 try{const src=new URLSearchParams(location.search).get('src')||'';
  const j=await post('/cv/lead',{name:$('name').value,age:$('age').value,phone:$('phone').value,email:$('email').value,consent:$('consent').checked,source:src,template:tpl});
  sid=j.sessionId;$('step1').classList.add('hidden');$('step2').classList.remove('hidden');
  add('assistant','Ahoj '+$('name').value.split(' ')[0]+'! 👋 Napiš mi, kde a jako co jsi pracoval/a. Klidně přibližně – třeba „dělal jsem barmana, nepamatuju si kdy, ale chodil jsem tam rok“. Data spolu dopočítáme. 🙂');
 }catch(e){$('err1').textContent=e.message}$('start').disabled=false;};
async function send(){const t=$('input').value.trim();if(!t)return;$('input').value='';add('user',t);$('send').disabled=true;$('err2').textContent='';
 try{const j=await post('/cv/chat',{sessionId:sid,messages:history});add('assistant',j.reply)}catch(e){$('err2').textContent=e.message}$('send').disabled=false;}
$('send').onclick=send;$('input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
$('make').onclick=async()=>{if(history.filter(m=>m.role==='user').length<1){$('err2').textContent='Nejdřív mi napiš něco o své práci 🙂';return}
 $('make').disabled=true;$('make').textContent='⏳ Vytvářím životopis… (cca 30 s)';$('err2').textContent='';
 try{const j=await post('/cv/generate',{sessionId:sid,messages:history});$('cz').href=j.cvCz;$('en').href=j.cvEn;
  if(j.matches&&j.matches.length){$('matches').innerHTML=j.matches.map(m=>'<div class="job"><b>'+esc(m.title)+'</b><span>'+esc([m.city,m.country].filter(Boolean).join(', '))+(m.salary?' · cca '+esc(m.salary)+' / měsíc':'')+'</span><em>🔒 Detail a kontakt na HeroHero</em></div>').join('');$('matchesBox').classList.remove('hidden')}$('step2').classList.add('hidden');$('step3').classList.remove('hidden');}
 catch(e){$('err2').textContent=e.message;$('make').disabled=false;$('make').textContent='✅ Vytvořit životopis'}};
</script></body></html>`;

module.exports = setupCv;
