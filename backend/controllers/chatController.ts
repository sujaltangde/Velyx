import { Server as SocketServer, Socket } from "socket.io";
import {
  runLangGraphAgentStreaming,
  initializeChatHistoryFromDB,
  isConversationInitialized,
  type Citation,
} from "../agents/langgraphAgent";
import { AppDataSource } from "../data-source";
import { Chat } from "../entities/Chat";
import { ChatMessage as ChatMessageEntity } from "../entities/ChatMessage";

interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  citations?: Citation[];
}

interface StreamChunk {
  id: string;
  token: string;
  done: boolean;
}

interface SendMessageData {
  message: string;
  userId: string;
  conversationId: string;
}

const chatRepository = AppDataSource.getRepository(Chat);
const messageRepository = AppDataSource.getRepository(ChatMessageEntity);

// In-memory set to track which chats have been created (conversationId === chatId)
const createdChats = new Set<string>();

// Helper function to save a message to the database
async function saveMessage(
  chatId: string,
  content: string,
  role: "user" | "assistant",
  citations?: Citation[]
): Promise<ChatMessageEntity | null> {
  try {
    const message = messageRepository.create({
      chatId,
      content,
      role,
      citations: citations && citations.length > 0 ? citations : null,
    });
    const savedMessage = await messageRepository.save(message);
    
    // Update chat's updatedAt
    await chatRepository.update(chatId, { updatedAt: new Date() });
    
    return savedMessage;
  } catch (error) {
    console.error("Failed to save message:", error);
    return null;
  }
}

// Ensure chat exists in DB (only creates if not tracked in memory)
async function ensureChatExists(
  conversationId: string,
  userId: string,
  firstMessage?: string
): Promise<void> {
  // Already created, skip DB call entirely
  if (createdChats.has(conversationId)) {
    return;
  }

  try {
    // Check if chat exists in DB (only on first encounter)
    const exists = await chatRepository.exists({
      where: { id: conversationId },
    });

    if (!exists) {
      const title = firstMessage
        ? firstMessage.substring(0, 50) + (firstMessage.length > 50 ? "..." : "")
        : "New Chat";

      const chat = chatRepository.create({
        id: conversationId,
        userId,
        title,
      });
      await chatRepository.save(chat);
    }

    // Mark as created so we never check DB again for this conversation
    createdChats.add(conversationId);
  } catch (error) {
    console.error("Failed to ensure chat exists:", error);
  }
}

// Load chat history from database (called once when conversation first accessed)
async function loadChatHistoryToMemory(
  conversationId: string
): Promise<void> {
  try {
    // Load messages directly (if messages exist, chat exists)
    const messages = await messageRepository.find({
      where: { chatId: conversationId },
      order: { createdAt: "ASC" },
      select: ["content", "role"],
    });

    if (messages.length > 0) {
      // Chat exists in DB, track it
      createdChats.add(conversationId);
      
      // Initialize LangChain memory with database messages
      await initializeChatHistoryFromDB(
        conversationId,
        messages.map((m) => ({ content: m.content, role: m.role }))
      );
    }
  } catch (error) {
    console.error("Failed to load chat history to memory:", error);
  }
}

export const setupSocketHandlers = (io: SocketServer) => {
  io.on("connection", (socket: Socket) => {
    // Handle join-chat: frontend emits this with userId; we confirm so it can set isSocketConnected
    socket.on("join-chat", (userId: string) => {
      socket.emit("chat-joined", { userId });
    });

    // Handle incoming messages with streaming
    socket.on("send-message", async (data: SendMessageData) => {
      const messageId = `msg-${Date.now()}-ai`;
      const timestamp = new Date().toISOString();
      let fullResponse = "";
      let citations: Citation[] = [];

      try {
        // console.log("Processing message with LangGraph (streaming):", {
        //   message: data.message,
        //   userId: data.userId,
        //   conversationId: data.conversationId,
        // });

        // Load existing chat history into LangChain memory (only once per conversation)
        if (!isConversationInitialized(data.conversationId)) {
          await loadChatHistoryToMemory(data.conversationId);
        }

        // Ensure chat exists in background (don't block)
        const chatPromise = ensureChatExists(
          data.conversationId,
          data.userId,
          data.message
        );

        // Emit stream start immediately
        socket.emit("stream-start", { id: messageId, timestamp });

        // Stream the response with conversationId for memory context
        const agentResponse = await runLangGraphAgentStreaming(
          data.message,
          data.userId,
          data.conversationId,
          (token: string) => {
            fullResponse += token;
            // Emit each token as it arrives
            const chunk: StreamChunk = {
              id: messageId,
              token,
              done: false,
            };
            socket.emit("stream-chunk", chunk);
          }
        );

        // Get citations from agent response
        citations = agentResponse.citations;

        // Emit stream end with citations (don't wait for DB save)
        socket.emit("stream-end", { id: messageId, citations });

        // Save both messages to database in background (non-blocking for user)
        chatPromise.then(async () => {
          if (fullResponse) {
            // conversationId === chatId, no need to fetch from DB
             saveMessage(data.conversationId, data.message, "user");
             saveMessage(data.conversationId, fullResponse, "assistant", citations);
          }
        }).catch((err) => console.error("Failed to save chat messages:", err));
      } catch (error) {
        console.error("Failed to get AI response:", error);

        // Send error message
        const errorMessage: ChatMessage = {
          id: messageId,
          content:
            "Sorry, I'm having trouble connecting to the AI service. Please try again later.",
          role: "assistant",
          timestamp,
        };

        socket.emit("stream-error", errorMessage);
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {});

    // Handle errors
    socket.on("error", (error) => {
      console.error(`⚠️ Socket error for ${socket.id}:`, error);
    });
  });
};
