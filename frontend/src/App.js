// Frontend React App for Apify Actor Runner
//frontend/src/App.js

import React, { useState } from "react";
import axios from "axios";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  const [apiKey, setApiKey] = useState("");
  const [actors, setActors] = useState([]);
  const [actorId, setActorId] = useState("");
  const [schema, setSchema] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [schemaValid, setSchemaValid] = useState(true);

  const handleGetActors = async () => {
    setError("");
    setResult(null);
    try {
      const res = await axios.post("http://localhost:5000/api/actors", { apiKey });
      setActors(res.data.data.items);
    } catch (err) {
      setError("❌ Failed to fetch actors. Check your API key.");
    }
  };

  const handleActorChange = (e) => {
    setActorId(e.target.value);
    setSchema("");
    setResult(null);
    setError("");
  };

const handleGetSchema = async () => {
  if (!actorId || actorId === "Select...") {
    setError("⚠️ Please select a valid actor.");
    return;
  }

  setError("");
  try {
    const res = await axios.post("http://localhost:5000/api/schema", {
      apiKey,
      actorId,
    });

    const data = res.data;
    let formatted;

    // Check if the response is a schema or example input
    if (data && data.properties) {
      formatted = JSON.stringify(data, null, 2);
      toast.info("📦 Loaded structured input schema.");
    } else {
      formatted = JSON.stringify(data, null, 2);
      toast.info("📄 Loaded sample input (fallback from last successful run).");
    }

    setSchema(formatted);
    setSchemaValid(true);
    setResult(null);
  } catch (err) {
    console.error("❌ Schema fetch error:", err);
    setError("❌ Failed to fetch schema from Apify.");
  }
};

const handleSchemaChange = (e) => {
  const value = e.target.value;
  setSchema(value);

  try {
    JSON.parse(value);
    setSchemaValid(true);
  } catch (err) {
    setSchemaValid(false);
  }
};

const handleRunActor = async () => {
  setError("");
  setResult(null);

  try {
    // Try to extract only the input values from the schema
  let input;
  try {
    const parsed = JSON.parse(schema);
    if (parsed && parsed.properties && typeof parsed.properties === 'object') {
      // Extract keys from `properties` and fill with sample values or prompts
      input = {};
      for (const key of Object.keys(parsed.properties)) {
        input[key] = parsed.properties[key].prefill || ""; // fallback to empty
      }
    } else {
      // Assume it's raw input already
      input = parsed;
    }
  } catch (e) {
    setError("❌ Invalid JSON input.");
    return;
  }

      console.log("📦 Input schema being sent to backend:", input); // 👈 Add this log

    const res = await axios.post("http://localhost:5000/api/run", {
      apiKey,
      actorId,
      input,
    });

    setResult(res.data.result);
    toast.success("✅ Actor completed successfully!");

  } catch (err) {
    console.error("❌ Error during run:", err); // Optional debug log
    setError("❌ Failed to run actor. Make sure input is valid JSON.");
  }
};

  return (
    <div style={{ padding: "30px", maxWidth: "1000px", margin: "auto", fontFamily: "'Segoe UI', sans-serif" }}>
      <h2 style={{ color: "#222" }}>🎬 Apify Actor Runner</h2>

      {/* API Key Input */}
      <div style={{ marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="🔑 Enter Apify API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{
            width: "400px",
            padding: "8px",
            borderRadius: "5px",
            border: "1px solid #ccc",
            marginRight: "10px"
          }}
        />
        <button onClick={handleGetActors} style={buttonStyle}>Fetch Actors</button>
      </div>

      {/* Actor Selection */}
      {actors.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <h4>Select an Actor</h4>
          <select
            onChange={handleActorChange}
            value={actorId}
            style={{ padding: "8px", width: "300px", marginRight: "10px" }}
          >
            <option>Select...</option>
            {actors.map((actor) => (
              <option key={actor.id} value={`${actor.username}~${actor.name}`}>
                {actor.name}
              </option>
            ))}
          </select>
          <button onClick={handleGetSchema} disabled={!actorId} style={buttonStyle}>Load Schema</button>
        </div>
      )}

      {/* Schema Editor */}
      {actorId && (
        <div style={{ marginBottom: "20px" }}>
          <h4>📝 Input Schema (Editable)</h4>
          <textarea
            value={schema}
            onChange={handleSchemaChange}
            rows={20}
            style={{
              width: "100%",
              fontFamily: "monospace",
              border: schemaValid ? "1px solid #ccc" : "2px solid red",
              padding: "10px",
              borderRadius: "6px",
              backgroundColor: schemaValid ? "#f9f9f9" : "#ffe5e5",
              resize: "vertical"
            }}
          />
          {!schemaValid && <p style={{ color: "red" }}>⚠️ Invalid JSON</p>}
          <button onClick={handleRunActor} disabled={!schemaValid} style={{ ...buttonStyle, marginTop: "10px" }}>
            ▶️ Run Actor
          </button>
        </div>
      )}

      {/* Result Display */}
      {result && (
        <div style={{ marginTop: "30px" }}>
          <h4 style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            ✅ Output
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                toast.info("📋 Output copied to clipboard!");
              }}

              style={{
                backgroundColor: "#28a745",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              📋 Copy
            </button>
          </h4>

          <div
            style={{
              backgroundColor: "#1e1e1e",
              color: "#dcdcdc",
              padding: "15px",
              borderRadius: "8px",
              overflowX: "auto",
              maxHeight: "400px",
              fontFamily: "Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace",
              fontSize: "14px",
              boxShadow: "0 0 10px rgba(0,0,0,0.1)",
              border: "1px solid #333"
            }}
          >
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Error Message */}
      {error && <p style={{ color: "red", marginTop: "20px" }}>{error}</p>}
    </div>
  );
}

const buttonStyle = {
  padding: "8px 16px",
  backgroundColor: "#007BFF",
  color: "white",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer"
};

export default App;
