console.log("========== HEROHERO START ==========");

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");

function downloadImage(url, destination) {

    return new Promise((resolve, reject) => {

        const file = fs.createWriteStream(destination);

        https.get(url, (response) => {

            response.pipe(file);

            file.on("finish", () => {

                file.close();

                resolve(destination);

            });

        }).on("error", (err) => {

            fs.unlink(destination, () => {});

            reject(err);

        });

    });

}

module.exports = async function publishHeroHero(job) {
    
    let browser;
    
try {
    
    console.log("==================================");
    console.log("START HEROHERO");
    console.log("==================================");

    console.dir(job, { depth: null });


    
browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io/stealth?token=${process.env.BROWSERLESS_TOKEN}`
    );

const context = await browser.newContext({
    storageState: fs.existsSync("storageState.json")
        ? "storageState.json"
        : undefined
});
    
const page = await context.newPage();
await context.tracing.start({
    screenshots: true,
    snapshots: true
});
    
    page.setDefaultTimeout(30000);

    page.on("request", (request) => {

        const url = request.url();

        if (url.includes("/auth") || url.includes("/oauth")) {

            console.log("======== REQUEST ========");

            console.log(request.method(), url);

            try {
                console.log(request.postData());
            } catch {}

            console.log("=========================");

        }

    });

    page.on("response", async (response) => {
   
        const url = response.url();

        if (url.includes("/auth") || url.includes("/oauth")) {

            console.log("======== AUTH ========");

            console.log(response.status(), response.request().method(), url);

            try {

                console.log(await response.text());

            } catch {}

            console.log("======================");

        }

    });

    const title = job.title || "";

    const text =
        job.text ||
        job.description ||
        job.content ||
        "";

    const image =
        job.image ||
        job.imageUrl ||
        job.image_url ||
        "";

      // ===========================
    // LOGIN
    // ===========================

await page.goto("https://herohero.co/create", {
    waitUntil: "domcontentloaded",
});

console.log("URL:", page.url());
    
if (!page.url().includes("/login")) {
    console.log("Session je platná, login přeskakuji.");
} else {

    // sem pokračuje tvůj stávající login kód...

    await page.waitForLoadState("domcontentloaded");

    await page.locator('input[type="email"]').fill(process.env.HERO_EMAIL);

    await page.screenshot({
        path: "01-email.png",
        fullPage: true,
    });

    const emailButton = page.locator('input[type="email"]')
        .locator("xpath=following::button[1]");

    await emailButton.click();

    await page.waitForTimeout(3000);

    const passwordInput = page.locator('input[type="password"]');

    await passwordInput.waitFor({
        state: "visible",
        timeout: 15000,
    });

    await passwordInput.fill(process.env.HERO_PASSWORD);

    await page.keyboard.press("Enter");

    await page.waitForTimeout(6000);

    console.log("URL po loginu:", page.url());

    await page.screenshot({
        path: "02-after-login.png",
        fullPage: true,
    });

    if (page.url().includes("/login")) {

        throw new Error("Login do HeroHero selhal.");

    }

await context.storageState({
    path: "storageState.json"
});
    
console.log("storageState.json uložen");
console.log("Session uložena.");}

    await context.tracing.stop({
    path: "trace.zip" 
        
});
    
console.log("trace.zip uložen");

    // ===========================
    // CREATE
    // ===========================

    await page.goto("https://herohero.co/create", {

        waitUntil: "domcontentloaded",

    });

    await page.waitForLoadState("domcontentloaded");

    await page.waitForTimeout(3000);

    console.log("CREATE PAGE");

    await page.screenshot({

        path: "03-create.png",

        fullPage: true,

    });

  await page.screenshot({
    path: "before-editor.png",
    fullPage: true,
});

await page.screenshot({
    path: "debug.png",
    fullPage: true,
});

console.log("URL:", page.url());
console.log(await page.title());

const editable = page.locator('[contenteditable="true"]').first();

    console.log("URL:", page.url());

console.log("Cookies:", await context.cookies());

await page.screenshot({
    path: "before-create.png",
    fullPage: true,
});

console.log("URL:", page.url());
console.log("TITLE:", await page.title());
    
console.log(await page.locator("body").innerHTML());
throw new Error("STOP");
    
    await page.waitForSelector('[contenteditable="true"]', {
    timeout: 60000
});

    await editable.click();

    if (title) {

        await page.keyboard.type(title);

        await page.keyboard.press("Enter");

    }

    if (text) {

        await page.keyboard.type(text);

    }

    console.log("Text vložen.");

      // ===========================
    // IMAGE DOWNLOAD
    // ===========================

    let downloadedImage = null;

    if (image) {

        downloadedImage = path.join(
            __dirname,
            "herohero-upload.jpg"
        );

        console.log("Stahuji obrázek...");

        await downloadImage(image, downloadedImage);

        console.log("Obrázek stažen.");

    }

    // ===========================
    // IMAGE UPLOAD
    // ===========================

    if (downloadedImage) {

        const fileInput = page.locator('input[type="file"]');

        await fileInput.first().waitFor({

            state: "attached",

            timeout: 20000,

        });

        await fileInput.first().setInputFiles(downloadedImage);

        console.log("Soubor nahrán.");

        await page.waitForTimeout(5000);

        await page.screenshot({

            path: "04-image-uploaded.png",

            fullPage: true,

        });

    }

    // ===========================
    // ČEKÁNÍ NA DOKONČENÍ UPLOADU
    // ===========================

    await page.waitForTimeout(3000);

    console.log("Upload dokončen.");

      // ===========================
    // PUBLISH
    // ===========================

    let published = false;

    const publishSelectors = [

        'button:has-text("Publish")',
        'button:has-text("Publikovat")',
        'button:has-text("Post")',
        'button[type="submit"]'

    ];

    for (const selector of publishSelectors) {

        try {

            const button = page.locator(selector).first();

            if (await button.count()) {

                await button.click();

                published = true;

                console.log("Kliknuto na Publish.");

                break;

            }

        } catch (e) {

            console.log("Selector nenalezen:", selector);

        }

    }

    if (!published) {

        console.log("Publish tlačítko nebylo nalezeno.");

        await page.screenshot({

            path: "05-publish-not-found.png",

            fullPage: true,

        });

    } else {

        await page.waitForTimeout(8000);

        console.log("Publikace dokončena.");

        await page.screenshot({

            path: "06-after-publish.png",

            fullPage: true,

        });

    }

    console.log("Aktuální URL:", page.url());

} finally {

    if (browser) {
        await browser.close();
    }

}
}

console.log("PUBLISH HEROHERO FILE VERSION 2");
