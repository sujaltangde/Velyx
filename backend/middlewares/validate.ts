import { Request, Response, NextFunction } from "express";
import { ZodObject, ZodError, ZodRawShape } from "zod";

export const validate =
  (schema: ZodObject<ZodRawShape>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
        files: req.files,
      });
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = (error as ZodError<any>).issues.map((issue) => ({
          path: (issue.path ?? []).join("."),
          message: issue.message,
        }));

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errorMessages,
        });
      }

      next(error);
    }
  };