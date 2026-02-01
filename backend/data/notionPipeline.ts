import axios from "axios";
import moment from "moment";
import { AppDataSource } from "../data-source";
import { OAuthAccount } from "../entities/OAuthAccount";
import { NotionSyncLog } from "../entities/NotionSyncLog";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const oauthRepository = AppDataSource.getRepository(OAuthAccount);
const syncLogRepository = AppDataSource.getRepository(NotionSyncLog);

// Initialize OpenAI embeddings (lazy - only connects when used)
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-ada-002", // 1536 dimensions
});

// Lazy initialization for Milvus client to avoid connection at module load
let milvusClient: MilvusClient | null = null;

function getMilvusClient(): MilvusClient {
  if (!milvusClient) {
    // Remove https:// prefix if present - Zilliz uses gRPC which needs just hostname
    let address = process.env.MILVUS_ADDRESS || "in03-e3d59000ddbccb2.serverless.aws-eu-central-1.cloud.zilliz.com";
    address = address.replace(/^https?:\/\//, "");
    
    milvusClient = new MilvusClient({
      address,
      token: `${process.env.MILVUS_USER}:${process.env.MILVUS_PASSWORD}`,
      ssl: true, // Required for Zilliz Cloud serverless
    });
  }
  return milvusClient;
}

const COLLECTION_NAME = "Notion";

// Text splitter for chunking content
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

/**
 * Refreshes the Notion access token using the refresh token
 */
async function refreshNotionToken(notionAccount: OAuthAccount): Promise<string> {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Notion OAuth credentials not configured");
  }

  if (!notionAccount.refreshToken) {
    return notionAccount.accessToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenResponse = await axios.post(
    "https://api.notion.com/v1/oauth/token",
    {
      grant_type: "refresh_token",
      refresh_token: notionAccount.refreshToken,
    },
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
    }
  );

  const { access_token, refresh_token, expires_in } = tokenResponse.data;

  notionAccount.accessToken = access_token;
  if (refresh_token) {
    notionAccount.refreshToken = refresh_token;
  }
  if (expires_in) {
    notionAccount.tokenExpiresAt = moment().add(expires_in, "seconds").toDate();
  }

  await oauthRepository.save(notionAccount);

  return access_token;
}

/**
 * Extracts text content from Notion block
 */
function extractTextFromBlock(block: any): string {
  const blockType = block.type;
  const blockContent = block[blockType];

  if (!blockContent) return "";

  // Handle rich text blocks
  if (blockContent.rich_text) {
    return blockContent.rich_text.map((rt: any) => rt.plain_text || "").join("");
  }

  // Handle specific block types
  switch (blockType) {
    case "paragraph":
    case "heading_1":
    case "heading_2":
    case "heading_3":
    case "bulleted_list_item":
    case "numbered_list_item":
    case "toggle":
    case "quote":
    case "callout":
      return blockContent.rich_text?.map((rt: any) => rt.plain_text || "").join("") || "";
    case "code":
      const codeText = blockContent.rich_text?.map((rt: any) => rt.plain_text || "").join("") || "";
      return `\`\`\`${blockContent.language || ""}\n${codeText}\n\`\`\``;
    case "to_do":
      const todoText = blockContent.rich_text?.map((rt: any) => rt.plain_text || "").join("") || "";
      return `[${blockContent.checked ? "x" : " "}] ${todoText}`;
    case "child_page":
      return `[Page: ${blockContent.title || "Untitled"}]`;
    case "child_database":
      return `[Database: ${blockContent.title || "Untitled"}]`;
    case "image":
    case "video":
    case "file":
    case "pdf":
      return `[${blockType}: ${blockContent.caption?.map((c: any) => c.plain_text).join("") || blockType}]`;
    case "bookmark":
    case "link_preview":
      return `[Link: ${blockContent.url || ""}]`;
    case "table":
      return "[Table]";
    case "divider":
      return "---";
    default:
      return "";
  }
}

/**
 * Fetches all blocks (content) from a Notion page recursively
 */
async function fetchPageContent(pageId: string, accessToken: string): Promise<string> {
  const blocks: string[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  try {
    while (hasMore) {
      const response: { data: { results: any[]; has_more: boolean; next_cursor: string | null } } = await axios.get(
        `https://api.notion.com/v1/blocks/${pageId}/children`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          params: cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 },
        }
      );

      const results = response.data.results || [];

      for (const block of results) {
        const text = extractTextFromBlock(block);
        if (text) {
          blocks.push(text);
        }

        // Recursively fetch children if block has children
        if (block.has_children && block.type !== "child_page" && block.type !== "child_database") {
          const childContent = await fetchPageContent(block.id, accessToken);
          if (childContent) {
            blocks.push(childContent);
          }
        }
      }

      hasMore = response.data.has_more;
      cursor = response.data.next_cursor || undefined;
    }

    return blocks.join("\n\n");
  } catch (error: any) {
    console.error(`Error fetching content for page ${pageId}:`, error.response?.data || error.message);
    return "";
  }
}

