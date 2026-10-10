"use strict";

// Reely Pracovních tipů – vždy JEDNA fotka (bez střídání obrázků):
//  • reel s nabídkou: háček nahoře + země, pozice, mzda, ubytování, jazyk
//  • reel o účtu: co Pracovní tipy nabízí (každý den jiný text)
// Pomalé přiblížení fotky + hudba. Každý den jiný háček a barva.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const ffmpeg = require("fluent-ffmpeg");

// „V Irsku“ / „do Irska“ – správné tvary pro češtinu.
const LOCATIVE = {
    "RAKOUSKO": "V RAKOUSKU", "BELGIE": "V BELGII", "DÁNSKO": "V DÁNSKU", "ESTONSKO": "V ESTONSKU", "FINSKO": "VE FINSKU",
    "FRANCIE": "VE FRANCII", "HOLANDSKO": "V NIZOZEMSKU", "NIZOZEMSKO": "V NIZOZEMSKU", "IRSKO": "V IRSKU", "ITÁLIE": "V ITÁLII",
    "KYPR": "NA KYPRU", "MALTA": "NA MALTĚ", "NĚMECKO": "V NĚMECKU", "NORSKO": "V NORSKU", "ŘECKO": "V ŘECKU",
    "ŠPANĚLSKO": "VE ŠPANĚLSKU", "ŠVÉDSKO": "VE ŠVÉDSKU"
};
const DIRECTION = {
    "RAKOUSKO": "DO RAKOUSKA", "BELGIE": "DO BELGIE", "DÁNSKO": "DO DÁNSKA", "ESTONSKO": "DO ESTONSKA", "FINSKO": "DO FINSKA",
    "FRANCIE": "DO FRANCIE", "HOLANDSKO": "DO NIZOZEMSKA", "NIZOZEMSKO": "DO NIZOZEMSKA", "IRSKO": "DO IRSKA", "ITÁLIE": "DO ITÁLIE",
    "KYPR": "NA KYPR", "MALTA": "NA MALTU", "NĚMECKO": "DO NĚMECKA", "NORSKO": "DO NORSKA", "ŘECKO": "DO ŘECKA",
    "ŠPANĚLSKO": "DO ŠPANĚLSKA", "ŠVÉDSKO": "DO ŠVÉDSKA"
};

const ACCENTS = ["#FFD233", "#4FE3C1", "#FF7A59", "#7CC4FF", "#C7F25C", "#FF9BD2", "#FFB347"];

// Háčky – jen fakta, která opravdu víme (země, mzda, angličtina, EU bez víz).
function hooks(d) {
    const list = [
        [`HLEDÁŠ PRÁCI ${d.loc}?`, "TADY JE DNEŠNÍ TIP"],
        [`TOHLE JE PRÁCE ${d.loc},`, "O KTERÉ SE NEMLUVÍ"],
        ["STAČÍ ANGLIČTINA", `A MŮŽEŠ PRACOVAT ${d.loc}`],
        ["BEZ VÍZ, JEN S OBČANKOU:", `PRÁCE ${d.loc}`],
        ["NOVÁ NABÍDKA DNE", d.loc],
        ["UŠETŘÍM TI HODINY HLEDÁNÍ.", `PRÁCE ${d.loc}`],
        [`CHCEŠ VYPADNOUT ${d.dir}?`, "MÁM PRO TEBE PRÁCI"]
    ];
    if (d.salary) list.push(["KOLIK SI VYDĚLÁŠ", `${d.loc}?`]);
    return list;
}

