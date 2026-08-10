"use strict";

// Runtime-only visual adjustment for HeroHero images.
// Keep Instagram/Reel stroke rendering untouched.
const Module = require("module");
const fs = require("fs");
const path = require("path");
const originalJsLoader = Module._extensions[".js"];

Module._extensions[".js"] = function heroVisualLoader(module, filename) {
  if (path.basename(filename) !== "index.js") {
    return originalJsLoader(module, filename);
  }

  let source = fs.readFileSync(filename, "utf8");

  const oldBlur = '    ctx.shadowBlur = 3;';
  const newBlur = '    ctx.shadowBlur = 1.2;';
  const oldStroke = '    ctx.lineWidth = Math.max(1.5, fitted.size * 0.035);';
  const newStroke = '    ctx.lineWidth = Math.max(0.75, fitted.size * 0.018);';

  if (!source.includes(oldBlur) || !source.includes(oldStroke)) {
    console.warn("[HERO VISUAL] Expected HeroHero outline source pattern not found.");
  } else {
    source = source.replace(oldBlur, newBlur).replace(oldStroke, newStroke);
    console.log("[HERO VISUAL] Thin HeroHero white outline active.");
  }

  module._compile(source, filename);
};
