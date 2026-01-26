import { NativeEngine } from '../core';
import type { App as AppInterface, RouteBuilder, QueryBuilder, Handler, Middleware, WsHandler, WebSocket, RouteConfig, ListenOptions, RouteOptions, RequestContext } from '../types';
import { Context } from './context';
import { compose } from './compose';
import { loadEnv, env } from './env';
import fastJson from 'fast-json-stringify';

export * from '../types'; // Export all types for consumers

// Auto-load .env file if present
loadEnv();

import { generateClient } from './generator';
import * as fs from 'fs';

export * from './test';
export { FluentBuilder } from './fluent';

export namespace App {
    export type Context = RequestContext;
}

import { FluentBuilder } from './fluent';

export class Q {
    static env = env;
    static loadEnv = loadEnv;

    static app(config?: any): App {
        return new App(config);
    }

    static schema(def: any): any { 
        const properties: any = {};
        for (const key in def) {
            if (def[key] && typeof def[key].toJSON === 'function') {
                properties[key] = def[key].toJSON();
            } else {
                properties[key] = def[key];
            }
        }
        return {
            type: "object",
            properties: properties,
            required: Object.keys(properties)
        };
    }

    static string(): SchemaBuilder { return new SchemaBuilder("string"); }
    static int(): SchemaBuilder { return new SchemaBuilder("integer"); }
    static email(): SchemaBuilder { return new SchemaBuilder("string").format("email"); }
    static enum(...values: string[]): SchemaBuilder { return new SchemaBuilder("string").enum(values); }
}

export namespace Q {
    export type Context = RequestContext;
    export type Handler = import('../types').Handler;
}

class SchemaBuilder {
    private def: any = {};
    constructor(type: string) {
        this.def.type = type;
    }

    min(val: number): this {
        if (this.def.type === "string") this.def.minLength = val;
        else this.def.minimum = val;
        return this;
    }

    max(val: number): this {
        if (this.def.type === "string") this.def.maxLength = val;
        else this.def.maximum = val;
        return this;
    }

    format(fmt: string): this {
        this.def.format = fmt;
        return this;
    }

    enum(values: string[]): this {
        this.def.enum = values;
        return this;
    }

    toJSON() {
        return this.def;
    }
}

type QueryFieldSchema = {
    type: 'string' | 'integer' | 'boolean';
    optional?: boolean;
    default?: any;
    min?: number;
    max?: number;
};

class QuerySchemaBuilder {
    public schema: Record<string, QueryFieldSchema> = {};

    string(name: string) {
        return new QueryFieldBuilder(this.schema, name, 'string');
    }

    int(name: string) {
        return new QueryFieldBuilder(this.schema, name, 'integer');
    }

    bool(name: string) {
        return new QueryFieldBuilder(this.schema, name, 'boolean');
    }
}

class QueryFieldBuilder {
    constructor(
        private schema: Record<string, QueryFieldSchema>,
        private name: string,
        private type: QueryFieldSchema['type']
    ) {
        if (!this.schema[this.name]) {
            this.schema[this.name] = { type: this.type };
        }
    }

    default(val: any): this {
        this.schema[this.name].default = val;
        return this;
    }

    optional(): this {
        this.schema[this.name].optional = true;
        return this;
    }

    max(val: number): this {
        this.schema[this.name].max = val;
        return this;
    }

    min(val: number): this {
        this.schema[this.name].min = val;
        return this;
    }
}

