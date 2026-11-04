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
// /start = CESTA. Jedna žena (brandová AI postava z reelů), jeden příběh:
// doma → životopis → práce (HeroHero) → letenka → pojištění → kufr → odlet → první směna.
// Obrázky jsou AI upscalované na 4K (Cloudinary e_upscale), vlevo klikatá silnice s autem.
// ---------------------------------------------------------------------------
const IMG = (n, w) => `https://res.cloudinary.com/rfgq6m1z/image/upload/e_upscale/c_scale,w_${w}/f_auto,q_auto:good/PracovniTipyAI/story/${n}.png`;
const IMG_LO = n => `https://res.cloudinary.com/rfgq6m1z/image/upload/f_auto,q_auto,w_60/PracovniTipyAI/story/${n}.png`;
const INSURANCE_FALLBACK = "https://www.epojisteni.cz/kalkulace-cestovni/";
const JCSS = `
:root{--a:#ff6b4a;--a2:#ffc27a;--road:0px;--tint:#ff8a4a}
*{box-sizing:border-box}html{scroll-behavior:auto}
body{margin:0;background:#05070d;color:#fff;font:400 17px/1.55 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}.serif{font-family:Fraunces,Georgia,serif;font-weight:400;letter-spacing:-.03em}
.amb{position:fixed;inset:-20%;z-index:0;pointer-events:none;background:radial-gradient(40% 50% at 72% 45%,var(--tint),transparent 70%);opacity:.22;transition:background 1.2s ease;filter:blur(40px)}
.grain{position:fixed;inset:-50%;z-index:40;pointer-events:none;opacity:.07;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");animation:gr 1s steps(4) infinite}
@keyframes gr{25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-1%)}}
.vig{position:fixed;inset:0;z-index:39;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55))}
.glow{position:fixed;left:0;top:0;width:420px;height:420px;margin:-210px 0 0 -210px;border-radius:50%;z-index:2;pointer-events:none;background:radial-gradient(circle,rgba(255,190,130,.16),transparent 65%);transform:translate(var(--mx,-999px),var(--my,-999px));transition:transform .25s ease-out}
.intro{position:fixed;inset:0;z-index:60;background:#05070d;display:grid;place-items:center;animation:out 1s cubic-bezier(.7,0,.2,1) 1.5s forwards;pointer-events:none}
.intro b{font:400 clamp(34px,6vw,72px)/1 Fraunces,Georgia,serif;letter-spacing:-.03em;overflow:hidden;display:block}
.intro b span{display:inline-block;transform:translateY(110%);animation:up .9s cubic-bezier(.2,.8,.2,1) forwards}
.intro b span:nth-child(2){animation-delay:.12s;font-style:italic;background:linear-gradient(90deg,var(--a2),var(--a));-webkit-background-clip:text;background-clip:text;color:transparent}
.intro i{display:block;height:2px;margin-top:18px;background:linear-gradient(90deg,var(--a2),var(--a));transform-origin:left;animation:line 1.3s cubic-bezier(.6,0,.2,1) .2s both}
@keyframes up{to{transform:none}}@keyframes line{from{transform:scaleX(0)}}@keyframes out{to{clip-path:inset(0 0 100% 0)}}
.top{position:fixed;inset:0 0 auto 0;z-index:30;display:flex;justify-content:space-between;align-items:center;padding:16px clamp(18px,3vw,36px) 16px calc(var(--road) + 18px);font-size:14px;pointer-events:none;mix-blend-mode:difference}
.top b{font-weight:600;letter-spacing:.03em}.top span{opacity:.8;font-variant-numeric:tabular-nums}
.bar{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,var(--a2),var(--a));width:calc(var(--p,0)*100%);z-index:31;box-shadow:0 0 12px var(--a)}
#road{position:fixed;left:0;top:0;width:var(--road);height:100svh;z-index:25;pointer-events:none;overflow:visible}
#road .edge{fill:none;stroke:rgba(255,255,255,.08);stroke-width:22;stroke-linecap:round}
#road .asph{fill:none;stroke:#11141f;stroke-width:17;stroke-linecap:round}
#road .mid{fill:none;stroke:#fff;stroke-opacity:.5;stroke-width:1.4;stroke-dasharray:7 9}
#road .done{fill:none;stroke:url(#gr);stroke-width:3;stroke-linecap:round;filter:drop-shadow(0 0 6px rgba(255,107,74,.9))}
#road .stop circle{fill:#05070d;stroke:rgba(255,255,255,.5);stroke-width:2;transition:all .4s}
#road .stop text{font-size:13px;opacity:.35;transition:opacity .4s}
#road .stop.on circle{fill:var(--a);stroke:#fff;filter:drop-shadow(0 0 6px var(--a))}#road .stop.on text{opacity:1}
.rd{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;overflow:visible}
.rd .edge{fill:none;stroke:rgba(255,255,255,.07);stroke-width:clamp(34px,4.4vw,58px);stroke-linecap:round}
.rd .asph{fill:none;stroke:rgba(10,12,20,.74);stroke-width:clamp(26px,3.4vw,46px);stroke-linecap:round}
.rd .mid{fill:none;stroke:#fff;stroke-opacity:.42;stroke-width:2;stroke-dasharray:16 18}
.rd .done{fill:none;stroke:url(#gr);stroke-width:4;stroke-linecap:round;filter:drop-shadow(0 0 8px rgba(255,107,74,.95))}
.rd.rc{z-index:4}
.rd .car{filter:drop-shadow(0 6px 10px rgba(0,0,0,.6))}
#car .beam,#carS .beam{fill:url(#beam);opacity:.85}
#car .body{filter:drop-shadow(0 3px 5px rgba(0,0,0,.6))}
.sc{position:relative;height:175svh;z-index:3}
.st{position:sticky;top:0;height:100svh;overflow:hidden;display:grid;grid-template-columns:1fr auto;align-items:center;gap:clamp(24px,5vw,80px);padding:80px clamp(22px,6vw,110px) 50px calc(var(--road) + clamp(26px,5vw,90px))}
.bg{position:absolute;inset:-8%;background-size:cover;background-position:center;filter:blur(42px) saturate(1.35) brightness(.4);transform:scale(calc(1.18 - var(--k,0)*.12))}
.tx{position:relative;max-width:640px;z-index:3}
.bg{z-index:0}
.ch{font-size:12px;letter-spacing:.26em;text-transform:uppercase;margin:0 0 18px;display:flex;align-items:center;gap:12px;opacity:0;transition:opacity .8s}
.ch:before{content:"";width:34px;height:1px;background:currentColor;opacity:.6}
.on .ch{opacity:.7}
.h{font-size:clamp(42px,6.2vw,98px);line-height:1;margin:0 0 22px}
.h .w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.h .w>span{display:inline-block;transform:translateY(105%) rotate(4deg);transition:transform 1s cubic-bezier(.2,.8,.2,1);transition-delay:calc(var(--i)*55ms + 80ms)}
.on .h .w>span{transform:none}
.h .em>span{font-style:italic;background:linear-gradient(90deg,var(--a2),var(--a));-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.lead{font-size:clamp(17px,1.5vw,20px);opacity:.82;margin:0;max-width:520px}
.rv{opacity:0;transform:translateY(30px);filter:blur(8px);transition:opacity .9s ease,transform 1.1s cubic-bezier(.2,.7,.2,1),filter .9s ease}
.on .rv{opacity:1;transform:none;filter:none}.on .d1{transition-delay:.35s}.on .d2{transition-delay:.5s}.on .d3{transition-delay:.65s}.on .d4{transition-delay:.8s}
.stage{position:relative;perspective:1200px;z-index:2}
.card{position:relative;height:min(74svh,860px);aspect-ratio:2/3;border-radius:32px;overflow:hidden;transform-style:preserve-3d;box-shadow:0 70px 140px -40px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.1),0 0 90px -20px var(--tint);transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(calc((.5 - var(--k,0))*70px));transition:transform .5s cubic-bezier(.2,.7,.2,1),box-shadow 1s}
.card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(calc(1.2 - var(--k,0)*.17)) translateY(calc((var(--k,0) - .5)*-4%));will-change:transform}
.card .gl{position:absolute;inset:0;background:radial-gradient(circle at var(--gx,30%) var(--gy,20%),rgba(255,255,255,.28),transparent 45%);mix-blend-mode:overlay;pointer-events:none}
.card .sh{position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.2) 50%,transparent 60%);background-size:260% 100%;animation:shine 8s ease-in-out infinite;pointer-events:none}
@keyframes shine{0%,72%{background-position:160% 0}100%{background-position:-60% 0}}
.dust{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(2px 2px at 20% 30%,#ffd9a0cc,transparent),radial-gradient(1.5px 1.5px at 70% 70%,#fffa,transparent),radial-gradient(2px 2px at 40% 85%,#ffcf8aaa,transparent),radial-gradient(1.5px 1.5px at 85% 25%,#fffb,transparent),radial-gradient(2.5px 2.5px at 55% 50%,#ffe2b088,transparent),radial-gradient(1.5px 1.5px at 12% 65%,#fff9,transparent);background-size:100% 50%;animation:float 12s linear infinite}
@keyframes float{from{background-position:0 0}to{background-position:0 -100%}}
.stars{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(1px 1px at 12% 22%,#fff,transparent),radial-gradient(1px 1px at 72% 14%,#fff,transparent),radial-gradient(1.5px 1.5px at 40% 60%,#fffc,transparent),radial-gradient(1px 1px at 86% 58%,#fff,transparent),radial-gradient(1px 1px at 28% 84%,#fffa,transparent),radial-gradient(1.5px 1.5px at 58% 32%,#fff,transparent),radial-gradient(1px 1px at 93% 86%,#fffa,transparent);animation:tw 3s ease-in-out infinite alternate}
@keyframes tw{to{opacity:.3}}
.btn{display:inline-flex;align-items:center;gap:10px;padding:18px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px;background:linear-gradient(90deg,#ff9a4a,var(--a));color:#fff;box-shadow:0 14px 40px -10px rgba(255,107,74,.75);transition:transform .25s;position:relative;overflow:hidden}
.btn:after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);transform:translateX(-120%);animation:sweep 3.2s ease-in-out infinite}
@keyframes sweep{60%,100%{transform:translateX(120%)}}
.btn:hover{transform:translateY(-3px) scale(1.03)}
.btn.teal{background:linear-gradient(90deg,#3ad1c2,#1f9fd6);box-shadow:0 14px 40px -10px rgba(40,190,210,.75)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}
.chip{display:inline-block;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(12px);text-decoration:none;font-size:15px;transition:background .3s,transform .3s}
a.chip:hover{background:rgba(255,255,255,.2);transform:translateY(-2px)}
.drop .chip{opacity:0;transform:translateY(-40px) rotate(-6deg)}
.on .drop .chip{animation:drop .8s cubic-bezier(.3,1.6,.5,1) forwards}
.on .drop .chip:nth-child(1){animation-delay:.5s}.on .drop .chip:nth-child(2){animation-delay:.62s}.on .drop .chip:nth-child(3){animation-delay:.74s}.on .drop .chip:nth-child(4){animation-delay:.86s}
@keyframes drop{to{opacity:1;transform:none}}
.note{margin-top:20px;font-size:15px;opacity:.85}.note b{color:var(--a2)}
.live{display:inline-flex;align-items:center;gap:10px;font-size:14px;opacity:.85;margin-bottom:6px}
.live i{width:8px;height:8px;border-radius:50%;background:#3ddc84;box-shadow:0 0 0 0 rgba(61,220,132,.7);animation:ping 1.8s infinite}
@keyframes ping{70%{box-shadow:0 0 0 10px rgba(61,220,132,0)}100%{box-shadow:0 0 0 0 rgba(61,220,132,0)}}
.offers{display:grid;gap:10px;margin-top:18px}
.offer{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:15px 18px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(14px);text-decoration:none;opacity:0;transform:translateX(-40px);transition:all .8s cubic-bezier(.2,.7,.2,1),background .3s}
.on .offer{opacity:1;transform:none}.on .offer:nth-child(2){transition-delay:.12s}.on .offer:nth-child(3){transition-delay:.24s}
.offer:hover{background:rgba(255,255,255,.14)}
.offer b{font-weight:600}.offer small{display:block;opacity:.72;font-size:14px;margin-top:2px}
.offer em{font-style:normal;font-size:13px;white-space:nowrap;padding:6px 10px;border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,.08),rgba(255,255,255,.22),rgba(255,255,255,.08));background-size:200% 100%;animation:shim 2.4s linear infinite}
@keyframes shim{to{background-position:-200% 0}}
.price{opacity:.7;font-size:14px;margin-top:12px}
.lands{margin-top:24px;font-size:14px;opacity:.75;line-height:2}.lands a{margin-right:12px;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.35)}
.hint{position:absolute;bottom:92px;left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:.2em;text-transform:uppercase;opacity:.6;z-index:3}
.hint:after{content:"";display:block;width:1px;height:36px;margin:10px auto 0;background:linear-gradient(#fff,transparent);animation:drip 1.8s ease-in-out infinite;transform-origin:top}
@keyframes drip{0%{transform:scaleY(0)}50%{transform:scaleY(1)}100%{transform:scaleY(1);opacity:0}}
.flight{position:absolute;left:-10%;top:8%;width:120%;height:60%;pointer-events:none;z-index:1;opacity:.9}
.flight path{fill:none;stroke:rgba(255,255,255,.35);stroke-width:1.5;stroke-dasharray:6 10;stroke-dashoffset:600;transition:stroke-dashoffset 3s ease}
.on .flight path{stroke-dashoffset:0}
.plane{position:absolute;left:0;top:0;font-size:34px;offset-path:path("M0,260 C300,40 700,20 1200,180");offset-rotate:auto;offset-distance:0%;opacity:0;z-index:4;pointer-events:none}
.on .plane{animation:flyp 7s cubic-bezier(.45,0,.2,1) .3s infinite}
@keyframes flyp{0%{offset-distance:0%;opacity:0}10%{opacity:1}85%{opacity:1}100%{offset-distance:100%;opacity:0}}
.rings{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:-1}
.rings span{position:absolute;width:100%;height:100%;border-radius:40px;border:2px solid rgba(80,220,210,.6);animation:ring 3.2s ease-out infinite;opacity:0}
.rings span:nth-child(2){animation-delay:1.05s}.rings span:nth-child(3){animation-delay:2.1s}
@keyframes ring{0%{transform:scale(.95);opacity:.8}100%{transform:scale(1.35);opacity:0}}
.board{margin-top:26px;display:inline-grid;gap:6px;padding:16px 18px;border-radius:16px;background:rgba(10,12,20,.75);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(10px);font:600 clamp(15px,1.6vw,20px)/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.board .r{display:flex;gap:12px;align-items:center}.board .r small{font-size:11px;opacity:.5;width:44px;letter-spacing:.1em}
.board .f{display:flex;gap:3px}
.board .f span{display:inline-grid;place-items:center;width:1.25em;height:1.6em;border-radius:4px;background:#1b1f2c;color:#ffd27a;box-shadow:inset 0 -1px 0 rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.06);position:relative}
.board .f span:after{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(0,0,0,.6)}
.board .f span.fl{animation:flip .28s ease}
@keyframes flip{0%{transform:rotateX(0)}50%{transform:rotateX(90deg)}100%{transform:rotateX(0)}}
.flare{position:absolute;right:-20%;top:-30%;width:90vmin;height:90vmin;border-radius:50%;background:radial-gradient(circle,rgba(255,214,150,.55),rgba(255,140,80,.12) 40%,transparent 65%);animation:breathe 6s ease-in-out infinite;pointer-events:none;z-index:1}
@keyframes breathe{50%{transform:scale(1.12) translate(-3%,3%);opacity:.75}}
.steps{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:32;display:flex;align-items:center;gap:0;padding:8px 10px;border-radius:999px;background:rgba(8,10,18,.62);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(16px);box-shadow:0 20px 50px -20px rgba(0,0,0,.8)}
.steps .ln{position:absolute;left:28px;right:28px;top:50%;height:2px;background:rgba(255,255,255,.12);border-radius:2px;pointer-events:none}
.steps .ln i{position:absolute;left:0;top:0;bottom:0;width:calc(var(--sp,0)*100%);background:linear-gradient(90deg,var(--a2),var(--a));box-shadow:0 0 10px var(--a);transition:width .6s cubic-bezier(.2,.7,.2,1)}
.steps a{position:relative;z-index:1;display:grid;place-items:center;width:38px;height:38px;margin:0 6px;border-radius:50%;text-decoration:none;font-size:17px;background:#141826;border:1.5px solid rgba(255,255,255,.18);filter:grayscale(1);opacity:.55;transition:all .4s}
.steps a.done{filter:none;opacity:.9;border-color:var(--a)}
.steps a.now{filter:none;opacity:1;transform:scale(1.22);border-color:#fff;background:linear-gradient(135deg,#ff9a4a,var(--a));box-shadow:0 0 0 6px rgba(255,107,74,.25),0 0 24px rgba(255,107,74,.7)}
.steps a span{position:absolute;bottom:calc(100% + 12px);left:50%;transform:translateX(-50%) translateY(6px);white-space:nowrap;font:600 12px Inter,sans-serif;letter-spacing:.04em;padding:5px 10px;border-radius:999px;background:#fff;color:#14110d;opacity:0;pointer-events:none;transition:all .3s}
.steps a.now span,.steps a:hover span{opacity:1;transform:translateX(-50%)}
@media (max-width:860px){.steps{top:46px;bottom:auto;padding:5px 6px}.steps a{width:28px;height:28px;margin:0 3px;font-size:13px}.steps a span{bottom:auto;top:calc(100% + 8px)}.steps .ln{left:18px;right:18px}}
footer{position:relative;z-index:3;padding:28px 22px 40px calc(var(--road) + 22px);font-size:12px;opacity:.5;background:#05070d}
@media (max-height:760px) and (min-width:861px){.offer:nth-child(3){display:none}.h{font-size:clamp(40px,5.4vw,84px)}}
@media (max-width:860px){
 .st{grid-template-columns:1fr;align-items:end;padding:0 18px 30px calc(var(--road) + 10px)}
 .stage{position:absolute;inset:0;perspective:none;z-index:1}
 .rd{z-index:2}
 .card{height:100%;width:100%;aspect-ratio:auto;border-radius:0;box-shadow:none;transform:none}
 .card:before{content:"";position:absolute;inset:0;z-index:2;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,transparent 22%,transparent 38%,rgba(4,6,12,.94) 76%)}
 .bg,.glow,.rings{display:none}.h{font-size:clamp(36px,10.5vw,54px)}.lead{font-size:16px}
 .offer{padding:11px 13px}.offer small{font-size:13px}.flight,.plane{display:none}.board{margin-top:16px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv,.offer,.drop .chip{opacity:1;transform:none;filter:none}.h .w>span{transform:none}.intro{display:none}}
`;

