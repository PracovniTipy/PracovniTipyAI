"use strict";

// Stránka „Odjeď za prací“ – cíl všech reelů: krok za krokem od nápadu po odlet.
// Jen ověřená fakta (stejná jako v karuselech), žádné vymýšlení.
//   GET /start            – rozcestník
//   GET /start/:zeme      – návod pro konkrétní zemi + aktuální nabídky (jen názvy, detail na HeroHero)

const { COUNTRIES, GUIDES } = require("./carousel");

const BASE = "https://pracovnitipyai-production.up.railway.app";
const go = src => `${BASE}/go/hh?src=${src}`;
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
// "DO IRSKA" -> "do Irska", "VE ŠVÉDSKU" -> "ve Švédsku"
const prep = s => { const w = String(s).toLowerCase().split(" "); return w.map((x, i) => i === 0 ? x : x.charAt(0).toUpperCase() + x.slice(1)).join(" "); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const FLAG = { Ireland: "🇮🇪", Norway: "🇳🇴", Netherlands: "🇳🇱", Germany: "🇩🇪", Austria: "🇦🇹", Denmark: "🇩🇰", Sweden: "🇸🇪", Finland: "🇫🇮", Malta: "🇲🇹", Cyprus: "🇨🇾" };

const CSS = `
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f4f6fa;color:#1c2430;line-height:1.5}
.wrap{max-width:760px;margin:0 auto;padding:18px 16px 60px}
.hero{background:linear-gradient(135deg,#1f3a5f,#1f6feb);color:#fff;border-radius:20px;padding:26px 22px;margin-bottom:16px}
.hero h1{margin:0 0 8px;font-size:27px;line-height:1.2}.hero p{margin:0;opacity:.92}
.card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 3px 14px rgba(0,0,0,.05);margin-top:14px}
.card h2{margin:0 0 8px;font-size:19px;display:flex;gap:10px;align-items:center}
.num{display:inline-flex;width:30px;height:30px;border-radius:50%;background:#1f6feb;color:#fff;font-size:15px;align-items:center;justify-content:center;flex:none}
.btn{display:block;text-align:center;margin-top:12px;padding:14px;border-radius:12px;background:#1f6feb;color:#fff;text-decoration:none;font-weight:700}
.btn.hh{background:#ff5a5f}.btn.ghost{background:#eef3fb;color:#1f3a5f}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-top:10px}
.grid a{display:block;background:#f4f6fa;border-radius:12px;padding:12px;text-decoration:none;color:#1c2430;font-weight:600}
ul{margin:8px 0 0;padding-left:20px}li{margin:5px 0}
.small{font-size:13px;color:#667}.job{border:1px solid #e3e7ee;border-radius:12px;padding:10px 12px;margin-top:8px;background:#fafbfd}
.job b{display:block}.job span{color:#566;font-size:14px}
.links a{display:inline-block;margin:6px 8px 0 0;padding:9px 12px;border-radius:10px;background:#eef3fb;color:#1f3a5f;text-decoration:none;font-weight:600;font-size:14px}
footer{margin-top:26px;text-align:center;font-size:12px;color:#889}
`;

function page(title, body, desc) {
    return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc || title)}"><style>${CSS}</style></head>
