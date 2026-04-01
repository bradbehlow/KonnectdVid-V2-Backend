import dotenv from "dotenv";
import * as jose from "jose";

dotenv.config();
const LOOM_SDK_APP_ID = process.env.LOOM_SDK_APP_ID;
export const loomSDKSetupController = async (_, res) => {
  try {
    const privateKey = process.env.PEM_FILE_KEY.replace(/\\n/g, "\n");

    // Load private key from PEM
    const pk = await jose.importPKCS8(privateKey, "RS256");

    // Construct and sign JWS
    let jws = await new jose.SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setIssuer(LOOM_SDK_APP_ID)
      .setExpirationTime("30s")
      .sign(pk);

    // Write content to client and end the response
    return res.json({ token: jws });
  } catch (error) {
    console.error("Error while setting up Loom SDK: ", error);
    return res.status(500).json({
      message: "An unexpected error occurred",
    });
  }
};