const JSCRIPT = `<script>
(function(){
const secs=[...document.querySelectorAll('.sc')],chap=document.getElementById('chap'),R=document.documentElement;
// každá scéna má vlastní úsek klikaté silnice přes celou šířku; úseky na sebe navazují uprostřed
const roads=secs.map((s,i)=>({s,svg:s.querySelector('.rd'),car:s.querySelector('.rc'),dir:i%2?-1:1,cur:0,tgt:0,P:null,L:0}));
function build(){
 const w=innerWidth,h=innerHeight,amp=w*(w<861?.3:.4);
 roads.forEach(r=>{r.svg.setAttribute('viewBox','0 0 '+w+' '+h);r.car.setAttribute('viewBox','0 0 '+w+' '+h);let d='';
  for(let i=0;i<=180;i++){const t=i/180,x=w/2+r.dir*amp*Math.sin(t*Math.PI*3),y=-80+t*(h+160);d+=(i?' L':'M')+x.toFixed(1)+' '+y.toFixed(1)}
  r.svg.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));r.P=r.svg.querySelector('.asph');r.L=r.P.getTotalLength();
  r.svg.querySelector('.done').style.strokeDasharray=r.L});
}
function frame(){
 roads.forEach(r=>{if(!r.P)return;r.cur+=(r.tgt-r.cur)*.1;
  const t=.04+r.cur*.92,a=r.P.getPointAtLength(t*r.L),b=r.P.getPointAtLength(Math.min(r.L,t*r.L+3)),ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,sc=innerWidth<861?1.3:1.8;
  r.car.querySelector('.car').setAttribute('transform','translate('+a.x.toFixed(1)+' '+a.y.toFixed(1)+') rotate('+ang.toFixed(1)+') scale('+sc+')');
  r.svg.querySelector('.done').style.strokeDashoffset=(r.L*(1-t)).toFixed(1)});
 requestAnimationFrame(frame);
}
function tick(){
 const vh=innerHeight,max=R.scrollHeight-vh,p=Math.min(1,Math.max(0,scrollY/max));R.style.setProperty('--p',p.toFixed(4));
 let c=0;roads.forEach((r,i)=>{const b=r.s.getBoundingClientRect(),k=Math.min(1,Math.max(0,-b.top/(b.height-vh)));r.s.style.setProperty('--k',k.toFixed(3));r.tgt=k;
  if(b.top<vh*.5&&b.bottom>vh*.5){c=i;r.s.classList.add('on')}});
 chap.textContent=String(c+1).padStart(2,'0')+' / '+String(secs.length).padStart(2,'0');
 R.style.setProperty('--tint',secs[c].dataset.tint);
 if(window.__steps)window.__steps(c);
}
addEventListener('scroll',tick,{passive:true});addEventListener('resize',()=>{build();tick()});
build();tick();secs[0].classList.add('on');frame();
// postup: od domova po první výplatu
(function(){const nav=document.querySelector('.steps');if(!nav)return;const as=[...nav.querySelectorAll('a')],fill=nav.querySelector('.ln i');
 as.forEach((a,i)=>a.addEventListener('click',e=>{e.preventDefault();const s=secs[i];scrollTo({top:s.offsetTop+innerHeight*.3,behavior:'smooth'})}));
 window.__steps=c=>{as.forEach((a,i)=>{a.classList.toggle('done',i<c);a.classList.toggle('now',i===c)});nav.style.setProperty('--sp',(c/(as.length-1)).toFixed(3))};
 window.__steps(0)})();
// světlo za kurzorem + 3D náklon karty
addEventListener('pointermove',e=>{R.style.setProperty('--mx',e.clientX+'px');R.style.setProperty('--my',e.clientY+'px');
 document.querySelectorAll('.sc.on .card').forEach(c=>{const r=c.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;
  const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.style.setProperty('--ry',((x-.5)*10).toFixed(2)+'deg');c.style.setProperty('--rx',((.5-y)*8).toFixed(2)+'deg');c.style.setProperty('--gx',(x*100).toFixed(0)+'%');c.style.setProperty('--gy',(y*100).toFixed(0)+'%')})},{passive:true});
// odletová tabule
const D=JSON.parse(document.getElementById('dest').textContent);let di=0;
function setRow(el,txt){const n=el.children.length;txt=(txt+' '.repeat(n)).slice(0,n);[...el.children].forEach((sp,i)=>{const ch=txt[i];if(sp.textContent!==ch){setTimeout(()=>{sp.textContent=ch;sp.classList.remove('fl');void sp.offsetWidth;sp.classList.add('fl')},i*45)}})}
const rows=[...document.querySelectorAll('.board .f')];
function board(){rows.forEach((r,i)=>setRow(r,D[(di+i)%D.length]));di=(di+1)%D.length}
if(rows.length){board();setInterval(board,2600)}
})();
</script>`;

