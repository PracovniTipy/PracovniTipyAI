const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - PRODUCTION MODULE (FIXED REV)");
console.log("==========================================");

// ============================================================================
// 1. KONSTANTY A POJMENOVANÉ TIMEOUTY
// ============================================================================
const CONFIG = {
    STORAGE_STATE_PATH: path.join(__dirname, "storageState.json"),
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2500,
    HEADLESS: process.env.HEADLESS !== "false",
    DEBUG: process.env.DEBUG === "true" || process.env.DEBUG === "1",
    TIMEOUTS: {
        PAGE_NAVIGATION: 35000,
        SPA_HYDRATION: 2500,
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
    NO_ACCESS: [
        ':has-text("K této stránce nemáš přístup")',
        ':has-text("Nemáš přístup")',
        ':has-text("Nemáte přístup")',
        ':has-text("NoAccessError")',
        ':has-text("Access Denied")',
        ':has-text("Forbidden")',
        ':has-text("Unauthorized")',
        '[class*="error" i]:has-text("403")',
        '[class*="error" i]:has-text("401")',
        '[data-testid*="error" i]'
    ],
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
        'button:has-text("Create")',
        'button:has-text("New post")',
        'button:has-text("Post")',
        'button[aria-label*="Create" i]',
        'button[title*="Create" i]',
        '[data-testid*="create" i]'
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
// 3. HELPER FUNKCE
// ============================================================================

function debugLog(...args) {
    if (CONFIG.DEBUG) {
        console.log(`[DEBUG ${new Date().toISOString()}]`, ...args);
    }
}

function startTimer() {
    const start = Date.now();
    return () => `${((Date.now() - start) / 1000).toFixed(2)}s`;
}

function safeUnlink(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            debugLog(`Smazán dočasný soubor: ${filePath}`);
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

async function waitForSpaLoad(page) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(CONFIG.TIMEOUTS.SPA_HYDRATION);
}

async function detectNoAccessError(page) {
    for (const selector of SELECTORS.NO_ACCESS) {
        const loc = page.locator(selector);
        const count = await loc.count();
        for (let i = 0; i < count; i++) {
            const item = loc.nth(i);
            if (await item.isVisible().catch(() => false)) {
                const text = await item.innerText().catch(() => selector);
                return { detected: true, selector, text: text.trim() };
            }
        }
    }
    return { detected: false, selector: null, text: null };
}

async function findFirstVisible(page, selectorsArray) {
    for (const selector of selectorsArray) {
        const loc = page.locator(selector);
        const count = await loc.count();
        for (let i = 0; i < count; i++) {
            if (await loc.nth(i).isVisible().catch(() => false)) {
                return { selector, locator: loc.nth(i) };
            }
        }
    }
    return null;
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
    throw new Error(`❌ "${description}" selhalo i po ${maxRetries} pokusech. Poslední chybný stav: ${lastError.message}`);
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
                        console.warn(`[WARN] Force click selhal. Zkouším JS DOM click...`);
                        await item.evaluate((el) => el.click());
                    });
                }

                console.log(`👉 [${timer()}] Kliknuto na ${description} (index: ${i})`);
                return true;
            }
        } catch (e) {
            debugLog(`Prvek ${description} na indexu ${i} nebylo možné prokliknout:`, e.message);
        }
    }
    return false;
}

