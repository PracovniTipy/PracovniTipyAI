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
    Ireland: ["Dublin", -6.26, 53.35], Netherlands: ["Amsterdam", 4.9, 52.37],
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
// /start = CESTA. Jedna žena, jeden příběh (AI ilustrace, stejná postava jako
// v reelech): doma → životopis → kufr → letiště → první směna → nabídky.
// Vlevo klikatá silnice, po které jede auto podle posouvání stránky.
// ---------------------------------------------------------------------------
const IMG = (n, w) => `https://res.cloudinary.com/rfgq6m1z/image/upload/f_auto,q_auto,w_${w}/PracovniTipyAI/story/${n}.png`;
const JCSS = `
:root{--a:#ff6b4a;--road:clamp(44px,6vw,84px)}
*{box-sizing:border-box}
body{margin:0;background:#06080f;color:#fff;font:400 17px/1.55 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}.serif{font-family:Fraunces,Georgia,serif;font-weight:400;letter-spacing:-.025em}
.top{position:fixed;inset:0 0 auto 0;z-index:30;display:flex;justify-content:space-between;align-items:center;padding:16px clamp(18px,3vw,36px) 16px calc(var(--road) + 18px);font-size:14px;pointer-events:none}
.top b{font-weight:600;letter-spacing:.03em}.top span{opacity:.7;font-variant-numeric:tabular-nums}
.bar{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,#ffb36b,var(--a));width:calc(var(--p,0)*100%);z-index:31}
#road{position:fixed;left:0;top:0;width:var(--road);height:100svh;z-index:25;pointer-events:none}
#road .asph{fill:none;stroke:#141826;stroke-width:16;stroke-linecap:round;opacity:.92}
#road .mid{fill:none;stroke:#fff;stroke-opacity:.55;stroke-width:1.5;stroke-dasharray:7 9}
#road .done{fill:none;stroke:var(--a);stroke-width:3;stroke-linecap:round;filter:drop-shadow(0 0 6px rgba(255,107,74,.8))}
#road .stop{fill:#fff;stroke:#141826;stroke-width:3}#road .stop.on{fill:var(--a)}
#car{filter:drop-shadow(0 4px 6px rgba(0,0,0,.55))}
.sc{position:relative;height:190svh}
.st{position:sticky;top:0;height:100svh;overflow:hidden;display:grid;grid-template-columns:1fr auto;align-items:center;gap:clamp(24px,5vw,80px);padding:80px clamp(22px,6vw,110px) 60px calc(var(--road) + clamp(26px,5vw,90px))}
.bg{position:absolute;inset:-6%;background-size:cover;background-position:center;filter:blur(38px) saturate(1.3) brightness(.42);transform:scale(calc(1.15 - var(--k,0)*.1))}
.bg:after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 70% 50%,transparent 20%,rgba(4,6,12,.75))}
.card{position:relative;height:min(76svh,860px);aspect-ratio:2/3;border-radius:30px;overflow:hidden;box-shadow:0 60px 120px -40px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.08);transform:translateY(calc((.5 - var(--k,0))*60px)) rotate(calc((.5 - var(--k,0))*-3deg))}
.card img{width:100%;height:100%;object-fit:cover;transform:scale(calc(1.18 - var(--k,0)*.16)) translateY(calc((var(--k,0) - .5)*-3%));will-change:transform}
.card:after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.18) 50%,transparent 60%);background-size:250% 100%;animation:shine 7s ease-in-out infinite}
@keyframes shine{0%,70%{background-position:150% 0}100%{background-position:-60% 0}}
.dust{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(2px 2px at 20% 30%,#ffd9a0aa,transparent),radial-gradient(1.5px 1.5px at 70% 70%,#fff8,transparent),radial-gradient(2px 2px at 40% 80%,#ffcf8a99,transparent),radial-gradient(1.5px 1.5px at 85% 25%,#fff9,transparent),radial-gradient(2px 2px at 55% 45%,#ffe2b080,transparent);animation:float 14s linear infinite}
@keyframes float{from{transform:translateY(0)}to{transform:translateY(-120px)}}
.tx{position:relative;max-width:620px}
.ch{font-size:12px;letter-spacing:.24em;text-transform:uppercase;opacity:.65;margin:0 0 18px}
.tx h1,.tx h2{font-size:clamp(42px,6.4vw,96px);line-height:.98;margin:0 0 22px}
.tx em{font-style:italic;background:linear-gradient(90deg,#ffc27a,var(--a));-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.tx h2.fin{font-size:clamp(36px,4.6vw,68px)}
.lead{font-size:clamp(17px,1.6vw,21px);opacity:.82;margin:0;max-width:520px}
.rv{opacity:0;transform:translateY(40px);filter:blur(6px);transition:opacity .9s ease,transform 1.1s cubic-bezier(.2,.7,.2,1),filter .9s ease}
.on .rv{opacity:1;transform:none;filter:none}.on .d1{transition-delay:.12s}.on .d2{transition-delay:.26s}.on .d3{transition-delay:.4s}.on .d4{transition-delay:.54s}
.btn{display:inline-flex;align-items:center;gap:10px;padding:18px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px;background:linear-gradient(90deg,#ff8a4a,var(--a));color:#fff;box-shadow:0 14px 40px -10px rgba(255,107,74,.7);transition:transform .25s}
.btn:hover{transform:translateY(-3px) scale(1.02)}
.btn.pulse{animation:glow 2.4s ease-in-out infinite}@keyframes glow{50%{box-shadow:0 14px 60px -6px rgba(255,107,74,1)}}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:28px}
.chip{display:inline-block;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(10px);text-decoration:none;font-size:15px}
a.chip:hover{background:rgba(255,255,255,.2)}
.rule{margin-top:22px;font-size:15px;opacity:.85}.rule b{color:#ffb36b}
.offers{display:grid;gap:10px;margin-top:26px}
.offer{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:15px 18px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);text-decoration:none}
.offer b{font-weight:600}.offer small{display:block;opacity:.72;font-size:14px;margin-top:2px}.offer em{font-style:normal;font-size:13px;opacity:.75;white-space:nowrap;background:none;color:inherit}
.price{opacity:.7;font-size:14px;margin-top:12px}
.lands{margin-top:26px;font-size:14px;opacity:.75}.lands a{margin-right:10px;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.35)}
.hint{position:absolute;bottom:26px;left:50%;transform:translateX(-50%);font-size:13px;opacity:.6;animation:bob 2s ease-in-out infinite}
@keyframes bob{50%{transform:translate(-50%,8px)}}
footer{padding:28px 22px 40px calc(var(--road) + 22px);font-size:12px;opacity:.5;background:#06080f}
@media (max-width:860px){
 .st{grid-template-columns:1fr;align-items:end;padding:0 18px 34px calc(var(--road) + 10px)}
 .card{position:absolute;inset:0;height:auto;aspect-ratio:auto;border-radius:0;box-shadow:none;transform:none}
 .card:before{content:"";position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,transparent 25%,transparent 42%,rgba(4,6,12,.92) 78%)}
 .bg{display:none}.tx{z-index:2}.tx h1,.tx h2{font-size:clamp(38px,11vw,56px)}.lead{font-size:16px}
 .offer{padding:12px 14px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv{opacity:1;transform:none;filter:none}}
`;