function fitLines(ctx, text, maxWidth, size, minSize, maxLines = 3) {
    for (let s = size; s >= minSize; s -= 4) {
        ctx.font = `bold ${s}px "Bebas Neue"`;
        const words = String(text).split(/\s+/);
        const lines = [];
        let cur = "";
        for (const w of words) {
            const t = cur ? `${cur} ${w}` : w;
            if (ctx.measureText(t).width <= maxWidth || !cur) cur = t; else { lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        if (lines.length <= maxLines && lines.every(l => ctx.measureText(l).width <= maxWidth)) return { size: s, lines };
    }
    return { size: minSize, lines: [String(text)] };
}

function drawText(ctx, text, x, y, maxWidth, size, minSize, color, align = "center", maxLines = 3) {
    const fit = fitLines(ctx, text, maxWidth, size, minSize, maxLines);
    ctx.font = `bold ${fit.size}px "Bebas Neue"`;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    fit.lines.forEach((line, i) => {
        const ly = y + i * fit.size * 1.05;
        ctx.lineWidth = Math.max(6, fit.size * 0.1);
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(line, x, ly);
        ctx.fillStyle = color;
        ctx.fillText(line, x, ly);
    });
    return fit.lines.length * fit.size * 1.05;
}

async function backgroundCanvas(templatePath, darkness) {
    const img = await loadImage(templatePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, img.height);
    g.addColorStop(0, `rgba(0,0,0,${darkness})`);
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, darkness + 0.25)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, img.width, img.height);
    return { canvas, ctx, w: img.width, h: img.height };
}

function dayNumber() {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
    return Math.floor(Date.parse(d) / 86400000);
}

// Jedna fotka s nabídkou.
async function jobFrame(templatePath, d, hook, accent) {
    const { canvas, ctx, w, h } = await backgroundCanvas(templatePath, 0.5);
    const maxW = w * 0.86;
    const cx = w / 2;
    let y = h * 0.08;
    y += drawText(ctx, hook[0], cx, y, maxW, Math.round(w * 0.085), 40, "#FFFFFF", "center", 2);
    y += drawText(ctx, hook[1], cx, y, maxW, Math.round(w * 0.085), 40, accent, "center", 2);

    // informační blok
    y = Math.max(y + h * 0.04, h * 0.3);
    y += drawText(ctx, d.country, cx, y, maxW, Math.round(w * 0.15), 60, "#FFFFFF", "center", 1) + h * 0.01;
    y += drawText(ctx, d.title, cx, y, maxW, Math.round(w * 0.08), 40, "#FFFFFF", "center", 2) + h * 0.028;
    const rows = [];
    if (d.salary) rows.push(["MZDA", d.salary]);
    if (d.housing) rows.push(["UBYTOVÁNÍ", d.housing.replace(/^UBYTOVÁNÍ\s*/i, "")]);
    rows.push(["JAZYK", d.language || "ANGLIČTINA"]);
    if (d.city) rows.push(["MÍSTO", d.city]);
    for (const [label, value] of rows) {
        y += drawText(ctx, label, cx, y, maxW, Math.round(w * 0.04), 26, accent, "center", 1) + 2;
        y += drawText(ctx, value, cx, y, maxW, Math.round(w * 0.06), 32, "#FFFFFF", "center", 2) + h * 0.016;
    }

    // výzva dole
    const by = h * 0.85;
    drawText(ctx, `NAPIŠ DO KOMENTÁŘE „${d.country}“`, cx, by, maxW, Math.round(w * 0.068), 36, accent, "center", 1);
    drawText(ctx, "A POŠLU TI DALŠÍ NABÍDKY", cx, by + w * 0.08, maxW, Math.round(w * 0.048), 28, "#FFFFFF", "center", 1);
    return canvas.toBuffer("image/png");
}

