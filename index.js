require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createCanvas, loadImage, registerFont } = require("canvas");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

const { v2: cloudinary } = require("cloudinary");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

app.use(express.urlencoded({ extended: true }));

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const PORT = process.env.PORT || 3000;
const TEMPLATE_FOLDER = path.join(__dirname, "templates");

registerFont(
    path.join(__dirname, "fonts", "BebasNeue-Regular.ttf"),
    { family: "Bebas Neue" }
);

const heroTemplates = {
    Austria: "Herohero/Rakousko Herohero.png",
    Belgium: "Herohero/Belgie Herohero.png",
    Denmark: "Herohero/Dansko Herohero.png",
    Estonia: "Herohero/Estonsko Herohero.png",
    Finland: "Herohero/Finsko Herohero.png",
    France: "Herohero/Francie Herohero.png",
    Netherlands: "Herohero/Holandsko Herohero.png",
    Ireland: "Herohero/Irsko Herohero.png",
    Italy: "Herohero/Italie Herohero.png",
    Cyprus: "Herohero/Kypr Herohero.png",
    Malta: "Herohero/Malta Herohero.png",
    Germany: "Herohero/Nemecko Herohero.png",
    Norway: "Herohero/Norsko Herohero.png",
    Greece: "Herohero/Recko Herohero.png",
    Spain: "Herohero/Spanelsko Herohero.png",
    Sweden: "Herohero/Svedsko Herohero.png"
};

const reelTemplates = {
    Austria: "reel/Rakousko reel.png",
    Belgium: "reel/Belgie reel.png",
    Denmark: "reel/Dansko reel.png",
    Estonia: "reel/Estonsko reel.png",
    Finland: "reel/Finsko reel.png",
    France: "reel/Francie reel.png",
    Netherlands: "reel/Holandsko reel.png",
    Ireland: "reel/Irsko reel.png",
    Italy: "reel/Italie reel.png",
    Cyprus: "reel/Kypr reel.png",
    Malta: "reel/Malta reel.png",
    Germany: "reel/Nemecko reel.png",
    Norway: "reel/Norsko reel.png",
    Greece: "reel/Recko reel.png",
    Spain: "reel/Spanelsko reel.png",
    Sweden: "reel/Svedsko reel.png"
};

const countryNamesCz = {
    Austria: "Rakousko",
    Belgium: "Belgie",
    Denmark: "Dánsko",
    Estonia: "Estonsko",
    Finland: "Finsko",
    France: "Francie",
    Netherlands: "Nizozemsko",
    Ireland: "Irsko",
    Italy: "Itálie",
    Cyprus: "Kypr",
    Malta: "Malta",
    Germany: "Německo",
    Norway: "Norsko",
    Greece: "Řecko",
    Spain: "Španělsko",
    Sweden: "Švédsko"
};

function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isMissingJobValue(value) {
    const normalized = cleanText(value).toLocaleLowerCase("cs-CZ");
    if (!normalized) return true;

    return /^(?:[-•]\s*)?(?:(?:ubytování|housing|místo|město|location|mzda|plat|salary|jazyk|language|požadavky|requirements|nástup|start|strava|meals|výhody|advantages)\s*:?\s*)?(?:neuveden[^\s.,;:!?)]*|není\s+uveden[^\s.,;:!?)]*|not\s+(?:specified|provided)|unknown|n\/?a)\s*[.!]?$/iu.test(normalized);
}

function hasMissingMarker(value) {
    const normalized = cleanText(value);
    return /(?:neuveden[^\s.,;:!?)]*|není\s+uveden[^\s.,;:!?)]*|not\s+(?:specified|provided)|unknown|(?:^|[\s:;,(])n\/?a(?=$|[\s:;,.!?)]))/iu.test(normalized);
}

function usableJobValue(value) {
    const normalized = cleanText(value);
    return normalized && !isMissingJobValue(normalized) && !hasMissingMarker(normalized)
        ? normalized
        : "";
}

