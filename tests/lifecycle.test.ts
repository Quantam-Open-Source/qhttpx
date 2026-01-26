import { describe, it, expect } from 'vitest';
import { Q, createTestClient } from '../src/index';

describe('App Lifecycle with TestClient', () => {
    it('should start and stop the server using TestClient', async () => {
        const app = Q.app();
        app.get('/ping', () => 'pong');

        const client = createTestClient(app);
        await client.start();

        const res = await client.get('/ping');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('pong');

        await client.stop();

        // Give it a moment to shut down
        await new Promise(r => setTimeout(r, 200));

        // Attempt to connect should fail
        try {
            await client.get('/ping');
            throw new Error('Server should be unreachable');
        } catch (e: any) {
            expect(e.cause?.code || e.message).toMatch(/ECONNREFUSED|fetch failed/);
        }
    });
});
