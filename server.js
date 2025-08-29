// server.js
import express from "express";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static("public"));

const upload = multer({ dest: "uploads/" });

const BASE = process.env.PAPAGO_BASE || "https://papago.apigw.ntruss.com/doc-trans/v1";
const ID = process.env.NCP_KEY_ID;
const KEY = process.env.NCP_KEY;
const PORT = process.env.PORT || 3000;

function must(v, name) { if (!v) throw new Error(`Missing required env: ${name}`); }
must(BASE, "PAPAGO_BASE");
must(ID, "NCP_KEY_ID");
must(KEY, "NCP_KEY");

const HDRS = {
  "X-NCP-APIGW-API-KEY-ID": ID,
  "X-NCP-APIGW-API-KEY": KEY,
};

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// 1) Start translation → return requestId immediately
app.post("/api/translate", upload.single("file"), async (req, res) => {
  const { source, target } = req.body || {};
  const filePath = req.file?.path;
  if (!source || !target) return res.status(400).json({ error: "source and target are required" });
  if (!filePath) return res.status(400).json({ error: "file is required (.pptx)" });

  try {
    const fd = new FormData();
    fd.append("source", source);
    fd.append("target", target);
    fd.append("file", fs.createReadStream(filePath), { filename: req.file.originalname });

    const r = await axios.post(`${BASE}/translate`, fd, {
      headers: { ...fd.getHeaders(), ...HDRS },
      timeout: 180000, maxContentLength: Infinity, maxBodyLength: Infinity,
    });

    const requestId = r?.data?.data?.requestId;
    if (!requestId) return res.status(502).json({ error: "No requestId from Papago" });

    res.json({ requestId });
  } catch (e) {
    console.error("translate error:", e?.response?.data || e?.message || e);
    res.status(500).json({ error: "translate failed", upstream: e?.response?.data || null });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

// 2) Proxy status
app.get("/api/status", async (req, res) => {
  const { requestId } = req.query;
  if (!requestId) return res.status(400).json({ error: "requestId required" });

  try {
    const r = await axios.get(`${BASE}/status`, {
      params: { requestId }, headers: HDRS, timeout: 30000,
    });
    res.json(r.data);
  } catch (e) {
    console.error("status error:", e?.response?.data || e?.message || e);
    res.status(500).json({ error: "status failed", upstream: e?.response?.data || null });
  }
});

// 3) Proxy download (streams PPTX)
app.get("/api/download", async (req, res) => {
  const { requestId } = req.query;
  if (!requestId) return res.status(400).json({ error: "requestId required" });

  try {
    const r = await axios.get(`${BASE}/download`, {
      params: { requestId }, headers: HDRS, responseType: "stream", timeout: 180000,
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="translated.pptx"`);
    r.data.pipe(res);
  } catch (e) {
    console.error("download error:", e?.response?.data || e?.message || e);
    res.status(500).json({ error: "download failed", upstream: e?.response?.data || null });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`BASE=${BASE} ID=${ID} SECRET_SET=${Boolean(KEY)}`);
});
