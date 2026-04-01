import { Router } from "express";
import {
  decryptUserToken,
  getUserContacts,
  getUserHistories,
  getUserTags,
  getUserLocationId,
  getUserDomain,
  getUserContactsByTags,
  getCustomFields,
  updateUserDomain,
  generateTokenFromPayload, // NEWLY ADDED: Import for token generation endpoint
} from "../controllers/userController.js";

export const userRoutes = Router();

// Importing Middlewares
import { authenticateToken } from "../middlewares/authenticateToken.js";
import { verifyAccessToken } from "../middlewares/refreshAccessToken.js";

//Get User Data from GHL Key
userRoutes.post("/decryptUserToken", decryptUserToken);

// ============================================
// NEWLY ADDED: Generate JWT Token from Payload
// ============================================
// POST /api/user/generateToken
// Generates JWT token directly from accountId, userLocationId, companyId
// No authentication required (it generates the auth token)
// Body: { accountId, userLocationId, companyId }
// ============================================
userRoutes.post("/generateToken", generateTokenFromPayload);

//Get User Contacts
userRoutes.get(
  "/getUserContacts",
  authenticateToken,
  verifyAccessToken,
  getUserContacts
);

//Get User Histories
userRoutes.get("/getUserHistories", authenticateToken, getUserHistories);

//Get User Tags
userRoutes.get(
  "/getUserTags",
  authenticateToken,
  verifyAccessToken,
  getUserTags
);

//Get User Location Id
userRoutes.get("/getUserLocationId", authenticateToken, getUserLocationId);

//Get User Domain
userRoutes.get(
  "/getUserDomain",
  authenticateToken,
  verifyAccessToken,
  getUserDomain
);

//Get User Contacts by Tags
userRoutes.get(
  "/getUserContactsByTags",
  authenticateToken,
  verifyAccessToken,
  getUserContactsByTags
);

// Get Custom Fields of User
userRoutes.get(
  "/getUserCustomFields",
  authenticateToken,
  verifyAccessToken,
  getCustomFields
);

// Update User Domain
userRoutes.patch(
  "/updateUserDomain",
  authenticateToken,
  verifyAccessToken,
  updateUserDomain
);
