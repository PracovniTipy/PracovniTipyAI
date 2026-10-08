"use strict";

// Pět prémiových šablon životopisu. Čistá typografie, žádné ozdoby.
// Fonty z Google Fonts (s latin-ext kvůli češtině).

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const list = arr => (Array.isArray(arr) ? arr : []).filter(x => x && String(typeof x === "object" ? JSON.stringify(x) : x).trim());

const TEMPLATES = [
    { id: "executive", name: "Executive", desc: "Klasická, elegantní, patkové písmo", accent: "#1c2b4a" },
    { id: "sidebar", name: "Moderní", desc: "Tmavý boční panel s kontakty", accent: "#2f4858" },
    { id: "minimal", name: "Minimal", desc: "Čistá, hodně vzduchu, černobílá", accent: "#111111" },
    { id: "timeline", name: "Timeline", desc: "Praxe na časové ose", accent: "#0f766e" },
    { id: "signature", name: "Signature", desc: "Výrazná hlavička s iniciály", accent: "#b08d57" },
    { id: "graphite", name: "Grafit", desc: "Antracitový panel, měděné detaily", accent: "#26282c" },
    { id: "burgundy", name: "Bordó", desc: "Vínový panel, elegantní písmo", accent: "#5a1f2b" },
    { id: "forest", name: "Les", desc: "Tmavě zelený panel, svěží", accent: "#1f3d2f" },
    { id: "midnight", name: "Půlnoc", desc: "Noční modrá, panel vpravo", accent: "#16213e" },
    { id: "sand", name: "Písek", desc: "Světlý béžový panel, terakota", accent: "#efe7dc" }
];

function labels(lang) {
    return lang === "en"
        ? { profile: "Profile", exp: "Work experience", edu: "Education", langs: "Languages", skills: "Skills", contact: "Contact", age: "Age", years: "years" }
        : { profile: "Profil", exp: "Pracovní zkušenosti", edu: "Vzdělání", langs: "Jazyky", skills: "Dovednosti", contact: "Kontakt", age: "Věk", years: "let" };
}

