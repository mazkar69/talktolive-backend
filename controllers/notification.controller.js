import asyncHandler from "express-async-handler";
import Notification from "../models/notification.model.js";

//@description     Get all notifications for logged in user
//@route           GET /api/notification
//@access          Protected
export const getAllNotifications = asyncHandler(async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id, isRead: false })
            .populate({
                path: "chat",
                populate: {
                    path: "users",
                    select: "-password"
                }
            })
            .populate("message")
            .sort({ createdAt: -1 });

        res.json(notifications);
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});



