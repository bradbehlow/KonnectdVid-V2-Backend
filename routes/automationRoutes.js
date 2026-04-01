import { Router } from "express";
import { refreshAllGHLAccessTokens } from "../services/tokenRefresh.js";

export const automationRoutes = Router();

automationRoutes.patch("/refreshAllGHLAccessTokens", refreshAllGHLAccessTokens);
