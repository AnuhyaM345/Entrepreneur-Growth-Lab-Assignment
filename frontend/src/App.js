// Final Frontend React App for Apify Actor Runner (Vercel-compatible)
// Updated to use backend hosted on Render

import React, { useState } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import './index.css';
import './App.css';

// ✅ Update this to your deployed Render backend URL
const BACKEND_URL = "https://your-render-backend-url.onrender.com";

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
      const res = await axios.post(`${BACKEND_URL}/api/actors`, { apiKey });
      setActors(res.data.data.items);
      toast.success("✅ Actors loaded!");
    } catch {
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
    const loadingToast = toast.loading("📦 Loading schema...");

    try {
      const res = await axios.post(`${BACKEND_URL}/api/schema`, {
        apiKey,
        actorId,
      });

      const data = res.data;
      const formatted = JSON.stringify(data, null, 2);

      setSchema(formatted);
      setSchemaValid(true);
      setResult(null);

      toast.update(loadingToast, {
        render: "✅ Schema loaded successfully!",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
    } catch (err) {
      console.error("❌ Schema fetch error:", err);
      toast.update(loadingToast, {
        render: "❌ Failed to load schema.",
        type: "error",
        isLoading: false,
        autoClose: 3000,
      });
      setError("❌ Failed to fetch schema.");
    }
  };

  const handleSchemaChange = (e) => {
    const value = e.target.value;
    setSchema(value);

    try {
      JSON.parse(value);
      setSchemaValid(true);
    } catch {
      setSchemaValid(false);
    }
  };

  const handleRunActor = async () => {
    setError("");
    setResult(null);

    let input;
    try {
      input = JSON.parse(schema);

      const booleanFields = [
        "keepUrlFragments", "respectRobotsTxtFile", "debugLog", "ignoreSslErrors",
        "forceResponseEncoding", "downloadMedia", "downloadCss", "closeCookieModals",
        "headless", "browserLog", "useChrome", "ignoreCorsAndCsp"
      ];

      booleanFields.forEach((key) => {
        if (key in input && typeof input[key] === "string") {
          input[key] = input[key].toLowerCase() === "true";
        }
      });

      if (input.startUrls && Array.isArray(input.startUrls)) {
        input.startUrls = input.startUrls.map((url) =>
          typeof url === "string" ? { url } : url
        );
      }

      if (input.proxyConfiguration && typeof input.proxyConfiguration === "string") {
        input.proxyConfiguration = { useApifyProxy: true };
      }

    } catch {
      setError("❌ Invalid JSON input.");
      return;
    }

    const loadingToast = toast.info("⏳ Please wait, running the actor...", {
      autoClose: false,
      closeOnClick: false,
      draggable: false,
      position: "top-right",
    });

    try {
      const res = await axios.post(`${BACKEND_URL}/api/run`, {
        apiKey,
        actorId,
        input,
      });

      setResult(res.data.result);
      toast.dismiss(loadingToast);
      toast.success("🎉 Actor run completed! Check the output below.");
    } catch (err) {
      console.error("❌ Run failed:", err);
      toast.dismiss(loadingToast);
      setError("❌ Failed to run actor.");
    }
  };


  return (
    <div
      style={{
        backgroundImage: `url('/bg.jpg')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        minHeight: "100vh",
        width: "100%",
      }}
    >
      <div style={{ backgroundColor: "transparent", minHeight: "100vh", padding: "40px" }}>
        <div style={styles.container}>
          <h2 style={styles.title}>🎬 Apify Actor Runner</h2>

          <div style={styles.inputGroup}>
            <input
              type="text"
              placeholder="🔑 Enter Apify API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={styles.input}
            />
            <button onClick={handleGetActors} style={styles.button}>
              Fetch Actors
            </button>
          </div>

          {actors.length > 0 && (
            <div style={styles.inputGroup}>
              <select
                onChange={handleActorChange}
                value={actorId}
                className="transparent-dropdown"
              >
                <option>Select...</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={`${actor.username}~${actor.name}`}>
                    {actor.name}
                  </option>
                ))}
              </select>
              <button onClick={handleGetSchema} disabled={!actorId} style={styles.button}>
                Load Schema
              </button>
            </div>
          )}

          {actorId && (
            <div style={{ marginBottom: "20px" }}>
              <h4 style={styles.subTitle}>📝 Input Schema (Editable)</h4>
              <textarea
                value={schema}
                onChange={handleSchemaChange}
                rows={18}
                style={{
                  ...styles.textarea,
                  border: schemaValid ? "1px solid white" : "2px solid red",
                  backgroundColor: schemaValid ? "transparent" : "transparent",
                  color: "#eaeaea",
                }}
              />
              {!schemaValid && <p style={{ color: "red" }}>⚠️ Invalid JSON</p>}
              <button
                onClick={handleRunActor}
                disabled={!schemaValid}
                style={styles.runButton}
              >
                ▶️ Run Actor
              </button>
            </div>
          )}

          {result && (
            <div style={{ marginTop: "30px" }}>
              <h4 style={styles.outputTitle}>
                ✅ Output
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                    toast.info("📋 Output copied!");
                  }}
                  style={styles.copyButton}
                >
                  📋 Copy
                </button>
              </h4>
              <div style={styles.outputBox}>
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </div>
            </div>
          )}

          <ToastContainer position="top-right" autoClose={3000} />
          {error && <p style={{ color: "red", marginTop: "20px" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: "transparent",
    color: "#fff",
    padding: "40px",
    fontFamily: "'Segoe UI', sans-serif",
    maxWidth: "1000px",
    margin: "auto",
  },
  title: {
    fontSize: "28px",
    marginBottom: "20px",
    color: "#99ccf5ff",
    textShadow: "0 0 10px rgba(151, 205, 249, 0.5)",
    fontWeight: "bold",
  },
  inputGroup: {
    marginBottom: "20px",
    display: "flex",
    gap: "10px",
    alignItems: "center",
    color: "#fff",
  },
  input: {
    width: "400px",
    padding: "10px",
    borderRadius: "5px",
    border: "1px solid white",
    backgroundColor: "transparent",
    color: "#fff",
    fontFamily: "monospace",
  },
  button: {
    padding: "10px 16px",
    backgroundColor: "#0066ff",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    transition: "0.3s",
  },
  dropdown: {
    padding: "10px",
    width: "300px",
    borderRadius: "5px",
    backgroundColor: "transparent",
    color: "#fff",
    border: "1px solid white",
  },
  subTitle: {
    marginBottom: "8px",
    fontWeight: "bold",
    color: "#99ccf5ff",
    textShadow: "0 0 10px rgba(151, 205, 249, 0.5)",
    fontSize: "20px",
    fontFamily: "'Segoe UI', sans-serif",
  },
  textarea: {
    width: "100%",
    fontFamily: "monospace",
    padding: "10px",
    borderRadius: "6px",
    resize: "vertical",
  },
  runButton: {
    marginTop: "10px",
    backgroundColor: "#28a745",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "5px",
    border: "none",
    cursor: "pointer",
    fontWeight: "bold",
  },
  outputTitle: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
  },
  copyButton: {
    backgroundColor: "#444",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    padding: "6px 10px",
    cursor: "pointer",
  },
  outputBox: {
    padding: "15px",
    borderRadius: "8px",
    overflowX: "auto",
    maxHeight: "400px",
    fontSize: "14px",
    border: "1px solid #444",
    boxShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(5px)",
    marginTop: "10px",
    lineHeight: "1.5",
    fontFamily: "'Courier New', Courier, monospace",
    color: "#eaeaea",
  },
};

export default App;
