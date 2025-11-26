import express from "express";
import {
  registerUser,
  authUser,
  allUsers,
  verifyToken,
} from "../controllers/userControllers.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.route("/").get(protect, allUsers);
router.route("/").post(registerUser);
router.post("/login", authUser);
router.post("/verifytoken", verifyToken);

export default router;
