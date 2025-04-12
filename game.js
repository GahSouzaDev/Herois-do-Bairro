// Variáveis globais
let playerId = null;
let players = {};
let bullets = [];
let keys = {};
let ws = null;
let peerConnection = null;
let dataChannel = null;

const SERVER_URL = 'wss://heroic-hope-production-bbdc.up.railway.app';
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

// Esperar o DOM carregar antes de acessar elementos
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 800;
  canvas.height = 600;

  const roomIdInput = document.getElementById('roomId');
  const statusDiv = document.getElementById('status');

  let joystickActive = false;
  let joystickX = 0;
  let joystickY = 0;
  const joystick = document.getElementById('joystick');
  const shootBtn = document.getElementById('shootBtn');

  // Função para atualizar o status
  function updateStatus(message) {
    statusDiv.textContent = message;
  }

  // Função para entrar na sala
  window.joinRoom = function () {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
      console.error('Por favor, insira um ID de sala');
      updateStatus('Por favor, insira um ID de sala');
      return;
    }

    updateStatus('Conectando ao servidor...');
    ws = new WebSocket(SERVER_URL);
    ws.onopen = () => {
      console.log('WebSocket conectado');
      updateStatus('Aguardando o segundo jogador...');
      ws.send(JSON.stringify({ type: 'join', roomId }));
    };
    ws.onerror = (error) => {
      console.error('Erro no WebSocket:', error);
      updateStatus('Erro ao conectar ao servidor. Tente novamente.');
    };
    ws.onclose = (event) => {
      console.log(`WebSocket fechado. Código: ${event.code}, Motivo: ${event.reason}`);
      updateStatus('Conexão com o servidor perdida.');
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Mensagem recebida do servidor:', data);

        if (data.type === 'start') {
          playerId = data.playerId;
          console.log(`Iniciando jogo como jogador ${playerId}`);
          updateStatus(`Jogador ${playerId} conectado. Iniciando jogo...`);
          initPeerConnection();
          if (playerId === 0) {
            dataChannel = peerConnection.createDataChannel('game');
            setupDataChannel();
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Enviando oferta:', offer);
            ws.send(JSON.stringify({ type: 'offer', sdp: offer }));
          }
        } else if (data.type === 'offer') {
          console.log('Recebida oferta:', data.sdp);
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          console.log('Enviando resposta:', answer);
          ws.send(JSON.stringify({ type: 'answer', sdp: answer }));
        } else if (data.type === 'answer') {
          console.log('Recebida resposta:', data.sdp);
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.type === 'ice') {
          console.log('Recebido candidato ICE:', data.candidate);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error('Erro ao processar mensagem do servidor:', error);
        updateStatus('Erro ao processar mensagem do servidor.');
      }
    };
  };

  function initPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Enviando candidato ICE:', event.candidate);
        ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
      }
    };
    peerConnection.oniceconnectionstatechange = () => {
      console.log('Estado ICE:', peerConnection.iceConnectionState);
      updateStatus(`Estado da conexão: ${peerConnection.iceConnectionState}`);
    };
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel();
    };
  }

  function setupDataChannel() {
    dataChannel.onopen = () => {
      console.log('DataChannel aberto');
      updateStatus('Conexão P2P estabelecida. Jogo iniciado!');
      startGame();
    };
    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Mensagem recebida no DataChannel:', data);
        if (data.type === 'move') {
          players[data.playerId] = data.position;
        } else if (data.type === 'shoot') {
          bullets.push(data.bullet);
        }
      } catch (error) {
        console.error('Erro ao processar mensagem do DataChannel:', error);
      }
    };
    dataChannel.onerror = (error) => {
      console.error('Erro no DataChannel:', error);
      updateStatus('Erro na conexão P2P.');
    };
    dataChannel.onclose = () => {
      console.log('DataChannel fechado');
      updateStatus('Conexão P2P fechada.');
    };
  }

  function startGame() {
    players[playerId] = { x: playerId === 0 ? 100 : 700, y: 300, dx: 0, dy: 0 };
    document.getElementById('controls').style.display = 'none';
    console.log('Jogo iniciado');
    gameLoop();
  }

  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
  });
  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  joystick.addEventListener('touchstart', (e) => {
    joystickActive = true;
  });
  joystick.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const rect = joystick.getBoundingClientRect();
    joystickX = (touch.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    joystickY = (touch.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    joystickX = Math.max(-1, Math.min(1, joystickX));
    joystickY = Math.max(-1, Math.min(1, joystickY));
  });
  joystick.addEventListener('touchend', () => {
    joystickActive = false;
    joystickX = 0;
    joystickY = 0;
  });

  shootBtn.addEventListener('touchstart', () => {
    shoot();
  });

  function shoot() {
    const player = players[playerId];
    if (!player) return;
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
    if (!players[playerId]) return;

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

    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'move', playerId, position: player }));
    }

    bullets = bullets.filter((bullet) => {
      bullet.x += bullet.dx;
      bullet.y += bullet.dy;
      return bullet.x >= 0 && bullet.x <= canvas.width && bullet.y >= 0 && bullet.y <= canvas.height;
    });

    for (let bullet of bullets) {
      for (let id in players) {
        if (id != playerId) {
          const p = players[id];
          if (p && bullet.x > p.x - 20 && bullet.x < p.x + 20 && bullet.y > p.y - 20 && bullet.y < p.y + 20) {
            alert('Jogador atingido! Reiniciando...');
            location.reload();
          }
        }
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let id in players) {
      if (players[id]) {
        ctx.fillStyle = id == playerId ? 'blue' : 'red';
        ctx.fillRect(players[id].x - 20, players[id].y - 20, 40, 40);
      }
    }
    ctx.fillStyle = 'yellow';
    for (let bullet of bullets) {
      ctx.fillRect(bullet.x - 5, bullet.y - 5, 10, 10);
    }

    requestAnimationFrame(gameLoop);
  }
});