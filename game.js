// Variáveis globais
let playerId = null;
let players = {};
let bullets = [];
let keys = {};
let ws = null;
let peerConnection = null;
let dataChannel = null;
let lastMoveSent = 0;
let gameActive = true; // Controla se o jogo está ativo
let currentRoomId = null; // Armazena o roomId para revanche
let scores = { 0: 0, 1: 0 }; // Placar para jogador 0 e jogador 1

const SERVER_URL = 'wss://heroic-hope-production-bbdc.up.railway.app';
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:turn.speed.cloudflare.com:50000',
      username: 'd1a7f09155fb30285724a3a056ca2edf17956674aff12909ff133dcec42994b2614cdd0a380a1b65124def1e3d0208543050d14b77d1a7533f9da35893ee2ed9',
      credential: 'aba9b169546eb6dcc7bfb1cdf34544cf95b5161d602e3b5fa7c8342b2e9802fb',
    },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
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
  const endGameScreen = document.getElementById('endGameScreen');
  const endGameMessage = document.getElementById('endGameMessage');
  const rematchBtn = document.getElementById('rematchBtn');
  const exitBtn = document.getElementById('exitBtn');

  let joystickActive = false;
  let joystickX = 0;
  let joystickY = 0;
  const joystick = document.getElementById('joystick');
  const shootBtn = document.getElementById('shootBtn');

  // Função para atualizar o status
  function updateStatus(message) {
    statusDiv.textContent = message;
  }

  // Função para mostrar a tela de fim de jogo com o placar
