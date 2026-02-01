import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AppError, asyncHandler } from "./errorHandler";

interface JWTPayload {
  sub: string;
  email: string | null;
  name: string | null;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string | null;
      userName?: string | null;
    }
  }
}

function base64UrlDecode(input: string): Buffer {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

function verifyAuthToken(token: string): JWTPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AppError("Invalid token format", 401);
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // Verify signature
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest();

  const actualSignature = base64UrlDecode(encodedSignature!);

  if (!crypto.timingSafeEqual(expectedSignature, actualSignature)) {
    throw new AppError("Invalid token signature", 401);
  }

  // Decode payload
  const payloadJson = base64UrlDecode(encodedPayload!).toString("utf8");
  const payload = JSON.parse(payloadJson) as JWTPayload;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new AppError("Token has expired", 401);
  }

  return payload;
}

export const authenticate = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("No token provided", 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const payload = verifyAuthToken(token);

    // Attach user info to request
    req.userId = payload.sub;
    req.userEmail = payload.email;
    req.userName = payload.name;

    next();
  }
);

