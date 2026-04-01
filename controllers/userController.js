import userModel from "../models/userModel.js";
import historyModel from "../models/historyModel.js";
import { generateToken } from "../services/auth.js";
import CryptoJS from "crypto-js";
import axios from "axios";

export const decryptUserToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res
        .status(400)
        .json({ message: "Token is required for decryption" });
    }

    const ssoDecryptionKey = process.env.SSO_DECRYPTION_KEY;

    let decryptedData = CryptoJS.AES.decrypt(token, ssoDecryptionKey).toString(
      CryptoJS.enc.Utf8
    );

    // console.log("decryptedData", decryptedData);

    if (!decryptedData) {
      return res
        .status(400)
        .json({ message: "Invalid token or decryption failed" });
    }

    decryptedData = JSON.parse(decryptedData);

    if (decryptedData.userId) {
      const user = await userModel.findOne({
        accountId: decryptedData.userId,
        companyId: decryptedData.companyId,
        userLocationId: decryptedData.activeLocation
          ? decryptedData.activeLocation
          : "",
      });

      if (user) {
        user.accountEmail = decryptedData.email;
        await user.save();
        const token = generateToken(user);

        return res.status(200).send({
          message: "User token decrypted successfully",
          user: {
            accountId: user.accountId,
            userLocationId: user.userLocationId,
          },
          accessToken: token,
        });
      } else {
        const user = await userModel.findOne({
          companyId: decryptedData.companyId,
          userLocationId: decryptedData.activeLocation
            ? decryptedData.activeLocation
            : "",
        });

        if (user) {
          const newUserProfile = await userModel.create({
            accountId: decryptedData.userId,
            userLocationId: decryptedData.activeLocation
              ? decryptedData.activeLocation
              : "",
            companyId: decryptedData.companyId,
            domain: user.domain,
            accessToken: user.accessToken,
            refreshToken: user.refreshToken,
            expiryDate: user.expiryDate,
            scope: user.scope,
            showDomainPopup: user.showDomainPopup,
            userCode: user.userCode,
            accountEmail: decryptedData.email,
          });
          console.log("user", newUserProfile);
          const token = generateToken(newUserProfile);

          return res.status(200).send({
            message: "User token decrypted successfully",
            user: {
              accountId: newUserProfile.accountId,
              companyId: newUserProfile.companyId,
              userLocationId: newUserProfile.userLocationId,
            },
            accessToken: token,
          });
        } else {
          /////
          const Agency = await userModel.findOne({
            companyId: decryptedData.companyId,
          });
          console.log("Agency => ", Agency);

          if (!Agency) {
            return res.status(400).send({
              message: "Agency not found",
            });
          }
          // Now get location-specific access token
          try {
            const locationTokenResponse = await axios.post(
              "https://services.leadconnectorhq.com/oauth/locationToken",
              new URLSearchParams({
                companyId: decryptedData.companyId,
                locationId: decryptedData.activeLocation,
              }),
              {
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Accept: "application/json",
                  Version: "2021-07-28",
                  Authorization: `Bearer ${Agency.accessToken}`,
                },
              }
            );

            const locationTokenData = locationTokenResponse.data;
            console.log("Location Token Data => ", locationTokenData);

            // Calculate expiry date (current time + expires_in seconds)
            const expiryDate = new Date();
            expiryDate.setSeconds(
              expiryDate.getSeconds() + locationTokenData.expires_in
            );

            // Create new user with location-specific token
            const newUserProfile = await userModel.create({
              accountId: decryptedData.userId,
              userLocationId: decryptedData.activeLocation,
              companyId: decryptedData.companyId,
              domain: Agency.domain,
              accessToken: locationTokenData.access_token,
              refreshToken: locationTokenData.refresh_token, // Or use location-specific if available
              expiryDate: expiryDate,
              scope: locationTokenData.scope,
              showDomainPopup: Agency.showDomainPopup,
              userCode: Agency.userCode,
              accountEmail: decryptedData.email,
            });

            const token = generateToken(newUserProfile);

            return res.status(200).send({
              message: "User token decrypted successfully with location access",
              user: {
                accountId: newUserProfile.accountId,
                companyId: newUserProfile.companyId,
                userLocationId: newUserProfile.userLocationId,
              },
              accessToken: token,
            });
          } catch (apiError) {
            console.error("Location token API error:", apiError);
            return res.status(400).send({
              message: "Failed to get location access token",
              error: apiError.message,
            });
          }
        }
      }
    } else {
      return res.status(400).send({
        message: "User token is invalid",
      });
    }
  } catch (error) {
    console.log("decryptUserToken error => ", error);
    res.status(400).json({ message: error.message });
  }
};

