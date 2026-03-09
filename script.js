const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restartBtn');
const connectionText = document.getElementById('connectionText');

const PLAYER_NAME = { black: 'Walter', red: 'Dad' };
const ROOM_ID = 'walter-vs-dad-checkers-room';

let board = [];
let currentTurn = 'black';
let selected = null;
let validMoves = [];
let gameOver = false;

let peer = null;
let connection = null;
let myColor = null;
let audioContext = null;
let lastMyTurnState = null;
let flashTimeoutId = null;

function updateRestartVisibility() {
  restartBtn.style.display = myColor === 'red' ? 'inline-block' : 'none';
}

function ensureAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
}

function playTurnDing() {
  try {
    ensureAudioContext();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.1);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
  } catch (_) {
    // Ignore browser/device sound policy failures.
  }
}


function flashTurnScreen() {
  document.body.classList.add('turn-flash');
  if (flashTimeoutId) clearTimeout(flashTimeoutId);
  flashTimeoutId = setTimeout(() => {
    document.body.classList.remove('turn-flash');
    flashTimeoutId = null;
  }, 650);
}

function speakTurnAlert() {
  if (!('speechSynthesis' in window) || !myColor) return;

  try {
    window.speechSynthesis.cancel();
    const playerName = PLAYER_NAME[myColor];
    const utterance = new SpeechSynthesisUtterance(`It's your turn, ${playerName}`);
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (_) {
    // Ignore speech failures on unsupported/blocked browsers.
  }
}

function triggerTurnAlert() {
  playTurnDing();
  flashTurnScreen();
  speakTurnAlert();
}

function shouldFlipBoard() {
  return myColor === 'black';
}

function viewToModel(viewRow, viewCol) {
  if (!shouldFlipBoard()) return { row: viewRow, col: viewCol };
  return { row: 7 - viewRow, col: 7 - viewCol };
}

function createInitialBoard() {
  const freshBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) freshBoard[row][col] = { color: 'black', king: false };
    }
  }
  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) freshBoard[row][col] = { color: 'red', king: false };
    }
  }
  return freshBoard;
}

function insideBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getDirections(piece) {
  if (piece.king) return [1, -1];
  return piece.color === 'red' ? [-1] : [1];
}

function getPieceMoves(row, col) {
  const piece = board[row][col];
  if (!piece) return [];

  const moves = [];
  const directions = getDirections(piece);

  directions.forEach((rowStep) => {
    [-1, 1].forEach((colStep) => {
      const nextRow = row + rowStep;
      const nextCol = col + colStep;
      if (insideBoard(nextRow, nextCol) && !board[nextRow][nextCol]) {
        moves.push({ row: nextRow, col: nextCol, capture: null });
      }

      const jumpRow = row + rowStep * 2;
      const jumpCol = col + colStep * 2;
      if (!insideBoard(jumpRow, jumpCol) || board[jumpRow][jumpCol]) return;

      const middlePiece = board[nextRow]?.[nextCol];
      if (middlePiece && middlePiece.color !== piece.color) {
        moves.push({ row: jumpRow, col: jumpCol, capture: { row: nextRow, col: nextCol } });
      }
    });
  });

  return moves;
}

function getAllMoves(color) {
  const allMoves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col]?.color === color) allMoves.push(...getPieceMoves(row, col));
    }
  }
  return allMoves;
}

