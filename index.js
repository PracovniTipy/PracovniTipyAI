app.get("/generate", (req, res) => {
  res.send("OK");
});
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("PracovniTipyAI běží");
});

app.listen(process.env.PORT || 3000);
app.post("/generate", (req, res) => {
  res.send("OK");
});