// Função para mostrar a tela de fim de jogo com o placar
// Função para mostrar a tela de fim de jogo com o placar
// Função para mostrar a tela de fim de jogo com o placar
function showEndGameScreen(message, isFinal = false) {
  gameActive = false; // Para o loop do jogo
  let displayMessage = message;
  if (isFinal) {
    // Determina o vencedor com base no placar
    const winner = scores[0] >= scores[1] ? 1 : 2;
    displayMessage = `O Jogador ${winner} ganhou!`;
    rematchBtn.textContent = 'Zerar Placar'; // Altera o texto do botão para ambos os jogadores
  } else {
    rematchBtn.textContent = 'Próximo Jogo';
  }
  endGameMessage.innerHTML = `
    ${displayMessage}<br>
    <div class="scoreboard">
      <span class="scoreboard-line">Placar:</span>
      <span class="scoreboard-line">Jogador 1: ${scores[0]}</span>
      <span class="scoreboard-line">Jogador 2: ${scores[1]}</span>
    </div>
  `; // Estrutura o placar em linhas separadas
  endGameScreen.style.display = 'block';
}

  // Função para fechar conexões
  function closeConnections() {
    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  // Função para entrar na sala
  window.joinRoom = function () {
    const roomId = roomIdInput.value.trim();
    if (!roomId) {
      console.error('Por favor, insira um ID de sala');
      updateStatus('Por favor, insira um ID de sala');
      return;
    }

    currentRoomId = roomId; // Armazena o roomId para revanche
    updateStatus('Conectando ao servidor...');
    document.getElementById('loadingOverlay').style.display = 'flex'; // Mostra o loading
    ws = new WebSocket(SERVER_URL);
    ws.onopen = () => {
      console.log('WebSocket conectado');
      updateStatus('Aguardando o segundo jogador...');
      ws.send(JSON.stringify({ type: 'join', roomId }));
    };
    ws.onerror = (error) => {
      console.error('Erro no WebSocket:', error);
      updateStatus('Erro ao conectar ao servidor. Tente novamente.');
      document.getElementById('loadingOverlay').style.display = 'none'; // Esconde o loading
    };
    ws.onclose = (event) => {
      console.log(`WebSocket fechado. Código: ${event.code}, Motivo: ${event.reason}`);
      updateStatus('Conexão com o servidor perdida.');
      document.getElementById('loadingOverlay').style.display = 'none'; // Esconde o loading
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
        } else if (data.type === 'error') {
          console.error('Erro do servidor:', data.message);
          updateStatus(data.message);
          document.getElementById('loadingOverlay').style.display = 'none'; // Esconde o loading
        }
      } catch (error) {
        console.error('Erro ao processar mensagem do servidor:', error);
        updateStatus('Erro ao processar mensagem do servidor.');
        document.getElementById('loadingOverlay').style.display = 'none'; // Esconde o loading
      }
    };
  };

  function initPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Candidato ICE gerado:', event.candidate);
        ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
      } else {
        console.log('Todos os candidatos ICE foram gerados.');
      }
    };
    peerConnection.oniceconnectionstatechange = () => {
      console.log('Estado ICE:', peerConnection.iceConnectionState);
      updateStatus(`Estado da conexão: ${peerConnection.iceConnectionState}`);
      if (peerConnection.iceConnectionState === 'failed') {
        console.error('Conexão ICE falhou. Verifique servidores TURN ou configuração de rede.');
        updateStatus('Falha na conexão P2P. Tente novamente ou verifique sua rede.');
        document.getElementById('loadingOverlay').style.display = 'none'; // Esconde o loading
      } else if (peerConnection.iceConnectionstate === 'disconnected') {
        console.log('Conexão ICE desconectada. Tentando reconectar...');
        updateStatus('Conexão P2P desconectada. Tentando reconectar...');
      } else if (peerConnection.iceConnectionState === 'connected') {
        console.log('Conexão ICE estabelecida com sucesso!');
      }
    };
    peerConnection.onicegatheringstatechange = () => {
      console.log('Estado de coleta ICE:', peerConnection.iceGatheringState);
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
          bullets.push({ ...data.bullet, ownerId: data.playerId });
        } else if (data.type === 'gameOver') {
          const isFinal = data.isFinal || false; // Verifica se é o fim da partida (10 pontos)
          showEndGameScreen(data.winnerId == playerId ? 'Você venceu!' : 'Você perdeu!', isFinal);
        } else if (data.type === 'restart') {
          console.log('Recebido pedido de reinício do outro jogador');
          performGameRestart();
        } else if (data.type === 'scoreUpdate') {
          scores = data.scores; // Atualiza o placar local com os dados recebidos
          console.log('Scores atualizados:', scores);
        }
      } catch (error) {
        console.error('Erro ao processar mensagem do DataChannel:', error);
      }
    };
    dataChannel.onerror = (error) => {
      console.error('Erro no DataChannel:', error);
      updateStatus('Erro na conexão P2P.');
      document.getElementById('loadingOverlay').style.display = 'none';
    };
    dataChannel.onclose = () => {
      console.log('DataChannel fechado');
      updateStatus('Conexão P2P fechada.');
      document.getElementById('loadingOverlay').style.display = 'none';
    };
  }

  function startGame() {
    players = {};
    bullets = [];
    scores = { 0: 0, 1: 0 }; // Inicializa o placar
    gameActive = true;
    // Inicializar jogadores com última direção de disparo (atirando um contra o outro)
    players[playerId] = {
      x: playerId === 0 ? 100 : 700,
      y: 300,
      dx: 0,
      dy: 0,
      radius: 20,
      lastDx: playerId === 0 ? 1 : -1, // Jogador 0 atira para a direita, jogador 1 para a esquerda
      lastDy: 0,
      lastShot: 0, // Controla o tempo do último disparo
    };
    document.getElementById('controls').style.display = 'none';
    endGameScreen.style.display = 'none';
    document.getElementById('loadingOverlay').style.display = 'none'; // Esconde o loading
    console.log('Jogo iniciado');
    gameLoop();
  }

  function restartGame() {
    if (dataChannel?.readyState === 'open') {
      // Envia mensagem de reinício para o outro jogador
      dataChannel.send(JSON.stringify({ type: 'restart' }));
      // Executa o reinício localmente
      performGameRestart();
    } else {
      // Fallback: reconecta se a conexão estiver perdida
      console.warn('DataChannel não está aberto. Reconectando...');
      roomIdInput.value = currentRoomId;
      joinRoom();
    }
  }

  function performGameRestart() {
    // Redefine o placar se algum jogador atingiu 10 pontos
    if (scores[0] >= 10 || scores[1] >= 10) {
      scores = { 0: 0, 1: 0 }; // Zera o placar
      if (dataChannel?.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'scoreUpdate', scores }));
      }
    }

    // Redefine o estado do jogo
    players = {};
    bullets = [];
    gameActive = true;

    // Reinicializa o jogador local
    players[playerId] = {
      x: playerId === 0 ? 100 : 700,
      y: 300,
      dx: 0,
      dy: 0,
      radius: 20,
      lastDx: playerId === 0 ? 1 : -1,
      lastDy: 0,
      lastShot: 0,
    };

    // Oculta a tela de fim de jogo
    endGameScreen.style.display = 'none';
    document.getElementById('loadingOverlay').style.display = 'none';

    console.log('Jogo reiniciado');
    gameLoop(); // Reinicia o loop do jogo
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

  rematchBtn.addEventListener('click', () => {
    restartGame(); // Chama a função de reinício
  });

  exitBtn.addEventListener('click', () => {
    closeConnections();
    players = {};
    bullets = [];
    gameActive = false;
    document.getElementById('controls').style.display = 'block';
    endGameScreen.style.display = 'none';
    updateStatus('Jogo encerrado. Digite um ID de sala para jogar novamente.');
  });

  function shoot() {
    if (!gameActive) return;
    const player = players[playerId];
    if (!player) return;

    const now = Date.now();
    const shotInterval = 250; // 1 disparo por segundo (250ms)
    if (now - player.lastShot < shotInterval) return; // Impede disparo se o intervalo não foi atingido

    // Usa a última direção de movimento (ou a inicial, se não houve movimento)
    const bulletSpeed = 10;
    const bullet = {
      x: player.x,
      y: player.y,
      dx: (player.lastDx || 1) * bulletSpeed,
      dy: (player.lastDy || 0) * bulletSpeed,
      radius: 5,
    };
    bullets.push({ ...bullet, ownerId: playerId });
    player.lastShot = now; // Atualiza o tempo do último disparo

    if (dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'shoot', bullet, playerId }));
    }
  }

  function gameLoop() {
    if (!gameActive || !players[playerId]) return;

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

    // Atualizar a última direção de movimento (se houver movimento)
    if (player.dx !== 0 || player.dy !== 0) {
      const magnitude = Math.sqrt(player.dx * player.dx + player.dy * player.dy);
      if (magnitude > 0) { // Evita divisão por zero
        player.lastDx = player.dx / magnitude; // Normaliza a direção
        player.lastDy = player.dy / magnitude;
      }
    }

    player.x = Math.max(0, Math.min(canvas.width, player.x + player.dx));
    player.y = Math.max(0, Math.min(canvas.height, player.y + player.dy));

    const now = Date.now();
    if (now - lastMoveSent >= 50 && dataChannel?.readyState === 'open') {
      dataChannel.send(JSON.stringify({ type: 'move', playerId, position: player }));
      lastMoveSent = now;
    }

    bullets = bullets.filter((bullet) => {
      bullet.x += bullet.dx;
      bullet.y += bullet.dy;
      return bullet.x >= 0 && bullet.x <= canvas.width && bullet.y >= 0 && bullet.y <= canvas.height;
    });

    for (let bullet of bullets) {
      for (let id in players) {
        if (id != playerId && bullet.ownerId != id) {
          const p = players[id];
          if (p) {
            const dx = bullet.x - p.x;
            const dy = bullet.y - p.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < bullet.radius + p.radius) {
              console.log(`Jogador ${id} atingido por bala de ${bullet.ownerId}`);
              scores[bullet.ownerId]++; // Incrementa o placar do jogador que acertou
              const isFinal = scores[bullet.ownerId] >= 10; // Verifica se é o fim da partida
              if (dataChannel?.readyState === 'open') {
                // Envia atualização do placar
                dataChannel.send(JSON.stringify({ type: 'scoreUpdate', scores }));
                // Envia mensagem de gameOver com informação de fim de partida
                dataChannel.send(JSON.stringify({ type: 'gameOver', winnerId: bullet.ownerId, isFinal }));
              }
              // Exibe a tela de fim de jogo com placar
              showEndGameScreen(bullet.ownerId == playerId ? 'Você venceu!' : 'Você perdeu!', isFinal);
              return; // Para o loop do jogo
            }
          }
        }
      }
    }

    // Limpa o canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Desenhar o placar no canvas durante o jogo
