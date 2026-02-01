import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { createHubspotContactsTool } from "./tools/hubspotTool";
import { createNotionSearchTool } from "./tools/notionTool";
import { createGmailSearchTool } from "./tools/gmailTool";

// System prompt for the agent
const SYSTEM_PROMPT = `You are a helpful AI assistant that helps users find and understand information from their connected services (Notion, Gmail, and HubSpot).

## How to Respond:

1. **Be Conversational & Helpful**: Respond in a friendly, natural tone. Don't be robotic.

2. **Use the Tools**: When users ask about their data, use the appropriate tools to search:
   - Use search_notion for questions about notes, documents, or Notion content
   - Use search_gmail for questions about emails or messages
   - Use get_hubspot_contacts for questions about contacts, customers, or leads

3. **Synthesize Information**: After retrieving data, summarize the key findings clearly. Don't just dump raw data.

4. **Be Concise but Complete**: Provide thorough answers without being unnecessarily verbose.

5. **Formatting**:
   - Use bullet points or numbered lists for multiple items
   - Use **bold** for important terms or names
   - Keep paragraphs short and readable

6. **When No Data Found**: If the tools return no results, let the user know politely and suggest alternatives if possible.

7. **Handle Errors Gracefully**: If a service isn't connected, inform the user and suggest connecting it.

8. **Stay Focused**: Only answer questions based on the user's connected data. Don't make up information.`;

// Citation types
export interface Citation {
  tool: "notion" | "gmail" | "hubspot";
  title: string;
  subtitle?: string;
}

export interface AgentResponse {
  content: string;
  citations: Citation[];
}

// In-memory store for chat histories (keyed by conversationId)
const chatHistoryStore = new Map<string, InMemoryChatMessageHistory>();

// Track which conversations have been initialized from DB
const initializedConversations = new Set<string>();

/**
 * Get or create chat history for a conversation
 */
function getChatHistory(conversationId: string): InMemoryChatMessageHistory {
  if (!chatHistoryStore.has(conversationId)) {
    chatHistoryStore.set(conversationId, new InMemoryChatMessageHistory());
  }
  return chatHistoryStore.get(conversationId)!;
}

/**
 * Clear chat history for a conversation (can be called when user starts a new chat)
 */
export function clearChatHistory(conversationId: string): void {
  chatHistoryStore.delete(conversationId);
  initializedConversations.delete(conversationId);
}

/**
 * Initialize chat history from database messages
 * This should be called when loading an existing conversation
 */
export async function initializeChatHistoryFromDB(
  conversationId: string,
  messages: Array<{ content: string; role: "user" | "assistant" }>
): Promise<void> {
  // Skip if already initialized
  if (initializedConversations.has(conversationId)) {
    return;
  }

  // Clear any existing history for this conversation
  chatHistoryStore.delete(conversationId);
  
  // Create new history and populate with messages
  const chatHistory = new InMemoryChatMessageHistory();
  
  for (const msg of messages) {
    if (msg.role === "user") {
      await chatHistory.addMessage(new HumanMessage(msg.content));
    } else {
      await chatHistory.addMessage(new AIMessage(msg.content));
    }
  }
  
  chatHistoryStore.set(conversationId, chatHistory);
  initializedConversations.add(conversationId);
  
//   console.log(`Initialized chat history for conversation ${conversationId} with ${messages.length} messages`);
}

/**
 * Check if a conversation's history has been initialized
 */
export function isConversationInitialized(conversationId: string): boolean {
  return initializedConversations.has(conversationId);
}

/**
 * Parse tool results to extract citations
 */
