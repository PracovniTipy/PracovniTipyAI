"use strict";

// HeroHero publication no longer depends on Make re-sending the generated
// objects to /publishHeroHero. As soon as /generate returns HeroHero objects,
// queue them directly. The legacy /publishHeroHero call is acknowledged so it
// cannot publish the same posts twice.

const express = require("express");

const MAX_HERO = 5;
let publishChain = Promise.resolve();
const queued = new Set();
const published = new Set();

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function titleOf(job) {
  return clean(job?.title || job?.job_title || job?.job_title_cz || job?.title_cz);
}

function linkOf(job) {
  return clean(job?.link || job?.apply_url || job?.url || job?.job_url || job?.jobUrl);
}

function keyOf(job) {
  return clean(job?.postId || job?.id || linkOf(job) || `${titleOf(job)}|${job?.city || ""}|${job?.country || ""}`)
    .toLocaleLowerCase("cs-CZ");
}

function isForbidden(job) {
  const text = clean([
    titleOf(job),
    job?.description,
    job?.requirements,
    job?.job_category,
    job?.work_category
  ].join(" ")).toLocaleLowerCase("cs-CZ");
  return /montážní\s+(?:dělník|pracovník|operátor)|montazni\s+(?:delnik|pracovnik|operator)|assembly\s+(?:worker|operator|operative|line\s+worker)|\bassembler\b/.test(text);
}

function queueGeneratedHero(items) {
  const batch = [];
  for (const item of items || []) {
    if (!item || typeof item !== "object" || isForbidden(item)) continue;
    const key = keyOf(item);
    if (!key || queued.has(key) || published.has(key)) continue;
    queued.add(key);
    batch.push(item);
    if (batch.length >= MAX_HERO) break;
  }

  if (!batch.length) return;

  publishChain = publishChain.then(async () => {
    const publishHeroHero = require("./publishHeroHero");
    let done = 0;

    for (const job of batch) {
      const key = keyOf(job);
      let success = false;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[AUTO HERO] publishing ${done + 1}/${batch.length}: ${titleOf(job)} attempt ${attempt}/3`);
          await publishHeroHero(job);
          published.add(key);
          success = true;
          done++;
          console.log(`[AUTO HERO] published ${done}/${batch.length}: ${titleOf(job)}`);
          break;
        } catch (error) {
          console.error(`[AUTO HERO] failed ${titleOf(job)} attempt ${attempt}/3: ${error.message}`);
          if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      queued.delete(key);
      if (!success) console.error(`[AUTO HERO] permanently failed for this run: ${titleOf(job)}`);
    }

    console.log(`[AUTO HERO] generated batch finished ${done}/${batch.length}`);
  }).catch(error => console.error(`[AUTO HERO] queue error: ${error.message}`));
}

const previousPost = express.application.post;

express.application.post = function autoHeroPost(path, ...handlers) {
  if (path === "/generate") {
    const captureGenerated = (req, res, next) => {
      const previousJson = res.json.bind(res);
      res.json = body => {
        if (Array.isArray(body?.herohero)) {
          const hero = body.herohero.filter(item => !isForbidden(item)).slice(0, MAX_HERO);
          body.herohero = hero;
          console.log(`[AUTO HERO] /generate produced ${hero.length}/${MAX_HERO} HeroHero posts; queueing now.`);
          queueGeneratedHero(hero);
        }
        return previousJson(body);
      };
      next();
    };

    // Keep workflowFix's normalization; captureGenerated runs after it and
    // immediately before the real index.js handler.
    return previousPost.call(this, path, captureGenerated, ...handlers);
  }

  if (path === "/publishHeroHero") {
    // Bypass previous /publishHeroHero patches completely. HeroHero is already
    // queued from /generate, so this old Make step is now only an ACK.
    return this.route(path).post((req, res) => {
      res.status(200).json({
        success: true,
        handledByGenerate: true,
        message: "HeroHero publikace se spouští automaticky z /generate; duplicitní publish request byl přeskočen."
      });
    });
  }

  return previousPost.call(this, path, ...handlers);
};

console.log("[AUTO HERO] direct publication from /generate active.");
