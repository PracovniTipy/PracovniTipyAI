"use strict";

// Týdenní karusel „Jak odjet za prací do … krok za krokem“.
// Obsah je ručně ověřený (žádné AI), obrázky se kreslí z pozadí reelů.

const path = require("path");
const { createCanvas, loadImage } = require("canvas");

const W = 1080, H = 1350;

const COUNTRIES = [
    { key: "Ireland", name: "Irsko", to: "DO IRSKA", in: "V IRSKU", bg: "reel/Irsko reel.png",
      reg: "Po příjezdu si vyřiď PPS number (osobní číslo pro práci a daně). Bez něj tě zaměstnavatel nemůže správně vyplácet.",
      stay: "Občan EU nepotřebuje povolení k pobytu ani k práci." },
    { key: "Norway", name: "Norsko", to: "DO NORSKA", in: "V NORSKU", bg: "reel/Norsko reel.png",
      reg: "Na kratší práci dostaneš D-number (D-nummer), přes který platíš daně. Požádej o daňovou kartu (skattekort).",
      stay: "Norsko není v EU, ale je v EHP: Čech tam může pracovat bez víz. Při pobytu nad 3 měsíce se registruješ u policie." },
    { key: "Netherlands", name: "Nizozemsko", to: "DO NIZOZEMSKA", in: "V NIZOZEMSKU", bg: "reel/Holandsko reel.png",
      reg: "Potřebuješ BSN (burgerservicenummer). Vyřídíš ho na obecním úřadě nebo přes registraci RNI.",
      stay: "Občan EU nepotřebuje povolení k pobytu ani k práci." },
    { key: "Germany", name: "Německo", to: "DO NĚMECKA", in: "V NĚMECKU", bg: "reel/Nemecko reel.png",
      reg: "Do 14 dnů od nastěhování se přihlas k pobytu (Anmeldung). Poté ti přijde daňové číslo (Steuer-ID).",
      stay: "Občan EU nepotřebuje povolení k pobytu ani k práci." },
    { key: "Austria", name: "Rakousko", to: "DO RAKOUSKA", in: "V RAKOUSKU", bg: "reel/Rakousko reel.png",
      reg: "Do 3 dnů od nastěhování se přihlas k pobytu (Meldezettel). Číslo sociálního pojištění ti vyřídí zaměstnavatel.",
      stay: "Občan EU nepotřebuje povolení k práci. Při pobytu nad 3 měsíce si vyřiď potvrzení o registraci." },
    { key: "Denmark", name: "Dánsko", to: "DO DÁNSKA", in: "V DÁNSKU", bg: "reel/Dansko reel.png",
      reg: "Potřebuješ CPR číslo (osobní číslo) a daňovou kartu (skattekort). Bez CPR se těžko otevírá účet i řeší lékař.",
      stay: "Občan EU nepotřebuje povolení k práci. Při pobytu nad 3 měsíce si vyřiď registrační potvrzení." },
    { key: "Sweden", name: "Švédsko", to: "DO ŠVÉDSKA", in: "VE ŠVÉDSKU", bg: "reel/Svedsko reel.png",
      reg: "Na kratší práci dostaneš samordningsnummer (koordinační číslo), při pobytu nad rok personnummer. Vyřizuje Skatteverket.",
      stay: "Občan EU nepotřebuje povolení k pobytu ani k práci." },
    { key: "Finland", name: "Finsko", to: "DO FINSKA", in: "VE FINSKU", bg: "reel/Finsko reel.png",
      reg: "Potřebuješ finské osobní číslo (henkilötunnus) a daňovou kartu (verokortti). Bez ní ti strhnou vyšší daň.",
      stay: "Občan EU nepotřebuje povolení k práci. Při pobytu nad 3 měsíce se registruješ jako občan EU." },
    { key: "Malta", name: "Malta", to: "NA MALTU", in: "NA MALTĚ", bg: "reel/Malta reel.png",
      reg: "Pro práci potřebuješ číslo sociálního pojištění. Při delším pobytu si vyřídíš maltský ID průkaz.",
      stay: "Občan EU nepotřebuje povolení k práci a domluví se anglicky – angličtina je tam úřední jazyk." },
    { key: "Cyprus", name: "Kypr", to: "NA KYPR", in: "NA KYPRU", bg: "reel/Kypr reel.png",
      reg: "Potřebuješ číslo sociálního pojištění (Social Insurance number), zaregistruje tě zaměstnavatel nebo úřad.",
      stay: "Občan EU nepotřebuje povolení k práci. Při pobytu nad 3 měsíce se registruješ (formulář MEU1)." }
];

