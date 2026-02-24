import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { authMiddleware } from "./middleware/auth.js";
import healthRoutes from "./routes/health.js";
import contactRoutes from "./routes/contacts.js";
import invoiceRoutes from "./routes/invoices.js";
import { createMcpRequestHandler } from "./mcp.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());

// Auth on all /api routes
app.use("/api", authMiddleware);

// Routes
app.use("/api", healthRoutes);
app.use("/api", contactRoutes);
app.use("/api", invoiceRoutes);

// MCP endpoint
if (config.ENABLE_MCP) {
  const mcpHandler = createMcpRequestHandler();
  app.all("/mcp", authMiddleware, mcpHandler);
}

// Web UI
if (config.ENABLE_WEB_UI) {
  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "web", "index.html"));
  });
}

app.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
  if (config.ENABLE_MCP) {
    console.log(`MCP endpoint: http://localhost:${config.PORT}/mcp`);
  }
  if (config.ENABLE_WEB_UI) {
    console.log(`Web UI: http://localhost:${config.PORT}/`);
  }
});
