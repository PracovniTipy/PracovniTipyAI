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
 
// Bezpečnostní pojistka proti montážním/výrobním pozicím, které by AI výběr
// (krok 11 v Make) neměl vůbec propustit dál, ale kdyby se přesto stalo,
// tady se ještě před generováním obrázků a publikací natvrdo vyřadí.
const ASSEMBLY_BLOCK_REGEX = /mont|assembl/i;
 
function isBlockedAssemblyJob(item) {
    const value = cleanText(
        `${item.job_title || item.title || ""} ${item.description || ""}`
    );
    return ASSEMBLY_BLOCK_REGEX.test(value);
}
 
function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}
 
function getCountryCz(item) {
    const countryCode = cleanText(item.country_code);
    const country = cleanText(item.country);
 
    return (
        countryNamesCz[countryCode] ||
        countryNamesCz[country] ||
        country ||
        "Země neuvedena"
    );
}
 
function normalizeHousing(value) {
    const raw = cleanText(value);
    const lower = raw.toLowerCase();
 
    if (!raw || /neuved|not specified|unknown|n\/a/.test(lower)) {
        return "Ubytování neuvedeno";
    }
 
    if (/not provided|no accommodation|bez ubyt|nezajiště/.test(lower)) {
        return "Ubytování nezajištěno";
    }
 
    if (/free|included|zdarma/.test(lower)) {
        return "Ubytování zdarma";
    }
 
    if (/allowance|contribution|příspěvek/.test(lower)) {
        return "Příspěvek na ubytování";
    }
 
    if (/provided|available|arranged|zajiště|poskyt/.test(lower)) {
        return "Ubytování zajištěno";
    }
 
    return raw
        .replace(/accommodation/gi, "ubytování")
        .replace(/provided/gi, "zajištěno")
        .replace(/available/gi, "k dispozici")
        .replace(/free/gi, "zdarma")
        .replace(/not specified/gi, "neuvedeno");
}
 
function normalizeLanguage(value) {
    const raw = cleanText(value);
 
    if (!raw || /neuved|not specified|unknown|n\/a/i.test(raw)) {
        return "Jazyk neuveden";
    }
 
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
        .replace(/\bor\b/gi, "nebo");
}
 
function formatMonthlyCzkSalary(...values) {
    const candidates = values.map(cleanText).filter(Boolean);
 
    for (const candidate of candidates) {
        if (/neuved|not specified|unknown|n\/a/i.test(candidate)) {
            continue;
        }
 
        let salary = candidate;
 
        const czkMatch = salary.match(
            /(?:cca\s*)?\d{1,3}(?:[ .]\d{3})*(?:,\d+)?\s*(?:Kč|CZK)(?:\s*(?:brutto|netto|hrubého|čistého|hrubá|čistá))?(?:\s*(?:\/|za)?\s*(?:měsíc|měsíčně|month))?/i
        );
 
        if (czkMatch) {
            salary = czkMatch[0];
        } else if (/^\d[\d\s.,]*$/.test(salary)) {
            const numeric = Number(
                salary.replace(/\s/g, "").replace(",", ".")
            );
 
            if (Number.isFinite(numeric)) {
                salary =
                    `${Math.round(numeric).toLocaleString("cs-CZ")} Kč`;
            }
        }
 
        if (!/(?:Kč|CZK)/i.test(salary)) {
            continue;
        }
 
        salary = salary
            .replace(/\bCZK\b/gi, "Kč")
            .replace(/\bbrutto\b/gi, "hrubého")
            .replace(/\bnetto\b/gi, "čistého")
            .replace(/\bmonth\b/gi, "měsíc")
            .replace(/měsíčně/gi, "měsíc")
            .replace(/\s*(?:\/|za)?\s*měsíc/gi, " / měsíc")
            .replace(/\s+/g, " ")
            .trim();
 
        if (!/měsíc/i.test(salary)) {
            salary += " / měsíc";
        }
 
        if (!/^cca\b/i.test(salary)) {
            salary = `cca ${salary}`;
        }
 
        return salary;
    }
 
    return "Mzda v Kč neuvedena";
}
 
function createWrappedLines(
    ctx,
    text,
    maxWidth,
    fontSize,
    fontFamily
) {
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
 
    const words = cleanText(text)
        .split(" ")
        .filter(Boolean);
 
    const lines = [];
    let line = "";
 
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
 
        if (
            ctx.measureText(test).width <= maxWidth ||
            !line
        ) {
            line = test;
        } else {
            lines.push(line);
            line = word;
        }
    }
 
    if (line) {
        lines.push(line);
    }
 
    return lines;
}
 
