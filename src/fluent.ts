import { App, RequestContext, Handler } from '../types';

// Dynamic imports helper
const requireOptional = (pkg: string) => {
    try {
        return require(pkg);
    } catch (e) {
        throw new Error(`Dependency '${pkg}' is required for this feature. Please install it: npm install ${pkg}`);
    }
};

const schemaFromValidation = (schema: Record<string, string>) => {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, type] of Object.entries(schema)) {
        required.push(key);
        if (type === 'email') {
            properties[key] = { type: 'string', format: 'email' };
        } else if (type === 'int' || type === 'integer') {
            properties[key] = { type: 'integer' };
        } else if (type === 'bool' || type === 'boolean') {
            properties[key] = { type: 'boolean' };
        } else {
            properties[key] = { type: 'string' };
        }
    }

    return { type: 'object', properties, required };
};

export type FluentStep = (ctx: RequestContext, state: any) => Promise<any> | any;

export class FluentBuilder {
    private steps: { name: string, fn: FluentStep }[] = [];
    private requestSchema?: any;
    private responseSchemaDef?: any;
    private queryBuilder?: (q: any) => void;

    constructor(private app: App, private method: string, private path: string) {}

    // RouteBuilder compatibility methods
    desc(description: string): this {
        // Store description for documentation purposes
        this.steps.push({
            name: 'desc',
            fn: (ctx, state) => {
                // Description is metadata, doesn't affect state
                return state;
            }
        });
        return this;
    }

    auth(strategy?: string): this {
        // Store auth strategy for documentation
        this.steps.push({
            name: 'auth',
            fn: (ctx, state) => {
                // Auth strategy is metadata, doesn't affect state
                return state;
            }
        });
        return this;
    }

    cache(options: { ttl: number; key?: string }): this {
        // Store cache options for documentation
        this.steps.push({
            name: 'cache',
            fn: (ctx, state) => {
                // Cache options are metadata, doesn't affect state
                return state;
            }
        });
        return this;
    }

    rateLimit(options: { limit: number; window: number }): this {
        // Store rate limit options for documentation
        this.steps.push({
            name: 'rateLimit',
            fn: (ctx, state) => {
                // Rate limit options are metadata, doesn't affect state
                return state;
            }
        });
        return this;
    }

    status(statusCode: number): this {
        // Store status code for the response
        this.steps.push({
            name: 'status',
            fn: (ctx, state) => {
                // Status is stored for the final respond() call
                return { ...state, _status: statusCode };
            }
        });
        return this;
    }

    priority(level: 'critical' | 'interactive' | 'background'): this {
        // Store priority level for documentation
        this.steps.push({
            name: 'priority',
            fn: (ctx, state) => {
                // Priority is metadata, doesn't affect state
                return state;
            }
        });
        return this;
    }

    slo(targetMs: number): this {
        // Store SLO target for documentation
        this.steps.push({
            name: 'slo',
            fn: (ctx, state) => {
                // SLO target is metadata, doesn't affect state
                return state;
            }
        });
        return this;
    }

    // 1. Validation Step
    validate(schema: Record<string, string>): this {
        if (!this.requestSchema) {
            this.requestSchema = schemaFromValidation(schema);
        }
        this.steps.push({
            name: 'validate',
            fn: (ctx, state) => {
                const body = ctx.req.json();
                const errors: string[] = [];
                const cleanData: any = {};

                for (const [key, type] of Object.entries(schema)) {
                    if (!body[key]) {
                        errors.push(`Missing ${key}`);
                        continue;
                    }
                    // Basic type checking
                    if (type === 'email' && !body[key].includes('@')) {
                        errors.push(`Invalid email for ${key}`);
                    }
                    cleanData[key] = body[key];
                }

                if (errors.length > 0) {
                    throw { status: 400, message: errors.join(', ') };
                }
                return { ...state, ...cleanData };
            }
        });
        return this;
    }

    schema(def: any): this {
        this.requestSchema = def;
        return this;
    }

    responseSchema(def: any): this {
        this.responseSchemaDef = def;
        return this;
    }

    query(schemaBuilder: (q: any) => void): this {
        this.queryBuilder = schemaBuilder;
        return this;
    }

