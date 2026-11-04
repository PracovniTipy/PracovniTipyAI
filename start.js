"use strict";

// Stránka „Odjeď za prací“ – cíl všech reelů. Minimalistický, kreativní web:
// vektorová mapa cesty z Prahy (ostrá v jakémkoli rozlišení), země s fotkami,
// 8 kroků k odjezdu. Jen ověřená fakta (stejná jako v karuselech).
//   GET /start              – hlavní stránka
//   GET /start/:zeme        – návod pro zemi + nedávné nabídky (jen názvy, detail na HeroHero)
//   GET /img/zeme/:slug     – fotka země (pozadí z reelů)

const path = require("path");
const fs = require("fs");
const { COUNTRIES } = require("./carousel");

const BASE = "https://pracovnitipyai-production.up.railway.app";
const go = src => `${BASE}/go/hh?src=${src}`;
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
// "DO IRSKA" -> "do Irska", "VE ŠVÉDSKU" -> "ve Švédsku"
const prep = s => { const w = String(s).toLowerCase().split(" "); return w.map((x, i) => i === 0 ? x : x.charAt(0).toUpperCase() + x.slice(1)).join(" "); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Hlavní město každé země – jen pro kresbu mapy (zeměpisná délka, šířka).
const PLACES = {
    Ireland: ["Dublin", -6.26, 53.35], Norway: ["Oslo", 10.75, 59.91], Netherlands: ["Amsterdam", 4.9, 52.37],
    Germany: ["Berlín", 13.4, 52.52], Austria: ["Vídeň", 16.37, 48.21], Denmark: ["Kodaň", 12.57, 55.68],
    Sweden: ["Stockholm", 18.07, 59.33], Finland: ["Helsinky", 24.94, 60.17], Malta: ["Valletta", 14.51, 35.9],
    Cyprus: ["Nikósie", 33.38, 35.17]
};
const W = 1000, H = 720;
const px = (lon, lat) => [Math.round(((lon + 12) / 48) * W), Math.round(((64 - lat) / 31) * H)];

function routeMap() {
    const [ox, oy] = px(14.42, 50.08);
    const routes = COUNTRIES.map((c, i) => {
        const p = PLACES[c.key];
        if (!p) return "";
        const [x, y] = px(p[1], p[2]);
        const mx = (ox + x) / 2, my = (oy + y) / 2 - Math.hypot(x - ox, y - oy) * 0.25;
        const anchor = x < ox ? "end" : "start";
        const dx = x < ox ? -14 : 14;
        return `<g class="rt" style="--d:${0.25 + i * 0.12}s">
<path d="M${ox},${oy} Q${Math.round(mx)},${Math.round(my)} ${x},${y}" pathLength="1"/>
<circle cx="${x}" cy="${y}" r="5"/><text x="${x + dx}" y="${y + 5}" text-anchor="${anchor}">${esc(c.name)}</text></g>`;
    }).join("");
    return `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa cest z Prahy do zemí, kam sdílíme nabídky">
${routes}<g class="home"><circle cx="${ox}" cy="${oy}" r="9"/><circle class="pulse" cx="${ox}" cy="${oy}" r="9"/><text x="${ox + 16}" y="${oy + 26}">Praha</text></g></svg>`;
}

const CSS = `
:root{--ink:#0b0f1a;--paper:#f6f3ee;--line:rgba(255,255,255,.14);--accent:#ff6b4a;--muted:#8b93a7}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.55 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}
.serif{font-family:Fraunces,Georgia,serif;font-weight:400;letter-spacing:-.02em}
nav{position:fixed;inset:0 0 auto 0;z-index:10;display:flex;justify-content:space-between;align-items:center;padding:18px clamp(18px,4vw,48px);mix-blend-mode:difference;color:#fff}
nav b{font-weight:600;letter-spacing:.02em}nav a{text-decoration:none;font-size:14px;opacity:.9}
.hero{min-height:100svh;background:radial-gradient(120% 90% at 70% 20%,#18233d 0%,var(--ink) 60%);color:#fff;display:grid;grid-template-columns:1fr;align-items:end;padding:110px clamp(18px,5vw,64px) 48px;position:relative;overflow:hidden}
.map{position:absolute;top:70px;right:0;width:52%;height:calc(100% - 90px);opacity:.95}
@media (max-width:820px){.map{top:64px;width:100%;height:52%}}
.rt path{fill:none;stroke:#fff;stroke-opacity:.55;stroke-width:1.4;stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.6s cubic-bezier(.6,0,.2,1) var(--d) forwards}
.rt circle{fill:var(--accent);opacity:0;animation:pop .5s ease calc(var(--d) + 1.3s) forwards}
.rt text{fill:#fff;font:500 15px Inter,sans-serif;opacity:0;animation:pop .6s ease calc(var(--d) + 1.4s) forwards}
.home circle{fill:#fff}.home text{fill:#fff;font:600 16px Inter,sans-serif}
.pulse{fill:none!important;stroke:#fff;animation:pulse 2.4s ease-out infinite;transform-origin:center;transform-box:fill-box}
@keyframes draw{to{stroke-dashoffset:0}}@keyframes pop{to{opacity:1}}@keyframes pulse{from{opacity:.8;transform:scale(1)}to{opacity:0;transform:scale(4)}}
.hero-copy{position:relative;max-width:760px}
.hero h1{font-size:clamp(46px,8vw,112px);line-height:.95;margin:0 0 22px}
.hero h1 em{font-style:italic;color:var(--accent)}
.hero p{font-size:clamp(17px,1.6vw,20px);color:#c8cedb;max-width:520px;margin:0 0 28px}
.cta{display:flex;gap:12px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:10px;padding:16px 24px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px;transition:transform .25s,background .25s}
.btn:hover{transform:translateY(-2px)}
.btn.main{background:var(--accent);color:#fff}.btn.ghost{border:1px solid var(--line);color:#fff}
.btn.dark{background:var(--ink);color:#fff}
section{padding:clamp(72px,10vw,140px) clamp(18px,5vw,64px)}
.label{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 18px}
h2{font-size:clamp(36px,5.5vw,76px);line-height:1;margin:0 0 40px}
.lands{display:grid;grid-auto-flow:column;grid-auto-columns:clamp(220px,24vw,300px);gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;scrollbar-width:none}
.lands::-webkit-scrollbar{display:none}
.land{scroll-snap-align:start;position:relative;aspect-ratio:3/4.4;border-radius:22px;overflow:hidden;text-decoration:none;color:#fff;background:#222}
.land img{width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.7,.2,1)}
.land:hover img{transform:scale(1.06)}
.land span{position:absolute;inset:auto 0 0 0;padding:60px 20px 20px;background:linear-gradient(transparent,rgba(0,0,0,.72));font:400 34px/1 Fraunces,Georgia,serif}
.land small{display:block;font:500 13px Inter,sans-serif;margin-top:8px;opacity:.85}
.steps{border-top:1px solid #ddd6cc}
.step{display:grid;grid-template-columns:clamp(70px,12vw,170px) 1fr;gap:clamp(16px,4vw,60px);padding:clamp(28px,4vw,44px) 0;border-bottom:1px solid #ddd6cc;opacity:0;transform:translateY(28px);transition:opacity .8s,transform .8s cubic-bezier(.2,.7,.2,1)}
.step.in{opacity:1;transform:none}
.step .n{font:300 clamp(40px,7vw,96px)/.9 Fraunces,Georgia,serif;color:var(--accent)}
.step h3{font:400 clamp(26px,3vw,40px)/1.1 Fraunces,Georgia,serif;margin:4px 0 12px}
.step p,.step li{color:#444b5a;max-width:640px}.step ul{margin:0;padding-left:18px}.step li{margin:4px 0}
.step .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.chip{display:inline-block;padding:9px 16px;border-radius:999px;border:1px solid #cfc7bb;text-decoration:none;font-size:15px}
.chip:hover{background:var(--ink);color:#fff;border-color:var(--ink)}
.phr b{display:block;font-weight:600;color:var(--ink)}.phr span{font-size:15px}
.cvx{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,6vw,90px);align-items:center;background:#fff}
.cvx p{color:#444b5a;max-width:460px}
.paper{position:relative;aspect-ratio:210/297;width:min(100%,440px);justify-self:center;border-radius:6px;overflow:hidden;background:#fff;box-shadow:0 40px 80px -30px rgba(11,15,26,.35),0 0 0 1px rgba(11,15,26,.06);transform:rotate(-2.5deg);transition:transform .8s cubic-bezier(.2,.7,.2,1)}
.paper:hover{transform:rotate(0) scale(1.02)}
.paper iframe{position:absolute;left:0;top:0;width:794px;height:1123px;border:0;transform-origin:0 0;pointer-events:none}
.paper i{position:absolute;right:14px;top:14px;font:600 12px Inter,sans-serif;font-style:normal;background:var(--ink);color:#fff;padding:6px 10px;border-radius:999px;letter-spacing:.06em}
@media (max-width:820px){.cvx{grid-template-columns:1fr}}
.end{background:var(--ink);color:#fff;text-align:center}
.end h2{margin-bottom:28px}.end p{color:#c8cedb;max-width:520px;margin:0 auto 32px}
footer{background:var(--ink);color:#6f7891;font-size:13px;text-align:center;padding:0 20px 36px}
.chero{min-height:88svh;position:relative;color:#fff;display:flex;align-items:flex-end;padding:110px clamp(18px,5vw,64px) 56px;background:var(--ink)}
.chero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.75}
.chero:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,15,26,.2),rgba(11,15,26,.88))}
.chero div{position:relative;z-index:1}.chero h1{font-size:clamp(56px,10vw,140px);line-height:.9;margin:0 0 14px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:clamp(24px,4vw,56px)}
.facts h3{font:400 28px/1.1 Fraunces,Georgia,serif;margin:0 0 10px}.facts p{margin:0;color:#444b5a}
.jobs{margin-top:8px}.job{display:flex;justify-content:space-between;gap:16px;padding:18px 0;border-bottom:1px solid #ddd6cc}
.job b{font-weight:600}.job span{color:#6a7180;text-align:right}
@media (max-width:640px){.step{grid-template-columns:1fr}.job{flex-direction:column}.job span{text-align:left}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rt path{stroke-dashoffset:0}.rt circle,.rt text,.step{opacity:1;transform:none}}
`;

const SCRIPT = `<script>
function fitPaper(){document.querySelectorAll('.paper').forEach(p=>{const f=p.querySelector('iframe');if(f)f.style.transform='scale('+(p.clientWidth/794)+')'})}
addEventListener('resize',fitPaper);addEventListener('load',fitPaper);fitPaper();
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.15});
document.querySelectorAll('.step').forEach(s=>io.observe(s));
</script>`;

function page(title, body, desc) {
    return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc || title)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc || title)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<nav><a href="${BASE}/start"><b>Pracovní tipy</b></a><a href="${go("start-nav")}">Nabídky →</a></nav>
