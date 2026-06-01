// ============================================
// OVERCOOKED ONLINE - Client
// ============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Connection
let ws = null;
let myPlayerId = -1;
let roomCode = '';
let isHost = false;

// Game state (received from server)
let gameState = {
    players: [],
    worldItems: [],
    orders: [],
    score: 0,
    timeLeft: 120,
    gameRunning: false,
};

// Grid
const COLS = 12;
const ROWS = 8;
let TILE_SIZE = 64;

// Input
const keys = {};
const joystick = { active: false, dx: 0, dy: 0 };
let inputDx = 0, inputDy = 0;
let sendInteract = false;
let sendDrop = false;

// Map (same as server, for rendering)
const TILE = {
    FLOOR: 0, WALL: 1, COUNTER: 2, STOVE: 3,
    INGREDIENT_TOMATO: 4, INGREDIENT_LETTUCE: 5, INGREDIENT_MEAT: 6,
    CUTTING_BOARD: 7, PLATE_STACK: 8, SERVING: 9, TRASH: 10
};

const MAP = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 4, 5, 6, 2, 2, 2, 8, 2, 7, 7, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 3, 3, 3, 2, 10, 2, 2, 9, 9, 9, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const TILE_COLORS = {
    [TILE.FLOOR]: '#8B7355',
    [TILE.WALL]: '#4a3728',
    [TILE.COUNTER]: '#A0896E',
    [TILE.STOVE]: '#555555',
    [TILE.INGREDIENT_TOMATO]: '#cc4444',
    [TILE.INGREDIENT_LETTUCE]: '#44aa44',
    [TILE.INGREDIENT_MEAT]: '#aa6633',
    [TILE.CUTTING_BOARD]: '#c4a882',
    [TILE.PLATE_STACK]: '#dddddd',
    [TILE.SERVING]: '#ffcc00',
    [TILE.TRASH]: '#333333',
};

const ITEM_EMOJI = {
    'tomato': '🍅', 'lettuce': '🥬', 'meat': '🥩',
    'chopped_tomato': '🍅✓', 'chopped_lettuce': '🥬✓',
    'cooked_meat': '🍖', 'burning_meat': '🔥',
    'plate': '🍽️', 'salad': '🥗', 'burger': '🍔', 'soup': '🍲',
};

const RECIPE_EMOJI = { 'salad_simple': '🥗', 'salad': '🥗', 'burger': '🍔', 'soup': '🍲' };

// ============================================
// WEBSOCKET CONNECTION
// ============================================
function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/overcooked-ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
        showStatus('Terhubung ✓');
        setTimeout(() => hideStatus(), 2000);
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };

    ws.onclose = () => {
        showStatus('Terputus... Reconnecting...');
        setTimeout(connect, 2000);
    };

    ws.onerror = () => {
        showStatus('Koneksi error');
    };
}

function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'roomCreated':
            roomCode = msg.code;
            myPlayerId = msg.playerId;
            isHost = true;
            showLobby();
            break;

        case 'roomJoined':
            roomCode = msg.code;
            myPlayerId = msg.playerId;
            isHost = false;
            showLobby();
            break;

        case 'lobby':
            updateLobbyUI(msg);
            break;

        case 'gameStarted':
            showGame();
            break;

        case 'state':
            gameState = msg;
            break;

        case 'gameOver':
            showGameOver(msg.score);
            break;

        case 'paused':
            document.getElementById('pause-screen').classList.remove('hidden');
            break;

        case 'resumed':
            document.getElementById('pause-screen').classList.add('hidden');
            document.getElementById('recipe-guide').classList.add('hidden');
            break;

        case 'error':
            showError(msg.message);
            break;
    }
}

// ============================================
// UI MANAGEMENT
// ============================================
function showScreen(id) {
    ['menu-screen', 'lobby-screen', 'game-over-screen'].forEach(s => {
        document.getElementById(s).classList.add('hidden');
    });
    if (id) document.getElementById(id).classList.remove('hidden');
}

