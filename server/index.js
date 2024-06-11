import express from "express";
import logger from "morgan";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";
dotenv.config();

import { Server } from "socket.io";
import { createServer } from "node:http";

const port = process.env.porta ?? 3000;

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionTime: 5000,
  },
});

const db = createClient({
  url: process.env.DB_URL,
  authToken: process.env.DB_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT,
    username VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

io.on("connection", async (socket) => {
  socket.on("chat message", async (msg) => {
    const today = new Date();
    const todayString =
      today.getUTCDay() +
      "-" +
      (today.getUTCMonth() + 1) +
      "-" +
      today.getUTCFullYear() +
      "-" +
      today.getUTCHours() +
      "-" +
      today.getUTCMinutes() +
      "-" +
      today.getUTCMilliseconds;
    const username = socket.handshake.auth.username ?? "anonymous";
    let result;
    try {
      result = await db.execute({
        sql: "INSERT INTO messages(message, username) VALUES(:msg, :username)",
        args: { msg, username },
      });
    } catch (error) {
      console.error(error);
      return;
    }

    io.emit("chat message", msg, result.lastInsertRowid.toString(), username);
    console.log("message: " + msg);
  });

  if (!socket.recovered) {
    // <---- recuperar los mensajes sin conexion
    try {
      const results = await db.execute({
        sql: "SELECT * FROM messages where id > :userId and username = :userName ORDER BY id ASC ",
        args: {
          userId: socket.handshake.auth.serverOffset ?? 0,
          userName: socket.handshake.auth.username ?? "",
        },
      });

      results.rows.forEach((row) => {
        socket.emit(
          "chat message",
          row.message,
          row.id.toString(),
          row.username,
          row.created_at
        );
      });
    } catch (error) {
      console.log(error);
    }
  }

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log(`Example app listening on port http://localhost:${port}`);
});