// nadpis rozdělený na slova (každé slovo vyjede zvlášť)
function HD(tag, plain, em) {
    let i = 0;
    // jednopísmenné předložky/spojky nesmí zůstat na konci řádku (česká typografie)
    const words = (s, cls) => String(s).replace(/(^|\s)([ksvzouaiKSVZOUAI]) /g, "$1$2\u00a0").replace(/(^|\s)([ksvzouaiKSVZOUAI]) /g, "$1$2\u00a0").split(" ").filter(Boolean).map(w => `<span class="w${cls}" style="--i:${i++}"><span>${esc(w)}</span></span>`).join(" ");
    return `<${tag} class="h serif">${words(plain, "")}${em ? " " + words(em, " em") : ""}</${tag}>`;
}

function journeyPage(offers) {
    const q = encodeURIComponent("Flights from Prague to Europe");
    const ins = INSURANCE_URL || INSURANCE_FALLBACK;
    const offerHtml = offers.length ? `<div class="offers">${offers.map(o => `<a class="offer" href="${go("start-offer")}"><div><b>${esc(o.job_title)}</b><small>${esc([o.city, SUPPORTED_CZ[o.country] || o.country].filter(Boolean).join(", "))}${o.salary_source ? " · " + esc(o.salary_source) : ""}</small></div><em>🔒 kontakt</em></a>`).join("")}</div>` : "";
    const lands = COUNTRIES.map(c => `<a href="${BASE}/start/${slug(c.name)}">${esc(c.name)}</a>`).join("");
    const DEST = ["DUBLIN", "OSLO", "AMSTERDAM", "VIDEN", "KODAN", "STOCKHOLM", "HELSINKY", "VALLETTA", "LARNAKA", "BERLIN"];
    const flap = n => `<div class="f">${"<span> </span>".repeat(n)}</div>`;
    const sc = (img, icon, tint, ch, inner, opt = {}) => `<section class="sc" data-icon="${icon}" data-tint="${tint}"><div class="st">
<div class="bg" style="background-image:url('${IMG_LO(img)}')"></div>${opt.back || ""}
<svg class="rd" aria-hidden="true"><path class="edge"/><path class="asph"/><path class="mid"/><path class="done"/></svg><svg class="rd rc" aria-hidden="true"><use class="car" href="#carS"/></svg>
<div class="tx"><p class="ch">${ch}</p>${inner}</div>
<div class="stage">${opt.stage || ""}<div class="card"><img src="${IMG(img, 1400)}" srcset="${IMG(img, 900)} 900w, ${IMG(img, 1400)} 1400w, ${IMG(img, 2000)} 2000w" sizes="(max-width:860px) 100vw, 46vh" alt="" ${img === "doma" ? 'fetchpriority="high"' : 'loading="lazy"'}>${opt.inCard || ""}<div class="dust"></div><div class="gl"></div><div class="sh"></div></div></div>${opt.extra || ""}</div></section>`;
    const body = `
<div class="intro"><div><b><span>Pracovní</span> <span>tipy</span></b><i></i></div></div>
<div class="amb"></div><div class="glow"></div><div class="grain"></div><div class="vig"></div><div class="bar"></div>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc27a"/><stop offset="1" stop-color="#ff6b4a"/></linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6c8" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient>
<g id="carS"><path class="beam" d="M13,-5 L62,-22 L62,22 L13,5 Z"/><rect x="-14" y="-8" width="28" height="16" rx="5.5" fill="#ff6b4a"/><rect x="-14" y="-8" width="28" height="7" rx="4" fill="#ff8a63"/><rect x="-2" y="-6.5" width="9" height="13" rx="2.5" fill="#141a2a"/><rect x="-11" y="-6.5" width="6" height="13" rx="2" fill="#141a2a" opacity=".85"/><circle cx="13" cy="-5" r="1.8" fill="#fff6c8"/><circle cx="13" cy="5" r="1.8" fill="#fff6c8"/><rect x="-15" y="-6" width="1.6" height="3" fill="#ff2a2a"/><rect x="-15" y="3" width="1.6" height="3" fill="#ff2a2a"/></g></defs></svg>
<div class="top"><b>Pracovní tipy</b><span id="chap">01 / 08</span></div>
<nav class="steps" aria-label="Postup">${[["🏠","Začátek"],["📄","Životopis"],["💼","Výběr práce"],["🎫","Letenka"],["🛡️","Pojištění"],["🧳","Kufr"],["🛫","Odlet"],["🍓","První výplata"]].map(([ic, t], i) => `<a href="#" data-i="${i}" aria-label="${t}">${ic}<span>${i ? i + ". " : ""}${t}</span></a>`).join("")}<div class="ln"><i></i></div></nav>
${sc("doma", "🏠", "#3a5bd9", "Prolog", `${HD("h1", "Co kdyby to šlo", "jinde?")}
<p class="lead rv d2">Sklady, farmy, sběr ovoce, hotely, úklid. Jako občan EU nepotřebuješ víza ani pracovní povolení.</p>`, { inCard: `<div class="stars"></div>`, extra: `<div class="hint">Posouvej</div>` })}
${sc("zivotopis", "📄", "#8a5cf0", "Krok 1 · Životopis", `${HD("h2", "Životopis za", "pár minut.")}
<p class="lead rv d2">Napíšeš AI, co umíš. Dostaneš PDF česky i anglicky. Zdarma.</p>
<div class="row rv d3"><a class="btn" href="${BASE}/cv?src=start-journey">Vytvořit životopis</a></div>`)}
${sc("prace", "💼", "#ff8a4a", "Krok 2 · Práce", `${HD("h2", "Vyber si práci", "na HeroHero.")}
<p class="live rv d1"><i></i>Nové nabídky každý den · mzda, město, odkaz na přihlášku</p>
<div class="row rv d2"><a class="btn" href="${go("start-work")}">Odemknout nabídky – 3 dny zdarma</a></div>
<p class="price rv d3">Pak 5 € měsíčně na HeroHero.</p>
${offerHtml}`)}
${sc("letenky", "🎫", "#4a8cff", "Krok 3 · Letenka", `${HD("h2", "Letenku kupuj až", "s potvrzenou prací.")}
<p class="lead rv d2">Porovnej ceny a zkontroluj, kolik stojí zavazadlo.</p>
<div class="row rv d3"><a class="chip" href="https://www.google.com/travel/flights?q=${q}" target="_blank" rel="noopener">Google Flights</a><a class="chip" href="https://www.kiwi.com/cz/" target="_blank" rel="noopener">Kiwi.com</a><a class="chip" href="https://www.skyscanner.cz/" target="_blank" rel="noopener">Skyscanner</a></div>`,
        { back: `<svg class="flight" viewBox="0 0 1200 300" preserveAspectRatio="none"><path d="M0,260 C300,40 700,20 1200,180"/></svg><div class="plane">✈︎</div>` })}
${sc("pojisteni", "🛡️", "#2fc9c0", "Krok 4 · Pojištění", `${HD("h2", "Klidná hlava", "i v cizině.")}
<p class="lead rv d2">Karta EHIC nekryje všechno – třeba převoz domů. Cestovní pojištění srovnáš a sjednáš online za pár minut.</p>
<div class="row rv d3"><a class="btn teal" href="${esc(ins)}" target="_blank" rel="noopener sponsored">Spočítat cenu pojištění</a></div>
<p class="note rv d4"><b>Tip:</b> ověř si, že pojištění kryje i manuální práci.</p>`, { stage: `<div class="rings"><span></span><span></span><span></span></div>` })}
${sc("kufr", "🧳", "#ffb35c", "Krok 5 · Kufr", `${HD("h2", "Sbal se na", "novou kapitolu.")}
<div class="row drop"><span class="chip">Občanka nebo pas</span><span class="chip">Karta EHIC</span><span class="chip">Pracovní boty</span><span class="chip">Peníze na první týdny</span></div>
<p class="note rv d4"><b>Pravidlo č. 1:</b> za nabídku práce se nikdy neplatí.</p>`)}
${sc("letiste", "🛫", "#ff9a3c", "Krok 6 · Odlet", `${HD("h2", "Odlet.", "Nová kapitola.")}
<div class="board rv d2"><div class="r"><small>PRG →</small>${flap(9)}</div><div class="r"><small>PRG →</small>${flap(9)}</div><div class="r"><small>PRG →</small>${flap(9)}</div></div>
<script type="application/json" id="dest">${JSON.stringify(DEST)}</script>`)}
${sc("jahody", "🍓", "#ff5a5a", "Cíl", `${HD("h2", "První směna.", "První výplata.")}
<p class="lead rv d2">Tvoje cesta začíná jednou nabídkou.</p>
<div class="row rv d3"><a class="btn" href="${go("start-end")}">Chci svou první nabídku</a></div>
<p class="lands rv d4">Průvodce zeměmi: ${lands}</p>`, { back: `<div class="flare"></div>` })}
<footer>Pracovní tipy · Práci nezprostředkováváme, sdílíme vybrané nabídky z pracovních portálů. Ilustrace jsou vytvořené AI. Odkaz na pojištění je partnerský. Podrobnosti si vždy ověř u zaměstnavatele.</footer>`;
    return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cesta za prací do zahraničí | Pracovní tipy</title>
<meta name="description" content="Od nápadu po první směnu: životopis zdarma, nabídky jednoduchých prací v Evropě se mzdou a městem, letenka, pojištění a co sbalit.">
<meta property="og:image" content="${IMG("letiste", 1200)}">
<meta name="theme-color" content="#05070d">
<link rel="preconnect" href="https://res.cloudinary.com"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="image" href="${IMG("doma", 1400)}">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${JCSS}</style></head><body>${body}${JSCRIPT}</body></html>`;
}

const SUPPORTED_CZ = { Ireland: "Irsko", Norway: "Norsko", Netherlands: "Nizozemsko", Germany: "Německo", Austria: "Rakousko", Denmark: "Dánsko", Sweden: "Švédsko", Finland: "Finsko", Malta: "Malta", Cyprus: "Kypr", Belgium: "Belgie", France: "Francie", Spain: "Španělsko", Italy: "Itálie", Greece: "Řecko", Estonia: "Estonsko" };

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

    // AI video (Sora 2) z obrázku příběhu: start → vrátí id, poll → po dokončení uloží MP4 na Cloudinary.
    app.post("/admin/story-video", require("express").text({ type: "text/plain", limit: "50kb" }), async (req, res) => {
        if (!process.env.STATS_KEY || req.get("x-admin-key") !== process.env.STATS_KEY) return res.status(403).json({ ok: false });
        let b = {}; try { b = JSON.parse(req.body || "{}"); } catch (e) {}
        try {
            const size = b.size || "1280x720";
            const [w, h] = size.split("x");
            const imgUrl = `https://res.cloudinary.com/rfgq6m1z/image/upload/c_fill,g_auto,w_${w},h_${h}/f_jpg,q_92/PracovniTipyAI/story/${String(b.image || "").replace(/[^a-z0-9-]/g, "")}.png`;
            const img = Buffer.from(await (await fetch(imgUrl)).arrayBuffer());
            const form = new FormData();
            form.append("model", String(b.model || "sora-2"));
            form.append("prompt", String(b.prompt || ""));
            form.append("size", size);
            form.append("seconds", String(b.seconds || "8"));
            form.append("input_reference", new Blob([img], { type: "image/jpeg" }), "ref.jpg");
            const r = await fetch("https://api.openai.com/v1/videos", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
            const raw = await r.text(); let j = {}; try { j = JSON.parse(raw); } catch (e) { j = { error: { message: `HTTP ${r.status}: ${raw.slice(0, 300)}` } }; }
            res.status(r.ok ? 200 : 502).json(r.ok ? { ok: true, id: j.id, status: j.status } : { ok: false, error: (j.error && j.error.message) || r.status });
        } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
    });
    app.get("/admin/story-video/:id", async (req, res) => {
        if (!process.env.STATS_KEY || req.get("x-admin-key") !== process.env.STATS_KEY) return res.status(403).json({ ok: false });
        try {
            const H = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
            const j = await (await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(req.params.id)}`, { headers: H })).json();
            if (j.status !== "completed") return res.json({ ok: true, status: j.status, progress: j.progress, error: j.error && j.error.message });
            const name = String(req.query.name || req.params.id).replace(/[^a-z0-9-]/g, "");
            const mp4 = Buffer.from(await (await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(req.params.id)}/content`, { headers: H })).arrayBuffer());
            const up = await cloudinary.uploader.upload(`data:video/mp4;base64,${mp4.toString("base64")}`, { resource_type: "video", public_id: `PracovniTipyAI/story/video/${name}`, overwrite: true, invalidate: true });
            res.json({ ok: true, status: "completed", url: up.secure_url });
        } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
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
<section class="end"><h2 class="serif">Další země.</h2><p>Irsko, Norsko, Nizozemsko, Německo, Rakousko, Dánsko, Švédsko, Finsko, Malta a Kypr.</p><a class="btn ghost" href="${BASE}/start">Zpět na přehled</a></section>`,
            `Jak odjet za prací ${prep(c.to)}: doklady, úřady, pojištění, letenky a nedávné nabídky.`));
    });
};