function parts(cv, lang) {
    const L = labels(lang);
    const ageText = cv.age ? `${L.age}: ${esc(cv.age)} ${L.years}` : "";
    const contacts = [esc(cv.phone), esc(cv.email), ageText].filter(Boolean);
    const initials = String(cv.name || "").trim().split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
    const exp = list(cv.experience);
    const edu = list(cv.education);
    const langs = list(cv.languages);
    const skills = list(cv.skills);
    const bullets = e => list(e.bullets).length ? `<ul>${list(e.bullets).map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
    const where = e => esc([e.employer, e.place].filter(Boolean).join(", "));
    return { L, contacts, initials, exp, edu, langs, skills, bullets, where };
}

const FONT = family => `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?${family}&display=swap" rel="stylesheet">`;

const BASE_CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{width:210mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
ul{margin:5px 0 0;padding-left:15px}li{margin:2px 0}
.keep{break-inside:avoid;page-break-inside:avoid}
`;

// 1) EXECUTIVE – klasika, patkové písmo, centrovaná hlavička, jemné linky
function executive(cv, lang) {
    const p = parts(cv, lang);
    const sec = (title, body) => body ? `<section><h2>${title}</h2>${body}</section>` : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${FONT("family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;600")}<style>${BASE_CSS}
body{font-family:'Source Sans 3',Arial,sans-serif;color:#2a2f3a;font-size:10.5pt;line-height:1.45}
.page{padding:20mm 20mm 16mm}
header{text-align:center;padding-bottom:12px;border-bottom:1px solid #1c2b4a}
h1{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:30pt;letter-spacing:.06em;margin:0;color:#1c2b4a;text-transform:uppercase}
.headline{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:14pt;color:#5b6475;margin:4px 0 8px}
.contact{font-size:9.5pt;color:#5b6475;letter-spacing:.04em}.contact span+span:before{content:"·";margin:0 9px;color:#b3b9c4}
section{margin-top:16px}
h2{font-family:'Cormorant Garamond',Georgia,serif;font-size:13pt;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#1c2b4a;margin:0 0 8px;display:flex;align-items:center;gap:12px}
h2:after{content:"";flex:1;height:1px;background:#d5d9e0}
.item{margin-bottom:11px}.top{display:flex;justify-content:space-between;align-items:baseline}
.title{font-weight:600;font-size:11pt;color:#1c2b4a}.date{font-size:9.5pt;color:#7a8291;white-space:nowrap;margin-left:12px}
.where{font-style:italic;color:#5b6475}
.inline{columns:2;column-gap:24px}.inline div{margin-bottom:3px}
</style></head><body><div class="page">
<header><h1>${esc(cv.name)}</h1>${cv.headline ? `<div class="headline">${esc(cv.headline)}</div>` : ""}<div class="contact">${p.contacts.map(c => `<span>${c}</span>`).join("")}</div></header>
${sec(p.L.profile, cv.summary ? `<p style="margin:0">${esc(cv.summary)}</p>` : "")}
${sec(p.L.exp, p.exp.map(e => `<div class="item keep"><div class="top"><span class="title">${esc(e.title)}</span><span class="date">${esc(e.period)}</span></div><div class="where">${p.where(e)}</div>${p.bullets(e)}</div>`).join(""))}
${sec(p.L.edu, p.edu.map(e => `<div class="item keep"><div class="top"><span class="title">${esc(e.title)}</span><span class="date">${esc(e.period)}</span></div><div class="where">${esc(e.school)}</div></div>`).join(""))}
${sec(p.L.langs, p.langs.length ? `<div class="inline">${p.langs.map(x => `<div>${esc(x)}</div>`).join("")}</div>` : "")}
${sec(p.L.skills, p.skills.length ? `<div class="inline">${p.skills.map(x => `<div>${esc(x)}</div>`).join("")}</div>` : "")}
</div></body></html>`;
}

// 2) MODERNÍ + varianty – barevný boční panel (kontakty, jazyky, dovednosti)
function sidebarVariant(o) {
    return function (cv, lang) {
        const p = parts(cv, lang);
        const side = o.side === "right" ? "right" : "left";
        const cols = side === "left" ? "70mm 1fr" : "1fr 70mm";
        const aside = `<aside><div class="mono">${esc(p.initials)}</div>
<div class="blk"><h3>${p.L.contact}</h3>${p.contacts.map(c => `<div>${c}</div>`).join("")}</div>
${p.langs.length ? `<div class="blk"><h3>${p.L.langs}</h3>${p.langs.map(x => `<div>${esc(x)}</div>`).join("")}</div>` : ""}
${p.skills.length ? `<div class="blk"><h3>${p.L.skills}</h3>${p.skills.map(x => `<div>${esc(x)}</div>`).join("")}</div>` : ""}
</aside>`;
        const main = `<main><h1>${esc(cv.name)}</h1>${cv.headline ? `<div class="headline">${esc(cv.headline)}</div>` : ""}<div class="bar"></div>
${cv.summary ? `<h2>${p.L.profile}</h2><p style="margin:0">${esc(cv.summary)}</p>` : ""}
${p.exp.length ? `<h2>${p.L.exp}</h2>${p.exp.map(e => `<div class="item keep"><div class="title">${esc(e.title)}</div><div class="meta"><span>${p.where(e)}</span><span>${esc(e.period)}</span></div>${p.bullets(e)}</div>`).join("")}` : ""}
${p.edu.length ? `<h2>${p.L.edu}</h2>${p.edu.map(e => `<div class="item keep"><div class="title">${esc(e.title)}</div><div class="meta"><span>${esc(e.school)}</span><span>${esc(e.period)}</span></div></div>`).join("")}` : ""}
</main>`;
        return `<!DOCTYPE html><html><head><meta charset="utf-8">${FONT(o.fonts)}<style>${BASE_CSS}
body{font-family:${o.body},Arial,sans-serif;color:#2b3440;font-size:10pt;line-height:1.5}
.bg{position:fixed;${side}:0;top:0;bottom:0;width:70mm;background:${o.bg}}
.grid{display:grid;grid-template-columns:${cols};min-height:297mm;position:relative}
aside{color:${o.sideText};padding:18mm ${side === "left" ? "9mm 12mm 11mm" : "11mm 12mm 9mm"}}
.mono{width:22mm;height:22mm;border-radius:${o.square ? "3px" : "50%"};border:1.5px solid ${o.monoBorder};color:${o.monoText || o.sideText};display:flex;align-items:center;justify-content:center;font-family:${o.head};font-weight:300;font-size:20pt;letter-spacing:.05em;margin-bottom:10mm}
aside h3{font-family:${o.head};font-weight:600;font-size:8.5pt;letter-spacing:.2em;text-transform:uppercase;color:${o.sideMuted};margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid ${o.sideRule}}
aside .blk{margin-bottom:9mm}aside .blk div{margin-bottom:5px;font-size:9.5pt;word-break:break-word}
main{padding:18mm ${side === "left" ? "15mm 12mm 12mm" : "12mm 12mm 15mm"}}
h1{font-family:${o.head};font-weight:${o.h1w || 600};font-size:25pt;line-height:1.1;margin:0;color:${o.ink}}
.headline{font-family:${o.head};font-weight:300;font-size:12pt;color:${o.accent};margin:5px 0 0;letter-spacing:.03em}
.bar{width:14mm;height:3px;background:${o.accent};margin-top:5mm;${o.bar ? "" : "display:none"}}
h2{font-family:${o.head};font-weight:600;font-size:10pt;letter-spacing:.18em;text-transform:uppercase;color:${o.h2 || o.ink};margin:9mm 0 9px}
.item{margin-bottom:12px}.title{font-weight:600;font-size:10.5pt;color:${o.ink}}
.meta{display:flex;justify-content:space-between;color:#6b7a86;font-size:9pt;margin-top:1px}
li::marker{color:${o.accent}}
</style></head><body><div class="bg"></div><div class="grid">${side === "left" ? aside + main : main + aside}</div></body></html>`;
    };
}

const sidebar = sidebarVariant({
    fonts: "family=Poppins:wght@300;500;600&family=Inter:wght@400;500;600", head: "'Poppins'", body: "'Inter'",
    bg: "#2f4858", sideText: "#e8eef2", sideMuted: "#9fb7c4", sideRule: "rgba(255,255,255,.18)", monoBorder: "rgba(255,255,255,.55)",
    ink: "#1d2a33", accent: "#5d7a8a", h2: "#2f4858"
});
const graphite = sidebarVariant({
    fonts: "family=Montserrat:wght@300;500;600;700&family=Open+Sans:wght@400;600", head: "'Montserrat'", body: "'Open Sans'",
    bg: "#26282c", sideText: "#eceae6", sideMuted: "#c89b6d", sideRule: "rgba(200,155,109,.35)", monoBorder: "#c89b6d", monoText: "#c89b6d",
    ink: "#1f2124", accent: "#b07d4f", h2: "#1f2124", square: true, bar: true, h1w: 700
});
const burgundy = sidebarVariant({
    fonts: "family=Raleway:wght@300;500;600;700&family=Source+Sans+3:wght@400;600", head: "'Raleway'", body: "'Source Sans 3'",
    bg: "#5a1f2b", sideText: "#f6ecee", sideMuted: "#e3b7bf", sideRule: "rgba(255,255,255,.2)", monoBorder: "rgba(255,255,255,.6)",
    ink: "#2a1418", accent: "#8c3243", h2: "#5a1f2b"
});
const forest = sidebarVariant({
    fonts: "family=Work+Sans:wght@300;500;600&family=Inter:wght@400;500;600", head: "'Work Sans'", body: "'Inter'",
    bg: "#1f3d2f", sideText: "#e9f1ec", sideMuted: "#9cc3ad", sideRule: "rgba(255,255,255,.18)", monoBorder: "rgba(156,195,173,.8)", monoText: "#cfe4d7",
    ink: "#16261e", accent: "#3f7a5c", h2: "#1f3d2f", bar: true
});
const midnight = sidebarVariant({
    fonts: "family=Plus+Jakarta+Sans:wght@300;500;600;700", head: "'Plus Jakarta Sans'", body: "'Plus Jakarta Sans'",
    bg: "#16213e", sideText: "#e6eaf5", sideMuted: "#8fa3d6", sideRule: "rgba(255,255,255,.16)", monoBorder: "rgba(143,163,214,.8)",
    ink: "#111a33", accent: "#3d5aa8", h2: "#16213e", side: "right", h1w: 700
});
const sand = sidebarVariant({
    fonts: "family=Nunito+Sans:wght@300;400;600;700&family=Lora:wght@500;600", head: "'Lora'", body: "'Nunito Sans'",
    bg: "#efe7dc", sideText: "#3a332c", sideMuted: "#a8613f", sideRule: "rgba(168,97,63,.3)", monoBorder: "#a8613f", monoText: "#a8613f",
    ink: "#2e2822", accent: "#a8613f", h2: "#2e2822", bar: true
});

// 3) MINIMAL – černobílá, levý sloupec s názvy sekcí, velké jméno
function minimal(cv, lang) {
    const p = parts(cv, lang);
    const row = (title, body) => body ? `<div class="r keep"><div class="lab">${title}</div><div class="val">${body}</div></div>` : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${FONT("family=Manrope:wght@300;400;600;700")}<style>${BASE_CSS}
body{font-family:'Manrope',Arial,sans-serif;color:#1a1a1a;font-size:10pt;line-height:1.55}
.page{padding:22mm 20mm 16mm}
h1{font-size:34pt;font-weight:300;letter-spacing:-.02em;line-height:1;margin:0}
.headline{font-size:11pt;font-weight:600;margin-top:8px;letter-spacing:.02em}
.contact{margin-top:10px;color:#666;font-size:9.5pt}.contact span{margin-right:16px}
.rule{height:2px;background:#111;width:18mm;margin:12mm 0 8mm}
.r{display:grid;grid-template-columns:38mm 1fr;gap:8mm;margin-bottom:8mm}
.lab{font-size:8pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#888;padding-top:2px}
.item{margin-bottom:10px}.title{font-weight:700}.meta{color:#777;font-size:9pt}
.tags{display:flex;flex-wrap:wrap;gap:4px 18px}
</style></head><body><div class="page">
<h1>${esc(cv.name)}</h1>${cv.headline ? `<div class="headline">${esc(cv.headline)}</div>` : ""}
<div class="contact">${p.contacts.map(c => `<span>${c}</span>`).join("")}</div>
<div class="rule"></div>
${row(p.L.profile, cv.summary ? esc(cv.summary) : "")}
${row(p.L.exp, p.exp.map(e => `<div class="item keep"><div class="title">${esc(e.title)}</div><div class="meta">${p.where(e)}${e.period ? ` — ${esc(e.period)}` : ""}</div>${p.bullets(e)}</div>`).join(""))}
${row(p.L.edu, p.edu.map(e => `<div class="item"><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.school)}${e.period ? ` — ${esc(e.period)}` : ""}</div></div>`).join(""))}
${row(p.L.langs, p.langs.length ? `<div class="tags">${p.langs.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : "")}
${row(p.L.skills, p.skills.length ? `<div class="tags">${p.skills.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : "")}
</div></body></html>`;
}

// 4) TIMELINE – praxe na svislé časové ose, smaragdový akcent
function timeline(cv, lang) {
    const p = parts(cv, lang);
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${FONT("family=DM+Sans:wght@400;500;700&family=DM+Serif+Display")}<style>${BASE_CSS}
body{font-family:'DM Sans',Arial,sans-serif;color:#26302e;font-size:10pt;line-height:1.5}
header{background:#f1f6f5;padding:17mm 18mm 11mm;border-bottom:3px solid #0f766e}
h1{font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:29pt;margin:0;color:#0b3b37}
.headline{color:#0f766e;font-weight:500;font-size:11.5pt;margin-top:3px}
.contact{margin-top:9px;color:#51605d;font-size:9.5pt}.contact span+span:before{content:"|";margin:0 10px;color:#a9c4c0}
.body{padding:9mm 18mm 14mm;display:grid;grid-template-columns:1fr 52mm;gap:11mm}
h2{font-size:9pt;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#0f766e;margin:0 0 10px}
.tl{position:relative;padding-left:16px;border-left:2px solid #cfe3e0;margin-bottom:9mm}
.ev{position:relative;margin-bottom:13px}.ev:before{content:"";position:absolute;left:-22px;top:4px;width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #0f766e}
.date{font-size:8.5pt;font-weight:700;color:#0f766e;letter-spacing:.05em}
.title{font-weight:700;font-size:10.5pt;color:#0b3b37}.where{color:#5d6b68}
.side .blk{margin-bottom:8mm}.side div.i{padding:5px 0;border-bottom:1px solid #e3ecea;font-size:9.5pt}
</style></head><body>
<header><h1>${esc(cv.name)}</h1>${cv.headline ? `<div class="headline">${esc(cv.headline)}</div>` : ""}<div class="contact">${p.contacts.map(c => `<span>${c}</span>`).join("")}</div></header>
<div class="body"><div>
${cv.summary ? `<h2>${p.L.profile}</h2><p style="margin:0 0 9mm">${esc(cv.summary)}</p>` : ""}
${p.exp.length ? `<h2>${p.L.exp}</h2><div class="tl">${p.exp.map(e => `<div class="ev keep"><div class="date">${esc(e.period)}</div><div class="title">${esc(e.title)}</div><div class="where">${p.where(e)}</div>${p.bullets(e)}</div>`).join("")}</div>` : ""}
${p.edu.length ? `<h2>${p.L.edu}</h2><div class="tl">${p.edu.map(e => `<div class="ev keep"><div class="date">${esc(e.period)}</div><div class="title">${esc(e.title)}</div><div class="where">${esc(e.school)}</div></div>`).join("")}</div>` : ""}
</div><div class="side">
${p.langs.length ? `<div class="blk"><h2>${p.L.langs}</h2>${p.langs.map(x => `<div class="i">${esc(x)}</div>`).join("")}</div>` : ""}
${p.skills.length ? `<div class="blk"><h2>${p.L.skills}</h2>${p.skills.map(x => `<div class="i">${esc(x)}</div>`).join("")}</div>` : ""}
</div></div></body></html>`;
}

// 5) SIGNATURE – tmavá hlavička s iniciálami, zlatý akcent, dva sloupce
function signature(cv, lang) {
    const p = parts(cv, lang);
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${FONT("family=Playfair+Display:wght@500;600&family=Lato:wght@400;700")}<style>${BASE_CSS}
body{font-family:'Lato',Arial,sans-serif;color:#2c2c2c;font-size:10pt;line-height:1.5}
header{background:#1e1e22;color:#f3efe7;padding:16mm 18mm 13mm;display:flex;align-items:center;gap:9mm}
.mono{flex:none;width:24mm;height:24mm;border:1.5px solid #b08d57;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display';font-size:20pt;color:#d8bd8a;letter-spacing:.08em}
h1{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:27pt;margin:0;letter-spacing:.02em}
.headline{color:#d8bd8a;font-size:10.5pt;letter-spacing:.16em;text-transform:uppercase;margin-top:5px}
.contact{margin-top:8px;font-size:9.5pt;color:#c9c4ba}.contact span+span:before{content:"";display:inline-block;width:4px;height:4px;background:#b08d57;margin:0 10px 2px;transform:rotate(45deg)}
.body{padding:10mm 18mm 14mm;display:grid;grid-template-columns:1fr 55mm;gap:11mm}
h2{font-family:'Playfair Display',Georgia,serif;font-weight:600;font-size:13pt;color:#1e1e22;margin:0 0 8px;padding-bottom:5px;border-bottom:1.5px solid #b08d57;display:inline-block}
.sec{margin-bottom:8mm}.item{margin-bottom:11px}
.title{font-weight:700;font-size:10.5pt}.meta{display:flex;justify-content:space-between;color:#7a7368;font-size:9pt}
.side{background:#f7f4ee;padding:7mm 6mm;align-self:start}.side .i{margin-bottom:5px;font-size:9.5pt}
</style></head><body>
<header><div class="mono">${esc(p.initials)}</div><div><h1>${esc(cv.name)}</h1>${cv.headline ? `<div class="headline">${esc(cv.headline)}</div>` : ""}<div class="contact">${p.contacts.map(c => `<span>${c}</span>`).join("")}</div></div></header>
<div class="body"><div>
${cv.summary ? `<div class="sec"><h2>${p.L.profile}</h2><p style="margin:0">${esc(cv.summary)}</p></div>` : ""}
${p.exp.length ? `<div class="sec"><h2>${p.L.exp}</h2>${p.exp.map(e => `<div class="item keep"><div class="title">${esc(e.title)}</div><div class="meta"><span>${p.where(e)}</span><span>${esc(e.period)}</span></div>${p.bullets(e)}</div>`).join("")}</div>` : ""}
${p.edu.length ? `<div class="sec"><h2>${p.L.edu}</h2>${p.edu.map(e => `<div class="item keep"><div class="title">${esc(e.title)}</div><div class="meta"><span>${esc(e.school)}</span><span>${esc(e.period)}</span></div></div>`).join("")}</div>` : ""}
</div><div class="side">
${p.langs.length ? `<div class="sec"><h2>${p.L.langs}</h2>${p.langs.map(x => `<div class="i">${esc(x)}</div>`).join("")}</div>` : ""}
${p.skills.length ? `<div class="sec" style="margin-bottom:0"><h2>${p.L.skills}</h2>${p.skills.map(x => `<div class="i">${esc(x)}</div>`).join("")}</div>` : ""}
</div></div></body></html>`;
}

const RENDER = { executive, sidebar, minimal, timeline, signature, graphite, burgundy, forest, midnight, sand };

function renderCv(cv, lang, templateId) {
    const fn = RENDER[templateId] || RENDER.executive;
    return fn(cv, lang);
}

// Ukázková data pro náhled šablon ve výběru.
const SAMPLE = {
    name: "Jana Nováková", age: 29, phone: "+420 777 123 456", email: "jana.novakova@email.cz",
    headline: "Pokojská a recepční",
    summary: "Spolehlivá a pečlivá pracovnice s praxí v hotelnictví a gastronomii. Ráda pracuji v týmu a domluvím se anglicky.",
    experience: [
        { title: "Pokojská", employer: "Hotel Panorama", place: "Praha", period: "2022 – 2025", bullets: ["Úklid pokojů a společných prostor", "Příprava pokojů pro nové hosty", "Kontrola minibarů a doplňování"] },
        { title: "Servírka", employer: "Restaurace U Mostu", place: "Brno", period: "2019 – 2022", bullets: ["Obsluha hostů a přijímání objednávek", "Práce s pokladnou"] }
    ],
    education: [{ title: "Výuční list – kuchař, číšník", school: "SOU gastronomické, Brno", period: "2013 – 2016" }],
    languages: ["Čeština – rodilý mluvčí", "Angličtina – mírně pokročilá"],
    skills: ["Řidičský průkaz sk. B", "Práce s pokladnou", "Týmová spolupráce"]
};

module.exports = { TEMPLATES, renderCv, SAMPLE, esc };