<body><div class="wrap">${body}
<footer>Pracovní tipy · Informace jsou orientační, podrobnosti si vždy ověř u zaměstnavatele a na úřadech dané země.</footer></div></body></html>`;
}

const scam = GUIDES.find(g => g.name === "Podvodné nabídky");
const firstWeek = GUIDES.find(g => g.name === "První týden");
const packing = GUIDES.find(g => g.name === "Co si zabalit");
const list = items => `<ul>${items.map(([t, b]) => `<li><b>${esc(t.replace(/^\d+\.\s*/, ""))}:</b> ${esc(b)}</li>`).join("")}</ul>`;
const PHRASES = [
    ["Hi, my name is Petr. I am from the Czech Republic.", "Dobrý den, jmenuji se Petr, jsem z Česka."],
    ["I have two years of experience in a warehouse.", "Mám dva roky praxe ve skladu."],
    ["I can start immediately.", "Můžu nastoupit hned."],
    ["I am happy to work night shifts and weekends.", "Klidně budu pracovat v noci i o víkendech."],
    ["Sorry, could you repeat that, please?", "Promiňte, můžete to prosím zopakovat?"],
    ["Is accommodation provided?", "Je zajištěné ubytování?"]
];
const phraseList = () => `<ul>${PHRASES.map(([en, cz]) => `<li><b>${esc(en)}</b><br><span class="small">${esc(cz)}</span></li>`).join("")}</ul>`;

function flights(countryEn) {
    const q = encodeURIComponent(`Flights from Prague to ${countryEn}`);
    return `<div class="links">
<a href="https://www.google.com/travel/flights?q=${q}" target="_blank" rel="noopener">Google Flights</a>
<a href="https://www.kiwi.com/cz/" target="_blank" rel="noopener">Kiwi.com</a>
<a href="https://www.skyscanner.cz/" target="_blank" rel="noopener">Skyscanner</a></div>
<p class="small">Tip: porovnej ceny ve více vyhledávačích a zkontroluj, kolik stojí zavazadlo – u levných letenek se často platí zvlášť. Letenku kupuj až ve chvíli, kdy máš od zaměstnavatele písemné potvrzení nástupu.</p>`;
}

function steps(c) {
    const target = c ? prep(c.in) : "v zahraničí";
    return `
<div class="card"><h2><span class="num">1</span>Najdi práci</h2>
<p>Každý den vybíráme nové nabídky jednoduchých prací ${esc(target)} – sklady, farmy, sběr ovoce, úklid, hotely, výroba. U každé je mzda podle inzerátu, jazyk, město a kontakt, kam se přihlásit.</p>
<a class="btn hh" href="${go(c ? "start-" + slug(c.name) : "start")}">Zobrazit nabídky na HeroHero – 3 dny zdarma</a>
<p class="small">Pak 5 € měsíčně, zrušit můžeš kdykoli.</p></div>

<div class="card"><h2><span class="num">2</span>Životopis v angličtině – zdarma</h2>
<p>AI se tě zeptá na pár otázek a sestaví ti životopis česky i anglicky. Vybereš si z 10 šablon a stáhneš PDF.</p>
<a class="btn" href="${BASE}/cv?src=start">Vytvořit životopis zdarma</a></div>

<div class="card"><h2><span class="num">3</span>Ověř si nabídku – ať nenaletíš</h2>
${list(scam.slides)}</div>

<div class="card"><h2><span class="num">4</span>Zdravotní pojištění</h2>
<ul>
<li>Před odjezdem měj u sebe <b>evropský průkaz zdravotního pojištění (EHIC)</b> – vydává ho tvoje česká zdravotní pojišťovna.</li>
<li>Když v jiném státě EU <b>začneš pracovat, jsi zdravotně pojištěný tam</b>. České pojišťovně to podle VZP oznam <b>do 8 dnů</b> od začátku práce.</li>
<li>Než začneš pracovat (cesta, první dny), zvaž i <b>cestovní pojištění</b>. Podmínky si vždy přečti u pojišťovny.</li>
</ul></div>

<div class="card"><h2><span class="num">5</span>Angličtina na pohovor</h2>
<p>Věty, které se na pohovoru hodí nejvíc:</p>${phraseList()}
<p class="small">Procvičovat můžeš zdarma třeba v aplikaci Duolingo nebo na stránkách BBC Learning English.</p>
<div class="links"><a href="https://www.duolingo.com/" target="_blank" rel="noopener">Duolingo</a><a href="https://www.bbc.co.uk/learningenglish" target="_blank" rel="noopener">BBC Learning English</a></div></div>

<div class="card"><h2><span class="num">6</span>Letenka</h2>${flights(c ? c.key : "Europe")}</div>

<div class="card"><h2><span class="num">7</span>Co si zabalit</h2>${list(packing.slides)}</div>

