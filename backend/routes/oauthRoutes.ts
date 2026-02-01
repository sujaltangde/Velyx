import express from "express";
import {
  getConnectionStatus,
  initiateGoogleOAuth,
  handleGoogleCallback,
  initiateNotionOAuth,
  handleNotionCallback,
  initiateHubspotOAuth,
  handleHubspotCallback,
  disconnectGmail,
  disconnectNotion,
  disconnectHubspot,
} from "../controllers/oauthController";
import { authenticate } from "../middlewares/auth";

const router = express.Router();

router.get("/connection-status", authenticate, getConnectionStatus);

// Google OAuth routes
router.get("/google/initiate", authenticate, initiateGoogleOAuth);
router.get("/google/callback", handleGoogleCallback);
router.delete("/google/disconnect", authenticate, disconnectGmail);

// Notion OAuth routes
router.get("/notion/initiate", authenticate, initiateNotionOAuth);
router.get("/notion/callback", handleNotionCallback);
router.delete("/notion/disconnect", authenticate, disconnectNotion);

// HubSpot OAuth routes
router.get("/hubspot/initiate", authenticate, initiateHubspotOAuth);
router.get("/hubspot/callback", handleHubspotCallback);
router.delete("/hubspot/disconnect", authenticate, disconnectHubspot);

export default router;

