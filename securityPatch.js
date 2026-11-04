"use strict";
// Bezpečnostní vrstva serveru PracovniTipyAI.
// - bezpečnostní hlavičky (HSTS, nosniff, referrer, permissions)
// - citlivé endpointy (publikování na HeroHero/Instagram, generování) smí
//   volat jen sám server (localhost) nebo admin s klíčem ADMIN_KEY
//   (hlavička x-admin-key nebo cookie z /admin/login)
// - ověření podpisu Instagram webhooku (když je nastaven IG_APP_SECRET)
const crypto = require("crypto");

const PROTECTED = [
    /^\/generate\/?$/, /^\/publishHeroHero\/?$/, /^\/herohero\//, /^\/daily-run(\/|$)/,
    /^\/ig\/check\/?$/
];

function safeEqual(a, b) {
    const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
    return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function adminKey() { return process.env.ADMIN_KEY || process.env.STATS_KEY || ""; }
function cookie(req, name) {
    const m = String(req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[1]) : "";
}
function isLocal(req) {
    const a = req.socket.remoteAddress || "";
    return !req.headers["x-forwarded-for"] && (a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1");
}
function isAdmin(req) {
    const k = adminKey();
    return !!k && (safeEqual(req.get("x-admin-key"), k) || safeEqual(cookie(req, "pt_admin"), k));
}
function clientIp(req) {
    return String(req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown").trim();
}

module.exports = function securityPatch(app) {
    app.disable("x-powered-by");
    app.use((req, res, next) => {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        next();
    });

    // Jednorázové přihlášení admina v prohlížeči (cookie na 1 rok, jen HTTPS, jen tato doména).
    app.get("/admin/login", (req, res) => {
        const k = adminKey();
        if (!k || !safeEqual(req.query.key, k)) return res.status(403).send("Přístup odepřen");
        res.setHeader("Set-Cookie", `pt_admin=${encodeURIComponent(k)}; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Strict`);
        res.setHeader("Cache-Control", "no-store");
        res.type("text/plain").send("OK – tento prohlížeč je přihlášený jako admin Pracovních tipů.");
    });

    app.use((req, res, next) => {
        if (!PROTECTED.some(r => r.test(req.path))) return next();
        if (isLocal(req) || isAdmin(req)) return next();
        console.warn("[SECURITY] odmítnut přístup", req.method, req.path, clientIp(req));
        return res.status(401).json({ success: false, error: "unauthorized" });
    });

    // Instagram webhook: ověř podpis X-Hub-Signature-256 (HMAC SHA-256 s App Secret).
    app.use("/webhook/instagram", (req, res, next) => {
        const secret = process.env.IG_APP_SECRET;
        if (req.method !== "POST" || !secret) return next();
        const sig = String(req.get("x-hub-signature-256") || "");
        const raw = req.rawBody || Buffer.from("");
        const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
        if (!safeEqual(sig, expected)) {
            console.warn("[SECURITY] neplatný podpis Instagram webhooku", clientIp(req));
            return res.sendStatus(403);
        }
        next();
    });
};
module.exports.clientIp = clientIp;
