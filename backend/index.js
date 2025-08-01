// Backend API for Apify Actors
//backend/index.js

const express = require("express");
const axios = require("axios");
const cors = require("cors");
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

// === Get input schema ===

app.post("/api/schema", async (req, res) => {
  const { apiKey, actorId } = req.body;

  if (!apiKey || !actorId) {
    return res.status(400).json({ error: "API Key and actor ID are required." });
  }

  const schemaURL = `https://api.apify.com/v2/acts/${actorId}/input-schema`;
  const fallbackRunURL = `https://api.apify.com/v2/acts/${actorId}/runs/last?status=SUCCEEDED`;

  console.log("📦 Fetching schema for:", actorId);

  try {
    const response = await axios.get(schemaURL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const schema = response.data;

    if (!schema || Object.keys(schema.properties || {}).length === 0) {
      console.log("⚠️ Schema is empty. Attempting fallback...");
      throw new Error("Empty schema");
    }

    console.log("✅ Schema fetched from /input-schema.");
    return res.json(schema);
  } catch (error) {
    console.warn("❌ Primary schema fetch failed. Trying fallback...");

    try {
      // Step 1: Get last successful run ID
      const fallbackRes = await axios.get(fallbackRunURL, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const runId = fallbackRes.data?.data?.id;
      if (!runId) throw new Error("No previous run ID found");
      console.log("🧪 Found fallback run ID:", runId);

      // Step 2: Fetch run object and extract input
      const runInfoRes = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      const inputExample = runInfoRes.data?.data?.input;

      if (!inputExample || Object.keys(inputExample).length === 0) {
        return res.status(404).json({
          error: "No schema or usable past input available.",
        });
      }

      console.log("✅ Fallback input fetched from run info.");
      return res.json(inputExample);
    } catch (fallbackErr) {
      console.error("❌ Fallback failed.");
      if (fallbackErr.response) {
        console.error("📛 Status Code:", fallbackErr.response.status);
        console.error("📋 Response Body:", JSON.stringify(fallbackErr.response.data, null, 2));
      } else {
        console.error("🧨 Error Message:", fallbackErr.message);
      }

      return res.status(500).json({
        error: "Failed to fetch schema or fallback input.",
        details: fallbackErr.response?.data || fallbackErr.message,
      });
    }
  }
});

// === Run selected actor ===
app.post("/api/run", async (req, res) => {
  const { apiKey, actorId, input } = req.body;

  if (!apiKey || !actorId)
    return res.status(400).json({ error: "API Key and actor ID are required." });

  console.log("🚀 Executing Actor...");
  console.log("🔑 API Key (partial):", apiKey.slice(0, 8) + "...");
  console.log("🎯 Actor ID:", actorId);
  console.log("📦 Input Payload:", JSON.stringify(input, null, 2));

  try {
    // Step 1: Start actor with limited memory (512MB)
    const runResponse = await axios.post(
      `https://api.apify.com/v2/acts/${actorId}/runs`,
      {
        memory: 512,
        input,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const runId = runResponse.data.data.id;
    console.log(`⏳ Actor run started. Run ID: ${runId}`);

    // Step 2: Poll until actor finishes
    let status = "READY";
    let runData = null;

    while (["READY", "RUNNING"].includes(status)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      runData = statusResponse.data.data;
      status = runData.status;
      console.log(`📡 Polling... Current status: ${status}`);
    }

    // Step 3: Handle output
    if (status === "SUCCEEDED") {
      const datasetId = runData.defaultDatasetId;
      const outputResponse = await axios.get(
        `https://api.apify.com/v2/datasets/${datasetId}/items`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      );

      res.json({ result: outputResponse.data });
    } else {
      console.error(`❌ Actor failed. Final status: ${status}`);
      res.status(400).json({ error: `Actor did not complete successfully. Final status: ${status}` });
    }
  } catch (error) {
    console.error("❌ Actor execution failed:", error.message);
    res.status(500).json({
      error: "Execution failed.",
      details: error.response?.data || error.message,
    });
  }
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));
