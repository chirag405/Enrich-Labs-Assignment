require("dotenv").config();
const express = require("express");
const cors = require("cors");

const mockVendorApplication = express();
const serverPort = process.env.PORT || 3001;

mockVendorApplication.use(cors());
mockVendorApplication.use(express.json());

// Simulate some processing delay
const simulateProcessingDelay = () => {
  return new Promise((resolveDelay) => {
    const randomDelayMilliseconds = Math.random() * 1000 + 200; // 200ms to 1.2s
    setTimeout(resolveDelay, randomDelayMilliseconds);
  });
};

// Generate simple processed data (just basic cleaning/processing)
const generateProcessedData = (originalRequestPayload, requestIdentifier) => {
  // Simple processing: trim strings, add timestamp, basic metadata
  const payloadCopy = JSON.parse(JSON.stringify(originalRequestPayload));

  // Trim all string values
  const trimStringValues = (objectToProcess) => {
    if (typeof objectToProcess === "string") return objectToProcess.trim();
    if (Array.isArray(objectToProcess))
      return objectToProcess.map(trimStringValues);
    if (objectToProcess && typeof objectToProcess === "object") {
      const trimmedObject = {};
      for (const [propertyKey, propertyValue] of Object.entries(
        objectToProcess
      )) {
        trimmedObject[propertyKey] = trimStringValues(propertyValue);
      }
      return trimmedObject;
    }
    return objectToProcess;
  };

  const sanitizedPayload = trimStringValues(payloadCopy);

  return {
    request_id: requestIdentifier,
    vendor: "sync",
    processed_at: new Date().toISOString(),
    original_payload: originalRequestPayload,
    processed_data: sanitizedPayload,
    processing_time_ms: Math.floor(Math.random() * 800) + 200,
    status: "success",
  };
};

// Main processing endpoint
mockVendorApplication.post("/process", async (httpRequest, httpResponse) => {
  try {
    const { request_id, payload } = httpRequest.body;

    if (!request_id) {
      return httpResponse.status(400).json({
        error: "Bad request",
        message: "request_id is required",
      });
    }

    if (!payload) {
      return httpResponse.status(400).json({
        error: "Bad request",
        message: "payload is required",
      });
    }

    console.log(`🔄 Sync vendor processing job ${request_id}`);

    // Simulate processing time
    await simulateProcessingDelay();

    // Generate simple processed data
    const processedJobData = generateProcessedData(payload, request_id);

    console.log(`✅ Sync vendor completed job ${request_id}`);

    httpResponse.json(processedJobData);
  } catch (processingError) {
    console.error("Sync vendor error:", processingError);
    httpResponse.status(500).json({
      error: "Processing failed",
      message: processingError.message,
      request_id: httpRequest.body.request_id,
    });
  }
});

// Health check endpoint
mockVendorApplication.get("/health", (httpRequest, httpResponse) => {
  httpResponse.json({
    status: "healthy",
    vendor: "sync-vendor",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Rate limit status endpoint
mockVendorApplication.get("/rate-limit", (httpRequest, httpResponse) => {
  httpResponse.json({
    current_usage: Math.floor(Math.random() * 100),
    limit: 1000,
    window: "1 hour",
    remaining: Math.floor(Math.random() * 900) + 100,
    reset_time: new Date(Date.now() + 3600000).toISOString(),
  });
});

// 404 handler
mockVendorApplication.use("*", (httpRequest, httpResponse) => {
  httpResponse.status(404).json({
    error: "Not found",
    message: "Endpoint not found",
  });
});

// Error handler
mockVendorApplication.use(
  (applicationError, httpRequest, httpResponse, nextMiddleware) => {
    console.error("Sync vendor error:", applicationError);
    httpResponse.status(500).json({
      error: "Internal server error",
      message: applicationError.message,
    });
  }
);

mockVendorApplication.listen(serverPort, () => {
  console.log(`🚀 Sync vendor mock running on port ${serverPort}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   POST /process - Process data`);
  console.log(`   GET /health - Health check`);
  console.log(`   GET /rate-limit - Rate limit status`);
});

module.exports = mockVendorApplication;
