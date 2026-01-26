import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/chat');

ws.on('open', () => {
    console.log('Connected to server');
    ws.send('Hello QHTTPX');
});

ws.on('message', (data) => {
    console.log('Received from server:', data.toString());
    if (data.toString().startsWith('Echo:')) {
        setTimeout(() => {
            console.log('Closing connection...');
            ws.close();
        }, 100);
    }
});

ws.on('close', () => {
    console.log('Disconnected');
});

ws.on('error', (err) => {
    console.error('Client error:', err);
});
