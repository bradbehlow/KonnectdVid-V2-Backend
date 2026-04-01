import { Schema, model } from "mongoose";
import { randomBytes, createHmac } from "crypto";
import { generateToken } from "../services/auth.js";

const userSchema = new Schema(
  {
    accountId: {
      type: String,
      required: true,
    },

    companyId: {
      type: String,
      required: true,
    },

    userLocationId: {
      type: String,
      required: true,
    },

    userCode: {
      type: String,
      required: true,
    },

    accountEmail: {
      type: String,
    },

    accountPhone: {
      type: String,
    },

    accessToken: {
      type: String,
    },

    refreshToken: {
      type: String,
    },

    expiryDate: {
      type: Date,
    },

    scope: {
      type: String,
    },

    domain: {
      type: String,
      default: "",
    },

    showDomainPopup: {
      type: Boolean,
      default: false,
    },

  },
  { timestamps: true }
);

export default model("User", userSchema);
