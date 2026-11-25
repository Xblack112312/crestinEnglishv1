import { Schema, model, models } from "mongoose";

const muxWebhookEventSchema = new Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },

    eventType: {
      type: String,
      required: true,
    },

    muxAssetId: {
      type: String,
      default: null,
    },

    muxUploadId: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["received", "processing", "processed", "failed"],
      default: "received",
      required: true,
    },

    attempts: {
      type: Number,
      min: 0,
      default: 0,
    },

    receivedAt: {
      type: Date,
      default: Date.now,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      maxlength: 1000,
      default: null,
    },
  },
  {
    timestamps: true,
    strict: "throw",
  },
);

muxWebhookEventSchema.index({ eventId: 1 }, { unique: true });

muxWebhookEventSchema.index({
  status: 1,
  receivedAt: 1,
});

const MuxWebhookEvent =
  models.MuxWebhookEvent ||
  model("MuxWebhookEvent", muxWebhookEventSchema);

export default MuxWebhookEvent;