const JSCRIPT = `<script>
(function(){
const secs=[...document.querySelectorAll('.sc')],svg=document.getElementById('road'),NS='http://www.w3.org/2000/svg';
const chap=document.getElementById('chap');let P,L,stops=[];
function build(){
 const w=svg.clientWidth,h=svg.clientHeight;svg.setAttribute('viewBox','0 0 '+w+' '+h);
 const top=70,bot=h-40,amp=w*.26,cx=w/2,turns=secs.length-.5;let d='M'+cx+' '+(top-80);
 for(let i=0;i<=120;i++){const t=i/120,y=top+t*(bot-top),x=cx+amp*Math.sin(t*Math.PI*2*turns/2);d+=' L'+x.toFixed(1)+' '+y.toFixed(1)}
 d+=' L'+cx+' '+(h+80);
 svg.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));
 P=svg.querySelector('.asph');L=P.getTotalLength();
 const g=document.getElementById('stops');g.innerHTML='';stops=secs.map((s,i)=>{const c=document.createElementNS(NS,'circle');const pt=at(i/(secs.length-1));c.setAttribute('cx',pt.x);c.setAttribute('cy',pt.y);c.setAttribute('r',5);c.setAttribute('class','stop');g.appendChild(c);return c});
 const dn=svg.querySelector('.done');dn.style.strokeDasharray=L;
 tick();
}
function at(p){const s=80/L,e=1-120/L;return P.getPointAtLength((s+p*(e-s))*L)}
function tick(){
 const H=document.documentElement,vh=innerHeight,max=H.scrollHeight-vh,p=Math.min(1,Math.max(0,scrollY/max));H.style.setProperty('--p',p.toFixed(4));
 if(P){const a=at(p),b=at(Math.min(1,p+.004)),ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  document.getElementById('car').setAttribute('transform','translate('+a.x.toFixed(1)+' '+a.y.toFixed(1)+') rotate('+ang.toFixed(1)+')');
  const s=80/L,e=1-120/L;svg.querySelector('.done').style.strokeDashoffset=(L-(s+p*(e-s))*L).toFixed(1);}
 let cur=0;secs.forEach((s,i)=>{const r=s.getBoundingClientRect(),k=Math.min(1,Math.max(0,-r.top/(r.height-vh)));s.style.setProperty('--k',k.toFixed(3));
  if(r.top<vh*.55&&r.bottom>vh*.45){cur=i;s.classList.add('on')}
  if(stops[i])stops[i].classList.toggle('on',p>=i/(secs.length-1)-.002)});
 chap.textContent=String(cur+1).padStart(2,'0')+' / '+String(secs.length).padStart(2,'0');
}
let raf;addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(tick)},{passive:true});
addEventListener('resize',build);build();secs[0].classList.add('on');
})();
</script>`;

