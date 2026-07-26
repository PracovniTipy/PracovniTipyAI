const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - PRODUCTION MODULE");
console.log("==========================================");

// ============================================================================
// 1. KONSTANTY A POJMENOVANÉ TIMEOUTY (NO MAGIC NUMBERS)
// ============================================================================
const CONFIG = {
    STORAGE_STATE_PATH: path.join(__dirname, "storageState.json"),
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2500,
    TIMEOUTS: {
        PAGE_NAVIGATION: 35000,
        ELEMENT_WAIT: 12000,
        LOGIN_WAIT: 25000,
        UPLOAD_WAIT: 45000,
        PUBLISH_WAIT: 25000,
        SHORT_ACTION: 5000,
    },
    VIEWPORT: { width: 1280, height: 900 },
    USER_AGENT: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    LOCALE: "cs-CZ"
};

// ============================================================================
// 2. CENTRALIZOVANÉ SELECTORY
// ============================================================================
const SELECTORS = {
    LOGIN: {
        EMAIL_INPUTS: [
            'input[type="email"]',
            'input[name="email"]',
            'input[placeholder*="email" i]',
            '[role="textbox"][name*="email" i]'
        ],
        PASSWORD_INPUTS: [
            'input[type="password"]',
            'input[name="password"]'
        ],
        CONTINUE_BUTTONS: [
            'button[type="submit"]',
            'button:has-text("Pokračovat")',
            'button:has-text("Continue")',
            'button:has-text("Dále")',
            '[data-testid*="continue" i]',
            'input[type="email"] >> xpath=following::button[1]'
        ],
        SUBMIT_BUTTONS: [
            'button[type="submit"]',
            'button:has-text("Přihlásit")',
            'button:has-text("Log in")',
            'button:has-text("Sign in")',
            '[data-testid*="login" i]'
        ]
    },
    COOKIES: [
        'button:has-text("Allow all")',
        'button:has-text("Accept all")',
        'button:has-text("Přijmout vše")',
        'button:has-text("Povolit vše")',
        'button:has-text("Souhlasím")',
        '[aria-label*="accept" i]',
        '#onetrust-accept-btn-handler'
    ],
    CREATE_TRIGGER: [
        'button:has-text("Nový příspěvek")',
        'a:has-text("Nový příspěvek")',
        'button:has-text("Create")',
        'a:has-text("Create")',
        'button:has-text("New post")',
        'a:has-text("New post")',
        'button:has-text("Post")',
        'a[href*="/create"]',
        'button[aria-label*="Create" i]',
        'button[title*="Create" i]',
        '[data-testid*="create" i]',
        'button:has(svg)'
    ],
    EDITOR: {
        TITLE: [
            'input[placeholder*="Nadpis" i]',
            'input[placeholder*="Title" i]',
            'input[name="title"]',
            'textarea[placeholder*="Nadpis" i]',
            'textarea[placeholder*="Title" i]',
            '[role="textbox"][aria-label*="title" i]'
        ],
        BODY: [
            'div[contenteditable="true"]',
            '[role="textbox"]',
            '.ProseMirror',
            '[data-lexical-editor="true"]',
            '.rich-text-editor',
            '.tiptap',
            'textarea[placeholder*="text" i]',
            'textarea[placeholder*="Napište" i]',
            'textarea[placeholder*="Write" i]',
            'textarea'
        ]
    },
    UPLOAD: {
        FILE_INPUT: 'input[type="file"]',
        OPEN_DIALOG_BUTTONS: [
            'button:has-text("Obrázek")',
            'button:has-text("Image")',
            'button:has-text("Photo")',
            '[aria-label*="image" i]',
            '[aria-label*="obrázek" i]',
            '[title*="image" i]',
            'svg[data-icon="image"]'
        ],
        INDICATORS: [
            'img[src*="blob:"]',
            'img[src*="herohero"]',
            '[class*="preview" i]',
            '[class*="thumbnail" i]',
            '[data-testid*="image-preview" i]',
            'button[aria-label*="Delete" i]',
            'button[aria-label*="Smazat" i]'
        ]
    },
    PUBLISH: {
        BUTTONS: [
            'button:has-text("Publish")',
            'button:has-text("Publikovat")',
            'button:has-text("Post")',
            'button:has-text("Zveřejnit")',
            '[data-testid*="publish" i]',
            'button[type="submit"]'
        ],
        CONFIRMATION_TOASTS: [
            '[role="status"]',
            '[role="alert"]',
            '.toast',
            '[class*="notification" i]',
            '[class*="toast" i]',
            ':has-text("Publikováno")',
            ':has-text("Published")'
        ]
    }
};