export const getUserContacts = async (req, res) => {
  try {
    let { page = 1, pageLimit = 10, search } = req.query;
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
    if (search && search !== "" && search.length < 3) {
      return res.status(400).send({
        message: "Search query must be at least 3 characters",
      });
    }

    if (parseInt(page) < 1 || isNaN(parseInt(page))) {
      return res.status(400).send({
        message: "Page must be at least 1 and a Number.",
      });
    }

    if (
      isNaN(parseInt(pageLimit)) ||
      parseInt(pageLimit) < 1 ||
      parseInt(pageLimit) > 100
    ) {
      return res.status(400).send({
        message: "Page limit must be between 1 and 100 and be a Number.",
      });
    }

    page = parseInt(page);
    pageLimit = parseInt(pageLimit);

    let filters =
      search && search !== ""
        ? [
            {
              group: "OR",
              filters: [
                {
                  field: "firstNameLowerCase",
                  operator: "contains",
                  value: search,
                },
                {
                  field: "lastNameLowerCase",
                  operator: "contains",
                  value: search,
                },
                {
                  field: "email",
                  operator: "contains",
                  value: search,
                },
                {
                  field: "phone",
                  operator: "contains",
                  value: search,
                },
              ],
            },
          ]
        : [];

    const options = {
      method: "POST",
      url: "https://services.leadconnectorhq.com/contacts/search",
      headers: {
        Authorization: `Bearer ${userData.accessToken}`,
        Version: process.env.GHL_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      data: {
        locationId: user.userLocationId,
        page: page,
        pageLimit: pageLimit,
        filters: filters,
      },
    };

    const { data } = await axios.request(options);

    return res.status(200).send({
      message: "Contacts retrieved successfully",
      contacts: data,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message });
  }
};

export const getUserHistories = async (req, res) => {
  try {
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

    //Get all histories for all videos of a user
    // const histories = await historyModel.aggregate([
    //   {
    //     $lookup: {
    //       from: "videos", // Collection name for Video
    //       localField: "video", // Field in History referencing Video
    //       foreignField: "_id", // Field in Video being referenced
    //       as: "videoDetails", // Output field for the joined data
    //     },
    //   },
    //   {
    //     $unwind: "$videoDetails", // Flatten the videoDetails array
    //   },
    //   {
    //     $match: {
    //       "videoDetails.creator": userData._id, // Filter by user ID in Video
    //     },
    //   },
    //   {
    //     $addFields: {
    //       videoTitle: "$videoDetails.title", // Add videoName field
    //     },
    //   },
    //   {
    //     $project: {
    //       videoDetails: 0, // Exclude videoDetails field
    //     },
    //   },
    // ]);

    const histories = await historyModel.find({ user: userData._id });

    return res.status(200).send({
      message: "Histories retrieved successfully",
      histories,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message, error });
  }
};

export const getUserTags = async (req, res) => {
  try {
    const user = req.user;
    // console.log(user);
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

    const options = {
      method: "GET",
      url: `https://services.leadconnectorhq.com/locations/${userData.userLocationId}/tags`,
      headers: {
        Authorization: `Bearer ${userData.accessToken}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    };

    const { data } = await axios.request(options);

    return res.status(200).send({
      message: "User tags retrieved successfully",
      userTags: data.tags,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getUserLocationId = async (req, res) => {
  try {
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

    return res.status(200).send({
      message: "User location id retrieved successfully",
      userLocationId: userData.userLocationId,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getUserDomain = async (req, res) => {
  try {
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

    return res.status(200).send({
      message: "User domain retrieved successfully",
      userDomain: userData.domain,
      showDomainPopup: userData.showDomainPopup,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getUserContactsByTags = async (req, res) => {
  try {
    const user = req.user;

    let { tags } = req.query;

    if (!tags) {
      return res.status(400).send({
        message: "Tags not found",
      });
    }

    // Handle tags as JSON string or array
    if (typeof tags === "string") {
      try {
        tags = JSON.parse(tags); // Attempt to parse if it's a JSON string
      } catch {
        tags = tags.split(",").map((tag) => tag.trim()); // Fallback to comma-separated string
      }
    }

    if (!Array.isArray(tags)) {
      return res.status(400).send({
        message: "Tags must be an array or a comma-separated string",
      });
    }

    if (tags.length === 0) {
      return res.status(400).send({
        message: "Tags array cannot be empty",
      });
    }

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

    let filters = [
      {
        group: "OR",
        filters: [
          {
            field: "tags",
            operator: "eq",
            value: tags,
          },
        ],
      },
    ];

    let allContacts = [];
    let page = 1;
    let pageLimit = 100;
    let hasMore = true;

    while (hasMore) {
      const options = {
        method: "POST",
        url: "https://services.leadconnectorhq.com/contacts/search",
        headers: {
          Authorization: `Bearer ${userData.accessToken}`,
          Version: process.env.GHL_API_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        data: {
          locationId: user.userLocationId,
          page: page,
          pageLimit: pageLimit,
          filters: filters,
        },
      };

      const { data } = await axios.request(options);

      if (data.contacts && data.contacts.length > 0) {
        const retrievedContacts = data.contacts.map((contact) => ({
          id: contact.id,
          firstNameLowerCase: contact.firstNameLowerCase,
          lastNameLowerCase: contact.lastNameLowerCase,
          name:
            (contact.firstNameLowerCase || "") +
            " " +
            (contact.lastNameLowerCase || ""),
          email: contact.email,
          phone: contact.phone,
        }));

        allContacts = allContacts.concat(retrievedContacts);
        page * pageLimit >= data.total ? (hasMore = false) : (hasMore = true);
        page++;
      } else {
        hasMore = false;
      }
    }

    return res.status(200).send({
      message: "Contacts retrieved successfully",
      contacts: allContacts,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message });
  }
};

export const getCustomFields = async (req, res) => {
  try {
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

    const options = {
      method: "GET",
      url: `https://services.leadconnectorhq.com/locations/${user.userLocationId}/customFields`,
      headers: {
        Authorization: `Bearer ${userData.accessToken}`,
        Version: process.env.GHL_API_VERSION,
        Accept: "application/json",
      },
      params: { model: "contact" },
    };

    const { data } = await axios.request(options);

    return res.status(200).send({
      message: "Custom fields retrieved successfully",
      customFields: data.customFields,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message });
  }
};

export const updateUserDomain = async (req, res) => {
  try {
    const user = req.user;
    const { domain, showDomainPopup } = req.body;

    if (typeof domain !== "string") {
      return res.status(400).send({
        message: "Domain must be a string",
      });
    }

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

    userData.domain = domain;
    userData.showDomainPopup = showDomainPopup;

    await userData.save();

    return res.status(201).send({
      message: "Domain updated successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message });
  }
};

// ============================================
// NEWLY ADDED: Generate JWT Token from Payload
// ============================================
// This endpoint allows generating JWT tokens directly by providing
// accountId, userLocationId, and companyId without requiring GHL SSO token
// Useful for external integrations (GHL Custom JS, Postman, etc.)
// ============================================
export const generateTokenFromPayload = async (req, res) => {
  try {
    const { accountId, userLocationId, companyId } = req.body;

    // Validate required fields
    if (!accountId || !userLocationId || !companyId) {
      return res.status(400).json({
        message: "accountId, userLocationId, and companyId are required",
        required: ["accountId", "userLocationId", "companyId"],
      });
    }

    // Create payload object (same structure as generateToken function expects)
    const payload = {
      accountId: accountId.trim(),
      userLocationId: userLocationId.trim(),
      companyId: companyId.trim(),
    };

    // Generate token using the same function used in decryptUserToken
    const token = generateToken(payload);

    // Get frontend URL from environment or use default
    const frontendUrl = process.env.FRONTEND_URL || 'https://frontend-sooty-three.vercel.app';

    return res.status(200).json({
      message: "Token generated successfully",
      accessToken: token,
      userLocationId: userLocationId,
      // Return the full URL format for convenience
      recordingUrl: `${frontendUrl}/recordings/${token}/${userLocationId}`,
    });
  } catch (error) {
    console.error("Error generating token:", error);
    return res.status(500).json({
      message: "Failed to generate token",
      error: error.message,
    });
  }
};