const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function generateRandomMap() {
  const width = 800;
  const height = 600;

  const hole = {
    x: randomInt(100, width - 100),
    y: randomInt(100, height - 100),
    radius: 15
  };

  const obstacles = [];
  const obstacleCount = 10 + Math.floor(Math.random() * 5);

  for (let i = 0; i < obstacleCount; i++) {
    const shapeType = Math.random() < 0.5 ? 'rect' : 'circle'; 
    if (shapeType === 'rect') {
      obstacles.push({
        type: 'rect',
        x: randomInt(50, width - 100),
        y: randomInt(50, height - 100),
        width: randomInt(30, 100),
        height: randomInt(30, 100)
      });
    } else {
      obstacles.push({
        type: 'circle',
        x: randomInt(100, width - 100),
        y: randomInt(100, height - 100),
        radius: randomInt(20, 50)
      });
    }
  }

  return { width, height, hole, obstacles };
}

const colors = ['blue', 'red', 'purple', 'orange', 'yellow', 'pink', 'lime', 'cyan', 'magenta'];
const lobbies = {}; // {lobbyName: {name, players, course, roundInProgress}}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Send current lobby list
  socket.emit('lobbyList', Object.keys(lobbies));

  // Create a new lobby
  socket.on('createLobby', (lobbyName) => {
    if (!lobbyName || lobbies[lobbyName]) {
      socket.emit('lobbyError', 'Lobby name already taken or invalid.');
      return;
    }
    const newMap = generateRandomMap();
    lobbies[lobbyName] = {
      name: lobbyName,
      players: {},
      course: newMap,
      roundInProgress: true
    };
    io.emit('lobbyList', Object.keys(lobbies));
    socket.emit('lobbyJoined', lobbyName);
  });

  // Join an existing lobby
  socket.on('joinLobby', (data) => {
    const { lobbyName, playerName } = data;
    if (!lobbies[lobbyName]) {
      socket.emit('lobbyError', 'Lobby does not exist.');
      return;
    }

    const lobby = lobbies[lobbyName];
    const ballColor = colors[Math.floor(Math.random() * colors.length)];
    lobby.players[socket.id] = {
      x: 100, y: 300, vx: 0, vy: 0, radius: 10,
      color: ballColor, name: playerName || "Player",
      shots: 0, finished: false
    };

    socket.join(lobbyName);
    socket.emit('init', { 
      players: lobby.players, 
      course: lobby.course, 
      myId: socket.id, 
      lobbyName: lobbyName 
    });
    socket.to(lobbyName).emit('playerJoined', { id: socket.id, player: lobby.players[socket.id] });
  });

  // Player hits the ball
  socket.on('hitBall', (data) => {
    const { lobbyName, angle, power } = data;
    const lobby = lobbies[lobbyName];
    if (!lobby) return;
    const p = lobby.players[socket.id];
    if (p && lobby.roundInProgress && !p.finished) {
      p.vx = Math.cos(angle) * power;
      p.vy = Math.sin(angle) * power;
      p.shots += 1;
    }
  });

  // Continue to next map after scoreboard
  socket.on('continueNext', (lobbyName) => {
    const lobby = lobbies[lobbyName];
    if (!lobby) return;
    if (!lobby.roundInProgress) {
      lobby.course = generateRandomMap();
      for (let id in lobby.players) {
        const p = lobby.players[id];
        p.x = 100;
        p.y = 300;
        p.vx = 0;
        p.vy = 0;
        p.shots = 0;
        p.finished = false;
      }
      lobby.roundInProgress = true;
      io.to(lobbyName).emit('newMap', { course: lobby.course, players: lobby.players });
    }
  });

  // Chat message
  socket.on('chatMessage', (data) => {
    const { lobbyName, message, playerName } = data;
    const lobby = lobbies[lobbyName];
    if (lobby) {
      io.to(lobbyName).emit('chatMessage', { playerName, message });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    for (let lobbyName in lobbies) {
      const lobby = lobbies[lobbyName];
      if (lobby.players[socket.id]) {
        delete lobby.players[socket.id];
        io.to(lobbyName).emit('playerLeft', socket.id);
        // If no players left, remove the lobby
        if (Object.keys(lobby.players).length === 0) {
          delete lobbies[lobbyName];
          io.emit('lobbyList', Object.keys(lobbies));
        }
        break;
      }
    }
  });
});

// Physics loop
setInterval(() => {
  for (let lobbyName in lobbies) {
    const lobby = lobbies[lobbyName];
    const players = lobby.players;
    if (Object.keys(players).length === 0) continue;

    for (let id in players) {
      const p = players[id];
      if (!p.finished) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;

        // walls
        if (p.x < p.radius) { p.x = p.radius; p.vx = -p.vx * 0.8; }
        if (p.x > lobby.course.width - p.radius) { p.x = lobby.course.width - p.radius; p.vx = -p.vx * 0.8; }
        if (p.y < p.radius) { p.y = p.radius; p.vy = -p.vy * 0.8; }
        if (p.y > lobby.course.height - p.radius) { p.y = lobby.course.height - p.radius; p.vy = -p.vy * 0.8; }

        // obstacles
        for (let obs of lobby.course.obstacles) {
          if (checkObstacleCollision(p, obs)) {
            p.vx = -p.vx * 0.8;
            p.vy = -p.vy * 0.8;
          }
        }

        // hole check
        const dx = p.x - lobby.course.hole.x;
        const dy = p.y - lobby.course.hole.y;
        if (Math.sqrt(dx*dx + dy*dy) < p.radius + lobby.course.hole.radius) {
          p.finished = true;
          p.vx = 0; p.vy = 0;
        }
      }
    }

    io.to(lobbyName).emit('state', players);

    // Check if all finished
    if (lobby.roundInProgress && Object.values(players).length > 0 && Object.values(players).every(p => p.finished)) {
      lobby.roundInProgress = false;
      const scoredPlayers = Object.values(players);
      scoredPlayers.sort((a,b) => a.shots - b.shots);
      const winner = scoredPlayers[0];
      const scoreboard = scoredPlayers.map(p => ({ name: p.name, shots: p.shots }));

      io.to(lobbyName).emit('scoreboard', { scoreboard, winner: winner.name });
    }
  }
}, 1000/60);

function checkObstacleCollision(p, obs) {
  if (obs.type === 'rect') {
    if (p.x + p.radius > obs.x && p.x - p.radius < obs.x + obs.width &&
        p.y + p.radius > obs.y && p.y - p.radius < obs.y + obs.height) {
      return true;
    }
  } else if (obs.type === 'circle') {
    const dx = p.x - obs.x;
    const dy = p.y - obs.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < p.radius + obs.radius) {
      return true;
    }
  }
  return false;
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const PORT = 3000;
const localIP = getLocalIP();
server.listen(PORT, () => {
  console.log(`Server running on:`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${localIP}:${PORT}`);
});