function fitText(
    ctx,
    text,
    maxWidth,
    startSize,
    minSize,
    maxLines,
    fontFamily
) {
    for (
        let size = startSize;
        size >= minSize;
        size--
    ) {
        const lines = createWrappedLines(
            ctx,
            text,
            maxWidth,
            size,
            fontFamily
        );
 
        if (lines.length <= maxLines) {
            return {
                size,
                lines
            };
        }
    }
 
    return {
        size: minSize,
        lines: createWrappedLines(
            ctx,
            text,
            maxWidth,
            minSize,
            fontFamily
        )
    };
}
 
function drawStrokeBlock(ctx, options) {
    const {
        text,
        x,
        y,
        maxWidth,
        startSize,
        minSize,
        maxLines,
        lineWidth,
        lineHeight = 1.12
    } = options;
 
    const fitted = fitText(
        ctx,
        text,
        maxWidth,
        startSize,
        minSize,
        maxLines,
        "Bebas Neue"
    );
 
    const actualLines = fitted.lines;
 
    ctx.font =
        `bold ${fitted.size}px Bebas Neue`;
 
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.miterLimit = 2;
 
    actualLines.forEach((line, index) => {
        const lineY =
            y +
            index *
            fitted.size *
            lineHeight;
 
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = lineWidth;
 
        ctx.strokeText(
            line,
            x,
            lineY
        );
 
        ctx.fillStyle = "#ffffff";
 
        ctx.fillText(
            line,
            x,
            lineY
        );
    });
 
    return (
        actualLines.length *
        fitted.size *
        lineHeight
    );
}
 
function drawHeroBlock(ctx, options) {
    const {
        text,
        centerX,
        topY,
        maxWidth,
        startSize,
        minSize,
        maxLines,
        rotation = 0,
        lineHeight = 1.05
    } = options;
 
    const fitted = fitText(
        ctx,
        text,
        maxWidth,
        startSize,
        minSize,
        maxLines,
        "serif"
    );
 
    const actualLines = fitted.lines;
 
    ctx.save();
 
    ctx.translate(
        centerX,
        topY
    );
 
    ctx.rotate(rotation);
 
    ctx.font =
        `bold ${fitted.size}px serif`;
 
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
 
    actualLines.forEach((line, index) => {
        ctx.fillText(
            line,
            0,
            index *
            fitted.size *
            lineHeight
        );
    });
 
    ctx.restore();
 
    return (
        actualLines.length *
        fitted.size *
        lineHeight
    );
}
 
async function createHeroImage(
    job,
    templateFile
) {
    const fullPath = path.join(
        TEMPLATE_FOLDER,
        templateFile
    );
 
    if (!fs.existsSync(fullPath)) {
        throw new Error(
            `Template not found: ${fullPath}`
        );
    }
 
    const template =
        await loadImage(fullPath);
 
    const canvas = createCanvas(
        template.width,
        template.height
    );
 
    const ctx =
        canvas.getContext("2d");
 
    ctx.drawImage(
        template,
        0,
        0
    );
 
    const scaleX =
        template.width / 1080;
 
    const scaleY =
        template.height / 1350;
 
    const fontScale =
        Math.min(scaleX, scaleY);
 
    const jobTitle = cleanText(
        job.job_title ||
        job.title ||
        "Pracovní pozice"
    );
 
    const city = cleanText(
        job.city ||
        "Město neuvedeno"
    );
 
    const housing = normalizeHousing(
        job.housing ||
        job.accommodation
    );
 
    const salary =
        formatMonthlyCzkSalary(
            job.salary_czk_month,
            job.monthly_salary_czk,
            job.salary_month_czk,
            job.salary_monthly_czk,
            job.salary
        );
 
    const titleTop =
        120 * scaleY;
 
    const titleHeight =
        drawHeroBlock(ctx, {
            text: jobTitle,
 
            centerX:
                540 * scaleX,
 
            topY:
                titleTop,
 
            maxWidth:
                720 * scaleX,
 
            startSize:
                68 * fontScale,
 
            minSize:
                30 * fontScale,
 
            maxLines: 2,
 
            lineHeight: 1.02
        });
 
    drawHeroBlock(ctx, {
        text: city,
 
        centerX:
            540 * scaleX,
 
        topY:
            titleTop +
            titleHeight +
            10 * scaleY,
 
        maxWidth:
            560 * scaleX,
 
        startSize:
            38 * fontScale,
 
        minSize:
            23 * fontScale,
 
        maxLines: 1
    });
 
    const housingTop =
        305 * scaleY;
 
    const housingHeight =
        drawHeroBlock(ctx, {
            text: housing,
 
            centerX:
                810 * scaleX,
 
            topY:
                housingTop,
 
            maxWidth:
                430 * scaleX,
 
            startSize:
                48 * fontScale,
 
            minSize:
                27 * fontScale,
 
            maxLines: 2,
 
            rotation: -0.16,
 
            lineHeight: 1.02
        });
 
    drawHeroBlock(ctx, {
        text: salary,
 
        centerX:
            805 * scaleX,
 
        topY:
            housingTop +
            housingHeight +
            18 * scaleY,
 
        maxWidth:
            440 * scaleX,
 
        startSize:
            38 * fontScale,
 
        minSize:
            23 * fontScale,
 
        maxLines: 2,
 
        rotation: -0.04
    });
 
    return canvas.toBuffer(
        "image/png"
    );
}
 
