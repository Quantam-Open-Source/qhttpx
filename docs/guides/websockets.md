# WebSockets in QHTTPX

QHTTPX provides built-in support for WebSockets, allowing you to build real-time applications with ease.

## defining a WebSocket Route

To define a WebSocket route, use the `app.ws(path, handlers)` method.

```typescript
import { Q } from 'qhttpx';

const app = Q.app();

app.ws('/chat', {
    open: (ws) => {
        console.log('Client connected');
        ws.send('Welcome to QHTTPX WebSocket!');
    },
    message: (ws, msg) => {
        console.log('Received:', msg);
        // Echo the message back
        ws.send('Echo: ' + msg);
    },
    close: (ws) => {
        console.log('Client disconnected');
    }
});

app.listen(3000, () => {
    console.log('WebSocket server listening on port 3000');
});
```

## Handler Methods

The `handlers` object supports the following events:

### `open(ws)`
Called when a client successfully connects to the WebSocket.
*   `ws`: The WebSocket instance. Use `ws.send(data)` to send messages.

### `message(ws, msg)`
Called when a message is received from the client.
*   `ws`: The WebSocket instance.
*   `msg`: The message received (string).

### `close(ws)`
Called when the connection is closed.
*   `ws`: The WebSocket instance.

## Client Example

You can connect to the WebSocket server using standard Web APIs or any WebSocket client.

```javascript
const ws = new WebSocket('ws://localhost:3000/chat');

ws.onopen = () => {
    console.log('Connected!');
    ws.send('Hello Server!');
};

ws.onmessage = (event) => {
    console.log('Server says:', event.data);
};
```

## 📚 Learn More

Check out the runnable examples for more details:
*   [**WebSocket Demo**](../../examples/ws_demo.ts) - Complete chat server example.