/**
 * Gets the title from a Notion page
 */
function getPageTitle(page: any): string {
  let title = "Untitled";

  if (page.properties?.title?.title?.[0]?.plain_text) {
    title = page.properties.title.title[0].plain_text;
  } else if (page.properties?.Name?.title?.[0]?.plain_text) {
    title = page.properties.Name.title[0].plain_text;
  } else if (page.properties) {
    for (const key of Object.keys(page.properties)) {
      const prop = page.properties[key];
      if (prop.type === "title" && prop.title?.[0]?.plain_text) {
        title = prop.title[0].plain_text;
        break;
      }
    }
  }

  return title;
}

/**
 * Checks if a page needs to be synced based on last_edited_time
 */
async function shouldSyncPage(
  userId: string,
  pageId: string,
  lastEditedTime: Date
): Promise<boolean> {
  const existingLog = await syncLogRepository.findOne({
    where: {
      userId,
      pageId,
    },
  });

  if (!existingLog) {
    // Page has never been synced
    return true;
  }

  // Check if the page has been edited since last sync
  const existingLastEdited = moment(existingLog.lastEditedTime);
  const newLastEdited = moment(lastEditedTime);

  return newLastEdited.isAfter(existingLastEdited);
}

/**
 * Updates or creates the sync log for a page
 */
async function updateSyncLog(
  userId: string,
  pageId: string,
  pageTitle: string,
  lastEditedTime: Date,
  chunkCount: number
): Promise<void> {
  let syncLog = await syncLogRepository.findOne({
    where: {
      userId,
      pageId,
    },
  });

  if (syncLog) {
    // Update existing log
    syncLog.pageTitle = pageTitle;
    syncLog.lastEditedTime = lastEditedTime;
    syncLog.chunkCount = chunkCount;
  } else {
    // Create new log
    syncLog = syncLogRepository.create({
      userId,
      pageId,
      pageTitle,
      lastEditedTime,
      chunkCount,
    });
  }

  await syncLogRepository.save(syncLog);
}

/**
 * Stores chunks in Zilliz vector database
 */
async function storeChunksInZilliz(
  userId: string,
  pageId: string,
  pageTitle: string,
  chunks: string[]
): Promise<void> {
  if (chunks.length === 0) {
    console.log(`No chunks to store for page: ${pageTitle}`);
    return;
  }

  // Delete existing chunks for this page (to handle updates)
  try {
    await getMilvusClient().delete({
      collection_name: COLLECTION_NAME,
      filter: `page_id == "${pageId}"`,
    });
    console.log(`Deleted existing chunks for page: ${pageTitle}`);
  } catch (error: any) {
    // Collection might not exist or no matching records
    console.log(`No existing chunks to delete for page: ${pageTitle}`);
  }

  // Generate embeddings for all chunks
  // Combine page_title + content for embedding as per requirement
  const textsForEmbedding = chunks.map((chunk) => `${pageTitle}\n\n${chunk}`);

  console.log(`Generating embeddings for ${chunks.length} chunks...`);
  const embeddingVectors = await embeddings.embedDocuments(textsForEmbedding);

  // Prepare data for insertion
  const data = chunks.map((chunk, index) => ({
    user_id: userId.substring(0, 64), // Ensure max length
    page_id: pageId.substring(0, 128),
    page_title: pageTitle.substring(0, 512),
    chunk_index: index,
    content: chunk.substring(0, 10000),
    embedding: embeddingVectors[index],
  }));

  // Insert into Zilliz
  try {
    const insertResult = await getMilvusClient().insert({
      collection_name: COLLECTION_NAME,
      data: data,
    });

    console.log(`Inserted ${insertResult.insert_cnt} chunks for page: ${pageTitle}`);
  } catch (error: any) {
    console.error(`Error inserting chunks for page ${pageTitle}:`, error.message);
    throw error;
  }
}

/**
 * Fetches all Notion pages for a user and stores them in Zilliz vector database
 * (only processes pages that have changed since last sync)
 * @param userId - The user ID to fetch pages for
 * @param forceSync - If true, bypasses the change detection and re-syncs all pages
 */
