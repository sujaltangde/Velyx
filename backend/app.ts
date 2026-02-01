import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import authRoutes from "./routes/authRoutes";
import oauthRoutes from "./routes/oauthRoutes";
import chatHistoryRoutes from "./routes/chatHistoryRoutes";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(cors());
app.use(
  fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    responseOnLimit: "File size exceeds the 10MB limit",
    debug: false,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/oauth", oauthRoutes);
app.use("/api/chats", chatHistoryRoutes);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running!" });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

app.use(errorHandler);

export default app;