import express from "express";
import { login, signup } from "../controllers/authController";
import { validate } from "../middlewares/validate";
import { loginSchema, signupSchema } from "../validations/authValidation";

const router = express.Router();

router.post("/signup", validate(signupSchema), signup);
router.post("/login", validate(loginSchema), login);

export default router;


