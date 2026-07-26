const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

console.log("==========================================");
console.log("🚀 HEROHERO PUBLISHER - PRODUCTION MODULE (MODAL EXACT LOGIN)");
console.log("==========================================");

const CONFIG = {
    STORAGE_STATE_PATH: path.join(__dirname, "storageState.json"),
    HEADLESS: process.env.HEADLESS !== "false",
    DEBUG: process.env.DEBUG === "true" || process.env.DEBUG === "1",
    TIMEOUTS: {
        PAGE_NAVIGATION: 35000,
        SPA_HYDRATION: 2000,
        ELEMENT_WAIT: 10000,
        LOGIN_WAIT: 15000,
    },
    VIEWPORT: { width: 1280, height: 900 },
    USER_AGENT: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    LOCALE: "cs-CZ"
};

function debugLog(...args) {
    if (CONFIG.DEBUG) {
        console.log(`[DEBUG ${new Date().toISOString()}]`, ...args);
    }
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

async function saveStorageStateAtomically(context, targetPath) {
    const tempPath = `${targetPath}.tmp`;
    try {
        await context.storageState({ path: tempPath });
        fs.renameSync(tempPath, targetPath);
        console.log(`💾 Relace úspěšně uložena do: ${targetPath}`);
    } catch (err) {
        safeUnlink(tempPath);
        console.error(`❌ Selhal zápis relace: ${err.message}`);
    }
}

/**
 * Pomocná diagnostika pro podrobné logování elementů před a po kliknutí
 */
async function logElementDetails(locator, stageDescription) {
    try {
        const count = await locator.count();
        if (count === 0) {
            console.log(`📝 [LOG ${stageDescription}] Element nebyl v DOMu nalezen.`);
            return null;
        }
        const info = await locator.evaluate(el => {
            const rect = el.getBoundingClientRect();
            return {
                url: window.location.href,
                outerHTML: el.outerHTML.slice(0, 300),
                dataTestId: el.getAttribute('data-testid') || 'N/A',
                id: el.id || 'N/A',
                className: el.className || 'N/A',
                text: (el.innerText || el.value || '').trim(),
                boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            };
        });

        console.log(`📌 [LOG ${stageDescription}]`);
        console.log(`   ├─ URL: ${info.url}`);
        console.log(`   ├─ Text/Value: "${info.text}"`);
        console.log(`   ├─ Selector/Tag HTML: ${info.outerHTML}`);
        console.log(`   ├─ data-testid: ${info.dataTestId} | id: ${info.id} | class: ${info.className}`);
        console.log(`   └─ BoundingBox: ${JSON.stringify(info.boundingBox)}`);
        return info;
    } catch (e) {
        console.warn(`⚠️ Logování elementu selhalo (${stageDescription}):`, e.message);
        return null;
    }
}

/**
 * Pomocná funkce pro bezpečné kliknutí s opakováním bez porušení cílícího selektoru
 */
async function safeClick(page, locatorSelector, description) {
    const locator = page.locator(locatorSelector);
    try {
        await locator.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
        await locator.click();
    } catch (err) {
        console.warn(`⚠️ První pokus o kliknutí na "${description}" selhal: ${err.message}. Obnovuji locator a zkouším znovu...`);
        const freshLocator = page.locator(locatorSelector);
        await freshLocator.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
        await freshLocator.click();
    }
}

/**
 * Odbavení cookie lišty pouze při reálné existenci a ověření zmizení
 */
async function handleCookieBannerIfPresent(page) {
    const cookieContainerSelector = '[data-testid*="cookie" i], [class*="cookie" i], #onetrust-banner-sdk, [role="dialog"][aria-label*="cookie" i]';
    const cookieContainer = page.locator(cookieContainerSelector).first();
    const isVisible = await cookieContainer.isVisible().catch(() => false);

    if (!isVisible) {
        console.log("ℹ️ Cookie banner neexistuje / není zobrazen.");
        return;
    }

    console.log("🍪 Cookie banner je viditelný. Vyhledávám potvrzovací tlačítko...");
    const acceptBtnSelector = `${cookieContainerSelector} button:has-text("Povolit vše"), ${cookieContainerSelector} button:has-text("Přijmout"), ${cookieContainerSelector} button:has-text("Allow"), ${cookieContainerSelector} button:has-text("Rozumím"), ${cookieContainerSelector} button:has-text("Accept")`;
    const acceptBtn = page.locator(acceptBtnSelector).first();
    
    if (await acceptBtn.isVisible().catch(() => false)) {
        await logElementDetails(acceptBtn, "PŘED KLIKNUTÍM NA COOKIE");
        await safeClick(page, acceptBtnSelector, "Cookie Accept Button");
        
        await cookieContainer.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
        const stillVisible = await cookieContainer.isVisible().catch(() => false);
        console.log(`🍪 Cookie banner odbaven. Stále viditelný? -> ${stillVisible}`);
    }
}

/**
 * Pomocný locator pro vrácení aktuálního login modalu (odolný vůči re-renderu)
 */
function getLoginModalLocator(page) {
    return page.locator('[role="dialog"], [class*="modal" i], form').filter({
        has: page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i], input[type="password"]')
    }).first();
}

