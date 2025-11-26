import express from "express";
import connectDB from "./config/db.js";
import dotenv from "dotenv";
import userRoutes from "./routes/userRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
import cors from "cors";
import { setupSocket } from "./config/socketSetup.js";
const app = express();

const PORT = process.env.PORT || 4000;



dotenv.config();
connectDB();
app.use(cors())

app.use(express.urlencoded())
app.use(express.json()); // to accept json data

app.get("/", (req, res) => {
  res.json({ message: "API Running!" });
});

app.get('/api/check', (req, res) => {
  res.json({ message: "API Running!" });
})

app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/notification", notificationRoutes);



// Error Handling middlewares
app.use(notFound);
app.use(errorHandler);


// app.listen() returns an HTTP server
const server = app.listen(
  PORT, () => {
    console.log(`Server running on PORT ${PORT}...`.yellow.bold)
  }
);


setupSocket(server);




