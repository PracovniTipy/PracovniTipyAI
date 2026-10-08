"use strict";

// Reel s „háčkem“: 1) úvodní otázka/tvrzení, 2) karta nabídky s pomalým
// přiblížením, 3) výzva k akci. Každý den jiný háček, barva i přechody.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const ffmpeg = require("fluent-ffmpeg");

const LOCATIVE = {
    "RAKOUSKO": "V RAKOUSKU", "BELGIE": "V BELGII", "DÁNSKO": "V DÁNSKU", "ESTONSKO": "V ESTONSKU", "FINSKO": "VE FINSKU",
    "FRANCIE": "VE FRANCII", "HOLANDSKO": "V NIZOZEMSKU", "NIZOZEMSKO": "V NIZOZEMSKU", "IRSKO": "V IRSKU", "ITÁLIE": "V ITÁLII",
    "KYPR": "NA KYPRU", "MALTA": "NA MALTĚ", "NĚMECKO": "V NĚMECKU", "NORSKO": "V NORSKU", "ŘECKO": "V ŘECKU",
    "ŠPANĚLSKO": "VE ŠPANĚLSKU", "ŠVÉDSKO": "VE ŠVÉDSKU"
};

const ACCENTS = ["#FFD233", "#4FE3C1", "#FF7A59", "#7CC4FF", "#C7F25C", "#FF9BD2", "#FFB347"];
const TRANSITIONS = [["fade", "fade"], ["slideup", "fade"], ["wipeleft", "wiperight"], ["circleopen", "fade"], ["smoothup", "smoothdown"], ["fadeblack", "fadeblack"]];

// Háčky – jen fakta, která známe (země, pozice, mzda, angličtina, EU bez víz).
function hooks(d) {
    const list = [
        [`HLEDÁŠ PRÁCI ${d.loc}?`, "TADY JE DNEŠNÍ TIP"],
        [`TOHLE JE PRÁCE ${d.loc},`, "O KTERÉ SE NEMLUVÍ"],
        ["STAČÍ ANGLIČTINA", `A MŮŽEŠ PRACOVAT ${d.loc}`],
        ["BEZ VÍZ, JEN S OBČANKOU:", `PRÁCE ${d.loc}`],
        ["NOVÁ NABÍDKA DNE:", `${d.title} ${d.loc}`],
        ["UŠETŘÍM TI HODINY HLEDÁNÍ.", `PRÁCE ${d.loc}`],
        [`CHCEŠ VYPADNOUT ${d.loc.startsWith("NA ") ? "NA" : "DO"} ${d.country}?`, "MÁM PRO TEBE PRÁCI"]
    ];
    if (d.salary) {
        list.push([`${d.salary} MĚSÍČNĚ`, `JAKO ${d.title}`]);
        list.push([`KOLIK SI VYDĚLÁŠ ${d.loc}`, `JAKO ${d.title}?`]);
    }
    return list;
}

function fitLines(ctx, text, maxWidth, size, minSize) {
    for (let s = size; s >= minSize; s -= 4) {
        ctx.font = `bold ${s}px "Bebas Neue"`;
        const words = text.split(/\s+/);
        const lines = [];
        let cur = "";
        for (const w of words) {
            const t = cur ? `${cur} ${w}` : w;
            if (ctx.measureText(t).width <= maxWidth || !cur) cur = t; else { lines.push(cur); cur = w; }
        }
        if (cur) lines.push(cur);
        if (lines.length <= 3 && lines.every(l => ctx.measureText(l).width <= maxWidth)) return { size: s, lines };
    }
    return { size: minSize, lines: [text] };
}