const countryAliases = {
    at: "Austria", austria: "Austria", rakousko: "Austria",
    be: "Belgium", belgium: "Belgium", belgie: "Belgium",
    dk: "Denmark", denmark: "Denmark", "dánsko": "Denmark", dansko: "Denmark",
    ee: "Estonia", estonia: "Estonia", estonsko: "Estonia",
    fi: "Finland", finland: "Finland", finsko: "Finland",
    fr: "France", france: "France", francie: "France",
    nl: "Netherlands", netherlands: "Netherlands", holland: "Netherlands", holandsko: "Netherlands", nizozemsko: "Netherlands", "nizozemí": "Netherlands",
    ie: "Ireland", ireland: "Ireland", irsko: "Ireland",
    it: "Italy", italy: "Italy", "itálie": "Italy", italie: "Italy",
    cy: "Cyprus", cyprus: "Cyprus", kypr: "Cyprus",
    mt: "Malta", malta: "Malta",
    de: "Germany", germany: "Germany", "německo": "Germany", nemecko: "Germany",
    no: "Norway", norway: "Norway", norsko: "Norway",
    gr: "Greece", greece: "Greece", "řecko": "Greece", recko: "Greece",
    es: "Spain", spain: "Spain", "španělsko": "Spain", spanelsko: "Spain",
    se: "Sweden", sweden: "Sweden", "švédsko": "Sweden", svedsko: "Sweden"
};

function resolveCountryKey(item) {
    for (const value of [item?.country_code, item?.country]) {
        const raw = cleanText(value);
        if (countryNamesCz[raw]) return raw;
        const normalized = raw.toLocaleLowerCase("cs-CZ");
        if (countryAliases[normalized]) return countryAliases[normalized];
    }
    return "";
}

function getJobTitle(item) {
    return usableJobValue(
        item?.job_title_cz ||
        item?.title_cz ||
        item?.jobTitleCz ||
        item?.position_cz ||
        item?.job_title ||
        item?.title
    );
}

function descriptionToText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value
            .map((item) => descriptionToText(item))
            .filter(Boolean)
            .join("\n");
    }
    if (typeof value === "object") {
        for (const key of ["text", "content", "description", "value"]) {
            if (typeof value[key] === "string") return value[key];
        }
        try {
            return JSON.stringify(value);
        } catch {
            return "";
        }
    }
    return String(value);
}

function getCountryCz(item) {
    const templateCountry = resolveCountryKey(item);
    return countryNamesCz[templateCountry] || usableJobValue(item?.country);
}

function normalizeHousing(value) {
    const raw = usableJobValue(value);
    const lower = raw.toLowerCase();

    if (!raw) return "";
    if (/not provided|no accommodation|bez ubyt|nezajiště/.test(lower)) return "";
    if (/free|included|zdarma/.test(lower)) return "Ubytování zdarma";
    if (/allowance|contribution|příspěvek/.test(lower)) return "Příspěvek na ubytování";
    if (/provided|available|arranged|zajiště|poskyt/.test(lower)) return "Ubytování zajištěno";

    const result = raw
        .replace(/accommodation/gi, "ubytování")
        .replace(/housing/gi, "ubytování")
        .replace(/provided/gi, "zajištěno")
        .replace(/available/gi, "k dispozici")
        .replace(/included/gi, "v ceně")
        .replace(/free/gi, "zdarma")
        .replace(/not specified/gi, "")
        .trim();

    return usableJobValue(result);
}

function normalizeLanguage(value) {
    const raw = usableJobValue(value);
    if (!raw) return "";

    return raw
        .replace(/\bEnglish\b/gi, "angličtina")
        .replace(/\bGerman\b/gi, "němčina")
        .replace(/\bDutch\b/gi, "nizozemština")
        .replace(/\bSpanish\b/gi, "španělština")
        .replace(/\bItalian\b/gi, "italština")
        .replace(/\bFrench\b/gi, "francouzština")
        .replace(/\bDanish\b/gi, "dánština")
        .replace(/\bSwedish\b/gi, "švédština")
        .replace(/\bNorwegian\b/gi, "norština")
        .replace(/\bFinnish\b/gi, "finština")
        .replace(/\bGreek\b/gi, "řečtina")
        .replace(/\bEstonian\b/gi, "estonština")
        .replace(/\bor\b/gi, "nebo")
        .replace(/\band\b/gi, "a");
}

