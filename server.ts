import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // In-memory state (only for real-time presence and signaling)
  const users = new Map<string, { id: string; uid: string; name: string; color: string; room: string }>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ name, room, color, uid }) => {
      // Leave previous rooms
      socket.rooms.forEach((r) => {
        if (r !== socket.id) {
          socket.leave(r);
        }
      });

      socket.join(room);
      users.set(socket.id, { id: socket.id, uid, name, color, room });

      // Broadcast user joined
      io.emit("global-user-list", Array.from(users.values()));
      io.to(room).emit("user-list", Array.from(users.values()).filter(u => u.room === room));
      
      socket.to(room).emit("notification", {
        id: Date.now().toString(),
        text: `${name} joined the room`,
        type: "info"
      });
    });

    // WebRTC Signaling
    socket.on("call-user", ({ userToCall, signalData, from, name, callType }) => {
      // userToCall might be a UID or a socket.id
      let targetSocketId = userToCall;
      
      // Try to find by UID first
      const userByUid = Array.from(users.values()).find(u => u.uid === userToCall);
      if (userByUid) {
        targetSocketId = userByUid.id;
      }

      io.to(targetSocketId).emit("call-made", { 
        signal: signalData, 
        from, 
        name,
        callType 
      });
    });

    socket.on("answer-call", (data) => {
      io.to(data.to).emit("call-accepted", data.signal);
    });

    socket.on("ice-candidate", (data) => {
      io.to(data.to).emit("ice-candidate", data.candidate);
    });

    socket.on("end-call", ({ to }) => {
      // to might be a UID or a socket.id
      let targetSocketId = to;
      const userByUid = Array.from(users.values()).find(u => u.uid === to);
      if (userByUid) {
        targetSocketId = userByUid.id;
      }
      io.to(targetSocketId).emit("call-ended");
    });

    socket.on("typing", (isTyping) => {
      const user = users.get(socket.id);
      if (!user) return;
      socket.to(user.room).emit("user-typing", { userId: socket.id, userName: user.name, isTyping });
    });

    socket.on("disconnect", () => {
      const user = users.get(socket.id);
      if (user) {
        const { name, room } = user;
        users.delete(socket.id);
        io.emit("global-user-list", Array.from(users.values()));
        io.to(room).emit("user-list", Array.from(users.values()).filter(u => u.room === room));
        io.to(room).emit("notification", {
          id: Date.now().toString(),
          text: `${name} left the room`,
          type: "info"
        });
      }
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
