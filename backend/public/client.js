const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

good morning sigma

let players = {};
let course = null;
let myId = null;
let gameState = 'menu'; 
let mouseX = 0;
let mouseY = 0;

let selectedLobby = null;
let currentLobbyName = null;

const scoreboardDiv = document.getElementById('scoreboard');
const scoreList = document.getElementById('scoreList');
const winnerDisplay = document.getElementById('winnerDisplay');
const continueBtn = document.getElementById('continueBtn');
const lobbyError = document.getElementById('lobbyError');

const lobbyListUl = document.getElementById('lobbyList');
const createLobbyBtn = document.getElementById('createLobbyBtn');
const createLobbyName = document.getElementById('createLobbyName');
const joinSelectedBtn = document.getElementById('joinSelectedBtn');
const playerNameInput = document.getElementById('playerNameInput');

const inGameScoreboard = document.getElementById('inGameScoreboard');
const inGameScoreList = document.getElementById('inGameScoreList');

const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');

createLobbyBtn.addEventListener('click', () => {
  const name = createLobbyName.value.trim();
  if(!name) {
    lobbyError.textContent = "Please enter a lobby name.";
    return;
  }
  socket.emit('createLobby', name);
});

joinSelectedBtn.addEventListener('click', () => {
  if(!selectedLobby) {
    lobbyError.textContent = "No lobby selected.";
    return;
  }
  const playerName = playerNameInput.value.trim() || "Player";
  socket.emit('joinLobby', { lobbyName: selectedLobby, playerName });
});

lobbyListUl.addEventListener('click', (e) => {
  if(e.target.tagName === 'LI') {
    const lis = lobbyListUl.querySelectorAll('li');
    lis.forEach(li => li.style.background = '');
    e.target.style.background = '#666';
    selectedLobby = e.target.textContent;
  }
});

continueBtn.addEventListener('click', () => {
  if (currentLobbyName) {
    socket.emit('continueNext', currentLobbyName);
  }
});

chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
  const msg = chatInput.value.trim();
  if(!msg || !currentLobbyName) return;
  let playerName = "Player";
  if (players[myId] && players[myId].name) {
    playerName = players[myId].name;
  }
  socket.emit('chatMessage', { lobbyName: currentLobbyName, message: msg, playerName });
  chatInput.value = '';
}

socket.on('lobbyList', (list) => {
  lobbyListUl.innerHTML = '';
  list.forEach(lobbyName => {
    const li = document.createElement('li');
    li.textContent = lobbyName;
    lobbyListUl.appendChild(li);
  });
});

socket.on('lobbyError', (msg) => {
  lobbyError.textContent = msg;
});

socket.on('lobbyJoined', (lobbyName) => {
  currentLobbyName = lobbyName;
  gameState = 'waiting';
});

socket.on('init', (data) => {
  players = data.players;
  course = data.course;
  myId = data.myId;
  currentLobbyName = data.lobbyName;
  gameState = 'playing';
  scoreboardDiv.style.display = 'none';
  canvas.style.display = 'block';
  inGameScoreboard.style.display = 'block';
  chatContainer.style.display = 'block';
  render();
});

socket.on('playerJoined', (data) => {
  players[data.id] = data.player;
});

socket.on('playerLeft', (id) => {
  delete players[id];
});

socket.on('scoreboard', (data) => {
  gameState = 'scoreboard';
  showScoreboard(data.scoreboard, data.winner);
  inGameScoreboard.style.display = 'none';
  chatContainer.style.display = 'block';
});

socket.on('newMap', (data) => {
  course = data.course;
  players = data.players;
  gameState = 'playing';
  scoreboardDiv.style.display = 'none';
  canvas.style.display = 'block';
  inGameScoreboard.style.display = 'block';
  chatContainer.style.display = 'block';
  render();
});

socket.on('state', (newPlayers) => {
  players = newPlayers;
  if (gameState === 'playing') {
    render();
  }
});

socket.on('chatMessage', (data) => {
  const { playerName, message } = data;
  const p = document.createElement('p');
  p.textContent = `${playerName}: ${message}`;
  chatMessages.appendChild(p);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

canvas.addEventListener('mousemove', (e) => {
  if (gameState !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
  render();
});

canvas.addEventListener('mousedown', (e) => {
  if (gameState !== 'playing') return;
  if (!players[myId]) return;
  const p = players[myId];
  if (p.finished) return;
  const dx = mouseX - p.x;
  const dy = mouseY - p.y;
  const angle = Math.atan2(dy, dx);
  const distance = Math.sqrt(dx*dx + dy*dy);
  const power = Math.min(distance / 10, 20);
  socket.emit('hitBall', { lobbyName: currentLobbyName, angle, power });
});

function showScoreboard(scores, winner) {
  scoreboardDiv.style.display = 'block';
  canvas.style.display = 'none';
  scoreList.innerHTML = '';
  winnerDisplay.textContent = "Winner: " + winner;
  scores.forEach(s => {
    const li = document.createElement('li');
    li.textContent = `${s.name}: ${s.shots} shots`;
    scoreList.appendChild(li);
  });
}

function render() {
  if (!course || gameState !== 'playing') return;

  updateInGameScoreboard();

  const grd = ctx.createLinearGradient(0,0,0,canvas.height);
  grd.addColorStop(0, '#4CAF50');
  grd.addColorStop(1, '#2E7D32');
  ctx.fillStyle = grd;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // hole
  const holeGrad = ctx.createRadialGradient(course.hole.x, course.hole.y, 0, course.hole.x, course.hole.y, course.hole.radius*2);
  holeGrad.addColorStop(0, '#000');
  holeGrad.addColorStop(1, '#444');
  ctx.fillStyle = holeGrad;
  ctx.beginPath();
  ctx.arc(course.hole.x, course.hole.y, course.hole.radius, 0, Math.PI*2);
  ctx.fill();

  // obstacles
  course.obstacles.forEach(obs => {
    if (obs.type === 'rect') {
      const obsGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x+obs.width, obs.y+obs.height);
      obsGrad.addColorStop(0, '#8D6E63');
      obsGrad.addColorStop(1, '#6D4C41');
      ctx.fillStyle = obsGrad;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    } else if (obs.type === 'circle') {
      const circGrad = ctx.createRadialGradient(obs.x, obs.y, obs.radius/2, obs.x, obs.y, obs.radius);
      circGrad.addColorStop(0, '#8D6E63');
      circGrad.addColorStop(1, '#5D4037');
      ctx.fillStyle = circGrad;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI*2);
      ctx.fill();
    }
  });

  // players
  for (let id in players) {
    const p = players[id];
    const ballGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    ballGrad.addColorStop(0, p.color);
    ballGrad.addColorStop(1, 'black');
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.name} (${p.shots})`, p.x, p.y - p.radius - 10);
  }

  // aiming line
  if (players[myId] && !players[myId].finished) {
    const pm = players[myId];
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([8, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pm.x, pm.y);
    ctx.lineTo(mouseX, mouseY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function updateInGameScoreboard() {
  const sortedPlayers = Object.values(players).sort((a,b) => a.shots - b.shots);
  inGameScoreList.innerHTML = '';
  sortedPlayers.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `${p.name}: ${p.shots}`;
    inGameScoreList.appendChild(li);
  });
}