function formatMonthlyCzkSalary(...values) {
    const candidates = values.map((candidate) =>
        typeof candidate === "object" && candidate !== null
            ? candidate
            : { value: candidate, monthly: false }
    );
    const amount = "\\d+(?:[ .]\\d{3})*(?:,\\d+)?";
    const moneyPattern = new RegExp(
        `(?:cca\\s*)?${amount}(?:\\s*(?:-|–|až|to)\\s*${amount})?\\s*(?:Kč|CZK)(?:\\s*(?:brutto|netto|hrubého|hrubá|hrubé|hrubý|čistého|čistá|čisté|čistý|gross|net))?(?:\\s*(?:/|za)?\\s*(?:měsíc|měsíčně|month|monthly))?`,
        "i"
    );

    for (const candidate of candidates) {
        const raw = usableJobValue(candidate.value);
        if (!raw || !/(?:Kč|CZK)/i.test(raw)) continue;

        const monthly = candidate.monthly === true ||
            /(?:měs(?:íc|íčně)?|month(?:ly)?)/i.test(raw);
        if (!monthly) continue;

        const match = raw.match(moneyPattern);
        if (!match) continue;

        let salary = match[0]
            .replace(/\bCZK\b/gi, "Kč")
            .replace(/\s+až\s+/gi, "–")
            .replace(/\s+to\s+/gi, "–")
            .replace(/\b(?:brutto|netto|hrubého|hrubá|hrubé|hrubý|hrubou|čistého|čistá|čisté|čistý|čistou|gross|net)\b/giu, "")
            .replace(/\b(?:month|monthly)\b/gi, "měsíc")
            .replace(/měsíčně/gi, "měsíc")
            .replace(/\s*(?:\/|za)?\s*měsíc/gi, " / měsíc")
            .replace(/\s+/g, " ")
            .trim();

        if (!/\/\s*měsíc/i.test(salary)) salary = `${salary} / měsíc`;
        if (!/^cca\b/i.test(salary)) salary = `cca ${salary}`;
        return salary;
    }

    return "";
}

function createWrappedLines(ctx, text, maxWidth, fontSize, fontFamily) {
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    const words = cleanText(text).split(" ").filter(Boolean);
    const lines = [];
    let line = "";

    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth || !line) line = test;
        else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function fitText(ctx, text, maxWidth, startSize, minSize, maxLines, fontFamily) {
    for (let size = startSize; size >= minSize; size--) {
        const lines = createWrappedLines(ctx, text, maxWidth, size, fontFamily);
        if (lines.length <= maxLines) return { size, lines };
    }
    return {
        size: minSize,
        lines: createWrappedLines(ctx, text, maxWidth, minSize, fontFamily)
    };
}

function drawStrokeBlock(ctx, options) {
    const {
        text, x, y, maxWidth, startSize, minSize,
        maxLines, lineWidth, lineHeight = 1.12
    } = options;

    const fitted = fitText(ctx, text, maxWidth, startSize, minSize, maxLines, "Bebas Neue");
    const actualLines = fitted.lines;

    ctx.font = `bold ${fitted.size}px Bebas Neue`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.miterLimit = 2;

    actualLines.forEach((line, index) => {
        const lineY = y + index * fitted.size * lineHeight;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = lineWidth;
        ctx.strokeText(line, x, lineY);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(line, x, lineY);
    });

    return actualLines.length * fitted.size * lineHeight;
}

function drawHeroBlock(ctx, options) {
    const {
        text, centerX, topY, maxWidth, startSize, minSize,
        maxLines, rotation = 0, lineHeight = 1.05
    } = options;

    const fitted = fitText(ctx, text, maxWidth, startSize, minSize, maxLines, "serif");
    const actualLines = fitted.lines;

    ctx.save();
    ctx.translate(centerX, topY);
    ctx.rotate(rotation);
    ctx.font = `bold ${fitted.size}px serif`;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(255,255,255,0.50)";
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;

    actualLines.forEach((line, index) => {
        ctx.fillText(line, 0, index * fitted.size * lineHeight);
    });

    ctx.restore();
    return actualLines.length * fitted.size * lineHeight;
}

