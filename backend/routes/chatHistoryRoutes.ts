import express from "express";
import { authenticate } from "../middlewares/auth";
import {
  getChats,
  getChat,
  createChat,
  updateChat,
  deleteChat,
  addMessage,
  createChatWithMessage,
} from "../controllers/chatHistoryController";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Chat routes
router.get("/", getChats); // GET /api/chats - Get all chats for user
router.post("/", createChat); // POST /api/chats - Create a new chat
router.post("/with-message", createChatWithMessage); // POST /api/chats/with-message - Create chat with first message
router.get("/:chatId", getChat); // GET /api/chats/:chatId - Get chat with messages
router.put("/:chatId", updateChat); // PUT /api/chats/:chatId - Update chat title
router.delete("/:chatId", deleteChat); // DELETE /api/chats/:chatId - Delete a chat

// Message routes
router.post("/:chatId/messages", addMessage); // POST /api/chats/:chatId/messages - Add message to chat

export default router;
