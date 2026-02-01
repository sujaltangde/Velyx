import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { OpenAIEmbeddings } from "@langchain/openai";
import { AppDataSource } from "../../data-source";
import { OAuthAccount } from "../../entities/OAuthAccount";

const oauthRepository = AppDataSource.getRepository(OAuthAccount);

// Initialize OpenAI embeddings for query embedding
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName: "text-embedding-ada-002", // 1536 dimensions - must match stored embeddings
});

// Lazy initialization for Milvus client
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
 * Search the Gmail vector database for relevant emails
 */
async function searchGmailVectorDB(
  userId: string,
  query: string,
  topK: number = 5
): Promise<Array<{ sender: string; subject: string; content: string; score: number }>> {
  // Generate embedding for the query
  const queryEmbedding = await embeddings.embedQuery(query);

  // Search in Zilliz
  const searchResult = await getMilvusClient().search({
    collection_name: COLLECTION_NAME,
    data: [queryEmbedding],
    filter: `user_id == "${userId}"`,
    limit: topK,
    output_fields: ["sender", "subject", "content", "email_id"],
  });

  // Format results
  const results = searchResult.results.map((hit: any) => ({
    sender: hit.sender || "Unknown",
    subject: hit.subject || "(No Subject)",
    content: hit.content || "",
    score: hit.score || 0,
    emailId: hit.email_id,
  }));

  return results;
}

/**
 * Creates a LangChain RAG tool for searching Gmail emails
 */
export function createGmailSearchTool(userId: string) {
  return new DynamicStructuredTool({
    name: "search_gmail",
    description: `Search through the user's Gmail inbox to find relevant emails. 
Use this tool when the user asks questions about their emails, messages, or conversations in Gmail.
This searches across recent emails the user has in their connected Gmail account.
Examples of when to use: "What emails did I get about...", "Find emails from...", "Search my inbox for...", "Any messages about...", "Who emailed me about..."`,
    schema: z.object({
      query: z.string().describe("The search query to find relevant emails. Be specific and descriptive."),
      topK: z.number().optional().default(5).describe("Number of relevant emails to retrieve (default: 5, max: 10)"),
    }),
    func: async ({ query, topK }) => {
      try {
        // Check if user has Google/Gmail connected
        const googleAccount = await oauthRepository.findOne({
          where: {
            userId,
            provider: "google",
          },
        });

        if (!googleAccount) {
          return JSON.stringify({
            error: "Google account not connected. Please connect your Google account first to search your emails.",
          });
        }

        // Limit topK to reasonable range
        const limitedTopK = Math.min(Math.max(topK || 5, 1), 10);

        // Search the vector database
        const results = await searchGmailVectorDB(userId, query, limitedTopK);

        if (results.length === 0) {
          return JSON.stringify({
            message: "No relevant emails found in your Gmail for this query.",
            query,
            resultsCount: 0,
          });
        }

        // Format results for the LLM
        const formattedResults = results.map((result, index) => ({
          rank: index + 1,
          from: result.sender,
          subject: result.subject,
          content: result.content.substring(0, 500) + (result.content.length > 500 ? "..." : ""),
          relevanceScore: Math.round(result.score * 100) / 100,
        }));

        return JSON.stringify({
          query,
          resultsCount: results.length,
          results: formattedResults,
          note: "Use this information to answer the user's question about their emails. Reference the sender and subject when citing specific emails.",
        });
      } catch (error: any) {
        console.error("Error searching Gmail:", error.message);
        return JSON.stringify({
          error: `Failed to search Gmail: ${error.message}`,
        });
      }
    },
  });
}
