import userModel from "../models/userModel.js";
import axios from "axios";
import { URLSearchParams } from "url";

export const verifyAccessToken = async (req, res, next) => {
  try {
    const user = req.user;

    const userData = await userModel.findOne({
      accountId: user.accountId,
      userLocationId: user.userLocationId,
      companyId: user.companyId,
    });
    if (!userData) {
      return res.status(400).send({
        message: "User not found",
      });
    }

    console.log("User Data:", userData);

    //Check if token is expired
    if (userData.expiryDate < Date.now()) {
      const encodedParams = new URLSearchParams();
      encodedParams.set("client_id", process.env.GHL_CLIENT_ID);
      encodedParams.set("client_secret", process.env.GHL_CLIENT_SECRET);
      encodedParams.set("grant_type", "refresh_token");
      encodedParams.set("refresh_token", userData.refreshToken);

      const options = {
        method: "POST",
        url: "https://services.leadconnectorhq.com/oauth/token",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        data: encodedParams,
      };

      const { data } = await axios.request(options);
      console.log(data);

      var newexpiryDate = new Date();
      newexpiryDate.setSeconds(
        newexpiryDate.getSeconds() + (data.expires_in - 60)
      );

      userData.accessToken = data.access_token;
      userData.refreshToken = data.refresh_token;
      userData.expiryDate = newexpiryDate;
      userData.scope = data.scope;

      await userData.save();

      await userModel.updateMany(
        { companyId: user.companyId, userLocationId: user.userLocationId },
        {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiryDate: newexpiryDate,
          scope: data.scope,
        }
      );
    }
  } catch (error) {
    console.error("Error in verifyAccessToken middleware:", error);
    return res.status(400).json({ message: error.message });
  }

  next();
};