    queryState(fields?: string[]): this {
        this.steps.push({
            name: 'queryState',
            fn: (ctx, state) => {
                const query = ctx.query as Record<string, any>;
                if (!fields || fields.length === 0) {
                    return { ...state, ...query };
                }
                const next: Record<string, any> = { ...state };
                for (const field of fields) {
                    if (query[field] !== undefined) {
                        next[field] = query[field];
                    }
                }
                return next;
            }
        });
        return this;
    }

    use(fn: (ctx: RequestContext, state: any) => Promise<any> | any): this {
        this.steps.push({
            name: 'use',
            fn
        });
        return this;
    }

    sql(query: string, params?: any[] | ((state: any) => any[])): this {
        this.steps.push({
            name: 'sql',
            fn: async (ctx, state) => {
                if (!ctx.db) throw { status: 500, message: "Database not connected" };
                const resolvedParams = typeof params === 'function' ? params(state) : params;
                const res = resolvedParams
                    ? await ctx.db.queryWithParams(query, resolvedParams)
                    : await ctx.db.query(query);
                return JSON.parse(res);
            }
        });
        return this;
    }

    // 2. Transformation Step (e.g., Hashing)
    transform(fn: (data: any) => Promise<any> | any): this {
        this.steps.push({
            name: 'transform',
            fn: async (ctx, state) => {
                const result = await fn(state);
                return { ...state, ...result };
            }
        });
        return this;
    }

    // Pre-built Transform: Hash Password
    hash(field: string = 'password'): this {
        return this.transform(async (data) => {
            const bcrypt = requireOptional('bcryptjs');
            if (data[field]) {
                const hash = await bcrypt.hash(data[field], 10);
                return { [field]: hash }; // Updates the password field with hash
            }
            return {};
        });
    }

    // 3. Database Step (Insert)
    insert(table: string): this {
        this.steps.push({
            name: `insert:${table}`,
            fn: async (ctx, state) => {
                if (!ctx.db) throw { status: 500, message: "Database not connected" };
                
                // Construct SQL
                const keys = Object.keys(state);
                const values = Object.values(state);
                const placeholders = values.map((_, i) => `$${i + 1}`);
                
                const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
                
                try {
                    const res = await ctx.db.queryWithParams(sql, values);
                    const rows = JSON.parse(res);
                    return rows[0]; // Replace state with DB result
                } catch (e: any) {
                    if (e.message?.includes('duplicate')) {
                        throw { status: 409, message: 'Resource already exists' };
                    }
                    throw e;
                }
            }
        });
        return this;
    }

    // Database Select
    find(table: string, by: string): this {
        this.steps.push({
            name: `find:${table}`,
            fn: async (ctx, state) => {
                if (!ctx.db) throw { status: 500, message: "Database not connected" };
                
                const val = state[by] || ctx.req.json()[by];
                if (!val) throw { status: 400, message: `Missing lookup value for ${by}` };

                // Support partial select if configured
                const fields = state._query_select ? state._query_select.join(', ') : '*';
                const sql = `SELECT ${fields} FROM ${table} WHERE ${by} = $1`;
                
                const res = await ctx.db.queryWithParams(sql, [val]);
                const rows = JSON.parse(res);
                
                if (rows.length === 0) return null;
                return rows[0];
            }
        });
        return this;
    }

    // 4. Logic/Guard Step
    ensure(condition: (state: any) => boolean, errorMsg: string = "Condition failed", status: number = 400): this {
        this.steps.push({
            name: 'ensure',
            fn: (ctx, state) => {
                if (!condition(state)) {
                    throw { status, message: errorMsg };
                }
                return state;
            }
        });
        return this;
    }

    verifyPassword(field: string = 'password'): this {
        this.steps.push({
            name: 'verifyPassword',
            fn: async (ctx, state) => {
                const bcrypt = requireOptional('bcryptjs');
                const body = ctx.req.json();
                const inputPass = body[field];
                const storedHash = state[field] || state[`${field}_hash`];

                if (!inputPass || !storedHash) {
                    throw { status: 400, message: 'Missing credentials' };
                }

                const valid = await bcrypt.compare(inputPass, storedHash);
                if (!valid) throw { status: 401, message: 'Invalid credentials' };
                
                return state;
            }
        });
        return this;
    }

