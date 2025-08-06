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

// === AI Fallback using OpenRouter ===
async function generateFallbackSchema(actorId) {
  const prompt = `You are given an Apify actor ID: "${actorId}".
  Generate a realistic example of the JSON input expected by this actor. Only return a valid JSON object that would be accepted by this actor when run.
  Do not add any comments, markdown, or explanation. Just return the JSON input example.`;

  try {
    const aiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo", // you can change to another if needed
        messages: [
          { role: "system", content: "You are a JSON-generating assistant for Apify actors." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 300
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
    if (err.response?.data) console.error("📋 Response:", err.response.data);
    throw new Error("AI could not generate fallback schema.");
  }
}

// === Get schema with AI Fallback ===
app.post("/api/schema", async (req, res) => {
  const { apiKey, actorId } = req.body;
  if (!apiKey || !actorId) {
    return res.status(400).json({ error: "API Key and actor ID are required." });
  }

  const schemaURL = `https://api.apify.com/v2/acts/${actorId}/input-schema`;
  const fallbackRunURL = `https://api.apify.com/v2/acts/${actorId}/runs/last?status=SUCCEEDED`;

  console.log("📦 Fetching schema for:", actorId);

  // Primary schema attempt
  try {
    const response = await axios.get(schemaURL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const schema = response.data;
    if (schema && schema.properties && Object.keys(schema.properties).length > 0) {
      console.log("✅ Schema fetched from /input-schema.");
      return res.json(schema);
    } else {
      throw new Error("Empty schema");
    }
  } catch {
    console.warn("❌ Primary schema fetch failed. Trying fallback...");
  }

  // Fallback: fetch from last successful run
  try {
    const fallbackRes = await axios.get(fallbackRunURL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const runId = fallbackRes.data?.data?.id;
    if (!runId) throw new Error("No previous run ID found");
    console.log("🧪 Found fallback run ID:", runId);

    const runInfo = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const inputExample = runInfo.data?.data?.input;
    if (inputExample && Object.keys(inputExample).length > 0) {
      console.log("✅ Fallback input loaded from previous run.");
      return res.json(inputExample);
    }
  } catch {
    console.warn("❌ Fallback using last run failed.");
  }

  // Final fallback: AI
  try {
    const aiSchema = await generateFallbackSchema(actorId);
    console.log("🤖 AI-generated fallback schema returned.");
    return res.json(aiSchema);
  } catch (err) {
    return res.status(500).json({ error: "All methods failed to retrieve or generate schema." });
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

    let status = "READY";
    let runData = null;

    while (["READY", "RUNNING"].includes(status)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusRes = await axios.get(`https://api.apify.com/v2/actor-runs/${runId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      runData = statusRes.data.data;
      status = runData.status;
      console.log(`📡 Polling... Current status: ${status}`);
    }

    if (status === "SUCCEEDED") {
      const datasetId = runData.defaultDatasetId;
      const outputRes = await axios.get(
        `https://api.apify.com/v2/datasets/${datasetId}/items`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      res.json({ result: outputRes.data });
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

app.listen(PORT, () =>
  console.log(`🚀 Backend running on http://localhost:${PORT}`)
);
