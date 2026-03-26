const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;

// ── HTTP server (Render health check용) ──
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('FLUX Game Server OK');
});

const wss = new WebSocketServer({ server });

// ── 방 관리 ──
// rooms: { roomCode: { host: ws, guest: ws | null, hostNick: string, guestNick: string } }
const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function getOpponent(room, ws) {
  return room.host === ws ? room.guest : room.host;
}

wss.on('connection', (ws) => {
  ws._roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.t) {

      // ── 방 만들기 ──
      case 'create': {
        // 기존 방 정리
        if (ws._roomCode) leaveRoom(ws);

        let code;
        do { code = genCode(); } while (rooms.has(code));

        rooms.set(code, { host: ws, guest: null, hostNick: msg.nick || '호스트', guestNick: '' });
        ws._roomCode = code;
        ws._role = 'host';

        send(ws, { t: 'created', code });
        console.log(`[+] Room created: ${code}`);
        break;
      }

      // ── 방 참가 ──
      case 'join': {
        const code = (msg.code || '').toUpperCase();
        const room = rooms.get(code);

        if (!room) {
          send(ws, { t: 'err', msg: '방을 찾을 수 없습니다. 코드를 확인하세요.' });
          return;
        }
        if (room.guest) {
          send(ws, { t: 'err', msg: '이미 가득 찬 방입니다.' });
          return;
        }

        room.guest = ws;
        room.guestNick = msg.nick || '게스트';
        ws._roomCode = code;
        ws._role = 'guest';

        // 게스트에게 참가 성공 알림
        send(ws, { t: 'joined', code, oppNick: room.hostNick });
        // 호스트에게 상대 입장 알림
        send(room.host, { t: 'opponent_joined', oppNick: room.guestNick });

        console.log(`[+] Guest joined room: ${code}`);
        break;
      }

      // ── 게임 중 메시지 릴레이 ──
      // drop, rot, restart, sync, ping, pong, nick
      case 'drop':
      case 'rot':
      case 'restart':
      case 'sync':
      case 'ping':
      case 'pong':
      case 'nick': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const opp = getOpponent(room, ws);
        send(opp, msg);
        break;
      }
    }
  });

  ws.on('close', () => {
    const code = ws._roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    const opp = getOpponent(room, ws);
    send(opp, { t: 'opp_left' });

    // 방 삭제
    rooms.delete(code);
    console.log(`[-] Room closed: ${code}`);
  });

  ws.on('error', () => {});
});

server.listen(PORT, () => {
  console.log(`FLUX server running on port ${PORT}`);
});