    // 5. Auth Step (JWT)
    jwt(options: { secret?: string, expiresIn?: string } = {}): this {
        this.steps.push({
            name: 'jwt',
            fn: (ctx, state) => {
                const jwt = requireOptional('jsonwebtoken');
                const secret = options.secret || process.env.JWT_SECRET || 'secret';
                
                // Payload is the current state (usually user object)
                // Filter out sensitive fields like password
                const payload = { ...state };
                delete payload.password;
                delete payload.password_hash;
                
                // Standard claims
                if (payload.id) payload.sub = payload.id;

                const token = jwt.sign(payload, secret, { expiresIn: options.expiresIn || '24h' });
                return { token, user: payload };
            }
        });
        return this;
    }

    // 6. Response Step (Finalizer)
    respond(handlerOrStatus: Handler | number = 200): void {
        // Handle both RouteBuilder interface (Handler) and FluentBuilder interface (number)
        if (typeof handlerOrStatus === 'function') {
            // RouteBuilder interface: .respond(handler: Handler)
            // Cast to Function to avoid "RouteConfig has no call signatures" error
            const fn = handlerOrStatus as Function;
            this.use(async (ctx, state) => await fn(ctx));
            this.respond(200); // Call our own respond method with default status
            return;
        }

        // Handle RouteConfig object (part of Handler type)
        if (typeof handlerOrStatus === 'object' && handlerOrStatus !== null) {
            // If it's a RouteConfig, we treat it as a native route configuration
            // We'll bypass the fluent pipeline for the handler part, but apply schema/options
            // However, FluentBuilder is designed to build a handler. 
            // If we receive a RouteConfig, we should probably just register it.
            // But we need to support fluent methods like .desc(), .auth() etc.
            
            // For now, let's treat it as a direct route registration since RouteConfig implies native handling
            // We won't wrap it in the fluent handler.
             // @ts-ignore
            const route = this.app[this.method.toLowerCase()](this.path, handlerOrStatus);
            // Apply collected options
            this.applyOptionsToRoute(route);
            return;
        }
        
        // FluentBuilder interface: .respond(status?: number)
        const status = handlerOrStatus as number;
        const handler = async (ctx: RequestContext) => {
            let state: any = {};
            let finalStatus = status;
            
            try {
                for (const step of this.steps) {
                    // console.log(`[Fluent] Executing ${step.name}`);
                    const result = await step.fn(ctx, state);
                    // If result is null/undefined, we might keep old state or explicitly set it
                    // Here we assume steps return the new state or partial updates
                    if (result !== undefined) {
                        state = result;
                    }
                    // Check if status was set in the state
                    if (state._status !== undefined) {
                        finalStatus = state._status;
                        delete state._status; // Clean up
                    }
                }
                ctx.json(state, finalStatus);
            } catch (e: any) {
                const status = e.status || 500;
                const message = e.message || 'Internal Server Error';
                console.error(`[Fluent] Error in ${this.method} ${this.path}:`, e);
                ctx.json({ error: message }, status);
            }
        };

        // Register with App
        // @ts-ignore - accessing private routes
        const route = this.app[this.method.toLowerCase()](this.path, handler);
        
        // Apply options
        this.applyOptionsToRoute(route);
    }

    private applyOptionsToRoute(route: any) {
        if (this.requestSchema) {
            route.schema(this.requestSchema);
        }
        if (this.responseSchemaDef) {
            route.responseSchema(this.responseSchemaDef);
        }
        if (this.queryBuilder) {
            route.query(this.queryBuilder);
        }
        // Apply other options collected in steps if possible, 
        // but currently steps are executed at runtime. 
        // Some metadata like desc() might be useful to apply to route if route object supports it.
        
        if (this.useJwt) {
            route.jwt();
        }
    }

    private useJwt = false;

