const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restartBtn');
const hostBtn = document.getElementById('hostBtn');
const joinBtn = document.getElementById('joinBtn');
const joinCodeInput = document.getElementById('joinCodeInput');
const codeText = document.getElementById('codeText');

const PLAYER_NAME = { black: 'Walter', red: 'Dad' };

let board = [];
let currentTurn = 'black';
let selected = null;
let validMoves = [];
let gameOver = false;

let peer = null;
let connection = null;
let myColor = null;

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
    setStatus('Connect to start');
    return;
  }

  if (gameOver) return;

  const playerTurnName = PLAYER_NAME[currentTurn];
  if (isMyTurn()) {
    setStatus(`${playerTurnName}'s turn (your move)`);
  } else {
    setStatus(`${playerTurnName}'s turn (waiting)`);
  }
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
    sendMessage({
      type: 'move',
      fromRow,
      fromCol,
      move,
      nextTurn: currentTurn,
      selected,
      validMoves,
      gameOver,
      board
    });
  }
}

function restartGame(sendRestart = false) {
  board = createInitialBoard();
  currentTurn = 'black';
  selected = null;
  validMoves = [];
  gameOver = false;
  drawBoard();

  if (sendRestart) sendMessage({ type: 'restart', board, currentTurn });
}

function setConnectedState() {
  restartBtn.disabled = false;
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  joinCodeInput.disabled = true;
}

function bindConnectionHandlers(conn) {
  connection = conn;

  connection.on('open', () => {
    setConnectedState();
    updateStatus();
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
      drawBoard();
    }
  });

  connection.on('close', () => {
    setStatus('Connection closed. Refresh to start a new game.');
  });

  connection.on('error', () => {
    setStatus('Connection error. Refresh and try again.');
  });
}

function createPeer() {
  if (peer) return;
  peer = new Peer();

  peer.on('error', () => {
    setStatus('Network setup failed. Refresh and try again.');
  });

  peer.on('connection', (incomingConnection) => {
    myColor = 'black';
    codeText.textContent = `Game code: ${peer.id}`;
    bindConnectionHandlers(incomingConnection);
    restartGame(false);
  });
}

hostBtn.addEventListener('click', () => {
  createPeer();
  myColor = 'black';
  drawBoard();
  setStatus('Creating game...');
  peer.on('open', (id) => {
    codeText.textContent = `Share this code with Dad: ${id}`;
    setStatus('Waiting for Dad to join...');
  });
});

joinBtn.addEventListener('click', () => {
  const code = joinCodeInput.value.trim();
  if (!code) {
    setStatus('Enter a valid game code from Walter.');
    return;
  }

  createPeer();
  myColor = 'red';
  drawBoard();
  peer.on('open', () => {
    const conn = peer.connect(code);
    bindConnectionHandlers(conn);
    restartGame(false);
    codeText.textContent = `Connected to game: ${code}`;
  });
});

restartBtn.addEventListener('click', () => {
  if (!connection || !connection.open) return;
  restartGame(true);
});

board = createInitialBoard();
drawBoard();
