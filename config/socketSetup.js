import { Server } from "socket.io";
import Chat from "../models/chatModel.js";
import Message from "../models/messageModel.js";
import User from "../models/userModel.js";
import Notification from "../models/notification.model.js";

let io;

// Map: userId → socketId (for online/offline tracking)
const onlineUsers = new Map();

// Random Talk Queue
const randomTalkQueue = []; // Users waiting for random match: [{ userId, socketId, interests }]
const activeRandomChats = new Map(); // Map: userId → { partnerId, chatStartTime }


export const setupSocket = (server) => {
    io = new Server(server, {
        pingTimeout: 60000,
        cors: {
            origin: "*",
        },
    });

    io.on("connection", (socket) => {
        console.log("🔌 User connected:", socket.id);

        // ---------------------------------------
        // USER SETUP (LOGIN HONE KE BAAD)
        // ---------------------------------------
        socket.on("setup", async (userData) => {
            if (!userData || !userData._id) return;

            socket.join(userData._id);
            socket.user = userData;
            socket.userId = userData._id;

            // Mark user online
            onlineUsers.set(userData._id, socket.id);

            //check previous messages that were sent to this user while offline and notify them
            const chats = await Chat.find({ users: { $in: [userData._id] } }).select("_id");
            const chatIds = chats.map(chat => chat._id);

            const undeliveredMessages = await Message.find({ chat: { $in: chatIds }, createdAt: { $gt: userData.lastSeen || new Date(0) }, sender: { $ne: userData._id } });
            undeliveredMessages.forEach(msg => {
                socket.emit("newMessage", msg);
            });


            // // Notify everyone those who joined the chatId room.
            chatIds.forEach(chatId => {
                socket.to(chatId.toString()).emit("userStatus", {
                    chatId: chatId,
                    userId: userData._id,
                    status: "online",
                    lastSeen: userData.lastSeen || null
                });
            });

            socket.emit("connected");
            console.log(`🟢 Online: ${userData._id}`);
        });

        socket.on("getUserStatus", async ({ chatId }, acknowledgement) => {
            console.log("getUserStatus called for chatId:", chatId);
            const chat = await Chat.findOne({ _id: chatId, isGroupChat: false });
            if (!chat) return;

            const receiverId = chat.users.find(userId => userId.toString() !== socket.userId);
            const status = onlineUsers.has(receiverId.toString()) ? "online" : "offline";
            const receiver = await User.findById(receiverId).select("lastSeen");
            // console.log(`User ${receiverId} is currently ${status} with last seen at ${receiver?.lastSeen || 'N/A'}`);

            if (acknowledgement && typeof acknowledgement === 'function') {
                acknowledgement({ userId: receiverId, status, lastSeen: receiver?.lastSeen || null });
            }
        });

        // ---------------------------------------
        // JOIN CHAT ROOM (When user opens a chat)
        // ---------------------------------------
        socket.on("joinChat", (chatId) => {
            if (!chatId) return;
            socket.join(chatId);
            console.log(`👥 User ${socket.userId} joined chat room: ${chatId}`);
        });

        // ---------------------------------------
        // LEAVE CHAT ROOM (When user closes/leaves chat)
        // ---------------------------------------
        socket.on("leaveChat", (chatId) => {
            if (!chatId) return;
            socket.leave(chatId);
            console.log(`👋 User ${socket.userId} left chat room: ${chatId}`);
        });

        // ---------------------------------------
        // TYPING INDICATORS
        // ---------------------------------------
        socket.on("typing", ({ chatId }) => {
            if (!chatId) return;
            // Broadcast to everyone in the chat room except sender
            socket.to(chatId).emit("typing", {
                chatId,
                userId: socket.userId           //Typing user's ID
            });
        });

        socket.on("stopTyping", ({ chatId }) => {
            if (!chatId) return;
            socket.to(chatId).emit("stopTyping", {
                chatId,
                userId: socket.userId           //Typing user's ID
            });
        });

        // ---------------------------------------
        // 4REAL-TIME MESSAGES
        // ---------------------------------------
        socket.on("new message", async (data, acknowledgement) => {
            // console.log("New message data received via socket:", data);
            if (!data.message || !data.chat || !data.sender) return;

            const chat = await Chat.findById(data.chat);
            if (!chat) return;
            const users = chat.users;




            //Store message in DB (optional, can be done via REST API too)
            const newMessage = await Message.create({ ...data, createdAt: new Date() });
            if (!newMessage) {
                console.error("Failed to store message in DB");
                return;
            }
            // console.log("Message stored in DB:", newMessage);
            chat.latestMessage = newMessage._id;
            await chat.save();

            users.forEach((userId) => {
                if (userId.toString() === data.sender) return;          //Don't send to sender
                socket.in(userId.toString()).emit("newMessage", newMessage);
            }
            );

            // Call acknowledgement with the message data
            if (acknowledgement && typeof acknowledgement === 'function') {
                acknowledgement(newMessage);
            }

            console.log(`💬 New message in chat ${data.chat} from ${data.sender}`);
        });

        // ---------------------------------------
        // READ RECEIPTS (VERY IMPORTANT)
        // ---------------------------------------
        socket.on("message read", (data) => {
            /*
               data = {
                   messageId: "...",
                   chatId: "...",
                   readerId: "...",
               }
            */

            // Notify all chat members except reader
            io.to(data.chatId).emit("message read update", {
                messageId: data.messageId,
                readerId: data.readerId,
            });

            console.log(`📖 Message Read: ${data.messageId} by ${data.readerId}`);
        });


        socket.on("check online", (userId) => {
            const isOnline = onlineUsers.has(userId);
            socket.emit("online status", { userId, isOnline });
        });


        socket.on("addNotification", async (data) => {
            /*
               data = {
               recipient:"String (userId)",
               message:{},
               chat: "String (chatId)",
            }*/

            console.log("Add notification data received via socket:", data);

            try {
                let existingOrNewNotification = await Notification.findOne({
                    recipient: data.recipient,
                    chat: data.chat,
                    isRead: false
                }).populate({
                    path: "chat",
                    populate: {
                        path: "users",
                        select: "-password"
                    }
                });

                if (existingOrNewNotification) {
                    existingOrNewNotification.count += 1;
                    existingOrNewNotification.message = data.message;
                    await existingOrNewNotification.save();
                } else {
                    existingOrNewNotification = await Notification.create({
                        recipient: data.recipient,
                        message: data.message,
                        chat: data.chat
                    });

                    existingOrNewNotification = await Notification.findById(existingOrNewNotification._id).populate({
                        path: "chat",
                        populate: {
                            path: "users",
                            select: "-password"
                        }
                    });
                }

                // Notify recipient if online
                const recipientSocketId = onlineUsers.get(data.recipient.toString());
                if (recipientSocketId) {
                    io.to(recipientSocketId).emit("newNotification", { ...existingOrNewNotification?.toObject(), message: data.message });
                }
            } catch (error) {
                console.error("Error adding notification:", error);
            }
        })

        socket.on("clearNotifications", async (data, acknowledgement) => {
            /*
               data = {
                  chatId: "String (chatId)",
               }
            */
            console.log("Clear notifications data received via socket:", data);
            try {
                const userId = socket.userId;
                const result = await Notification.updateMany(
                    { chat: data.chatId, recipient: userId, isRead: false },
                    { $set: { isRead: true } }
                );
                console.log(`Notifications cleared for chat ${data.chatId}.`);
                if (acknowledgement && typeof acknowledgement === 'function') {
                    acknowledgement({ success: true, result: result });
                }
            } catch (error) {
                console.error("Error clearing notifications:", error);
            }
        });

        // ---------------------------------------
        // MESSAGE RECEIVED ACKNOWLEDGEMENT
        // ---------------------------------------
        //Update the lastMessageId read by the user
        socket.on("messageReceivedAck", async (data) => {
            /*
               data = {
                    messageId: "...",
                }
            */

            const userId = socket.userId;
            if (!userId) return;

            // Update the readBy array of the message
            try {
                const message = await Message.findById(data.messageId);
                if (!message) return;

                await User.findByIdAndUpdate(userId, { lastMessageId: message._id });

                // if (!message.readBy.includes(userId)) {
                //     message.readBy.push(userId);
                //     await message.save();
                // }
            } catch (error) {
                console.error("Error updating message readBy:", error);
            }


        });



        // ---------------------------------------
        // RANDOM TALK - START SEARCHING
        // ---------------------------------------
        socket.on("findRandomTalk", async ({ userId, interests = [] }) => {
            console.log(`🎲 User ${userId} looking for random talk`);

            // Remove from queue if already there
            const existingIndex = randomTalkQueue.findIndex(user => user.userId === userId);
            if (existingIndex !== -1) {
                randomTalkQueue.splice(existingIndex, 1);
            }

            // Check if there's someone waiting
            if (randomTalkQueue.length > 0) {
                // Match with first person in queue
                const partner = randomTalkQueue.shift();

                // Fetch both users' data
                const [user1, user2] = await Promise.all([
                    User.findById(userId).select("-password"),
                    User.findById(partner.userId).select("-password")
                ]);

                if (!user1 || !user2) {
                    console.error("❌ Failed to fetch user data for random talk");
                    return;
                }

                // Create active chat mapping
                activeRandomChats.set(userId, {
                    partnerId: partner.userId,
                    chatStartTime: new Date()
                });
                activeRandomChats.set(partner.userId, {
                    partnerId: userId,
                    chatStartTime: new Date()
                });

                // Notify both users
                socket.emit("randomTalkMatched", {
                    user: user2,
                    partnerId: partner.userId
                });

                io.to(partner.socketId).emit("randomTalkMatched", {
                    user: user1,
                    partnerId: userId
                });

                console.log(`✅ Random match: ${userId} ↔️ ${partner.userId}`);
            } else {
                // Add to queue
                randomTalkQueue.push({ userId, socketId: socket.id, interests });
                socket.emit("randomTalkSearching");
                console.log(`⏳ User ${userId} added to random talk queue`);
            }
        });


        // ---------------------------------------
        // RANDOM TALK - CANCEL SEARCH
        // ---------------------------------------
        socket.on("cancelRandomTalk", ({ userId }) => {
            const index = randomTalkQueue.findIndex(user => user.userId === userId);
            if (index !== -1) {
                randomTalkQueue.splice(index, 1);
                console.log(`❌ User ${userId} cancelled random talk search`);
            }
        });


        // ---------------------------------------
        // RANDOM TALK - SEND MESSAGE
        // ---------------------------------------
        socket.on("randomTalkMessage", ({ message, recipientId }) => {
            const senderId = socket.userId;
            const sender = socket.user;

            if (!activeRandomChats.has(senderId)) {
                console.error("❌ Sender not in active random chat");
                return;
            }

            const chatInfo = activeRandomChats.get(senderId);
            if (chatInfo.partnerId !== recipientId) {
                console.error("❌ Invalid recipient for random talk message");
                return;
            }

            // Get recipient's socket
            const recipientSocketId = onlineUsers.get(recipientId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit("randomTalkMessage", {
                    message,
                    sender: sender,
                    createdAt: new Date()
                });
                // console.log(`💬 Random talk message: ${senderId} → ${recipientId}`);
            }
        });


        // ---------------------------------------
        // RANDOM TALK - TYPING INDICATOR
        // ---------------------------------------
        socket.on("randomTalkTyping", ({ senderId, recipientId, isTyping }) => {
            if (!activeRandomChats.has(senderId)) return;

            const recipientSocketId = onlineUsers.get(recipientId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit("randomTalkTyping", {
                    userId: senderId,
                    isTyping
                });
            }
        });

        // ---------------------------------------
        // RANDOM TALK - END CHAT
        // ---------------------------------------
        socket.on("endRandomTalk", async ({ userId, partnerId }) => {
            console.log(`🛑 Random talk ended: ${userId} & ${partnerId}`);

            // Remove from active chats
            activeRandomChats.delete(userId);
            activeRandomChats.delete(partnerId);

            // Notify partner
            const partnerSocketId = onlineUsers.get(partnerId);
            if (partnerSocketId) {
                io.to(partnerSocketId).emit("randomTalkEnded", {
                    endedBy: userId,
                    reason: "User ended the chat"
                });
            }

            socket.emit("randomTalkEnded", {
                endedBy: userId,
                reason: "You ended the chat"
            });
        });

        // ---------------------------------------
        // HANDLE DISCONNECT
        // ---------------------------------------
        socket.on("disconnect", async () => {
            if (socket.userId) {
                onlineUsers.delete(socket.userId);

                // **ADD THIS: Handle random talk cleanup**
                // Remove from random talk queue
                const queueIndex = randomTalkQueue.findIndex(user => user.userId === socket.userId);
                if (queueIndex !== -1) {
                    randomTalkQueue.splice(queueIndex, 1);
                    console.log(`🚪 Removed ${socket.userId} from random talk queue on disconnect`);
                }

                // End active random chat if exists
                if (activeRandomChats.has(socket.userId)) {
                    const chatInfo = activeRandomChats.get(socket.userId);
                    const partnerId = chatInfo.partnerId;

                    // Remove both from active chats
                    activeRandomChats.delete(socket.userId);
                    activeRandomChats.delete(partnerId);

                    // Notify partner
                    const partnerSocketId = onlineUsers.get(partnerId);
                    if (partnerSocketId) {
                        io.to(partnerSocketId).emit("randomTalkEnded", {
                            endedBy: socket.userId,
                            reason: "Partner disconnected"
                        });
                    }
                    console.log(`🚪 Random talk auto-ended due to disconnect: ${socket.userId}`);
                }
                // **END OF ADDITION**

                //Update Last seen
                const user = await User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() }).select("-password");

                const chats = await Chat.find({ users: { $in: [socket.userId] } }).select("_id");
                const chatIds = chats.map(chat => chat._id);

                // Notify everyone those who joined the chatId room that user went offline.
                chatIds.forEach(chatId => {
                    socket.to(chatId.toString()).emit("userStatus", {
                        chatId: chatId,
                        userId: user._id,
                        status: "offline",
                        lastSeen: new Date() || null
                    });
                });

                console.log(`🔴 Offline: ${socket.userId}`);
            }
        });


    });
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

