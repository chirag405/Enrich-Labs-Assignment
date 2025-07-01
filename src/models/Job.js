const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    request_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "complete", "failed"],
      default: "pending",
      index: true,
    },
    vendor: {
      type: String,
      enum: ["sync", "async"],
      required: true,
    },
    original_payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    vendor_response: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    cleaned_data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    error_message: {
      type: String,
      default: null,
    },
    retry_count: {
      type: Number,
      default: 0,
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
    completed_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Index for efficient querying
jobSchema.index({ status: 1, created_at: 1 });
jobSchema.index({ vendor: 1, status: 1 });

module.exports = mongoose.model("Job", jobSchema);
