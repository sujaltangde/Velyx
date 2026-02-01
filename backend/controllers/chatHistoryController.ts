import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Chat } from "../entities/Chat";
import { ChatMessage } from "../entities/ChatMessage";
import { AppError, asyncHandler } from "../middlewares/errorHandler";

const chatRepository = AppDataSource.getRepository(Chat);
const messageRepository = AppDataSource.getRepository(ChatMessage);

// Get all chats for the authenticated user
export const getChats = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const chats = await chatRepository.find({
    where: { userId },
    order: { updatedAt: "DESC" },
    select: ["id", "title", "createdAt", "updatedAt"],
  });

  // Get the last message preview for each chat
  const chatsWithPreview = await Promise.all(
    chats.map(async (chat) => {
      const lastMessage = await messageRepository.findOne({
        where: { chatId: chat.id },
        order: { createdAt: "DESC" },
        select: ["content", "createdAt"],
      });

      return {
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        preview: lastMessage?.content?.substring(0, 50) || "",
      };
    })
  );

  res.status(200).json({
    success: true,
    chats: chatsWithPreview,
  });
});

// Get a single chat with all messages
export const getChat = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { chatId } = req.params;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const chat = await chatRepository.findOne({
    where: { id: chatId as string, userId },
  });

  if (!chat) {
    throw new AppError("Chat not found", 404);
  }

  const messages = await messageRepository.find({
    where: { chatId: chatId as string },
    order: { createdAt: "ASC" },
    select: ["id", "content", "role", "citations", "createdAt"],
  });

  res.status(200).json({
    success: true,
    chat: {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    },
    messages,
  });
});

// Create a new chat
export const createChat = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { title } = req.body;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const chat = chatRepository.create({
    userId,
    title: title || "New Chat",
  });

  const savedChat = await chatRepository.save(chat);

  res.status(201).json({
    success: true,
    chat: {
      id: savedChat.id,
      title: savedChat.title,
      createdAt: savedChat.createdAt,
      updatedAt: savedChat.updatedAt,
    },
  });
});

// Update chat title
export const updateChat = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { chatId } = req.params;
  const { title } = req.body;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const chat = await chatRepository.findOne({
    where: { id: chatId as string, userId },
  });

  if (!chat) {
    throw new AppError("Chat not found", 404);
  }

  chat.title = title || chat.title;
  const updatedChat = await chatRepository.save(chat);

  res.status(200).json({
    success: true,
    chat: {
      id: updatedChat.id,
      title: updatedChat.title,
      createdAt: updatedChat.createdAt,
      updatedAt: updatedChat.updatedAt,
    },
  });
});

// Delete a chat
export const deleteChat = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { chatId } = req.params;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const chat = await chatRepository.findOne({
    where: { id: chatId as string, userId },
  });

  if (!chat) {
    throw new AppError("Chat not found", 404);
  }

  await chatRepository.remove(chat);

  res.status(200).json({
    success: true,
    message: "Chat deleted successfully",
  });
});

// Add a message to a chat
export const addMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  const { chatId } = req.params;
  const { content, role } = req.body;

  if (!userId) {
    throw new AppError("User not authenticated", 401);
  }

  const chat = await chatRepository.findOne({
    where: { id: chatId as string, userId },
  });

  if (!chat) {
    throw new AppError("Chat not found", 404);
  }

  const message = messageRepository.create({
    chatId: chatId as string,
    content,
    role,
  });

  const savedMessage = await messageRepository.save(message);

  // Update the chat's updatedAt timestamp
  chat.updatedAt = new Date();
  await chatRepository.save(chat);

  res.status(201).json({
    success: true,
    message: {
      id: savedMessage.id,
      content: savedMessage.content,
      role: savedMessage.role,
      createdAt: savedMessage.createdAt,
    },
  });
});

// Create chat and add first message in one call (for convenience)
export const createChatWithMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.userId;
    const { title, content, role } = req.body;

    if (!userId) {
      throw new AppError("User not authenticated", 401);
    }

    // Create the chat
    const chat = chatRepository.create({
      userId,
      title: title || "New Chat",
    });
    const savedChat = await chatRepository.save(chat);

    // Create the message
    const message = messageRepository.create({
      chatId: savedChat.id,
      content,
      role: role || "user",
    });
    const savedMessage = await messageRepository.save(message);

    res.status(201).json({
      success: true,
      chat: {
        id: savedChat.id,
        title: savedChat.title,
        createdAt: savedChat.createdAt,
        updatedAt: savedChat.updatedAt,
      },
      message: {
        id: savedMessage.id,
        content: savedMessage.content,
        role: savedMessage.role,
        createdAt: savedMessage.createdAt,
      },
    });
  }
);
