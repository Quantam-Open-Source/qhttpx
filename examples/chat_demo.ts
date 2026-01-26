
import { Q } from '../src';

const app = Q.app();

// Chat Room Demo
// Connect to ws://localhost:3000/chat
// Send "join:roomName" to join a room
// Send "msg:roomName:message" to broadcast to a room

app.ws('/chat', {
    open: (ws) => {
        console.log('Client connected');
        ws.send('Welcome to QHTTPX Chat! Commands: join:<room>, msg:<room>:<text>');
    },
    message: (ws, msg) => {
        const text = msg.toString();
        console.log('Received:', text);

        if (text.startsWith('join:')) {
            const room = text.split(':')[1];
            ws.subscribe(room);
            ws.send(`Joined room: ${room}`);
            ws.publish(room, `System: New user joined ${room}`);
        } else if (text.startsWith('msg:')) {
            const parts = text.split(':');
            const room = parts[1];
            const message = parts.slice(2).join(':');
            ws.publish(room, `User: ${message}`);
        } else {
            ws.send('Unknown command');
        }
    },
    close: (ws) => {
        console.log('Client disconnected');
    }
});

app.listen(3000, () => {
    console.log('Chat server listening on port 3000');
});