${body}
<footer>Pracovní tipy · Práci nezprostředkováváme, sdílíme vybrané nabídky z oficiálních pracovních portálů. Informace jsou orientační – podrobnosti si vždy ověř u zaměstnavatele a na úřadech dané země.</footer>
${SCRIPT}</body></html>`;
}

// Afiliační odkaz na cestovní pojištění (ePojištění.cz) – doplní se, až ho Petr pošle.
const INSURANCE_URL = process.env.EPOJISTENI_URL || "";

const PHRASES = [
    ["When can I start?", "Kdy můžu nastoupit?"],
    ["Is accommodation provided?", "Je zajištěné ubytování?"],
    ["Could you speak more slowly, please?", "Můžete prosím mluvit pomaleji?"]
];

function steps(c) {
    const where = c ? prep(c.in) : "v Evropě";
    const q = encodeURIComponent(`Flights from Prague to ${c ? c.key : "Europe"}`);
    const s = (n, title, inner) => `<div class="step"><div class="n">${n}</div><div><h3>${title}</h3>${inner}</div></div>`;
    return `<div class="steps">
${s("01", "Najdi práci", `<p>Každý den nové nabídky jednoduchých prací ${esc(where)} – sklady, farmy, sběr ovoce, úklid, hotely, výroba. U každé mzda podle inzerátu, město a odkaz, kde se přihlásit.</p><div class="row"><a class="btn dark" href="${go(c ? "start-" + slug(c.name) : "start")}">Zobrazit nabídky – 3 dny zdarma</a></div>`)}
${s("02", "Životopis v angličtině", `<p>Odpovíš na pár otázek a AI ti sestaví životopis česky i anglicky. Zdarma, stáhneš si PDF.</p><div class="row"><a class="chip" href="${BASE}/cv?src=start">Vytvořit životopis →</a></div>`)}
${s("03", "Ověř si nabídku", `<ul><li>Neplať předem za zprostředkování – agentura práce v Česku nesmí chtít peníze od uchazeče.</li><li>Chtěj písemnou nabídku se mzdou, pracovní dobou a místem.</li><li>Neposílej doklady, dokud si firmu nedohledáš.</li></ul>`)}
${s("04", "Zdravotní pojištění", `<ul><li>S sebou evropský průkaz zdravotního pojištění (EHIC) od české pojišťovny.</li><li>Když v jiném státě EU začneš pracovat, jsi pojištěný tam. České pojišťovně to podle VZP oznam do 8 dnů.</li><li>Na cestu a první dny před nástupem zvaž cestovní pojištění.</li></ul>${INSURANCE_URL ? `<div class="row"><a class="chip" href="${esc(INSURANCE_URL)}" target="_blank" rel="noopener sponsored">Porovnat cestovní pojištění →</a></div>` : ""}`)}
${s("05", "Angličtina na pohovor", `<ul class="phr">${PHRASES.map(([en, cz]) => `<li><b>${esc(en)}</b><span>${esc(cz)}</span></li>`).join("")}</ul>`)}
${s("06", "Letenka", `<p>Porovnej ceny a zkontroluj zavazadlo. Kupuj až s písemným potvrzením nástupu.</p><div class="row"><a class="chip" href="https://www.google.com/travel/flights?q=${q}" target="_blank" rel="noopener">Google Flights</a><a class="chip" href="https://www.kiwi.com/cz/" target="_blank" rel="noopener">Kiwi.com</a><a class="chip" href="https://www.skyscanner.cz/" target="_blank" rel="noopener">Skyscanner</a></div>`)}
${s("07", "Sbal se", `<p>Občanka nebo pas, EHIC, pevné boty, léky, hotovost na první dny – první výplata obvykle přijde až po několika týdnech.</p>`)}
${s("08", "První týden", `<p>Vyřiď registraci a osobní číslo pro práci a daně, bankovní účet, schovávej smlouvu a výplatní pásky.</p>`)}
</div>`;
}

module.exports = function setupStart(app, { cloudinary }) {
    const TEMPLATE_FOLDER = path.join(__dirname, "templates");

    app.get("/img/zeme/:slug", (req, res) => {
        const c = COUNTRIES.find(x => slug(x.name) === slug(req.params.slug));
        const file = c && path.join(TEMPLATE_FOLDER, c.bg);
        if (!file || !fs.existsSync(file)) return res.status(404).end();
        res.set("Cache-Control", "public, max-age=604800");
        res.sendFile(file);
    });

    let cache = { at: 0, runs: {} };
    async function recentJobs() {
        if (Date.now() - cache.at < 10 * 60 * 1000) return cache.runs;
        try {
            const info = await cloudinary.api.resource("PracovniTipyAI/state/automation-state.json", { resource_type: "raw" });
            const st = await (await fetch(`${info.secure_url}?t=${Date.now()}`)).json();
            cache = { at: Date.now(), runs: st.runs || {} };
        } catch (e) { /* stránka funguje i bez nabídek */ }
        return cache.runs;
    }
    async function jobsFor(countryKey) {
        const runs = await recentJobs();
        const out = [];
        for (const d of Object.keys(runs).sort().reverse().slice(0, 14)) {
            for (const j of runs[d].jobs || []) {
                if (j.country === countryKey && !out.some(o => o.job_title === j.job_title && o.city === j.city)) out.push(j);
            }
        }
        return out.slice(0, 6);
    }

    app.get("/start", (req, res) => {
        const lands = COUNTRIES.map(c => `<a class="land" href="${BASE}/start/${slug(c.name)}"><img src="${BASE}/img/zeme/${slug(c.name)}" alt="${esc(c.name)}" loading="lazy"><span>${esc(c.name)}<small>Jak odjet →</small></span></a>`).join("");
        res.send(page("Odjeď za prací do zahraničí – krok za krokem | Pracovní tipy", `
