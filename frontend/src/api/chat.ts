import { apiClient } from './config';

export interface Citation {
  tool: 'notion' | 'gmail' | 'hubspot';
  title: string;
  subtitle?: string;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  createdAt: string;
  citations?: Citation[] | null;
}

export interface GetChatsResponse {
  success: boolean;
  chats: Chat[];
}

export interface GetChatResponse {
  success: boolean;
  chat: Chat;
  messages: ChatMessage[];
}

export interface CreateChatResponse {
  success: boolean;
  chat: Chat;
}

export interface DeleteChatResponse {
  success: boolean;
  message: string;
}

export const chatAPI = {
  // Get all chats for the current user
  getChats: async (): Promise<GetChatsResponse> => {
    const response = await apiClient.get<GetChatsResponse>('/api/chats');
    return response.data;
  },

  // Get a single chat with all messages
  getChat: async (chatId: string): Promise<GetChatResponse> => {
    const response = await apiClient.get<GetChatResponse>(`/api/chats/${chatId}`);
    return response.data;
  },

  // Create a new chat
  createChat: async (title?: string): Promise<CreateChatResponse> => {
    const response = await apiClient.post<CreateChatResponse>('/api/chats', { title });
    return response.data;
  },

  // Update chat title
  updateChat: async (chatId: string, title: string): Promise<CreateChatResponse> => {
    const response = await apiClient.put<CreateChatResponse>(`/api/chats/${chatId}`, { title });
    return response.data;
  },

  // Delete a chat
  deleteChat: async (chatId: string): Promise<DeleteChatResponse> => {
    const response = await apiClient.delete<DeleteChatResponse>(`/api/chats/${chatId}`);
    return response.data;
  },

  // Add a message to a chat
  addMessage: async (
    chatId: string,
    content: string,
    role: 'user' | 'assistant'
  ): Promise<{ success: boolean; message: ChatMessage }> => {
    const response = await apiClient.post(`/api/chats/${chatId}/messages`, {
      content,
      role,
    });
    return response.data;
  },
};
