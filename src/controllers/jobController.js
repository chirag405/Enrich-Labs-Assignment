const { v4: uuidv4 } = require("uuid");
const Job = require("../models/Job");
const { publishMessage } = require("../config/queue");

class JobController {
  /**
   * POST /jobs - Accept any JSON payload and respond with request_id
   */
  static async createJob(httpRequest, httpResponse) {
    try {
      const uniqueRequestId = uuidv4();
      const requestPayload = httpRequest.body;

      // Determine vendor (simple round-robin for demo, could be more sophisticated)
      const selectedVendor = Math.random() < 0.5 ? "sync" : "async";

      // Create job record in MongoDB
      const newJob = new Job({
        request_id: uniqueRequestId,
        vendor: selectedVendor,
        original_payload: requestPayload,
        status: "pending",
      });

      await newJob.save();

      // Publish job to queue for background processing
      await publishMessage(process.env.QUEUE_NAME, {
        request_id: uniqueRequestId,
        vendor: selectedVendor,
        payload: requestPayload,
        created_at: new Date().toISOString(),
      });

      console.log(
        `Job created: ${uniqueRequestId} (vendor: ${selectedVendor})`
      );

      httpResponse.status(201).json({
        request_id: uniqueRequestId,
      });
    } catch (creationError) {
      console.error("Error creating job:", creationError);
      httpResponse.status(500).json({
        error: "Internal server error",
        message: "Failed to create job",
      });
    }
  }

  /**
   * GET /jobs/{request_id} - Get job status and result
   */
  static async getJob(httpRequest, httpResponse) {
    try {
      const requestId = httpRequest.params.request_id;

      if (!requestId) {
        return httpResponse.status(400).json({
          error: "Bad request",
          message: "request_id is required",
        });
      }

      const jobRecord = await Job.findOne({ request_id: requestId });

      if (!jobRecord) {
        return httpResponse.status(404).json({
          error: "Not found",
          message: "Job not found",
        });
      }

      const jobResponse = {
        request_id: requestId,
        status: jobRecord.status,
        vendor: jobRecord.vendor,
        created_at: jobRecord.created_at,
        updated_at: jobRecord.updated_at,
      };

      // Include result if job is complete
      if (jobRecord.status === "complete" && jobRecord.cleaned_data) {
        jobResponse.result = jobRecord.cleaned_data;
        jobResponse.completed_at = jobRecord.completed_at;
      }

      // Include error if job failed
      if (jobRecord.status === "failed" && jobRecord.error_message) {
        jobResponse.error_message = jobRecord.error_message;
        jobResponse.retry_count = jobRecord.retry_count;
      }

      // Add processing info for non-complete jobs
      if (jobRecord.status === "processing") {
        jobResponse.processing_started = jobRecord.updated_at;
      }

      httpResponse.json(jobResponse);
    } catch (retrievalError) {
      console.error("Error getting job:", retrievalError);
      httpResponse.status(500).json({
        error: "Internal server error",
        message: "Failed to retrieve job",
      });
    }
  }

  /**
   * GET /jobs - List jobs with optional filtering and pagination
   */
  static async listJobs(httpRequest, httpResponse) {
    try {
      const currentPage = parseInt(httpRequest.query.page) || 1;
      const itemsPerPage = parseInt(httpRequest.query.limit) || 10;
      const statusFilter = httpRequest.query.status;
      const vendorFilter = httpRequest.query.vendor;

      const queryFilter = {};
      if (statusFilter) queryFilter.status = statusFilter;
      if (vendorFilter) queryFilter.vendor = vendorFilter;

      const skipAmount = (currentPage - 1) * itemsPerPage;

      const jobsList = await Job.find(queryFilter)
        .sort({ created_at: -1 })
        .skip(skipAmount)
        .limit(itemsPerPage)
        .select("request_id status vendor created_at updated_at completed_at");

      const totalJobsCount = await Job.countDocuments(queryFilter);

      httpResponse.json({
        jobs: jobsList,
        pagination: {
          current_page: currentPage,
          total_pages: Math.ceil(totalJobsCount / itemsPerPage),
          total_count: totalJobsCount,
          per_page: itemsPerPage,
        },
      });
    } catch (listingError) {
      console.error("Error listing jobs:", listingError);
      httpResponse.status(500).json({
        error: "Internal server error",
        message: "Failed to list jobs",
      });
    }
  }

  /**
   * POST /vendor-webhook/{vendor} - Handle webhook from async vendors
   */
  static async handleVendorWebhook(httpRequest, httpResponse) {
    try {
      const vendorName = httpRequest.params.vendor;
      const webhookPayload = httpRequest.body;

      console.log(`Received webhook from ${vendorName}:`, webhookPayload);

      if (!webhookPayload.request_id) {
        return httpResponse.status(400).json({
          error: "Bad request",
          message: "request_id is required in webhook payload",
        });
      }

      const targetJob = await Job.findOne({
        request_id: webhookPayload.request_id,
        vendor: "async", // Only async jobs should receive webhooks
      });

      if (!targetJob) {
        console.warn(
          `Webhook received for unknown job: ${webhookPayload.request_id}`
        );
        return httpResponse.status(404).json({
          error: "Not found",
          message: "Job not found",
        });
      }

      // Update job with webhook data
      const DataProcessor = require("../services/dataProcessor");
      const processedWebhookData = DataProcessor.cleanVendorResponse(
        webhookPayload.data,
        "async"
      );

      targetJob.vendor_response = webhookPayload;
      targetJob.cleaned_data = processedWebhookData;
      targetJob.status = webhookPayload.success ? "complete" : "failed";
      targetJob.completed_at = new Date();

      if (!webhookPayload.success && webhookPayload.error) {
        targetJob.error_message = webhookPayload.error;
      }

      await targetJob.save();

      console.log(
        `Job ${webhookPayload.request_id} updated via webhook: ${targetJob.status}`
      );

      httpResponse.json({
        message: "Webhook processed successfully",
        request_id: webhookPayload.request_id,
        status: targetJob.status,
      });
    } catch (webhookProcessingError) {
      console.error("Error processing webhook:", webhookProcessingError);
      httpResponse.status(500).json({
        error: "Internal server error",
        message: "Failed to process webhook",
      });
    }
  }

  /**
   * GET /health - Health check endpoint
   */
  static async healthCheck(httpRequest, httpResponse) {
    try {
      // Check database connectivity
      const totalJobsCount = await Job.countDocuments();

      httpResponse.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        total_jobs: totalJobsCount,
      });
    } catch (healthCheckError) {
      httpResponse.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: healthCheckError.message,
      });
    }
  }
}

module.exports = JobController;
