import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8081 });
console.log('Mock WebSocket server listening on ws://localhost:8081');

const rooms = new Map();

wss.on('connection', (ws) => {
    let currentRoom = null;
    let playerId = null;

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log('Received:', msg);

            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
                return;
            }

            if (msg.type === 'join') {
                const { roomId, playerId: id } = msg.payload;
                currentRoom = roomId;
                playerId = id;

                if (!rooms.has(roomId)) {
                    rooms.set(roomId, []);
                }
                const roomPlayers = rooms.get(roomId);
                roomPlayers.push({ ws, id });

                console.log(`Player ${id} joined room ${roomId}`);

                // Send JOINED
                ws.send(JSON.stringify({
                    type: 'joined',
                    payload: {
                        userColor: roomPlayers.length === 1 ? 'white' : 'red',
                        isHost: roomPlayers.length === 1,
                        onlineOpponentConnected: roomPlayers.length > 1
                    }
                }));

                // Notify others
                roomPlayers.forEach(p => {
                    if (p.id !== id) {
                        p.ws.send(JSON.stringify({
                            type: 'joined',
                            payload: { onlineOpponentConnected: true }
                        }));
                    }
                });
            }

            if (msg.type === 'ready') {
                console.log(`Player ${playerId} is ready in room ${currentRoom}`);
                const roomPlayers = rooms.get(currentRoom) || [];
                if (roomPlayers.length === 2) {
                    console.log(`Starting game in room ${currentRoom}`);
                    roomPlayers.forEach(p => {
                        p.ws.send(JSON.stringify({ type: 'start' }));
                    });
                }
            }

            if (msg.type === 'STATE_SYNC') {
                const roomPlayers = rooms.get(currentRoom) || [];
                roomPlayers.forEach(p => {
                    if (p.id !== playerId) {
                        p.ws.send(JSON.stringify(msg));
                    }
                });
            }

        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', () => {
        if (currentRoom && playerId) {
            console.log(`Player ${playerId} disconnected from room ${currentRoom}`);
            const roomPlayers = rooms.get(currentRoom) || [];
            const index = roomPlayers.findIndex(p => p.id === playerId);
            if (index !== -1) roomPlayers.splice(index, 1);

            // Notify other
            roomPlayers.forEach(p => {
                p.ws.send(JSON.stringify({
                    type: 'STATE_SYNC',
                    payload: { onlineOpponentConnected: false }
                }));
            });
        }
    });
});
