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

const COLLECTION_NAME = "Notion";

/**
 * Search the Notion vector database for relevant content
 */
async function searchNotionVectorDB(
  userId: string,
  query: string,
  topK: number = 5
): Promise<Array<{ pageTitle: string; content: string; score: number }>> {
  // Generate embedding for the query
  const queryEmbedding = await embeddings.embedQuery(query);

  // Search in Zilliz
  const searchResult = await getMilvusClient().search({
    collection_name: COLLECTION_NAME,
    data: [queryEmbedding],
    filter: `user_id == "${userId}"`,
    limit: topK,
    output_fields: ["page_title", "content", "page_id", "chunk_index"],
  });

  // Format results
  const results = searchResult.results.map((hit: any) => ({
    pageTitle: hit.page_title || "Untitled",
    content: hit.content || "",
    score: hit.score || 0,
    pageId: hit.page_id,
    chunkIndex: hit.chunk_index,
  }));

  return results;
}

/**
 * Creates a LangChain RAG tool for searching Notion content
 */
export function createNotionSearchTool(userId: string) {
  return new DynamicStructuredTool({
    name: "search_notion",
    description: `Search through the user's Notion workspace to find relevant information. 
Use this tool when the user asks questions about their notes, documents, or any content stored in Notion. 
This searches across all pages the user has in their connected Notion workspace.
Examples of when to use: "What did I write about...", "Find my notes on...", "What's in my Notion about...", "Search my documents for..."`,
    schema: z.object({
      query: z.string().describe("The search query to find relevant Notion content. Be specific and descriptive."),
      topK: z.number().optional().default(5).describe("Number of relevant chunks to retrieve (default: 5, max: 10)"),
    }),
    func: async ({ query, topK }) => {
      try {
        // Check if user has Notion connected
        const notionAccount = await oauthRepository.findOne({
          where: {
            userId,
            provider: "notion",
          },
        });

        if (!notionAccount) {
          return JSON.stringify({
            error: "Notion account not connected. Please connect your Notion account first to search your documents.",
          });
        }

        // Limit topK to reasonable range
        const limitedTopK = Math.min(Math.max(topK || 5, 1), 10);

        // Search the vector database
        const results = await searchNotionVectorDB(userId, query, limitedTopK);

        if (results.length === 0) {
          return JSON.stringify({
            message: "No relevant content found in your Notion workspace for this query.",
            query,
            resultsCount: 0,
          });
        }

        // Format results for the LLM
        const formattedResults = results.map((result, index) => ({
          rank: index + 1,
          pageTitle: result.pageTitle,
          content: result.content,
          relevanceScore: Math.round(result.score * 100) / 100,
        }));

        return JSON.stringify({
          query,
          resultsCount: results.length,
          results: formattedResults,
          note: "Use this information to answer the user's question. Cite the page titles when referencing specific information.",
        });
      } catch (error: any) {
        console.error("Error searching Notion:", error.message);
        return JSON.stringify({
          error: `Failed to search Notion: ${error.message}`,
        });
      }
    },
  });
}
