// Final Backend API for Apify Actors
// backend/index.js

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const puppeteer = require("puppeteer");
require("dotenv").config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// === Get user's actors ===
app.post("/api/actors", async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: "API Key is required." });

  try {
    const response = await axios.get("https://api.apify.com/v2/acts", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    res.json(response.data);
  } catch (error) {
    console.error("❌ Error fetching actors:", error.message);
    res.status(400).json({ error: "Invalid API Key or failed to fetch actors." });
  }
});

// === AI fallback (OpenRouter) ===
async function generateFallbackSchema(actorId) {
  const prompt = `You are given an Apify actor ID: "${actorId}". Generate a realistic example JSON input that this actor would accept. Return ONLY a JSON object.`;

  try {
    const aiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You generate JSON inputs for Apify actors." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const message = aiRes.data.choices?.[0]?.message?.content;
    return JSON.parse(message.trim());
  } catch (err) {
    console.error("❌ AI fallback failed:", err.message);
    throw new Error("AI generation failed.");
  }
}

// === Helper to extract valid input from schema ===
function extractRunnableInputFromSchema(schema) {
  const result = {};

  if (!schema?.properties) return result;

  for (const key in schema.properties) {
    const prop = schema.properties[key];

    if ("prefill" in prop) {
      result[key] = prop.prefill;
    } else if ("default" in prop) {
      result[key] = prop.default;
    }
  }

  if (schema.required) {
    schema.required.forEach((field) => {
      if (!(field in result)) {
        console.warn(`⚠️ Required field "${field}" missing in extracted input.`);
      }
    });
  }

  return result;
}

// === Get schema with all fallback logic ===
app.post("/api/schema", async (req, res) => {
  const { apiKey, actorId } = req.body;
  if (!apiKey || !actorId)
    return res.status(400).json({ error: "API Key and actor ID are required." });

  console.log("📦 Loading schema for:", actorId);

  // 1. Try to get schema from full build metadata
  try {
    console.log("🔍 Fetching actor builds list...");
    const buildsRes = await axios.get(`https://api.apify.com/v2/acts/${actorId}/builds`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const builds = buildsRes.data.data.items || [];
    if (builds.length === 0) throw new Error("No builds found.");

    const latestBuildMeta = builds[builds.length - 1];
    const buildId = latestBuildMeta.id;

    console.log("🛠 Latest build ID:", buildId);
    console.log("📦 Build version:", latestBuildMeta.versionNumber || latestBuildMeta.buildNumber);

    const buildDetailsRes = await axios.get(
      `https://api.apify.com/v2/acts/${actorId}/builds/${buildId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    );

    const rawSchema = buildDetailsRes.data.data?.inputSchema;
    console.log("📦 Raw inputSchema type:", typeof rawSchema);

    let parsedSchema;
    if (typeof rawSchema === "string") {
      console.log("🧹 Parsing stringified inputSchema...");
      parsedSchema = JSON.parse(rawSchema);
    } else {
      parsedSchema = rawSchema;
    }

    if (parsedSchema?.properties && Object.keys(parsedSchema.properties).length > 0) {
      console.log("✅ Loaded inputSchema from full build metadata successfully.");
      const runnableInput = extractRunnableInputFromSchema(parsedSchema);
      return res.json(runnableInput);
    } else {
      throw new Error("Parsed schema is empty or malformed.");
    }
  } catch (err) {
    console.warn("❌ Failed to load schema from build metadata:", err.message);
  }

  // 2. AI fallback
  try {
    console.log("🤖 Falling back to AI schema generation...");
    const aiSchema = await generateFallbackSchema(actorId);
    console.log("✅ AI-generated fallback schema loaded.");
    return res.json(aiSchema);
  } catch (err) {
    console.warn("❌ AI fallback failed:", err.message);
  }

  console.error("💥 All schema resolution methods failed.");
  return res.status(500).json({ error: "All schema fetch methods failed." });
});

// === Run actor ===
app.post("/api/run", async (req, res) => {
  const { apiKey, actorId, input } = req.body;
  if (!apiKey || !actorId)
    return res.status(400).json({ error: "API Key and actor ID are required." });

  console.log("🚀 Initiating actor run...");
  console.log("🎯 Actor ID:", actorId);

  try {
    console.log("📤 Sending run request to Apify...");
    const runStart = await axios.post(
      `https://api.apify.com/v2/acts/${actorId}/runs?memory=512`,
      input,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const runId = runStart.data.data.id;
    console.log("🏃 Run started with ID:", runId);

    let status = "READY", runData = null;

    console.log("⏳ Polling run status...");
    while (["READY", "RUNNING"].includes(status)) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusRes = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      runData = statusRes.data.data;
      status = runData.status;
      console.log(`📡 Status: ${status}`);
    }

    if (status === "SUCCEEDED") {
      const datasetId = runData.defaultDatasetId;
      console.log("✅ Run succeeded. Fetching results from dataset:", datasetId);

      const outputRes = await axios.get(
        `https://api.apify.com/v2/datasets/${datasetId}/items`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      console.log("📦 Results fetched. Returning to client.");
      return res.json({ result: outputRes.data });
    } else {
      console.error("❌ Actor failed with status:", status);
      return res.status(400).json({ error: `Actor failed with status: ${status}` });
    }
  } catch (err) {
    console.error("🔥 Actor run failed:", err.message);
    if (err.response) {
      console.error("📥 Response Data:", err.response.data);
      console.error("📊 Response Status:", err.response.status);
      return res.status(err.response.status).json({
        error: "Actor run failed",
        details: err.response.data,
      });
    }
    return res.status(500).json({ error: "Actor execution failed", details: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));