function journeyPage(offers) {
    const q = encodeURIComponent("Flights from Prague to Europe");
    const offerHtml = offers.length ? `<div class="offers rv d3">${offers.map(o => `<a class="offer" href="${go("start-offer")}"><div><b>${esc(o.job_title)}</b><small>${esc([o.city, SUPPORTED_CZ[o.country] || o.country].filter(Boolean).join(", "))}${o.salary_source ? " · " + esc(o.salary_source) : ""}</small></div><em>🔒 kontakt</em></a>`).join("")}</div>` : "";
    const lands = COUNTRIES.map(c => `<a href="${BASE}/start/${slug(c.name)}">${esc(c.name)}</a>`).join("");
    const sc = (img, ch, inner, extra = "") => `<section class="sc"><div class="st"><div class="bg" style="background-image:url('${IMG(img, 60)}')"></div><div class="tx"><p class="ch rv">${ch}</p>${inner}</div><div class="card"><img src="${IMG(img, 1100)}" alt="" ${img === "doma" ? 'fetchpriority="high"' : 'loading="lazy"'}><div class="dust"></div></div>${extra}</div></section>`;
    const body = `
<div class="bar"></div>
<svg id="road" aria-hidden="true"><path class="asph"/><path class="mid"/><path class="done"/><g id="stops"></g>
<g id="car"><rect x="-13" y="-7.5" width="26" height="15" rx="5" fill="#ff6b4a"/><rect x="-3" y="-6" width="8" height="12" rx="2" fill="#1a1f2e"/><rect x="-10" y="-6" width="5" height="12" rx="2" fill="#1a1f2e" opacity=".8"/><circle cx="12" cy="-4.5" r="1.6" fill="#fff6c8"/><circle cx="12" cy="4.5" r="1.6" fill="#fff6c8"/></g></svg>
<div class="top"><b>Pracovní tipy</b><span id="chap">01 / 06</span></div>
${sc("doma", "Večer doma", `<h1 class="serif rv d1">Co kdyby to šlo <em>jinde?</em></h1>
<p class="lead rv d2">Sklady, farmy, sběr ovoce, hotely, úklid. Jako občan EU nepotřebuješ víza ani pracovní povolení.</p>`, `<div class="hint">Posouvej ↓</div>`)}
${sc("zivotopis", "Krok 1", `<h2 class="serif rv d1">Životopis za <em>pár minut.</em></h2>
<p class="lead rv d2">Napíšeš AI, co umíš. Dostaneš PDF česky i anglicky. Zdarma.</p>
<div class="row rv d3"><a class="btn" href="${BASE}/cv?src=start-journey">Vytvořit životopis</a></div>`)}
${sc("kufr", "Krok 2", `<h2 class="serif rv d1">Sbal se na <em>novou kapitolu.</em></h2>
<div class="row rv d2"><span class="chip">Občanka nebo pas</span><span class="chip">Karta EHIC</span><span class="chip">Pracovní boty</span><span class="chip">Peníze na první týdny</span></div>
<p class="rule rv d3"><b>Pravidlo č. 1:</b> za nabídku práce se nikdy neplatí.</p>`)}
${sc("letiste", "Krok 3", `<h2 class="serif rv d1">Letenku až <em>s potvrzenou prací.</em></h2>
<div class="row rv d2"><a class="chip" href="https://www.google.com/travel/flights?q=${q}" target="_blank" rel="noopener">Google Flights</a><a class="chip" href="https://www.kiwi.com/cz/" target="_blank" rel="noopener">Kiwi.com</a><a class="chip" href="https://www.skyscanner.cz/" target="_blank" rel="noopener">Skyscanner</a>${INSURANCE_URL ? `<a class="chip" href="${esc(INSURANCE_URL)}" target="_blank" rel="noopener sponsored">Cestovní pojištění</a>` : ""}</div>`)}
${sc("jahody", "Krok 4", `<h2 class="serif rv d1">První směna. <em>První výplata.</em></h2>
<p class="lead rv d2">U každé naší nabídky vidíš mzdu z inzerátu, město a kde se přihlásit.</p>`)}
${sc("prace", "Cíl", `<h2 class="serif rv d1 fin">Tvoje cesta začíná <em>jednou nabídkou.</em></h2>
${offerHtml}
<div class="row rv d4"><a class="btn pulse" href="${go("start-final")}">Odemknout nabídky – 3 dny zdarma</a></div>
<p class="price rv d4">Pak 5 € měsíčně na HeroHero.</p>
<p class="lands rv d4">Průvodce zeměmi: ${lands}</p>`)}
<footer>Pracovní tipy · Práci nezprostředkováváme, sdílíme vybrané nabídky z pracovních portálů. Ilustrace jsou vytvořené AI. Podrobnosti si vždy ověř u zaměstnavatele.</footer>`;
    return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cesta za prací do zahraničí | Pracovní tipy</title>
<meta name="description" content="Od nápadu po první směnu: životopis zdarma, co sbalit, letenka a nové nabídky jednoduchých prací v Evropě se mzdou a městem.">
<meta property="og:image" content="${IMG("letiste", 1200)}">
<meta name="theme-color" content="#06080f">
<link rel="preconnect" href="https://res.cloudinary.com"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${JCSS}</style></head><body>${body}${JSCRIPT}</body></html>`;
}

const SUPPORTED_CZ = { Ireland: "Irsko", Netherlands: "Nizozemsko", Germany: "Německo", Austria: "Rakousko", Denmark: "Dánsko", Sweden: "Švédsko", Finland: "Finsko", Malta: "Malta", Cyprus: "Kypr", Belgium: "Belgie", France: "Francie", Spain: "Španělsko", Italy: "Itálie", Greece: "Řecko", Estonia: "Estonsko" };

module.exports = function setupStart(app, { cloudinary }) {
    const TEMPLATE_FOLDER = path.join(__dirname, "templates");

    // AI obrázky příběhu (stejná postava jako v reelech) – generuje se jednorázově
    // přes OpenAI s referenční fotkou postavy, ukládá na Cloudinary.
    app.post("/admin/story-image", require("express").text({ type: "text/plain", limit: "50kb" }), async (req, res) => {
        if (!process.env.STATS_KEY || req.get("x-admin-key") !== process.env.STATS_KEY) return res.status(403).json({ ok: false });
        let b = {}; try { b = JSON.parse(req.body || "{}"); } catch (e) {}
        const name = String(b.name || "").replace(/[^a-z0-9-]/g, "");
        if (!name || !b.prompt) return res.status(400).json({ ok: false, error: "name+prompt" });
        try {
            const refFile = path.join(TEMPLATE_FOLDER, b.ref || "reel/Irsko reel.png");
            const form = new FormData();
            form.append("model", String(b.model || "gpt-image-1"));
            form.append("prompt", String(b.prompt));
            form.append("size", b.size || "1024x1536");
            form.append("quality", "high");
            form.append("image", new Blob([fs.readFileSync(refFile)], { type: "image/png" }), "ref.png");
            const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
            const j = await r.json();
            if (!r.ok) return res.status(502).json({ ok: false, error: (j.error && j.error.message) || r.status });
            const up = await cloudinary.uploader.upload(`data:image/png;base64,${j.data[0].b64_json}`, { public_id: `PracovniTipyAI/story/${name}`, overwrite: true, invalidate: true });
            res.json({ ok: true, url: up.secure_url });
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    app.get("/admin/models", async (req, res) => {
        if (!process.env.STATS_KEY || req.get("x-admin-key") !== process.env.STATS_KEY) return res.status(403).json({ ok: false });
        const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
        const j = await r.json();
        res.json((j.data || []).map(m => m.id).filter(id => /image|dall|sora|video/i.test(id)));
    });

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

    // Stejná pojistka jako v automatizaci: nereálnou mzdu (např. "9 SEK / hod.") nezobrazíme.
    const RATE = { "€": 24.5, EUR: 24.5, SEK: 2.15, NOK: 2.1, DKK: 3.28, PLN: 5.7, "£": 29, GBP: 29, CHF: 27.5 };
    const RANGE = { "hod.": [120, 1500], "týden": [3000, 60000], "14 dní": [6000, 120000], "měsíc": [12000, 250000], "rok": [150000, 3000000] };
    function plausible(src) {
        const m = String(src || "").match(/^([\d\s ]+(?:,\d+)?)\s*(\S+)\s*\/\s*(hod\.|týden|14 dní|měsíc|rok)/);
        if (!m) return false;
        const amt = Number(m[1].replace(/[\s ]/g, "").replace(",", ".")), r = RATE[m[2]], rg = RANGE[m[3]];
        return !!(r && rg && amt * r >= rg[0] && amt * r <= rg[1]);
    }

    async function latestOffers() {
        const runs = await recentJobs();
        const out = [];
        for (const d of Object.keys(runs).sort().reverse().slice(0, 3)) {
            for (const j of runs[d].jobs || []) if (j.salary_source && plausible(j.salary_source) && !/částečný/.test(j.salary_source) && j.city && !/olanda|holland|germania|francia|spagna|belgio|svizzera|polonia|irlanda|austria|danimarca|svezia|norvegia|finlandia/i.test(j.city) && out.length < 3 && !out.some(o => o.job_title === j.job_title || o.country === j.country)) out.push(j);
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
<section class="end"><h2 class="serif">Další země.</h2><p>Irsko, Nizozemsko, Německo, Rakousko, Dánsko, Švédsko, Finsko, Malta a Kypr.</p><a class="btn ghost" href="${BASE}/start">Zpět na přehled</a></section>`,
            `Jak odjet za prací ${prep(c.to)}: doklady, úřady, pojištění, letenky a nedávné nabídky.`));
    });
};