async function createReelImage(
    reel,
    templateFile
) {
    const fullPath = path.join(
        TEMPLATE_FOLDER,
        templateFile
    );
 
    if (!fs.existsSync(fullPath)) {
        throw new Error(
            `Template not found: ${fullPath}`
        );
    }
 
    const template =
        await loadImage(fullPath);
 
    const canvas = createCanvas(
        template.width,
        template.height
    );
 
    const ctx =
        canvas.getContext("2d");
 
    ctx.drawImage(
        template,
        0,
        0
    );
 
    const startX = 90;
    const startY = 220;
 
    const maxWidth =
        template.width -
        startX * 2;
 
    const country =
        getCountryCz(reel)
            .toUpperCase();
 
    const jobTitle =
        cleanText(
            reel.job_title ||
            reel.title ||
            "Pracovní pozice"
        ).toUpperCase();
 
    const salary =
        formatMonthlyCzkSalary(
            reel.salary_czk_month,
            reel.monthly_salary_czk,
            reel.salary_month_czk,
            reel.salary_monthly_czk,
            reel.salary
        ).toUpperCase();
 
    const housing =
        normalizeHousing(
            reel.housing ||
            reel.accommodation
        ).toUpperCase();
 
    const language =
        normalizeLanguage(
            reel.language
        ).toUpperCase();
 
    const countrySize = 135;
 
    drawStrokeBlock(ctx, {
        text: country,
 
        x: startX,
        y: startY,
 
        maxWidth,
 
        startSize:
            countrySize,
 
        minSize: 90,
        maxLines: 1,
        lineWidth: 9
    });
 
    let currentY =
        startY +
        countrySize * 0.95 +
        115;
 
    currentY +=
        drawStrokeBlock(ctx, {
            text: jobTitle,
 
            x: startX,
            y: currentY,
 
            maxWidth,
 
            startSize: 82,
            minSize: 38,
            maxLines: 3,
            lineWidth: 7
        }) + 30;
 
    currentY +=
        drawStrokeBlock(ctx, {
            text: salary,
 
            x: startX,
            y: currentY,
 
            maxWidth,
 
            startSize: 68,
            minSize: 38,
            maxLines: 2,
            lineWidth: 6
        }) + 24;
 
    currentY +=
        drawStrokeBlock(ctx, {
            text: housing,
 
            x: startX,
            y: currentY,
 
            maxWidth,
 
            startSize: 48,
            minSize: 30,
            maxLines: 2,
            lineWidth: 5
        }) + 12;
 
    drawStrokeBlock(ctx, {
        text: language,
 
        x: startX,
        y: currentY,
 
        maxWidth,
 
        startSize: 48,
        minSize: 30,
        maxLines: 2,
        lineWidth: 5
    });
 
    return canvas.toBuffer(
        "image/png"
    );
}
 
async function uploadBuffer(buffer) {
    return await new Promise(
        (resolve, reject) => {
            const stream =
                cloudinary.uploader
                    .upload_stream(
                        {
                            folder:
                                "PracovniTipyAI"
                        },
                        (err, result) => {
                            if (err) {
                                return reject(err);
                            }
 
                            resolve(
                                result.secure_url
                            );
                        }
                    );
 
            stream.end(buffer);
        }
    );
}
 
async function createReel(imageBuffer) {
    const id = Date.now();
 
    const imagePath = path.join(
        os.tmpdir(),
        `${id}.png`
    );
 
    const videoPath = path.join(
        os.tmpdir(),
        `${id}.mp4`
    );
 
    fs.writeFileSync(
        imagePath,
        imageBuffer
    );
 
    await new Promise(
        (resolve, reject) => {
            ffmpeg()
                .input(imagePath)
                .inputOptions([
                    "-loop",
                    "1",
                    "-framerate",
                    "25"
                ])
                .videoCodec("libx264")
                .outputOptions([
                    "-t",
                    "8",
 
                    "-vf",
                    "scale=720:1280",
 
                    "-pix_fmt",
                    "yuv420p",
 
                    "-preset",
                    "ultrafast",
 
                    "-threads",
                    "1",
 
                    "-movflags",
                    "+faststart"
                ])
                .on(
                    "error",
                    reject
                )
                .on(
                    "end",
                    resolve
                )
                .save(videoPath);
        }
    );
 
    const result =
        await cloudinary.uploader.upload(
            videoPath,
            {
                resource_type:
                    "video",
 
                folder:
                    "PracovniTipyAI/reels"
            }
        );
 
    if (
        fs.existsSync(imagePath)
    ) {
        fs.unlinkSync(imagePath);
    }
 
    if (
        fs.existsSync(videoPath)
    ) {
        fs.unlinkSync(videoPath);
    }
 
    return result.secure_url;
}
 
