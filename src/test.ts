import { App } from '../types';

export class TestClient {
    private app: App;
    public port: number;
    public baseUrl: string;
    private running = false;

    constructor(app: App) {
        this.app = app;
        this.port = 0;
        this.baseUrl = '';
    }

    async start(): Promise<void> {
        if (this.running) return;
        
        // Pick a random port between 20000 and 30000
        this.port = Math.floor(Math.random() * 10000) + 20000;
        this.baseUrl = `http://localhost:${this.port}`;
        
        return new Promise((resolve, reject) => {
            try {
                this.app.listen(this.port, () => {
                    this.running = true;
                    resolve();
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    async stop() {
        if (this.running) {
            this.app.stop();
            this.running = false;
        }
    }

    async get(path: string, headers?: Record<string, string>) {
        const h = { 'Connection': 'close', ...headers };
        return fetch(`${this.baseUrl}${path}`, { method: 'GET', headers: h });
    }

    async post(path: string, body: any, headers?: Record<string, string>) {
        const isJson = typeof body === 'object';
        const h: any = { 'Connection': 'close', ...headers };
        if (isJson && !h['Content-Type']) h['Content-Type'] = 'application/json';
        
        return fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: h,
            body: isJson ? JSON.stringify(body) : body
        });
    }

    async put(path: string, body: any, headers?: Record<string, string>) {
        const isJson = typeof body === 'object';
        const h: any = { 'Connection': 'close', ...headers };
        if (isJson && !h['Content-Type']) h['Content-Type'] = 'application/json';

        return fetch(`${this.baseUrl}${path}`, {
            method: 'PUT',
            headers: h,
            body: isJson ? JSON.stringify(body) : body
        });
    }

    async delete(path: string, headers?: Record<string, string>) {
        const h = { 'Connection': 'close', ...headers };
        return fetch(`${this.baseUrl}${path}`, { method: 'DELETE', headers: h });
    }
}

export function createTestClient(app: App): TestClient {
    return new TestClient(app);
}
