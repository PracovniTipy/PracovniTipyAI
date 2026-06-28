const express = require("express");
const app = express();

app.use(express.json());.post("/generate", async (req, res) => {

    try {

        const jobs = req.body.jobs || [];
        const reels = req.body.reels || [];

        const herohero = [];
        const instagram = [];

        // HEROHERO

        for (const job of jobs) {

            const template = heroTemplates[job.country];

            if (!template) {

                console.log("Hero template nenalezena:", job.country);

                continue;

            }

            const imageBuffer = await createImage(job, template);

            const url = await uploadBuffer(imageBuffer);

            herohero.push({

                ...job,

                imageUrl: url

            });

        }

        // REELS

        for (const reel of reels) {

            const template = reelTemplates[reel.country];

            if (!template) {

                console.log("Reel template nenalezena:", reel.country);

                continue;

            }

            const imageBuffer = await createImage(reel, template);

            const url = await uploadBuffer(imageBuffer);

            instagram.push({

                ...reel,

                imageUrl: url

            });

        }

        res.json({

            success: true,

            herohero,

            instagram

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,

            error: err.message

        });

    }

});
