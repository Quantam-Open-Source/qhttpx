// Core Contracts for QHTTPX

export interface RequestContext {
    /** Unique Request ID (UUID v7) */
    id: string;
    method: string;
    path: string;
    
    // Response methods
    status(code: number): this;
    readonly statusCode: number; // Getter for current status
    send(data: any): void; // Send response (Native)
    html(content: string): void; // Send HTML response

    // Request Data
    req: {
        json<T = any>(): T;
        text(): string;
        param(key: string): string;
        query(key: string): string | undefined;
        queries(key: string): string[] | undefined;
        header(key: string): string | undefined;
    };
    
    query: Record<string, string | string[]>;
    params: Record<string, string>;

    // Body Parsing (Hybrid)
    json<T = any>(data?: any, status?: number): T | void; // Parse input OR Send output
    text(): string;     // Parse request body as Text

    /** High-performance parsed URL */
    url: URL;
    /** Read-only headers (zero-copy view) */
    headers: ReadonlyMap<string, string>;
    /** Environment variables (injected) */
    env?: EnvContext;
    /** Database Access Layer */
    db?: DatabaseContext;
    /** Performance metrics for this request */
    perf?: RequestMetrics;
    snapshot(): RequestSnapshot;
}

export interface RequestSnapshot {
    id: string;
    method: string;
    url: string;
    path: string;
    params: Record<string, string>;
    query: Record<string, string | string[]>;
    headers: Record<string, string>;
    body: any;
    env?: EnvContext;
    perf?: RequestMetrics;
}

export interface RequestMetrics {
    startTime: number;
    dbDuration: number;
    parseDuration: number;
    allocations: number;
}

export interface EnvContext {
    [key: string]: string | number | boolean;
}

export interface DatabaseContext {
    // Native DB Access
    query(sql: string, ttl?: number): Promise<string>;
    queryWithParams(sql: string, params: any[], ttl?: number): Promise<string>;
    mongo(db: string, collection: string): {
        find(query: any): Promise<any[]>;
    };
    [table: string]: any;
}

export type NextFunction = () => Promise<void>;
export type Middleware = (ctx: RequestContext, next: NextFunction) => Promise<void | any>;

export interface UploadConfig {
    dir: string;
    handler?: Handler;
}

export type RouteConfig = {
    text?: string;
    json?: any;
    upload?: UploadConfig;
};

export type Handler = ((ctx: RequestContext) => void | Promise<void> | Response | Promise<Response> | any | Promise<any>) | RouteConfig;

export interface RouteOptions {
    rateLimit?: { limit: number; window: number };
    cache?: { ttl: number };
    jwt?: boolean;
    schema?: any; // JSON Schema Object
    querySchema?: any;
    responseSchema?: any;
    priority?: 'critical' | 'interactive' | 'background';
    sloTarget?: number;
}

export interface Route {
    method: string;
    path: string;
    handler?: Handler;
    middlewares: Middleware[];
    options?: RouteOptions;
    routeConfig?: RouteConfig;
}

export interface RouteBuilder {
    desc(description: string): this;
    auth(strategy?: string): this;
    jwt(): this;
    cache(options: { ttl: number; key?: string }): this;
    rateLimit(options: { limit: number; window: number }): this;
    query(schemaBuilder: (q: QueryBuilder) => void): this;
    schema(def: any): this;
    responseSchema(def: any): this;
    priority(level: 'critical' | 'interactive' | 'background'): this;
    slo(targetMs: number): this;
    respond(handler: Handler): void;
}

export interface WebSocket {
    send(message: string): void;
    subscribe(room: string): void;
    unsubscribe(room: string): void;
    publish(room: string, message: string): void;
}

export interface WsHandler {
    open?: (ws: WebSocket) => void;
    message?: (ws: WebSocket, message: string) => void;
    close?: (ws: WebSocket) => void;
}

export interface QueryBuilder {
    string(name: string): QueryField;
    int(name: string): QueryField;
    bool(name: string): QueryField;
}

export interface QueryField {
    default(val: any): this;
    optional(): this;
    max(val: number): this;
    min(val: number): this;
}

export interface ListenOptions {
    port: number;
    tls?: {
        cert: string;
        key: string;
    };
    callback?: () => void;
}

export interface FluentBuilder {
    validate(schema: Record<string, string>): this;
    schema(def: any): this;
    responseSchema(def: any): this;
    query(schemaBuilder: (q: QueryBuilder) => void): this;
    use(fn: (ctx: RequestContext, state: any) => Promise<any> | any): this;
    transform(fn: (data: any) => Promise<any> | any): this;
    hash(field?: string): this;
    insert(table: string): this;
    find(table: string, by: string): this;
    ensure(condition: (state: any) => boolean, errorMsg?: string, status?: number): this;
    verifyPassword(field?: string): this;
    jwt(options?: { secret?: string, expiresIn?: string }): this;
    respond(status?: number): void;
    respond(handler: Handler): void;
    
    // Extended Fluent API
    secure(): this;
    autoFilter(table: string, allow: string[], options?: {
        sort?: string[];
        select?: string[];
        defaultSort?: string;
        defaultDirection?: 'ASC' | 'DESC';
        maxLimit?: number;
        pageParam?: string;
        limitParam?: string;
        sortParam?: string;
        fieldsParam?: string;
    }): this;
    list(table: string, options?: { where?: Record<string, string>, limit?: number }): this;
    update(table: string, options: { where: Record<string, string>, fields?: string[] }): this;
    delete(table: string, options: { where: Record<string, string> }): this;
}

export interface App {
    // Observability
    enableLogging(): void;
    getMetrics(): string;
    onError(handler: (err: unknown, ctx?: RequestContext) => void): this;
    gracefulShutdown(signals?: string[]): this;
    
    // Fluent API
    flow(method: string, path: string): FluentBuilder;
    
    // Native Database
    db: {
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

    // Auth
    auth: {
        setJwtSecret(secret: string): void;
    };

    // GET
    get(path: string, config: RouteConfig): Route;
    get(path: string, handler: Handler): Route;
    get(path: string, options: RouteOptions, handler: Handler): Route;
    get(path: string): FluentBuilder;

    // POST
    post(path: string, config: RouteConfig): Route;
    post(path: string, handler: Handler): Route;
    post(path: string, options: RouteOptions, handler: Handler): Route;
    post(path: string): FluentBuilder;

    // PUT
    put(path: string, config: RouteConfig): Route;
    put(path: string, handler: Handler): Route;
    put(path: string, options: RouteOptions, handler: Handler): Route;
    put(path: string): FluentBuilder;

    // DELETE
    delete(path: string, config: RouteConfig): Route;
    delete(path: string, handler: Handler): Route;
    delete(path: string, options: RouteOptions, handler: Handler): Route;
    delete(path: string): FluentBuilder;

    // Core
    addRoute(method: string, path: string): Route;
    listen(port: number, callback?: () => void): void;
    listen(options: ListenOptions): void;
    stop(): void;
    ws(path: string, handler: WsHandler): void;
    
    // Static
    static(prefix: string, root: string): this;

    // Middleware
    use(middleware: Middleware): this;
    
    // CORS
    cors(config?: { 
        origin?: string; 
        methods?: string[]; 
        headers?: string[]; 
        credentials?: boolean; 
    }): this;
}