function slidesFor(c) {
    return [
        { cover: true, title: `JAK ODJET ZA PRACÍ ${c.to}`, body: "Krok za krokem. Ulož si to, ať to máš po ruce." },
        { title: "1. DOKLADY", body: `Stačí platná občanka nebo pas, žádná víza. ${c.stay}` },
        { title: "2. ZDRAVOTNÍ POJIŠTĚNÍ", body: "Před odjezdem si u své pojišťovny vyzvedni evropský průkaz pojištění (EHIC). Po nástupu do práce budeš pojištěný v zemi, kde pracuješ." },
        { title: "3. ŽIVOTOPIS V ANGLIČTINĚ", body: "Bez anglického CV se nikam nedostaneš. Napiš nám „CV“ a sestavíš si ho s AI zdarma – česky i anglicky." },
        { title: "4. ÚŘEDNÍ ČÍSLO", body: c.reg },
        { title: "5. OVĚŘ SI NABÍDKU", body: "Nikdy neplať předem za zprostředkování práce. Chtěj písemnou smlouvu se mzdou a pracovní dobou. Firmu si dohledej na internetu." },
        { title: "6. UBYTOVÁNÍ A PENÍZE", body: "Ubytování si domluv ještě před odjezdem. Počítej s rezervou na první měsíc, než ti přijde první výplata." },
        { cover: true, end: true, title: `NABÍDKY PRÁCE ${c.in}`, body: `Každý den sdílím ověřené nabídky práce v zahraničí. Napiš do komentáře „${c.name}“ a pošlu ti víc.` }
    ];
}

function wrap(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(t).width <= maxWidth || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
}

async function renderSlide(templateFolder, c, slide, index, total, accent) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    const img = await loadImage(path.join(templateFolder, c.bg));
    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.fillStyle = slide.cover ? "rgba(0,0,0,0.45)" : "rgba(8,12,20,0.72)";
    ctx.fillRect(0, 0, W, H);

    const pad = 90;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    // horní lišta
    ctx.font = 'bold 34px "Bebas Neue"';
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText("PRACOVNÍ TIPY", pad, 70);
    ctx.textAlign = "right";
    ctx.fillText(`${index + 1}/${total}`, W - pad, 70);
    ctx.textAlign = "left";

    let y = slide.cover ? 380 : 300;
    const titleSize = slide.cover ? 120 : 96;
    ctx.font = `bold ${titleSize}px "Bebas Neue"`;
    const tLines = wrap(ctx, slide.title, W - pad * 2);
    ctx.lineJoin = "round";
    for (const line of tLines) {
        ctx.lineWidth = 10;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.strokeText(line, pad, y);
        ctx.fillStyle = slide.cover ? "#FFFFFF" : accent;
        ctx.fillText(line, pad, y);
        y += titleSize * 1.02;
    }
    ctx.fillStyle = accent;
    ctx.fillRect(pad, y + 20, 120, 8);
    y += 70;

    ctx.font = "44px sans-serif";
    ctx.fillStyle = "#FFFFFF";
    for (const line of wrap(ctx, slide.body, W - pad * 2)) {
        ctx.fillText(line, pad, y);
        y += 62;
    }

    if (slide.cover && !slide.end) {
        ctx.font = 'bold 46px "Bebas Neue"';
        ctx.fillStyle = accent;
        ctx.textAlign = "right";
        ctx.fillText("POSUŇ DOLEVA  →", W - pad, H - 140);
    }
    return canvas.toBuffer("image/png");
}

const ACCENTS = ["#FFD233", "#4FE3C1", "#FF7A59", "#7CC4FF", "#C7F25C"];

async function buildCarousel(templateFolder, index) {
    const c = COUNTRIES[index % COUNTRIES.length];
    const accent = ACCENTS[index % ACCENTS.length];
    const slides = slidesFor(c);
    const images = [];
    for (let i = 0; i < slides.length; i++) images.push(await renderSlide(templateFolder, c, slides[i], i, slides.length, accent));
    const caption = [
        `🧳 Jak odjet za prací ${c.to.toLowerCase()} – krok za krokem`,
        "",
        "Ulož si tenhle návod a pošli ho kamarádovi, který chce taky vyrazit. 🙌",
        "",
        `👉 Pro nabídky práce ${c.in.toLowerCase()} napiš do komentáře „${c.name}“.`,
        "📄 Napiš mi „CV“ a sestav si s AI životopis zdarma (CZ + EN).",
        "",
        "Informace jsou orientační, podrobnosti si vždy ověř na úřadech dané země."
    ].join("\n");
    return { country: c, images, caption };
}

module.exports = { buildCarousel, COUNTRIES };
