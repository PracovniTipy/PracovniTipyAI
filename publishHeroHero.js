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
let context;
    
try {
    
    console.log("==================================");
    console.log("START HEROHERO");
    console.log("==================================");

    console.dir(job, { depth: null });

    browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io/chromium?token=${process.env.BROWSERLESS_TOKEN}`
);

console.log("CONTEXTS:", browser.contexts().length);

context = await browser.newContext();
    
    await context.setExtraHTTPHeaders({
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  "Accept-Language": "cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://herohero.co/",
  "Upgrade-Insecure-Requests": "1"
});

// if (fs.existsSync("storageState.json")) {
//     await context.addCookies(
//         JSON.parse(fs.readFileSync("storageState.json", "utf8")).cookies
//     );
// }
    
const page = await context.newPage();

    page.on("response", async (response) => {
    const status = response.status();
    const url = response.url();

    if (status === 401 || status === 403) {
        console.log("AUTH ERROR:", status, url);

        try {
            console.log(await response.text());
        } catch {}
    }
});
    
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
    
const body = await page.locator("body").innerText();

console.log(body);

if (
    body.includes("Login or sign up") ||
    body.includes("Continue with Google") ||
    body.includes("Continue with Facebook")
) {
    throw new Error("NEJSEM PŘIHLÁŠENÝ");
}

console.log("✅ TEST 1 - PŘIHLÁŠENÍ OK");
    
    console.log("JSEM PŘIHLÁŠENÝ");
    
await page.screenshot({
    path: "po-create.png",
    fullPage: true,
});

console.log(await page.content());

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

    // ===========================
    // CREATE
    // ===========================

    await page.goto("https://herohero.co/create", {

        waitUntil: "domcontentloaded",

    });
    
console.log("AFTER CREATE URL:", page.url());
console.log("AFTER CREATE BODY:");
console.log(await page.locator("body").innerText());
    
await page.waitForTimeout(3000);
await page.screenshot({
    path: "create-page.png",
    fullPage: true,
});
    
    await page.waitForLoadState("domcontentloaded");

    await page.waitForTimeout(3000);

    console.log("✅ TEST 2 - CREATE OTEVŘENO");
    
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

const html = await page.content();
console.log(html);
    
    await page.waitForSelector('[contenteditable="true"]', {
    timeout: 60000
});
    
console.log("✅ TEST 3 - EDITOR NALEZEN");
    
    await editable.click();

    if (title) {

        await page.keyboard.type(title);        
        await page.keyboard.press("Enter");
        
        console.log("✅ TEST 4 - NADPIS VLOŽEN");

    }

    if (text) {

        await page.keyboard.type(text);
        
        console.log("✅ TEST 5 - POPISEK VLOŽEN");

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

console.log("IMAGE URL:", image);
console.log("LOCAL FILE:", downloadedImage);
console.log("EXISTS:", fs.existsSync(downloadedImage));
console.log("SIZE:", fs.statSync(downloadedImage).size);
    
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
        
        console.log("✅ TEST 6 - FOTKA NAHRÁNA");

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

} 
    
finally {

    if (browser) {

        try {
            await context.tracing.stop({
                path: "trace.zip"
            });
            console.log("trace.zip uložen");
        } catch (e) {
            console.log("TRACE ERROR:", e.message);
        }

        await browser.close();
    }

}
}

console.log("PUBLISH HEROHERO FILE VERSION 2");
