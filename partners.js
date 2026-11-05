// ---------------------------------------------------------------------------
// Affiliate stránky Pracovních tipů (stejný brand jako /start):
//   /doporucujeme  – služby na cestu za prací (partnerské odkazy, sledované kliknutí)
//   /partneri      – partnerský program: 30 % z předplatného napořád
//   /partneri/panel/:token – osobní panel partnera (odkaz + kliknutí)
//   /admin/partneri – přehled pro Petra (x-admin-key)
// Data: Cloudinary raw JSON (stejně jako ostatní stav aplikace).
// ---------------------------------------------------------------------------
const crypto = require("crypto");
const express = require("express");
const TP_DRIVE = require("./tpdrive");

const BASE = "https://pracovnitipyai-production.up.railway.app";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const IMG = (n, w) => `https://res.cloudinary.com/rfgq6m1z/image/upload/e_upscale/c_scale,w_${w}/f_auto,q_auto:good/PracovniTipyAI/story/${n}.png`;
const GIRL = (n, w) => `https://res.cloudinary.com/rfgq6m1z/image/upload/e_background_removal/c_scale,w_${w}/f_webp,q_auto:good/PracovniTipyAI/story/${n}.png`;

const PRICE_EUR = 5;
const COMMISSION = 0.3;
const PER_SUB = (PRICE_EUR * COMMISSION).toFixed(2).replace(".", ","); // "1,50"

// Služby na stránce /doporucujeme. Partnerský odkaz se bere z proměnné prostředí,
// dokud ho Petr nedodá, vede odkaz na běžnou stránku služby (a není označen jako partnerský).
const SERVICES = [
    { key: "pojisteni", env: "EPOJISTENI_URL", fallback: "https://www.epojisteni.cz/kalkulace-cestovni/", name: "Cestovní pojištění", by: "ePojisteni.cz", img: "pojisteni",
      text: "Srovnání cestovního pojištění od více pojišťoven, sjednání online za pár minut. Karta EHIC nekryje všechno – třeba převoz domů.", tip: "Ověř si, že pojištění kryje i manuální práci." },
    { key: "skyscanner", env: "SKYSCANNER_URL", fallback: "https://www.skyscanner.cz/", name: "Letenky", by: "Skyscanner", img: "letenky",
      text: "Porovná ceny letenek mnoha aerolinek a prodejců najednou.", tip: "Letenku kupuj až s potvrzeným nástupem a zkontroluj cenu zavazadla." },
    { key: "kiwi", env: "KIWI_URL", fallback: "https://www.kiwi.com/cz/", name: "Letenky a přestupy", by: "Kiwi.com", img: "letiste",
      text: "Hledá i kombinace různých aerolinek a vlaků, když přímý let chybí.", tip: "U kombinovaných spojení si pohlídej čas na přestup." },
];
const serviceUrl = s => process.env[s.env] || s.fallback;
const isAffiliate = s => !!process.env[s.env];