function showLobby() {
    showScreen('lobby-screen');
    document.getElementById('lobby-code').textContent = roomCode;
    document.getElementById('btn-start-game').classList.toggle('hidden', !isHost);
    document.getElementById('lobby-info').classList.toggle('hidden', isHost);
}

function updateLobbyUI(msg) {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    for (const p of msg.players) {
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerHTML = `
            <div class="player-dot" style="background:${p.color}"></div>
            <span>${p.name}</span>
            ${p.id === 0 ? '<span class="host-badge">HOST</span>' : ''}
        `;
        list.appendChild(div);
    }
    // Update host status in case of reconnect
    isHost = (myPlayerId === 0);
    document.getElementById('btn-start-game').classList.toggle('hidden', !isHost);
    document.getElementById('lobby-info').classList.toggle('hidden', isHost);
}

function showGame() {
    showScreen(null);
    document.getElementById('ui-overlay').classList.remove('hidden');
    document.getElementById('orders-display').classList.remove('hidden');
    document.getElementById('recipe-mini').classList.remove('hidden');
    document.getElementById('recipe-guide').classList.remove('hidden');
    if (window.innerWidth < 769) {
        document.getElementById('mobile-controls').classList.remove('hidden');
    }
    resizeCanvas();
    requestAnimationFrame(renderLoop);
}

function showGameOver(finalScore) {
    document.getElementById('mobile-controls').classList.add('hidden');
    document.getElementById('final-score').textContent = finalScore;
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('btn-restart').classList.toggle('hidden', !isHost);
}

function showError(message) {
    document.getElementById('menu-error').textContent = message;
    setTimeout(() => {
        document.getElementById('menu-error').textContent = '';
    }, 3000);
}

function showStatus(text) {
    const el = document.getElementById('connection-status');
    el.classList.remove('hidden');
    document.getElementById('status-text').textContent = text;
}

function hideStatus() {
    document.getElementById('connection-status').classList.add('hidden');
}

// ============================================
// CANVAS RESIZE
// ============================================
function resizeCanvas() {
    const isMobile = window.innerWidth < 769;
    if (isMobile) {
        const controlsHeight = 170;
        const availableHeight = window.innerHeight - controlsHeight;
        const availableWidth = window.innerWidth;

        const scaleX = availableWidth / (COLS * 64);
        const scaleY = availableHeight / (ROWS * 64);
        const scale = Math.min(scaleX, scaleY, 1.5);

        TILE_SIZE = Math.floor(64 * scale);
        canvas.width = COLS * TILE_SIZE;
        canvas.height = ROWS * TILE_SIZE;
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';
    } else {
        TILE_SIZE = 64;
        canvas.width = COLS * TILE_SIZE;
        canvas.height = ROWS * TILE_SIZE;
        canvas.style.width = '';
        canvas.style.height = '';
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ============================================
// INPUT - Keyboard
// ============================================
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'e' || e.key === '/') sendInteract = true;
    if (e.key.toLowerCase() === 'q' || e.key === '.') sendDrop = true;
});

document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// ============================================
// INPUT - Touch Joystick
// ============================================
const joystickBase = document.getElementById('joystick-base');
const joystickThumb = document.getElementById('joystick-thumb');
const joystickArea = document.getElementById('joystick-area');

let joystickCenter = { x: 0, y: 0 };
const JOYSTICK_RADIUS = 35;

function getJoystickCenter() {
    const rect = joystickBase.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

joystickArea.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joystick.active = true;
    joystickCenter = getJoystickCenter();
    handleJoystickMove(e.touches[0]);
});

joystickArea.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (joystick.active) handleJoystickMove(e.touches[0]);
});

joystickArea.addEventListener('touchend', (e) => {
    e.preventDefault();
    joystick.active = false;
    joystick.dx = 0;
    joystick.dy = 0;
    joystickThumb.style.transform = 'translate(0px, 0px)';
});

