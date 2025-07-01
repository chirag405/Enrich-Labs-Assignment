require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const mockAsyncVendorApplication = express();
const serverPort = process.env.PORT || 3002;

mockAsyncVendorApplication.use(cors());
mockAsyncVendorApplication.use(express.json());

// In-memory store for pending jobs
const pendingJobsMap = new Map();

// Simulate async processing delay
const simulateAsynchronousProcessingDelay = () => {
  return Math.random() * 4000 + 2000; // 2s to 6s
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
    vendor: "async",
    processed_at: new Date().toISOString(),
    original_payload: originalRequestPayload,
    processed_data: sanitizedPayload,
    processing_time_ms: Math.floor(Math.random() * 4000) + 2000,
    status: Math.random() < 0.95 ? "success" : "failed", // 5% failure rate
  };
};

// Send webhook to API server
const sendWebhookNotification = async (webhookEndpointUrl, webhookPayload) => {
  try {
    console.log(
      `📤 Sending webhook for job ${webhookPayload.request_id} to ${webhookEndpointUrl}`
    );

    const webhookResponse = await axios.post(
      webhookEndpointUrl,
      webhookPayload,
      {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Async-Vendor-Webhook/1.0",
        },
      }
    );

    console.log(
      `✅ Webhook sent successfully for job ${webhookPayload.request_id}, response: ${webhookResponse.status}`
    );
  } catch (webhookSendError) {
    console.error(
      `❌ Failed to send webhook for job ${webhookPayload.request_id}:`,
      webhookSendError.message
    );

    // Simple retry logic
    setTimeout(() => {
      console.log(`🔄 Retrying webhook for job ${webhookPayload.request_id}`);
      sendWebhookNotification(webhookEndpointUrl, webhookPayload).catch(
        (retryError) => {
          console.error(
            `❌ Webhook retry failed for job ${webhookPayload.request_id}:`,
            retryError.message
          );
        }
      );
    }, 5000);
  }
};

// Process job asynchronously
const processJobAsynchronously = async (
  requestIdentifier,
  requestPayload,
  webhookEndpointUrl
) => {
  console.log(
    `🔄 Async vendor starting background processing for job ${requestIdentifier}`
  );

  const processingDelayMilliseconds = simulateAsynchronousProcessingDelay();

  setTimeout(async () => {
    try {
      const processedJobData = generateProcessedData(
        requestPayload,
        requestIdentifier
      );

      const webhookNotificationPayload = {
        request_id: requestIdentifier,
        success: processedJobData.status === "success",
        data: processedJobData,
        timestamp: new Date().toISOString(),
        vendor_id: "async-vendor",
      };

      if (processedJobData.status === "failed") {
        webhookNotificationPayload.error =
          "Processing failed due to data validation error";
      }

      // Remove job from pending list
      pendingJobsMap.delete(requestIdentifier);

      // Send webhook
      await sendWebhookNotification(
        webhookEndpointUrl,
        webhookNotificationPayload
      );
    } catch (processingError) {
      console.error(
        `❌ Error processing async job ${requestIdentifier}:`,
        processingError
      );

      // Send failure webhook
      const failureNotificationPayload = {
        request_id: requestIdentifier,
        success: false,
        error: processingError.message,
        timestamp: new Date().toISOString(),
        vendor_id: "async-vendor",
      };

      pendingJobsMap.delete(requestIdentifier);
      await sendWebhookNotification(
        webhookEndpointUrl,
        failureNotificationPayload
      );
    }
  }, processingDelayMilliseconds);
};

// Main processing endpoint (async)
mockAsyncVendorApplication.post(
  "/process",
  async (httpRequest, httpResponse) => {
    try {
      const { request_id, payload, webhook_url } = httpRequest.body;

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

      if (!webhook_url) {
        return httpResponse.status(400).json({
          error: "Bad request",
          message: "webhook_url is required for async processing",
        });
      }

      console.log(`📨 Async vendor received job ${request_id}`);

      // Store job as pending
      pendingJobsMap.set(request_id, {
        payload,
        webhook_url,
        received_at: new Date().toISOString(),
      });

      // Start async processing
      processJobAsynchronously(request_id, payload, webhook_url);

      // Return immediate response
      httpResponse.json({
        request_id: request_id,
        status: "accepted",
        message: "Job accepted for async processing",
        estimated_completion: new Date(Date.now() + 5000).toISOString(),
      });
    } catch (processRequestError) {
      console.error("Async vendor error:", processRequestError);
      httpResponse.status(500).json({
        error: "Processing failed",
        message: processRequestError.message,
        request_id: httpRequest.body.request_id,
      });
    }
  }
);

// Job status endpoint
mockAsyncVendorApplication.get(
  "/status/:request_id",
  (httpRequest, httpResponse) => {
    const requestIdentifier = httpRequest.params.request_id;

    if (pendingJobsMap.has(requestIdentifier)) {
      httpResponse.json({
        request_id: requestIdentifier,
        status: "processing",
        vendor: "async-vendor",
      });
    } else {
      httpResponse.json({
        request_id: requestIdentifier,
        status: "unknown",
        message: "Job not found or already completed",
      });
    }
  }
);

// Health check endpoint
mockAsyncVendorApplication.get("/health", (httpRequest, httpResponse) => {
  httpResponse.json({
    status: "healthy",
    vendor: "async-vendor",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    pending_jobs: pendingJobsMap.size,
  });
});

// Rate limit status endpoint
mockAsyncVendorApplication.get("/rate-limit", (httpRequest, httpResponse) => {
  httpResponse.json({
    current_usage: Math.floor(Math.random() * 50),
    limit: 500,
    window: "1 hour",
    remaining: Math.floor(Math.random() * 450) + 50,
    reset_time: new Date(Date.now() + 3600000).toISOString(),
  });
});

// 404 handler
mockAsyncVendorApplication.use("*", (httpRequest, httpResponse) => {
  httpResponse.status(404).json({
    error: "Not found",
    message: "Endpoint not found",
  });
});

// Error handler
mockAsyncVendorApplication.use(
  (applicationError, httpRequest, httpResponse, nextMiddleware) => {
    console.error("Async vendor error:", applicationError);
    httpResponse.status(500).json({
      error: "Internal server error",
      message: applicationError.message,
    });
  }
);

mockAsyncVendorApplication.listen(serverPort, () => {
  console.log(`🚀 Async vendor mock running on port ${serverPort}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   POST /process - Process data asynchronously`);
  console.log(`   GET /status/:request_id - Check job status`);
  console.log(`   GET /health - Health check`);
  console.log(`   GET /rate-limit - Rate limit status`);
});

module.exports = mockAsyncVendorApplication;