const CSS = `
:root{--a:#ff6b4a;--a2:#ffc27a}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:#05070d;color:#fff;font:400 17px/1.6 Inter,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}.serif{font-family:Fraunces,Georgia,serif;font-weight:400;letter-spacing:-.03em}
em.g{font-style:italic;background:linear-gradient(90deg,var(--a2),var(--a));-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.grain{position:fixed;inset:-50%;z-index:40;pointer-events:none;opacity:.06;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");animation:gr 1s steps(4) infinite}
@keyframes gr{25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-1%)}}
.amb{position:fixed;inset:-20%;z-index:0;pointer-events:none;background:radial-gradient(40% 45% at 75% 30%,rgba(255,138,74,.35),transparent 70%),radial-gradient(35% 40% at 15% 80%,rgba(90,110,255,.18),transparent 70%);filter:blur(40px)}
.top{position:fixed;inset:0 0 auto 0;z-index:30;display:flex;justify-content:space-between;align-items:center;padding:16px clamp(18px,4vw,48px);font-size:14px;background:linear-gradient(#05070dcc,transparent)}
.top a{text-decoration:none}.top b{font-weight:600;letter-spacing:.03em}.top nav{display:flex;gap:18px;opacity:.85}.top nav a:hover{color:var(--a2)}
main{position:relative;z-index:2}
.wrap{max-width:1180px;margin:0 auto;padding:0 clamp(18px,4vw,48px)}
.hero{min-height:92svh;display:grid;grid-template-columns:1.1fr .9fr;align-items:center;gap:clamp(20px,5vw,70px);padding-top:90px}
.ch{font-size:12px;letter-spacing:.26em;text-transform:uppercase;opacity:.7;display:flex;align-items:center;gap:12px;margin:0 0 18px}
.ch:before{content:"";width:34px;height:1px;background:currentColor;opacity:.6}
h1.h{font-size:clamp(44px,6.4vw,100px);line-height:.98;margin:0 0 22px}
h2.h{font-size:clamp(34px,4.4vw,64px);line-height:1;margin:0 0 18px}
.lead{font-size:clamp(17px,1.5vw,21px);opacity:.85;max-width:560px;margin:0}
.btn{display:inline-flex;align-items:center;gap:10px;padding:18px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:16px;background:linear-gradient(90deg,#ff9a4a,var(--a));color:#fff;border:0;cursor:pointer;box-shadow:0 14px 40px -10px rgba(255,107,74,.75);transition:transform .25s;position:relative;overflow:hidden;font-family:inherit}
.btn:after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);transform:translateX(-120%);animation:sweep 3.2s ease-in-out infinite}
@keyframes sweep{60%,100%{transform:translateX(120%)}}
.btn:hover{transform:translateY(-3px) scale(1.02)}
.btn.ghost{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);box-shadow:none}.btn.ghost:after{display:none}
.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.stage{position:relative;justify-self:center;width:min(100%,440px);aspect-ratio:2/3;perspective:1200px}
.card{position:absolute;inset:0;border-radius:32px;overflow:hidden;box-shadow:0 70px 140px -40px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.1),0 0 90px -20px rgba(255,138,74,.6);transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.card .girl{inset:-4%;width:108%;height:108%;filter:drop-shadow(0 24px 30px rgba(0,0,0,.5));transform-origin:50% 100%;animation:breath 5.5s ease-in-out infinite}
@keyframes breath{0%,100%{transform:rotate(-.4deg) translateY(0)}50%{transform:rotate(.4deg) translateY(-1.2%)}}
.card .sh{position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.2) 50%,transparent 60%);background-size:260% 100%;animation:shine 8s ease-in-out infinite}
@keyframes shine{0%,72%{background-position:160% 0}100%{background-position:-60% 0}}
.coin{position:absolute;z-index:3;display:grid;place-items:center;border-radius:50%;font:700 15px Inter,sans-serif;color:#3a1c00;background:radial-gradient(circle at 35% 30%,#fff2c4,#ffc45c 45%,#e08a1c);box-shadow:0 10px 30px -6px rgba(255,170,60,.8),inset 0 -3px 0 rgba(0,0,0,.15);animation:coin 4s ease-in-out infinite}
@keyframes coin{0%,100%{transform:translateY(0) rotate(-8deg)}50%{transform:translateY(-18px) rotate(8deg)}}
section{padding:clamp(70px,10vw,130px) 0}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px;counter-reset:s}
.step{position:relative;padding:28px 26px;border-radius:24px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(12px)}
.step b{display:block;font:400 54px/1 Fraunces,Georgia,serif;background:linear-gradient(90deg,var(--a2),var(--a));-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:12px}
.step h3{margin:0 0 6px;font-size:20px}.step p{margin:0;opacity:.78}
.calc{margin-top:40px;padding:clamp(24px,4vw,44px);border-radius:28px;background:linear-gradient(135deg,rgba(255,154,74,.14),rgba(255,107,74,.05));border:1px solid rgba(255,170,110,.25);display:grid;grid-template-columns:1fr auto;gap:30px;align-items:center}
.calc input[type=range]{width:100%;accent-color:var(--a);margin:18px 0 6px}
.calc .out{font:400 clamp(48px,7vw,96px)/1 Fraunces,Georgia,serif;text-align:right}
.calc .out small{display:block;font:500 14px Inter,sans-serif;opacity:.7;margin-top:8px}
.rules{display:grid;gap:12px;margin-top:30px;max-width:820px;padding:0;list-style:none}
.rules li{padding:16px 20px 16px 52px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);position:relative}
.rules li:before{content:"✓";position:absolute;left:20px;top:15px;color:var(--a2);font-weight:700}
form.join{display:grid;gap:14px;max-width:560px;margin-top:30px}
form.join label{display:grid;gap:6px;font-size:14px;opacity:.9}
form.join input[type=text],form.join input[type=email],form.join input[type=url]{padding:16px 18px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font:inherit;outline:none;transition:border .2s}
form.join input:focus{border-color:var(--a2)}
form.join .chk{display:flex;gap:10px;align-items:flex-start;font-size:14px;opacity:.85}
form.join .hp{position:absolute;left:-9999px}
.err{color:#ff9a8a}
.svc{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:40px}
.s{position:relative;border-radius:28px;overflow:hidden;background:#0d1019;border:1px solid rgba(255,255,255,.1);text-decoration:none;display:flex;flex-direction:column;transition:transform .4s cubic-bezier(.2,.7,.2,1),box-shadow .4s}
.s:hover{transform:translateY(-6px);box-shadow:0 40px 80px -30px rgba(255,107,74,.5)}
.s .pic{position:relative;aspect-ratio:4/3;overflow:hidden}
.s .pic img{width:100%;height:100%;object-fit:cover;object-position:50% 30%;transition:transform 1.2s cubic-bezier(.2,.7,.2,1)}.s:hover .pic img{transform:scale(1.06)}
.s .pic:after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 50%,#0d1019)}
.s .bd{padding:22px 24px 26px;display:flex;flex-direction:column;gap:10px;flex:1}
.s .by{font-size:12px;letter-spacing:.2em;text-transform:uppercase;opacity:.6}
.s h3{margin:0;font:400 30px/1.05 Fraunces,Georgia,serif}
.s p{margin:0;opacity:.8;font-size:15px}.s .tip{font-size:14px;opacity:.75}.s .tip b{color:var(--a2)}
.s .go{margin-top:auto;padding-top:10px;font-weight:600;color:var(--a2)}
.badge{position:absolute;top:14px;left:14px;z-index:2;font-size:11px;letter-spacing:.08em;padding:6px 10px;border-radius:999px;background:rgba(5,7,13,.7);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.15)}
.panel{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:30px}
.box{padding:26px;border-radius:24px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.box .big{font:400 64px/1 Fraunces,Georgia,serif}
.link{display:flex;gap:10px;align-items:center;margin-top:14px;padding:12px 12px 12px 18px;border-radius:16px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);font:500 15px ui-monospace,Menlo,monospace;word-break:break-all}
.link button{flex:none;padding:10px 16px;border-radius:12px;border:0;background:#fff;color:#111;font-weight:600;cursor:pointer}
.bars{display:flex;align-items:flex-end;gap:4px;height:120px;margin-top:16px}
.bars i{flex:1;min-height:2px;border-radius:4px 4px 0 0;background:linear-gradient(var(--a2),var(--a))}
.rv{opacity:0;transform:translateY(30px);transition:opacity .9s ease,transform 1.1s cubic-bezier(.2,.7,.2,1)}.rv.on{opacity:1;transform:none}
footer{position:relative;z-index:2;padding:40px clamp(18px,4vw,48px) 50px;font-size:13px;opacity:.6;border-top:1px solid rgba(255,255,255,.08);margin-top:40px}
footer a{margin-right:16px}
@media (max-width:900px){.hero{grid-template-columns:1fr;padding-top:100px}.stage{width:min(80%,360px)}.steps,.svc,.panel{grid-template-columns:1fr}.calc{grid-template-columns:1fr}.calc .out{text-align:left}.top nav{display:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rv{opacity:1;transform:none}}
`;

