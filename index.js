require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const { v2: cloudinary } = require("cloudinary");

const app = express();

app.use(express.json());

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const PORT = process.env.PORT || 3000;

const TEMPLATE_FOLDER = path.join(__dirname, "Templates");

const heroTemplates = {
    Austria: "Herohero/Rakousko Herohero.png",
    Belgium: "Herohero/Belgie Herohero.png",
    Denmark: "Herohero/Dánsko Herohero.png",
    Estonia: "Herohero/Estonsko Herohero.png",
    Finland: "Herohero/Finsko Herohero.png",
    France: "Herohero/Francie Herohero.png",
    Netherlands: "Herohero/Holandsko Herohero.png",
    Ireland: "Herohero/Irsko Herohero.png",
    Italy: "Herohero/italie Herohero.png",
    Cyprus: "Herohero/Kypr Herohero.png",
    Malta: "Herohero/Malta Herohero.png",
    Germany: "Herohero/Německo Herohero.png",
    Norway: "Herohero/Norsko Herohero.png",
    Greece: "Herohero/Řecko Herohero.png",
    Spain: "Herohero/Španělsko Herohero.png",
    Sweden: "Herohero/Švédsko Herohero.png"
};

const reelTemplates = {
    Austria: "reel/Rakousko reel.png",
    Belgium: "reel/Belgie reel.png",
    Denmark: "reel/Dánsko reel.png",
    Estonia: "reel/Estonsko reel.png",
    Finland: "reel/Finsko reel.png",
    France: "reel/Francie reel.png",
    Netherlands: "reel/Holandsko reel.png",
    Ireland: "reel/Irsko reel.png",
    Italy: "reel/Itálie reel.png",
    Cyprus: "reel/Kypr reel.png",
    Malta: "reel/Malta reel.png",
    Germany: "reel/Německo reel.png",
    Norway: "reel/Norsko reel.png",
    Greece: "reel/Řecko reel.png",
    Spain: "reel/Španělsko reel.png",
    Sweden: "reel/Švédsko reel.png"
};

function fitText(ctx, text, maxWidth, startSize) {

    let size = startSize;

    do {

        ctx.font = `bold ${size}px Arial`;

        if (ctx.measureText(text).width <= maxWidth)
            break;

        size--;

    } while (size > 20);

    return size;

}

function drawCentered(ctx, text, x, y, width, startSize, color = "#ffffff") {

    const fontSize = fitText(ctx, text, width, startSize);

    ctx.font = `bold ${fontSize}px Arial`;

    ctx.fillStyle = color;

    ctx.textAlign = "center";

    ctx.fillText(text, x + width / 2, y);

}
async function uploadBuffer(buffer) {

    return await new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(

            {
                folder: "PracovniTipyAI"
            },

            (err, result) => {

                if (err) return reject(err);

                resolve(result.secure_url);

            }

        );

        stream.end(buffer);

    });

}

async function createImage(job, templateFile) {

    const template = await loadImage(
        path.join(TEMPLATE_FOLDER, templateFile)
    );

    const photo = await loadImage(job.image);

    const canvas = createCanvas(template.width, template.height);

    const ctx = canvas.getContext("2d");

    ctx.drawImage(template, 0, 0);

    // hlavní fotka

    ctx.drawImage(
        photo,
        250,
        360,
        580,
        420
    );

    // Job title

    drawCentered(
        ctx,
        job.job_title,
        180,
        120,
        600,
        48,
        "#ffffff"
    );

    // City

    drawCentered(
        ctx,
        job.city,
        180,
        170,
        600,
        34,
        "#ffffff"
    );

    // Salary

    drawCentered(
        ctx,
        job.salary,
        270,
        570,
        420,
        42,
        "#000000"
    );

    // Housing

    drawCentered(
        ctx,
        job.housing,
        250,
        695,
        180,
        28,
        "#000000"
    );

    // Language

    drawCentered(
        ctx,
        job.language,
        610,
        695,
        180,
        28,
        "#000000"
    );

    // Time

    drawCentered(
        ctx,
        job.time,
        60,
        695,
        180,
        28,
        "#000000"
    );

    return canvas.toBuffer("image/png");

}
app.get("/", (req, res) => {
    res.send("PracovniTipyAI běží");
});

app.post("/generate", async (req, res) => {

    try {

        const job = req.body;

        const type = job.type || "reel";

        let template;

        if (type === "herohero") {

            template = heroTemplates[job.country];

        } else {

            template = reelTemplates[job.country];

        }

        if (!template) {

            return res.status(400).json({
                success: false,
                message: "Template nenalezena."
            });

        }

        const imageBuffer = await createImage(job, template);

        const url = await uploadBuffer(imageBuffer);

        res.json({

            success: true,

            imageUrl: url

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,

            error: err.message

        });

    }

});

app.post("/herohero", async (req, res) => {

    res.json({

        success: true

    });

});

app.listen(PORT, () => {

    console.log(`Server běží na portu ${PORT}`);

});