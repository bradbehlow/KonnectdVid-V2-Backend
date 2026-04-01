// Importing all the required modules
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import * as jose from "jose";
// Importing the routes
import { userRoutes } from "./routes/userRoutes.js";
import { videoRoutes } from "./routes/videoRoutes.js";
import { initiate } from "./GHL/initiate.js";
import { callback } from "./GHL/callback.js";
import { commRoutes } from "./routes/commRoutes.js";
import { automationRoutes } from "./routes/automationRoutes.js";

// Configuring the environment variables
dotenv.config();
import cors from "cors";
const PORT = process.env.PORT;

const LOOM_SDK_APP_ID = process.env.LOOM_SDK_APP_ID;

// Creating the express app
const app = express();

// Using the middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Allow all origins
app.use(cors({ origin: true, credentials: true }));

// Using the routes
app.use("/oauth/callback", callback);
app.use("/api/user", userRoutes);
app.use("/api/comms", commRoutes);
app.use("/init", initiate);
app.use("/api/video", videoRoutes);
app.use("/api/automation", automationRoutes);

// Generate JWT for Loom SDK
app.get("/setup", async (_, res) => {
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
});

// Connecting to the database and starting the server
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("Connected to MongoDB!");
    // Start the server only after successful DB connection
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => console.log("Failed to connect to MongoDB:", err));
