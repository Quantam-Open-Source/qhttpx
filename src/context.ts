import { NativeEngine } from '../core';
import { RequestContext, EnvContext, DatabaseContext, RequestMetrics, RequestSnapshot } from '../types';

export class Context implements RequestContext {
    private _status: number = 200;
    private _params: Record<string, string> | null = null;
    private _headers: Map<string, string> | null = null;
    
    // Placeholder implementations for interface compliance
    url: URL;
    method: string;
    path: string;
    body: any;
    env!: EnvContext;
    db!: DatabaseContext;
    perf!: RequestMetrics;

    constructor(
        private engine: NativeEngine,
        public id: string,
        private rawParams: string[],
        private queryString: string,
        private rawBody: Buffer,
        private rawHeaders: string[],
        rawUrl: string,
        private responseHandle: any,
        method: string,
        private serializer?: (doc: any) => string
    ) {
        this.method = method;
        this.env = Object.entries(process.env)
            .filter(([, value]) => value !== undefined)
            .reduce((acc, [key, value]) => {
                acc[key] = value as string;
                return acc;
            }, {} as EnvContext);
        this.perf = {
            startTime: Date.now(),
            dbDuration: 0,
            parseDuration: 0,
            allocations: 0
        };
        try {
            this.url = new URL(rawUrl, 'http://localhost'); // Host is dummy for relative paths
        } catch {
            this.url = new URL('http://localhost');
        }
        this.path = this.url.pathname;

        // Initialize DB Context
        this.db = {
            query: async (sql: string, ttl?: number) => {
                return this.engine.queryDb(sql, ttl);
            },
            queryWithParams: async (sql: string, params: any[], ttl?: number) => {
                // @ts-ignore - queryDbWithParams added in native core but not typed yet in generated d.ts
                return this.engine.queryDbWithParams(sql, params, ttl);
            },
            mongo: (dbName: string, collName: string) => ({
                find: async (query: any) => {
                     const json = await this.engine.queryMongo(dbName, collName, JSON.stringify(query));
                     return JSON.parse(json);
                }
            })
        };
    }

    get params(): Record<string, string> {
        if (!this._params) {
            this._params = {};
            for (let i = 0; i < this.rawParams.length; i += 2) {
                this._params[this.rawParams[i]] = this.rawParams[i + 1];
            }
        }
        return this._params;
    }

    private _query: Record<string, string | string[]> | null = null;
    get query(): Record<string, string | string[]> {
        if (!this._query) {
            this._query = {};
            if (this.queryString) {
                const searchParams = new URLSearchParams(this.queryString);
                searchParams.forEach((value, key) => {
                    if (this._query![key]) {
                        if (Array.isArray(this._query![key])) {
                            (this._query![key] as string[]).push(value);
                        } else {
                            this._query![key] = [this._query![key] as string, value];
                        }
                    } else {
                        this._query![key] = value;
                    }
                });
            }
        }
        return this._query;
    }

    get headers(): ReadonlyMap<string, string> {
        if (!this._headers) {
            this._headers = new Map();
            for (let i = 0; i < this.rawHeaders.length; i += 2) {
                this._headers.set(this.rawHeaders[i].toLowerCase(), this.rawHeaders[i + 1]);
            }
        }
        return this._headers;
    }
    
    // Body Methods (Getters)
    text(): string {
        return this.rawBody.toString('utf-8');
    }

    get req() {
        return {
            json: <T = any>(): T => {
                try {
                    return JSON.parse(this.text());
                } catch (e) {
                    throw new Error(`Invalid JSON body: ${e}`);
                }
            },
            text: () => this.text(),
            param: (key: string) => this.params[key],
            query: (key: string) => {
                const val = this.query[key];
                return Array.isArray(val) ? val[0] : val;
            },
            queries: (key: string) => {
                const val = this.query[key];
                return Array.isArray(val) ? val : [val];
            },
            header: (key: string) => this.headers.get(key.toLowerCase())
        };
    }

    // Legacy support (Deprecated)
    json<T = any>(data?: T, status?: number): T | void {
        // If arguments are provided, it's a response
        if (data !== undefined) {
            if (status) this._status = status;
            return this.send(data) as any;
        }
        // If no arguments, it's a request body getter (Legacy)
        // We warn? No, let's just support it for now or prefer req.json()
        return this.req.json<T>();
    }

    send(data: any): void {
        if (typeof data === 'string') {
             this.engine.sendResponse(this.responseHandle, this._status, data);
        } else {
            if (this.serializer) {
                const body = this.serializer(data);
                this.engine.sendResponse(this.responseHandle, this._status, body);
            } else {
                // Fallback to manual stringify if engine.sendJson is problematic or just to be safe
                // this.engine.sendJson(this.responseHandle, this._status, data);
                this.engine.sendResponse(this.responseHandle, this._status, JSON.stringify(data));
            }
        }
    }

    html(content: string): void {
        this.engine.sendHtml(this.responseHandle, this._status, content);
    }

    status(code: number): this {
        this._status = code;
        return this;
    }

    get statusCode(): number {
        return this._status;
    }

    snapshot(): RequestSnapshot {
        const normalizeValue = (value: any): any => {
            if (Array.isArray(value)) {
                return [...value].map(normalizeValue).sort();
            }
            if (value && typeof value === 'object') {
                const keys = Object.keys(value).sort();
                const sorted: Record<string, any> = {};
                for (const key of keys) {
                    sorted[key] = normalizeValue(value[key]);
                }
                return sorted;
            }
            return value;
        };

        const headers: Record<string, string> = {};
        for (const [key, value] of this.headers.entries()) {
            headers[key] = value;
        }

        let body: any;
        try {
            body = this.req.json();
        } catch {
            body = this.text();
        }

        return {
            id: this.id,
            method: this.method,
            url: this.url.toString(),
            path: this.path,
            params: normalizeValue(this.params),
            query: normalizeValue(this.query as Record<string, any>),
            headers: normalizeValue(headers),
            body: normalizeValue(body),
            env: normalizeValue(this.env),
            perf: normalizeValue(this.perf)
        };
    }
}
