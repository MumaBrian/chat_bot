const path = require("path");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const formatMessage = require("./utils/messages");
const createAdapter = require("@socket.io/redis-adapter").createAdapter;
const redis = require("redis");
require("dotenv").config();
const mongoose = require('mongoose');
const MessageModel = require('./model');


const { createClient } = redis;
const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers,
} = require("./utils/users");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Set static folder
app.use(express.static(path.join(__dirname, "public")));

const botName = "ChatBot";

(async () => {
  pubClient = createClient({ url: "redis://127.0.0.1:6379" });
  await pubClient.connect();
  subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
})();

// Run when client connects
io.on("connection", (socket) => {
  console.log(io.of("/").adapter);

  //joinRoom
 socket.on('joinRoom', async ({ username, room }) => {
   console.log('Username:', username);

   const user = userJoin(socket.id, username, room);
   console.log('User:', user);

  socket.join(user.room);

  // Welcome current user
  socket.emit('message', formatMessage(botName, 'Welcome to ChatBot!'));

  // Broadcast when a user connects
  socket.broadcast
    .to(user.room)
    .emit(
      'message',
      formatMessage(botName, `${user.username} has joined the chat`)
    );

  // Send users and room info
  io.to(user.room).emit('roomUsers', {
    room: user.room,
    users: getRoomUsers(user.room),
  });

  // Retrieve and send previous messages from the database
  try {
    const messages = await MessageModel.find().sort({ _id: -1 }).limit(10);
    socket.emit('previousMessages', messages.reverse());
  } catch (err) {
    console.error('Error retrieving previous messages:', err);
  }
});

  // Listen for chatMessage
  socket.on('chatMessage', async (msg) => {
    const user = getCurrentUser(socket.id);
console.log("line:",user)
    const message = new MessageModel({
      // username: username,
      text: msg,
      // time: moment().format('h:mm a'),
    });

    try {
      await message.save(); // Save the message to MongoDB
      io.to(user.room).emit('message', formatMessage(user.username, msg));
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  // Runs when client disconnects
  socket.on("disconnect", () => {
    const user = userLeave(socket.id);

    if (user) {
      io.to(user.room).emit(
        "message",
        formatMessage(botName, `${user.username} has left the chat`)
      );

      // Send users and room info
      io.to(user.room).emit("roomUsers", {
        room: user.room,
        users: getRoomUsers(user.room),
      });
    }
  });
});

app.get('/messages', async (req, res) => {
  try {
    const messages = await MessageModel.find()
      .sort({ _id: -1 })
      .limit(50)

    const formattedMessages = messages.map((message) => ({
      username: message.username,
      text: message.text,
      time: message.time,
    }));

    res.json(formattedMessages);
  } catch (err) {
    console.error('Error retrieving messages:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on('error', (error) => {
  console.error('MongoDB connection error:', error);
});

db.once('open', () => {
  console.log('Connected to MongoDB');
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