/**
 * PŘIHLAŠOVACÍ WORKFLOW - POUZE UVNITŘ MODALU
 */
async function executeModalLogin(page, email, password) {
    console.log("🔑 [LOGIN] Zahajuji modal přihlášení...");

    const loginModal = getLoginModalLocator(page);
    await loginModal.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });
    console.log("✅ Login modal zobrazen.");

    // 1. E-mailový input a jeho přesné vyplnění
    const emailInputSelector = '[role="dialog"] input[type="email"], [class*="modal" i] input[type="email"], form input[type="email"]';
    const emailInput = page.locator(emailInputSelector).first();
    await emailInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.ELEMENT_WAIT });

    console.log("📧 Vyplňuji e-mail...");
    await emailInput.fill(email);

    // 2. Přesný selektor šipky vedle e-mailového pole (sourozenecká vazba / podřízené tlačítko)
    const continueBtnSelector = `${emailInputSelector} ~ button, ${emailInputSelector} + button, form:has(input[type="email"]) button[type="submit"]`;
    const continueBtn = page.locator(continueBtnSelector).first();

    await logElementDetails(continueBtn, "PŘED KLIKNUTÍM NA ŠIPKU (E-MAIL)");
    await safeClick(page, continueBtnSelector, "Šipka vedle e-mailu");

    // 3. Odstranění fixed waitForTimeout - sledování reálné reakce DOMu
    console.log("⏳ Čekám na zobrazení pole pro heslo nebo chybové hlášky...");
    const passwordInputSelector = '[role="dialog"] input[type="password"], [class*="modal" i] input[type="password"], form input[type="password"]';
    const passwordInput = page.locator(passwordInputSelector).first();
    const errorNotice = getLoginModalLocator(page).locator('[class*="error" i], [role="alert"]').first();

    const resultState = await Promise.race([
        passwordInput.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT }).then(() => "PASSWORD_READY"),
        errorNotice.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT }).then(() => "LOGIN_ERROR"),
    ]).catch(() => "TIMEOUT");

    const currentUrl = page.url();
    if (currentUrl.includes("appleid.apple.com") || currentUrl.includes("accounts.google.com") || currentUrl.includes("facebook.com")) {
        throw new Error(`⛔ [CRITICAL ERROR] Detekováno nechtěné přesměrování na OAuth! URL: ${currentUrl}`);
    }

    if (resultState === "LOGIN_ERROR") {
        const errorMsg = await errorNotice.innerText().catch(() => "Neznámá chyba");
        throw new Error(`❌ Validace e-mailu selhala přímo v modalu: ${errorMsg}`);
    }

    if (resultState !== "PASSWORD_READY") {
        throw new Error("❌ Vypršel časový limit pro zobrazení pole pro heslo.");
    }

    console.log("🔒 Pole pro heslo je viditelné. Vyplňuji heslo...");
    await passwordInput.fill(password);

    // 4. Přihlašovací tlačítko pro heslo
    const submitBtnSelector = `${passwordInputSelector} ~ button, ${passwordInputSelector} + button, form:has(input[type="password"]) button[type="submit"]`;
    const submitBtn = page.locator(submitBtnSelector).first();

    await logElementDetails(submitBtn, "PŘED KLIKNUTÍM NA PŘIHLÁSIT (HESLO)");
    await safeClick(page, submitBtnSelector, "Přihlašovací tlačítko hesla");

    // 5. Ověření úspěšného přihlášení bez náchylnosti na kmitání DOMu
    console.log("⏳ Čekám na dokončení přihlášení a zobrazení editoru...");
    const editorElement = page.locator('[data-testid*="create" i], [class*="editor" i], textarea, [contenteditable="true"]').first();

    const isSuccess = await editorElement.waitFor({ state: "visible", timeout: CONFIG.TIMEOUTS.LOGIN_WAIT })
        .then(() => true)
        .catch(() => false);

    if (!isSuccess) {
        throw new Error("❌ Přihlášení selhalo – editor obsahu nebyl načten v daném limitu.");
    }

    console.log(`📌 [LOG PO PŘIHLÁŠENÍ]
   ├─ URL: ${page.url()}
   └─ Editor úspěšně zobrazen: ${isSuccess}`);

    console.log("🎉 Přihlášení úspěšně proběhlo.");
}

