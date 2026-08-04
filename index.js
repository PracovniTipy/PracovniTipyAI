require("dotenv").config();

const { chromium } = require("playwright");

const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createCanvas, loadImage } = require("canvas");
const { registerFont } = require("canvas");

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

cloudinary.api.ping()
    .then(r => console.log("PING:", r))
    .catch(e => console.error("PING ERROR:", e));

const PORT = process.env.PORT || 3000;

const TEMPLATE_FOLDER = path.join(__dirname, "templates");
registerFont(
    path.join(__dirname, "fonts", "BebasNeue-Regular.ttf"),
    {
        family: "Bebas Neue"
    }
);

console.log("Templates:", TEMPLATE_FOLDER);

console.log("Exists:", fs.existsSync(TEMPLATE_FOLDER));
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

function wrapText(ctx, text, maxWidth, startSize) {
    let size = startSize;
    while (size >= 20) {
        ctx.font = `bold ${size}px Bebas Neue`;
        const words = (text || "").split(" ");
        const lines = [];
        let line = "";

        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width <= maxWidth) {
                line = test;
            } else {
                if (line) lines.push(line);
                line = word;
            }
        }
        if (line) lines.push(line);

        if (lines.length <= 2) {
            return { size, lines };
        }
        size--;
    }
    return {
        size: 20,
        lines: [text]
    };
}

function isMissingValue(value) {
    if (value === null || value === undefined) return true;
    const normalized = String(value).trim().toLowerCase();
    return !normalized || ["neuvedeno", "neuvedena", "neuveden", "není uvedeno", "n/a", "unknown"].includes(normalized);
}

function naturalFallback(value, fallback) {
    return isMissingValue(value) ? fallback : String(value).trim();
}

const CZK_RATES = {
    EUR: Number(process.env.EUR_CZK || 24.5),
    NOK: Number(process.env.NOK_CZK || 2.1),
    SEK: Number(process.env.SEK_CZK || 2.2),
    DKK: Number(process.env.DKK_CZK || 3.28),
    CZK: 1
};

function formatCzk(value) {
    return Math.round(value / 500) * 500;
}

function convertSalaryToCzkMonth(job) {
    if (!isMissingValue(job.salary_czk_month)) {
        const supplied = String(job.salary_czk_month).trim();
        return /kč/i.test(supplied) ? supplied : `${supplied} Kč / měsíc`;
    }

    const raw = naturalFallback(job.salary, "");
    if (!raw) return "Mzda neuvedena";
    const lower = raw.toLowerCase();
    const currency = /(?:€|\beur\b)/i.test(raw) ? "EUR"
        : /\bnok\b/i.test(raw) ? "NOK"
        : /\bsek\b/i.test(raw) ? "SEK"
        : /\bdkk\b/i.test(raw) ? "DKK"
        : /(?:kč|\bczk\b)/i.test(raw) ? "CZK" : null;
    if (!currency) return raw;

    const values = [...raw.matchAll(/\d[\d\s.,]*/g)]
        .map(match => {
            let value = match[0].replace(/\s/g, "");
            if (value.includes(",") && value.includes(".")) value = value.replace(/\./g, "").replace(",", ".");
            else if (value.includes(",")) value = value.replace(",", ".");
            else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) value = value.replace(/\./g, "");
            return Number(value);
        })
        .filter(Number.isFinite)
        .slice(0, 2);
    if (values.length === 0) return raw;

    const multiplier = /(hod|hour|uur|\/h\b|per h)/i.test(lower) ? 173.33
        : /(týd|week|weekly)/i.test(lower) ? 4.333
        : /(rok|year|annual)/i.test(lower) ? 1 / 12 : 1;
    const label = /netto|net\b|čist/i.test(lower) ? " netto" : /brutto|gross|hrub/i.test(lower) ? " brutto" : "";
    const converted = values.map(value => formatCzk(value * CZK_RATES[currency] * multiplier));
    const amount = converted.length > 1 && converted[1] !== converted[0]
        ? `${converted[0].toLocaleString("cs-CZ")}–${converted[1].toLocaleString("cs-CZ")}`
        : converted[0].toLocaleString("cs-CZ");
    return `cca ${amount} Kč${label} / měsíc`;
}