<header class="hero">${routeMap()}
<div class="hero-copy"><h1 class="serif">Odjeď za prací.<br><em>Krok za krokem.</em></h1>
<p>Nové nabídky jednoduchých prací v Evropě každý den, životopis v angličtině zdarma a všechno, co potřebuješ k odjezdu.</p>
<div class="cta"><a class="btn main" href="${go("start")}">Najít práci</a><a class="btn ghost" href="${BASE}/cv?src=start">Životopis zdarma</a></div></div></header>
<section class="cvx"><div><p class="label">Zdarma</p><h2 class="serif">Životopis v angličtině za 5 minut.</h2><p>Napíšeš AI, kde jsi pracoval/a – i bez přesných dat. Dostaneš hotový životopis česky i anglicky v PDF a k tomu nabídky, které sedí k tvé praxi.</p><div class="cta" style="margin-top:24px"><a class="btn dark" href="${BASE}/cv?src=start-cv">Vytvořit životopis</a></div></div>
<a class="paper" href="${BASE}/cv?src=start-cv" aria-label="Ukázka životopisu"><iframe src="${BASE}/cv/template/sidebar" scrolling="no" tabindex="-1" title="Ukázka životopisu"></iframe><i>UKÁZKA</i></a></section>
<section><p class="label">Kam</p><h2 class="serif">Vyber zemi.</h2><div class="lands">${lands}</div></section>
<section id="kroky" style="padding-top:0"><p class="label">Jak</p><h2 class="serif">Osm kroků k odjezdu.</h2>${steps(null)}</section>
<section class="end"><h2 class="serif">Nové nabídky<br>každý den.</h2><p>Mzda podle inzerátu, město a odkaz na přihlášku. Jako občan EU nepotřebuješ víza ani pracovní povolení.</p><a class="btn main" href="${go("start-end")}">Zobrazit nabídky – 3 dny zdarma</a></section>`,
            "Práce v zahraničí krok za krokem: nabídky jednoduchých prací v Evropě, životopis zdarma, pojištění, angličtina, letenky."));
    });

    app.get("/start/:zeme", async (req, res) => {
        const c = COUNTRIES.find(x => slug(x.name) === slug(req.params.zeme));
        if (!c) return res.redirect(302, `${BASE}/start`);
        const jobs = await jobsFor(c.key).catch(() => []);
        const jobsHtml = jobs.length
            ? `<div class="jobs">${jobs.map(j => `<div class="job"><b>${esc(j.job_title)}</b><span>${esc(j.city || c.name)}${j.salary_source ? ` · ${esc(j.salary_source)}` : ""}</span></div>`).join("")}</div>