    // Route Options
    secure(): this {
        this.useJwt = true;
        // Also add a step to extract user from token if available
        this.steps.unshift({
            name: 'auth:extract',
            fn: (ctx, state) => {
                // Native JWT middleware validates the token, but we might need to access payload
                // The native engine doesn't automatically inject payload into ctx yet (pending feature)
                // So we manually parse it for now to populate state.user
                const authHeader = ctx.req.header('authorization');
                if (authHeader) {
                    const token = authHeader.split(' ')[1];
                    try {
                        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                        return { user: payload };
                    } catch (e) {}
                }
                return state;
            }
        });
        return this;
    }

    // Query Configuration Steps
    select(fields: string[]): this {
        this.steps.push({
            name: 'select',
            fn: (ctx, state) => ({ ...state, _query_select: fields })
        });
        return this;
    }

    sort(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
        this.steps.push({
            name: 'sort',
            fn: (ctx, state) => ({ ...state, _query_sort: { field, direction } })
        });
        return this;
    }

    paginate(options: { page: number, limit: number }): this {
        this.steps.push({
            name: 'paginate',
            fn: (ctx, state) => ({ ...state, _query_paginate: options })
        });
        return this;
    }

    autoFilter(
        table: string,
        allow: string[],
        options: {
            sort?: string[];
            select?: string[];
            defaultSort?: string;
            defaultDirection?: 'ASC' | 'DESC';
            maxLimit?: number;
            pageParam?: string;
            limitParam?: string;
            sortParam?: string;
            fieldsParam?: string;
        } = {}
    ): this {
        const sortAllow = options.sort || allow;
        const selectAllow = options.select || allow;
        const defaultSort = options.defaultSort || 'id';
        const defaultSortSafe = sortAllow.length > 0
            ? (sortAllow.includes(defaultSort) ? defaultSort : sortAllow[0])
            : defaultSort;
        const defaultDirection = options.defaultDirection || 'DESC';
        const maxLimit = options.maxLimit || 100;
        const pageParam = options.pageParam || 'page';
        const limitParam = options.limitParam || 'limit';
        const sortParam = options.sortParam || 'sort';
        const fieldsParam = options.fieldsParam || 'fields';

        const existingQueryBuilder = this.queryBuilder;
        this.queryBuilder = (q: any) => {
            if (existingQueryBuilder) existingQueryBuilder(q);
            for (const field of allow) {
                q.string(field).optional();
            }
            q.int(pageParam).optional().min(1);
            q.int(limitParam).optional().min(1).max(maxLimit);
            q.string(sortParam).optional();
            q.string(fieldsParam).optional();
        };

        this.steps.push({
            name: `autoFilter:${table}`,
            fn: async (ctx, state) => {
                if (!ctx.db) throw { status: 500, message: "Database not connected" };

                const query = ctx.query as Record<string, any>;
                const filters: Record<string, any> = {};
                for (const field of allow) {
                    if (query[field] !== undefined) {
                        filters[field] = query[field];
                    }
                }

                let selectFields = '*';
                const fieldsRaw = query[fieldsParam];
                if (typeof fieldsRaw === 'string') {
                    const parts = fieldsRaw.split(',').map((item) => item.trim()).filter((item) => selectAllow.includes(item));
                    if (parts.length > 0) {
                        selectFields = parts.join(', ');
                    }
                }

                let sortField = defaultSortSafe;
                let sortDirection: 'ASC' | 'DESC' = defaultDirection;
                const sortRaw = typeof query[sortParam] === 'string' ? query[sortParam] : undefined;
                if (sortRaw) {
                    let field = sortRaw;
                    let direction = defaultDirection;
                    if (sortRaw.includes(':')) {
                        const [f, d] = sortRaw.split(':');
                        field = f;
                        direction = d?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
                    } else if (sortRaw.endsWith('_desc')) {
                        field = sortRaw.replace('_desc', '');
                        direction = 'DESC';
                    } else if (sortRaw.endsWith('_asc')) {
                        field = sortRaw.replace('_asc', '');
                        direction = 'ASC';
                    }
                    if (sortAllow.includes(field)) {
                        sortField = field;
                        sortDirection = direction;
                    }
                }

                let limit: number | undefined;
                if (typeof query[limitParam] === 'number') {
                    limit = query[limitParam];
                } else if (typeof query[limitParam] === 'string') {
                    const parsed = Number.parseInt(query[limitParam], 10);
                    if (!Number.isNaN(parsed)) limit = parsed;
                }
                if (limit !== undefined) {
                    limit = Math.min(Math.max(limit, 1), maxLimit);
                }
                let page = typeof query[pageParam] === 'number' ? query[pageParam] : 1;
                if (typeof query[pageParam] === 'string') {
                    const parsed = Number.parseInt(query[pageParam], 10);
                    if (!Number.isNaN(parsed)) page = parsed;
                }
                if (!page || page < 1) page = 1;

                let sql = `SELECT ${selectFields} FROM ${table}`;
                const conditions: string[] = [];
                const params: any[] = [];

                for (const [key, value] of Object.entries(filters)) {
                    if (Array.isArray(value)) {
                        const offset = params.length;
                        for (const item of value) {
                            params.push(item);
                        }
                        const placeholdersFixed = value.map((_, idx) => `$${offset + idx + 1}`).join(', ');
                        conditions.push(`${key} IN (${placeholdersFixed})`);
                    } else {
                        params.push(value);
                        conditions.push(`${key} = $${params.length}`);
                    }
                }

                if (conditions.length > 0) {
                    sql += ` WHERE ${conditions.join(' AND ')}`;
                }

                if (sortField) {
                    sql += ` ORDER BY ${sortField} ${sortDirection}`;
                }

                if (limit !== undefined) {
                    params.push(limit);
                    sql += ` LIMIT $${params.length}`;
                }

                if (limit !== undefined) {
                    const offset = (page - 1) * limit;
                    params.push(offset);
                    sql += ` OFFSET $${params.length}`;
                }

                const res = await ctx.db.queryWithParams(sql, params);
                const rows = JSON.parse(res);
                return {
                    data: rows,
                    meta: {
                        page,
                        limit,
                        sort: { field: sortField, direction: sortDirection },
                        filters
                    }
                };
            }
        });
        return this;
    }

