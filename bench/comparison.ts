import { Q } from '../src';
import Fastify from 'fastify';
import express from 'express';
import Koa from 'koa';
import Router from '@koa/router';
import autocannon from 'autocannon';
import { createServer } from 'http';

// Ports
const FASTIFY_PORT = 3012;
const EXPRESS_PORT = 3013;
const KOA_PORT = 3014;
const Q_PORT = 3011;

// Payload
const LARGE_DATA = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    active: true
}));

// Bench Runner
async function runBenchmark(name: string, port: number) {
    return new Promise<any>((resolve) => {
        console.log(`\nStarting benchmark for ${name} on port ${port}...`);
        const instance = autocannon({
            url: `http://localhost:${port}`,
            connections: 10000,
            pipelining: 10,
            duration: 20
        }, (err, result) => {
            if (err) {
                console.error(err);
                resolve({ requests: { average: 0, total: 0 } });
            } else {
                console.log(`${name} Results:`);
                console.log(`  Requests/sec: ${result.requests.average}`);
                console.log(`  Total Requests: ${result.requests.total}`);
                console.log(`  Latency (avg): ${result.latency.average} ms`);
                console.log(`  Throughput: ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
                resolve(result);
            }
        });
        autocannon.track(instance, { renderProgressBar: true });
    });
}

async function main() {
    const results: Record<string, { avg: number, total: number }> = {};

    // --- 1. Express ---
    {
        console.log('\n--- Benchmarking Express ---');
        const app = express();
        app.disable('x-powered-by');
        app.disable('etag');
        app.get('/', (req, res) => res.json(LARGE_DATA));
        const server = createServer(app);
        
        await new Promise<void>(resolve => server.listen(EXPRESS_PORT, resolve));
        await new Promise(r => setTimeout(r, 1000)); // Warmup
        
        const res = await runBenchmark('Express', EXPRESS_PORT);
        results['Express'] = { avg: res.requests.average, total: res.requests.total };
        
        server.close();
    }

    // --- 2. Koa ---
    {
        console.log('\n--- Benchmarking Koa ---');
        const app = new Koa();
        const router = new Router();
        router.get('/', (ctx) => { ctx.body = LARGE_DATA; });
        app.use(router.routes()).use(router.allowedMethods());
        const server = createServer(app.callback());
        
        await new Promise<void>(resolve => server.listen(KOA_PORT, resolve));
        await new Promise(r => setTimeout(r, 1000));
        
        const res = await runBenchmark('Koa', KOA_PORT);
        results['Koa'] = { avg: res.requests.average, total: res.requests.total };
        
        server.close();
    }

    // --- 3. Fastify ---
    {
        console.log('\n--- Benchmarking Fastify ---');
        const fastify = Fastify();
        fastify.get('/', async () => LARGE_DATA);
        
        await fastify.listen({ port: FASTIFY_PORT });
        await new Promise(r => setTimeout(r, 1000));
        
        const res = await runBenchmark('Fastify', FASTIFY_PORT);
        results['Fastify'] = { avg: res.requests.average, total: res.requests.total };
        
        await fastify.close();
    }

    // --- 4. QHTTPX ---
    {
        console.log('\n--- Benchmarking QHTTPX ---');
        const app = Q.app();
        app.get('/', { json: LARGE_DATA });
        
        await new Promise<void>(resolve => app.listen(Q_PORT, resolve));
        await new Promise(r => setTimeout(r, 1000));
        
        const res = await runBenchmark('QHTTPX', Q_PORT);
        results['QHTTPX'] = { avg: res.requests.average, total: res.requests.total };
        
        // QHTTPX is the last one, so we just exit
    }

    // --- Verdict ---
    console.log('\n--- Final Verdict ---');
    console.log('Baseline: Express (1.0x)');
    const base = results['Express'].avg;
    
    console.log(`Koa: ${(results['Koa'].avg / base).toFixed(2)}x Express`);
    console.log(`Fastify: ${(results['Fastify'].avg / base).toFixed(2)}x Express`);
    console.log(`QHTTPX: ${(results['QHTTPX'].avg / base).toFixed(2)}x Express`);

    console.log('\n--- Total Requests (10s) ---');
    console.log(`Express: ${results['Express'].total}`);
    console.log(`Koa: ${results['Koa'].total}`);
    console.log(`Fastify: ${results['Fastify'].total}`);
    console.log(`QHTTPX: ${results['QHTTPX'].total}`);

    process.exit(0);
}

main().catch(console.error);