export async function ingestAllNotionPages(userId: string, forceSync: boolean = false): Promise<void> {
  try {
    // Get the Notion OAuth credentials for this user
    const notionAccount = await oauthRepository.findOne({
      where: {
        userId,
        provider: "notion",
      },
    });

    if (!notionAccount) {
      console.log("Notion account not connected for user:", userId);
      return;
    }

    let accessToken = notionAccount.accessToken;

    // Check if token is expired
    const now = moment();
    const expiresAt = notionAccount.tokenExpiresAt
      ? moment(notionAccount.tokenExpiresAt)
      : null;

    if (expiresAt && now.isAfter(expiresAt.subtract(5, "minutes"))) {
      accessToken = await refreshNotionToken(notionAccount);
    }

    // Fetch all pages from Notion using the Search API (with pagination)
    const allPages: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    while (hasMore) {
      const response: { data: { results: any[]; has_more: boolean; next_cursor: string | null } } = await axios.post(
        "https://api.notion.com/v1/search",
        {
          filter: {
            property: "object",
            value: "page",
          },
          sort: {
            direction: "descending",
            timestamp: "last_edited_time",
          },
          page_size: 100,
          ...(nextCursor && { start_cursor: nextCursor }),
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
        }
      );

      allPages.push(...(response.data.results || []));
      hasMore = response.data.has_more;
      nextCursor = response.data.next_cursor || undefined;
    }

    console.log("\n=== Processing All Notion Pages ===");
    console.log(`User ID: ${userId}`);
    console.log(`Total pages found: ${allPages.length}`);

    let processedCount = 0;
    let skippedCount = 0;

    // Process each page
    for (const page of allPages) {
      const pageId = page.id;
      const pageTitle = getPageTitle(page);
      const lastEditedTime = new Date(page.last_edited_time);

      console.log(`\n--- Checking page: ${pageTitle} (${pageId}) ---`);

      // Check if the page needs to be synced (skip check if forceSync is true)
      if (!forceSync) {
        const needsSync = await shouldSyncPage(userId, pageId, lastEditedTime);

        if (!needsSync) {
          console.log(`Page "${pageTitle}" has not changed since last sync, skipping...`);
          skippedCount++;
          continue;
        }
      } else {
        console.log(`Force sync enabled, processing regardless of changes...`);
      }

      console.log(`Page "${pageTitle}" has changed, processing...`);

      // Fetch the full content of the page
      const content = await fetchPageContent(pageId, accessToken);

      if (!content || content.trim().length === 0) {
        console.log(`Page "${pageTitle}" has no content, skipping...`);
        // Still update sync log to avoid re-checking empty pages
        await updateSyncLog(userId, pageId, pageTitle, lastEditedTime, 0);
        skippedCount++;
        continue;
      }

      console.log(`Content length: ${content.length} characters`);

      // Chunk the content
      const chunks = await textSplitter.splitText(content);
      console.log(`Split into ${chunks.length} chunks`);

      // Store chunks in Zilliz
      await storeChunksInZilliz(userId, pageId, pageTitle, chunks);

      // Update the sync log
      await updateSyncLog(userId, pageId, pageTitle, lastEditedTime, chunks.length);

      processedCount++;

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log("\n=== Notion Pipeline Complete ===");
    console.log(`Total pages found: ${allPages.length}`);
    console.log(`Pages processed (new/updated): ${processedCount}`);
    console.log(`Pages skipped (no changes): ${skippedCount}`);
    console.log("================================\n");

  } catch (error: any) {
    if (error.response?.status === 401) {
      console.error("Notion authentication failed. User may need to reconnect their Notion account.");
      console.error("Error details:", error.response?.data);
    } else {
      console.error("Error in Notion pipeline:", error.response?.data || error.message);
    }
  }
}

/**
 * Deletes all Notion data from the vector database for a specific user
 * Also clears the sync log entries
 * @param userId - The user ID to delete data for
 */
export async function deleteUserNotionData(userId: string): Promise<void> {
  try {
    console.log(`\n=== Deleting Notion Data for User: ${userId} ===`);

    // Delete from Zilliz vector database
    try {
      const deleteResult = await getMilvusClient().delete({
        collection_name: COLLECTION_NAME,
        filter: `user_id == "${userId}"`,
      });
      console.log(`Deleted vectors from Zilliz Notion collection`);
    } catch (error: any) {
      console.log(`No Notion vectors to delete or collection doesn't exist:`, error.message);
    }

    // Delete from sync log table
    const deleteLogResult = await syncLogRepository.delete({ userId });
    console.log(`Deleted ${deleteLogResult.affected || 0} entries from Notion sync log`);

    console.log(`=== Notion Data Deletion Complete ===\n`);
  } catch (error: any) {
    console.error("Error deleting Notion data:", error.message);
    throw error;
  }
}
