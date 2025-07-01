require("dotenv").config();
const axios = require("axios");

const connectDB = require("./config/database");
const { connectQueue, getChannel } = require("./config/queue");
const Job = require("./models/Job");
const DataProcessor = require("./services/dataProcessor");
const {
  syncVendorLimiter,
  asyncVendorLimiter,
} = require("./services/rateLimiter");

class JobWorker {
  constructor() {
    this.isWorkerRunning = false;
    this.concurrentWorkerCount = parseInt(process.env.WORKER_CONCURRENCY) || 5;
    this.maximumRetryAttempts =
      parseInt(process.env.WORKER_RETRY_ATTEMPTS) || 3;
    this.retryDelayMilliseconds =
      parseInt(process.env.WORKER_RETRY_DELAY_MS) || 1000;
    this.activeJobsMap = new Map();
  }

  async start() {
    try {
      console.log("🔄 Starting job worker...");

      await connectDB();
      await connectQueue();

      this.isWorkerRunning = true;
      await this.startMessageConsumer();

      console.log(
        `✅ Job worker started with ${this.concurrentWorkerCount} concurrent workers`
      );
    } catch (workerStartupError) {
      console.error("❌ Failed to start worker:", workerStartupError);
      process.exit(1);
    }
  }

  async startMessageConsumer() {
    const messageChannel = getChannel();
    await messageChannel.prefetch(this.concurrentWorkerCount);

    await messageChannel.consume(
      process.env.QUEUE_NAME,
      async (queueMessage) => {
        if (queueMessage) {
          try {
            const jobInstructions = JSON.parse(queueMessage.content.toString());
            await this.processJob(jobInstructions);
            messageChannel.ack(queueMessage);
          } catch (messageProcessingError) {
            console.error("Error processing message:", messageProcessingError);
            messageChannel.nack(queueMessage, false, true);
          }
        }
      }
    );
  }

  async processJob(jobInstructions) {
    const jobStartTime = Date.now();
    console.log(
      `📋 Processing job ${jobInstructions.request_id} (vendor: ${jobInstructions.vendor})`
    );

    try {
      const jobRecord = await Job.findOne({
        request_id: jobInstructions.request_id,
      });
      if (!jobRecord) {
        console.error(`Job not found: ${jobInstructions.request_id}`);
        return;
      }

      jobRecord.status = "processing";
      await jobRecord.save();

      this.activeJobsMap.set(jobInstructions.request_id, {
        startTime: jobStartTime,
        vendor: jobInstructions.vendor,
      });

      let vendorProcessingResult;
      if (jobInstructions.vendor === "sync") {
        vendorProcessingResult = await this.processSynchronousVendor(jobRecord);
      } else if (jobInstructions.vendor === "async") {
        vendorProcessingResult = await this.processAsynchronousVendor(
          jobRecord
        );
      } else {
        throw new Error(`Unknown vendor type: ${jobInstructions.vendor}`);
      }

      if (vendorProcessingResult && jobInstructions.vendor === "sync") {
        jobRecord.vendor_response = vendorProcessingResult;
        jobRecord.cleaned_data = DataProcessor.cleanVendorResponse(
          vendorProcessingResult,
          jobInstructions.vendor
        );
        jobRecord.status = "complete";
        jobRecord.completed_at = new Date();
        await jobRecord.save();
      }

      const jobProcessingDuration = Date.now() - jobStartTime;
      console.log(
        `✅ Job ${jobInstructions.request_id} processed in ${jobProcessingDuration}ms`
      );

      this.activeJobsMap.delete(jobInstructions.request_id);
    } catch (jobProcessingError) {
      const jobProcessingDuration = Date.now() - jobStartTime;
      console.error(
        `❌ Job ${jobInstructions.request_id} failed after ${jobProcessingDuration}ms:`,
        jobProcessingError.message
      );

      await this.handleJobError(jobInstructions.request_id, jobProcessingError);
      this.activeJobsMap.delete(jobInstructions.request_id);
    }
  }