// ============================================================================
// 3. HELPER FUNKCE (RETRY, UTILS, LOGGING)
// ============================================================================

function startTimer() {
    const start = Date.now();
    return () => `${((Date.now() - start) / 1000).toFixed(2)}s`;
}

function safeUnlink(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.warn(`[WARN] Nelze smazat dočasný soubor ${filePath}:`, e.message);
    }
}

function isValidJson(filePath) {
    if (!fs.existsSync(filePath)) return false;
    try {
        JSON.parse(fs.readFileSync(filePath, "utf8"));
        return true;
    } catch {
        return false;
    }
}

async function withRetry(actionFn, description, maxRetries = CONFIG.MAX_RETRIES, delayMs = CONFIG.RETRY_DELAY_MS) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const timer = startTimer();
        try {
            console.log(`🔄 Pokus ${attempt}/${maxRetries}: ${description}`);
            const result = await actionFn();
            console.log(`✅ [${timer()}] Úspěch: ${description}`);
            return result;
        } catch (err) {
            lastError = err;
            console.warn(`⚠️ [${timer()}] Pokus ${attempt}/${maxRetries} selhal u "${description}": ${err.message}`);
            if (attempt < maxRetries) {
                await new Promise((res) => setTimeout(res, delayMs));
            }
        }
    }
    throw new Error(`❌ "${description}" selhalo i po ${maxRetries} pokusech. Poslední chyba: ${lastError.message}`);
}

async function safeClick(page, locator, description = "element") {
    const timer = startTimer();
    const count = await locator.count();
    if (count === 0) return false;

    for (let i = 0; i < count; i++) {
        const item = locator.nth(i);
        try {
            if (await item.isVisible()) {
                const isEnabled = await item.isEnabled().catch(() => true);
                if (!isEnabled) continue;

                await item.scrollIntoViewIfNeeded({ timeout: CONFIG.TIMEOUTS.SHORT_ACTION }).catch(() => {});

                try {
                    await item.click({ timeout: CONFIG.TIMEOUTS.SHORT_ACTION });
                } catch (clickErr) {
                    console.warn(`[WARN] Standardní kliknutí na ${description} selhalo. Zkouším force click...`);
                    await item.click({ force: true, timeout: CONFIG.TIMEOUTS.SHORT_ACTION }).catch(async () => {
                        console.warn(`[WARN] Force click selhal. Zkouším JS click...`);
                        await item.evaluate((el) => el.click());
                    });
                }

                console.log(`👉 [${timer()}] Kliknuto na ${description} (selector index: ${i})`);
                return true;
            }
        } catch (e) {
            // Ignorujeme neviditelné/neplatné elementy v seznamu
        }
    }
    return false;
}

async function findAndClickFirst(page, selectorsArray, description) {
    console.log(`🔍 Hledám a klikám na: ${description} (počet kandidátů: ${selectorsArray.length})`);
    for (const selector of selectorsArray) {
        const loc = page.locator(selector);
        if ((await loc.count()) > 0) {
            const success = await safeClick(page, loc, `${description} [${selector}]`);
            if (success) return selector;
        }
    }
    return null;
}

