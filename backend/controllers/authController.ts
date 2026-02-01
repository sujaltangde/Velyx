import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { AppError, asyncHandler } from "../middlewares/errorHandler";
import { hashPassword, signAuthToken, verifyPassword } from "../utils/auth";

const userRepository = AppDataSource.getRepository(User);

function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const nameRaw = req.body.name;
  const name =
    nameRaw === undefined || nameRaw === null ? null : String(nameRaw).trim();

  const existing = await userRepository.findOne({ where: { email } });
  if (existing) {
    throw new AppError("Email already in use", 409);
  }

  const user = userRepository.create({
    email,
    name: name && name.length > 0 ? name : null,
    password: hashPassword(password),
  });

  const saved = await userRepository.save(user);

  const token = signAuthToken({
    sub: saved.id,
    email: saved.email,
    name: saved.name,
  });

  res.status(201).json({
    success: true,
    message: "Signup successful",
    token,
    user: serializeUser(saved),
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");

  const user = await userRepository.findOne({ where: { email } });
  if (!user || !user.password) {
    throw new AppError("Invalid email or password", 401);
  }

  const ok = verifyPassword(password, user.password);
  if (!ok) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    name: user.name,
  });

  res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    user: serializeUser(user),
  });
});