module.exports = async function publishHeroHero(job) {
    console.log("🎬 START ZPRACOVÁNÍ PŘÍSPĚVKU PRO HEROHERO");

    let browser = null;
    let context = null;
    let page = null;

    try {
        browser = await chromium.launch({
            headless: CONFIG.HEADLESS,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
        });

        const contextOptions = {
            userAgent: CONFIG.USER_AGENT,
            locale: CONFIG.LOCALE,
            viewport: CONFIG.VIEWPORT
        };

        if (isValidJson(CONFIG.STORAGE_STATE_PATH)) {
            console.log("🔑 Načítám uloženou relaci (storageState.json)...");
            contextOptions.storageState = CONFIG.STORAGE_STATE_PATH;
        }

        context = await browser.newContext(contextOptions);
        page = await context.newPage();

        // 1. Otevření webu HeroHero
        console.log("🌐 Otvírám https://herohero.co/create...");
        await page.goto("https://herohero.co/create", {
            waitUntil: "domcontentloaded",
            timeout: CONFIG.TIMEOUTS.PAGE_NAVIGATION
        });

        // Odbavení cookie banneru (pouze pokud existuje)
        await handleCookieBannerIfPresent(page);

        // 2. Kontrola přihlášení
        const passwordInputGlobal = page.locator('input[type="password"], input[autocomplete="current-password"]');
        const emailInputGlobal = page.locator('input[type="email"], input[placeholder*="mail" i]');
        
        const isLoginNeeded = (await emailInputGlobal.count() > 0 && await emailInputGlobal.first().isVisible()) ||
                              (await passwordInputGlobal.count() > 0 && await passwordInputGlobal.first().isVisible());

        if (isLoginNeeded) {
            console.log("👤 Uživatel není přihlášen. Spouštím modal login...");
            
            const email = job.email || process.env.HEROHERO_EMAIL;
            const password = job.password || process.env.HEROHERO_PASSWORD;

            if (!email || !password) {
                throw new Error("❌ Chybí přihlašovací údaje (HEROHERO_EMAIL / HEROHERO_PASSWORD).");
            }

            await executeModalLogin(page, email, password);
            await saveStorageStateAtomically(context, CONFIG.STORAGE_STATE_PATH);
        } else {
            console.log("✅ Uživatel je již přihlášen (relace je platná).");
        }

        console.log("🚀 Pripraveno pro vkládání obsahu...");

    } catch (err) {
        console.error("❌ CHYBA BĚHEM WORKFLOW:", err.message);
        throw err;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};
