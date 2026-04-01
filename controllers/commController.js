import axios from "axios";
import userModel from "../models/userModel.js";
import videoModel from "../models/videoModel.js";
import historyModel from "../models/historyModel.js";
import {
  getAllUserContacts,
  filterContactsByTags,
} from "../services/contactRetrieval.js";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const sendSMSController = async (req, res) => {
  try {
    let {
      videoId,
      videoKey,
      teaserKey,
      gifKey,
      contactIds,
      message,
      sendAttachment,
      uploadedVideoName,
    } = req.body;

    let videoExistsInternally = true;
    let video;

    console.log("Send Attachment:", sendAttachment);

    if (!contactIds || contactIds.length === 0) {
      return res.status(400).send({
        message: "Please provide at least one contact",
      });
    }

    if (videoKey) {
      // New schema - find video by videoKey
      const tempVideo = await videoModel.findOne({ videoKey: videoKey });

      if (!tempVideo) {
        return res.status(400).send({ message: "Video not found" });
      }

      // Only check message if video size > 3MB
      if (tempVideo.size > 3 && (!message || message.trim() === "")) {
        return res.status(400).send({
          message: "Message is required for videos larger than 3MB",
        });
      }
    }

    if (typeof sendAttachment !== "boolean") {
      return res.status(400).send({
        message: "sendAttachment must be a boolean",
      });
    }

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

    // Check if using new schema (videoKey) or old schema (videoId)
    if (videoKey) {
      // New schema - find video by videoKey
      video = await videoModel.findOne({ videoKey: videoKey });
      videoExistsInternally = !!video;
    } else if (videoId && videoId !== "") {
      // Old schema - find video by videoId
      video = await videoModel.findById(videoId);
      videoExistsInternally = !!video;
    } else {
      videoExistsInternally = false;
    }

    if ((videoId || videoKey) && !video) {
      return res.status(400).send({
        message: "Video not found",
      });
    }

    // UPDATED: Handle attachments based on schema and size
    let videoAttachmentUrl = null;

    if (sendAttachment && videoExistsInternally) {
      if (videoKey) {
        // NEW SCHEMA LOGIC
        if (video.size > 3) {
          // Size > 3MB: Send GIF as attachment
          if (gifKey) {
            videoAttachmentUrl = `https://d27zhkbo74exx9.cloudfront.net/${gifKey}`;
            console.log(
              "📱 Sending GIF attachment (size > 3MB):",
              videoAttachmentUrl
            );
          }
        } else {
          // Size <= 3MB: Convert and send video as MOV
          if (video.movFileUrl) {
            // Use existing MOV URL
            videoAttachmentUrl = video.movFileUrl;
            console.log("🎥 Using existing MOV file:", videoAttachmentUrl);
          } else {
            try {
              console.log(
                `Video size is ${video.size}MB (≤3MB), converting to MOV...`
              );

              const webmUrl = `https://d27zhkbo74exx9.cloudfront.net/${video.videoKey}`;

              const cloudinaryResult = await cloudinary.uploader.upload(
                webmUrl,
                {
                  resource_type: "video",
                  format: "mov",
                  folder: "converted_videos",
                  overwrite: true,
                }
              );

              videoAttachmentUrl = cloudinaryResult.secure_url;
              video.movFileUrl = videoAttachmentUrl;
              await video.save();

              console.log("✅ WEBM converted to MOV:", videoAttachmentUrl);
            } catch (conversionError) {
              console.error("❌ Error converting video:", conversionError);
              // Fallback to GIF if conversion fails
              if (gifKey) {
                videoAttachmentUrl = `https://d27zhkbo74exx9.cloudfront.net/${gifKey}`;
                console.log("🔄 Fallback to GIF:", videoAttachmentUrl);
              }
            }
          }
        }
      } else {
        // OLD SCHEMA: Use thumbnail
        const thumbnailUrl = video.thumbnailURL;
        if (thumbnailUrl) {
          videoAttachmentUrl = thumbnailUrl;
          console.log("🖼️ Sending thumbnail attachment (old schema)");
        }
      }
    }

    // Helper function to create a delay
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let results = [];
    for (let i = 0; i < contactIds.length; i += 100) {
      const batch = contactIds.slice(i, i + 100);

      // Process the current batch
      const batchResults = await Promise.all(
        batch.map(async (contact) => {
          try {
            let messageForContact = message + "";
            console.log(`Sending SMS to: ${contact.id}`);

            const payload = {
              type: "SMS",
              contactId: contact.id,
              message: messageForContact,
            };

            // Add attachment if available
            if (videoAttachmentUrl) {
              payload.attachments = [videoAttachmentUrl];
              console.log(`➕ Added attachment: ${videoAttachmentUrl}`);
            }

            console.log("Payload:---------------------->", payload);

            const response = await axios.post(
              "https://services.leadconnectorhq.com/conversations/messages",
              payload,
              {
                headers: {
                  Authorization: `Bearer ${userData.accessToken}`,
                  Version: "2021-04-15",
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
              }
            );

            const smsHistoryData = {
              user: userData.id,
              contactName: `${contact.firstNameLowerCase} ${contact.lastNameLowerCase}`,
              contactAddress: contact.phone,
              sendType: "sms",
              subject: "",
              status: "sent",
              uploadedVideoName: videoExistsInternally
                ? video.title
                : uploadedVideoName,
            };

            if (videoExistsInternally) {
              smsHistoryData.video = video._id;
              smsHistoryData.videoKey = videoKey || video.videoKey;
            }

            const smsHistory = await historyModel.create(smsHistoryData);

            return {
              contactId: contact.id,
              data: smsHistory,
              videoName: videoExistsInternally
                ? video.title
                : uploadedVideoName,
            };
          } catch (err) {
            const smsHistoryData = {
              user: userData.id,
              contactName: `${contact.firstNameLowerCase} ${contact.lastNameLowerCase}`,
              contactAddress: contact.phone,
              sendType: "sms",
              subject: "",
              status: "failed",
              uploadedVideoName: videoExistsInternally
                ? video.title
                : uploadedVideoName,
            };

            if (videoExistsInternally) {
              smsHistoryData.video = video._id;
              smsHistoryData.videoKey = videoKey || video.videoKey;
            }

            const smsHistory = await historyModel.create(smsHistoryData);

            console.error(
              `Failed to send SMS to ${contact.id}:`,
              err.response?.data || err.message
            );
            return {
              contactId: contact.id,
              data: smsHistory,
              videoName: videoExistsInternally
                ? video.title
                : uploadedVideoName,
            };
          }
        })
      );

      results = results.concat(batchResults);

      // Wait 10 seconds before processing the next batch
      if (i + 100 < contactIds.length) {
        console.log("Waiting 10 seconds before sending the next batch...");
        await delay(10000);
      }
    }

    const failedSMS = results.filter((result) => result.status === "error");
    if (failedSMS.length > 0) {
      return res.status(207).send({
        message: "Some SMS failed to send",
        details: results,
      });
    }

    return res.status(200).send({
      message: "All SMS sent successfully",
      data: results,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
// export const sendSMSController = async (req, res) => {
//   try {
//     let {
//       videoId,
//       videoKey,
//       teaserKey,
//       gifKey,
//       contactIds,
//       message,
//       sendAttachment,
//       uploadedVideoName,
//     } = req.body;

//     let videoExistsInternally = true;
//     let video;

//     console.log("Send Attachment:", sendAttachment);

//     if (!contactIds || contactIds.length === 0) {
//       return res.status(400).send({
//         message: "Please provide at least one contact",
//       });
//     }
//     if (videoKey) {
//       // New schema - find video by videoKey
//       const tempVideo = await videoModel.findOne({ videoKey: videoKey });

//       if (!tempVideo) {
//         return res.status(400).send({ message: "Video not found" });
//       }

//       // Only check message if video size > 3MB
//       if (tempVideo.size > 3 && (!message || message.trim() === "")) {
//         return res.status(400).send({
//           message: "Message is required for videos larger than 3MB",
//         });
//       }
//     }

//     if (typeof sendAttachment !== "boolean") {
//       return res.status(400).send({
//         message: "sendAttachment must be a boolean",
//       });
//     }

//     const user = req.user;

//     const userData = await userModel.findOne({
//       accountId: user.accountId,
//       companyId: user.companyId,
//       userLocationId: user.userLocationId,
//     });

//     if (!userData) {
//       return res.status(400).send({
//         message: "User not found",
//       });
//     }

//     // Check if using new schema (videoKey) or old schema (videoId)
//     if (videoKey) {
//       // New schema - find video by videoKey
//       video = await videoModel.findOne({ videoKey: videoKey });
//       videoExistsInternally = !!video;
//     } else if (videoId && videoId !== "") {
//       // Old schema - find video by videoId
//       video = await videoModel.findById(videoId);
//       videoExistsInternally = !!video;
//     } else {
//       videoExistsInternally = false;
//     }

//     if ((videoId || videoKey) && !video) {
//       return res.status(400).send({
//         message: "Video not found",
//       });
//     }

//     // NEW: Check video size and convert if needed
//     let videoAttachmentUrl = null;

//     if (sendAttachment && videoExistsInternally && video.size <= 3) {
//       // Check if movFileUrl already exists
//       if (video.movFileUrl) {
//         // Use existing MOV URL
//         videoAttachmentUrl = video.movFileUrl;
//         console.log("✅ Using existing MOV file:", videoAttachmentUrl);
//       } else {
//         try {
//           console.log(
//             `Video size is ${video.size}MB (<3MB), converting to MOV...`
//           );

//           // Convert WEBM to MOV using Cloudinary
//           const webmUrl = `https://d27zhkbo74exx9.cloudfront.net/${video.videoKey}`;

//           const cloudinaryResult = await cloudinary.uploader.upload(webmUrl, {
//             resource_type: "video",
//             format: "mov",
//             folder: "converted_videos",
//             overwrite: true,
//           });

//           videoAttachmentUrl = cloudinaryResult.secure_url;

//           // Update movFileUrl in database
//           video.movFileUrl = videoAttachmentUrl;
//           await video.save();

//           console.log("✅ WEBM converted to MOV:", videoAttachmentUrl);
//         } catch (conversionError) {
//           console.error("❌ Error converting video:", conversionError);
//           // If conversion fails, fall back to thumbnail
//           videoAttachmentUrl = null;
//         }
//       }
//     }

//     // Helper function to create a delay
//     const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//     let results = [];
//     for (let i = 0; i < contactIds.length; i += 100) {
//       const batch = contactIds.slice(i, i + 100);

//       // Process the current batch
//       const batchResults = await Promise.all(
//         batch.map(async (contact) => {
//           try {
//             let messageForContact = message + "";
//             console.log(`Sending SMS to: ${contact.id}`);

//             const payload = {
//               type: "SMS",
//               contactId: contact.id,
//               message: messageForContact,
//             };

//             // UPDATED: Handle attachments based on size and schema
//             if (sendAttachment && videoExistsInternally) {
//               if (video.size <= 3 && videoAttachmentUrl) {
//                 // Send converted MOV file (small video)
//                 payload.attachments = [videoAttachmentUrl];
//                 console.log("Sending MOV video attachment (size < 3MB)");
//               } else {
//                 // Send thumbnail only if NOT using new schema OR video size is less than 3MB
//                 if (!videoKey || video.size <= 3) {
//                   const thumbnailUrl = videoKey
//                     ? `https://d27zhkbo74exx9.cloudfront.net/${video.gifKey}`
//                     : video.thumbnailURL;

//                   if (thumbnailUrl) {
//                     payload.attachments = [thumbnailUrl];
//                     console.log("Sending thumbnail attachment");
//                   }
//                 } else {
//                   console.log(
//                     "Skipping thumbnail attachment (new schema & size ≥ 3MB)"
//                   );
//                 }
//               }
//             }
//             console.log("Payload:---------------------->", payload);

//             const response = await axios.post(
//               "https://services.leadconnectorhq.com/conversations/messages",
//               payload,
//               {
//                 headers: {
//                   Authorization: `Bearer ${userData.accessToken}`,
//                   Version: "2021-04-15",
//                   "Content-Type": "application/json",
//                   Accept: "application/json",
//                 },
//               }
//             );

//             const smsHistoryData = {
//               user: userData.id,
//               contactName: `${contact.firstNameLowerCase} ${contact.lastNameLowerCase}`,
//               contactAddress: contact.phone,
//               sendType: "sms",
//               subject: "",
//               status: "sent",
//               uploadedVideoName: videoExistsInternally
//                 ? video.title
//                 : uploadedVideoName,
//             };

//             if (videoExistsInternally) {
//               // Store both videoId and videoKey for future reference
//               smsHistoryData.video = video._id;
//               smsHistoryData.videoKey = videoKey || video.videoKey;
//             }

//             const smsHistory = await historyModel.create(smsHistoryData);

//             return {
//               contactId: contact.id,
//               data: smsHistory,
//               videoName: videoExistsInternally
//                 ? video.title
//                 : uploadedVideoName,
//             };
//           } catch (err) {
//             const smsHistoryData = {
//               user: userData.id,
//               contactName: `${contact.firstNameLowerCase} ${contact.lastNameLowerCase}`,
//               contactAddress: contact.phone,
//               sendType: "sms",
//               subject: "",
//               status: "failed",
//               uploadedVideoName: videoExistsInternally
//                 ? video.title
//                 : uploadedVideoName,
//             };

//             if (videoExistsInternally) {
//               smsHistoryData.video = video._id;
//               smsHistoryData.videoKey = videoKey || video.videoKey;
//             }

//             const smsHistory = await historyModel.create(smsHistoryData);

//             console.error(
//               `Failed to send SMS to ${contact.id}:`,
//               err.response?.data || err.message
//             );
//             return {
//               contactId: contact.id,
//               data: smsHistory,
//               videoName: videoExistsInternally
//                 ? video.title
//                 : uploadedVideoName,
//             };
//           }
//         })
//       );

//       results = results.concat(batchResults);

//       // Wait 10 seconds before processing the next batch
//       if (i + 100 < contactIds.length) {
//         console.log("Waiting 10 seconds before sending the next batch...");
//         await delay(10000);
//       }
//     }

//     const failedSMS = results.filter((result) => result.status === "error");
//     if (failedSMS.length > 0) {
//       return res.status(207).send({
//         message: "Some SMS failed to send",
//         details: results,
//       });
//     }

//     return res.status(200).send({
//       message: "All SMS sent successfully",
//       data: results,
//     });
//   } catch (error) {
//     console.error("Unexpected error:", error);
//     return res
//       .status(500)
//       .json({ message: "Internal server error", error: error.message });
//   }
// };
export const sendEmailController = async (req, res) => {
  try {
    let {
      videoId,
      videoKey,
      teaserKey,
      gifKey,
      contactIds,
      message,
      subject = "Konected - Loom Video",
      uploadedVideoName,
    } = req.body;

    let videoExistsInternally = true;
    let video;

    if (!contactIds || contactIds.length === 0) {
      return res.status(400).send({
        message: "Please provide at least one contact",
      });
    }

    if (!message) {
      return res.status(400).send({
        message: "Message is required",
      });
    }

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

    // Check if using new schema (videoKey) or old schema (videoId)
    if (videoKey) {
      // New schema - find video by videoKey
      video = await videoModel.findOne({ videoKey: videoKey });
      videoExistsInternally = !!video;
    } else if (videoId && videoId !== "") {
      // Old schema - find video by videoId
      video = await videoModel.findById(videoId);
      videoExistsInternally = !!video;
    } else {
      videoExistsInternally = false;
    }

    if ((videoId || videoKey) && !video) {
      return res.status(400).send({
        message: "Video not found",
      });
    }

    // Helper function to create a delay
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let results = [];
    for (let i = 0; i < contactIds.length; i += 100) {
      const batch = contactIds.slice(i, i + 100);

      // Process the current batch
      const batchResults = await Promise.all(
        batch.map(async (contact) => {
          try {
            let messageForContact = message + "";
            console.log(`Sending email to: ${contact.id}`);

            const payload = {
              type: "Email",
              contactId: contact.id,
              subject: subject,
              html: messageForContact,
            };

            // Only add emailFrom if accountEmail is truthy and not an empty string
            if (userData.accountEmail) {
              payload.emailFrom = userData.accountEmail;
            }

            const response = await axios.post(
              "https://services.leadconnectorhq.com/conversations/messages",
              payload,
              {
                headers: {
                  Authorization: `Bearer ${userData.accessToken}`,
                  Version: "2021-04-15",
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
              }
            );

            const emailHistoryData = {
              user: userData._id,
              contactName: `${contact.firstNameLowerCase} ${contact.lastNameLowerCase}`,
              contactAddress: contact.email,
              sendType: "email",
              subject: subject,
              status: "sent",
              uploadedVideoName: videoExistsInternally
                ? video.title
                : uploadedVideoName,
            };

            if (videoExistsInternally) {
              // Store both videoId and videoKey for future reference
              emailHistoryData.video = video._id;
              emailHistoryData.videoKey = videoKey || video.videoKey;
            }

            const emailHistory = await historyModel.create(emailHistoryData);

            return {
              contactId: contact.id,
              data: emailHistory,
              videoName: videoExistsInternally
                ? video.title
                : uploadedVideoName,
            };
          } catch (err) {
            const emailHistoryData = {
              user: userData._id,
              contactName: `${contact.firstNameLowerCase} ${contact.lastNameLowerCase}`,
              contactAddress: contact.email,
              sendType: "email",
              subject: subject,
              status: "sent",
              uploadedVideoName: videoExistsInternally
                ? video.title
                : uploadedVideoName,
            };

            if (videoExistsInternally) {
              emailHistoryData.video = video._id;
              emailHistoryData.videoKey = videoKey || video.videoKey;
            }

            const emailHistory = await historyModel.create(emailHistoryData);

            console.error(
              `Failed to send email to ${contact.id}:`,
              err.response?.data || err.message
            );
            return {
              contactId: contact.id,
              data: emailHistory,
              videoName: videoExistsInternally
                ? video.title
                : uploadedVideoName,
            };
          }
        })
      );

      results = results.concat(batchResults);

      // Wait 10 seconds before processing the next batch
      if (i + 100 < contactIds.length) {
        console.log("Waiting 10 seconds before sending the next batch...");
        await delay(10000);
      }
    }

    const failedEmails = results.filter((result) => result.status === "error");
    if (failedEmails.length > 0) {
      return res.status(207).send({
        message: "Some emails failed to send",
        details: results,
      });
    }

    return res.status(200).send({
      message: "All emails sent successfully",
      data: results,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
