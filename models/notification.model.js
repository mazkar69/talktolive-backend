import mongoose from "mongoose";

const notificationSchema = mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        message: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            required: true,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        count: {
            type: Number,
            default: 1,
        },
        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chat",
        },
    },
    { timestamps: true }
);

// Index for efficient queries by recipient and read status
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;