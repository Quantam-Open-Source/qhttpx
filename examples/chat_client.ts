
import WebSocket from 'ws';

// Simulate 2 clients
const client1 = new WebSocket('ws://localhost:3000/chat');
const client2 = new WebSocket('ws://localhost:3000/chat');

function setupClient(ws: WebSocket, name: string) {
    ws.on('open', () => {
        console.log(`${name} connected`);
        // Join 'general' room
        setTimeout(() => {
            ws.send('join:general');
        }, 500);
    });

    ws.on('message', (data) => {
        console.log(`${name} received: ${data}`);
    });
}

setupClient(client1, 'Client 1');
setupClient(client2, 'Client 2');

// Client 1 sends a message to 'general' after 1 second
setTimeout(() => {
    console.log('Client 1 sending broadcast...');
    client1.send('msg:general:Hello Everyone!');
}, 1000);

// Close after 2 seconds
setTimeout(() => {
    client1.close();
    client2.close();
    process.exit(0);
}, 2000);
