// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("유저 접속:", socket.id);

  // 방 생성
  socket.on("createRoom", (nick) => {
    const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();

    rooms[roomId] = {
      players: [{ id: socket.id, nick }],
      state: null
    };

    socket.join(roomId);
    socket.emit("roomCreated", roomId);
  });

  // 방 참가
  socket.on("joinRoom", ({ roomId, nick }) => {
    const room = rooms[roomId];
    if (!room || room.players.length >= 2) {
      socket.emit("errorMsg", "방 없음 또는 가득 참");
      return;
    }

    room.players.push({ id: socket.id, nick });
    socket.join(roomId);

    io.to(roomId).emit("startGame", room.players);
  });

  // 게임 행동
  socket.on("move", ({ roomId, move }) => {
    socket.to(roomId).emit("move", move);
  });

  // 연결 끊김
  socket.on("disconnect", () => {
    console.log("유저 나감:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("서버 실행됨");
});