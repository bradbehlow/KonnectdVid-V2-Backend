import { Router } from "express";

// Importing Middlewares
import { authenticateToken } from "../middlewares/authenticateToken.js";
import { verifyAccessToken } from "../middlewares/refreshAccessToken.js";
import {
  sendSMSController,
  sendEmailController,
} from "../controllers/commController.js";

export const commRoutes = Router();

commRoutes.post(
  "/sendSMS",
  authenticateToken,
  verifyAccessToken,
  sendSMSController
);
commRoutes.post(
  "/sendEmail",
  authenticateToken,
  verifyAccessToken,
  sendEmailController
);
