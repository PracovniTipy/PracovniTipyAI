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

console.log(cloudinary.config());

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

function fitText(ctx, text, maxWidth, startSize) {

function wrapText(ctx, text, maxWidth, startSize) {

    let size = startSize;
    let lines = [];

    while (size > 20) {

        ctx.font = `bold ${size}px Bebas Neue`;

        const words = (text || "").split(" ");

        lines = [];
        let line = "";

        for (const word of words) {

            const test = line ? line + " " + word : word;

            if (ctx.measureText(test).width <= maxWidth) {
                line = test;
            } else {
                lines.push(line);
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
    
    let size = startSize;

    do {
        
        ctx.font = `bold ${size}px Bebas Neue`;

        if (ctx.measureText(text).width <= maxWidth) {
            break;
        }

        size--;

    } while (size > 20);

    return size;

}

function drawCentered(ctx, text, x, y, width, startSize, color = "#ffffff") {

    const result = wrapText(ctx, text, width, startSize);

    ctx.font = `bold ${result.size}px Bebas Neue`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";

    const lineHeight = result.size + 8;

    result.lines.forEach((line, index) => {

        ctx.fillText(
            line,
            x + width / 2,
            y + index * lineHeight
        );

    });

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

    drawCentered(
        ctx,
        job.job_title || "",
        170,
        120,
        620,
        54,
        "#ffffff"
    );

    drawCentered(
        ctx,
        "",
        180,
        170,
        600,
        34,
        "#ffffff"
    );

    drawCentered(
        ctx,
        job.salary_czk_month || job.salary || ""
        250,
        565,
        460,
        44,
        "#000000"
    );

    drawCentered(
        ctx,
        job.accommodation || "",
        220,
        695,
        240,
        30,
        "#000000"
    );

    drawCentered(
        ctx,
        job.language || "",
        560,
        695,
        240,
        30,
        "#000000"
    );

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
                imageUrl
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

app.post("/herohero/upload", upload.single("image"), async (req, res) => {
  console.log("HeroHero upload přijat");
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
