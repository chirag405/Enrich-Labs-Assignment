const Joi = require("joi");

/**
 * Middleware to validate request body for job creation
 */
const validateJobPayload = (httpRequest, httpResponse, nextMiddleware) => {
  // Accept any valid JSON payload - very permissive
  if (!httpRequest.body || typeof httpRequest.body !== "object") {
    return httpResponse.status(400).json({
      error: "Bad request",
      message: "Request body must be a valid JSON object",
    });
  }

  // Reject empty objects
  if (Object.keys(httpRequest.body).length === 0) {
    return httpResponse.status(400).json({
      error: "Bad request",
      message: "Request body cannot be empty",
    });
  }

  nextMiddleware();
};

/**
 * Middleware to validate UUID format for request_id
 */
const validateRequestId = (httpRequest, httpResponse, nextMiddleware) => {
  const validationSchema = Joi.object({
    request_id: Joi.string().uuid().required(),
  });

  const { error: validationError } = validationSchema.validate(
    httpRequest.params
  );
  if (validationError) {
    return httpResponse.status(400).json({
      error: "Bad request",
      message: "Invalid request_id format. Must be a valid UUID.",
    });
  }

  nextMiddleware();
};

/**
 * Middleware to validate query parameters for job listing
 */
const validateJobQuery = (httpRequest, httpResponse, nextMiddleware) => {
  const validationSchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string()
      .valid("pending", "processing", "complete", "failed")
      .optional(),
    vendor: Joi.string().valid("sync", "async").optional(),
  });

  const { error: validationError } = validationSchema.validate(
    httpRequest.query
  );
  if (validationError) {
    return httpResponse.status(400).json({
      error: "Bad request",
      message: validationError.details[0].message,
    });
  }

  nextMiddleware();
};

/**
 * Middleware to validate webhook payload
 */
const validateWebhookPayload = (httpRequest, httpResponse, nextMiddleware) => {
  const validationSchema = Joi.object({
    request_id: Joi.string().uuid().required(),
    success: Joi.boolean().required(),
    data: Joi.object().optional(),
    error: Joi.string().optional(),
    timestamp: Joi.string().isoDate().optional(),
    vendor_id: Joi.string().optional(),
  });

  const { error: validationError } = validationSchema.validate(
    httpRequest.body
  );
  if (validationError) {
    return httpResponse.status(400).json({
      error: "Bad request",
      message: validationError.details[0].message,
    });
  }

  nextMiddleware();
};

/**
 * General error handler middleware
 */
const errorHandler = (
  applicationError,
  httpRequest,
  httpResponse,
  nextMiddleware
) => {
  console.error("Error:", applicationError);

  // Mongoose validation error
  if (applicationError.name === "ValidationError") {
    const validationErrors = Object.values(applicationError.errors).map(
      (errorDetail) => errorDetail.message
    );
    return httpResponse.status(400).json({
      error: "Validation error",
      message: validationErrors.join(", "),
    });
  }

  // Mongoose duplicate key error
  if (applicationError.code === 11000) {
    return httpResponse.status(409).json({
      error: "Conflict",
      message: "Resource already exists",
    });
  }

  // Default error
  httpResponse.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? applicationError.message
        : "Something went wrong",
  });
};

/**
 * Request logging middleware
 */
const requestLogger = (httpRequest, httpResponse, nextMiddleware) => {
  const requestStartTime = Date.now();

  httpResponse.on("finish", () => {
    const requestDuration = Date.now() - requestStartTime;
    console.log(
      `${httpRequest.method} ${httpRequest.path} - ${httpResponse.statusCode} - ${requestDuration}ms`
    );
  });

  nextMiddleware();
};

module.exports = {
  validateJobPayload,
  validateRequestId,
  validateJobQuery,
  validateWebhookPayload,
  errorHandler,
  requestLogger,
};