function extractCitationsFromToolResult(toolName: string, result: string): Citation[] {
  const citations: Citation[] = [];
  const toolNameLower = toolName.toLowerCase();
  
  try {
    const parsed = JSON.parse(result);
    
    if (parsed.error) {
      return citations; // No citations for error responses
    }
    
    // Check for Notion results
    const isNotion = toolNameLower.includes("notion") || toolNameLower === "search_notion";
    if (isNotion && parsed.results) {
      const seenTitles = new Set<string>();
      for (const item of parsed.results) {
        if (item.pageTitle && !seenTitles.has(item.pageTitle)) {
          seenTitles.add(item.pageTitle);
          citations.push({
            tool: "notion",
            title: item.pageTitle,
          });
        }
      }
    }
    
    // Check for Gmail results
    const isGmail = toolNameLower.includes("gmail") || toolNameLower === "search_gmail";
    if (isGmail && parsed.results) {
      const seenSubjects = new Set<string>();
      for (const item of parsed.results) {
        const key = `${item.subject}-${item.from}`;
        if (item.subject && !seenSubjects.has(key)) {
          seenSubjects.add(key);
          citations.push({
            tool: "gmail",
            title: item.subject,
            subtitle: `From: ${item.from}`,
          });
        }
      }
    }
    
    // Check for HubSpot results
    const isHubspot = toolNameLower.includes("hubspot") || toolNameLower === "get_hubspot_contacts";
    if (isHubspot && parsed.contacts) {
      const contactCount = parsed.total || parsed.contacts.length;
      if (contactCount > 0) {
        citations.push({
          tool: "hubspot",
          title: `${contactCount} contact${contactCount > 1 ? "s" : ""} found`,
          subtitle: parsed.contacts.slice(0, 3).map((c: any) => 
            `${c.firstName} ${c.lastName}`.trim()
          ).join(", ") + (contactCount > 3 ? "..." : ""),
        });
      }
    }
    
    // Fallback: Try to detect from result structure if tool name is missing
    if (!isNotion && !isGmail && !isHubspot) {
      if (parsed.results && parsed.results[0]?.pageTitle) {
        // Looks like Notion results
        const seenTitles = new Set<string>();
        for (const item of parsed.results) {
          if (item.pageTitle && !seenTitles.has(item.pageTitle)) {
            seenTitles.add(item.pageTitle);
            citations.push({
              tool: "notion",
              title: item.pageTitle,
            });
          }
        }
      } else if (parsed.results && parsed.results[0]?.subject) {
        // Looks like Gmail results
        const seenSubjects = new Set<string>();
        for (const item of parsed.results) {
          const key = `${item.subject}-${item.from}`;
          if (item.subject && !seenSubjects.has(key)) {
            seenSubjects.add(key);
            citations.push({
              tool: "gmail",
              title: item.subject,
              subtitle: `From: ${item.from}`,
            });
          }
        }
      } else if (parsed.contacts) {
        // Looks like HubSpot results
        const contactCount = parsed.total || parsed.contacts.length;
        if (contactCount > 0) {
          citations.push({
            tool: "hubspot",
            title: `${contactCount} contact${contactCount > 1 ? "s" : ""} found`,
            subtitle: parsed.contacts.slice(0, 3).map((c: any) => 
              `${c.firstName} ${c.lastName}`.trim()
            ).join(", ") + (contactCount > 3 ? "..." : ""),
          });
        }
      }
    }
  } catch (e) {
    // Failed to parse tool result for citations
  }
  
  return citations;
}

/**
 * Stream LangGraph agent response
 * @param userMessage - The user's message
 * @param userId - The user's ID (for tools)
 * @param conversationId - The conversation/chat ID (for history)
 * @param onToken - Callback function called for each token
 * @returns The complete response with citations
 */