async function createHeroImage(job, templateFile) {
    const fullPath = path.join(TEMPLATE_FOLDER, templateFile);
    if (!fs.existsSync(fullPath)) throw new Error(`Template not found: ${fullPath}`);

    const template = await loadImage(fullPath);
    const canvas = createCanvas(template.width, template.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(template, 0, 0);

    const scaleX = template.width / 1080;
    const scaleY = template.height / 1350;
    const fontScale = Math.min(scaleX, scaleY);

    const jobTitle = getJobTitle(job);
    const city = usableJobValue(job.city);
    const housing = normalizeHousing(job.housing || job.accommodation || job.housing_cz || job.accommodation_cz);
    const salary = formatMonthlyCzkSalary(
        { value: job.salary_czk_month, monthly: true },
        { value: job.monthly_salary_czk, monthly: true },
        { value: job.salary_month_czk, monthly: true },
        { value: job.salary_monthly_czk, monthly: true },
        { value: job.salary, monthly: false }
    );

    const titleTop = 120 * scaleY;
    const titleHeight = drawHeroBlock(ctx, {
        text: jobTitle,
        centerX: 540 * scaleX,
        topY: titleTop,
        maxWidth: 720 * scaleX,
        startSize: 68 * fontScale,
        minSize: 30 * fontScale,
        maxLines: 2,
        lineHeight: 1.02
    });

    if (city) drawHeroBlock(ctx, {
        text: city,
        centerX: 540 * scaleX,
        topY: titleTop + titleHeight + 10 * scaleY,
        maxWidth: 560 * scaleX,
        startSize: 38 * fontScale,
        minSize: 23 * fontScale,
        maxLines: 1
    });

    const housingTop = 305 * scaleY;
    let housingHeight = 0;
    if (housing) housingHeight = drawHeroBlock(ctx, {
        text: housing,
        centerX: 810 * scaleX,
        topY: housingTop,
        maxWidth: 430 * scaleX,
        startSize: 48 * fontScale,
        minSize: 27 * fontScale,
        maxLines: 2,
        rotation: -0.16,
        lineHeight: 1.02
    });

    if (salary) drawHeroBlock(ctx, {
        text: salary,
        centerX: 805 * scaleX,
        topY: housingTop + (housing ? housingHeight : 0) + 18 * scaleY,
        maxWidth: 440 * scaleX,
        startSize: 38 * fontScale,
        minSize: 23 * fontScale,
        maxLines: 2,
        rotation: -0.04
    });

    return canvas.toBuffer("image/png");
}

async function createReelImage(reel, templateFile) {
    const fullPath = path.join(TEMPLATE_FOLDER, templateFile);
    if (!fs.existsSync(fullPath)) throw new Error(`Template not found: ${fullPath}`);

    const template = await loadImage(fullPath);
    const canvas = createCanvas(template.width, template.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(template, 0, 0);

    const startX = 90;
    const startY = 220;
    const maxWidth = template.width - startX * 2;

    const country = getCountryCz(reel).toUpperCase();
    const jobTitle = getJobTitle(reel).toUpperCase();
    const salary = formatMonthlyCzkSalary(
        { value: reel.salary_czk_month, monthly: true },
        { value: reel.monthly_salary_czk, monthly: true },
        { value: reel.salary_month_czk, monthly: true },
        { value: reel.salary_monthly_czk, monthly: true },
        { value: reel.salary, monthly: false }
    ).toUpperCase();
    const housing = normalizeHousing(
        reel.housing_cz || reel.accommodation_cz || reel.housing || reel.accommodation
    ).toUpperCase();
    const language = normalizeLanguage(
        reel.language_cz || reel.languages_cz || reel.language || reel.languages
    ).toUpperCase();

    const countrySize = 135;
    let currentY = startY;

    if (country) {
        drawStrokeBlock(ctx, {
            text: country,
            x: startX,
            y: startY,
            maxWidth,
            startSize: countrySize,
            minSize: 90,
            maxLines: 1,
            lineWidth: 9
        });
        currentY += countrySize * 0.95 + 115;
    }

    currentY += drawStrokeBlock(ctx, {
        text: jobTitle,
        x: startX,
        y: currentY,
        maxWidth,
        startSize: 82,
        minSize: 38,
        maxLines: 3,
        lineWidth: 7
    }) + 30;

    if (salary) currentY += drawStrokeBlock(ctx, {
        text: salary,
        x: startX,
        y: currentY,
        maxWidth,
        startSize: 68,
        minSize: 38,
        maxLines: 2,
        lineWidth: 6
    }) + 24;

    if (housing) currentY += drawStrokeBlock(ctx, {
        text: housing,
        x: startX,
        y: currentY,
        maxWidth,
        startSize: 48,
        minSize: 30,
        maxLines: 2,
        lineWidth: 5
    }) + 12;

    if (language) drawStrokeBlock(ctx, {
        text: language,
        x: startX,
        y: currentY,
        maxWidth,
        startSize: 48,
        minSize: 30,
        maxLines: 2,
        lineWidth: 5
    });

    return canvas.toBuffer("image/png");
}

async function uploadBuffer(buffer) {
    return await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: "PracovniTipyAI" },
            (err, result) => {
                if (err) return reject(err);
                resolve(result.secure_url);
            }
        );
        stream.end(buffer);
    });
}