async function safeType(page, locator, text, description = "editor") {
    const timer = startTimer();
    const count = await locator.count();
    if (count === 0) return false;

    for (let i = 0; i < count; i++) {
        const item = locator.nth(i);
        if (await item.isVisible()) {
            await item.scrollIntoViewIfNeeded().catch(() => {});
            await item.click().catch(() => {});

            // Pokus 1: fill()
            try {
                await item.fill(text, { timeout: CONFIG.TIMEOUTS.SHORT_ACTION });
                console.log(`✅ [${timer()}] Vyplněno pomocí fill() -> ${description}`);
                return true;
            } catch (e) {
                console.warn(`[WARN] fill() selhal pro ${description}. Pokouším se o keyboard.type()...`);
            }

            // Pokus 2: click + keyboard.type()
            try {
                await item.click();
                await page.keyboard.type(text, { delay: 10 });
                console.log(`✅ [${timer()}] Vyplněno pomocí keyboard.type() -> ${description}`);
                return true;
            } catch (e) {
                console.warn(`[WARN] keyboard.type() selhal. Pokouším se o pressSequentially()...`);
            }

            // Pokus 3: pressSequentially()
            try {
                await item.pressSequentially(text, { delay: 10 });
                console.log(`✅ [${timer()}] Vyplněno pomocí pressSequentially() -> ${description}`);
                return true;
            } catch (e) {
                console.error(`[ERROR] Všechny zápisové metody selhaly na indexu ${i} pro ${description}`);
            }
        }
    }
    return false;
}

async function downloadImage(url, destination) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destination);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                safeUnlink(destination);
                return reject(new Error(`Stažení obrázku selhalo (HTTP ${response.statusCode})`));
            }
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve(destination);
            });
        }).on("error", (error) => {
            safeUnlink(destination);
            reject(error);
        });
    });
}

async function generateDiagnostics(page, prefix = "error") {
    try {
        console.log(`📊 Vyvářím diagnostické soubory (${prefix}.html, ${prefix}.png)...`);
        if (!page) return;

        const currentUrl = page.url();
        const currentTitle = await page.title().catch(() => "N/A");

        const textareas = await page.locator("textarea").count();
        const inputs = await page.locator("input").count();
        const editables = await page.locator('[contenteditable="true"]').count();
        const textboxes = await page.locator('[role="textbox"]').count();

        console.log(`📍 DIAGNOSTIKA URL: ${currentUrl}`);
        console.log(`📍 DIAGNOSTIKA TITLE: ${currentTitle}`);
        console.log(`📊 PRVKY STRÁNKY -> Inputs: ${inputs}, Textareas: ${textareas}, Contenteditable: ${editables}, Role Textbox: ${textboxes}`);

        const htmlContent = await page.content().catch(() => "HTML content inaccessible");
        fs.writeFileSync(`${prefix}.html`, htmlContent, "utf8");

        await page.screenshot({ path: `${prefix}.png`, fullPage: true }).catch(() => {});
        console.log(`💾 Diagnostické soubory uloženy jako ${prefix}.html a ${prefix}.png`);
    } catch (e) {
        console.error("⚠️ Nelze vytvořit diagnostiku:", e.message);
    }
}

// ============================================================================
// 4. HLAVNÍ PUBLIKAČNÍ WORKFLOW
// ============================================================================

