import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { OAuthAccount } from "../entities/OAuthAccount";
import { AppError, asyncHandler } from "../middlewares/errorHandler";
import { google } from "googleapis";
import moment from "moment";
import { ingestAllNotionPages, deleteUserNotionData } from "../data/notionPipeline";
import { ingestGmailEmails, deleteUserGmailData } from "../data/gmailPipeline";

const oauthRepository = AppDataSource.getRepository(OAuthAccount);

// Google OAuth2 Client Configuration
function getGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export const getConnectionStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Find all OAuth accounts for this user
    const oauthAccounts = await oauthRepository.find({
      where: { userId },
      select: ["provider", "createdAt"],
    });

    // Check which providers are connected
    const googleConnected = oauthAccounts.some(
      (account) => account.provider === "google"
    );
    const notionConnected = oauthAccounts.some(
      (account) => account.provider === "notion"
    );
    const hubspotConnected = oauthAccounts.some(
      (account) => account.provider === "hubspot"
    );

    res.status(200).json({
      success: true,
      data: {
        google: googleConnected,
        notion: notionConnected,
        hubspot: hubspotConnected,
      },
    });
  }
);

// Initiate Google OAuth flow
export const initiateGoogleOAuth = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }

    // Check if credentials are configured
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId === 'not-configured') {
      throw new AppError(
        "Google OAuth is not configured. Please contact the administrator to set up Google integration.",
        503
      );
    }

    const oauth2Client = getGoogleOAuthClient();

    // Generate the URL for Google OAuth consent screen
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Request refresh token
      scope: [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/gmail.readonly", // Read Gmail messages
      ],
      state: userId, // Pass userId in state to retrieve it in callback
      prompt: "consent", // Force consent screen to get refresh token
    });

    res.status(200).json({
      success: true,
      authUrl,
    });
  }
);

// Handle Google OAuth callback
export const handleGoogleCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      throw new AppError("Authorization code missing", 400);
    }

    if (!state || typeof state !== "string") {
      throw new AppError("State parameter missing", 400);
    }

    const userId = state; // userId passed in state parameter

    const oauth2Client = getGoogleOAuthClient();

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new AppError("Failed to obtain access token", 500);
    }

    // Get user info from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const googleUserId = userInfo.data.id;
    if (!googleUserId) {
      throw new AppError("Failed to get Google user ID", 500);
    }

    // Check if this Google account is already connected
    const existing = await oauthRepository.findOne({
      where: {
        userId,
        provider: "google",
      },
    });

    const tokenExpiresAt = tokens.expiry_date
      ? moment(tokens.expiry_date).toDate()
      : null;

    if (existing) {
      // Update existing connection
      existing.accessToken = tokens.access_token;
      existing.refreshToken = tokens.refresh_token || existing.refreshToken;
      existing.tokenExpiresAt = tokenExpiresAt;
      existing.scopes = tokens.scope || "";
      existing.rawProfile = userInfo.data;
      await oauthRepository.save(existing);
    } else {
      // Create new connection
      const oauthAccount = oauthRepository.create({
        userId,
        provider: "google",
        providerAccountId: googleUserId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        tokenExpiresAt,
        scopes: tokens.scope || "",
        rawProfile: userInfo.data,
      });
      await oauthRepository.save(oauthAccount);
    }

    // Run Gmail ingestion in background (don't await - let it run async)
    ingestGmailEmails(userId).catch((error) => {
      console.error("Background Gmail ingestion failed:", error.message);
    });

    // Redirect back to frontend with success
    const frontendUrl = process.env.FRONTEND_URL ;
    res.redirect(`${frontendUrl}/oauth/callback?provider=google&success=true`);
  }
);

// Initiate Notion OAuth flow
export const initiateNotionOAuth = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }

    const clientId = process.env.NOTION_CLIENT_ID;
    const redirectUri = process.env.NOTION_REDIRECT_URI

    if (!clientId || clientId === 'not-configured') {
      throw new AppError(
        "Notion OAuth is not configured. Please contact the administrator to set up Notion integration.",
        503
      );
    }

    // Generate the URL for Notion OAuth
    const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri as string)}&state=${userId}`;

    res.status(200).json({
      success: true,
      authUrl,
    });
  }
);

// Handle Notion OAuth callback
export const handleNotionCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      throw new AppError("Authorization code missing", 400);
    }

    if (!state || typeof state !== "string") {
      throw new AppError("State parameter missing", 400);
    }

    const userId = state;

    const clientId = process.env.NOTION_CLIENT_ID;
    const clientSecret = process.env.NOTION_CLIENT_SECRET;
    const redirectUri = process.env.NOTION_REDIRECT_URI

    if (!clientId || !clientSecret) {
      throw new AppError("Notion OAuth not configured", 500);
    }

    // Exchange code for access token
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    
    const axios = require("axios");
    const tokenResponse = await axios.post(
      "https://api.notion.com/v1/oauth/token",
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { access_token, bot_id, workspace_id, owner, refresh_token } = tokenResponse.data;

    if (!access_token) {
      throw new AppError("Failed to obtain access token", 500);
    }

    // Check if this Notion workspace is already connected
    const existing = await oauthRepository.findOne({
      where: {
        userId,
        provider: "notion",
      },
    });

    if (existing) {
      // Update existing connection
      existing.accessToken = access_token;
      existing.rawProfile = tokenResponse.data;
      await oauthRepository.save(existing);
    } else {
      // Create new connection
      const oauthAccount = oauthRepository.create({
        userId,
        provider: "notion",
        providerAccountId: workspace_id || bot_id || owner?.user?.id || "unknown",
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: null, // Notion tokens don't expire
        scopes: "",
        rawProfile: tokenResponse.data,
      });
      await oauthRepository.save(oauthAccount);
    }

    // Run data ingestion in background (don't await - let it run async)
    ingestAllNotionPages(userId).catch((error) => {
      console.error("Background Notion ingestion failed:", error.message);
    });

    // Redirect back to frontend with success
    const frontendUrl = process.env.FRONTEND_URL ;
    res.redirect(`${frontendUrl}/oauth/callback?provider=notion&success=true`);
  }
);

// Initiate HubSpot OAuth flow
export const initiateHubspotOAuth = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI

    if (!clientId || clientId === 'not-configured') {
      throw new AppError(
        "HubSpot OAuth is not configured. Please contact the administrator to set up HubSpot integration.",
        503
      );
    }

    // HubSpot OAuth scopes - must match exactly what's configured in HubSpot app
    const scopes = [
      "oauth",
      "crm.objects.contacts.read",
    ].join(" ");

    // Generate the URL for HubSpot OAuth
    const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri as string)}&scope=${encodeURIComponent(scopes)}&state=${userId}`;

    res.status(200).json({
      success: true,
      authUrl,
    });
  }
);