function isMyTurn() {
  return myColor && currentTurn === myColor;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function updateStatus() {
  if (!connection || !connection.open || !myColor) {
    lastMyTurnState = null;
    setStatus('Auto-connecting players...');
    return;
  }

  if (gameOver) return;

  const myTurnNow = isMyTurn();
  if (myTurnNow && lastMyTurnState === false) triggerTurnAlert();
  lastMyTurnState = myTurnNow;

  const playerTurnName = PLAYER_NAME[currentTurn];
  setStatus(myTurnNow ? `${playerTurnName}'s turn (your move)` : `${playerTurnName}'s turn (waiting)`);
}

function drawBoard() {
  boardEl.innerHTML = '';

  for (let viewRow = 0; viewRow < 8; viewRow++) {
    for (let viewCol = 0; viewCol < 8; viewCol++) {
      const { row, col } = viewToModel(viewRow, viewCol);
      const square = document.createElement('button');
      square.type = 'button';
      square.className = `square ${(viewRow + viewCol) % 2 === 0 ? 'light' : 'dark'}`;
      square.dataset.viewRow = viewRow;
      square.dataset.viewCol = viewCol;

      if (selected && selected.row === row && selected.col === col) square.classList.add('selected');

      const move = validMoves.find((m) => m.row === row && m.col === col);
      if (move) {
        square.classList.add('valid-move');
        if (move.capture) square.classList.add('capture');
      }

      const piece = board[row][col];
      if (piece) {
        const pieceEl = document.createElement('div');
        pieceEl.className = `piece ${piece.color}${piece.king ? ' king' : ''}`;
        pieceEl.textContent = piece.color === 'black' ? '67' : 'Dad';
        square.appendChild(pieceEl);
      }

      square.addEventListener('click', onSquareTap);
      boardEl.appendChild(square);
    }
  }

  updateStatus();
}

function sendMessage(payload) {
  if (connection && connection.open) connection.send(payload);
}

function onSquareTap(event) {
  if (!isMyTurn() || gameOver) return;

  const viewRow = Number(event.currentTarget.dataset.viewRow);
  const viewCol = Number(event.currentTarget.dataset.viewCol);
  const { row, col } = viewToModel(viewRow, viewCol);
  const piece = board[row][col];

  if (selected) {
    const move = validMoves.find((m) => m.row === row && m.col === col);
    if (move) {
      makeMove(selected.row, selected.col, move, true);
      return;
    }
  }

  if (piece && piece.color === currentTurn) {
    selected = { row, col };
    validMoves = getPieceMoves(row, col);
  } else {
    selected = null;
    validMoves = [];
  }

  drawBoard();
}

function finishTurnIfNoMoves() {
  if (getAllMoves(currentTurn).length === 0) {
    gameOver = true;
    const winnerColor = currentTurn === 'red' ? 'black' : 'red';
    setStatus(`${PLAYER_NAME[winnerColor]} wins!`);
    return true;
  }
  return false;
}

function makeMove(fromRow, fromCol, move, broadcast) {
  const piece = board[fromRow][fromCol];
  board[fromRow][fromCol] = null;
  board[move.row][move.col] = piece;
  if (move.capture) board[move.capture.row][move.capture.col] = null;

  if (piece.color === 'red' && move.row === 0) piece.king = true;
  if (piece.color === 'black' && move.row === 7) piece.king = true;

  let mustContinue = false;
  if (move.capture) {
    selected = { row: move.row, col: move.col };
    const chainedCaptures = getPieceMoves(move.row, move.col).filter((m) => m.capture);
    if (chainedCaptures.length > 0) {
      validMoves = chainedCaptures;
      mustContinue = true;
    }
  }

  if (!mustContinue) {
    selected = null;
    validMoves = [];
    currentTurn = currentTurn === 'red' ? 'black' : 'red';
    finishTurnIfNoMoves();
  }

  drawBoard();

  if (broadcast) {
    sendMessage({ type: 'move', board, nextTurn: currentTurn, gameOver });
  }
}

function restartGame(sendRestart = false) {
  board = createInitialBoard();
  currentTurn = 'black';
  selected = null;
  validMoves = [];
  gameOver = false;
  lastMyTurnState = null;
  drawBoard();

  if (sendRestart) sendMessage({ type: 'restart', board, currentTurn });
}

function setConnectedState() {
  updateRestartVisibility();
  restartBtn.disabled = myColor !== 'red';
}

function bindConnectionHandlers(conn) {
  connection = conn;

  connection.on('open', () => {
    setConnectedState();
    connectionText.textContent = `Connected: You are ${PLAYER_NAME[myColor]}.`;
    drawBoard();
  });

  connection.on('data', (data) => {
    if (data.type === 'move') {
      board = data.board;
      currentTurn = data.nextTurn;
      selected = null;
      validMoves = [];
      gameOver = data.gameOver;
      drawBoard();
      if (gameOver) {
        const winner = currentTurn === 'red' ? 'Walter' : 'Dad';
        setStatus(`${winner} wins!`);
      }
    }

    if (data.type === 'restart') {
      board = data.board;
      currentTurn = data.currentTurn;
      selected = null;
      validMoves = [];
      gameOver = false;
      lastMyTurnState = null;
      drawBoard();
    }
  });

  connection.on('close', () => {
    setStatus('Connection closed. Refresh to auto-reconnect.');
    connectionText.textContent = 'Disconnected.';
    restartBtn.disabled = true;
    updateRestartVisibility();
  });

  connection.on('error', () => {
    setStatus('Connection error. Refresh and try again.');
  });
}

function becomeWalterHost() {
  myColor = 'black';
  updateRestartVisibility();
  peer = new Peer(ROOM_ID);
  connectionText.textContent = 'You are Walter. Waiting for Dad to auto-join...';

  peer.on('open', () => {
    setStatus('Waiting for Dad to join...');
  });

  peer.on('connection', (incomingConnection) => {
    bindConnectionHandlers(incomingConnection);
    restartGame(false);
  });

  peer.on('error', (error) => {
    if (error.type === 'peer-unavailable') return;
    setStatus('Network error. Refresh and retry.');
  });
}

function becomeDadJoiner() {
  myColor = 'red';
  updateRestartVisibility();
  peer = new Peer();
  connectionText.textContent = 'You are Dad. Auto-joining Walter...';

  peer.on('open', () => {
    const conn = peer.connect(ROOM_ID, { reliable: true });
    bindConnectionHandlers(conn);
    restartGame(false);
  });

  peer.on('error', () => {
    setStatus('Unable to auto-join. Refresh both devices and retry.');
  });
}

function autoJoinGame() {
  const probe = new Peer(ROOM_ID);

  probe.on('open', () => {
    probe.destroy();
    becomeWalterHost();
  });

  probe.on('error', (error) => {
    probe.destroy();
    if (error.type === 'unavailable-id') {
      becomeDadJoiner();
      return;
    }
    setStatus('Auto-join failed. Refresh and retry.');
  });
}

restartBtn.addEventListener('click', () => {
  if (!connection || !connection.open) return;
  restartGame(true);
});

document.addEventListener('pointerdown', ensureAudioContext, { passive: true });
document.addEventListener('keydown', ensureAudioContext);

updateRestartVisibility();
restartBtn.disabled = true;
board = createInitialBoard();
drawBoard();
autoJoinGame();