function handleJoystickMove(touch) {
    const dx = touch.clientX - joystickCenter.x;
    const dy = touch.clientY - joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = JOYSTICK_RADIUS;

    let clampedX = dx, clampedY = dy;
    if (dist > maxDist) {
        clampedX = (dx / dist) * maxDist;
        clampedY = (dy / dist) * maxDist;
    }

    joystickThumb.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
    joystick.dx = clampedX / maxDist;
    joystick.dy = clampedY / maxDist;
}

document.getElementById('btn-interact').addEventListener('touchstart', (e) => {
    e.preventDefault();
    sendInteract = true;
});

document.getElementById('btn-drop').addEventListener('touchstart', (e) => {
    e.preventDefault();
    sendDrop = true;
});

// ============================================
// INPUT SENDING (throttled)
// ============================================
setInterval(() => {
    if (!gameState.gameRunning) return;

    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    if (joystick.active) {
        const deadzone = 0.2;
        if (Math.abs(joystick.dx) > deadzone) dx += joystick.dx;
        if (Math.abs(joystick.dy) > deadzone) dy += joystick.dy;
    }

    const msg = { type: 'input', dx, dy };
    if (sendInteract) { msg.interact = true; sendInteract = false; }
    if (sendDrop) { msg.drop = true; sendDrop = false; }

    send(msg);
}, 1000 / 20); // 20 times per second

