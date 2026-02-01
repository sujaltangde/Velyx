import { google } from "googleapis";
import moment from "moment";
import { AppDataSource } from "../data-source";
import { OAuthAccount } from "../entities/OAuthAccount";
import { GmailSyncLog } from "../entities/GmailSyncLog";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { OpenAIEmbeddings } from "@langchain/openai";

const oauthRepository = AppDataSource.getRepository(OAuthAccount);
const syncLogRepository = AppDataSource.getRepository(GmailSyncLog);

// Initialize OpenAI embeddings (lazy - only connects when used)
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-ada-002", // 1536 dimensions
});

// Lazy initialization for Milvus client to avoid connection at module load
let milvusClient: MilvusClient | null = null;

function getMilvusClient(): MilvusClient {
  if (!milvusClient) {
    let address = process.env.MILVUS_ADDRESS || "in03-e3d59000ddbccb2.serverless.aws-eu-central-1.cloud.zilliz.com";
    address = address.replace(/^https?:\/\//, "");

    milvusClient = new MilvusClient({
      address,
      token: `${process.env.MILVUS_USER}:${process.env.MILVUS_PASSWORD}`,
      ssl: true,
    });
  }
  return milvusClient;
}

const COLLECTION_NAME = "Gmail";

/**
 * Creates a Google OAuth2 client with the user's tokens
 */
function createOAuth2Client(accessToken: string, refreshToken: string | null) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

/**
 * Refreshes the Google access token using the refresh token
 */
async function refreshGoogleToken(googleAccount: OAuthAccount): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  if (!googleAccount.refreshToken) {
    throw new Error("No refresh token available. User needs to re-authenticate.");
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({
    refresh_token: googleAccount.refreshToken,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  googleAccount.accessToken = credentials.access_token || googleAccount.accessToken;
  if (credentials.refresh_token) {
    googleAccount.refreshToken = credentials.refresh_token;
  }
  if (credentials.expiry_date) {
    googleAccount.tokenExpiresAt = new Date(credentials.expiry_date);
  }

  await oauthRepository.save(googleAccount);

  return googleAccount.accessToken;
}

/**
 * Cleans and extracts only meaningful text from email content
 */
function cleanEmailContent(rawContent: string): string {
  let content = rawContent;

  // Remove HTML tags
  content = content.replace(/<[^>]*>/g, " ");

  // Remove URLs (http, https, ftp)
  content = content.replace(/(?:https?|ftp):\/\/[^\s\)\]\>]+/gi, "");

  // Remove markdown-style links like ( http://... ) or [text](url)
  content = content.replace(/\([^)]*https?:\/\/[^)]*\)/gi, "");
  content = content.replace(/\[[^\]]*\]\([^)]*\)/gi, "");

  // Remove email addresses
  content = content.replace(/[\w.-]+@[\w.-]+\.\w+/gi, "");

  // Remove tracking parameters and UTM codes
  content = content.replace(/\?utm_[^\s]*/gi, "");

  // Remove lines that are just dashes, asterisks, or equals signs (separators)
  content = content.replace(/^[-=*_]{3,}$/gm, "");

  // Remove lines that contain only special characters
  content = content.replace(/^[\s*#\-=_©®™]+$/gm, "");

  // Remove common footer/unsubscribe text patterns
  content = content.replace(/unsubscribe|opt.?out|manage.*preferences|notification.*settings|edit.*settings/gi, "");

  // Remove "View in browser" type links
  content = content.replace(/view.*in.*browser|click.*here|learn.*more/gi, "");

  // Remove copyright notices
  content = content.replace(/©\s*\d{4}[^.\n]*/gi, "");

  // Normalize whitespace
  content = content
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/\t/g, " ") // Replace tabs with spaces
    .replace(/ {2,}/g, " ") // Multiple spaces to single space
    .replace(/\n{3,}/g, "\n\n") // Multiple newlines to double newline
    .replace(/^\s+$/gm, "") // Remove lines with only whitespace
    .trim();

  // Remove empty parentheses and brackets that remain after URL removal
  content = content.replace(/\(\s*\)/g, "");
  content = content.replace(/\[\s*\]/g, "");

  // Final cleanup - remove any remaining excessive whitespace
  content = content.replace(/\n{3,}/g, "\n\n").trim();

  return content;
}

