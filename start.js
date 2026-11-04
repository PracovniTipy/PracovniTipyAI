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

// ---------------------------------------------------------------------------
// /start = CESTA. Jeden příběh od nápadu po první den v práci. Pozadí se mění
// jako denní doba (noc → svítání → den), čára cesty se kreslí s posouváním,
// na konci čeká práce (HeroHero).
// ---------------------------------------------------------------------------
const JCSS = `
:root{--accent:#ff6b4a}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:#070a12;color:#fff;font:400 17px/1.6 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;transition:background-color 1.4s ease,color 1.4s ease;overflow-x:hidden}
a{color:inherit}.serif{font-family:Fraunces,Georgia,serif;font-weight:400;letter-spacing:-.02em}
.top{position:fixed;inset:0 0 auto 0;z-index:20;display:flex;justify-content:space-between;align-items:center;padding:16px clamp(18px,4vw,44px);font-size:14px}
.top b{font-weight:600;letter-spacing:.02em}.top span{opacity:.6;font-variant-numeric:tabular-nums}
.bar{position:fixed;top:0;left:0;height:2px;background:var(--accent);width:calc(var(--p,0)*100%);z-index:21}
.trail{position:fixed;left:clamp(14px,3vw,40px);top:0;bottom:0;width:22px;z-index:5;pointer-events:none}
.trail i{position:absolute;left:10px;top:12vh;bottom:12vh;border-left:1px dashed currentColor;opacity:.25}
.trail b{position:absolute;left:4px;top:calc(12vh + var(--p,0)*76vh);width:13px;height:13px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 6px rgba(255,107,74,.18);transition:top .15s linear}
.scene{min-height:100svh;display:flex;flex-direction:column;justify-content:center;padding:110px clamp(56px,10vw,160px) 90px;position:relative}
.ch{font-size:12px;letter-spacing:.2em;text-transform:uppercase;opacity:.55;margin:0 0 18px}
.scene h1,.scene h2{font-size:clamp(44px,7.4vw,108px);line-height:.98;margin:0 0 24px;max-width:15ch}
.scene h2 em,.scene h1 em{font-style:italic;color:var(--accent)}
.scene p.lead{font-size:clamp(18px,1.8vw,22px);max-width:560px;opacity:.78;margin:0}
.rv{opacity:0;transform:translateY(34px);transition:opacity 1s ease,transform 1.1s cubic-bezier(.2,.7,.2,1)}
.on .rv{opacity:1;transform:none}.on .rv.d1{transition-delay:.15s}.on .rv.d2{transition-delay:.3s}.on .rv.d3{transition-delay:.45s}.on .rv.d4{transition-delay:.6s}
.hint{position:absolute;bottom:34px;left:50%;transform:translateX(-50%);font-size:13px;opacity:.55;animation:bob 2s ease-in-out infinite}
@keyframes bob{50%{transform:translate(-50%,8px)}}
.stars{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(1px 1px at 12% 22%,#fff8,transparent),radial-gradient(1px 1px at 72% 14%,#fff9,transparent),radial-gradient(1.5px 1.5px at 40% 66%,#fff6,transparent),radial-gradient(1px 1px at 86% 58%,#fff8,transparent),radial-gradient(1px 1px at 24% 84%,#fff5,transparent),radial-gradient(1px 1px at 58% 36%,#fff7,transparent),radial-gradient(1.5px 1.5px at 92% 82%,#fff5,transparent);animation:tw 6s ease-in-out infinite alternate}
@keyframes tw{to{opacity:.4}}
.split{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(30px,6vw,90px);align-items:center}
@media (max-width:860px){.split{grid-template-columns:1fr}.scene{padding-left:52px;padding-right:22px}}
.map{width:100%;max-width:640px}
.rt path{fill:none;stroke:currentColor;stroke-opacity:.5;stroke-width:1.4;stroke-dasharray:1;stroke-dashoffset:1}
.rt circle{fill:var(--accent);opacity:0}.rt text{fill:currentColor;font:500 15px Inter,sans-serif;opacity:0}
.home circle{fill:currentColor}.home text{fill:currentColor;font:600 16px Inter,sans-serif}
.pulse{fill:none!important;stroke:currentColor;animation:pulse 2.4s ease-out infinite;transform-origin:center;transform-box:fill-box}
.on .rt path{animation:draw 1.6s cubic-bezier(.6,0,.2,1) var(--d) forwards}.on .rt circle,.on .rt text{animation:pop .6s ease calc(var(--d) + 1.3s) forwards}
@keyframes draw{to{stroke-dashoffset:0}}@keyframes pop{to{opacity:1}}@keyframes pulse{from{opacity:.8;transform:scale(1)}to{opacity:0;transform:scale(4)}}
.paper{position:relative;aspect-ratio:210/297;width:min(100%,420px);justify-self:center;border-radius:6px;overflow:hidden;background:#fff;box-shadow:0 50px 90px -30px rgba(0,0,0,.6);transform:rotate(-7deg) translateY(60px);opacity:0;transition:transform 1.4s cubic-bezier(.2,.7,.2,1) .2s,opacity 1s .2s}
.on .paper{transform:rotate(-3deg);opacity:1}.paper:hover{transform:rotate(0) scale(1.02)}
.paper iframe{position:absolute;left:0;top:0;width:794px;height:1123px;border:0;transform-origin:0 0;pointer-events:none}
.paper i{position:absolute;right:14px;top:14px;font:600 12px Inter,sans-serif;font-style:normal;background:#0b0f1a;color:#fff;padding:6px 10px;border-radius:999px;letter-spacing:.06em}
.btn{display:inline-flex;align-items:center;gap:10px;padding:17px 26px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px;transition:transform .25s}
.btn:hover{transform:translateY(-2px)}.btn.main{background:var(--accent);color:#fff}.btn.line{border:1px solid currentColor}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
.chip{display:inline-block;padding:10px 18px;border-radius:999px;border:1px solid currentColor;text-decoration:none;font-size:15px;opacity:.9}
.lands{display:grid;grid-auto-flow:column;grid-auto-columns:clamp(200px,22vw,280px);gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px 2px 14px;scrollbar-width:none;margin-top:36px}
.lands::-webkit-scrollbar{display:none}
.land{scroll-snap-align:start;position:relative;aspect-ratio:3/4.4;border-radius:22px;overflow:hidden;text-decoration:none;color:#fff;background:#222}
.land img{width:100%;height:100%;object-fit:cover;transition:transform .9s cubic-bezier(.2,.7,.2,1)}.land:hover img{transform:scale(1.06)}
.land span{position:absolute;inset:auto 0 0 0;padding:70px 20px 20px;background:linear-gradient(transparent,rgba(0,0,0,.75));font:400 32px/1 Fraunces,Georgia,serif}
.land small{display:block;font:500 13px Inter,sans-serif;margin-top:8px;opacity:.85}
.rules{display:grid;gap:22px;margin-top:40px;max-width:720px}
.rules div{display:grid;grid-template-columns:54px 1fr;gap:14px;align-items:baseline}
.rules b{font:300 40px/1 Fraunces,Georgia,serif;color:var(--accent)}.rules p{margin:0;font-size:19px;opacity:.85}
.bag{list-style:none;padding:0;margin:40px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;max-width:820px}
.bag li{padding:18px 20px;border:1px solid currentColor;border-radius:16px;opacity:0;transform:translateY(20px) rotate(-1deg);transition:all .7s cubic-bezier(.2,.7,.2,1)}
.on .bag li{opacity:.92;transform:none}
.bag li:before{content:"✓";color:var(--accent);font-weight:700;margin-right:10px}
.sky{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.sun{position:absolute;width:52vmin;height:52vmin;border-radius:50%;right:-8vmin;bottom:-30vmin;background:radial-gradient(circle,#fff3c4,#ffb26b 55%,transparent 70%);opacity:.9;transform:translateY(20vmin);transition:transform 2.2s cubic-bezier(.2,.7,.2,1)}
.on .sun{transform:none}
.plane{position:absolute;top:28%;left:-10%;font-size:46px;transform:rotate(8deg)}
.on .plane{animation:fly 6s cubic-bezier(.4,0,.2,1) .3s forwards}
@keyframes fly{to{left:110%;top:12%}}
.day{list-style:none;padding:0;margin:36px 0 0;max-width:760px;border-top:1px solid rgba(0,0,0,.15)}
.day li{display:grid;grid-template-columns:150px 1fr;gap:20px;padding:20px 0;border-bottom:1px solid rgba(0,0,0,.15)}
.day b{font:400 22px Fraunces,Georgia,serif}.day span{opacity:.8}
@media (max-width:640px){.day li{grid-template-columns:1fr;gap:4px}}
.offers{margin-top:40px;max-width:760px;display:grid;gap:12px}
.offer{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 22px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
.offer b{font-weight:600}.offer small{display:block;opacity:.7;font-size:14px;margin-top:2px}
.offer em{font-style:normal;font-size:13px;opacity:.7;white-space:nowrap}
.final{text-align:left}
.price{opacity:.7;font-size:14px;margin-top:14px}
footer{padding:30px clamp(56px,10vw,160px) 40px;font-size:13px;opacity:.55}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv,.paper,.bag li{opacity:1;transform:none}.rt path{stroke-dashoffset:0}.rt circle,.rt text{opacity:1}}
`;

