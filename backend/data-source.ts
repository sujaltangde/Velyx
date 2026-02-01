import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";

dotenv.config();

import { User } from "./entities/User";
import { OAuthAccount } from "./entities/OAuthAccount";
import { NotionSyncLog } from "./entities/NotionSyncLog";
import { GmailSyncLog } from "./entities/GmailSyncLog";
import { Chat } from "./entities/Chat";
import { ChatMessage } from "./entities/ChatMessage";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl,
  // IMPORTANT: TypeORM only creates tables for entities registered here.
  // If an entity isn't listed, its table will never be created in Postgres (Supabase).
  entities: [User, OAuthAccount, NotionSyncLog, GmailSyncLog, Chat, ChatMessage],
  synchronize: true,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
  ssl: {
    rejectUnauthorized: false,
  },
});