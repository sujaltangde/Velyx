import "reflect-metadata";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { AppDataSource } from "./data-source";
import app from "./app";
import { setupSocketHandlers } from "./controllers/chatController";
const PORT = process.env.PORT || 4000;

// Create HTTP server
const httpServer = createServer(app);

// Create Socket.IO server
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Setup socket handlers
setupSocketHandlers(io);

AppDataSource.initialize()
  .then(async () => {
    console.log("✅ Data Source has been initialized!");

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Error during Data Source initialization:", err);
    process.exit(1);
  });