// Texty pro reel o účtu – každý den jiný.
const BRAND = [
    { a: "PRACOVNÍ TIPY", b: "PRÁCE V ZAHRANIČÍ BEZ HODIN HLEDÁNÍ", rows: ["KAŽDÝ DEN 5 OVĚŘENÝCH NABÍDEK", "FARMY • HOTELY • SKLADY • TOVÁRNY", "STAČÍ ANGLIČTINA, ŽÁDNÁ VÍZA"], cta: "SLEDUJ, AŤ TI NIC NEUTEČE" },
    { a: "CHCEŠ PRACOVAT", b: "V ZAHRANIČÍ?", rows: ["VYBÍRÁM OVĚŘENÉ NABÍDKY Z CELÉ EVROPY", "S MZDOU, UBYTOVÁNÍM A KONTAKTEM", "NOVÉ NABÍDKY KAŽDÝ DEN"], cta: "SLEDUJ PRACOVNÍ TIPY" },
    { a: "NEMÁŠ ŽIVOTOPIS", b: "V ANGLIČTINĚ?", rows: ["SESTAV SI HO S AI ZDARMA", "ČESKY I ANGLICKY", "STAČÍ ODPOVĚDĚT NA PÁR OTÁZEK"], cta: "NAPIŠ MI „CV“" },
    { a: "DO EU NEPOTŘEBUJEŠ", b: "ŽÁDNÁ VÍZA", rows: ["STAČÍ OBČANKA NEBO PAS", "PRÁCE ČEKÁ NA FARMÁCH, V HOTELÍCH I SKLADECH", "IRSKO • NORSKO • MALTA • KYPR A DALŠÍ"], cta: "SLEDUJ PRACOVNÍ TIPY" },
    { a: "PRÁCI NEZPROSTŘEDKOVÁVÁM", b: "JEN SDÍLÍM OVĚŘENÉ NABÍDKY", rows: ["ŽÁDNÉ POPLATKY ZA ZPROSTŘEDKOVÁNÍ", "PŘIHLAŠUJEŠ SE PŘÍMO U ZAMĚSTNAVATELE", "KAŽDÝ DEN NOVÉ NABÍDKY"], cta: "SLEDUJ, AŤ TI NIC NEUTEČE" },
    { a: "KAM ZA PRACÍ", b: "TENHLE TÝDEN?", rows: ["NABÍDKY Z IRSKA, MALTY, KYPRU A DALŠÍCH ZEMÍ", "S INFORMACEMI O MZDĚ A UBYTOVÁNÍ", "NAPIŠ ZEMI DO KOMENTÁŘE"], cta: "POŠLU TI NABÍDKY" }
];

async function brandFrame(templatePath, b, accent) {
    const { canvas, ctx, w, h } = await backgroundCanvas(templatePath, 0.55);
    const maxW = w * 0.86;
    const cx = w / 2;
    let y = h * 0.14;
    y += drawText(ctx, b.a, cx, y, maxW, Math.round(w * 0.11), 48, "#FFFFFF", "center", 2);
    y += drawText(ctx, b.b, cx, y, maxW, Math.round(w * 0.11), 48, accent, "center", 2) + h * 0.06;
    for (const r of b.rows) y += drawText(ctx, r, cx, y, maxW, Math.round(w * 0.06), 30, "#FFFFFF", "center", 2) + h * 0.022;
    drawText(ctx, b.cta, cx, h * 0.8, maxW, Math.round(w * 0.085), 40, accent, "center", 2);
    drawText(ctx, "@PRACOVNI_TIPY", cx, h * 0.8 + w * 0.12, maxW, Math.round(w * 0.05), 28, "#FFFFFF", "center", 1);
    return canvas.toBuffer("image/png");
}

// Z jedné fotky udělá video s pomalým přiblížením a hudbou.
async function renderVideo(png, { audioPath, isMusic, upload }, seconds = 8) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const img = path.join(os.tmpdir(), `${id}.png`);
    const out = path.join(os.tmpdir(), `${id}.mp4`);
    fs.writeFileSync(img, png);
    const audio = audioPath && fs.existsSync(audioPath);
    const filters = [
        `[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=25,zoompan=z='min(zoom+0.0005,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=25,trim=duration=${seconds},format=yuv420p[v]`
    ];
    if (audio) filters.push(isMusic
        ? `[1:a]atrim=duration=${seconds},afade=t=in:st=0:d=0.3,afade=t=out:st=${seconds - 1.2}:d=1.2[aud]`
        : `[1:a]atrim=duration=${seconds}[aud]`);
    try {
        await new Promise((resolve, reject) => {
            const cmd = ffmpeg().input(img).inputOptions(["-loop 1", `-t ${seconds}`]);
            if (audio) cmd.input(audioPath).inputOptions(isMusic ? ["-ss 8"] : []);
            cmd.complexFilter(filters)
                .outputOptions([
                    "-map [v]", ...(audio ? ["-map [aud]", "-c:a aac", "-b:a 160k"] : ["-an"]),
                    "-c:v libx264", "-preset veryfast", "-threads 1", "-pix_fmt yuv420p",
                    `-t ${seconds}`, "-movflags +faststart"
                ])
                .on("error", reject).on("end", resolve).save(out);
        });
        return await upload(out);
    } finally {
        for (const f of [img, out]) if (fs.existsSync(f)) fs.unlinkSync(f);
    }
}