const normalizeQuery = (schema: Record<string, QueryFieldSchema>, ctx: RequestContext) => {
    const errors: string[] = [];
    const normalized: Record<string, any> = { ...ctx.query };

    const parseValue = (value: string, field: QueryFieldSchema) => {
        if (field.type === 'integer') {
            const parsed = Number.parseInt(value, 10);
            if (Number.isNaN(parsed)) {
                return { ok: false, value: value };
            }
            return { ok: true, value: parsed };
        }
        if (field.type === 'boolean') {
            if (value === 'true' || value === '1') return { ok: true, value: true };
            if (value === 'false' || value === '0') return { ok: true, value: false };
            return { ok: false, value: value };
        }
        return { ok: true, value };
    };

    const enforceBounds = (value: any, field: QueryFieldSchema) => {
        if (typeof value === 'string') {
            if (field.min !== undefined && value.length < field.min) return false;
            if (field.max !== undefined && value.length > field.max) return false;
        }
        if (typeof value === 'number') {
            if (field.min !== undefined && value < field.min) return false;
            if (field.max !== undefined && value > field.max) return false;
        }
        return true;
    };

    for (const [key, field] of Object.entries(schema)) {
        const raw = ctx.query[key];

        if (raw === undefined) {
            if (field.default !== undefined) {
                normalized[key] = field.default;
                continue;
            }
            if (field.optional) {
                delete normalized[key];
                continue;
            }
            errors.push(`Missing query param: ${key}`);
            continue;
        }

        if (Array.isArray(raw)) {
            const parsedValues: any[] = [];
            let ok = true;
            for (const item of raw) {
                const parsed = parseValue(item, field);
                if (!parsed.ok) {
                    ok = false;
                    break;
                }
                if (!enforceBounds(parsed.value, field)) {
                    ok = false;
                    break;
                }
                parsedValues.push(parsed.value);
            }
            if (!ok) {
                errors.push(`Invalid query param: ${key}`);
                continue;
            }
            normalized[key] = parsedValues;
            continue;
        }

        const parsed = parseValue(raw as string, field);
        if (!parsed.ok || !enforceBounds(parsed.value, field)) {
            errors.push(`Invalid query param: ${key}`);
            continue;
        }
        normalized[key] = parsed.value;
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return { ok: true, query: normalized };
};

const normalizeRoutePath = (path: string) => {
    return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
};

class App implements AppInterface {
    private engine: NativeEngine | null = null;
    private routes: Route[] = [];
    private handlers: Map<number, { handler: Handler, serializer?: (doc: any) => string }> = new Map();
    private handlerCounter = 0;
    private middlewares: Middleware[] = [];
    private staticRoutes = new Map<string, string>(); // prefix -> dir
    private wsHandlers = new Map<string, WsHandler>();
    private activeSockets = new Map<string, { handler: WsHandler, path: string }>();
    private corsConfig: { origin: string, methods: string, headers: string, credentials: boolean } | null = null;
    private loggingEnabled = false;
    private errorHandler: ((err: unknown, ctx?: RequestContext) => void) | null = null;
    private errorHooksRegistered = false;
    private shutdownHooksRegistered = false;
    
    // Fluent API Entry Point
    flow(method: string, path: string): FluentBuilder {
        return new FluentBuilder(this, method, path);
    }

    doc(path: string): this {
        // 1. Serve JSON Spec
        this.get(`${path}/json`, (req) => {
            const spec = this.generateOpenApiSpec();
            return req.send(spec);
        });

        // 2. Serve Swagger UI
        this.get(path, (req) => {
            const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
<script>
    window.onload = () => {
    window.ui = SwaggerUIBundle({
        url: '${path}/json',
        dom_id: '#swagger-ui',
    });
    };
</script>
</body>
</html>`;
            return req.html(html);
        });

        return this;
    }

    exportClient(outputPath: string): void {
        const code = generateClient(this.routes);
        fs.writeFileSync(outputPath, code);
        console.log(`✅ Generated Type-Safe Client at ${outputPath}`);
    }

    private generateOpenApiSpec(): any {
        const paths: any = {};

        for (const route of this.routes) {
            // Skip internal docs routes to avoid recursion/clutter
            if (route.path.includes('/docs')) continue;

            const specPath = normalizeRoutePath(route.path);
            if (!paths[specPath]) paths[specPath] = {};

            const method = route.method.toLowerCase();
            const operation: any = {
                responses: {
                    '200': { description: 'Successful response' }
                }
            };

            if (route.description) {
                operation.summary = route.description;
            }

            // Request Body Schema
            if (route.options.schema) {
                try {
                    const schema = typeof route.options.schema === 'string'
                        ? JSON.parse(route.options.schema)
                        : route.options.schema;
                    operation.requestBody = {
                        content: {
                            'application/json': {
                                schema: schema
                            }
                        }
                    };
                } catch (e) {
                    console.warn(`Failed to parse schema for ${method} ${route.path}`);
                }
            }

            if (route.options.query_schema) {
                const params: any[] = [];
                const querySchema = route.options.query_schema as Record<string, QueryFieldSchema>;
                for (const [name, def] of Object.entries(querySchema)) {
                    params.push({
                        name,
                        in: 'query',
                        required: !def.optional && def.default === undefined,
                        schema: {
                            type: def.type === 'integer' ? 'integer' : def.type === 'boolean' ? 'boolean' : 'string',
                            minimum: def.min,
                            maximum: def.max
                        }
                    });
                }
                if (params.length > 0) {
                    operation.parameters = params;
                }
            }

            if (route.options.response_schema) {
                try {
                    const schema = typeof route.options.response_schema === 'string'
                        ? JSON.parse(route.options.response_schema)
                        : route.options.response_schema;
                    operation.responses['200'] = {
                        description: 'Successful response',
                        content: {
                            'application/json': { schema }
                        }
                    };
                } catch (e) {
                    console.warn(`Failed to parse response schema for ${method} ${route.path}`);
                }
            }

            // Auth
            if (route.options.jwt_auth) {
                operation.security = [{ bearerAuth: [] }];
            }

            paths[specPath][method] = operation;
        }

        return {
            openapi: '3.0.0',
            info: {
                title: 'QHTTPX API',
                version: '1.0.0'
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    }
                }
            },
            paths
        };
    }

    // DB & Auth namespaces
    enableLogging(): void {
        this.engine?.initLogger();
        this.loggingEnabled = true;
        if (!process.env.RUST_LOG) {
            process.env.RUST_LOG = 'info';
        }
    }

    getMetrics(): string {
        if (!this.engine) throw new Error("Server not started");
        return this.engine.getMetrics();
    }

    onError(handler: (err: unknown, ctx?: RequestContext) => void): this {
        this.errorHandler = handler;
        return this;
    }

    gracefulShutdown(signals: string[] = ['SIGINT', 'SIGTERM']): this {
        if (this.shutdownHooksRegistered) return this;
        this.shutdownHooksRegistered = true;
        for (const signal of signals) {
            process.on(signal as NodeJS.Signals, () => {
                this.stop();
            });
        }
        return this;
    }

    security(): this {
        if (this.engine) {
            this.engine.setSecurityHeaders(true);
        } else {
            this.pendingSecurity = true;
        }
        return this;
    }
    
    private pendingSecurity = false;
    private registerErrorHooks(): void {
        if (this.errorHooksRegistered) return;
        this.errorHooksRegistered = true;
        process.on('unhandledRejection', (reason) => {
            this.handleError(reason);
        });
        process.on('uncaughtException', (err) => {
            this.handleError(err);
        });
    }

    private handleError(err: unknown, ctx?: RequestContext): void {
        if (this.errorHandler) {
            try {
                this.errorHandler(err, ctx);
                return;
            } catch (handlerError) {
                console.error("Error handler failed:", handlerError);
            }
        }
        console.error("Unhandled error:", err);
    }

    public db: {
        connectPostgres(url: string): Promise<void>;
        connectSqlite(url: string): Promise<void>;
        connectRedis(url: string): void;
        connectMongo(url: string): Promise<void>;
        query(sql: string, ttl?: number): Promise<string>;
        redis: {
            set(key: string, value: string, ttl?: number): Promise<void>;
            get(key: string): Promise<string | null>;
        };
        mongo(db: string, collection: string): {
             find(query: any): Promise<any[]>;
        };
    };

    public auth: {
        setJwtSecret(secret: string): void;
    };

    constructor(private config?: any) {
        // Bind DB & Auth methods to engine (lazy binding)
        this.db = {
            connectPostgres: async (url) => { if (!this.engine) throw new Error("Server not started"); await this.engine.connectPostgres(url); },
            connectSqlite: async (url) => { if (!this.engine) throw new Error("Server not started"); await this.engine.connectSqlite(url); },
            connectRedis: (url) => { if (!this.engine) throw new Error("Server not started"); this.engine.connectRedis(url); },
            connectMongo: async (url) => { if (!this.engine) throw new Error("Server not started"); await this.engine.connectMongo(url); },
            query: async (sql, ttl) => { if (!this.engine) throw new Error("Server not started"); return this.engine.queryDb(sql, ttl); },
            redis: {
                set: async (key, value, ttl) => { if (!this.engine) throw new Error("Server not started"); await this.engine.redisSet(key, value, ttl); },
                get: async (key) => { if (!this.engine) throw new Error("Server not started"); return this.engine.redisGet(key); }
            },
            mongo: (dbName, collName) => ({
                find: async (query) => {
                    if (!this.engine) throw new Error("Server not started");
                    const json = await this.engine.queryMongo(dbName, collName, JSON.stringify(query));
                    return JSON.parse(json);
                }
            })
        };
        this.auth = {
            setJwtSecret: (secret) => { if (!this.engine) throw new Error("Server not started"); this.engine.setJwtSecret(secret); }
        };
    }

    static(prefix: string, root: string) {
        // Normalize prefix
        if (!prefix.startsWith('/')) prefix = '/' + prefix;
        // Normalize root (absolute path)
        const absRoot = require('path').resolve(root);
        this.staticRoutes.set(prefix, absRoot);
        return this;
    }

    use(fn: Middleware): this {
        this.middlewares.push(fn);
        return this;
    }

    ws(path: string, handler: WsHandler): void {
        if (!path.startsWith('/')) path = '/' + path;
        this.wsHandlers.set(path, handler);
    }

    cors(config: { origin?: string, methods?: string[], headers?: string[], credentials?: boolean } = {}): this {
        this.corsConfig = {
            origin: config.origin || '*',
            methods: (config.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']).join(', '),
            headers: (config.headers || ['Content-Type', 'Authorization']).join(', '),
            credentials: config.credentials || false
        };
        return this;
    }

    // Fluent API Interface - HTTP methods return FluentBuilder for intuitive chaining
    get(path: string, config: RouteConfig): Route;
    get(path: string, handler: Handler): Route;
    get(path: string, options: RouteOptions, handler: Handler): Route;
    get(path: string): FluentBuilder;
    get(path: string, arg2?: Handler | RouteConfig | RouteOptions, arg3?: Handler): FluentBuilder | Route {
        if (arg3) {
            // For options + handler pattern, we need to configure the underlying route
            const route = this.addRoute('GET', path);
            route.options = arg2 as RouteOptions;
            route.handler = arg3;
            return route;
        } else if (arg2) {
            const route = this.addRoute('GET', path);
            if (typeof arg2 === 'function') {
                route.handler = arg2;
                return route;
            } else if ('json' in arg2 || 'text' in arg2 || 'upload' in arg2) {
                route.routeConfig = arg2;
                return route;
            } else {
                route.options = arg2;
                return route;
            }
        }
        
        return new FluentBuilder(this, 'GET', path);
    }



    post(path: string, config: RouteConfig): Route;
    post(path: string, handler: Handler): Route;
    post(path: string, options: RouteOptions, handler: Handler): Route;
    post(path: string): FluentBuilder;
    post(path: string, arg2?: Handler | RouteConfig | RouteOptions, arg3?: Handler): FluentBuilder | Route {
        if (arg3) {
            const route = this.addRoute('POST', path);
            route.options = arg2 as RouteOptions;
            route.handler = arg3;
            return route;
        } else if (arg2) {
            const route = this.addRoute('POST', path);
            if (typeof arg2 === 'function') {
                route.handler = arg2;
                return route;
            } else if ('json' in arg2 || 'text' in arg2 || 'upload' in arg2) {
                route.routeConfig = arg2;
                return route;
            } else {
                route.options = arg2;
                return route;
            }
        }
        
        return new FluentBuilder(this, 'POST', path);
    }

    put(path: string, config: RouteConfig): Route;
    put(path: string, handler: Handler): Route;
    put(path: string, options: RouteOptions, handler: Handler): Route;
    put(path: string): FluentBuilder;
    put(path: string, arg2?: Handler | RouteConfig | RouteOptions, arg3?: Handler): FluentBuilder | Route {
        if (arg3) {
            const route = this.addRoute('PUT', path);
            route.options = arg2 as RouteOptions;
            route.handler = arg3;
            return route;
        } else if (arg2) {
            const route = this.addRoute('PUT', path);
            if (typeof arg2 === 'function') {
                route.handler = arg2;
                return route;
            } else if ('json' in arg2 || 'text' in arg2 || 'upload' in arg2) {
                route.routeConfig = arg2;
                return route;
            } else {
                route.options = arg2;
                return route;
            }
        }
        
        return new FluentBuilder(this, 'PUT', path);
    }

    delete(path: string, config: RouteConfig): Route;
    delete(path: string, handler: Handler): Route;
    delete(path: string, options: RouteOptions, handler: Handler): Route;
    delete(path: string): FluentBuilder;
    delete(path: string, arg2?: Handler | RouteConfig | RouteOptions, arg3?: Handler): FluentBuilder | Route {
        if (arg3) {
            const route = this.addRoute('DELETE', path);
            route.options = arg2 as RouteOptions;
            route.handler = arg3;
            return route;
        } else if (arg2) {
            const route = this.addRoute('DELETE', path);
            if (typeof arg2 === 'function') {
                route.handler = arg2;
                return route;
            } else if ('json' in arg2 || 'text' in arg2 || 'upload' in arg2) {
                route.routeConfig = arg2;
                return route;
            } else {
                route.options = arg2;
                return route;
            }
        }
        
        return new FluentBuilder(this, 'DELETE', path);
    }

    addRoute(method: string, path: string): Route {
        const route = new Route(path, method, this);
        this.routes.push(route);
        return route;
    }

    registerHandler(handler: Handler, serializer?: (doc: any) => string): number {
        const id = ++this.handlerCounter;
        this.handlers.set(id, { handler, serializer });
        return id;
    }

    listen(portOrOptions: number | ListenOptions, cb?: () => void): void {
        let port: number;
        let callback = cb;
        let tls: { cert: string; key: string } | undefined;

        if (typeof portOrOptions === 'object') {
            port = portOrOptions.port;
            callback = portOrOptions.callback || cb;
            tls = portOrOptions.tls;
        } else {
            port = portOrOptions;
        }

        if (!this.engine) {
            this.engine = new NativeEngine(port);
            this.registerErrorHooks();
            
            // Initialize Logger (respects RUST_LOG or explicit enable)
            if (this.loggingEnabled || process.env.RUST_LOG) {
                if (!process.env.RUST_LOG) process.env.RUST_LOG = 'info';
                this.engine.initLogger();
            }

            if (tls) {
                this.engine.setTls(tls.cert, tls.key);
            }
            
            // Register static routes
            for (const [prefix, dir] of this.staticRoutes) {
                this.engine.addStaticRoute(prefix, dir);
            }

            // Register CORS
            if (this.corsConfig) {
                this.engine.setCors(
                    this.corsConfig.origin, 
                    this.corsConfig.methods, 
                    this.corsConfig.headers, 
                    this.corsConfig.credentials
                );
            }

            // Register Security Headers
            if (this.pendingSecurity) {
                this.engine.setSecurityHeaders(true);
            }
        }
        
        // 1. Register Dispatcher
        this.engine.setHandler((event: any) => {
            const { handlerId, reqId, params, query, body, headers, url, responseHandle, method } = event;
            const routeConfig = this.handlers.get(handlerId);
            
            if (routeConfig) {
                const { handler, serializer } = routeConfig;
                // Params is now array [k,v,k,v]
                const ctx = new Context(this.engine!, reqId, params, query, body, headers, url, responseHandle, method, serializer);
                
                // Wrap handler as middleware
                const routeMiddleware: Middleware = async (c, next) => {
                    const res = await (handler as Function)(c);
                    if (res !== undefined) {
                        c.send(res);
                    }
                    await next();
                };

                // Compose global middlewares + route handler
                const fn = compose([...this.middlewares, routeMiddleware]);

                fn(ctx).catch(err => {
                    this.handleError(err, ctx);
                    try { ctx.status(500).send({ error: "Internal Server Error" }); } catch {}
                });
            } else {
                console.warn(`No handler found for ID ${handlerId}`);
            }
        });

        // 1.5 Register WS Dispatcher
        this.engine.setWsHandler((event: any) => {
            const { socketId, eventType, payload, path } = event;

            if (eventType === 'open') {
                const handler = this.wsHandlers.get(path);
                if (handler) {
                    this.activeSockets.set(socketId, { handler, path });
                    if (handler.open) {
                        const ws: WebSocket = {
                            send: (msg: string) => this.engine!.wsSend(socketId, msg),
                            subscribe: (room: string) => this.engine!.wsSubscribe(socketId, room),
                            unsubscribe: (room: string) => this.engine!.wsUnsubscribe(socketId, room),
                            publish: (room: string, msg: string) => this.engine!.wsPublish(room, msg)
                        };
                        handler.open(ws);
                    }
                }
            } else {
                const ctx = this.activeSockets.get(socketId);
                if (ctx) {
                    const { handler } = ctx;
                    const ws: WebSocket = {
                        send: (msg: string) => this.engine!.wsSend(socketId, msg),
                        subscribe: (room: string) => this.engine!.wsSubscribe(socketId, room),
                        unsubscribe: (room: string) => this.engine!.wsUnsubscribe(socketId, room),
                        publish: (room: string, msg: string) => this.engine!.wsPublish(room, msg)
                    };

                    if (eventType === 'message') {
                        if (handler.message && payload) {
                            handler.message(ws, payload);
                        }
                    } else if (eventType === 'close') {
                        if (handler.close) {
                            handler.close(ws);
                        }
                        this.activeSockets.delete(socketId);
                    }
                }
            }
        });

        // 2. Register Routes
        for (const route of this.routes) {
            const enginePath = normalizeRoutePath(route.path);
            const options = route.options || {};
            
            // Serialize Schema if present
            if (options.schema && typeof options.schema !== 'string') {
                options.schema = JSON.stringify(options.schema);
            }

            if (route.routeConfig) {
                // Level 2: Declarative Routes (No JS Callback)
                if (route.routeConfig.text) {
                    this.engine.registerStaticRoute(route.method, enginePath, route.routeConfig.text, "text/plain", options);
                } else if (route.routeConfig.json) {
                    const content = typeof route.routeConfig.json === 'string' 
                        ? route.routeConfig.json 
                        : JSON.stringify(route.routeConfig.json);
                    this.engine.registerJsonRoute(route.method, enginePath, content, options);
                } else if (route.routeConfig.upload) {
                    let handlerId: number | undefined;
                    if (route.routeConfig.upload.handler) {
                        handlerId = this.registerHandler(route.routeConfig.upload.handler);
                    }
                    this.engine.registerUploadRoute(
                        route.method, 
                        enginePath, 
                        route.routeConfig.upload.dir, 
                        handlerId,
                        options
                    );
                }
            } else if (route.handlerId || route.handler) {
                // Level 1: Imperative Routes (JS Callback)
                try {
                    // Ensure handler is registered
                    if (!route.handlerId && route.handler) {
                        route.handlerId = this.registerHandler(route.handler);
                    }
                    
                    if (route.handlerId) {
                        this.engine.registerRoute(route.method, enginePath, route.handlerId, options);
                    }
                } catch (e) {
                    console.error(`Failed to register route ${route.method} ${route.path}:`, e);
                }
            }
        }

        // 3. Start Engine
        this.engine.start()
            .then(() => {
                if (cb) cb();
            })
            .catch((err: any) => {
                console.error("Native Engine crashed:", err);
                process.exit(1);
            });
    }

    stop(): void {
        if (this.engine) {
            try {
                this.engine.stop();
            } catch (e) {
                console.error("Failed to stop engine:", e);
            }
        }
    }
}

class Route implements RouteBuilder {
    public handlerId: number | null = null;
    public routeConfig: RouteConfig | undefined;
    public options: any = {};
    public description: string | undefined;
    public middlewares: Middleware[] = [];
    public handler?: Handler;
    private serializer: ((doc: any) => string) | undefined;

    constructor(
        public path: string, 
        public method: string,
        private app: App
    ) {}

    desc(description: string): this { 
        this.description = description;
        return this; 
    }
    auth(strategy?: string): this { return this; }
    jwt(): this {
        this.options.jwt_auth = true;
        return this;
    }
    
    cache(options: { ttl: number; key?: string }): this { 
        this.options.cache_ttl = options.ttl;
        return this; 
    }

    rateLimit(options: { limit: number; window: number }): this {
        this.options.rate_limit_limit = options.limit;
        this.options.rate_limit_window = options.window;
        return this;
    }
    query(schemaBuilder: (q: QueryBuilder) => void): this {
        const builder = new QuerySchemaBuilder();
        schemaBuilder(builder as any);
        this.options.query_schema = builder.schema;
        return this;
    }
    
    schema(def: any): this {
        // Set for Rust validation
        this.options.schema = def;
        return this;
    }

    priority(level: 'critical' | 'interactive' | 'background'): this {
        this.options.priority = level;
        return this;
    }

    slo(targetMs: number): this {
        this.options.slo_target = targetMs;
        return this;
    }

    responseSchema(def: any): this {
        // Set for JS serialization
        try {
            this.serializer = fastJson(def as any);
            this.options.response_schema = def;
        } catch (e) {
            console.error(`Failed to compile response schema for ${this.method} ${this.path}:`, e);
        }
        return this;
    }

    respond(handler: Handler): void {
        if (typeof handler === 'object' && handler !== null && ('text' in handler || 'json' in handler || 'upload' in handler)) {
             this.routeConfig = handler as RouteConfig;
        } else {
            const original = handler as Handler;
            const wrapped: Handler = async (ctx: RequestContext) => {
                if (this.options.query_schema) {
                    const result = normalizeQuery(this.options.query_schema, ctx);
                    if (!result.ok) {
                        const errors = 'errors' in result && result.errors ? result.errors : [];
                        ctx.status(400).send({ error: errors.join(', ') });
                        return;
                    }
                    (ctx as any)._query = result.query;
                }
                return (original as any)(ctx);
            };
            this.handlerId = this.app.registerHandler(wrapped, this.serializer);
        }
    }
}
