import { Router } from "express";
import { loomSDKSetupController } from "./../controllers/loomSDKController";

export const loomSDKRoutes = Router();

loomSDKRoutes.get("/setup", loomSDKSetupController);