<div class="card"><h2><span class="num">8</span>První týden na místě</h2>${list(firstWeek.slides)}</div>`;
}

module.exports = function setupStart(app, { cloudinary }) {
    // Aktuální nabídky z denních běhů (jen názvy a města – detail a kontakt jsou na HeroHero).
    let cache = { at: 0, runs: {} };
    async function recentJobs() {
        if (Date.now() - cache.at < 10 * 60 * 1000) return cache.runs;
        try {
            const info = await cloudinary.api.resource("PracovniTipyAI/state/automation-state.json", { resource_type: "raw" });
            const st = await (await fetch(`${info.secure_url}?t=${Date.now()}`)).json();
            cache = { at: Date.now(), runs: st.runs || {} };
        } catch (e) { /* bez nabídek se stránka zobrazí i tak */ }
        return cache.runs;
    }
    async function jobsFor(countryKey) {
        const runs = await recentJobs();
        const out = [];
        for (const d of Object.keys(runs).sort().reverse().slice(0, 14)) {
            for (const j of runs[d].jobs || []) {
                if (j.country === countryKey && !out.some(o => o.job_title === j.job_title && o.city === j.city)) out.push({ ...j, day: d });
            }
        }
        return out.slice(0, 6);
    }

    app.get("/start", (req, res) => {
        const countries = COUNTRIES.map(c => `<a href="${BASE}/start/${slug(c.name)}">${FLAG[c.key] || "🌍"} ${esc(c.name)}</a>`).join("");
        res.send(page("Odjeď za prací do zahraničí – krok za krokem | Pracovní tipy", `
<div class="hero"><h1>Odjeď za prací do zahraničí – krok za krokem</h1>
<p>Od nabídky přes životopis až po letenku. Všechno na jednom místě, srozumitelně a podle pravdy.</p></div>
<div class="card"><h2>🌍 Vyber zemi</h2><p class="small">Úřední kroky, doklady a aktuální nabídky pro danou zemi.</p><div class="grid">${countries}</div></div>
${steps(null)}`, "Práce v zahraničí krok za krokem: nabídky, životopis zdarma, pojištění, angličtina, letenky."));
    });

    app.get("/start/:zeme", async (req, res) => {
        const c = COUNTRIES.find(x => slug(x.name) === slug(req.params.zeme));
        if (!c) return res.redirect(302, `${BASE}/start`);
        const jobs = await jobsFor(c.key).catch(() => []);
        const jobsHtml = jobs.length
            ? jobs.map(j => `<div class="job"><b>${esc(j.job_title)}</b><span>${esc(j.city || c.name)}${j.salary_source ? ` · ${esc(j.salary_source)}` : ""}</span></div>`).join("") +
              `<a class="btn hh" href="${go("start-" + slug(c.name))}">Celý popis a kontakt na HeroHero</a>`
            : `<p class="small">Za posledních 14 dní jsme v této zemi nic nezveřejnili. Další nabídky přibývají každý den.</p>`;
        res.send(page(`Práce ${prep(c.in)} – jak odjet krok za krokem | Pracovní tipy`, `
<div class="hero"><h1>${FLAG[c.key] || ""} Jak odjet za prací ${esc(prep(c.to))}</h1><p>Doklady, úřady a aktuální nabídky – krok za krokem.</p></div>
<div class="card"><h2>📋 Doklady a pobyt</h2><p>Stačí platná občanka nebo pas, žádná víza. ${esc(c.stay)}</p></div>
<div class="card"><h2>🏛️ Úřední číslo</h2><p>${esc(c.reg)}</p></div>
<div class="card"><h2>💼 Nedávné nabídky ${esc(prep(c.in))}</h2>${jobsHtml}</div>
${steps(c)}
<a class="btn ghost" href="${BASE}/start">← Ostatní země</a>`, `Jak odjet za prací ${prep(c.to)}: doklady, úřady, pojištění, letenky a aktuální nabídky.`));
    });
};
