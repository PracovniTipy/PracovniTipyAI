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
    {
        family: "Bebas Neue"
    }
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
            return {
                size,
                lines
            };
        }

        size--;
    }

    return {
        size: 20,
        lines: [text]
    };
}

async function createHeroImage(job, templateFile) {
    const fullPath = path.join(TEMPLATE_FOLDER, templateFile);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Template not found: ${fullPath}`);
    }

    const template = await loadImage(fullPath);
    const canvas = createCanvas(template.width, template.height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(template, 0, 0);

    const scaleX = template.width / 1080;
    const scaleY = template.height / 1350;
    const fontScale = Math.min(scaleX, scaleY);

    const heroFont = "serif";

    const cleanText = value =>
        String(value ?? "")
            .replace(/\s+/g, " ")
            .trim();

    const jobTitleText = cleanText(
        job.job_title ||
        job.title ||
        "PRACOVNÍ POZICE"
    ).toUpperCase();

    const cityText = cleanText(
        job.city ||
        "MĚSTO NEUVEDENO"
    ).toUpperCase();

    const getHousingText = () => {
        const raw = cleanText(
            job.housing ||
            job.accommodation
        );

        const lower = raw.toLowerCase();

        if (
            !raw ||
            /neuved|not specified|unknown|n\/a/.test(lower)
        ) {
            return "UBYTOVÁNÍ NEUVEDENO";
        }

        if (
            /bez ubyt|nezajiště|not provided|no accommodation/.test(lower)
        ) {
            return "UBYTOVÁNÍ NEZAJIŠTĚNO";
        }

        if (
            /zdarma|free|included/.test(lower)
        ) {
            return "UBYTOVÁNÍ ZDARMA";
        }

        if (
            /příspěvek|allowance|contribution/.test(lower)
        ) {
            return "PŘÍSPĚVEK NA UBYTOVÁNÍ";
        }

        if (
            /zajiště|poskyt|provided|available|arranged|accommodation/.test(lower)
        ) {
            return "UBYTOVÁNÍ ZAJIŠTĚNO";
        }

        return raw
            .replace(/accommodation/gi, "UBYTOVÁNÍ")
            .replace(/provided/gi, "ZAJIŠTĚNO")
            .replace(/available/gi, "K DISPOZICI")
            .replace(/free/gi, "ZDARMA")
            .toUpperCase();
    };

    const getMonthlyCzkSalary = () => {
        const explicitValues = [
            job.salary_czk_month,
            job.monthly_salary_czk,
            job.salary_month_czk,
            job.salary_monthly_czk
        ]
            .map(cleanText)
            .filter(Boolean);

        const sources = [
            ...explicitValues,
            cleanText(job.salary),
            cleanText(job.description),
            cleanText(job.text)
        ].filter(Boolean);

        let salary = "";

        for (const source of sources) {
            const match = source.match(
                /(?:cca\s*)?\d{1,3}(?:[ .]\d{3})*(?:,\d+)?\s*(?:Kč|CZK)(?:\s*(?:brutto|netto|hrubého|čistého|hrubá|čistá))?(?:\s*\/?\s*(?:měsíc|měsíčně|month))?/i
            );

            if (match) {
                salary = match[0];
                break;
            }
        }

        if (!salary) {
            const numericExplicit = explicitValues.find(
                value => /\d/.test(value)
            );

            if (numericExplicit) {
                salary = `${numericExplicit} Kč / měsíc`;
            }
        }

        if (!salary) {
            return "MZDA NEUVEDENA";
        }

        salary = salary
            .replace(/\bCZK\b/gi, "Kč")
            .replace(/\bmonth\b/gi, "měsíc")
            .replace(/měsíčně/gi, "měsíc")
            .replace(/\s*\/?\s*měsíc/gi, " / měsíc")
            .replace(/\s+/g, " ")
            .trim();

        if (!/měsíc/i.test(salary)) {
            salary += " / měsíc";
        }

        if (!/^cca\b/i.test(salary)) {
            salary = `cca ${salary}`;
        }

        return salary.toUpperCase();
    };

    const createLines = (
        text,
        maxWidth,
        fontSize
    ) => {
        ctx.font = `bold ${fontSize}px ${heroFont}`;

        const words = cleanText(text).split(" ");
        const lines = [];
        let line = "";

        for (const word of words) {
            const testLine = line
                ? `${line} ${word}`
                : word;

            if (
                ctx.measureText(testLine).width <= maxWidth
            ) {
                line = testLine;
            } else {
                if (line) {
                    lines.push(line);
                }

                line = word;
            }
        }

        if (line) {
            lines.push(line);
        }

        return lines;
    };

    const fitText = (
        text,
        maxWidth,
        startSize,
        minSize,
        maxLines
    ) => {
        for (
            let size = startSize;
            size >= minSize;
            size -= 1
        ) {
            const lines = createLines(
                text,
                maxWidth,
                size
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
            lines: createLines(
                text,
                maxWidth,
                minSize
            ).slice(0, maxLines)
        };
    };

    const drawTextBlock = ({
        text,
        centerX,
        topY,
        maxWidth,
        startSize,
        minSize,
        maxLines,
        rotation = 0,
        lineHeight = 1.05
    }) => {
        const fitted = fitText(
            text,
            maxWidth,
            startSize,
            minSize,
            maxLines
        );

        ctx.save();

        ctx.translate(
            centerX,
            topY
        );

        ctx.rotate(rotation);

        ctx.font =
            `bold ${fitted.size}px ${heroFont}`;

        ctx.fillStyle = "#000000";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        fitted.lines.forEach(
            (line, index) => {
                ctx.fillText(
                    line,
                    0,
                    index *
                    fitted.size *
                    lineHeight
                );
            }
        );

        ctx.restore();

        return (
            fitted.lines.length *
            fitted.size *
            lineHeight
        );
    };

    const titleTop = 120 * scaleY;

    const titleHeight = drawTextBlock({
        text: jobTitleText,
        centerX: 540 * scaleX,
        topY: titleTop,
        maxWidth: 760 * scaleX,
        startSize: 68 * fontScale,
        minSize: 34 * fontScale,
        maxLines: 2,
        lineHeight: 1.02
    });

    drawTextBlock({
        text: cityText,
        centerX: 540 * scaleX,
        topY:
            titleTop +
            titleHeight +
            (12 * scaleY),
        maxWidth: 620 * scaleX,
        startSize: 40 * fontScale,
        minSize: 25 * fontScale,
        maxLines: 1
    });

    const housingTop = 305 * scaleY;

    const housingHeight = drawTextBlock({
        text: getHousingText(),
        centerX: 805 * scaleX,
        topY: housingTop,
        maxWidth: 430 * scaleX,
        startSize: 48 * fontScale,
        minSize: 29 * fontScale,
        maxLines: 2,
        rotation: -0.15,
        lineHeight: 1.02
    });

    drawTextBlock({
        text: getMonthlyCzkSalary(),
        centerX: 800 * scaleX,
        topY:
            housingTop +
            housingHeight +
            (18 * scaleY),
        maxWidth: 440 * scaleX,
        startSize: 38 * fontScale,
        minSize: 24 * fontScale,
        maxLines: 2,
        rotation: -0.04,
        lineHeight: 1.05
    });

    return canvas.toBuffer("image/png");
}

async function createReelImage(job, templateFile) {
    const fullPath = path.join(
        TEMPLATE_FOLDER,
        templateFile
    );

    if (!fs.existsSync(fullPath)) {
        throw new Error(
            `Template not found: ${fullPath}`
        );
    }

    const template = await loadImage(fullPath);

    const canvas = createCanvas(
        template.width,
        template.height
    );

    const ctx = canvas.getContext("2d");

    ctx.drawImage(template, 0, 0);

    const startX = 90;
    const startY = 220;

    const maxWidth =
        template.width -
        (startX * 2);

    const drawLineWithStroke = (
        text,
        x,
        y,
        size,
        lineWidth = 5
    ) => {
        if (!text) return;

        ctx.font =
            `bold ${size}px Bebas Neue`;

        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        ctx.save();

        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.miterLimit = 2;

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = lineWidth;

        ctx.strokeText(
            text,
            x,
            y
        );

        ctx.fillStyle = "#ffffff";

        ctx.fillText(
            text,
            x,
            y
        );

        ctx.restore();
    };

    const countrySize = 135;

    const countryText =
        (job.country || "").toUpperCase();

    drawLineWithStroke(
        countryText,
        startX,
        startY,
        countrySize,
        9
    );

    let currentY =
        startY +
        (countrySize * 0.95) +
        55;

    const jobTitleText =
        (job.job_title || "").toUpperCase();

    const jobWrapped = wrapText(
        ctx,
        jobTitleText,
        maxWidth,
        82
    );

    const jobSize = Math.max(
        42,
        jobWrapped.size
    );

    const finalJobWrapped = wrapText(
        ctx,
        jobTitleText,
        maxWidth,
        jobSize
    );

    const jobLineHeight =
        jobSize * 1.12;

    finalJobWrapped.lines.forEach(
        (line, index) => {
            drawLineWithStroke(
                line,
                startX,
                currentY +
                (index * jobLineHeight),
                jobSize,
                7
            );
        }
    );

    currentY +=
        finalJobWrapped.lines.length *
        jobLineHeight +
        35;

    let salaryText = String(
        job.salary_czk_month ||
        job.salary ||
        ""
    ).trim();

    if (
        salaryText &&
        salaryText.toUpperCase() !== "NEUVEDENO"
    ) {
        salaryText = salaryText
            .replace(/\bCZK\b/gi, "KČ")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();

        if (
            /KČ/.test(salaryText) &&
            !/MĚSÍC/.test(salaryText)
        ) {
            salaryText += " / MĚSÍC";
        }

        const salaryWrapped = wrapText(
            ctx,
            salaryText,
            maxWidth,
            68
        );

        const salarySize = Math.max(
            44,
            salaryWrapped.size
        );

        const finalSalaryWrapped = wrapText(
            ctx,
            salaryText,
            maxWidth,
            salarySize
        );

        const salaryLineHeight =
            salarySize * 1.12;

        finalSalaryWrapped.lines.forEach(
            (line, index) => {
                drawLineWithStroke(
                    line,
                    startX,
                    currentY +
                    (index * salaryLineHeight),
                    salarySize,
                    6
                );
            }
        );

        currentY +=
            finalSalaryWrapped.lines.length *
            salaryLineHeight +
            30;
    }

    const bottomSize = 48;

    const ubytovaniText =
        "UBYTOVÁNÍ ZAJIŠTĚNO.";

    drawLineWithStroke(
        ubytovaniText,
        startX,
        currentY,
        bottomSize,
        5
    );

    currentY += bottomSize * 1.25;

    const anglictinaText =
        "ANGLIČTINA";

    drawLineWithStroke(
        anglictinaText,
        startX,
        currentY,
        bottomSize,
        5
    );

    return canvas.toBuffer("image/png");
}

async function uploadBuffer(buffer) {
    return await new Promise(
        (resolve, reject) => {
            const stream =
                cloudinary.uploader.upload_stream(
                    {
                        folder: "PracovniTipyAI"
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
                .on("error", err => {
                    reject(err);
                })
                .on("end", () => {
                    resolve();
                })
                .save(videoPath);
        }
    );

    let result;

    try {
        result =
            await cloudinary.uploader.upload(
                videoPath,
                {
                    resource_type: "video",
                    folder:
                        "PracovniTipyAI/reels"
                }
            );
    } catch (e) {
        throw e;
    }

    if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
    }

    if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
    }

    return result.secure_url;
}

app.get("/", (req, res) => {
    res.send("PracovniTipyAI běží");
});

app.post("/generate", async (req, res) => {
    const jobs =
        Array.isArray(req.body.jobs)
            ? req.body.jobs
            : [];

    const reels =
        Array.isArray(req.body.reels)
            ? req.body.reels
            : [];

    if (
        jobs.length === 0 &&
        reels.length === 0
    ) {
        return res.status(400).json({
            success: false,
            error:
                "Musí být předáno jobs nebo reels"
        });
    }

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

                postId: job.postId,
                categoryId: job.categoryId,

                title: job.job_title,
                text: job.description,

                textHtml:
                    `<p>${
                        (job.description || "")
                            .replace(
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

                isAgeRestricted: false,
                isSponsored: false,
                isExcludedFromRss: false
            });
        }

        for (const reel of reels) {
            const template =
                reelTemplates[
                    reel.country_code
                ];

            if (!template) {
                continue;
            }

            const matchingHeroJob =
                jobs[instagram.length];

            const reelForImage = {
                ...reel,

                salary_czk_month:
                    reel.salary_czk_month ||
                    matchingHeroJob
                        ?.salary_czk_month ||
                    matchingHeroJob
                        ?.salary ||
                    ""
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
                ...reelForImage,
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

app.post(
    "/publishHeroHero",
    async (req, res) => {
        const publishHeroHero =
            require("./publishHeroHero");

        try {
            await publishHeroHero(
                req.body
            );

            res.json({
                success: true
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

app.listen(PORT, () => {});