const SCRIPT = `<script>
(function(){
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));
addEventListener('pointermove',e=>{document.querySelectorAll('.card').forEach(c=>{const r=c.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;const x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;c.style.setProperty('--ry',((x-.5)*10).toFixed(2)+'deg');c.style.setProperty('--rx',((.5-y)*8).toFixed(2)+'deg')})},{passive:true});
const rg=document.getElementById('subs');if(rg){const o=document.getElementById('out'),n=document.getElementById('n');const f=()=>{const v=+rg.value;n.textContent=v;o.firstChild.textContent=(v*${PRICE_EUR * COMMISSION}).toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'};rg.addEventListener('input',f);f()}
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>{navigator.clipboard.writeText(b.dataset.copy).then(()=>{b.textContent='Zkopírováno ✓';setTimeout(()=>b.textContent='Kopírovat',1800)})}));
})();
</script>`;

function page(title, desc, body) {
    return `<!doctype html><html lang="cs"><head><meta charset="utf-8">${TP_DRIVE}<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#05070d">
<meta property="og:image" content="${IMG("prace", 1200)}">
<link rel="preconnect" href="https://res.cloudinary.com"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="amb"></div><div class="grain"></div>
<header class="top"><a href="${BASE}/start"><b>Pracovní tipy</b></a><nav><a href="${BASE}/start">Cesta za prací</a><a href="${BASE}/doporucujeme">Doporučujeme</a><a href="${BASE}/partneri">Partnerský program</a></nav></header>
<main>${body}</main>
<footer><a href="${BASE}/start">Cesta za prací</a><a href="${BASE}/cv">Životopis zdarma</a><a href="${BASE}/doporucujeme">Doporučujeme</a><a href="${BASE}/partneri">Partnerský program</a><p>Pracovní tipy · Práci nezprostředkováváme, sdílíme vybrané nabídky z pracovních portálů. Ilustrace jsou vytvořené AI.</p></footer>
${SCRIPT}</body></html>`;
}