let counter = 0;

// Reel s nabídkou (jedna fotka se všemi informacemi).
async function createHookReel({ templatePath, country, title, salary, housing, language, city, audioPath, isMusic, upload }) {
    const day = dayNumber();
    const slot = counter++;
    const COUNTRY = String(country || "").toUpperCase();
    const CITY = String(city || "").toUpperCase();
    const d = {
        country: COUNTRY,
        loc: LOCATIVE[COUNTRY] || `V ZEMI ${COUNTRY}`,
        dir: DIRECTION[COUNTRY] || `DO ZEMĚ ${COUNTRY}`,
        title: String(title || "").toUpperCase().slice(0, 48),
        salary: String(salary || "").toUpperCase(),
        housing: String(housing || "").toUpperCase(),
        language: String(language || "").toUpperCase(),
        city: CITY && CITY !== COUNTRY && !/^(IRELAND|MALTA|CYPRUS|SWEDEN|NORWAY|FINLAND|DENMARK|AUSTRIA|GERMANY|NETHERLANDS|GREECE|SPAIN|ITALY|FRANCE|BELGIUM|ESTONIA)$/.test(CITY) ? CITY : ""
    };
    const list = hooks(d);
    const hook = list[(day * 3 + slot) % list.length];
    const accent = ACCENTS[(day + slot) % ACCENTS.length];
    return renderVideo(await jobFrame(templatePath, d, hook, accent), { audioPath, isMusic, upload });
}

// Reel o účtu Pracovní tipy.
async function createBrandReel({ templatePath, audioPath, isMusic, upload }) {
    const day = dayNumber();
    const b = BRAND[day % BRAND.length];
    const accent = ACCENTS[(day + 3) % ACCENTS.length];
    const videoUrl = await renderVideo(await brandFrame(templatePath, b, accent), { audioPath, isMusic, upload });
    const captions = [
        "🌍 Pracovní tipy – každý den ověřené nabídky práce v zahraničí.\n\nFarmy, hotely, sklady, továrny. Stačí angličtina, do EU nepotřebuješ víza.\n\n👉 Sleduj účet, ať ti žádná nabídka neuteče.\n📄 Napiš mi „CV“ a sestav si s AI životopis zdarma (CZ + EN).",
        "💼 Chceš pracovat v zahraničí, ale nevíš, kde začít?\n\nKaždý den vybírám ověřené nabídky s mzdou, ubytováním a kontaktem.\n\n👉 Napiš do komentáře zemi, která tě zajímá, a pošlu ti nabídky.\n📄 Napiš mi „CV“ a sestav si s AI životopis zdarma.",
        "📄 Nemáš životopis v angličtině? Napiš mi „CV“.\n\nAI se tě zeptá na pár otázek a sestaví ti životopis česky i anglicky – zdarma.\n\n🌍 Každý den sdílím ověřené nabídky práce v zahraničí."
    ];
    return { videoUrl, caption: captions[day % captions.length] };
}

// Náhledy (jen obrázek, bez videa) pro kontrolu vzhledu.
async function previewJob(templatePath, data, slot = 0) {
    const COUNTRY = String(data.country || "").toUpperCase();
    const d = { country: COUNTRY, loc: LOCATIVE[COUNTRY] || COUNTRY, dir: DIRECTION[COUNTRY] || COUNTRY, title: String(data.title || "").toUpperCase(),
        salary: String(data.salary || "").toUpperCase(), housing: String(data.housing || "").toUpperCase(), language: String(data.language || "ANGLIČTINA").toUpperCase(), city: String(data.city || "").toUpperCase() };
    const list = hooks(d);
    return jobFrame(templatePath, d, list[(dayNumber() * 3 + slot) % list.length], ACCENTS[(dayNumber() + slot) % ACCENTS.length]);
}
async function previewBrand(templatePath, offset = 0) {
    const day = dayNumber() + offset;
    return brandFrame(templatePath, BRAND[((day % BRAND.length) + BRAND.length) % BRAND.length], ACCENTS[(day + 3) % ACCENTS.length]);
}

module.exports = { createHookReel, createBrandReel, previewJob, previewBrand };
