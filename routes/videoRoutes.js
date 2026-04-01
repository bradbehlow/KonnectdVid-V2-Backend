import { Router } from "express";
import {
  saveNewVideo,
  updateVideo,
  deleteVideo,
  getVideosByAccountId,
  getAllVideos,
  getVideoById,
  getPresignedUrl,
  saveCustomNewVideo,
  updateCustomNewVideo,
  getFreshVideoById,
  getVideoViewer,
  incrementVideoView,
  incrementVideoShare,
  getVideosByCreator,
  getCaptionContent,
  getCaptionDownloadUrl,
  updateCaptionContent,
} from "../controllers/videoController.js";

//middlewares
import { authenticateToken } from "../middlewares/authenticateToken.js";
import { verifyAccessToken } from "../middlewares/refreshAccessToken.js";

export const videoRoutes = Router();

//Save a new video
videoRoutes.post("/saveNewVideo", authenticateToken, saveNewVideo);

//Update a video
videoRoutes.put("/updateVideo", authenticateToken, updateVideo);

//Delete a video
videoRoutes.delete("/deleteVideo/:videoId", authenticateToken, deleteVideo);

//Get all videos by account id
videoRoutes.get(
  "/getVideosByAccountId",
  authenticateToken,
  verifyAccessToken,
  getVideosByAccountId
);

//Get all videos
videoRoutes.get("/getAllVideos", authenticateToken, getAllVideos);

//Get video by id
videoRoutes.get("/getVideoById/:id", authenticateToken, getVideoById);

//get presisgned url for video upload to aws
videoRoutes.post("/getSignedUrl", getPresignedUrl);

//Save a new custom video
videoRoutes.post("/saveCustomNewVideo", authenticateToken, saveCustomNewVideo);

videoRoutes.post("/updateCustomNewVideo", updateCustomNewVideo);

//get fresh video data by id
videoRoutes.get("/getFreshVideoById", authenticateToken, getFreshVideoById);

// Existing route
videoRoutes.get("/getVideoViewerData", getVideoViewer);

// ✅ ADD THIS NEW ROUTE
videoRoutes.post("/incrementView", incrementVideoView);

// NEW: Add share tracking route
videoRoutes.post("/incrementShare", incrementVideoShare);

// NEW: Get videos by creator ID
videoRoutes.get("/getVideosByCreator/:creatorId", getVideosByCreator);

// Get caption content for editing
videoRoutes.get(
  "/getCaptionContent/:videoId",
  authenticateToken,
  verifyAccessToken,
  getCaptionContent
);

// Get signed download URL for caption file
videoRoutes.get(
  "/getCaptionDownloadUrl/:videoId",
  authenticateToken,
  verifyAccessToken,
  getCaptionDownloadUrl
);

// Update caption content
videoRoutes.post(
  "/updateCaptionContent",
  authenticateToken,
  verifyAccessToken,
  updateCaptionContent
);
