const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("PracovniTipyAI běží");
});

app.get("/generate", (req, res) => {
  res.send("OK");
});

app.post("/generate", (req, res) => {
  res.send("OK");
});

app.listen(process.env.PORT || 3000);
