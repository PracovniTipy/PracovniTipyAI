const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - PRODUCTION MODULE (FINAL LOGIN FIX)");
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
            'input[name="email" i]',
            'input[id*="email" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="e-mail" i]',
            'input[placeholder*="přihlaš" i]',
            'input[aria-label*="email" i]'
        ],
        STEP1_CONTINUE_BUTTONS: [
            'form button:has-text("Pokračovat")',
            'form button:has-text("Continue")',
            'button:has-text("Pokračovat"):not([class*="apple" i]):not([class*="social" i])',
            'button:has-text("Continue"):not([class*="apple" i]):not([class*="social" i])',
            '[data-testid*="continue" i]',
            'input[type="email"] >> xpath=following::button[1]'
        ],
        PASSWORD_INPUTS: [
            'input[type="password"]',
            'input[name="password" i]',
            'input[id*="password" i]',
            'input[placeholder*="heslo" i]',
            'input[placeholder*="password" i]',
            'input[aria-label*="password" i]',
            'input[aria-label*="heslo" i]'
        ],
        STEP2_SUBMIT_BUTTONS: [
            'form button:has-text("Přihlásit")',
            'form button:has-text("Log in")',
            'form button:has-text("Sign in")',
            'button:has-text("Přihlásit se")',
            'button:has-text("Přihlásit"):not([class*="apple" i]):not([class*="google" i])',
            '[data-testid*="login" i]'
        ],
        EMAIL_LOGIN_TRIGGER: [
            'button:has-text("E-mail")',
            'button:has-text("Email")',
            'button:has-text("Přihlásit se e-mailem")',
            'a:has-text("E-mail")',
            '[data-testid*="email-login" i]'
        ]
    },
    COOKIES: [
        'button:has-text("Allow all")',
        'button:has-text("Accept all")',
        'button:has-text("Přijmout vše")',
        'button:has-text("Povolit vše")',
        'button:has-text("Souhlasím")',
        'button:has-text("Rozumím")',
        'button:has-text("Accept")',
        'button:has-text("OK")',
        '[aria-label*="accept" i]',
        '#onetrust-accept-btn-handler',
        '.cookie-banner button',
        '[class*="cookie" i] button'
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
// 3. HELPER FUNKCE A DIAGNOSTIKA
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

/**
 * Atomický zápis stavu relace přes dočasný soubor .tmp
 */
async function saveStorageStateAtomically(context, targetPath) {
    const tempPath = `${targetPath}.tmp`;
    try {
        await context.storageState({ path: tempPath });
        fs.renameSync(tempPath, targetPath);
        console.log(`💾 [SESSION SAVED ATOMICALLY] Relace uložena do: ${targetPath}`);
    } catch (err) {
        safeUnlink(tempPath);
        console.error(`❌ Selhal atomický zápis relace do ${targetPath}:`, err.message);
        throw err;
    }
}

async function generateDiagnostics(page, context, prefix = `error_${Date.now()}`) {
    try {
        console.log(`📊 Vytvářím kompletní diagnostické soubory (${prefix}.html, ${prefix}.png, trace.zip)...`);
        
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

/**
 * Kontroluje, zda došlo k přesměrování na externí doménu.
 * Pokud ano, NEJPRVE vytvoří kompletní diagnostiku a až poté vyhodí chybu.
 */
async function assertNotThirdPartyDomain(page, context) {
    const currentUrl = page.url();
    const thirdPartyDomains = [
        "appleid.apple.com",
        "accounts.google.com",
        "facebook.com",
        "twitter.com"
    ];

    for (const domain of thirdPartyDomains) {
        if (currentUrl.includes(domain)) {
            const prefix = `redirect_${domain.replace(/\./g, "_")}_${Date.now()}`;
            console.error(`⛔ Detekováno přesměrování na externí doménu (${domain}). Generuji diagnostiku...`);
            await generateDiagnostics(page, context, prefix);
            throw new Error(`⛔ [THIRD_PARTY_REDIRECT] Workflow zablokováno! Přesměrování na externí doménu: ${currentUrl} (Detekováno: ${domain}). Diagnostika uložena pod prefixem ${prefix}.`);
        }
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

async function findAndClickFirstLogged(page, context, selectorsArray, description) {
    console.log(`🔍 Hledám a klikám na: ${description}`);
    const urlBefore = page.url();

    for (const selector of selectorsArray) {
        const loc = page.locator(selector);
        const count = await loc.count();

        for (let i = 0; i < count; i++) {
            const item = loc.nth(i);
            if (await item.isVisible().catch(() => false)) {
                const btnText = await item.innerText().catch(() => "N/A");
                const outerHtml = await item.evaluate((el) => el.outerHTML.slice(0, 200)).catch(() => "N/A");

                console.log(`📌 [CLICK ACTION] Selektor: "${selector}" (index: ${i})`);
                console.log(`   ├─ Text tlačítka: "${btnText.trim()}"`);
                console.log(`   ├─ outerHTML: ${outerHtml}`);
                console.log(`   └─ URL před kliknutím: ${urlBefore}`);

                const clicked = await safeClick(page, item, `${description} [${selector}]`);
                if (clicked) {
                    await page.waitForTimeout(500);
                    const urlAfter = page.url();
                    console.log(`   └─ URL po kliknutí: ${urlAfter}`);
                    await assertNotThirdPartyDomain(page, context);
                    return { selector, text: btnText.trim(), outerHtml };
                }
            }
        }
    }
    return null;
}

async function findAndClickFirst(page, context, selectorsArray, description) {
    return findAndClickFirstLogged(page, context, selectorsArray, description);
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

// ============================================================================
// 3b. DIAGNOSTIKA A OBCHÁZENÍ PŘEKÁŽEK
// ============================================================================

async function runLoginDiagnostics(page, context) {
    const timestamp = Date.now();
    const prefix = `login_diag_${timestamp}`;
    
    console.log("🔍 ================= LOGIN DIAGNOSTIKA =================");
    await assertNotThirdPartyDomain(page, context);

    const url = page.url();
    const title = await page.title().catch(() => "N/A");
    console.log(`📍 URL: ${url}`);
    console.log(`📍 TITLE: ${title}`);

    const cloudflareHit = await page.evaluate(() => {
        const text = document.body ? document.body.innerText : "";
        return (
            text.includes("Just a moment") ||
            text.includes("Verify you are human") ||
            text.includes("Cloudflare") ||
            !!document.querySelector('iframe[src*="cloudflare"]') ||
            !!document.querySelector('iframe[src*="turnstile"]')
        );
    }).catch(() => false);

    if (cloudflareHit) {
        console.error("⛔ [ALERT] Detekována Cloudflare / Turnstile ochrana!");
    }

    const inputDetails = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll("input"));
        return inputs.map((inp, idx) => {
            const rect = inp.getBoundingClientRect();
            const style = window.getComputedStyle(inp);
            return {
                idx,
                type: inp.type || "text",
                name: inp.name || "",
                id: inp.id || "",
                placeholder: inp.placeholder || "",
                ariaLabel: inp.getAttribute("aria-label") || "",
                isVisible: !!(rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"),
                outerHTML: inp.outerHTML.slice(0, 150)
            };
        });
    }).catch(() => []);

    console.log(`📋 Nalezeno <input> prvků v DOMu: ${inputDetails.length}`);
    inputDetails.forEach((inp) => {
        console.log(`   [Input #${inp.idx}] type="${inp.type}" | name="${inp.name}" | id="${inp.id}" | placeholder="${inp.placeholder}" | visible=${inp.isVisible}`);
        debugLog(`      HTML: ${inp.outerHTML}`);
    });

    const buttonDetails = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, a, [role='button']"));
        return btns.map((b, idx) => {
            const rect = b.getBoundingClientRect();
            const style = window.getComputedStyle(b);
            const isVis = !!(rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none");
            return {
                idx,
                tag: b.tagName.toLowerCase(),
                text: b.innerText ? b.innerText.trim().replace(/\s+/g, " ").slice(0, 50) : "",
                type: b.getAttribute("type") || "",
                isVisible: isVis
            };
        }).filter(b => b.isVisible);
    }).catch(() => []);

    console.log(`📋 Viditelná tlačítka/odkazy v DOMu (${buttonDetails.length}):`);
    buttonDetails.slice(0, 15).forEach((btn) => {
        console.log(`   [Button #${btn.idx}] <${btn.tag}> text="${btn.text}" | type="${btn.type}"`);
    });

    const htmlContent = await page.content().catch(() => "N/A");
    fs.writeFileSync(path.join(__dirname, `${prefix}.html`), htmlContent, "utf8");
    await page.screenshot({ path: path.join(__dirname, `${prefix}.png`), fullPage: true }).catch(() => {});
    console.log(`💾 Uložena diagnostika: ${prefix}.html a ${prefix}.png`);
    console.log("=======================================================");

    return { cloudflareHit, inputDetails, buttonDetails };
}

async function handleObstacles(page, context) {
    try {
        const clickedCookie = await findAndClickFirst(page, context, SELECTORS.COOKIES, "Cookie lišta/dialog");
        if (clickedCookie) {
            await page.waitForTimeout(1000);
        }
    } catch (e) {
        debugLog("Žádný cookie banner k zavření nebylo nutné odbavit.");
    }

    try {
        for (const triggerSelector of SELECTORS.LOGIN.EMAIL_LOGIN_TRIGGER) {
            const loc = page.locator(triggerSelector);
            if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
                console.log(`💡 Detekován přepínač na e-mailové přihlášení: ${triggerSelector}. Klikám...`);
                await safeClick(page, loc.first(), "Email login switch");
                await page.waitForTimeout(1500);
                break;
            }
        }
    } catch (e) {
        debugLog("Přepínač e-mailového přihlášení nebyl potřeba.");
    }
}

/**
 * Robustní čekání na změnu stavu formuláře (zmizení e-mailu, zobrazení hesla, změna DOM/URL).
 */
async function waitForStep1ToStep2Transition(page, context, usedEmailSelector) {
    console.log("⏳ [LOGIN KROK 1 -> 2] Čekám na změnu stavu formuláře...");

    const passLocatorsCombined = SELECTORS.LOGIN.PASSWORD_INPUTS.join(", ");
    const emailSelectorToWait = usedEmailSelector || SELECTORS.LOGIN.EMAIL_INPUTS[0];

    const waitForPassword = page.locator(passLocatorsCombined).first().waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT })
        .then(() => "PASSWORD_VISIBLE");

    const waitForEmailHidden = page.locator(emailSelectorToWait).first().waitFor({ state: "hidden", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT })
        .then(() => "EMAIL_HIDDEN");

    const waitForUrlChange = page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: CONFIG.TIMEOUTS.LOGIN_WAIT })
        .then(() => "URL_CHANGED");

    const waitForDomMutation = page.evaluate(() => {
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const pass = document.querySelector('input[type="password"]');
                if (pass && pass.offsetWidth > 0 && pass.offsetHeight > 0) {
                    observer.disconnect();
                    resolve("DOM_MUTATION_PASS_FOUND");
                }
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        });
    });

    try {
        const winner = await Promise.race([
            waitForPassword,
            waitForEmailHidden,
            waitForUrlChange,
            waitForDomMutation
        ]);

        console.log(`⚡ Detekována změna stavu formuláře -> Důvod: [${winner}]`);
        await assertNotThirdPartyDomain(page, context);

        // Ujištění, že je pole pro heslo připraveno
        await page.locator(passLocatorsCombined).first().waitFor({ state: "visible", timeout: 5000 });
        return true;
    } catch (err) {
        console.warn(`⚠️ Čekání na změnu formuláře vypršelo nebo selhalo: ${err.message}`);
        await assertNotThirdPartyDomain(page, context);
        return false;
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

            await assertNotThirdPartyDomain(page, context);

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

        // STEP 2: RE-LOGIN WORKFLOW (OPRAVENÉ DVOUKROKOVÉ PŘIHLÁŠENÍ E-MAILEM)
        if (!sessionStatus.valid) {
            console.log("🔐 [LOGIN REQUIRED] Relace neplatná. Vytvářím čistý kontext pro nové přihlášení...");
            if (!process.env.HERO_EMAIL || !process.env.HERO_PASSWORD) {
                throw new Error("❌ Chybí HERO_EMAIL nebo HERO_PASSWORD v environmentu!");
            }

            page = await createNewContext(false);

            await page.goto("https://herohero.co/login", { waitUntil: "domcontentloaded", timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION });
            await waitForSpaLoad(page);

            await withRetry(async () => {
                // 1. Diagnostika před přihlášením
                const diagResult = await runLoginDiagnostics(page, context);
                if (diagResult.cloudflareHit) {
                    throw new Error("Přihlášení zablokováno Cloudflare / Turnstile ochranou.");
                }

                // 2. Odbavení cookie lišt a přepínačů
                await handleObstacles(page, context);

                // --- KROK 1: VYPLNĚNÍ E-MAILU ---
                console.log("📧 [LOGIN KROK 1] Zadávání e-mailové adresy...");
                let emailFilled = false;
                let usedEmailSelector = null;

                for (const sel of SELECTORS.LOGIN.EMAIL_INPUTS) {
                    const loc = page.locator(sel);
                    const count = await loc.count();
                    if (count > 0) {
                        for (let i = 0; i < count; i++) {
                            const singleLoc = loc.nth(i);
                            if (await singleLoc.isVisible().catch(() => false)) {
                                console.log(`🎯 Nalezeno e-mailové pole přes selektor: "${sel}" (index: ${i})`);
                                emailFilled = await safeType(page, singleLoc, process.env.HERO_EMAIL, `Email input [${sel}]`);
                                if (emailFilled) {
                                    usedEmailSelector = sel;
                                    break;
                                }
                            }
                        }
                    }
                    if (emailFilled) break;
                }

                if (!emailFilled) {
                    await generateDiagnostics(page, context, `email_not_found_${Date.now()}`);
                    throw new Error("E-mailové pole nebylo nalezeno.");
                }

                // Kliknutí na "Pokračovat" (1. krok)
                const clickedContinue = await findAndClickFirstLogged(page, context, SELECTORS.LOGIN.STEP1_CONTINUE_BUTTONS, "Krok 1: Tlačítko Pokračovat");
                if (!clickedContinue) {
                    console.log("ℹ️ Tlačítko 'Pokračovat' nenalezeno přes striktní selektory, odesílám stiskem Enter...");
                    await page.keyboard.press("Enter");
                }

                // --- ROBUSTNÍ ČEKÁNÍ NA ZMĚNU STAVU FORMULÁŘE (KROK 1 -> KROK 2) ---
                const transitionSuccess = await waitForStep1ToStep2Transition(page, context, usedEmailSelector);

                if (!transitionSuccess) {
                    await generateDiagnostics(page, context, `step1_transition_failed_${Date.now()}`);
                    throw new Error("Formulář ne přešel do druhého kroku (pole pro heslo se nezobrazilo).");
                }

                // --- KROK 2: VYPLNĚNÍ HESLA A FINÁLNÍ PŘIHLÁŠENÍ ---
                console.log("🔑 [LOGIN KROK 2] Zadávání hesla...");
                let passwordFilled = false;

                for (const sel of SELECTORS.LOGIN.PASSWORD_INPUTS) {
                    const loc = page.locator(sel);
                    if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
                        passwordFilled = await safeType(page, loc.first(), process.env.HERO_PASSWORD, `Password input [${sel}]`);
                        if (passwordFilled) break;
                    }
                }

                if (!passwordFilled) {
                    await generateDiagnostics(page, context, `password_fill_failed_${Date.now()}`);
                    throw new Error("Heslové pole bylo detekováno, ale selhalo jeho vyplnění.");
                }

                // Kliknutí na finální tlačítko
                const clickedSubmit = await findAndClickFirstLogged(page, context, SELECTORS.LOGIN.STEP2_SUBMIT_BUTTONS, "Krok 2: Tlačítko Přihlásit");
                if (!clickedSubmit) {
                    console.log("ℹ️ Tlačítko 'Přihlásit' nenalezeno přes striktní selektory, odesílám stiskem Enter...");
                    await page.keyboard.press("Enter");
                }

                await waitForSpaLoad(page);
                await assertNotThirdPartyDomain(page, context);

                // --- FINÁLNÍ OVĚŘENÍ PŘIHLÁŠENÍ ---
                console.log("🔍 [LOGIN VERIFY] Ověřuji úspěšný průchod přihlášením...");
                sessionStatus = await evaluateSessionStatus();

                if (!sessionStatus.valid) {
                    throw new Error(`Přihlášení nebylo úspěšné. Uživatel zůstal na login/neautorizované stránce (Stav: ${sessionStatus.reason}).`);
                }

                // Atomické uložení platného storageState.json přes dočasný soubor .tmp
                await saveStorageStateAtomically(context, CONFIG.STORAGE_STATE_PATH);
            }, "Dvoukrokový přihlašovací proces");
        }

    } catch (err) {
        console.error("❌ Chyba při zpracování příspěvku:", err.message);
        if (page && context) {
            await generateDiagnostics(page, context, `fatal_error_${Date.now()}`);
        }
        throw err;
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
};
