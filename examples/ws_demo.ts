import { Q } from '../src';

const app = Q.app();

app.ws('/chat', {
    open: (ws) => {
        console.log('Client connected');
        ws.send('Welcome to QHTTPX WebSocket!');
    },
    message: (ws, msg) => {
        console.log('Received:', msg);
        ws.send('Echo: ' + msg);
    },
    close: (ws) => {
        console.log('Client disconnected');
    }
});

app.listen(3000, () => {
    console.log('WebSocket server listening on port 3000');
});