const cardArt = (img, extra = "") => `<div class="stage rv"><div class="card"><img src="${IMG(img, 1400)}" alt=""><img class="girl" src="${GIRL(img, 1400)}" alt="" onerror="this.remove()"><div class="sh"></div></div>${extra}</div>`;

module.exports = function setupPartners(app, { cloudinary }) {
    // ---- úložiště partnerů ----
    const DB_ID = "PracovniTipyAI/state/partners.json";
    let db = null, dirty = false;
    async function load() {
        if (db) return db;
        try {
            const info = await cloudinary.api.resource(DB_ID, { resource_type: "raw" });
            db = await (await fetch(`${info.secure_url}?t=${Date.now()}`)).json();
        } catch (e) { db = {}; }
        db.partners = db.partners || [];
        db.out = db.out || {};
        return db;
    }
    async function save() {
        dirty = false;
        const data = Buffer.from(JSON.stringify(db)).toString("base64");
        await cloudinary.uploader.upload(`data:application/json;base64,${data}`, { resource_type: "raw", public_id: DB_ID, overwrite: true, invalidate: true });
    }
    setInterval(() => { if (dirty) save().catch(() => { dirty = true; }); }, 60 * 1000);

    // kliknutí na HeroHero odkazy se počítají v cv.js (/go/hh?src=...) → stats.json
    let statsCache = { at: 0, data: {} };
    async function clicks() {
        if (Date.now() - statsCache.at < 5 * 60 * 1000) return statsCache.data;
        try {
            const info = await cloudinary.api.resource("PracovniTipyAI/state/stats.json", { resource_type: "raw" });
            statsCache = { at: Date.now(), data: (await (await fetch(`${info.secure_url}?t=${Date.now()}`)).json()).clicks || {} };
        } catch (e) { /* bez statistik */ }
        return statsCache.data;
    }
    const partnerClicks = (all, code) => {
        const src = `p-${code}`, days = {};
        for (const [d, v] of Object.entries(all)) if (v[src]) days[d] = v[src];
        return days;
    };

    // ---- /doporucujeme ----
    app.get("/go/out/:key", async (req, res) => {
        const s = SERVICES.find(x => x.key === req.params.key);
        if (!s) return res.redirect(302, `${BASE}/doporucujeme`);
        res.redirect(302, serviceUrl(s));
        try {
            const d = await load();
            const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
            d.out[day] = d.out[day] || {};
            d.out[day][s.key] = (d.out[day][s.key] || 0) + 1;
            dirty = true;
        } catch (e) { /* počítání nesmí rozbít přesměrování */ }
    });

    app.get("/doporucujeme", (req, res) => {
        const anyAff = SERVICES.some(isAffiliate);
        const cards = SERVICES.map((s, i) => `<a class="s rv" style="transition-delay:${i * 0.1}s" href="${BASE}/go/out/${s.key}" target="_blank" rel="noopener${isAffiliate(s) ? " sponsored" : ""}">
${isAffiliate(s) ? `<span class="badge">Partnerský odkaz</span>` : ""}<div class="pic"><img src="${IMG(s.img, 900)}" alt="" loading="lazy"></div>
<div class="bd"><span class="by">${esc(s.by)}</span><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p><p class="tip"><b>Tip:</b> ${esc(s.tip)}</p><span class="go">Otevřít ${esc(s.by)} →</span></div></a>`).join("");
        res.send(page("Doporučujeme – vše na cestu za prací | Pracovní tipy", "Cestovní pojištění, letenky a životopis zdarma – co se hodí, když jedeš za prací do zahraničí.", `
<div class="wrap"><div class="hero"><div><p class="ch rv">Doporučujeme</p><h1 class="h serif rv">Vše na cestu, <em class="g">na jednom místě.</em></h1>
<p class="lead rv">Služby, které se hodí, když jedeš za prací do zahraničí. Vybíráme jen to, co sami doporučujeme.</p>
<div class="row rv"><a class="btn" href="#sluzby">Zobrazit služby</a><a class="btn ghost" href="${BASE}/cv?src=doporucujeme">Životopis zdarma</a></div></div>
${cardArt("letiste")}</div></div>
<section id="sluzby"><div class="wrap"><p class="ch rv">Na cestu</p><h2 class="h serif rv">Pojištění a <em class="g">letenky.</em></h2>
<div class="svc">${cards}</div>
<div class="calc rv" style="grid-template-columns:1fr auto"><div><h2 class="h serif" style="margin:0">Ještě nemáš <em class="g">práci?</em></h2><p class="lead">Nové nabídky jednoduchých prací v Evropě každý den – se mzdou, městem a odkazem na přihlášku.</p></div><a class="btn" href="${BASE}/go/hh?src=doporucujeme">Nabídky – 3 dny zdarma</a></div>
${anyAff ? `<p style="opacity:.6;font-size:13px;margin-top:24px">Odkazy označené jako partnerské jsou affiliate: když přes ně nakoupíš, můžeme dostat provizi. Cenu pro tebe to nemění.</p>` : ""}
</div></section>`));
    });

    // ---- /partneri ----
    app.get("/partneri", (req, res) => {
        res.send(page("Partnerský program – 30 % napořád | Pracovní tipy", `Doporuč Pracovní tipy a dostávej 30 % z každého předplatného, dokud platí (${PER_SUB} € měsíčně za předplatitele).`, `
<div class="wrap"><div class="hero"><div><p class="ch rv">Partnerský program</p><h1 class="h serif rv">Doporuč nás a ber <em class="g">30 % napořád.</em></h1>
<p class="lead rv">Za každého, kdo si přes tvůj odkaz předplatí nabídky práce na HeroHero, dostáváš ${PER_SUB} € každý měsíc – dokud předplatné platí.</p>
<div class="row rv"><a class="btn" href="#prihlaska">Chci být partner</a><a class="btn ghost" href="#jak">Jak to funguje</a></div></div>
${cardArt("prace", `<div class="coin" style="width:74px;height:74px;left:-26px;top:18%">€</div><div class="coin" style="width:52px;height:52px;right:-14px;top:52%;animation-delay:-1.4s">€</div><div class="coin" style="width:40px;height:40px;left:12%;bottom:-10px;animation-delay:-2.4s">€</div>`)}</div></div>
<section id="jak"><div class="wrap"><p class="ch rv">Jak to funguje</p><h2 class="h serif rv">Tři kroky a <em class="g">vyděláváš.</em></h2>
<div class="steps"><div class="step rv"><b>01</b><h3>Přihlas se</h3><p>Vyplníš formulář níž a hned dostaneš svůj osobní odkaz.</p></div>
<div class="step rv" style="transition-delay:.12s"><b>02</b><h3>Sdílej odkaz</h3><p>Dej ho do bia, příběhů, videí nebo skupin, kde lidi hledají práci v zahraničí.</p></div>
<div class="step rv" style="transition-delay:.24s"><b>03</b><h3>Ber provizi</h3><p>30 % z předplatného (${PER_SUB} € měsíčně) za každého předplatitele, dokud předplatné platí.</p></div></div>
<div class="calc rv"><div><h3 style="margin:0;font-size:20px">Kolik můžeš vydělat</h3><input id="subs" type="range" min="1" max="200" value="20"><div style="opacity:.75"><span id="n">20</span> aktivních předplatitelů přes tvůj odkaz</div></div><div class="out" id="out">30,00 €<small>měsíčně</small></div></div>
</div></section>
<section><div class="wrap"><p class="ch rv">Podmínky</p><h2 class="h serif rv">Férově a <em class="g">jasně.</em></h2>
<ul class="rules rv"><li>Provize: 30 % z předplatného 5 € měsíčně, tj. ${PER_SUB} € za každého aktivního předplatitele, napořád – dokud předplatné platí.</li>
<li>V osobním panelu vidíš svůj odkaz a počet kliknutí. HeroHero nesděluje, odkud předplatitel přišel, proto nové předplatitele s tvým odkazem párujeme ručně.</li>
<li>Pravdivě: nikomu neslibuj jistou práci ani mzdu. Sdílíme nabídky z pracovních portálů, práci nezprostředkováváme.</li>
<li>Bez spamu a falešných recenzí. Uveď, že jde o partnerský odkaz.</li>
<li>Podrobnosti výplaty ti pošleme e‑mailem po schválení přihlášky.</li></ul></div></section>
<section id="prihlaska"><div class="wrap"><p class="ch rv">Přihláška</p><h2 class="h serif rv">Získej svůj <em class="g">odkaz.</em></h2>
<form class="join rv" method="post" action="${BASE}/partneri/registrace">
<label>Jméno nebo přezdívka<input type="text" name="name" required maxlength="60" autocomplete="name"></label>
<label>E‑mail<input type="email" name="email" required maxlength="120" autocomplete="email"></label>
<label>Kde budeš sdílet (odkaz na profil, web nebo skupinu)<input type="url" name="profile" required maxlength="200" placeholder="https://instagram.com/…"></label>
<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off">
<label class="chk"><input type="checkbox" name="ok" required> Souhlasím s podmínkami výše a se zpracováním údajů pro účely partnerského programu.</label>
<div><button class="btn" type="submit">Chci svůj odkaz</button></div></form></div></section>`));
    });

    const recent = new Map();
    app.post("/partneri/registrace", express.urlencoded({ extended: false, limit: "10kb" }), async (req, res) => {
        const b = req.body || {};
        if (b.website) return res.redirect(303, `${BASE}/partneri`); // honeypot
        const ip = req.ip || "";
        const now = Date.now();
        if (recent.has(ip) && now - recent.get(ip) < 30 * 1000) return res.status(429).send(page("Chvilku strpení | Pracovní tipy", "", `<div class="wrap"><div class="hero" style="min-height:70svh"><div><h1 class="h serif">Moc rychle.</h1><p class="lead">Zkus to prosím za chvilku znovu.</p></div></div></div>`));
        recent.set(ip, now);
        const name = String(b.name || "").trim().slice(0, 60);
        const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
        const profile = String(b.profile || "").trim().slice(0, 200);
        if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^https?:\/\//i.test(profile) || !b.ok) {
            return res.status(400).send(page("Chyba v přihlášce | Pracovní tipy", "", `<div class="wrap"><div class="hero" style="min-height:70svh"><div><h1 class="h serif">Něco chybí.</h1><p class="lead err">Vyplň prosím jméno, platný e‑mail, odkaz začínající https:// a potvrď souhlas.</p><div class="row"><a class="btn" href="${BASE}/partneri#prihlaska">Zpět na přihlášku</a></div></div></div></div>`));
        }
        try {
            const d = await load();
            let p = d.partners.find(x => x.email === email);
            if (!p) {
                const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "partner";
                let code;
                do { code = `${base}${crypto.randomInt(10, 99)}`; } while (d.partners.some(x => x.code === code));
                p = { code, token: crypto.randomBytes(16).toString("hex"), name, email, profile, status: "nový", createdAt: new Date().toISOString() };
                d.partners.push(p);
                await save();
                if (process.env.MAKE_LEAD_WEBHOOK) fetch(process.env.MAKE_LEAD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "partner", name, email, profile, code, panel: `${BASE}/partneri/panel/${p.token}` }) }).catch(() => {});
            }
            res.redirect(303, `${BASE}/partneri/panel/${p.token}?nove=1`);
        } catch (err) {
            res.status(500).send(page("Chyba | Pracovní tipy", "", `<div class="wrap"><div class="hero" style="min-height:70svh"><div><h1 class="h serif">Nepovedlo se.</h1><p class="lead">Přihlášku se nepodařilo uložit, zkus to prosím znovu.</p></div></div></div>`));
        }
    });

    app.get("/partneri/panel/:token", async (req, res) => {
        const d = await load();
        const p = d.partners.find(x => x.token === String(req.params.token));
        if (!p) return res.redirect(302, `${BASE}/partneri`);
        const link = `${BASE}/go/hh?src=p-${p.code}`;
        const days = partnerClicks(await clicks(), p.code);
        const total = Object.values(days).reduce((a, b) => a + b, 0);
        const last = [...Array(30)].map((_, i) => { const dt = new Date(Date.now() - (29 - i) * 864e5); const k = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(dt); return days[k] || 0; });
        const max = Math.max(1, ...last);
        res.send(page("Tvůj partnerský panel | Pracovní tipy", "", `
<div class="wrap" style="padding-top:110px"><p class="ch">${req.query.nove ? "Vítej mezi partnery" : "Partnerský panel"}</p><h1 class="h serif">Ahoj, <em class="g">${esc(p.name)}.</em></h1>
<p class="lead">Tohle je tvůj osobní odkaz. Každé kliknutí na něj se ti započítá. Tuhle stránku si ulož do záložek – je jen tvoje.</p>
<div class="link">${esc(link)}<button type="button" data-copy="${esc(link)}">Kopírovat</button></div>
<div class="panel"><div class="box"><div style="opacity:.7">Kliknutí celkem</div><div class="big">${total}</div><div class="bars">${last.map(v => `<i style="height:${Math.round((v / max) * 100)}%"></i>`).join("")}</div><div style="opacity:.6;font-size:13px;margin-top:8px">Posledních 30 dní (statistika se obnovuje po pár minutách)</div></div>
<div class="box"><div style="opacity:.7">Tvoje provize</div><div class="big">${PER_SUB} €</div><p style="opacity:.8">měsíčně za každého aktivního předplatitele přes tvůj odkaz, napořád. Předplatitele s tvým odkazem párujeme ručně, podrobnosti výplaty ti přijdou e‑mailem.</p></div></div>
<div class="row"><a class="btn ghost" href="${BASE}/start">Jak vypadá naše stránka</a></div></div>`));
    });

    app.get("/admin/partneri", async (req, res) => {
        if (!process.env.STATS_KEY || req.get("x-admin-key") !== process.env.STATS_KEY) return res.status(403).json({ ok: false });
        const d = await load();
        const all = await clicks();
        res.json({ partners: d.partners.map(p => ({ ...p, token: undefined, panel: `${BASE}/partneri/panel/${p.token}`, clicks: Object.values(partnerClicks(all, p.code)).reduce((a, b) => a + b, 0) })), outbound: d.out });
    });
};
