import { Schema, model } from "mongoose";

const videoSchema = new Schema(
  {
    creator: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },

    videoKey: {
      type: String,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    duration: {
      type: String,
    },
    size: {
      type: Number, // size in MB
    },
    movFileUrl: {
      type: String,
      default: "",
    },
    teaserKey: {
      type: String,
    },
    thumbnailKey: {
      type: String,
    },

    gifKey: {
      type: String,
    },
    playButtonGifKey: {
      type: String,
    },
    captionKey: {
      type: String,
    },
    hasCaption: {
      type: Boolean,
      default: false,
    },
    eventProcessed: {
      type: Boolean,
      default: false, // means processing not completed yet
    },

    firstViewedAt: {
      type: Date,
      default: null,
    },

    // NEW FIELDS
    lastViewedAt: {
      type: Date,
      default: null,
    },
    shareCount: {
      type: Number,
      default: 0,
    },
    shareBreakdown: {
      email: { type: Number, default: 0 },
      sms: { type: Number, default: 0 },
      copy: { type: Number, default: 0 },
    },
    totalWatchTime: {
      type: Number,
      default: 0, // in seconds
    },
  },
  { timestamps: true }
);

export default model("Video", videoSchema);