<div class="cta" style="margin-top:28px"><a class="btn dark" href="${go("start-" + slug(c.name))}">Celý popis a kontakt na HeroHero</a></div>`
            : `<p style="color:#6a7180">Za posledních 14 dní jsme tady nic nezveřejnili. Nové nabídky přibývají každý den.</p>`;
        res.send(page(`Práce ${prep(c.in)} – jak odjet krok za krokem | Pracovní tipy`, `
<header class="chero"><img src="${BASE}/img/zeme/${slug(c.name)}" alt=""><div><p class="label" style="color:#c8cedb">Jak odjet za prací</p><h1 class="serif">${esc(c.name)}.</h1>
<div class="cta"><a class="btn main" href="${go("start-" + slug(c.name))}">Nabídky ${esc(prep(c.in))}</a><a class="btn ghost" href="${BASE}/cv?src=start-${slug(c.name)}">Životopis zdarma</a></div></div></header>
<section><div class="facts"><div><h3>Doklady a pobyt</h3><p>Stačí platná občanka nebo pas, žádná víza. ${esc(c.stay)}</p></div><div><h3>Úřední číslo</h3><p>${esc(c.reg)}</p></div></div></section>
<section style="padding-top:0"><p class="label">Nedávné nabídky</p><h2 class="serif">Práce ${esc(prep(c.in))}.</h2>${jobsHtml}</section>
<section style="padding-top:0"><p class="label">Jak</p><h2 class="serif">Osm kroků k odjezdu.</h2>${steps(c)}</section>
<section class="end"><h2 class="serif">Další země.</h2><p>Irsko, Norsko, Nizozemsko, Německo, Rakousko, Dánsko, Švédsko, Finsko, Malta a Kypr.</p><a class="btn ghost" href="${BASE}/start">Zpět na přehled</a></section>`,
            `Jak odjet za prací ${prep(c.to)}: doklady, úřady, pojištění, letenky a nedávné nabídky.`));
    });
};