/**
 * Extracts plain text from email payload
 */
function extractEmailContent(payload: any): string {
  let content = "";

  if (payload.body?.data) {
    // Decode base64url encoded content
    content = Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        content += Buffer.from(part.body.data, "base64url").toString("utf-8");
      } else if (part.mimeType === "multipart/alternative" && part.parts) {
        // Recursively handle nested parts
        content += extractEmailContent(part);
      }
    }
  }

  // Clean and extract only meaningful text
  return cleanEmailContent(content);
}

/**
 * Gets email header value by name
 */
function getHeader(headers: any[], name: string): string {
  const header = headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || "";
}

/**
 * Checks if an email has already been synced
 */
async function isEmailSynced(userId: string, emailId: string): Promise<boolean> {
  const existingLog = await syncLogRepository.findOne({
    where: {
      userId,
      emailId,
    },
  });
  return !!existingLog;
}

/**
 * Records a synced email in the database
 */
async function recordSyncedEmail(
  userId: string,
  emailId: string,
  sender: string,
  subject: string,
  receivedAt: Date
): Promise<void> {
  const syncLog = syncLogRepository.create({
    userId,
    emailId,
    sender: sender.substring(0, 256),
    subject: subject.substring(0, 512),
    receivedAt,
  });
  await syncLogRepository.save(syncLog);
}

/**
 * Stores an email in Zilliz vector database
 */
async function storeEmailInZilliz(
  userId: string,
  emailId: string,
  sender: string,
  subject: string,
  content: string
): Promise<void> {
  // Generate embedding for subject + content
  const textForEmbedding = `${subject}\n\n${content}`;
  const embeddingVector = await embeddings.embedQuery(textForEmbedding);

  // Prepare data for insertion
  const data = {
    user_id: userId.substring(0, 64),
    email_id: emailId.substring(0, 128),
    sender: sender.substring(0, 256),
    subject: subject.substring(0, 512),
    content: content.substring(0, 10000),
    embedding: embeddingVector,
  };

  // Insert into Zilliz
  try {
    const insertResult = await getMilvusClient().insert({
      collection_name: COLLECTION_NAME,
      data: [data],
    });
    console.log(`Inserted email: ${subject.substring(0, 50)}...`);
  } catch (error: any) {
    console.error(`Error inserting email "${subject}":`, error.message);
    throw error;
  }
}

/**
 * Fetches and ingests Gmail emails from the last 5 days
 * @param userId - The user ID to fetch emails for
 * @param forceSync - If true, bypasses the duplicate check and re-syncs all emails
 */
