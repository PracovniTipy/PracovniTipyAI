require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createCanvas, loadImage } = require("canvas");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

const { v2: cloudinary } = require("cloudinary");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

app.use(express.json());

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const PORT = process.env.PORT || 3000;

const TEMPLATE_FOLDER = path.join(__dirname, "templates");

console.log("Templates:", TEMPLATE_FOLDER);

console.log("Exists:", fs.existsSync(TEMPLATE_FOLDER));
const heroTemplates = {
    Rakousko: "Herohero/Rakousko Herohero.png",
    Belgie: "Herohero/Belgie Herohero.png",
    Dánsko: "Herohero/Dansko Herohero.png",
    Estonsko: "Herohero/Estonsko Herohero.png",
    Finsko: "Herohero/Finsko Herohero.png",
    France: "Herohero/Francie Herohero.png",
    Nizozemsko: "Herohero/Holandsko Herohero.png",
    Irsko: "Herohero/Irsko Herohero.png",
    Itálie: "Herohero/Italie Herohero.png",
    Kypr: "Herohero/Kypr Herohero.png",
    Malta: "Herohero/Malta Herohero.png",
    Německo: "Herohero/Nemecko Herohero.png",
    Norsko: "Herohero/Norsko Herohero.png",
    Řecko: "Herohero/Recko Herohero.png",
    Španělsko: "Herohero/Spanelsko Herohero.png",
    Švédsko: "Herohero/Svedsko Herohero.png"
};

const reelTemplates = {
    Rakousko: "reel/Rakousko reel.png",
    Belgie: "reel/Belgie reel.png",
    Dánsko: "reel/Dansko reel.png",
    Estonsko: "reel/Estonsko reel.png",
    Finsko: "reel/Finsko reel.png",
    Francie: "reel/Francie reel.png",
    Nizozemsko: "reel/Holandsko reel.png",
    Irsko: "reel/Irsko reel.png",
    Itálie: "reel/Italie reel.png",
    Kypr: "reel/Kypr reel.png",
    Malta: "reel/Malta reel.png",
    Německo: "reel/Nemecko reel.png",
    Norsko: "reel/Norsko reel.png",
    Řecko: "reel/Recko reel.png",
    Španělsko: "reel/Spanelsko reel.png",
    Švédsko: "reel/Svedsko reel.png"
};

function fitText(ctx, text, maxWidth, startSize) {

    let size = startSize;

    do {

        ctx.font = `bold ${size}px Arial`;

        if (ctx.measureText(text).width <= maxWidth) {
            break;
        }

        size--;

    } while (size > 20);

    return size;

}

function drawCentered(ctx, text, x, y, width, startSize, color = "#ffffff") {

    const fontSize = fitText(ctx, text, width, startSize);

    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";

    ctx.fillText(text || "", x + width / 2, y);

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
        180,
        120,
        600,
        48,
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
        job.salary || "",
        270,
        570,
        420,
        42,
        "#000000"
    );

    drawCentered(
        ctx,
        job.accommodation || "",
        250,
        695,
        180,
        28,
        "#000000"
    );

    drawCentered(
        ctx,
        job.language || "",
        610,
        695,
        180,
        28,
        "#000000"
    );

    return canvas.toBuffer("image/png");

}

async function uploadBuffer(buffer) {
    
    return await new Promise((resolve, reject) => {

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

        ffmpeg(imagePath)
            .loop(8)
            .videoCodec("libx264")
            .outputOptions([
                "-pix_fmt",
                "yuv420p",
                "-vf",
                "scale=1080:1920"
            ])
            .save(videoPath)
            .on("end", () => resolve())
            .on("error", reject);

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

app.post("/generate", async (req, res) => {

if (!Array.isArray(req.body.jobs) || !Array.isArray(req.body.reels)) {
    return res.status(400).json({
        success: false,
        error: "jobs a reels musí být pole"
    });
}
    
    try {

        const jobs = req.body.jobs || [];
        const reels = req.body.reels || [];

        const herohero = [];
        const instagram = [];

        // HEROHERO

        for (const job of jobs) {

            const template = heroTemplates[job.country];

            if (!template) {
                console.log(`HeroHero template not found: ${job.country}`);
                continue;
            }

            const imageBuffer = await createImage(job, template);

            const imageUrl = await uploadBuffer(imageBuffer);

            herohero.push({
                ...job,
                imageUrl
            });

        }

        // REELS

        for (const reel of reels) {

            const template = reelTemplates[reel.country];

            if (!template) {
                console.log(`Reel template not found: ${reel.country}`);
                continue;
            }

            const imageBuffer = await createImage(reel, template);

            const videoUrl = await createReel(imageBuffer);

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

    console.error(err);
    console.error("HTTP CODE:", err.http_code);
    console.error("MESSAGE:", err.message);
    console.error("FULL ERROR:", JSON.stringify(err, null, 2));

    res.status(500).json({
        success: false,
        error: err.message
    });

}

});

app.listen(PORT, () => {
    console.log(`Server běží na portu ${PORT}`);
});