app.get("/", (req, res) => {
    res.send(
        "PracovniTipyAI běží"
    );
});
 
app.post(
    "/generate",
    async (req, res) => {
        const rawJobs =
            Array.isArray(
                req.body.jobs
            )
                ? req.body.jobs
                : [];
 
        const rawReels =
            Array.isArray(
                req.body.reels
            )
                ? req.body.reels
                : [];
 
        if (
            rawJobs.length === 0 &&
            rawReels.length === 0
        ) {
            return res
                .status(400)
                .json({
                    success: false,
 
                    error:
                        "Musí být předáno jobs nebo reels"
                });
        }
 
        // Pojistka proti montážním/výrobním pozicím + tvrdý strop na počet
        // příspěvků, které se skutečně publikují. AI umí vrátit až 15 jobs
        // (má sloužit jako zásoba náhradních kandidátů), ale na HeroHero má
        // jít jen finálních 5 a na Instagram jen 2 reels — dřív tenhle výběr
        // nikde neproběhl a publikovalo by se všech až 15 najednou.
        const HEROHERO_LIMIT = 5;
        const INSTAGRAM_LIMIT = 2;
 
        const jobs = rawJobs
            .filter(job => !isBlockedAssemblyJob(job))
            .slice(0, HEROHERO_LIMIT);
 
        const reels = rawReels
            .filter(reel => !isBlockedAssemblyJob(reel))
            .slice(0, INSTAGRAM_LIMIT);
 
        try {
            const herohero = [];
            const instagram = [];
 
            for (const job of jobs) {
                const template =
                    heroTemplates[
                        job.country_code
                    ];
 
                if (!template) {
                    continue;
                }
 
                const imageBuffer =
                    await createHeroImage(
                        job,
                        template
                    );
 
                const imageUrl =
                    await uploadBuffer(
                        imageBuffer
                    );
 
                herohero.push({
                    ...job,
 
                    postId:
                        job.postId,
 
                    categoryId:
                        job.categoryId,
 
                    title:
                        job.job_title,
 
                    text:
                        job.description,
 
                    textHtml:
                        `<p>${
                            (
                                job.description ||
                                ""
                            ).replace(
                                /\n/g,
                                "</p><p>"
                            )
                        }</p>`,
 
                    imageUrl,
 
                    width: 1080,
                    height: 1350,
 
                    fileName:
                        `${job.country} Herohero.png`,
 
                    fileSize: 0,
 
                    previewLevel:
                        "FIRST_LINES",
 
                    isAgeRestricted:
                        false,
 
                    isSponsored:
                        false,
 
                    isExcludedFromRss:
                        false
                });
            }
 
            for (
                const [
                    reelIndex,
                    reel
                ] of reels.entries()
            ) {
                const template =
                    reelTemplates[
                        reel.country_code
                    ];
 
                if (!template) {
                    continue;
                }
 
                const matchingJob =
                    jobs[reelIndex] ||
                    {};
 
                const reelForImage = {
                    ...reel,
 
                    salary_czk_month:
                        reel.salary_czk_month ||
                        matchingJob
                            .salary_czk_month ||
                        matchingJob
                            .monthly_salary_czk ||
                        matchingJob
                            .salary_month_czk ||
                        matchingJob
                            .salary_monthly_czk ||
                        matchingJob
                            .salary ||
                        reel.salary,
 
                    housing:
                        reel.housing ||
                        reel.accommodation ||
                        matchingJob.housing ||
                        matchingJob
                            .accommodation,
 
                    language:
                        reel.language ||
                        matchingJob.language
                };
 
                const imageBuffer =
                    await createReelImage(
                        reelForImage,
                        template
                    );
 
                const videoUrl =
                    await createReel(
                        imageBuffer
                    );
 
                instagram.push({
                    ...reel,
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
    }
);
 
app.post(
    "/publishHeroHero",
    async (req, res) => {
        const publishHeroHero =
            require(
                "./publishHeroHero"
            );
 
        try {
            const result =
                await publishHeroHero(
                    req.body
                );
 
            res.json({
                success: true,
                result
            });
        } catch (e) {
            res.status(500).json({
                success: false,
                error: e.message
            });
        }
    }
);
 
app.post(
    "/herohero/upload",
    upload.single("image"),
    async (req, res) => {
        res.json({
            success: true
        });
    }
);
 
app.listen(PORT);
 
