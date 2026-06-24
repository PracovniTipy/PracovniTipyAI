const express = require("express");
const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("PracovniTipyAI běží");
});

app.get("/generate", (req, res) => {
  res.send("OK");
});

app.post("/generate", (req, res) => {
  res.send("OK");
});

app.post("/herohero", async (req, res) => {
  console.log(req.body);

  res.json({
    success: true
  });
});

app.listen(process.env.PORT || 3000);
