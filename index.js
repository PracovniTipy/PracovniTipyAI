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

async function createImage(job, templateFile) {
    const fullPath = path.join(TEMPLATE_FOLDER, templateFile);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Template not found: ${fullPath}`);
    }

    const template = await loadImage(fullPath);
    const canvas = createCanvas(template.width, template.height);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(template, 0, 0);

    const startX = 90;
    const startY = 220;
    const maxWidth = template.width - (startX * 2);

    // 1. COUNTRY
    let countrySize = 135;
    ctx.font = `bold ${countrySize}px Bebas Neue`;
    const countryText = (job.country || "").toUpperCase();

    // 2. JOB TITLE
    let jobTitleText = (job.job_title || "").toUpperCase();
    let jobWrapped = wrapText(ctx, jobTitleText, maxWidth, 85);
    let jobSize = jobWrapped.size;
    if (jobWrapped.lines.length > 2) {
        jobSize = Math.max(35, jobSize - 10);
    }

    // 3. SALARY - opraveno: pokud objekt obsahuje mzdu přímo (např. job.salary), zkontrolujeme ji, jinak zkusíme salary_czk_month. Pokud neexistuje vůbec nebo je NEUVEDENO, nezobrazí se.
    let salarySize = 75;
    let salaryText = "";
    const rawSalary = job.salary || job.salary_czk_month;
    if (rawSalary && typeof rawSalary === "string" && rawSalary.trim() !== "" && rawSalary !== "NEUVEDENO") {
        salaryText = rawSalary;
    }

    // 4 & 5. UBYTOVÁNÍ & ANGLIČTINA
    let bottomSize = 48;
    let ubytovaniText = "UBYTOVÁNÍ ZAJIŠTĚNO.";
    let anglictinaText = "ANGLIČTINA";

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

    let currentY = startY;

    // Render Country
    drawLineWithStroke(countryText, startX, currentY, countrySize, 9);
    currentY += countrySize * 0.95; // Zvětšený rozestup pod zemí

    // Render Job Title
    ctx.font = `bold ${jobSize}px Bebas Neue`;
    const currentJobWrapped = wrapText(ctx, jobTitleText, maxWidth, jobSize);
    currentJobWrapped.lines.forEach((line, index) => {
        drawLineWithStroke(line, startX, currentY + (index * jobSize * 1.15), jobSize, 7);
    });
    currentY += currentJobWrapped.lines.length * jobSize * 1.15 + 20; // Zvětšený rozestup pod pozicí

    // Render Salary (pouze pokud je reálně k dispozici)
    if (salaryText) {
        drawLineWithStroke(salaryText, startX, currentY, salarySize, 6);
        currentY += salarySize * 1.25; // Zvětšený rozestup pod mzdou
    }

    // Render Ubytování
    drawLineWithStroke(ubytovaniText, startX, currentY, bottomSize, 5);
    currentY += bottomSize * 1.25; // Zvětšený rozestup mezi ubytováním a angličtinou

    // Render Angličtina
    drawLineWithStroke(anglictinaText, startX, currentY, bottomSize, 5);

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

    const jobs = Array.isArray(req.body.jobs) ? req.body.jobs : [];
    const reels = Array.isArray(req.body.reels) ? req.body.reels : [];

    console.log("JOBS COUNT:", jobs.length);
    console.log("REELS COUNT:", reels.length);

    if (jobs.length === 0 && reels.length === 0) {
        return res.status(400).json({
            success: false,
            error: "Musí být předáno jobs nebo reels"
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

            herohero.push({
                ...job,
                postId: job.postId,
                categoryId: job.categoryId,
                title: job.job_title,
                text: job.description,
                textHtml: `<p>${(job.description || "").replace(/\n/g, "</p><p>")}</p>`,
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
        for (const reel of reels) {
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
