require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/database");
const { connectQueue } = require("./config/queue");
const JobController = require("./controllers/jobController");
const {
  validateJobPayload,
  validateRequestId,
  validateJobQuery,
  validateWebhookPayload,
  errorHandler,
  requestLogger,
} = require("./middleware/validation");

const expressApplication = express();
const serverPort = process.env.PORT || 3000;

// Security middleware
expressApplication.use(helmet());
expressApplication.use(cors());

// Rate limiting
const requestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests",
    message: "Rate limit exceeded. Please try again later.",
  },
});
expressApplication.use(requestRateLimiter);

// Body parsing middleware
expressApplication.use(express.json({ limit: "10mb" }));
expressApplication.use(express.urlencoded({ extended: true }));

// Request logging
expressApplication.use(requestLogger);

// Health check endpoint (before other routes)
expressApplication.get("/health", JobController.healthCheck);

// Job routes
expressApplication.post("/jobs", validateJobPayload, JobController.createJob);
expressApplication.get(
  "/jobs/:request_id",
  validateRequestId,
  JobController.getJob
);
expressApplication.get("/jobs", validateJobQuery, JobController.listJobs);

// Webhook routes
expressApplication.post(
  "/vendor-webhook/:vendor",
  validateWebhookPayload,
  JobController.handleVendorWebhook
);

// Root endpoint
expressApplication.get("/", (httpRequest, httpResponse) => {
  httpResponse.json({
    name: "Enrich Labs Job Processing API",
    version: "1.0.0",
    description: "Job processing system with external vendor integrations",
    endpoints: {
      "POST /jobs": "Create a new job",
      "GET /jobs/:request_id": "Get job status and result",
      "GET /jobs": "List jobs with filtering",
      "POST /vendor-webhook/:vendor": "Webhook endpoint for async vendors",
      "GET /health": "Health check",
    },
    documentation: "See README.md for detailed API documentation",
  });
});

// 404 handler
expressApplication.use("*", (httpRequest, httpResponse) => {
  httpResponse.status(404).json({
    error: "Not found",
    message: `Route ${httpRequest.method} ${httpRequest.originalUrl} not found`,
  });
});

// Error handling middleware (must be last)
expressApplication.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (shutdownSignal) => {
  console.log(`Received ${shutdownSignal}. Starting graceful shutdown...`);

  try {
    // Close queue connection
    const { closeConnection } = require("./config/queue");
    await closeConnection();
    console.log("Queue connection closed");

    // Close database connection
    const mongoose = require("mongoose");
    await mongoose.connection.close();
    console.log("Database connection closed");

    process.exit(0);
  } catch (shutdownError) {
    console.error("Error during shutdown:", shutdownError);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to RabbitMQ
    await connectQueue();

    // Start the server
    expressApplication.listen(serverPort, () => {
      console.log(`🚀 Server running on port ${serverPort}`);
      console.log(
        `📚 API Documentation available at http://localhost:${serverPort}`
      );
      console.log(`💚 Health check at http://localhost:${serverPort}/health`);
    });
  } catch (serverStartupError) {
    console.error("Failed to start server:", serverStartupError);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = expressApplication;