// Handle HubSpot OAuth callback
export const handleHubspotCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      throw new AppError("Authorization code missing", 400);
    }

    if (!state || typeof state !== "string") {
      throw new AppError("State parameter missing", 400);
    }

    const userId = state;

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI

    if (!clientId || !clientSecret) {
      throw new AppError("HubSpot OAuth not configured", 500);
    }

    const axios = require("axios");

    // Exchange code for access token (HubSpot requires x-www-form-urlencoded)
    const tokenResponse = await axios.post(
      "https://api.hubapi.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret as string,
        redirect_uri: redirectUri as string,
        code,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      throw new AppError("Failed to obtain access token", 500);
    }

    // Get HubSpot account info
    const accountInfoResponse = await axios.get(
      "https://api.hubapi.com/oauth/v1/access-tokens/" + access_token
    );

    const hubspotUserId = accountInfoResponse.data.user_id || accountInfoResponse.data.hub_id;

    // Calculate token expiration time
    const tokenExpiresAt = expires_in
      ? moment().add(expires_in, "seconds").toDate()
      : null;

    // Check if this HubSpot account is already connected
    const existing = await oauthRepository.findOne({
      where: {
        userId,
        provider: "hubspot",
      },
    });

    if (existing) {
      // Update existing connection
      existing.accessToken = access_token;
      existing.refreshToken = refresh_token || existing.refreshToken;
      existing.tokenExpiresAt = tokenExpiresAt;
      existing.rawProfile = accountInfoResponse.data;
      await oauthRepository.save(existing);
    } else {
      // Create new connection
      const oauthAccount = oauthRepository.create({
        userId,
        provider: "hubspot",
        providerAccountId: String(hubspotUserId) || "unknown",
        accessToken: access_token,
        refreshToken: refresh_token || null,
        tokenExpiresAt,
        scopes: tokenResponse.data.scope || "",
        rawProfile: accountInfoResponse.data,
      });
      await oauthRepository.save(oauthAccount);
    }

    // Redirect back to frontend with success
    const frontendUrl = process.env.FRONTEND_URL ;
    res.redirect(`${frontendUrl}/oauth/callback?provider=hubspot&success=true`);
  }
);

// Disconnect Gmail - removes OAuth details and deletes data from vector DB
export const disconnectGmail = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }

    // Check if Google account is connected
    const googleAccount = await oauthRepository.findOne({
      where: {
        userId,
        provider: "google",
      },
    });

    if (!googleAccount) {
      throw new AppError("Google account not connected", 404);
    }

    // Delete data from vector database and sync log
    await deleteUserGmailData(userId);

    // Delete OAuth account
    await oauthRepository.remove(googleAccount);

    console.log(`Disconnected Gmail for user: ${userId}`);

    res.status(200).json({
      success: true,
      message: "Gmail disconnected successfully",
    });
  }
);

// Disconnect Notion - removes OAuth details and deletes data from vector DB
export const disconnectNotion = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }

    // Check if Notion account is connected
    const notionAccount = await oauthRepository.findOne({
      where: {
        userId,
        provider: "notion",
      },
    });

    if (!notionAccount) {
      throw new AppError("Notion account not connected", 404);
    }

    // Delete data from vector database and sync log
    await deleteUserNotionData(userId);

    // Delete OAuth account
    await oauthRepository.remove(notionAccount);

    console.log(`Disconnected Notion for user: ${userId}`);

    res.status(200).json({
      success: true,
      message: "Notion disconnected successfully",
    });
  }
);

// Disconnect HubSpot - removes OAuth details only (no vector DB data)
export const disconnectHubspot = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId;

    if (!userId) {
      throw new AppError("Unauthorized", 401);
    }

    // Check if HubSpot account is connected
    const hubspotAccount = await oauthRepository.findOne({
      where: {
        userId,
        provider: "hubspot",
      },
    });

    if (!hubspotAccount) {
      throw new AppError("HubSpot account not connected", 404);
    }

    // Delete OAuth account
    await oauthRepository.remove(hubspotAccount);

    console.log(`Disconnected HubSpot for user: ${userId}`);

    res.status(200).json({
      success: true,
      message: "HubSpot disconnected successfully",
    });
  }
);

