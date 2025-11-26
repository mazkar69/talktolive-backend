# Chat Backend - AI Coding Agent Instructions

## Architecture Overview

This is a real-time chat application backend built with Express.js, MongoDB, and Socket.IO. The system supports:
- One-to-one messaging and group chats
- Real-time message delivery via WebSocket connections
- JWT-based authentication with Bearer tokens
- Three core models: User, Chat, and Message with Mongoose ODM

**Key architectural pattern**: Socket.IO server runs on the same HTTP server instance as Express (`server.js` lines 42-49), sharing port 4000 (default). The frontend connects from `http://localhost:3000` (CORS configured line 53).

## Authentication & Security

- **JWT Secret**: Hardcoded in both `config/generateToken.js` and `middleware/authMiddleware.js` as `"thisismohdazkarwelcomeintheworldofcarding"` - reference these exact locations when updating
- **Token format**: `Bearer <token>` in Authorization header
- **Password hashing**: Automatic via Mongoose `pre('save')` hook in `models/userModel.js` (lines 24-31)
- All routes except `/api/user` POST (registration) and `/api/user/login` require the `protect` middleware

## Database Patterns

**Population chain pattern** - Controllers use multi-level population for nested references:
```javascript
// Example from chatControllers.js
isChat = await User.populate(isChat, {
  path: "latestMessage.sender",
  select: "name pic email",
});
```
Always exclude password field when populating users: `.populate("users", "-password")`

**Schema typo**: `userModel.js` line 17 has `{ timestaps: true }` (should be `timestamps`) - maintain for backward compatibility unless migrating

## Socket.IO Event Flow

Clients join rooms using their user `_id` on connection (`setup` event). Message delivery pattern:
1. Client sends `new message` event with full message object (including populated chat.users)
2. Server emits `message recieved` to each user's room except sender
3. Typing indicators use `typing`/`stop typing` events scoped to chat room ID

**Room structure**: Users join two types of rooms - their user ID room (for notifications) and chat ID rooms (for messages in that conversation)

## Development Workflow

**Start server**: `npm run dev` (uses nodemon for auto-reload)
**Production**: `npm start` (plain node)
**Node version**: Locked to 16.14.1 in `package.json` engines

**ES Modules**: Project uses `"type": "module"` - all imports must use `.js` extensions explicitly (e.g., `import User from "../models/userModel.js"`)

## API Route Structure

- `/api/user` - Registration, login, user search (GET with `?search=` query param)
- `/api/chat` - Create/fetch chats, group management (rename, add/remove users)
- `/api/message` - Send messages (POST), fetch chat history (GET `/:chatId`)

**Error handling**: All controllers use `express-async-handler` wrapper. Errors thrown in async handlers are caught by `errorMiddleware.js` which normalizes status codes and returns JSON format

## Common Patterns

**Search queries**: Use MongoDB regex with case-insensitive flag `$options: "i"` (see `userControllers.js` lines 10-15)

**Group chat validation**: Minimum 2 users + creator required (`chatControllers.js` line 86)

**Chat queries**: Use `$elemMatch` to find chats containing specific user IDs:
```javascript
Chat.find({ users: { $elemMatch: { $eq: req.user._id } } })
```

## Environment Variables

Required in `.env`:
- `MONGO_URI` - MongoDB connection string
- `PORT` - Server port (optional, defaults to 4000)

## Key Files Reference

- `server.js` - Single entry point for both HTTP and WebSocket servers
- `models/userModel.js` - Contains password hashing logic and `matchPassword` method
- `middleware/authMiddleware.js` - JWT verification (must match secret in `generateToken.js`)
- `controllers/chatControllers.js` - Complex population patterns for chat queries (lines 16-29, 58-66)