async function createReel(imageBuffer) {
    const id = Date.now();
    const imagePath = path.join(os.tmpdir(), `${id}.png`);
    const videoPath = path.join(os.tmpdir(), `${id}.mp4`);

    fs.writeFileSync(imagePath, imageBuffer);

    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(imagePath)
            .inputOptions(["-loop", "1", "-framerate", "25"])
            .videoCodec("libx264")
            .outputOptions([
                "-t", "8",
                "-vf", "scale=720:1280",
                "-pix_fmt", "yuv420p",
                "-preset", "ultrafast",
                "-threads", "1",
                "-movflags", "+faststart"
            ])
            .on("error", reject)
            .on("end", resolve)
            .save(videoPath);
    });

    const result = await cloudinary.uploader.upload(videoPath, {
        resource_type: "video",
        folder: "PracovniTipyAI/reels"
    });

    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);

    return result.secure_url;
}

app.get("/", (req, res) => {
    res.send("PracovniTipyAI běží");
});

function extractGenerationPayload(input, seen = new Set()) {
    if (!input) return {};

    if (typeof input === "string") {
        const cleaned = input
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
        try {
            return extractGenerationPayload(JSON.parse(cleaned), seen);
        } catch (_) {
            return {};
        }
    }

    if (typeof input !== "object" || seen.has(input)) return {};
    seen.add(input);

    if (Array.isArray(input)) {
        const merged = { jobs: [], reels: [] };
        for (const item of input) {
            const nested = extractGenerationPayload(item, seen);
            if (Array.isArray(nested.jobs)) merged.jobs.push(...nested.jobs);
            if (Array.isArray(nested.reels)) merged.reels.push(...nested.reels);
        }
        if (!merged.jobs.length && !merged.reels.length && input.length) {
            const jobLike = input.every((item) => item && typeof item === "object");
            if (jobLike) merged.jobs = input;
        }
        return merged.jobs.length || merged.reels.length ? merged : {};
    }

    const parsed = { ...input };
    const aliases = {
        herohero: "jobs",
        heroHero: "jobs",
        instagram: "reels",
        ig: "reels"
    };

    for (const [source, target] of Object.entries(aliases)) {
        if (parsed[target] === undefined && parsed[source] !== undefined) parsed[target] = parsed[source];
    }

    for (const key of ["jobs", "reels"]) {
        if (typeof parsed[key] === "string") {
            try { parsed[key] = JSON.parse(parsed[key]); }
            catch (_) { parsed[key] = []; }
        }
    }

    if (Array.isArray(parsed.jobs) || Array.isArray(parsed.reels)) return parsed;

    const jobLike = ["job_title", "jobTitle", "title", "position", "role", "country_code", "salary"]
        .some((key) => parsed[key] !== undefined);
    if (jobLike) return { jobs: [parsed] };

    const messageContent = input.choices?.[0]?.message?.content;
    if (messageContent !== undefined) {
        const nested = extractGenerationPayload(messageContent, seen);
        if (Array.isArray(nested.jobs) || Array.isArray(nested.reels)) return nested;
    }

    for (const key of [
        "body", "data", "output", "result", "response", "content", "text",
        "value", "item", "collection", "items", "payload", "json"
    ]) {
        if (input[key] !== undefined) {
            const nested = extractGenerationPayload(input[key], seen);
            if (Array.isArray(nested.jobs) || Array.isArray(nested.reels)) return nested;
        }
    }

    for (const [key, value] of Object.entries(input)) {
        if (key === "choices" || key === "jobs" || key === "reels") continue;
        const nested = extractGenerationPayload(value, seen);
        if (Array.isArray(nested.jobs) || Array.isArray(nested.reels)) return nested;
    }

    return {};
}

