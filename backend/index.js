const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Redis client
const redisClient = redis.createClient();
redisClient.connect().then(() => console.log('Redis connected'));

// API to create session (admin creates passkey)
app.post('/create-session', async (req, res) => {
  const { passkey, admin } = req.body;
  if (!passkey || !admin) return res.status(400).json({ error: 'Passkey and admin username required' });

  const exists = await redisClient.exists(`session:${passkey}`);
  if (exists) return res.status(400).json({ error: 'Passkey already exists' });

  await redisClient.hSet(`session:${passkey}`, {
    admin,
    participants: JSON.stringify([]),
  });
  await redisClient.expire(`session:${passkey}`, 3600); // expires in 1 hour
  res.json({ passkey });
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('User connected');

  // Join room
  socket.on('join', async ({ passkey, username }) => {
    const exists = await redisClient.exists(`session:${passkey}`);
    if (!exists) {
      socket.emit('error', 'Invalid or expired passkey');
      return;
    }

    const sessionData = await redisClient.hGet(`session:${passkey}`, 'participants');
    let participants = JSON.parse(sessionData || '[]');
    participants.push({ username, socketId: socket.id });
    await redisClient.hSet(`session:${passkey}`, 'participants', JSON.stringify(participants));

    socket.join(passkey);
    io.to(passkey).emit('joined', { username, participants: participants.map(p => p.username) });
  });

  // Send message
  socket.on('message', ({ passkey, username, message }) => {
    if (!message || !username || !passkey) return;
    io.to(passkey).emit('message', { username, message });
  });

  // Show participants
  socket.on('participants', async ({ passkey }) => {
    const sessionData = await redisClient.hGet(`session:${passkey}`, 'participants');
    const participants = JSON.parse(sessionData || '[]');
    socket.emit('participants', participants.map(p => p.username));
  });

  // Admin terminate chat
  socket.on('terminate', async ({ passkey, username }) => {
    const sessionData = await redisClient.hGetAll(`session:${passkey}`);
    if (!sessionData.admin) return;
    if (sessionData.admin !== username) {
      socket.emit('error', 'Only admin can terminate the chat');
      return;
    }

    io.to(passkey).emit('terminated', 'Chat has been terminated by admin');
    await redisClient.del(`session:${passkey}`);

    const clients = await io.in(passkey).fetchSockets();
    clients.forEach(client => client.disconnect(true));
  });

  // Remove disconnected users
  socket.on('disconnecting', async () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    for (let passkey of rooms) {
      const sessionData = await redisClient.hGet(`session:${passkey}`, 'participants');
      if (!sessionData) continue;
      let participants = JSON.parse(sessionData);
      participants = participants.filter(p => p.socketId !== socket.id);
      await redisClient.hSet(`session:${passkey}`, 'participants', JSON.stringify(participants));
    }
  });
});

server.listen(3000, () => console.log('Server running on port 3000'));