async function findAndClickFirst(page, selectorsArray, description) {
    console.log(`🔍 Hledám a klikám na: ${description}`);
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

            try {
                await item.fill(text, { timeout: CONFIG.TIMEOUTS.SHORT_ACTION });
                console.log(`✅ [${timer()}] Vyplněno pomocí fill() -> ${description}`);
                return true;
            } catch (e) {
                console.warn(`[WARN] fill() selhal pro ${description}. Zkouším keyboard.type()...`);
            }

            try {
                await item.click();
                await page.keyboard.type(text, { delay: 10 });
                console.log(`✅ [${timer()}] Vyplněno pomocí keyboard.type() -> ${description}`);
                return true;
            } catch (e) {
                console.warn(`[WARN] keyboard.type() selhal. Zkouším pressSequentially()...`);
            }

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

async function generateDiagnostics(page, context, prefix = `error_${Date.now()}`) {
    try {
        console.log(`📊 Vyvářím diagnostické soubory (${prefix}.html, ${prefix}.png)...`);
        
        const tracePath = path.join(__dirname, `${prefix}-trace.zip`);
        if (context) {
            await context.tracing.stop({ path: tracePath }).catch(() => {});
            console.log(`📁 Playwright Trace uložen do: ${tracePath}`);
        }

        if (!page) return;

        const currentUrl = page.url();
        const currentTitle = await page.title().catch(() => "N/A");

        const hasLogin = !!(await findFirstVisible(page, SELECTORS.LOGIN.EMAIL_INPUTS));
        const hasEditor = !!(await findFirstVisible(page, SELECTORS.EDITOR.BODY));
        const hasCreateBtn = !!(await findFirstVisible(page, SELECTORS.CREATE_TRIGGER));
        const noAccessInfo = await detectNoAccessError(page);

        console.log(`================ DIAGNOSTICKÝ SOUHRN ================`);
        console.log(`📍 URL: ${currentUrl}`);
        console.log(`📍 TITLE: ${currentTitle}`);
        console.log(`🔍 STATUS PRVKŮ -> Login input: ${hasLogin} | Editor: ${hasEditor} | Create Btn: ${hasCreateBtn}`);
        console.log(`🔍 NO ACCESS HIT -> Detected: ${noAccessInfo.detected} | Selector: ${noAccessInfo.selector || "N/A"} | Text: "${noAccessInfo.text || "N/A"}"`);
        console.log(`===================================================`);

        const htmlContent = await page.content().catch(() => "HTML content inaccessible");
        fs.writeFileSync(path.join(__dirname, `${prefix}.html`), htmlContent, "utf8");

        await page.screenshot({ path: path.join(__dirname, `${prefix}.png`), fullPage: true }).catch(() => {});
        console.log(`💾 Diagnostika uložena pod prefixem: ${prefix}`);
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

    const createNewContext = async (withStorageState = true) => {
        if (context) {
            await context.tracing.stop().catch(() => {});
            await context.close().catch(() => {});
        }

        const contextOptions = {
            userAgent: CONFIG.USER_AGENT,
            locale: CONFIG.LOCALE,
            viewport: CONFIG.VIEWPORT
        };

        if (withStorageState && isValidJson(CONFIG.STORAGE_STATE_PATH)) {
            console.log("🔑 [SESSION] Načítám storageState.json do nového BrowserContext...");
            contextOptions.storageState = CONFIG.STORAGE_STATE_PATH;
        } else {
            console.log("ℹ️ [SESSION] Vytvářím čistý BrowserContext bez uložené relace.");
        }

        context = await browser.newContext(contextOptions);

        await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

        await context.setExtraHTTPHeaders({
            "Accept-Language": "cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://herohero.co/"
        });

        const newPage = await context.newPage();

        newPage.on("requestfailed", (req) => {
            debugLog(`🌐 [NET FAIL] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
        });

        newPage.on("response", (res) => {
            if (res.status() >= 400) {
                debugLog(`⚠️ [HTTP ${res.status()}] ${res.request().method()} ${res.url()}`);
            }
        });

        newPage.on("pageerror", (err) => {
            console.error(`🔥 [PAGE ERROR] ${err.message}`);
        });

        newPage.on("console", (msg) => {
            if (msg.type() === "error") {
                debugLog(`🖥️ [BROWSER CONSOLE ERROR] ${msg.text()}`);
            }
        });

        return newPage;
    };

    try {
        console.log(`🖥️ Spouštím Chromium (Headless: ${CONFIG.HEADLESS})...`);
        browser = await chromium.launch({
            headless: CONFIG.HEADLESS,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        });

        let hasValidStorageFile = isValidJson(CONFIG.STORAGE_STATE_PATH);
        page = await createNewContext(hasValidStorageFile);

        const titleText = job.title || "";
        const bodyText = job.text || job.description || job.content || "";
        const imageUrl = job.image || job.imageUrl || job.image_url || "";

        // STEP 1: NAČTENÍ /CREATE
        await withRetry(async () => {
            console.log("🌐 Naviguji na https://herohero.co/create...");
            await page.goto("https://herohero.co/create", {
                waitUntil: "domcontentloaded",
                timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION
            });
            await waitForSpaLoad(page);
        }, "Načtení /create stránky");

        const evaluateSessionStatus = async () => {
            console.log("🔍 [DECISION] Vyhodnocuji stav relace na aktuální stránce...");

            if (page.url().includes("/login")) {
                console.warn("⚠️ [SESSION INVALID] URL obsahuje '/login'.");
                return { valid: false, reason: "REDIRECT_LOGIN" };
            }

            const loginInput = await findFirstVisible(page, SELECTORS.LOGIN.EMAIL_INPUTS);
            if (loginInput) {
                console.warn(`⚠️ [SESSION INVALID] Viditelné přihlašovací pole (${loginInput.selector}).`);
                return { valid: false, reason: "LOGIN_FORM_PRESENT" };
            }

            const noAccessInfo = await detectNoAccessError(page);
            if (noAccessInfo.detected) {
                console.warn(`⚠️ [NO_ACCESS_DETECTED] Chyba přístupu: "${noAccessInfo.text}" (${noAccessInfo.selector})`);
                return { valid: false, reason: `NO_ACCESS: ${noAccessInfo.text}` };
            }

            const editorFound = await findFirstVisible(page, SELECTORS.EDITOR.BODY);
            if (editorFound) {
                console.log(`✅ [SESSION VALID] Editor je již přímo zobrazen (${editorFound.selector}).`);
                return { valid: true, editorReady: true, editorSelector: editorFound.selector };
            }

            const createBtnFound = await findFirstVisible(page, SELECTORS.CREATE_TRIGGER);
            if (createBtnFound) {
                console.log(`✅ [SESSION VALID] Tlačítko pro nový příspěvek je k dispozici (${createBtnFound.selector}).`);
                return { valid: true, editorReady: false, createSelector: createBtnFound.selector };
            }

            console.warn("⚠️ [SESSION INVALID] Nenalezen editor ani tlačítko pro tvorbu.");
            return { valid: false, reason: "NO_EDITOR_OR_CREATE_BTN" };
        };

        let sessionStatus = await evaluateSessionStatus();

        if (hasValidStorageFile && !sessionStatus.valid) {
            console.warn(`⚠️ [SESSION EXPIRED] Uložená relace selhala (Důvod: ${sessionStatus.reason}). Ruším relaci a mažu storageState.json.`);
            safeUnlink(CONFIG.STORAGE_STATE_PATH);
            hasValidStorageFile = false;
        }

        // STEP 2: RE-LOGIN WORKFLOW
        if (!sessionStatus.valid) {
            console.log("🔐 [LOGIN REQUIRED] Relace neplatná. Vytvářím čistý kontext pro nové přihlášení...");
            if (!process.env.HERO_EMAIL || !process.env.HERO_PASSWORD) {
                throw new Error("❌ Chybí HERO_EMAIL nebo HERO_PASSWORD v enviromentu!");
            }

            page = await createNewContext(false);

            await page.goto("https://herohero.co/login", { waitUntil: "domcontentloaded", timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION });
            await waitForSpaLoad(page);

            await withRetry(async () => {
                let emailFilled = false;
                for (const sel of SELECTORS.LOGIN.EMAIL_INPUTS) {
                    const loc = page.locator(sel);
                    if ((await loc.count()) > 0 && (await loc.first().isVisible())) {
                        emailFilled = await safeType(page, loc, process.env.HERO_EMAIL, "Email input");
                        if (emailFilled) break;
                    }
                }
                if (!emailFilled) throw new Error("Emailové pole nebylo nalezeno.");

                const clickedContinue = await findAndClickFirst(page, SELECTORS.LOGIN.CONTINUE_BUTTONS, "Pokračovat tlačítko");
                if (!clickedContinue) {
                    await page.keyboard.press("Enter");
                }

                const passLoc = page.locator(SELECTORS.LOGIN.PASSWORD_INPUTS.join(", "));
                await passLoc.first().waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT });
                const passwordFilled = await safeType(page, passLoc, process.env.HERO_PASSWORD, "Heslo input");
                if (!passwordFilled) throw new Error("Heslové pole nebylo možné vyplnit.");

                const clickedSubmit = await findAndClickFirst(page, SELECTORS.LOGIN.SUBMIT_BUTTONS, "Přihlašovací tlačítko");
                if (!clickedSubmit) {
                    await page.keyboard.press("Enter");
                }

                await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: CONFIG.TIMEOUTS.LOGIN_WAIT });
                await waitForSpaLoad(page);
            }, "Průběh přihlašovacího formuláře");

            console.log("🌐 Návrat na https://herohero.co/create k ověření nové relace...");
            await page.goto("https://herohero.co/create", { waitUntil: "domcontentloaded", timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION });
            await waitForSpaLoad(page);

            sessionStatus = await evaluateSessionStatus();
            if (!sessionStatus.valid) {
                throw new Error(`❌ Přihlášení proběhlo, ale účet nemá oprávnění tvořit na /create (Důvod: ${sessionStatus.reason}). Session neukládám.`);
            }

            // ATOMICKÝ ZÁPIS STORAGE STATE
            const tempStoragePath = `${CONFIG.STORAGE_STATE_PATH}.tmp`;
            await context.storageState({ path: tempStoragePath });
            fs.renameSync(tempStoragePath, CONFIG.STORAGE_STATE_PATH);
            console.log("💾 [SESSION SAVED] Nová plně ověřená relace uložena do storageState.json");
        }

        console.log("✅ [DECISION] Relace je ověřená a účet má oprávnění vytvářet příspěvky.");

        // STEP 3: COOKIE BANNERS
        await findAndClickFirst(page, SELECTORS.COOKIES, "Cookie dialog").catch(() => {});

        // STEP 4: OTEVŘENÍ EDITORU
        let activeEditor = await findFirstVisible(page, SELECTORS.EDITOR.BODY);

        if (!activeEditor) {
            console.log("🔍 [EDITOR] Editor není otevřený. Pokouším se jej aktivovat tlačítkem Create...");
            
            await withRetry(async () => {
                const noAccess = await detectNoAccessError(page);
                if (noAccess.detected) {
                    throw new Error(`Detekována chyba přístupu před kliknutím na Create: ${noAccess.text}`);
                }

                const clicked = await findAndClickFirst(page, SELECTORS.CREATE_TRIGGER, "Tlačítko pro vytvoření příspěvku");
                if (!clicked) {
                    throw new Error("Tlačítko pro vytvoření příspěvku nebylo nalezeno.");
                }

                await page.waitForTimeout(1000);

                const noAccessAfterClick = await detectNoAccessError(page);
                if (noAccessAfterClick.detected) {
                    throw new Error(`Po kliknutí na Create se objevila chyba přístupu: ${noAccessAfterClick.text}`);
                }

                activeEditor = await findFirstVisible(page, SELECTORS.EDITOR.BODY);
                if (!activeEditor) {
                    throw new Error("Kliknutí na Create nezměnilo stav a editor se neotevřel.");
                }
            }, "Aktivace a otevření editoru");
        }

        console.log(`✅ [EDITOR READY] Editor připraven (${activeEditor.selector})`);

        // STEP 5: VYPLNĚNÍ
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
                console.warn("⚠️ Nenalezeno vyhrazené pole pro nadpis. Vkládám do editoru s odřádkováním...");
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
                throw new Error("Nepodařilo se zapsat obsah příspěvku do žádného z editorů.");
            }
        }

        // STEP 6: UPLOAD OBRÁZKU
        if (imageUrl) {
            await withRetry(async () => {
                console.log(`🖼️ Stahuji obrázek z URL: ${imageUrl}`);
                downloadedImagePath = path.join(__dirname, `upload_temp_${Date.now()}.jpg`);

                await downloadImage(imageUrl, downloadedImagePath);
                if (!fs.existsSync(downloadedImagePath)) {
                    throw new Error("Soubor obrázku neexistuje na disku.");
                }

                let fileInput = page.locator(SELECTORS.UPLOAD.FILE_INPUT).first();

                if ((await fileInput.count()) === 0) {
                    console.log("🔍 Input pro soubor chybí v DOMu. Klikám na ikonu obrázku...");
                    await findAndClickFirst(page, SELECTORS.UPLOAD.OPEN_DIALOG_BUTTONS, "Tlačítko obrázku");
                }

                fileInput = page.locator(SELECTORS.UPLOAD.FILE_INPUT).first();
                await fileInput.waitFor({ state: "attached", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
                await fileInput.setInputFiles(downloadedImagePath);
                console.log("📤 Soubor nastaven do file inputu.");

                console.log("⏳ Čekám na dokončení zpracování obrázku (detekce náhledu)...");
                
                // SAFE MULTI-SELECTOR WAIT BEZ PROMISE.RACE MEMORY LEAKU
                const combinedSelector = SELECTORS.UPLOAD.INDICATORS.join(", ");
                try {
                    await page.locator(combinedSelector).first().waitFor({ 
                        state: "visible", 
                        timeout: CONFIG.TIMEOUTS.UPLOAD_WAIT 
                    });
                    console.log("✅ Obrázek byl nahrán a jeho náhled je viditelný.");
                } catch (e) {
                    console.warn("⚠️ Nebyl detekován explicitní indikátor obrázku v limitu, pokračuji...");
                }
            }, "Stažení a upload obrázku");
        }

        // STEP 7: PUBLIKOVÁNÍ PŘÍSPĚVKU
        await withRetry(async () => {
            console.log("🚀 Zahajuji publikování příspěvku...");
            const initialUrl = page.url();

            const clickedPublish = await findAndClickFirst(page, SELECTORS.PUBLISH.BUTTONS, "Publikační tlačítko");
            if (!clickedPublish) {
                throw new Error("Tlačítko pro publikování nebylo nalezeno.");
            }

            console.log("⏳ Čekám na potvrzení publikace (URL přesměrování, toast nebo zmizení editoru)...");

            const waitForUrlChange = page.waitForURL((url) => url.toString() !== initialUrl && !url.pathname.includes("/create"), {
                timeout: CONFIG.TIMEOUTS.PUBLISH_WAIT
            }).catch(() => false);

            const toastSelector = SELECTORS.PUBLISH.CONFIRMATION_TOASTS.join(", ");
            const waitForToast = page.locator(toastSelector).first().waitFor({ 
                state: "visible", 
                timeout: CONFIG.TIMEOUTS.PUBLISH_WAIT 
            }).catch(() => false);

            const waitForEditorDetach = activeEditor.locator.waitFor({ 
                state: "detached", 
                timeout: CONFIG.TIMEOUTS.PUBLISH_WAIT 
            }).catch(() => false);

            const result = await Promise.race([waitForUrlChange, waitForToast, waitForEditorDetach]);

            if (result !== false) {
                console.log("✅ [PUBLISH CONFIRMED] Publikování bylo úspěšně potvrzeno UI událostí!");
            } else {
                console.warn("⚠️ Žádný z přímých indikátorů nevrátil potvrzení v časovém limitu. Kontroluji chybu přístupu...");
                const noAccess = await detectNoAccessError(page);
                if (noAccess.detected) {
                    throw new Error(`Publikování selhalo z důvodu chybějících oprávnění: ${noAccess.text}`);
                }
            }
        }, "Publikování příspěvku");

        console.log("🎉 Příspěvek byl úspěšně zpracován a publikován!");

    } catch (error) {
        console.error("❌ CRITICAL ERROR V WORKFLOW:", error.message);
        if (page && context) {
            await generateDiagnostics(page, context, `error_${Date.now()}`);
        }
        throw error;
    } finally {
        safeUnlink(downloadedImagePath);
        if (context) {
            await context.tracing.stop().catch(() => {});
            await context.close().catch(() => {});
        }
        if (browser) {
            await browser.close().catch(() => {});
        }
        console.log("🧹 Úklid zdrojů dokončen.");
    }
};
