const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

let playerId = null;
let players = {};
let bullets = [];
let keys = {};
let ws = null;
let peerConnection = null;
let dataChannel = null;

const roomIdInput = document.getElementById('roomId');
const SERVER_URL = 'wss://heroic-hope-production-bbdc.up.railway.app'; // Substitua pela URL do Railway

// Configuração WebRTC
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Adicione TURN se necessário
  ],
};

function joinRoom() {
  const roomId = roomIdInput.value;
  if (!roomId) return;

  ws = new WebSocket(SERVER_URL);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', roomId }));
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'start') {
      playerId = data.playerId;
      initPeerConnection();
      if (playerId === 0) {
        dataChannel = peerConnection.createDataChannel('game');
        setupDataChannel();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', sdp: offer }));
      }
    } else if (data.type === 'offer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      ws.send(JSON.stringify({ type: 'answer', sdp: answer }));
    } else if (data.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === 'ice') {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };
}

function initPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
    }
  };
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };
}

function setupDataChannel() {
  dataChannel.onopen = () => {
    console.log('DataChannel aberto');
    startGame();
  };
  dataChannel.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'move') {
      players[data.playerId] = data.position;
    } else if (data.type === 'shoot') {
      bullets.push(data.bullet);
    }
  };
}

// Lógica do Jogo
function startGame() {
  players[playerId] = { x: playerId === 0 ? 100 : 700, y: 300, dx: 0, dy: 0 };
  document.getElementById('controls').style.display = 'none';
  gameLoop();
}

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// Controles Mobile
let joystickActive = false;
let joystickX = 0;
let joystickY = 0;
const joystick = document.getElementById('joystick');
joystick.addEventListener('touchstart', (e) => {
  joystickActive = true;
});
joystick.addEventListener('touchmove', (e) => {
  const touch = e.touches[0];
  const rect = joystick.getBoundingClientRect();
  joystickX = (touch.clientX - rect.left - rect.width / 2) / (rect.width / 2);
  joystickY = (touch.clientY - rect.top - rect.height / 2) / (rect.height / 2);
});
joystick.addEventListener('touchend', () => {
  joystickActive = false;
  joystickX = 0;
  joystickY = 0;
});

document.getElementById('shootBtn').addEventListener('touchstart', () => {
  shoot();
});

function shoot() {
  const player = players[playerId];
  const bullet = {
    x: player.x,
    y: player.y,
    dx: player.dx * 10 || 5,
    dy: player.dy * 10 || 0,
  };
  bullets.push(bullet);
  if (dataChannel?.readyState === 'open') {
    dataChannel.send(JSON.stringify({ type: 'shoot', bullet }));
  }
}

function gameLoop() {
  // Atualizar jogador
  const player = players[playerId];
  player.dx = 0;
  player.dy = 0;

  if (keys['KeyW']) player.dy = -5;
  if (keys['KeyS']) player.dy = 5;
  if (keys['KeyA']) player.dx = -5;
  if (keys['KeyD']) player.dx = 5;
  if (keys['Space']) shoot();

  if (joystickActive) {
    player.dx = joystickX * 5;
    player.dy = joystickY * 5;
  }

  player.x = Math.max(0, Math.min(canvas.width, player.x + player.dx));
  player.y = Math.max(0, Math.min(canvas.height, player.y + player.dy));

  // Enviar posição
  if (dataChannel?.readyState === 'open') {
    dataChannel.send(JSON.stringify({ type: 'move', playerId, position: player }));
  }

  // Atualizar balas
  bullets = bullets.filter((bullet) => {
    bullet.x += bullet.dx;
    bullet.y += bullet.dy;
    return bullet.x >= 0 && bullet.x <= canvas.width && bullet.y >= 0 && bullet.y <= canvas.height;
  });

  // Colisão
  for (let bullet of bullets) {
    for (let id in players) {
      if (id != playerId) {
        const p = players[id];
        if (
          bullet.x > p.x - 20 &&
          bullet.x < p.x + 20 &&
          bullet.y > p.y - 20 &&
          bullet.y < p.y + 20
        ) {
          alert('Jogador atingido! Reiniciando...');
          location.reload();
        }
      }
    }
  }

  // Renderizar
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let id in players) {
    ctx.fillStyle = id == playerId ? 'blue' : 'red';
    ctx.fillRect(players[id].x - 20, players[id].y - 20, 40, 40);
  }
  ctx.fillStyle = 'yellow';
  for (let bullet of bullets) {
    ctx.fillRect(bullet.x - 5, bullet.y - 5, 10, 10);
  }

  requestAnimationFrame(gameLoop);
}