export async function ingestGmailEmails(userId: string, forceSync: boolean = false): Promise<void> {
  try {
    // Get the Google OAuth credentials for this user
    const googleAccount = await oauthRepository.findOne({
      where: {
        userId,
        provider: "google",
      },
    });

    if (!googleAccount) {
      console.log("Google account not connected for user:", userId);
      return;
    }

    let accessToken = googleAccount.accessToken;

    // Check if token is expired
    const now = moment();
    const expiresAt = googleAccount.tokenExpiresAt
      ? moment(googleAccount.tokenExpiresAt)
      : null;

    if (expiresAt && now.isAfter(expiresAt.subtract(5, "minutes"))) {
      accessToken = await refreshGoogleToken(googleAccount);
    }

    // Create OAuth2 client
    const oauth2Client = createOAuth2Client(accessToken, googleAccount.refreshToken);

    // Create Gmail API client
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Calculate the date 5 days ago
    const fiveDaysAgo = moment().subtract(5, "days").format("YYYY/MM/DD");

    console.log("\n=== Processing Gmail Emails from Last 5 Days ===");
    console.log(`User ID: ${userId}`);
    console.log(`Date range: ${fiveDaysAgo} to now`);

    // Fetch email list from Gmail
    let allMessages: any[] = [];
    let pageToken: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const listParams: any = {
        userId: "me",
        q: `after:${fiveDaysAgo}`,
        maxResults: 100,
      };
      
      if (pageToken) {
        listParams.pageToken = pageToken;
      }

      const response = await gmail.users.messages.list(listParams);

      if (response.data.messages) {
        allMessages.push(...response.data.messages);
      }
      
      pageToken = response.data.nextPageToken || null;
      hasMore = !!pageToken;
    }

    console.log(`Total emails found: ${allMessages.length}`);

    let processedCount = 0;
    let skippedCount = 0;

    // Process each email
    for (const message of allMessages) {
      const emailId = message.id;

      // Check if email was already synced (skip if not force sync)
      if (!forceSync) {
        const alreadySynced = await isEmailSynced(userId, emailId);
        if (alreadySynced) {
          skippedCount++;
          continue;
        }
      }

      try {
        // Fetch full email details
        const emailResponse = await gmail.users.messages.get({
          userId: "me",
          id: emailId,
          format: "full",
        });

        const email = emailResponse.data;
        const headers = email.payload?.headers || [];

        const subject = getHeader(headers, "Subject") || "(No Subject)";
        const sender = getHeader(headers, "From") || "Unknown";
        const dateStr = getHeader(headers, "Date");
        const receivedAt = dateStr ? new Date(dateStr) : new Date();

        // Extract email content
        const content = extractEmailContent(email.payload);

        if (!content || content.trim().length === 0) {
          console.log(`Email "${subject.substring(0, 30)}..." has no content, skipping...`);
          skippedCount++;
          continue;
        }

        console.log(`\n--- Processing: ${subject.substring(0, 50)}... ---`);
        console.log(`From: ${sender.substring(0, 50)}`);
        console.log(`Content length: ${content.length} characters`);

        // Store in Zilliz
        await storeEmailInZilliz(userId, emailId, sender, subject, content);

        // Record in sync log
        await recordSyncedEmail(userId, emailId, sender, subject, receivedAt);

        processedCount++;

        // Add a small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));

      } catch (emailError: any) {
        console.error(`Error processing email ${emailId}:`, emailError.message);
        skippedCount++;
      }
    }

    console.log("\n=== Gmail Pipeline Complete ===");
    console.log(`Total emails found: ${allMessages.length}`);
    console.log(`Emails processed (new): ${processedCount}`);
    console.log(`Emails skipped (already synced or no content): ${skippedCount}`);
    console.log("================================\n");

  } catch (error: any) {
    if (error.response?.status === 401) {
      console.error("Gmail authentication failed. User may need to reconnect their Google account.");
      console.error("Error details:", error.response?.data);
    } else {
      console.error("Error in Gmail pipeline:", error.response?.data || error.message);
    }
  }
}

/**
 * Deletes all Gmail data from the vector database for a specific user
 * Also clears the sync log entries
 * @param userId - The user ID to delete data for
 */
export async function deleteUserGmailData(userId: string): Promise<void> {
  try {
    console.log(`\n=== Deleting Gmail Data for User: ${userId} ===`);

    // Delete from Zilliz vector database
    try {
      const deleteResult = await getMilvusClient().delete({
        collection_name: COLLECTION_NAME,
        filter: `user_id == "${userId}"`,
      });
      console.log(`Deleted vectors from Zilliz Gmail collection`);
    } catch (error: any) {
      console.log(`No Gmail vectors to delete or collection doesn't exist:`, error.message);
    }

    // Delete from sync log table
    const deleteLogResult = await syncLogRepository.delete({ userId });
    console.log(`Deleted ${deleteLogResult.affected || 0} entries from Gmail sync log`);

    console.log(`=== Gmail Data Deletion Complete ===\n`);
  } catch (error: any) {
    console.error("Error deleting Gmail data:", error.message);
    throw error;
  }
}
