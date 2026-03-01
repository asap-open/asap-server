import express from "express";
import authRoutes from "./routes/auth.route.js";
import sessionRoutes from "./routes/session.route.js";
import exerciseRoutes from "./routes/exercise.route.js";
import weightRoutes from "./routes/weight.route.js";
import profileRoutes from "./routes/profile.route.js";
import progressRoutes from "./routes/progress.route.js";
import routineRoutes from "./routes/routine.route.js";
import pbRoutes from "./routes/pb.route.js";
import { prisma } from "./utils/prisma.js";

const app = express();
const port = process.env.PORT || 3000;

// Support comma-separated FRONTEND_DOMAIN values and always allow Capacitor origins
const configuredOrigins = (process.env.FRONTEND_DOMAIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set([
  ...configuredOrigins,
  "capacitor://localhost", // Android (Capacitor, legacy)
  "http://localhost", // Android WebView (androidScheme: http)
  "https://localhost", // Android WebView (androidScheme: https)
]);

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(
    `[${new Date().toISOString()}] Incoming: ${req.method} ${req.originalUrl} | Origin: "${req.headers.origin ?? "none"}"`,
  );

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] Resolved: ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
    );
  });

  next();
});

// CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log(
    `[CORS] Origin: "${origin ?? "none"}" | Allowed: ${origin ? ALLOWED_ORIGINS.has(origin) : false}`,
  );
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/exercises", exerciseRoutes);
app.use("/api/weights", weightRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/routines", routineRoutes);
app.use("/api/pbs", pbRoutes);

app.get("/", (req, res) => {
  res.send("ASAP API Server Running");
});

const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      console.error("Error during server shutdown:", err);
      process.exit(1);
    }

    console.log("HTTP server closed");

    try {
      // Close database connections
      await prisma.$disconnect();
      console.log("Database connections closed");
      console.log("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("Error during database disconnect:", error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down",
    );
    process.exit(1);
  }, 30000);
};

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
