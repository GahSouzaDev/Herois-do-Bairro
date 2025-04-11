class MenuScene extends Phaser.Scene {
    constructor() {
      super("MenuScene");
    }
  
    create() {
      this.add.text(200, 200, "Heróis do Bairro", { fontSize: "32px", color: "#fff" });
      const startButton = this.add.text(300, 300, "Gerar Convite", {
        fontSize: "24px",
        color: "#0f0",
        backgroundColor: "#000",
        padding: { x: 10, y: 5 },
      });
      startButton.setInteractive();
      startButton.on("pointerdown", () => {
        this.scene.start("GameScene", { isHost: true });
      });
  
      // Verifica convite na URL
      const urlParams = new URLSearchParams(window.location.search);
      const inviteCode = urlParams.get("convite");
      if (inviteCode) {
        this.scene.start("GameScene", { isHost: false, inviteCode: decodeURIComponent(inviteCode) });
      }
    }
  }
  
  class GameScene extends Phaser.Scene {
    constructor() {
      super("GameScene");
      this.peerConnection = null;
      this.dataChannel = null;
      this.isHost = false;
      this.iceCandidates = [];
      this.opponentConnected = false;
      this.gameTime = 30;
      this.timer = null;
      this.player1Health = 100;
      this.player2Health = 100;
      this.attackCooldown = false;
    }
  
    init(data) {
      this.isHost = data.isHost;
      this.inviteCode = data.inviteCode || null;
    }
  
    preload() {
      this.load.image("bombeiro", "assets/bombeiro.png");
      this.load.image("jardineiro", "assets/jardineiro.png");
    }
  
    create() {
      // Sprites
      this.player1 = this.physics.add.sprite(this.isHost ? 100 : 700, 450, this.isHost ? "bombeiro" : "jardineiro")
        .setCollideWorldBounds(true);
      this.player2 = this.physics.add.sprite(this.isHost ? 700 : 100, 450, this.isHost ? "jardineiro" : "bombeiro")
        .setCollideWorldBounds(true);
      this.player1.setData("health", 100);
      this.player2.setData("health", 100);
  
      // Controles
      this.cursors = this.input.keyboard.addKeys({
        up: "W",
        left: "A",
        right: "D",
        down: "S",
        attack: "SPACE",
      });
  
      // Interface inicial
      this.statusText = this.add.text(300, 50, "Aguardando oponente...", {
        fontSize: "20px",
        color: "#fff",
        backgroundColor: "#000",
        padding: { x: 10, y: 5 },
      });
  
      // Configura WebRTC
      this.setupWebRTC();
    }
  
    async setupWebRTC() {
      const configuration = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      };
      this.peerConnection = new RTCPeerConnection(configuration);
      this.iceCandidates = [];
  
      // Coleta ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.iceCandidates.push(event.candidate);
        } else {
          this.generateSignalingCode();
        }
      };
  
      // Canal de dados
      if (this.isHost) {
        this.dataChannel = this.peerConnection.createDataChannel("game");
        this.setupDataChannel();
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
      } else {
        this.peerConnection.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this.setupDataChannel();
        };
        const { offer, candidates } = JSON.parse(this.inviteCode);
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        for (const candidate of candidates) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.generateSignalingCode();
      }
    }
  
    generateSignalingCode() {
      const signalingData = {
        offer: this.isHost ? this.peerConnection.localDescription : null,
        answer: !this.isHost ? this.peerConnection.localDescription : null,
        candidates: this.iceCandidates,
      };
      const code = JSON.stringify(signalingData);
      const inviteLink = `${window.location.origin}${window.location.pathname}?convite=${encodeURIComponent(code)}`;
      this.showSignalingUI(inviteLink, code);
    }
  
    showSignalingUI(link, code) {
      const title = this.add.text(10, 100, this.isHost ? "Envie este link ao seu amigo!" : "Copie este código para o anfitrião!", {
        fontSize: "18px",
        color: "#fff",
        backgroundColor: "#000",
        padding: { x: 10, y: 5 },
      });
      const linkText = this.add.text(10, 130, link, {
        fontSize: "14px",
        color: "#00f",
        backgroundColor: "#000",
        padding: { x: 10, y: 5 },
        wordWrap: { width: 300 },
      });
      linkText.setInteractive();
      linkText.on("pointerdown", () => {
        navigator.clipboard.writeText(link);
        this.add.text(10, 200, "Link copiado!", {
          fontSize: "14px",
          color: "#0f0",
          backgroundColor: "#000",
          padding: { x: 10, y: 5 },
        });
      });
  
      // Botão de copiar
      const copyButton = document.createElement("button");
      copyButton.id = "copyButton";
      copyButton.className = "button";
      copyButton.innerText = "Copiar Link";
      copyButton.onclick = () => {
        navigator.clipboard.writeText(link);
        this.add.text(10, 220, "Link copiado!", {
          fontSize: "14px",
          color: "#0f0",
          backgroundColor: "#000",
          padding: { x: 10, y: 5 },
        });
      };
      document.body.appendChild(copyButton);
  
      // Campo para código (apenas anfitrião)
      if (this.isHost) {
        const input = document.createElement("textarea");
        input.placeholder = "Cole o código do seu amigo aqui";
        document.body.appendChild(input);
        input.onchange = () => {
          this.handleSignalingCode(input.value);
          input.remove();
          copyButton.remove();
        };
      } else {
        copyButton.remove();
      }
    }
  
    async handleSignalingCode(code) {
      const { answer, candidates } = JSON.parse(code);
      if (this.isHost && answer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        for (const candidate of candidates) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    }
  
    setupDataChannel() {
      this.dataChannel.onopen = () => {
        this.opponentConnected = true;
        this.statusText.setText("Conectado! Luta começou!");
        this.startGameTimer();
        this.sendInitialPosition();
      };
      this.dataChannel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "move") {
          this.player2.setPosition(data.x, data.y);
        } else if (data.type === "attack") {
          let damage = data.defending ? 5 : 10; // Defender reduz dano
          this.player1.setData("health", this.player1.getData("health") - damage);
          this.player1HealthBar.setText(`Vida P1: ${this.player1.getData("health")}`);
          if (this.player1.getData("health") <= 0) {
            this.endGame(this.isHost ? "Jogador 2 venceu!" : "Jogador 1 venceu!");
          }
        } else if (data.type === "health") {
          this.player2.setData("health", data.health);
          this.player2HealthBar.setText(`Vida P2: ${data.health}`);
        } else if (data.type === "rematch") {
          this.scene.restart({ isHost: this.isHost });
        } else if (data.type === "exit") {
          this.scene.start("MenuScene");
        }
      };
    }
  
    sendInitialPosition() {
      if (this.dataChannel.readyState === "open") {
        this.dataChannel.send(
          JSON.stringify({
            type: "move",
            x: this.player1.x,
            y: this.player1.y,
          })
        );
      }
    }
  
    startGameTimer() {
      this.player1HealthBar = this.add.text(10, 10, "Vida P1: 100", {
        fontSize: "20px",
        color: "#0f0",
      });
      this.player2HealthBar = this.add.text(600, 10, "Vida P2: 100", {
        fontSize: "20px",
        color: "#0f0",
      });
      this.timerText = this.add.text(350, 10, `Tempo: ${this.gameTime}`, {
        fontSize: "20px",
        color: "#fff",
      });
      this.timer = this.time.addEvent({
        delay: 1000,
        callback: () => {
          this.gameTime--;
          this.timerText.setText(`Tempo: ${this.gameTime}`);
          if (this.gameTime <= 0) {
            this.endGame("Tempo esgotado!");
          }
        },
        callbackScope: this,
        loop: true,
      });
    }
  
    update() {
      if (!this.opponentConnected) return;
  
      // Controles
      let defending = false;
      if (this.cursors.left.isDown) {
        this.player1.setVelocityX(-160);
      } else if (this.cursors.right.isDown) {
        this.player1.setVelocityX(160);
      } else {
        this.player1.setVelocityX(0);
      }
      if (this.cursors.up.isDown && this.player1.body.touching.down) {
        this.player1.setVelocityY(-300);
      }
      if (this.cursors.down.isDown) {
        defending = true;
        this.player1.setVelocityY(0);
      }
      if (this.cursors.attack.isDown && !this.attackCooldown) {
        this.attackCooldown = true;
        this.dataChannel.send(
          JSON.stringify({
            type: "attack",
            defending: this.cursors.down.isDown,
          })
        );
        this.time.delayedCall(500, () => {
          this.attackCooldown = false;
        });
      }
  
      // Envia posição e vida
      if (this.dataChannel.readyState === "open") {
        this.dataChannel.send(
          JSON.stringify({
            type: "move",
            x: this.player1.x,
            y: this.player1.y,
          })
        );
        this.dataChannel.send(
          JSON.stringify({
            type: "health",
            health: this.player1.getData("health"),
          })
        );
      }
    }
  
    endGame(message) {
      this.timer.remove();
      this.opponentConnected = false;
      this.add.text(200, 200, message, {
        fontSize: "32px",
        color: "#f00",
        backgroundColor: "#000",
        padding: { x: 10, y: 10 },
      });
  
      const rematchButton = this.add.text(250, 300, "Revanche?", {
        fontSize: "24px",
        color: "#0f0",
        backgroundColor: "#000",
        padding: { x: 10, y: 5 },
      });
      rematchButton.setInteractive();
      rematchButton.on("pointerdown", () => {
        if (this.dataChannel.readyState === "open") {
          this.dataChannel.send(JSON.stringify({ type: "rematch" }));
        }
        this.scene.restart({ isHost: this.isHost });
      });
  
      const exitButton = this.add.text(400, 300, "Sair", {
        fontSize: "24px",
        color: "#f00",
        backgroundColor: "#000",
        padding: { x: 10, y: 5 },
      });
      exitButton.setInteractive();
      exitButton.on("pointerdown", () => {
        if (this.dataChannel.readyState === "open") {
          this.dataChannel.send(JSON.stringify({ type: "exit" }));
        }
        this.scene.start("MenuScene");
      });
    }
  }
  
  const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
      default: "arcade",
      arcade: { gravity: { y: 500 } },
    },
    scene: [MenuScene, GameScene],
  };
  
  const game = new Phaser.Game(config);