export async function runLangGraphAgentStreaming(
  userMessage: string,
  userId: string,
  conversationId: string,
  onToken: (token: string) => void
): Promise<AgentResponse> {
  // Track citations from tool usage
  const allCitations: Citation[] = [];
  // Initialize the model with streaming enabled
  const model = new ChatOpenAI({
    modelName: "gpt-4.1-mini",
    temperature: 0.7,
    openAIApiKey: process.env.OPENAI_API_KEY,
    streaming: true,
  });

  // Create tools for this user
  const hubspotTool = createHubspotContactsTool(userId);
  const notionTool = createNotionSearchTool(userId);
  const gmailTool = createGmailSearchTool(userId);
  const tools = [hubspotTool, notionTool, gmailTool];

  // Bind tools to the model
  const modelWithTools = model.bindTools(tools);

  // Get chat history for this conversation
  const chatHistory = getChatHistory(conversationId);

  // Define the function that determines whether to continue or end
  function shouldContinue(state: typeof MessagesAnnotation.State): "tools" | typeof END {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    // If the LLM makes a tool call, route to the "tools" node
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }
    // Otherwise, end the graph
    return END;
  }

  // Define the function that calls the model
  async function callModel(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    const response = await modelWithTools.invoke(messages);
    return { messages: [response] };
  }

  // Create the graph
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  // Compile the graph
  const app = workflow.compile();

  // Get past messages from history
  const pastMessages = await chatHistory.getMessages();

  // Add the new user message to history
  const humanMessage = new HumanMessage(userMessage);
  await chatHistory.addMessage(humanMessage);

  // Create system message
  const systemMessage = new SystemMessage(SYSTEM_PROMPT);

  let fullResponse = "";

  // Stream the response (system message + past messages + new message)
  const stream = app.streamEvents(
    { messages: [systemMessage, ...pastMessages, humanMessage] },
    { version: "v2" }
  );

  for await (const event of stream) {
    // Handle chat model stream events
    if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
      const token = event.data.chunk.content;
      if (typeof token === "string" && token.length > 0) {
        fullResponse += token;
        onToken(token);
      }
    }
    
    // Capture tool results for citations - check multiple event patterns
    if (event.event === "on_tool_end") {
      const toolName = event.name || event.metadata?.langgraph_node || "";
      const toolResult = event.data?.output;
      if (toolResult) {
        const resultStr = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
        const citations = extractCitationsFromToolResult(toolName, resultStr);
        allCitations.push(...citations);
      }
    }
    
    // Also check for tool messages in chain end events
    if (event.event === "on_chain_end" && event.data?.output?.messages) {
      const messages = event.data.output.messages;
      for (const msg of messages) {
        if (msg.type === "tool" || msg._type === "tool") {
          const toolName = msg.name || "";
          const toolResult = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          const citations = extractCitationsFromToolResult(toolName, toolResult);
          allCitations.push(...citations);
        }
      }
    }
  }

  // If no streaming happened (e.g., tool call), get final state
  if (!fullResponse) {
    const finalState = await app.invoke({
      messages: [systemMessage, ...pastMessages, humanMessage],
    });
    const messages = finalState.messages as BaseMessage[];
    
    // Extract citations from tool messages
    for (const msg of messages) {
      if (msg instanceof ToolMessage) {
        const toolName = msg.name || "";
        const toolResult = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        const citations = extractCitationsFromToolResult(toolName, toolResult);
        allCitations.push(...citations);
      }
    }
    
    const lastMessage = messages[messages.length - 1];
    fullResponse = (lastMessage?.content as string) || "";
    onToken(fullResponse);
  }

  // Add AI response to history
  if (fullResponse) {
    await chatHistory.addMessage(new AIMessage(fullResponse));
  }

  // Deduplicate citations
  const uniqueCitations: Citation[] = [];
  const seenKeys = new Set<string>();
  for (const citation of allCitations) {
    const key = `${citation.tool}:${citation.title}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueCitations.push(citation);
    }
  }

  return {
    content: fullResponse,
    citations: uniqueCitations,
  };
}

// Keep non-streaming version for backward compatibility
export async function runLangGraphAgent(
  userMessage: string,
  userId: string,
  conversationId: string
): Promise<AgentResponse> {
  return await runLangGraphAgentStreaming(userMessage, userId, conversationId, () => {});
}