function drawCentered(ctx, text, cx, y, maxWidth, size, minSize, color) {
    const fit = fitLines(ctx, text, maxWidth, size, minSize);
    ctx.font = `bold ${fit.size}px "Bebas Neue"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    fit.lines.forEach((line, i) => {
        const ly = y + i * fit.size * 1.05;
        ctx.lineWidth = Math.max(6, fit.size * 0.1);
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(line, cx, ly);
        ctx.fillStyle = color;
        ctx.fillText(line, cx, ly);
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
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, darkness + 0.2)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, img.width, img.height);
    return { canvas, ctx, w: img.width, h: img.height };
}

async function hookFrame(templatePath, lines, accent) {
    const { canvas, ctx, w, h } = await backgroundCanvas(templatePath, 0.5);
    const maxW = w * 0.86;
    const big = Math.round(w * 0.15);
    let y = h * 0.3;
    y += drawCentered(ctx, lines[0], w / 2, y, maxW, big, Math.round(big * 0.45), "#FFFFFF") + h * 0.02;
    drawCentered(ctx, lines[1], w / 2, y, maxW, big, Math.round(big * 0.45), accent);
    return canvas.toBuffer("image/png");
}

async function ctaFrame(templatePath, country, accent) {
    const { canvas, ctx, w, h } = await backgroundCanvas(templatePath, 0.55);
    const maxW = w * 0.86;
    const big = Math.round(w * 0.13);
    let y = h * 0.3;
    y += drawCentered(ctx, "CHCEŠ VÍC NABÍDEK?", w / 2, y, maxW, big, 40, "#FFFFFF") + h * 0.03;
    y += drawCentered(ctx, "NAPIŠ DO KOMENTÁŘE", w / 2, y, maxW, Math.round(big * 0.7), 36, "#FFFFFF") + h * 0.015;
    drawCentered(ctx, `„${country}“`, w / 2, y, maxW, Math.round(big * 1.25), 50, accent);
    return canvas.toBuffer("image/png");
}

function dayNumber() {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
    return Math.floor(Date.parse(d) / 86400000);
}

let counter = 0;

async function createHookReel({ templatePath, mainImage, country, title, salary, audioPath, isMusic, upload }) {
    const day = dayNumber();
    const slot = counter++;
    const COUNTRY = String(country || "").toUpperCase();
    const data = {
        country: COUNTRY,
        loc: LOCATIVE[COUNTRY] || `V ZEMI ${COUNTRY}`,
        title: String(title || "").toUpperCase().slice(0, 40),
        salary: String(salary || "").toUpperCase().replace(/\s*\/\s*MĚSÍC.*$/i, "")
    };
    const list = hooks(data);
    const hook = list[(day * 3 + slot) % list.length];
    const accent = ACCENTS[(day + slot) % ACCENTS.length];
    const [t1, t2] = TRANSITIONS[(day + slot * 2) % TRANSITIONS.length];

    const id = `${Date.now()}-${slot}`;
    const tmp = n => path.join(os.tmpdir(), `${id}-${n}`);
    const files = { hook: tmp("hook.png"), main: tmp("main.png"), cta: tmp("cta.png"), out: tmp("reel.mp4") };
    fs.writeFileSync(files.hook, await hookFrame(templatePath, hook, accent));
    fs.writeFileSync(files.main, mainImage);
    fs.writeFileSync(files.cta, await ctaFrame(templatePath, COUNTRY, accent));

    const D1 = 2.6, D2 = 5.4, D3 = 2.8, X = 0.45;
    const total = D1 + D2 + D3 - 2 * X;
    const scale = "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=25,format=yuv420p";
    const filters = [
        `[0:v]${scale},zoompan=z='min(zoom+0.0012,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=25,trim=duration=${D1}[a]`,
        `[1:v]${scale},zoompan=z='min(zoom+0.0006,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=25,trim=duration=${D2}[b]`,
        `[2:v]${scale},trim=duration=${D3}[c]`,
        `[a][b]xfade=transition=${t1}:duration=${X}:offset=${(D1 - X).toFixed(2)}[ab]`,
        `[ab][c]xfade=transition=${t2}:duration=${X}:offset=${(D1 + D2 - 2 * X).toFixed(2)},format=yuv420p[v]`
    ];
    const audio = audioPath && fs.existsSync(audioPath);
    if (audio) filters.push(isMusic
        ? `[3:a]atrim=duration=${total.toFixed(2)},afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[aud]`
        : `[3:a]atrim=duration=${total.toFixed(2)}[aud]`);

    await new Promise((resolve, reject) => {
        const cmd = ffmpeg()
            .input(files.hook).inputOptions(["-loop 1", `-t ${D1}`])
            .input(files.main).inputOptions(["-loop 1", `-t ${D2}`])
            .input(files.cta).inputOptions(["-loop 1", `-t ${D3}`]);
        if (audio) cmd.input(audioPath).inputOptions(isMusic ? ["-ss 8"] : []);
        cmd.complexFilter(filters)
            .outputOptions([
                "-map [v]", ...(audio ? ["-map [aud]", "-c:a aac", "-b:a 160k"] : ["-an"]),
                "-c:v libx264", "-preset veryfast", "-threads 1", "-pix_fmt yuv420p",
                `-t ${total.toFixed(2)}`, "-movflags +faststart"
            ])
            .on("error", reject)
            .on("end", resolve)
            .save(files.out);
    });

    try {
        return await upload(files.out);
    } finally {
        for (const f of Object.values(files)) if (fs.existsSync(f)) fs.unlinkSync(f);
    }
}

module.exports = { createHookReel };