  async processSynchronousVendor(jobRecord) {
    console.log(`🔄 Calling sync vendor for job ${jobRecord.request_id}`);

    await syncVendorLimiter.acquire();

    try {
      const vendorApiResponse = await axios.post(
        `${process.env.SYNC_VENDOR_URL}/process`,
        {
          request_id: jobRecord.request_id,
          payload: jobRecord.original_payload,
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Enrich-Labs-Worker/1.0",
          },
        }
      );

      console.log(
        `✅ Sync vendor response for ${jobRecord.request_id}:`,
        vendorApiResponse.status
      );
      return vendorApiResponse.data;
    } catch (synchronousVendorError) {
      console.error(
        `❌ Sync vendor error for ${jobRecord.request_id}:`,
        synchronousVendorError.message
      );
      throw new Error(
        `Sync vendor call failed: ${synchronousVendorError.message}`
      );
    }
  }

  async processAsynchronousVendor(jobRecord) {
    console.log(`🔄 Calling async vendor for job ${jobRecord.request_id}`);

    await asyncVendorLimiter.acquire();

    try {
      const vendorApiResponse = await axios.post(
        `${process.env.ASYNC_VENDOR_URL}/process`,
        {
          request_id: jobRecord.request_id,
          payload: jobRecord.original_payload,
          webhook_url: `${
            process.env.API_BASE_URL || "http://localhost:3000"
          }/vendor-webhook/async-vendor`,
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Enrich-Labs-Worker/1.0",
          },
        }
      );

      console.log(
        `✅ Async vendor accepted job ${jobRecord.request_id}:`,
        vendorApiResponse.status
      );
      return null;
    } catch (asynchronousVendorError) {
      console.error(
        `❌ Async vendor error for ${jobRecord.request_id}:`,
        asynchronousVendorError.message
      );
      throw new Error(
        `Async vendor call failed: ${asynchronousVendorError.message}`
      );
    }
  }

  async handleJobError(failedJobRequestId, jobError) {
    try {
      const failedJobRecord = await Job.findOne({
        request_id: failedJobRequestId,
      });
      if (!failedJobRecord) return;

      failedJobRecord.retry_count += 1;
      failedJobRecord.error_message = jobError.message;

      if (failedJobRecord.retry_count <= this.maximumRetryAttempts) {
        console.log(
          `🔄 Retrying job ${failedJobRequestId} (attempt ${failedJobRecord.retry_count}/${this.maximumRetryAttempts})`
        );
        failedJobRecord.status = "pending";

        setTimeout(async () => {
          const { publishMessage } = require("./config/queue");
          await publishMessage(process.env.QUEUE_NAME, {
            request_id: failedJobRequestId,
            vendor: failedJobRecord.vendor,
            payload: failedJobRecord.original_payload,
            retry: true,
            retry_count: failedJobRecord.retry_count,
          });
        }, this.retryDelayMilliseconds * failedJobRecord.retry_count);
      } else {
        console.log(
          `❌ Job ${failedJobRequestId} failed permanently after ${failedJobRecord.retry_count} attempts`
        );
        failedJobRecord.status = "failed";
        failedJobRecord.completed_at = new Date();
      }

      await failedJobRecord.save();
    } catch (errorHandlingSaveError) {
      console.error("Error saving job error state:", errorHandlingSaveError);
    }
  }

  async stop() {
    console.log("🛑 Stopping job worker...");
    this.isWorkerRunning = false;

    const activeJobIdsList = Array.from(this.activeJobsMap.keys());
    if (activeJobIdsList.length > 0) {
      console.log(
        `⏳ Waiting for ${activeJobIdsList.length} active jobs to complete...`
      );

      const shutdownTimeoutMilliseconds = 30000;
      const shutdownStartTime = Date.now();

      while (
        this.activeJobsMap.size > 0 &&
        Date.now() - shutdownStartTime < shutdownTimeoutMilliseconds
      ) {
        await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1000));
      }

      if (this.activeJobsMap.size > 0) {
        console.log(
          `⚠️  ${this.activeJobsMap.size} jobs still active after timeout`
        );
      }
    }

    try {
      const { closeConnection } = require("./config/queue");
      await closeConnection();
      console.log("Queue connection closed");

      const mongoose = require("mongoose");
      await mongoose.connection.close();
      console.log("Database connection closed");
    } catch (connectionCloseError) {
      console.error("Error closing connections:", connectionCloseError);
    }

    console.log("✅ Job worker stopped");
  }
}

const jobWorkerInstance = new JobWorker();

const gracefulShutdown = async (shutdownSignal) => {
  console.log(`\nReceived ${shutdownSignal}. Starting graceful shutdown...`);
  await jobWorkerInstance.stop();
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

jobWorkerInstance.start().catch((workerStartupError) => {
  console.error("Failed to start worker:", workerStartupError);
  process.exit(1);
});

module.exports = jobWorkerInstance;
