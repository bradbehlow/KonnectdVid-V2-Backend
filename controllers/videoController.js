import axios from "axios";
import videoModel from "../models/videoModel.js";
import userModel from "../models/userModel.js";
import { fetchThumbnailURL } from "../services/fetchThumbnailURL.js";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { v2 as cloudinary } from "cloudinary";

import dotenv from "dotenv";
dotenv.config();

// ⚙️ Create S3 client
const s3 = new S3Client({
  region: "us-east-2", // Change to your region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Store in .env
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Save a new video
export const saveNewVideo = async (req, res) => {
  try {
    const { title, embeddedLink, shareableLink } = req.body;

    const user = req.user;

    const userData = await userModel.findOne({
      accountId: user.accountId,
      companyId: user.companyId,
      userLocationId: user.userLocationId,
    });

    if (!userData) {
      return res.status(400).send({
        message: "User not found",
      });
    }

    // Delay the fetching of thumbnail URL by 15 seconds
    setTimeout(async () => {
      try {
        const fetchThumbnail = async () => {
          console.log("Fetching thumbnail URL...");
          const response = await fetchThumbnailURL(shareableLink);
          return response;
        };

        console.log("Shareable Link:", shareableLink);
        // Fetch the thumbnail URL after the delay
        const thumbnailURL = await fetchThumbnail();

        console.log("Thumbnail URL:", thumbnailURL);

        // Save the video after fetching the thumbnail
        const video = await videoModel.create({
          creator: userData._id,
          title,
          embeddedLink,
          shareableLink,
          description: "",
          thumbnailURL: thumbnailURL.thumbnail_url, // Use the fetched thumbnail URL
        });

        return res.status(201).send({
          message: "Video saved successfully",
          video,
        });
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }, 5000); // Delay the fetching of thumbnail URL by 2 seconds
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update a video
export const updateVideo = async (req, res) => {
  try {
    const { title, videoId, description } = req.body;

    const video = await videoModel.findByIdAndUpdate(
      videoId,
      { title, description },
      { new: true }
    );

    if (!video) {
      return res.status(404).send({
        message: "Video not found",
      });
    }

    return res.status(200).send({
      message: "Video updated successfully",
      video,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// delete a video
export const deleteVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const user = req.user;

    const userData = await userModel.findOne({
      accountId: user.accountId,
      companyId: user.companyId,
      userLocationId: user.userLocationId,
    });

    if (!userData) {
      return res.status(400).send({
        message: "User not found",
      });
    }

    const videoData = await videoModel.findById(videoId);
    if (!videoData) {
      return res.status(400).send({
        message: "Video not found",
      });
    }

    if (videoData.creator.toString() !== userData._id.toString()) {
      return res.status(400).send({
        message: "You are not authorized to delete this video",
      });
    }

    // Store asset keys before deleting the video document
    const assetsToDelete = {
      videoKey: videoData.videoKey,
      teaserKey: videoData.teaserKey,
      thumbnailKey: videoData.thumbnailKey,
      gifKey: videoData.gifKey,
      playButtonGifKey: videoData.playButtonGifKey,
      captionKey: videoData.captionKey,
      movFileUrl: videoData.movFileUrl,
    };

    // Delete the video document first
    const video = await videoModel.findByIdAndDelete(videoId);

    if (!video) {
      return res.status(400).send({
        message: "Video not found",
      });
    }

    // Delete all associated assets
    await deleteAllVideoAssets(assetsToDelete);

    return res.status(200).send({
      message: "Video and all associated assets deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteVideo:", error);
    res.status(400).json({ message: error.message });
  }
};

// helper function to delete video assets as well

// Helper function to delete from S3
const deleteFromS3 = async (key) => {
  if (!key) return;

  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    });
    await s3.send(command);
    console.log(`Successfully deleted from S3: ${key}`);
  } catch (error) {
    console.error(`Error deleting from S3 (${key}):`, error);
    // Don't throw error, continue with other deletions
  }
};

// Helper function to delete from Cloudinary
const deleteFromCloudinary = async (url) => {
  if (!url) return;

  try {
    // Extract public_id from Cloudinary URL
    const urlParts = url.split("/");
    const fileNameWithExtension = urlParts[urlParts.length - 1];
    const publicId = `converted_videos/${fileNameWithExtension.split(".")[0]}`;

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "video",
    });
    console.log(`Cloudinary deletion result:`, result);
  } catch (error) {
    console.error(`Error deleting from Cloudinary (${url}):`, error);
    // Don't throw error, continue with other deletions
  }
};

// Function to delete all video assets
const deleteAllVideoAssets = async (assets) => {
  const deletionPromises = [];

  // Delete from S3 if keys exist
  if (assets.videoKey) {
    deletionPromises.push(deleteFromS3(assets.videoKey));
  }

  if (assets.teaserKey) {
    deletionPromises.push(deleteFromS3(assets.teaserKey));
  }

  if (assets.thumbnailKey) {
    deletionPromises.push(deleteFromS3(assets.thumbnailKey));
  }

  if (assets.gifKey) {
    deletionPromises.push(deleteFromS3(assets.gifKey));
  }

  if (assets.playButtonGifKey) {
    deletionPromises.push(deleteFromS3(assets.playButtonGifKey));
  }

  if (assets.captionKey) {
    deletionPromises.push(deleteFromS3(assets.captionKey));
  }

  // Delete from Cloudinary if movFileUrl exists and is not empty
  if (assets.movFileUrl && assets.movFileUrl.trim() !== "") {
    deletionPromises.push(deleteFromCloudinary(assets.movFileUrl));
  }

  // Execute all deletions in parallel
  await Promise.allSettled(deletionPromises);
};

// get a video by id
export const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await videoModel.findById(id);

    if (!video) {
      return res.status(400).send({
        message: "Video not found",
      });
    }

    res.status(200).send({
      message: "Video retrieved successfully",
      video,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

//get video viewer data

// ✅ FIX: Get video viewer data (you had req.params instead of req.query)
export const getVideoViewer = async (req, res) => {
  try {
    const { id } = req.query; // ✅ Changed from req.params to req.query

    const video = await videoModel.findById(id); // ✅ Use dynamic id instead of hardcoded

    if (!video) {
      return res.status(400).send({
        message: "Video not found",
      });
    }

    res.status(200).send({
      message: "Video retrieved successfully",
      video,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ✅ NEW: Increment video view count and update watch time
export const incrementVideoView = async (req, res) => {
  try {
    const { videoId, watchTime } = req.body;

    const video = await videoModel.findById(videoId);

    if (!video) {
      return res.status(404).send({
        message: "Video not found",
      });
    }

    // Update fields based on what's provided
    const updates = {};

    // If watchTime is provided, add it to total
    if (watchTime && watchTime > 0) {
      updates.totalWatchTime = (video.totalWatchTime || 0) + watchTime;
      updates.lastViewedAt = new Date();
    }

    // If this is a new view (no watchTime means first 3-second trigger)
    if (!watchTime) {
      updates.viewCount = (video.viewCount || 0) + 1;
      if (!video.firstViewedAt) {
        updates.firstViewedAt = new Date();
      }
      updates.lastViewedAt = new Date();
    }

    // Apply updates
    const updatedVideo = await videoModel.findByIdAndUpdate(videoId, updates, {
      new: true,
    });

    res.status(200).send({
      message: watchTime
        ? "Watch time updated successfully"
        : "View count incremented successfully",
      viewCount: updatedVideo.viewCount,
      totalWatchTime: updatedVideo.totalWatchTime,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//get all videos
export const getAllVideos = async (req, res) => {
  try {
    const videos = await videoModel.find();

    res.status(200).send({
      message: "Videos retrieved successfully",
      videos,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getVideosByAccountId = async (req, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find user data
    const userData = await userModel.findOne({
      accountId: user.accountId,
      companyId: user.companyId,
      userLocationId: user.userLocationId,
    });

    if (!userData) {
      return res.status(400).send({
        message: "User not found",
      });
    }

    // Get recorded videos with pagination
    const recordedVideos = await videoModel
      .find({ creator: userData._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalRecordedVideos = await videoModel.countDocuments({
      creator: userData._id,
    });

    // Get uploaded videos from API
    const options = {
      method: "GET",
      url: "https://services.leadconnectorhq.com/medias/files",
      params: {
        sortBy: "createdAt",
        sortOrder: "desc", // Changed to desc to match recorded videos sorting
        altType: "location",
        type: "file",
        altId: userData.userLocationId,
      },
      headers: {
        Authorization: `Bearer ${userData.accessToken}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    };

    const { data } = await axios.request(options);
    let allUploadedVideos = [];

    if (data && data.files) {
      allUploadedVideos = data.files
        .filter((file) => file.contentType.startsWith("video"))
        .map((file) => ({
          title: file.name,
          description: "",
          embeddedLink: file.url,
          shareableLink: file.url,
          thumbnailURL: "",
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          uploaded: true, // Adding this to match the other function's structure
        }));
    }

    // Apply pagination to uploaded videos (since API doesn't support pagination, we'll do it client-side)
    const totalUploadedVideos = allUploadedVideos.length;
    const uploadedVideos = allUploadedVideos.slice(skip, skip + limit);

    res.status(200).send({
      message: "Videos retrieved successfully",
      recordedVideos,
      uploadedVideos,
      currentPage: page,
      totalPages: {
        recorded: Math.ceil(totalRecordedVideos / limit),
        uploaded: Math.ceil(totalUploadedVideos / limit),
      },
      totalVideos: {
        recorded: totalRecordedVideos,
        uploaded: totalUploadedVideos,
      },
      pagination: {
        recorded: {
          currentPage: page,
          totalPages: Math.ceil(totalRecordedVideos / limit),
          totalVideos: totalRecordedVideos,
        },
        uploaded: {
          currentPage: page,
          totalPages: Math.ceil(totalUploadedVideos / limit),
          totalVideos: totalUploadedVideos,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching videos:", error);
    res.status(400).json({ message: error.message });
  }
};

export const getPresignedUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      return res
        .status(400)
        .json({ message: "fileName and fileType required" });
    }

    const uniqueFileName = `recordings/${uuidv4()}.webm`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: uniqueFileName,
      ContentType: fileType,
    });

    //  Generate URL valid for 5 minutes
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });

    res.status(200).send({
      message: "Presigned Url generated Successfully",
      url,
      key: uniqueFileName, //  helps to store video path later
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Save a new custom video
export const saveCustomNewVideo = async (req, res) => {
  try {
    const { title, key, duration, size } = req.body;

    const user = req.user;

    const userData = await userModel.findOne({
      accountId: user.accountId,
      companyId: user.companyId,
      userLocationId: user.userLocationId,
    });

    if (!userData) {
      return res.status(400).send({
        message: "User not found",
      });
    }

    // Save the video after fetching the thumbnail
    const video = await videoModel.create({
      creator: userData._id,
      title: title,
      videoKey: key,
      duration: duration,
      size: size,
      description: "",
      thumbnailKey: "", // empty for now
      teaserKey: "", // empty for now
      gifKey: "", // empty for now
      eventProcessed: false, // optional since it's default
    });

    return res.status(201).send({
      message: "Video saved successfully",
      video,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateCustomNewVideo = async (req, res) => {
  console.log("🟢 ENTERING updateCustomNewVideo CONTROLLER");

  try {
    const { videoKey, thumbnailKey, gifKey, playButtonGifKey, teaserKey, captionKey } = req.body;
    console.log("📦 Request body received");

    if (!videoKey) {
      console.log("❌ Missing videoKey");
      return res.status(400).json({ message: "videoKey is required" });
    }

    console.log("🔍 Looking for video with key:", videoKey);

    // Build update fields
    const updateFields = {};
    if (thumbnailKey !== undefined) updateFields.thumbnailKey = thumbnailKey;
    if (gifKey !== undefined) updateFields.gifKey = gifKey;
    if (playButtonGifKey !== undefined) updateFields.playButtonGifKey = playButtonGifKey;
    if (teaserKey !== undefined) updateFields.teaserKey = teaserKey;
    if (captionKey !== undefined) {
      updateFields.captionKey = captionKey;
      updateFields.hasCaption = true;
    }

    console.log("📝 Update fields:", updateFields);

    // Check if videoModel exists
    if (!videoModel) {
      console.log("❌ videoModel is undefined!");
      return res.status(500).json({ message: "Database model not available" });
    }

    const video = await videoModel.findOneAndUpdate(
      { videoKey },
      updateFields,
      { new: true }
    );

    console.log("🎯 Database query completed, video found:", !!video);

    if (!video) {
      console.log("❌ Video not found with key:", videoKey);
      return res.status(404).json({ message: "Video not found" });
    }

    // Update eventProcessed
    if (video.thumbnailKey && video.gifKey && video.teaserKey) {
      video.eventProcessed = true;
      await video.save();
      console.log("✅ All assets ready → eventProcessed = true");
    }

    console.log("✅ Final video state:", {
      hasCaption: video.hasCaption,
      eventProcessed: video.eventProcessed,
    });

    return res.status(200).json({
      message: "Video updated successfully",
      video: {
        id: video._id,
        videoKey: video.videoKey,
        thumbnailKey: video.thumbnailKey,
        gifKey: video.gifKey,
        playButtonGifKey: video.playButtonGifKey,
        teaserKey: video.teaserKey,
        captionKey: video.captionKey,
        hasCaption: video.hasCaption,
        eventProcessed: video.eventProcessed,
      },
    });
  } catch (error) {
    console.error("💥 ERROR in updateCustomNewVideo:", error);
    console.error("💥 Error stack:", error.stack);

    // ALWAYS return JSON, never HTML
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// get a video by id
export const getFreshVideoById = async (req, res) => {
  try {
    const { videoKey } = req.query;
    console.log("🔍 Backend searching for video with videoKey:", videoKey);

    const video = await videoModel.findOne({ videoKey });

    if (!video) {
      return res.status(400).send({
        message: "Video not found",
      });
    }

    res.status(200).send({
      message: "Video retrieved successfully",
      video,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// NEW: Increment video share count
export const incrementVideoShare = async (req, res) => {
  try {
    const { videoId, shareCount = 1, shareType } = req.body;

    const video = await videoModel.findById(videoId);

    if (!video) {
      return res.status(404).send({
        message: "Video not found",
      });
    }

    // Update share counts
    const updates = {
      shareCount: (video.shareCount || 0) + shareCount,
    };

    // Update breakdown by type
    if (shareType && ['email', 'sms', 'copy'].includes(shareType)) {
      updates[`shareBreakdown.${shareType}`] = (video.shareBreakdown?.[shareType] || 0) + shareCount;
    }

    const updatedVideo = await videoModel.findByIdAndUpdate(videoId, updates, {
      new: true,
    });

    res.status(200).send({
      message: "Share count updated successfully",
      shareCount: updatedVideo.shareCount,
      shareBreakdown: updatedVideo.shareBreakdown,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get videos by creator ID
export const getVideosByCreator = async (req, res) => {
  try {
    const { creatorId } = req.params;

    const videos = await videoModel.find({ creator: creatorId });

    res.status(200).send({
      message: "Videos retrieved successfully",
      videos,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get caption content for editing
export const getCaptionContent = async (req, res) => {
  try {
    const { videoId } = req.params;
    const user = req.user;

    // Find video
    const video = await videoModel.findById(videoId);
    
    if (!video) {
      return res.status(404).json({ 
        message: "Video not found" 
      });
    }

    // Verify user owns this video
    const userData = await userModel.findOne({
      accountId: user.accountId,
      companyId: user.companyId,
      userLocationId: user.userLocationId,
    });

    if (!userData) {
      return res.status(400).json({ 
        message: "User not found" 
      });
    }

    if (video.creator.toString() !== userData._id.toString()) {
      return res.status(403).json({ 
        message: "You are not authorized to edit this video's captions" 
      });
    }

    // Check if captions exist
    if (!video.captionKey) {
      return res.status(404).json({ 
        message: "No captions available for this video" 
      });
    }

    // Download caption file from S3
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: video.captionKey,
    });

    const response = await s3.send(command);
    
    // Convert stream to string
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const captionText = Buffer.concat(chunks).toString('utf-8');

    return res.status(200).json({
      message: "Caption content retrieved successfully",
      captionContent: captionText,
      captionKey: video.captionKey,
      videoId: video._id,
    });
  } catch (error) {
    console.error("Error getting caption content:", error);
    
    // Handle S3 errors specifically
    if (error.name === 'NoSuchKey') {
      return res.status(404).json({ 
        message: "Caption file not found in storage" 
      });
    }
    
    return res.status(500).json({ 
      message: "Failed to retrieve caption content",
      error: error.message 
    });
  }
};

// Get signed URL to download caption file
export const getCaptionDownloadUrl = async (req, res) => {
  try {
    const { videoId } = req.params;
    const user = req.user;

    const video = await videoModel.findById(videoId);

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
      });
    }

    const userData = await userModel.findOne({
      accountId: user.accountId,
      companyId: user.companyId,
      userLocationId: user.userLocationId,
    });

    if (!userData) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    if (video.creator.toString() !== userData._id.toString()) {
      return res.status(403).json({
        message: "You are not authorized to download this video's captions",
      });
    }

    if (!video.captionKey) {
      return res.status(404).json({
        message: "No captions available for this video",
      });
    }

    const safeTitle = (video.title || "captions")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    const filename = `${safeTitle || "captions"}.vtt`;

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: video.captionKey,
      ResponseContentType: "text/vtt",
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });

    const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return res.status(200).json({
      message: "Caption download URL generated successfully",
      downloadUrl,
      filename,
      videoId: video._id,
    });
  } catch (error) {
    console.error("Error generating caption download URL:", error);
    return res.status(500).json({
      message: "Failed to generate caption download URL",
      error: error.message,
    });
  }
};

// Update caption content
export const updateCaptionContent = async (req, res) => {
  try {
    const { videoId, captionContent } = req.body;
    const user = req.user;

    // Validate input
    if (!videoId || !captionContent) {
      return res.status(400).json({ 
        message: "videoId and captionContent are required" 
      });
    }

    // Validate VTT format (basic check)
    if (!captionContent.trim().startsWith('WEBVTT')) {
      return res.status(400).json({ 
        message: "Invalid VTT format. Must start with 'WEBVTT'" 
      });
    }

    // Find video and verify ownership
    const video = await videoModel.findById(videoId);
    
    if (!video) {
      return res.status(404).json({ 
        message: "Video not found" 
      });
    }

    const userData = await userModel.findOne({
      accountId: user.accountId,
      companyId: user.companyId,
      userLocationId: user.userLocationId,
    });

    if (!userData) {
      return res.status(400).json({ 
        message: "User not found" 
      });
    }

    if (video.creator.toString() !== userData._id.toString()) {
      return res.status(403).json({ 
        message: "You are not authorized to edit this video's captions" 
      });
    }

    // Determine caption key (use existing or create new)
    let captionKey = video.captionKey;
    
    // If no existing caption, create new key
    if (!captionKey) {
      captionKey = `captions/${uuidv4()}.vtt`;
    }

    // Upload updated caption to S3
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: captionKey,
      ContentType: "text/vtt",
      Body: captionContent,
      CacheControl: "max-age=3600", // Cache for 1 hour
    });

    await s3.send(command);

    // Update video record
    video.captionKey = captionKey;
    video.hasCaption = true;
    await video.save();

    return res.status(200).json({
      message: "Captions updated successfully",
      captionKey: captionKey,
      videoId: video._id,
    });
  } catch (error) {
    console.error("Error updating caption content:", error);
    return res.status(500).json({ 
      message: "Failed to update caption content",
      error: error.message 
    });
  }
};