module.exports = async function publishHeroHero(job) {
    console.log("==========================================");
    console.log("🎬 START ZPRACOVÁNÍ PŘÍSPĚVKU PRO HEROHERO");
    console.log("==========================================");

    let browser = null;
    let context = null;
    let page = null;
    let downloadedImagePath = null;

    try {
        // Inicializace prohlížeče
        console.log("🖥️ Spouštím Chromium (Docker / Railway konfigurované)...");
        browser = await chromium.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        });

        // Kontrola storageState
        const contextOptions = {
            userAgent: CONFIG.USER_AGENT,
            locale: CONFIG.LOCALE,
            viewport: CONFIG.VIEWPORT
        };

        let hasValidStorageFile = isValidJson(CONFIG.STORAGE_STATE_PATH);
        if (hasValidStorageFile) {
            console.log("🔑 Nalezen platný JSON storageState.json. Načítám relaci...");
            contextOptions.storageState = CONFIG.STORAGE_STATE_PATH;
        } else {
            console.log("ℹ️ storageState.json neexistuje nebo je neplatný. Začínám s novou relací.");
            safeUnlink(CONFIG.STORAGE_STATE_PATH);
        }

        context = await browser.newContext(contextOptions);

        await context.setExtraHTTPHeaders({
            "Accept-Language": "cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://herohero.co/",
            "Upgrade-Insecure-Requests": "1"
        });

        page = await context.newPage();

        // ---------------------------------------------------------------------
        // ODCHYTÁVÁNÍ SÍŤOVÝCH A KONZOLOVÝCH CHYB PRO LOGGING
        // ---------------------------------------------------------------------
        page.on("requestfailed", (req) => {
            console.warn(`🌐 [NET FAIL] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
        });

        page.on("response", (res) => {
            if (res.status() >= 400) {
                console.warn(`⚠️ [HTTP ${res.status()}] ${res.request().method()} ${res.url()}`);
            }
        });

        page.on("pageerror", (err) => {
            console.error(`🔥 [PAGE ERROR] ${err.message}`);
        });

        page.on("console", (msg) => {
            if (msg.type() === "error") {
                console.error(`🖥️ [BROWSER CONSOLE ERROR] ${msg.text()}`);
            }
        });

        // Extrakce dat z jobu
        const titleText = job.title || "";
        const bodyText = job.text || job.description || job.content || "";
        const imageUrl = job.image || job.imageUrl || job.image_url || "";

        // ---------------------------------------------------------------------
        // STEP 1: OTEVŘENÍ KREACE A OVĚŘENÍ PLATNOSTI SESSION
        // ---------------------------------------------------------------------
        await withRetry(async () => {
            console.log("🌐 Otevírám https://herohero.co/create...");
            await page.goto("https://herohero.co/create", {
                waitUntil: "domcontentloaded",
                timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION
            });
        }, "Načtení /create stránky");

        // Kontrola, zda vyžaduje přihlášení
        const isEmailVisible = async () => {
            for (const sel of SELECTORS.LOGIN.EMAIL_INPUTS) {
                const loc = page.locator(sel);
                if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
                    return true;
                }
            }
            return false;
        };

        let needsLogin = page.url().includes("/login") || (await isEmailVisible());

        if (hasValidStorageFile && needsLogin) {
            console.warn("⚠️ Načtený storageState.json vypršel nebo je neplatný. Mažu starý soubor a zahajuji přihlášení.");
            safeUnlink(CONFIG.STORAGE_STATE_PATH);
            hasValidStorageFile = false;
        }

        // ---------------------------------------------------------------------
        // STEP 2: AUTOMATICKÉ PŘIHLÁŠENÍ (IF NEEDED)
        // ---------------------------------------------------------------------
        if (needsLogin) {
            console.log("🔐 Vyžadováno přihlášení. Zahajuji proces přihlášení...");
            if (!process.env.HERO_EMAIL || !process.env.HERO_PASSWORD) {
                throw new Error("❌ Chybí HERO_EMAIL nebo HERO_PASSWORD v proměnných prostředí!");
            }

            await withRetry(async () => {
                // Email
                let emailFilled = false;
                for (const sel of SELECTORS.LOGIN.EMAIL_INPUTS) {
                    const loc = page.locator(sel);
                    if ((await loc.count()) > 0 && (await loc.first().isVisible())) {
                        emailFilled = await safeType(page, loc, process.env.HERO_EMAIL, "Email input");
                        if (emailFilled) break;
                    }
                }
                if (!emailFilled) throw new Error("Emailové pole nebylo nalezeno.");

                // Pokračovat
                const clickedContinue = await findAndClickFirst(page, SELECTORS.LOGIN.CONTINUE_BUTTONS, "Tlačítko po zadaní emailu");
                if (!clickedContinue) {
                    await page.keyboard.press("Enter");
                }

                // Heslo
                const passLoc = page.locator(SELECTORS.LOGIN.PASSWORD_INPUTS.join(", "));
                await passLoc.first().waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT });
                const passwordFilled = await safeType(page, passLoc, process.env.HERO_PASSWORD, "Heslo input");
                if (!passwordFilled) throw new Error("Heslové pole nebylo možné vyplnit.");

                // Submit
                const clickedSubmit = await findAndClickFirst(page, SELECTORS.LOGIN.SUBMIT_BUTTONS, "Přihlašovací tlačítko");
                if (!clickedSubmit) {
                    await page.keyboard.press("Enter");
                }

                // Čekání na dokončení přihlášení
                await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: CONFIG.TIMEOUTS.LOGIN_WAIT });
                await page.waitForLoadState("domcontentloaded");
            }, "Průběh přihlašovacího formuláře");

            // Uložení nového storageState.json
            await context.storageState({ path: CONFIG.STORAGE_STATE_PATH });
            console.log("💾 Nová relace uložena do storageState.json");

            // Návrat do /create
            await page.goto("https://herohero.co/create", { waitUntil: "domcontentloaded", timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION });
        } else {
            console.log("✅ Session je plně platná, přihlášení nebylo nutné.");
        }

        // ---------------------------------------------------------------------
        // STEP 3: ODSTRAŇOVÁNÍ COOKIE BANNERS
        // ---------------------------------------------------------------------
        await findAndClickFirst(page, SELECTORS.COOKIES, "Cookie dialog").catch(() => {});

        // ---------------------------------------------------------------------
        // STEP 4: KONTROLA A OTEVŘENÍ EDITORU
        // ---------------------------------------------------------------------
        const checkEditorVisible = async () => {
            for (const sel of SELECTORS.EDITOR.BODY) {
                const loc = page.locator(sel);
                if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
                    return sel;
                }
            }
            return null;
        };

        let activeEditorSelector = await checkEditorVisible();

        if (!activeEditorSelector) {
            console.log("🔍 Editor není přímo aktivní. Hledám tlačítko pro nový příspěvek (+ / Create)...");
            await findAndClickFirst(page, SELECTORS.CREATE_TRIGGER, "Tlačítko vytvořit příspěvek");
            
            // Čekáme, až se objeví editor
            await withRetry(async () => {
                activeEditorSelector = await checkEditorVisible();
                if (!activeEditorSelector) throw new Error("Editor se po kliknutí na Create neotevřel.");
            }, "Čekání na otevření editoru");
        }

        console.log(`✅ Editor připraven (aktivní selector: ${activeEditorSelector})`);

        // ---------------------------------------------------------------------
        // STEP 5: VYPLNĚNÍ NADPISU A TEXTU
        // ---------------------------------------------------------------------
        if (titleText) {
            console.log(`📝 Vkládám nadpis: "${titleText}"`);
            let titleFilled = false;
            for (const sel of SELECTORS.EDITOR.TITLE) {
                const loc = page.locator(sel);
                if ((await loc.count()) > 0 && (await loc.first().isVisible())) {
                    titleFilled = await safeType(page, loc, titleText, `Nadpis [${sel}]`);
                    if (titleFilled) break;
                }
            }

            if (!titleFilled) {
                console.warn("⚠️ Nenalezeno dedikované pole pro nadpis. Vpisuji přes keyboard do hlavního editoru...");
                await page.keyboard.type(titleText);
                await page.keyboard.press("Enter");
            }
        }

        if (bodyText) {
            console.log("📝 Vkládám obsah příspěvku...");
            let bodyFilled = false;
            for (const sel of SELECTORS.EDITOR.BODY) {
                const loc = page.locator(sel);
                if ((await loc.count()) > 0 && (await loc.first().isVisible())) {
                    bodyFilled = await safeType(page, loc, bodyText, `Text editor [${sel}]`);
                    if (bodyFilled) break;
                }
            }

            if (!bodyFilled) {
                throw new Error("Nepodařilo se zapsat obsah příspěvku do žádného editoru.");
            }
        }

        // ---------------------------------------------------------------------
        // STEP 6: STAŽENÍ A UPLOAD OBRÁZKU
        // ---------------------------------------------------------------------
        if (imageUrl) {
            await withRetry(async () => {
                console.log(`🖼️ Detekována URL obrázku: ${imageUrl}`);
                downloadedImagePath = path.join(__dirname, `upload_temp_${Date.now()}.jpg`);

                await downloadImage(imageUrl, downloadedImagePath);
                if (!fs.existsSync(downloadedImagePath)) {
                    throw new Error("Stažený soubor obrázku na disku neexistuje.");
                }
                console.log("✅ Obrázek byl stažen do dočasného souboru.");

                let fileInput = page.locator(SELECTORS.UPLOAD.FILE_INPUT).first();

                // Pokud input neexistuje v DOMu, otevřeme dialog tlačítkem
                if ((await fileInput.count()) === 0) {
                    console.log("🔍 Input pro upload není přítomen, otevírám dialog pro obrázky...");
                    await findAndClickFirst(page, SELECTORS.UPLOAD.OPEN_DIALOG_BUTTONS, "Tlačítko dialogu obrázků");
                }

                fileInput = page.locator(SELECTORS.UPLOAD.FILE_INPUT).first();
                await fileInput.waitFor({ state: "attached", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
                await fileInput.setInputFiles(downloadedImagePath);
                console.log("📤 Soubor byl předán file inputu.");

                // Ověření dokončení uploadu pomocí indikátorů (preview / image / loader zmizel)
                console.log("⏳ Ověřuji dokončení nahrávání obrázku na server...");
                let uploadConfirmed = false;
                const uploadTimer = Date.now();

                while (Date.now() - uploadTimer < CONFIG.TIMEOUTS.UPLOAD_WAIT) {
                    for (const ind of SELECTORS.UPLOAD.INDICATORS) {
                        const loc = page.locator(ind);
                        if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
                            uploadConfirmed = true;
                            console.log(`✅ Upload obrázku potvrzen přes indikátor: ${ind}`);
                            break;
                        }
                    }
                    if (uploadConfirmed) break;
                    await page.waitForTimeout(1000);
                }

                if (!uploadConfirmed) {
                    console.warn("⚠️ Nebyl detekován explicitní indikátor náhledu obrázku, ale proces pokračuje.");
                }
            }, "Stažení a nahrání obrázku");
        }

        // ---------------------------------------------------------------------
        // STEP 7: PUBLIKOVÁNÍ PŘÍSPĚVKU
        // ---------------------------------------------------------------------
        await withRetry(async () => {
            console.log("🚀 Zahajuji publikování...");
            const initialUrl = page.url();

            const clickedPublish = await findAndClickFirst(page, SELECTORS.PUBLISH.BUTTONS, "Publikační tlačítko");
            if (!clickedPublish) {
                throw new Error("Tlačítko pro publikování nebylo nalezeno nebo na něj nešlo kliknout.");
            }

            console.log("⏳ Čekám na potvrzení publikování (URL / Toast / zmizení editoru)...");
            let publishConfirmed = false;
            const publishTimer = Date.now();

            while (Date.now() - publishTimer < CONFIG.TIMEOUTS.PUBLISH_WAIT) {
                // Check A: Změna URL
                if (page.url() !== initialUrl && !page.url().includes("/create")) {
                    publishConfirmed = true;
                    console.log(`✅ Publikace potvrzena přesměrováním na URL: ${page.url()}`);
                    break;
                }

                // Check B: Potvrzovací toast
                for (const toastSel of SELECTORS.PUBLISH.CONFIRMATION_TOASTS) {
                    const loc = page.locator(toastSel);
                    if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
                        publishConfirmed = true;
                        console.log(`✅ Publikace potvrzena zobrazením oznamovacího prvku: ${toastSel}`);
                        break;
                    }
                }
                if (publishConfirmed) break;

                // Check C: Editor zmizel
                const currentEditor = await checkEditorVisible();
                if (!currentEditor) {
                    publishConfirmed = true;
                    console.log("✅ Publikace potvrzena: editor zmizel z obrazovky.");
                    break;
                }

                await page.waitForTimeout(1000);
            }

            if (!publishConfirmed) {
                console.warn("⚠️ Nepodařilo se zachytit 100% potvrzovací signál publikování, ale tlačítko bylo stisknuto.");
            }
        }, "Publikování příspěvku");

        console.log("🎉 HEROHERO PŘÍSPĚVEK BYL ÚSPĚŠNĚ PUBLIKOVÁN!");

    } catch (error) {
        console.error("==========================================");
        console.error("❌ CHYBA PŘI PROVÁDĚNÍ PUBLISH HEROHERO:");
        console.error(error.message);
        console.error("==========================================");

        if (page) {
            await generateDiagnostics(page, "error");
        }

        throw error;

    } finally {
        console.log("🧹 Vyčištění dočasných souborů a zavírání prohlížeče...");
        safeUnlink(downloadedImagePath);

        if (context) {
            await context.close().catch(() => {});
        }
        if (browser) {
            await browser.close().catch(() => {});
        }

        console.log("========== HEROHERO PUBLISHER END ==========");
    }
};

console.log("PUBLISH HEROHERO MODULE READY");