function isDirectJobLink(value) {
    if (isMissingValue(value)) return false;
    try {
        const url = new URL(String(value).trim());
        const pathName = url.pathname.replace(/\/+$/, "");
        if (!/^https?:$/.test(url.protocol) || !pathName || pathName === "/") return false;
        const genericPaths = /^\/(jobs?|vacancies|careers?|search|find-a-job|work|home|en|cs|nl|de|fr)?$/i;
        return !genericPaths.test(pathName);
    } catch (_) {
        return false;
    }
}

async function createImage(job, templateFile) {
    const fullPath = path.join(TEMPLATE_FOLDER, templateFile);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Template not found: ${fullPath}`);
    }

    const template = await loadImage(fullPath);
    const canvas = createCanvas(template.width, template.height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(template, 0, 0);

    const isReel = templateFile.startsWith("reel/");
    const layout = isReel
        ? { startX: 90, startY: 220, country: 135, title: 85, salary: 72, detail: 48, countryGap: 45, titleGap: 22, salaryGap: 20, detailGap: 34 }
        : { startX: 82, startY: 92, country: 112, title: 69, salary: 58, detail: 40, countryGap: 12, titleGap: 16, salaryGap: 12, detailGap: 22 };
    const startX = layout.startX;
    const startY = layout.startY;
    const maxWidth = template.width - (startX * 2);

    // 1. COUNTRY
    let countrySize = layout.country;
    ctx.font = `bold ${countrySize}px Bebas Neue`;
    const countryText = (job.country || "").toUpperCase();

    // 2. JOB TITLE
    let jobTitleText = (job.job_title || "").toUpperCase();
    let jobWrapped = wrapText(ctx, jobTitleText, maxWidth, layout.title);
    let jobSize = jobWrapped.size;
    if (jobWrapped.lines.length > 2) {
        jobSize = Math.max(35, jobSize - 10);
    }

    // Všechny texty na obrázku vycházejí ze stejných polí jako popisek.
    // Žádné natvrdo zadané „ubytování zajištěno“ ani „angličtina“.
    const salaryText = naturalFallback(job.salary_czk_month, naturalFallback(job.salary, "Mzda neuvedena")).toUpperCase();
    const accommodationText = naturalFallback(job.accommodation, "Ubytování neuvedeno").toUpperCase();
    const languageText = naturalFallback(job.language, "Jazyk neuveden").toUpperCase();

    // 4 & 5. UBYTOVÁNÍ & ANGLIČTINA
    let bottomSize = layout.detail;

    const drawLineWithStroke = (text, x, y, size, lineWidth = 5) => {
        if (!text) return;
        ctx.font = `bold ${size}px Bebas Neue`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.miterLimit = 2;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = lineWidth;
        ctx.strokeText(text, x, y);

        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x, y);
        ctx.restore();
    };

    const drawWrappedTextWithStroke = (text, x, y, maxLineWidth, startSize, lineWidth = 5, maxLines = 2) => {
        const wrapped = wrapText(ctx, text, maxLineWidth, startSize);
        const lines = wrapped.lines.slice(0, maxLines);
        lines.forEach((line, index) => {
            drawLineWithStroke(line, x, y + (index * wrapped.size * 1.12), wrapped.size, lineWidth);
        });
        return lines.length * wrapped.size * 1.12;
    };

    let currentY = startY;

    // Render Country
    drawLineWithStroke(countryText, startX, currentY, countrySize, 9);
    currentY += countrySize * 0.95 + layout.countryGap;

    // Render Job Title
    ctx.font = `bold ${jobSize}px Bebas Neue`;
    const currentJobWrapped = wrapText(ctx, jobTitleText, maxWidth, jobSize);
    currentJobWrapped.lines.forEach((line, index) => {
        drawLineWithStroke(line, startX, currentY + (index * jobSize * 1.15), jobSize, 7);
    });
    currentY += currentJobWrapped.lines.length * jobSize * 1.15 + layout.titleGap;

    // Render Salary. Dlouhá mzda se zmenší nebo zalomí maximálně na 2 řádky,
    // takže už nikdy nepřeteče mimo obrázek.
    currentY += drawWrappedTextWithStroke(salaryText, startX, currentY, maxWidth, layout.salary, 6, 2) + layout.salaryGap;

    // Render Ubytování
    currentY += drawWrappedTextWithStroke(accommodationText, startX, currentY, maxWidth, bottomSize, 5, 2);
    currentY += layout.detailGap;

    // Render Jazyk
    drawWrappedTextWithStroke(languageText, startX, currentY, maxWidth, bottomSize, 5, 2);

    return canvas.toBuffer("image/png");
}

async function uploadBuffer(buffer) {
    console.log("FFmpeg START");  
    
    return await new Promise((resolve, reject) => {
        console.log("FFmpeg HOTOVO");
        
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "PracovniTipyAI"
            },
            (err, result) => {
                if (err) {
                    return reject(err);
                }
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
            .inputOptions([
                "-loop", "1",
                "-framerate", "25"
            ])
            .videoCodec("libx264")
            .outputOptions([
                "-t", "8",
                "-vf", "scale=720:1280",
                "-pix_fmt", "yuv420p",
                "-preset", "ultrafast",
                "-threads", "1",
                "-movflags", "+faststart"
            ])
            .on("start", cmd => {
                console.log("FFMPEG CMD:");
                console.log(cmd);
            })
            .on("stderr", line => {
                console.log("FFMPEG:", line);
            })
            .on("error", err => {
                console.log("FFMPEG ERROR:");
                console.error(err);
                reject(err);
            })
            .on("end", () => {
                console.log("FFMPEG END");
                resolve();
            })
            .save(videoPath);
    });
    console.log("Video existuje:", fs.existsSync(videoPath));

    if (fs.existsSync(videoPath)) {
        console.log("Velikost videa:", fs.statSync(videoPath).size);
    }

    console.log("Cesta:", videoPath);
    console.log("UPLOAD VIDEO START");

    let result;

    try {
        console.log("Zacinam upload do Cloudinary...");
        result = await cloudinary.uploader.upload(videoPath, {
            resource_type: "video",
            folder: "PracovniTipyAI/reels"
        });
        console.log("UPLOAD VIDEO HOTOVO");
        console.log("VIDEO URL:", result.secure_url);
        console.dir(result, { depth: null });
    } catch (e) {
        console.log("UPLOAD VIDEO CHYBA");
        console.dir(e, { depth: null });
        throw e;
    }

    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);

    return result.secure_url;
}

app.get("/", (req, res) => {
    res.send("PracovniTipyAI běží");
});

app.post("/generate", async (req, res) => {
    console.log("REQUEST PRIJATA");
    console.dir(req.body, { depth: null });

    const seenLinks = new Set();
    const jobs = Array.isArray(req.body.jobs)
        ? req.body.jobs
            .filter(job => {
                if (!isDirectJobLink(job.link)) {
                    console.log("SKIPPING NON-DIRECT JOB LINK:", job.link);
                    return false;
                }
                const normalizedLink = String(job.link).trim().toLowerCase();
                if (seenLinks.has(normalizedLink)) return false;
                seenLinks.add(normalizedLink);
                return true;
            })
            .slice(0, 5)
            .map(job => ({ ...job, salary_czk_month: convertSalaryToCzkMonth(job) }))
        : [];
    const reels = Array.isArray(req.body.reels)
        ? req.body.reels.filter(reel => seenLinks.has(String(reel.link || "").trim().toLowerCase())).slice(0, 2)
        : [];

    console.log("JOBS COUNT:", jobs.length);
    console.log("REELS COUNT:", reels.length);

    const expectedReels = Math.min(2, jobs.length);
    if (jobs.length === 0 || reels.length !== expectedReels) {
        return res.status(422).json({
            success: false,
            error: `Očekávám 1 až 5 jobs a ${expectedReels} reels, přijato ${jobs.length} jobs a ${reels.length} reels.`
        });
    }

    try {
        const herohero = [];
        const instagram = [];

        // HEROHERO
        for (const job of jobs) {
            console.log("HERO JOB:", job.job_title);

            const template = heroTemplates[job.country_code];

            console.log("HERO TEMPLATE:", template);

            if (!template) {
                console.log("HERO TEMPLATE NOT FOUND:", job.country_code);
                continue;
            }

            const imageBuffer = await createImage(job, template);

            console.log("HERO IMAGE CREATED");

            const imageUrl = await uploadBuffer(imageBuffer);

            console.log("HERO IMAGE URL:", imageUrl);

            const descriptionLines = Array.isArray(job.description)
                ? job.description
                : String(job.description || "").split(/\r?\n/).filter(Boolean);

            herohero.push({
                ...job,
                postId: job.postId,
                categoryId: job.categoryId,
                title: job.herohero_title || job.job_title,
                text: job.description,
                textHtml: descriptionLines.map(line => `<p>${line}</p>`).join(""),
                imageUrl,
                width: 1080,
                height: 1350,
                fileName: `${job.country} Herohero.png`,
                fileSize: 0,
                previewLevel: "FIRST_LINES",
                isAgeRestricted: false,
                isSponsored: false,
                isExcludedFromRss: false
            });

            console.log("HERO PUSH OK");
        }

        // REELS
        for (const rawReel of reels) {
            const matchingJob = jobs.find(job =>
                (job.link && rawReel.link && job.link === rawReel.link) ||
                (job.job_title === rawReel.job_title && job.country_code === rawReel.country_code)
            );

            if (!matchingJob) {
                throw new Error(`Reel "${rawReel.job_title}" neodpovídá žádné z 5 HeroHero nabídek.`);
            }

            // Sdílená fakta vždy převezmeme z objektu jobs. Reel si ponechá
            // pouze vlastní caption, takže mzda, jazyk i ubytování nemohou
            // být mezi IG a HeroHero rozdílné.
            const reel = {
                ...matchingJob,
                caption: rawReel.caption
            };
            console.log("REEL:", reel.job_title);
            console.log("COUNTRY CODE:", reel.country_code);

            const template = reelTemplates[reel.country_code];

            console.log("REEL TEMPLATE:", template);

            if (!template) {
                console.log("REEL TEMPLATE NOT FOUND:", reel.country_code);
                continue;
            }

            const imageBuffer = await createImage(reel, template);

            console.log("REEL IMAGE CREATED");

            const videoUrl = await createReel(imageBuffer);

            console.log("VIDEO URL:", videoUrl);

            instagram.push({
                ...reel,
                videoUrl
            });

            console.log("INSTAGRAM PUSH OK");
        }

        console.log("HERO COUNT:", herohero.length);
        console.log("INSTAGRAM COUNT:", instagram.length);
        console.log("POSILAM RESPONSE");

        res.json({
            success: true,
            herohero,
            instagram
        });

    } catch (err) {
        console.error("FULL ERROR:");
        console.dir(err, { depth: null });

        if (err.response) {
            console.log("RESPONSE:");
            console.dir(err.response, { depth: null });
        }

        if (err.response?.body) {
            console.log("BODY:");
            console.dir(err.response.body, { depth: null });
        }

        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

app.get("/test-playwright", async (req, res) => {
    try {
        console.log("HOST:", require("os").hostname());

        const browser = await chromium.launch({
            headless: true
        });

        const page = await browser.newPage();

        await page.goto("https://herohero.co", {
            waitUntil: "domcontentloaded"
        });

        const title = await page.title();

        await browser.close();

        res.json({
            success: true,
            title,
            hostname: require("os").hostname()
        });

    } catch (err) {
        console.error(err);
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
        res.json({
            success: true,
            result
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({
            success: false,
            error: e.message
        });
    }
});

app.post("/herohero/upload", upload.single("image"), async (req, res) => {
  console.log("HeroHero upload přijat");
  res.json({ success: true });
});

app.get("/debug", (req, res) => {
    const file = path.join(__dirname, "debug.tar.gz");

    if (!fs.existsSync(file)) {
        return res.status(404).send("debug.tar.gz nebyl nalezen");
    }

    res.download(file);
});

app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