    // Database List (Select with filter)
    list(table: string, options: { where?: Record<string, string>, limit?: number } = {}): this {
        this.steps.push({
            name: `list:${table}`,
            fn: async (ctx, state) => {
                if (!ctx.db) throw { status: 500, message: "Database not connected" };

                const fields = state._query_select ? state._query_select.join(', ') : '*';
                let sql = `SELECT ${fields} FROM ${table}`;
                const conditions: string[] = [];
                const params: any[] = [];
                
                if (options.where) {
                    for (const [key, valRef] of Object.entries(options.where)) {
                        let val: any;
                        if (valRef.startsWith('@')) {
                            // Resolve from state
                            const path = valRef.substring(1).split('.');
                            val = path.reduce((acc: any, part: string) => acc && acc[part], state);
                        } else {
                            val = valRef;
                        }
                        
                        if (val === undefined) continue; // Skip undefined filters
                        
                        conditions.push(`${key} = $${params.length + 1}`);
                        params.push(val);
                    }
                }
                
                if (conditions.length > 0) {
                    sql += ` WHERE ${conditions.join(' AND ')}`;
                }
                
                // Sorting
                if (state._query_sort) {
                    sql += ` ORDER BY ${state._query_sort.field} ${state._query_sort.direction}`;
                } else {
                    sql += ' ORDER BY id DESC'; // Default
                }

                // Pagination
                const limit = options.limit || state._query_paginate?.limit;
                if (limit) {
                    sql += ` LIMIT ${limit}`;
                }

                if (state._query_paginate?.page && limit) {
                    const offset = (state._query_paginate.page - 1) * limit;
                    sql += ` OFFSET ${offset}`;
                }

                const res = await ctx.db.queryWithParams(sql, params);
                return JSON.parse(res);
            }
        });
        return this;
    }
    
