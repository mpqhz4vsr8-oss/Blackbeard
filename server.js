const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ── GAME STATE ──
function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let state = {
  phase: 'lobby',        // 'lobby' | 'game'
  playerCount: 0,
  players: [],           // [{id, name}]
  deck: [],              // array of card indices, remaining
  currentCard: null,     // card index
  currentPlayer: null,   // player name
  cardsDrawn: 0,
};

function freshDeck() {
  return shuffle([...Array(40).keys()]);
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(data); });
}

function sendState(ws) {
  ws.send(JSON.stringify({ type: 'state', state }));
}

// ── WEBSOCKET ──
wss.on('connection', ws => {
  // Send current state to new connection
  sendState(ws);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'join': {
        // Player joins with a name
        const name = (msg.name || 'Pirate').trim().slice(0, 20);
        if (!state.players.find(p => p.name === name)) {
          state.players.push({ name });
        }
        broadcast({ type: 'state', state });
        break;
      }

      case 'start': {
        // Host starts the game
        if (state.players.length < 2) return;
        state.phase = 'game';
        state.playerCount = state.players.length;
        state.deck = freshDeck();
        state.currentCard = null;
        state.currentPlayer = null;
        state.cardsDrawn = 0;
        broadcast({ type: 'state', state });
        break;
      }

      case 'draw': {
        if (state.phase !== 'game') return;
        if (state.deck.length === 0) return;
        const cardIdx = state.deck.pop();
        state.currentCard = cardIdx;
        state.cardsDrawn++;
        // Determine active player from skull data
        const pos = ACTIVE[state.playerCount] ? ACTIVE[state.playerCount][cardIdx] : 1;
        const playerIdx = (pos || 1) - 1;
        state.currentPlayer = state.players[playerIdx]
          ? state.players[playerIdx].name
          : state.players[0].name;
        broadcast({ type: 'state', state });
        break;
      }

      case 'shuffle': {
        if (state.phase !== 'game') return;
        state.deck = freshDeck();
        state.currentCard = null;
        state.cardsDrawn = 0;
        broadcast({ type: 'state', state });
        break;
      }

      case 'reset': {
        state = {
          phase: 'lobby',
          playerCount: 0,
          players: [],
          deck: [],
          currentCard: null,
          currentPlayer: null,
          cardsDrawn: 0,
        };
        broadcast({ type: 'state', state });
        break;
      }
    }
  });

  ws.on('close', () => {});
});

// ── ACTIVE PLAYER TABLE (mirrors client) ──
const ACTIVE = {
  2: [1,1,1,1,1,1, 1,1,1,1,1,1, 2,2,2,2,2,2, 1,1,1,1,1,1, 1,1,1,1,1,1, 1,1,1,1,1,1, 2,2,2,2],
  3: [2,2,2,2,2,2, 2,2,2,2,2,2, 1,1,1,1,1,1, 2,2,2,2,2,2, 3,3,3,3,3,3, 1,1,1,1,1,1, 2,2,2,2],
  4: [3,3,3,3,3,3, 4,4,4,4,4,4, 1,1,1,1,1,1, 2,2,2,2,2,2, 3,3,3,3,3,3, 4,4,4,4,4,4, 4,4,4,4],
};

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Blackbeard server running on port ${PORT}`));