app.post("/generate", async (req, res) => {
    const payload = extractGenerationPayload(req.body);
    const jobs = Array.isArray(payload.jobs) ? payload.jobs.slice(0, 5) : [];
    const reels = Array.isArray(payload.reels)
        ? payload.reels.slice(0, 2)
        : jobs.slice(0, 2).map(job => ({ ...job }));

    if (jobs.length === 0 && reels.length === 0) {
        return res.status(400).json({
            success: false,
            error: "Musí být předáno jobs nebo reels"
        });
    }

    try {
        const herohero = [];
        const instagram = [];

        for (const job of jobs) {
            const templateCountry = resolveCountryKey(job);
            const template = heroTemplates[templateCountry];
            const jobTitle = getJobTitle(job);
            if (!template || !jobTitle) continue;

            const imageBuffer = await createHeroImage(job, template);
            const imageUrl = await uploadBuffer(imageBuffer);

            herohero.push({
                ...job,
                postId: job.postId,
                categoryId: job.categoryId,
                title: jobTitle,
                text: descriptionToText(job.description),
                textHtml: `<p>${descriptionToText(job.description).replace(/\n/g, "</p><p>")}</p>`,
                imageUrl,
                width: 1080,
                height: 1350,
                fileName: `${getCountryCz(job) || "Nabidka"} Herohero.png`,
                fileSize: 0,
                previewLevel: "FIRST_LINES",
                isAgeRestricted: false,
                isSponsored: false,
                isExcludedFromRss: false
            });
        }

        for (const [reelIndex, reel] of reels.entries()) {
            const matchingJob = jobs[reelIndex] || {};

            const reelForImage = {
                ...reel,
                job_title_cz:
                    reel.job_title_cz || reel.title_cz || reel.jobTitleCz || reel.position_cz ||
                    matchingJob.job_title_cz || matchingJob.title_cz || matchingJob.jobTitleCz || matchingJob.position_cz,
                salary_czk_month:
                    reel.salary_czk_month ||
                    reel.monthly_salary_czk ||
                    reel.salary_month_czk ||
                    reel.salary_monthly_czk ||
                    matchingJob.salary_czk_month ||
                    matchingJob.monthly_salary_czk ||
                    matchingJob.salary_month_czk ||
                    matchingJob.salary_monthly_czk ||
                    reel.salary ||
                    matchingJob.salary,
                housing_cz:
                    reel.housing_cz ||
                    reel.accommodation_cz ||
                    matchingJob.housing_cz ||
                    matchingJob.accommodation_cz,
                housing:
                    reel.housing ||
                    reel.accommodation ||
                    matchingJob.housing ||
                    matchingJob.accommodation,
                language_cz:
                    reel.language_cz ||
                    reel.languages_cz ||
                    matchingJob.language_cz ||
                    matchingJob.languages_cz,
                language:
                    reel.language ||
                    reel.languages ||
                    matchingJob.language ||
                    matchingJob.languages,
                country_code:
                    reel.country_code || matchingJob.country_code,
                country:
                    reel.country || matchingJob.country
            };

            const templateCountry = resolveCountryKey(reelForImage);
            const template = reelTemplates[templateCountry];
            const reelTitle = getJobTitle(reelForImage) || getJobTitle(matchingJob);
            if (!template || !reelTitle) continue;

            reelForImage.job_title = reelTitle;

            const imageBuffer = await createReelImage(reelForImage, template);
            const videoUrl = await createReel(imageBuffer);

            instagram.push({
                ...reel,
                country: getCountryCz(reelForImage),
                job_title: reelTitle,
                salary_czk_month: formatMonthlyCzkSalary(
                    { value: reelForImage.salary_czk_month, monthly: true }
                ),
                housing: normalizeHousing(
                    reelForImage.housing_cz || reelForImage.housing
                ),
                language: normalizeLanguage(
                    reelForImage.language_cz || reelForImage.language
                ),
                videoUrl
            });
        }

        res.json({
            success: true,
            herohero,
            instagram
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.post("/publishHeroHero", async (req, res) => {
    const publishHeroHero = require("./publishHeroHero");

    try {
        const result = await publishHeroHero(req.body);
        res.json({ success: true, result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post("/herohero/upload", upload.single("image"), async (req, res) => {
    res.json({ success: true });
});

app.listen(PORT);