ctx.fillStyle = 'white';
ctx.font = '20px Arial';
ctx.textAlign = 'center'; // Alinha o texto ao centro
ctx.fillText(`Jogador 1: ${scores[0]} | Jogador 2: ${scores[1]}`, canvas.width / 2, 30); // Posiciona no centro horizontal
ctx.textAlign = 'start'; // Restaura o alinhamento padrão para evitar afetar outros desenhos
    // Desenhar jogadores
    for (let id in players) {
      if (players[id]) {
        ctx.fillStyle = id == playerId ? 'blue' : 'red';
        ctx.beginPath();
        ctx.arc(players[id].x, players[id].y, players[id].radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Desenhar balas
    ctx.fillStyle = 'yellow';
    for (let bullet of bullets) {
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(gameLoop);
  }
});

// Função para gerar ID aleatório de 5 caracteres
window.generateRandomId = function () {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  document.getElementById('roomId').value = result;
};

// Função para copiar o ID gerado
document.getElementById('copyIdBtn').addEventListener('click', () => {
  const roomIdInput = document.getElementById('roomId');
  roomIdInput.select();
  try {
    document.execCommand('copy');
    updateStatus('ID copiado com sucesso!');
  } catch (err) {
    console.error('Erro ao copiar ID:', err);
    updateStatus('Erro ao copiar ID.');
  }
});
