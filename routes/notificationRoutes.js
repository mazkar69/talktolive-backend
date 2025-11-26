import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
    getAllNotifications,
} from "../controllers/notification.controller.js";

const router = express.Router();

router.route("/").get(protect, getAllNotifications);


export default router;