    // Database Update
    update(table: string, options: { where: Record<string, string>, fields?: string[] }): this {
        this.steps.push({
            name: `update:${table}`,
            fn: async (ctx, state) => {
                if (!ctx.db) throw { status: 500, message: "Database not connected" };

                // Identify what to update (body) and what to filter by (where)
                const body = ctx.req.json();
                const params: any[] = [];
                
                const updates: string[] = [];
                for (const [key, val] of Object.entries(body)) {
                    if (key === 'id') continue; // Don't update ID
                    if (options.fields && !options.fields.includes(key)) continue; // Whitelist check
                    
                    updates.push(`${key} = $${params.length + 1}`);
                    params.push(val);
                }
                
                if (updates.length === 0) return state; // Nothing to update
                
                const conditions: string[] = [];
                for (const [key, valRef] of Object.entries(options.where)) {
                     let val: any;
                        if (valRef.startsWith('@')) {
                            // Resolve from state
                            const path = valRef.substring(1).split('.');
                            val = path.reduce((acc: any, part: string) => acc && acc[part], state);
                        } else if (valRef.startsWith(':')) {
                            // Resolve from params
                             val = ctx.req.param(valRef.substring(1));
                        } else {
                            val = valRef;
                        }
                        
                        if (val === undefined) throw { status: 400, message: `Missing value for ${key}` };
                        
                        conditions.push(`${key} = $${params.length + 1}`);
                        params.push(val);
                }
                
                const sql = `UPDATE ${table} SET ${updates.join(', ')} WHERE ${conditions.join(' AND ')} RETURNING *`;
                
                const res = await ctx.db.queryWithParams(sql, params);
                const rows = JSON.parse(res);
                if (rows.length === 0) throw { status: 404, message: 'Resource not found' };
                return rows[0];
            }
        });
        return this;
    }
    
    // Database Soft Delete
    softDelete(table: string, options: { where: Record<string, string> }): this {
        this.steps.push({
            name: `softDelete:${table}`,
            fn: async (ctx, state) => {
                if (!ctx.db) throw { status: 500, message: "Database not connected" };

                const conditions: string[] = [];
                const params: any[] = [];
                
                for (const [key, valRef] of Object.entries(options.where)) {
                     let val: any;
                        if (valRef.startsWith('@')) {
                            // Resolve from state
                            const path = valRef.substring(1).split('.');
                            val = path.reduce((acc: any, part: string) => acc && acc[part], state);
                        } else if (valRef.startsWith(':')) {
                            // Resolve from params
                             val = ctx.req.param(valRef.substring(1));
                        } else {
                            val = valRef;
                        }
                        
                        if (val === undefined) throw { status: 400, message: `Missing value for ${key}` };
                        
                        conditions.push(`${key} = $${params.length + 1}`);
                        params.push(val);
                }
                
                // Assuming 'deleted_at' column exists
                const sql = `UPDATE ${table} SET deleted_at = NOW() WHERE ${conditions.join(' AND ')} RETURNING *`;
                
                const res = await ctx.db.queryWithParams(sql, params);
                const rows = JSON.parse(res);
                if (rows.length === 0) throw { status: 404, message: 'Resource not found' };
                return { success: true, deleted: rows[0] };
            }
        });
        return this;
    }

    // Database Delete
    delete(table: string, options: { where: Record<string, string> }): this {
        this.steps.push({
            name: `delete:${table}`,
            fn: async (ctx, state) => {
                 if (!ctx.db) throw { status: 500, message: "Database not connected" };

                 const conditions: string[] = [];
                 const params: any[] = [];
                 
                for (const [key, valRef] of Object.entries(options.where)) {
                     let val: any;
                        if (valRef.startsWith('@')) {
                            // Resolve from state
                            const path = valRef.substring(1).split('.');
                            val = path.reduce((acc: any, part: string) => acc && acc[part], state);
                        } else if (valRef.startsWith(':')) {
                            // Resolve from params
                             val = ctx.req.param(valRef.substring(1));
                        } else {
                            val = valRef;
                        }
                        
                        if (val === undefined) throw { status: 400, message: `Missing value for ${key}` };
                        
                        conditions.push(`${key} = $${params.length + 1}`);
                        params.push(val);
                }
                
                const sql = `DELETE FROM ${table} WHERE ${conditions.join(' AND ')} RETURNING *`;
                const res = await ctx.db.queryWithParams(sql, params);
                const rows = JSON.parse(res);
                 if (rows.length === 0) throw { status: 404, message: 'Resource not found' };
                return { success: true, deleted: rows[0] };
            }
        });
        return this;
    }
}