const JSCRIPT = `<script>
const scenes=[...document.querySelectorAll('.scene')];
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const s=e.target;s.classList.add('on');document.body.style.backgroundColor=s.dataset.bg;document.body.style.color=s.dataset.fg;document.getElementById('chap').textContent=s.dataset.n}}),{threshold:.45});
scenes.forEach(s=>io.observe(s));
function prog(){const h=document.documentElement;const p=Math.min(1,Math.max(0,h.scrollTop/(h.scrollHeight-h.clientHeight)));h.style.setProperty('--p',p.toFixed(4))}
addEventListener('scroll',prog,{passive:true});prog();
function fitPaper(){document.querySelectorAll('.paper').forEach(p=>{const f=p.querySelector('iframe');if(f)f.style.transform='scale('+(p.clientWidth/794)+')'})}
addEventListener('resize',fitPaper);addEventListener('load',fitPaper);fitPaper();
</script>`;

function journeyPage(offers) {
    const lands = COUNTRIES.map(c => `<a class="land" href="${BASE}/start/${slug(c.name)}"><img src="${BASE}/img/zeme/${slug(c.name)}" alt="${esc(c.name)}" loading="lazy"><span>${esc(c.name)}<small>Jak odjet →</small></span></a>`).join("");
    const q = encodeURIComponent("Flights from Prague to Europe");
    const offerHtml = offers.length ? `<div class="offers rv d2">${offers.map(o => `<div class="offer"><div><b>${esc(o.job_title)}</b><small>${esc([o.city, SUPPORTED_CZ[o.country] || o.country].filter(Boolean).join(", "))}${o.salary_source ? " · " + esc(o.salary_source) : ""}</small></div><em>🔒 kontakt</em></div>`).join("")}</div>` : "";
    const sc = (n, bg, fg, inner, extra = "") => `<section class="scene" data-n="${n}" data-bg="${bg}" data-fg="${fg}" ${extra}>${inner}</section>`;
    const body = `
<div class="bar"></div><div class="trail"><i></i><b></b></div>
<div class="top"><b>Pracovní tipy</b><span id="chap">00 / 08</span></div>
${sc("00 / 08", "#070a12", "#ffffff", `<div class="stars"></div>
<p class="ch rv">Prolog</p><h1 class="serif rv d1">Každá cesta začíná <em>jednou myšlenkou.</em></h1>
<p class="lead rv d2">Co kdybych to zkusil/a jinde?</p><div class="hint">Posouvej dolů ↓</div>`)}
${sc("01 / 08", "#0d1730", "#ffffff", `<div class="split"><div><p class="ch rv">Kapitola 1 · Rozhodnutí</p><h2 class="serif rv d1">Někde v Evropě teď <em>hledají lidi.</em></h2>
<p class="lead rv d2">Sklady, farmy, sběr ovoce, úklid, hotely, výroba. Každý den vybíráme nové nabídky jednoduchých prací, kde stačí angličtina. Jako občan EU nepotřebuješ víza ani pracovní povolení.</p></div>
<div class="rv d2">${routeMap()}</div></div>`)}
${sc("02 / 08", "#171433", "#ffffff", `<div class="split"><div><p class="ch rv">Kapitola 2 · Představ se</p><h2 class="serif rv d1">Nejdřív papír, který <em>tě představí.</em></h2>
<p class="lead rv d2">Napíšeš AI, kde jsi pracoval/a – i bez přesných dat. Za pár minut máš životopis česky i anglicky v PDF. Zdarma.</p>
<div class="row rv d3"><a class="btn main" href="${BASE}/cv?src=start-journey">Vytvořit životopis zdarma</a></div></div>
<a class="paper" href="${BASE}/cv?src=start-journey" aria-label="Ukázka životopisu"><iframe src="${BASE}/cv/template/sidebar" scrolling="no" tabindex="-1" title="Ukázka životopisu"></iframe><i>UKÁZKA</i></a></div>`)}
${sc("03 / 08", "#241634", "#ffffff", `<p class="ch rv">Kapitola 3 · Kam</p><h2 class="serif rv d1">Vyber si, kde se <em>probudíš.</em></h2>
<p class="lead rv d2">Ke každé zemi doklady, úřady a nedávné nabídky.</p><div class="lands rv d3">${lands}</div>`)}
${sc("04 / 08", "#2e1420", "#ffffff", `<p class="ch rv">Kapitola 4 · Bezpečí</p><h2 class="serif rv d1">Jedno pravidlo: <em>za práci se neplatí.</em></h2>
<div class="rules"><div class="rv d2"><b>1</b><p>Agentura práce v Česku nesmí chtít peníze od uchazeče. Poplatek předem = varování.</p></div>
<div class="rv d3"><b>2</b><p>Chtěj písemnou nabídku se mzdou, pracovní dobou a místem.</p></div>
<div class="rv d4"><b>3</b><p>Neposílej doklady, dokud si firmu nedohledáš.</p></div></div>`)}
${sc("05 / 08", "#3d1d14", "#ffffff", `<p class="ch rv">Kapitola 5 · Kufr</p><h2 class="serif rv d1">Sbal se na <em>novou kapitolu.</em></h2>
<ul class="bag"><li style="transition-delay:.2s">Občanka nebo pas</li><li style="transition-delay:.3s">Průkaz pojištění EHIC</li><li style="transition-delay:.4s">Životopis v angličtině</li><li style="transition-delay:.5s">Pevné pracovní boty</li><li style="transition-delay:.6s">Léky, které bereš</li><li style="transition-delay:.7s">Peníze na první týdny</li></ul>`)}
${sc("06 / 08", "#ff9a6b", "#1a0f0a", `<div class="sky"><div class="sun"></div><div class="plane">✈︎</div></div>
<div style="position:relative"><p class="ch rv">Kapitola 6 · Odlet</p><h2 class="serif rv d1">Letenka. Pojištění. <em>Jedeš.</em></h2>
<p class="lead rv d2">Letenku kupuj až s písemným potvrzením nástupu a zkontroluj cenu zavazadla. Na cestu a první dny zvaž cestovní pojištění.</p>
<div class="row rv d3"><a class="chip" href="https://www.google.com/travel/flights?q=${q}" target="_blank" rel="noopener">Google Flights</a><a class="chip" href="https://www.kiwi.com/cz/" target="_blank" rel="noopener">Kiwi.com</a><a class="chip" href="https://www.skyscanner.cz/" target="_blank" rel="noopener">Skyscanner</a>${INSURANCE_URL ? `<a class="chip" href="${esc(INSURANCE_URL)}" target="_blank" rel="noopener sponsored">Cestovní pojištění</a>` : ""}</div></div>`)}
${sc("07 / 08", "#f6f1e8", "#14110d", `<p class="ch rv">Kapitola 7 · Den první</p><h2 class="serif rv d1">Ráno <em>v nové zemi.</em></h2>
<ul class="day"><li class="rv d1"><b>Úřad</b><span>Registrace a osobní číslo pro práci a daně – každá země má své.</span></li>
<li class="rv d2"><b>Pojištění</b><span>Začneš pracovat → jsi pojištěný tam. České pojišťovně to podle VZP oznam do 8 dnů.</span></li>
<li class="rv d3"><b>Účet</b><span>Zeptej se, jestli stačí tvůj český účet, nebo potřebuješ místní.</span></li>
<li class="rv d4"><b>Papíry</b><span>Schovávej smlouvu a všechny výplatní pásky.</span></li></ul>`)}
${sc("08 / 08", "#0a0d16", "#ffffff", `<div class="final"><p class="ch rv">Kapitola 8 · Práce</p><h2 class="serif rv d1">Zbývá poslední krok. <em>Najít práci.</em></h2>
<p class="lead rv d2">Každý den nové nabídky – mzda podle inzerátu, město a odkaz, kde se přihlásit.${offers.length ? " Tohle jsou ty nejnovější:" : ""}</p>
${offerHtml}
<div class="row rv d3"><a class="btn main" href="${go("start-final")}">Odemknout nabídky – 3 dny zdarma</a></div>
<p class="price rv d4">Pak 5 € měsíčně na HeroHero.</p></div>`)}
<footer>Pracovní tipy · Práci nezprostředkováváme, sdílíme vybrané nabídky z oficiálních pracovních portálů. Informace jsou orientační – podrobnosti si ověř u zaměstnavatele a na úřadech dané země.</footer>`;
    return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cesta za prací do zahraničí | Pracovní tipy</title>
<meta name="description" content="Od nápadu po první den v práci: životopis zdarma, země, bezpečí, kufr, letenka a nové nabídky jednoduchých prací v Evropě.">
<meta name="theme-color" content="#070a12">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${JCSS}</style></head><body>${body}${JSCRIPT}</body></html>`;
}

const SUPPORTED_CZ = { Ireland: "Irsko", Norway: "Norsko", Netherlands: "Nizozemsko", Germany: "Německo", Austria: "Rakousko", Denmark: "Dánsko", Sweden: "Švédsko", Finland: "Finsko", Malta: "Malta", Cyprus: "Kypr", Belgium: "Belgie", France: "Francie", Spain: "Španělsko", Italy: "Itálie", Greece: "Řecko", Estonia: "Estonsko" };

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

    async function latestOffers() {
        const runs = await recentJobs();
        const out = [];
        for (const d of Object.keys(runs).sort().reverse().slice(0, 3)) {
            for (const j of runs[d].jobs || []) if (j.salary_source && j.city && out.length < 4 && !out.some(o => o.job_title === j.job_title && o.country === j.country)) out.push(j);
        }
        return out;
    }

    app.get("/start", async (req, res) => {
        const offers = await latestOffers().catch(() => []);
        res.send(journeyPage(offers));
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