// ============================================
// RENDER
// ============================================
function renderLoop() {
    render();
    updateHUD();
    requestAnimationFrame(renderLoop);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = TILE_SIZE / 64;

    // Draw tiles with better visuals
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const tile = MAP[y][x];
            const tx = x * TILE_SIZE;
            const ty = y * TILE_SIZE;
            const cx = tx + TILE_SIZE / 2;
            const cy = ty + TILE_SIZE / 2;

            // Base tile
            if (tile === TILE.WALL) {
                ctx.fillStyle = '#3d2b1f';
                ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#4a3728';
                ctx.fillRect(tx + 2, ty + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                // Brick pattern
                ctx.strokeStyle = '#2d1f15';
                ctx.lineWidth = 1;
                ctx.strokeRect(tx + 4, ty + 4, TILE_SIZE / 2 - 4, TILE_SIZE / 2 - 4);
                ctx.strokeRect(tx + TILE_SIZE / 2, ty + TILE_SIZE / 2, TILE_SIZE / 2 - 4, TILE_SIZE / 2 - 4);
            } else if (tile === TILE.FLOOR) {
                ctx.fillStyle = '#a08060';
                ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#96775a';
                ctx.fillRect(tx + 1, ty + 1, TILE_SIZE - 2, TILE_SIZE - 2);
                // Wood grain
                ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(tx, ty + TILE_SIZE * (i + 1) / 4);
                    ctx.lineTo(tx + TILE_SIZE, ty + TILE_SIZE * (i + 1) / 4);
                    ctx.stroke();
                }
            } else if (tile === TILE.COUNTER) {
                drawCounter(tx, ty);
            } else if (tile === TILE.STOVE) {
                drawStove(tx, ty);
            } else if (tile === TILE.INGREDIENT_TOMATO) {
                drawCounter(tx, ty);
                drawIngredientBox(cx, cy, '#e53935', '🍅');
            } else if (tile === TILE.INGREDIENT_LETTUCE) {
                drawCounter(tx, ty);
                drawIngredientBox(cx, cy, '#43a047', '🥬');
            } else if (tile === TILE.INGREDIENT_MEAT) {
                drawCounter(tx, ty);
                drawIngredientBox(cx, cy, '#8d6e63', '🥩');
            } else if (tile === TILE.CUTTING_BOARD) {
                drawCounter(tx, ty);
                // Cutting board
                ctx.fillStyle = '#d4a574';
                const bw = TILE_SIZE * 0.6, bh = TILE_SIZE * 0.4;
                ctx.fillRect(cx - bw/2, cy - bh/2, bw, bh);
                ctx.strokeStyle = '#a0764a';
                ctx.lineWidth = 2;
                ctx.strokeRect(cx - bw/2, cy - bh/2, bw, bh);
                // Knife
                ctx.fillStyle = '#bbb';
                ctx.fillRect(cx + bw/2 - 4, cy - bh/2 - 6, 3, 14);
                ctx.fillStyle = '#5d4037';
                ctx.fillRect(cx + bw/2 - 5, cy - bh/2 + 6, 5, 8);
            } else if (tile === TILE.PLATE_STACK) {
                drawCounter(tx, ty);
                // Stack of plates
                for (let i = 0; i < 3; i++) {
                    ctx.fillStyle = `rgba(255,255,255,${0.7 + i * 0.1})`;
                    ctx.beginPath();
                    ctx.ellipse(cx, cy - i * 3 + 4, TILE_SIZE * 0.25, TILE_SIZE * 0.12, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ccc';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            } else if (tile === TILE.SERVING) {
                ctx.fillStyle = '#f9a825';
                ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#f57f17';
                ctx.fillRect(tx + 2, ty + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                // Arrow up icon
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(cx, cy - 10);
                ctx.lineTo(cx - 8, cy + 2);
                ctx.lineTo(cx + 8, cy + 2);
                ctx.closePath();
                ctx.fill();
                ctx.fillRect(cx - 3, cy + 2, 6, 10);
            } else if (tile === TILE.TRASH) {
                drawCounter(tx, ty);
                ctx.fillStyle = '#444';
                const tw = TILE_SIZE * 0.4, th = TILE_SIZE * 0.5;
                ctx.fillRect(cx - tw/2, cy - th/2 + 4, tw, th);
                ctx.fillStyle = '#666';
                ctx.fillRect(cx - tw/2 - 2, cy - th/2, tw + 4, 6);
                // Lines on trash
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1;
                for (let i = 1; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(cx - tw/2 + i * tw/3, cy - th/2 + 10);
                    ctx.lineTo(cx - tw/2 + i * tw/3, cy + th/2);
                    ctx.stroke();
                }
            }
        }
    }

    // Draw world items
    for (const wi of gameState.worldItems) {
        const cx = wi.gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = wi.gridY * TILE_SIZE + TILE_SIZE / 2;

        if (wi.item.type === 'plate') {
            drawPlate(cx, cy, wi.item.contents || []);
        } else {
            drawFoodItem(wi.item.type, cx, cy);
        }

        // Progress bars
        if (wi.chopping && wi.chopTimer > 0) {
            drawProgressBar(cx, cy + TILE_SIZE * 0.38, 1 - wi.chopTimer / 2, '#4caf50', '#a5d6a7');
        }
        if (wi.cooking && wi.cookTimer > 0) {
            drawProgressBar(cx, cy + TILE_SIZE * 0.38, 1 - wi.cookTimer / 4, '#ff9800', '#ffe0b2');
        }
        if (wi.burning && wi.burnTimer > 0) {
            drawProgressBar(cx, cy + TILE_SIZE * 0.38, 1 - wi.burnTimer / 6, '#f44336', '#ef9a9a');
        }
    }

    // Draw players (sorted by Y for depth)
    const sortedPlayers = [...gameState.players].sort((a, b) => a.y - b.y);
    for (const p of sortedPlayers) {
        drawChef(p, scale);
    }
}

function drawCounter(tx, ty) {
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#a1887f';
    ctx.fillRect(tx + 3, ty + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    // Top surface highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(tx + 3, ty + 3, TILE_SIZE - 6, TILE_SIZE / 3);
}

function drawStove(tx, ty) {
    ctx.fillStyle = '#424242';
    ctx.fillRect(tx, ty, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#616161';
    ctx.fillRect(tx + 3, ty + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    // Burner rings
    const cx = tx + TILE_SIZE / 2, cy = ty + TILE_SIZE / 2;
    ctx.strokeStyle = '#ff5722';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, TILE_SIZE * 0.12, 0, Math.PI * 2);
    ctx.stroke();
}

function drawIngredientBox(cx, cy, color, emoji) {
    ctx.fillStyle = color;
    const s = TILE_SIZE * 0.45;
    ctx.beginPath();
    ctx.roundRect(cx - s/2, cy - s/2, s, s, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Emoji on top
    const fontSize = Math.max(14, TILE_SIZE * 0.35);
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);
}

function drawFoodItem(type, cx, cy) {
    const size = TILE_SIZE * 0.35;
    const emoji = ITEM_EMOJI[type] || '❓';
    const fontSize = Math.max(14, TILE_SIZE * 0.38);
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);
    
    // Chopped indicator
    if (type.startsWith('chopped_')) {
        ctx.fillStyle = '#4caf50';
        ctx.font = `${Math.max(8, TILE_SIZE * 0.15)}px Arial`;
        ctx.fillText('✓', cx + size * 0.7, cy - size * 0.5);
    }
}

function drawPlate(cx, cy, contents) {
    // Plate base
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, TILE_SIZE * 0.28, TILE_SIZE * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Contents on plate
    if (contents.length > 0) {
        const smallSize = Math.max(10, TILE_SIZE * 0.22);
        ctx.font = `${smallSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < contents.length; i++) {
            const emoji = ITEM_EMOJI[contents[i]] || '?';
            const offsetX = (i - (contents.length - 1) / 2) * smallSize * 0.7;
            ctx.fillText(emoji, cx + offsetX, cy - 2);
        }
    }
}

function drawChef(p, scale) {
    const px = p.x * scale;
    const py = p.y * scale;
    const size = TILE_SIZE * 0.55;
    const halfSize = size / 2;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(px, py + halfSize * 0.8, halfSize * 0.7, halfSize * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (rounded rectangle)
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.roundRect(px - halfSize * 0.7, py - halfSize * 0.3, size * 0.7, size * 0.8, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Head
    const headRadius = halfSize * 0.45;
    const headY = py - halfSize * 0.5;
    ctx.fillStyle = '#ffcc80'; // skin
    ctx.beginPath();
    ctx.arc(px, headY, headRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Chef hat
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.roundRect(px - headRadius * 0.9, headY - headRadius * 1.8, headRadius * 1.8, headRadius * 1.2, 4);
    ctx.fill();
    // Hat brim
    ctx.fillRect(px - headRadius * 1.1, headY - headRadius * 0.7, headRadius * 2.2, headRadius * 0.35);
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - headRadius * 1.1, headY - headRadius * 0.7, headRadius * 2.2, headRadius * 0.35);

    // Eyes
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(px - headRadius * 0.3, headY, 2, 0, Math.PI * 2);
    ctx.arc(px + headRadius * 0.3, headY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Facing indicator (small arrow)
    const indicatorDist = halfSize + 6;
    const ix = px + p.facing.x * indicatorDist;
    const iy = py + p.facing.y * indicatorDist;
    ctx.fillStyle = p.id === myPlayerId ? '#ffd700' : 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(ix, iy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Highlight self
    if (p.id === myPlayerId) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(px, py, halfSize + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Name tag
    ctx.font = `bold ${Math.max(9, TILE_SIZE * 0.17)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(px - ctx.measureText(p.name).width / 2 - 4, py + halfSize + 4, ctx.measureText(p.name).width + 8, 14);
    ctx.fillStyle = '#fff';
    ctx.fillText(p.name, px, py + halfSize + 11);

    // Held item (above head)
    if (p.holding) {
        const hx = px;
        const hy = py - size * 0.9;
        // Item bubble
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(hx, hy, TILE_SIZE * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        if (p.holding.type === 'plate') {
            const contents = p.holding.contents || [];
            if (contents.length > 0) {
                const smallSize = Math.max(8, TILE_SIZE * 0.16);
                ctx.font = `${smallSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                for (let i = 0; i < contents.length; i++) {
                    const emoji = ITEM_EMOJI[contents[i]] || '?';
                    const offsetX = (i - (contents.length - 1) / 2) * smallSize * 0.6;
                    ctx.fillText(emoji, hx + offsetX, hy);
                }
            } else {
                drawEmoji('🍽️', hx, hy);
            }
        } else {
            const emoji = ITEM_EMOJI[p.holding.type] || '❓';
            drawEmoji(emoji, hx, hy);
        }
    }
}

function drawEmoji(emoji, x, y) {
    const fontSize = Math.max(14, TILE_SIZE * 0.4);
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, x, y);
}

function drawProgressBar(x, y, progress, color, bgColor) {
    const w = TILE_SIZE * 0.7;
    const h = 6;
    const radius = 3;
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, h, radius);
    ctx.fill();
    // Fill
    const fillW = w * Math.max(0, Math.min(1, progress));
    if (fillW > 0) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y, fillW, h, radius);
        ctx.fill();
    }
    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, h, radius);
    ctx.stroke();
}

function updateHUD() {
    document.getElementById('score-display').textContent = `⭐ ${gameState.score}`;
    const mins = Math.floor(gameState.timeLeft / 60);
    const secs = Math.ceil(gameState.timeLeft % 60);
    document.getElementById('timer-display').textContent = `⏱ ${mins}:${secs.toString().padStart(2, '0')}`;

    const ordersEl = document.getElementById('orders-display');
    ordersEl.innerHTML = '';
    for (const order of gameState.orders) {
        const card = document.createElement('div');
        card.className = 'order-card' + (order.timeLeft < 10 ? ' urgent' : '');
        const emoji = RECIPE_EMOJI[order.recipe] || '?';
        card.textContent = `${emoji} ${Math.ceil(order.timeLeft)}s`;
        ordersEl.appendChild(card);
    }
}

// ============================================
// MENU EVENT LISTENERS
// ============================================
document.getElementById('btn-create').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim() || 'Chef';
    send({ type: 'createRoom' });
    setTimeout(() => send({ type: 'setName', name }), 200);
});

document.getElementById('btn-join').addEventListener('click', () => {
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length !== 4) {
        showError('Kode room harus 4 karakter');
        return;
    }
    const name = document.getElementById('player-name').value.trim() || 'Chef';
    send({ type: 'joinRoom', code });
    setTimeout(() => send({ type: 'setName', name }), 200);
});

document.getElementById('btn-start-game').addEventListener('click', () => {
    send({ type: 'startGame' });
});

document.getElementById('btn-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode).then(() => {
        document.getElementById('btn-copy-code').textContent = '✅';
        setTimeout(() => {
            document.getElementById('btn-copy-code').textContent = '📋';
        }, 1500);
    });
});

document.getElementById('btn-restart').addEventListener('click', () => {
    send({ type: 'restart' });
});

document.getElementById('btn-back-lobby').addEventListener('click', () => {
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('ui-overlay').classList.add('hidden');
    document.getElementById('orders-display').classList.add('hidden');
    showLobby();
});

// Pause button - handled via inline onclick in HTML

// Resume button
document.getElementById('btn-resume').addEventListener('click', () => {
    send({ type: 'resume' });
});

// Close recipe guide
document.getElementById('btn-close-recipe').addEventListener('click', () => {
    document.getElementById('recipe-guide').classList.add('hidden');
});

// Show recipe from pause
document.getElementById('btn-show-recipe').addEventListener('click', () => {
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('recipe-guide').classList.remove('hidden');
});

// Handle URL room code (e.g., ?room=ABCD)
function checkUrlRoom() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
        document.getElementById('room-code-input').value = code.toUpperCase();
    }
}

// ============================================
// INIT
// ============================================
checkUrlRoom();
connect();
requestAnimationFrame(renderLoop);
