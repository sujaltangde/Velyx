import { z } from "zod";

export const signupSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "Email must be a string" })
      .trim()
      .email("Email must be valid"),
    password: z
      .string({ message: "Password must be a string" })
      .min(6, "Password must be at least 6 characters")
      .max(72, "Password must be at most 72 characters"),
    name: z
      .string({ message: "Name must be a string" })
      .trim()
      .min(1, "Name cannot be empty")
      .max(255, "Name cannot exceed 255 characters")
      .optional()
      .nullable(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ message: "Email must be a string" })
      .trim()
      .email("Email must be valid"),
    password: z
      .string({ message: "Password must be a string" })
      .min(1, "Password is required"),
  }),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;


