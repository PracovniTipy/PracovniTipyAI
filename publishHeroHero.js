console.log("========== HEROHERO START ==========");

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");

function downloadImage(url, destination) {

    return new Promise((resolve, reject) => {

        const file = fs.createWriteStream(destination);

        https.get(url, (response) => {

            if (response.statusCode !== 200) {

                fs.unlink(destination, () => {});

                return reject(
                    new Error(`Stažení obrázku selhalo (${response.statusCode})`)
                );

            }

            response.pipe(file);

            file.on("finish", () => {

                file.close();

                resolve(destination);

            });

        }).on("error", (error) => {

            fs.unlink(destination, () => {});

            reject(error);

        });

    });

}

module.exports = async function publishHeroHero(job) {

    let browser;
    let context;
    
let downloadedImage = null;
    
    try {

        console.log("==================================");
        console.log("START HEROHERO");
        console.log("==================================");

        browser = await chromium.connectOverCDP(
            `wss://production-sfo.browserless.io/chromium?token=${process.env.BROWSERLESS_TOKEN}`
        );

        context = await browser.newContext({

            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

            locale: "cs-CZ"

        });

        await context.setExtraHTTPHeaders({

            "Accept-Language": "cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://herohero.co/",
            "Upgrade-Insecure-Requests": "1"

        });

        const page = await context.newPage();

        page.setDefaultTimeout(30000);

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

        if (page.url().includes("/login")) {

            console.log("🔐 Přihlašování...");

            const emailInput = page.locator('input[type="email"]');

            await emailInput.waitFor({
                state: "visible",
                timeout: 30000,
            });

            await emailInput.fill(process.env.HERO_EMAIL);

            await page
                .locator('input[type="email"]')
                .locator("xpath=following::button[1]")
                .click();

            const passwordInput = page.locator('input[type="password"]');

            await passwordInput.waitFor({
                state: "visible",
                timeout: 30000,
            });

            await passwordInput.fill(process.env.HERO_PASSWORD);

            await page.keyboard.press("Enter");

            await page.waitForURL(
                (url) => !url.pathname.includes("/login"),
                {
                    timeout: 30000,
                }
            );

            await context.storageState({
                path: "storageState.json",
            });

            console.log("✅ Přihlášení úspěšné.");

        } else {

            console.log("✅ Session je platná.");

        }

            // ===========================
        // CREATE
        // ===========================
const allowCookies = page.getByRole("button", {
    name: "Allow all",
});
        
        try {

            await allowCookies.waitFor({
                state: "visible",
                timeout: 5000,
            });

            await allowCookies.click();

            console.log("🍪 Cookies potvrzeny.");

        } catch {

            console.log("🍪 Cookie okno nenalezeno.");
            
        }

        const editor = page.locator('[contenteditable="true"]').first();

        await editor.waitFor({
            state: "visible",
            timeout: 30000,
        });

        await editor.click();

        console.log("✅ Editor připraven.");

        if (title) {

            await page.keyboard.type(title);

            await page.keyboard.press("Enter");

            console.log("✅ Nadpis vložen.");

        }

        if (text) {

            await page.keyboard.type(text);

            console.log("✅ Text vložen.");

        }

            // ===========================
        // IMAGE DOWNLOAD
        // ===========================

        if (image) {

            downloadedImage = path.join(
                __dirname,
                "herohero-upload.jpg"
            );

            console.log("🖼️ Stahuji obrázek...");

            await downloadImage(image, downloadedImage);

            if (!fs.existsSync(downloadedImage)) {

                throw new Error("Stažený obrázek nebyl nalezen.");

            }

            console.log("✅ Obrázek stažen.");

        }

        // ===========================
        // IMAGE UPLOAD
        // ===========================

        if (downloadedImage) {

            const fileInput = page.locator('input[type="file"]').first();

            await fileInput.waitFor({
                state: "attached",
                timeout: 30000,
            });

            await fileInput.setInputFiles(downloadedImage);

            console.log("✅ Obrázek nahrán.");

            await page.waitForTimeout(3000);

        }

            // ===========================
        // PUBLISH
        // ===========================

        const publishSelectors = [

            'button:has-text("Publish")',
            'button:has-text("Publikovat")',
            'button:has-text("Post")',
            'button[type="submit"]'

        ];

        let published = false;

        for (const selector of publishSelectors) {

            const button = page.locator(selector).first();

            if (await button.count()) {

                await button.click();

                published = true;

                console.log("✅ Příspěvek publikován.");

                break;

            }

        }

        if (!published) {

            throw new Error("Nepodařilo se najít tlačítko Publish.");

        }

        await page.waitForTimeout(5000);

        console.log("🎉 HeroHero příspěvek byl úspěšně publikován.");

console.log("⏸️ Debug - čekám 120 sekund...");
await page.waitForTimeout(120000);
        
    } finally {

        if (downloadedImage && fs.existsSync(downloadedImage)) {

            fs.unlinkSync(downloadedImage);

        }

        if (browser) {

            await browser.close();

        }

        console.log("========== HEROHERO END ==========");

    }

};

console.log("PUBLISH HEROHERO READY");
