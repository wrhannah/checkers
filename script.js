const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restartBtn');

let board = [];
let currentTurn = 'red';
let selected = null;
let validMoves = [];

function createInitialBoard() {
  const freshBoard = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        freshBoard[row][col] = { color: 'black', king: false };
      }
    }
  }

  for (let row = 5; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        freshBoard[row][col] = { color: 'red', king: false };
      }
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

      const middlePiece = insideBoard(nextRow, nextCol) ? board[nextRow][nextCol] : null;
      if (middlePiece && middlePiece.color !== piece.color) {
        moves.push({
          row: jumpRow,
          col: jumpCol,
          capture: { row: nextRow, col: nextCol }
        });
      }
    });
  });

  return moves;
}

function getAllMoves(color) {
  const allMoves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === color) {
        allMoves.push(...getPieceMoves(row, col));
      }
    }
  }
  return allMoves;
}

function drawBoard() {
  boardEl.innerHTML = '';

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement('button');
      square.type = 'button';
      square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
      square.dataset.row = row;
      square.dataset.col = col;
      square.setAttribute('aria-label', `Row ${row + 1}, Column ${col + 1}`);

      if (selected && selected.row === row && selected.col === col) {
        square.classList.add('selected');
      }

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

  statusEl.textContent = `${capitalize(currentTurn)}'s turn`;
}

function onSquareTap(event) {
  const row = Number(event.currentTarget.dataset.row);
  const col = Number(event.currentTarget.dataset.col);
  const piece = board[row][col];

  if (selected) {
    const move = validMoves.find((m) => m.row === row && m.col === col);
    if (move) {
      makeMove(selected.row, selected.col, move);
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

function makeMove(fromRow, fromCol, move) {
  const piece = board[fromRow][fromCol];
  board[fromRow][fromCol] = null;
  board[move.row][move.col] = piece;

  if (move.capture) {
    board[move.capture.row][move.capture.col] = null;
  }

  if (piece.color === 'red' && move.row === 0) {
    piece.king = true;
  }

  if (piece.color === 'black' && move.row === 7) {
    piece.king = true;
  }

  if (move.capture) {
    selected = { row: move.row, col: move.col };
    const chainedCaptures = getPieceMoves(move.row, move.col).filter((m) => m.capture);
    if (chainedCaptures.length > 0) {
      validMoves = chainedCaptures;
      drawBoard();
      return;
    }
  }

  selected = null;
  validMoves = [];
  currentTurn = currentTurn === 'red' ? 'black' : 'red';

  if (getAllMoves(currentTurn).length === 0) {
    statusEl.textContent = `${capitalize(currentTurn === 'red' ? 'black' : 'red')} wins!`;
  } else {
    drawBoard();
  }
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function restartGame() {
  board = createInitialBoard();
  currentTurn = 'red';
  selected = null;
  validMoves = [];
  drawBoard();
}

restartBtn.addEventListener('click', restartGame);
restartGame();
