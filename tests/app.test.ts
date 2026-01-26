import { describe, it, expect } from 'vitest';
import { Q, createTestClient } from '../src';

describe('QHTTPX App Integration', () => {
    it('should handle basic GET requests', async () => {
        const app = Q.app();
        app.get('/hello', (c) => {
            c.send({ message: 'Hello World' });
        });

        const client = createTestClient(app);
        await client.start();

        const res = await client.get('/hello');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ message: 'Hello World' });

        await client.stop();
    });

    it('should handle POST body echoing', async () => {
        const app = Q.app();
        app.post('/echo', (c) => {
            const body = c.json();
            c.send(body);
        });

        const client = createTestClient(app);
        await client.start();

        const payload = { name: 'Test', value: 123 };
        const res = await client.post('/echo', payload);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual(payload);

        await client.stop();
    });

    it('should handle route parameters', async () => {
        const app = Q.app();
        app.get('/users/:id', (c) => {
            c.send({ id: c.params.id });
        });

        const client = createTestClient(app);
        await client.start();

        const res = await client.get('/users/42');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ id: '42' });

        await client.stop();
    });

    it('should validate query params and apply defaults', async () => {
        const app = Q.app();
        app.get('/search')
            .query((q) => q.int('page').default(1).min(1).max(3))
            .respond((c) => {
                c.send({ page: c.query.page });
            });

        const client = createTestClient(app);
        await client.start();

        const res = await client.get('/search');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ page: 1 });

        const badRes = await client.get('/search?page=5');
        expect(badRes.status).toBe(400);

        await client.stop();
    });

    it('should provide deterministic context snapshots', async () => {
        const app = Q.app();
        app.get('/snapshot', (c) => {
            c.send(c.snapshot());
        });

        const client = createTestClient(app);
        await client.start();

        const res = await client.get('/snapshot?hello=world');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.method).toBe('GET');
        expect(data.path).toBe('/snapshot');
        expect(data.query).toEqual({ hello: 'world' });

        await client.stop();
    });
});
