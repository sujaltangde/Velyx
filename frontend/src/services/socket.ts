import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export interface Citation {
  tool: "notion" | "gmail" | "hubspot";
  title: string;
  subtitle?: string;
}

interface StreamStart {
  id: string;
  timestamp: string;
}

interface StreamChunk {
  id: string;
  token: string;
  done: boolean;
}

interface StreamEnd {
  id: string;
  citations?: Citation[];
}

class SocketService {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private userId: string | null = null;
  private onConnectCallback: (() => void) | null = null;

  connect(userId?: string): Socket {
    if (userId) {
      this.userId = userId;
    }

    if (this.socket?.connected) {
      // Already connected, emit join-chat again and trigger callback
      if (this.userId) {
        this.socket.emit("join-chat", this.userId);
      }
      if (this.onConnectCallback) {
        this.onConnectCallback();
      }
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    this.socket.on("connect", () => {
      console.log("✅ Socket connected");
      this.isConnected = true;
      
      if (this.userId) {
        this.socket?.emit("join-chat", this.userId);
      }
      
      // Trigger the connect callback if set
      if (this.onConnectCallback) {
        this.onConnectCallback();
      }
    });

    this.socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      this.isConnected = false;
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Connection error:", error);
    });

    return this.socket;
  }

  // Register a callback to be called when socket connects
  onConnect(callback: () => void) {
    this.onConnectCallback = callback;
    // If already connected, call immediately
    if (this.isConnected && this.socket?.connected) {
      callback();
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  sendMessage(message: string, userId: string, conversationId?: string) {
    if (this.socket?.connected) {
      const payload = {
        message, 
        userId, 
        conversationId: conversationId || uuidv4()
      };
      this.socket.emit("send-message", payload);
    } else {
      console.error("Socket is not connected");
    }
  }

  // Legacy non-streaming handler
  onReceiveMessage(callback: (message: any) => void) {
    this.socket?.on("receive-message", callback);
  }

  onChatJoined(callback: (data: any) => void) {
    this.socket?.on("chat-joined", callback);
  }

  // Streaming handlers
  onStreamStart(callback: (data: StreamStart) => void) {
    this.socket?.on("stream-start", callback);
  }

  onStreamChunk(callback: (data: StreamChunk) => void) {
    this.socket?.on("stream-chunk", callback);
  }

  onStreamEnd(callback: (data: StreamEnd) => void) {
    this.socket?.on("stream-end", callback);
  }

  onStreamError(callback: (message: any) => void) {
    this.socket?.on("stream-error", callback);
  }

  offReceiveMessage() {
    this.socket?.off("receive-message");
  }

  offChatJoined() {
    this.socket?.off("chat-joined");
  }

  offStreamEvents() {
    this.socket?.off("stream-start");
    this.socket?.off("stream-chunk");
    this.socket?.off("stream-end");
    this.socket?.off("stream-error");
  }
}

export const socketService = new SocketService();

