
import { Route } from '../types';

export function generateClient(routes: Route[]): string {
    const interfaces: string[] = [];
    const paths: string[] = [];
    let interfaceCounter = 0;

    // Helper: Convert JSON Schema to TS
    function schemaToTs(schema: any, name: string): string {
        if (!schema) return 'any';
        
        if (schema.type === 'object') {
            const props: string[] = [];
            const required = new Set(schema.required || []);
            
            for (const key in schema.properties) {
                const propSchema = schema.properties[key];
                const isReq = required.has(key);
                const tsType = schemaToTs(propSchema, `${name}_${key}`);
                props.push(`    ${key}${isReq ? '' : '?'}: ${tsType};`);
            }
            
            const interfaceName = `I${name}`;
            interfaces.push(`export interface ${interfaceName} {\n${props.join('\n')}\n}`);
            return interfaceName;
        }
        
        if (schema.type === 'array') {
            const itemType = schemaToTs(schema.items, `${name}_item`);
            return `${itemType}[]`;
        }
        
        if (schema.enum) {
            return schema.enum.map((v: string) => `'${v}'`).join(' | ');
        }
        
        if (schema.type === 'string') return 'string';
        if (schema.type === 'integer' || schema.type === 'number') return 'number';
        if (schema.type === 'boolean') return 'boolean';
        
        return 'any';
    }

    // Build Route Map
    const routeMap: Record<string, Record<string, { req: string, res: string }>> = {};

    for (const route of routes) {
        if (route.path.includes('/docs')) continue;

        if (!routeMap[route.path]) routeMap[route.path] = {};

        let reqType = 'any';
        if (route.options && route.options.schema) {
            try {
                const schema = JSON.parse(route.options.schema);
                // Create unique name for this route's body
                const name = `${route.method}_${route.path.replace(/[^a-zA-Z0-9]/g, '_')}_Body`;
                reqType = schemaToTs(schema, name);
            } catch (e) {
                console.warn(`Failed to parse schema for client gen: ${route.path}`);
            }
        }

        // Response type inference is hard without explicit return types in definition.
        // For now, default to 'any' or 'unknown'.
        const resType = 'any';

        routeMap[route.path][route.method] = { req: reqType, res: resType };
    }

    // Generate Code
    const lines = [
        `// Auto-generated QHTTPX Client`,
        `// Generated at ${new Date().toISOString()}`,
        ``,
        `export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';`,
        ``,
        `// --- Interfaces ---`,
        ...interfaces,
        ``,
        `// --- Route Definitions ---`,
        `export interface AppRoutes {`
    ];

    for (const [path, methods] of Object.entries(routeMap)) {
        lines.push(`    '${path}': {`);
        for (const [method, types] of Object.entries(methods)) {
            lines.push(`        '${method}': {`);
            lines.push(`            request: ${types.req};`);
            lines.push(`            response: ${types.res};`);
            lines.push(`        };`);
        }
        lines.push(`    };`);
    }
    lines.push(`}`);
    lines.push(``);

    // Client Class
    lines.push(`
export class Client {
    constructor(private baseUrl: string, private token?: string) {}

    setToken(token: string) {
        this.token = token;
    }

    private async request<P extends keyof AppRoutes, M extends keyof AppRoutes[P]>(
        method: M, 
        path: P, 
        body?: any
    ): Promise<any> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = \`Bearer \${this.token}\`;

        // Handle path params if any (naive replacement)
        // Note: The typed path must match the definition (e.g. /users/:id). 
        // Real usage would need a path builder, but for now we assume exact match or user string manipulation.
        
        const res = await fetch(\`\${this.baseUrl}\${path as string}\`, {
            method: method as string,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        if (!res.ok) {
            throw new Error(\`Request failed: \${res.status} \${res.statusText}\`);
        }

        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return res.json();
        }
        return res.text();
    }

    get<P extends keyof AppRoutes>(path: P): Promise<AppRoutes[P]['GET' & keyof AppRoutes[P]]['response']> {
        return this.request('GET', path);
    }

    post<P extends keyof AppRoutes>(
        path: P, 
        body: AppRoutes[P]['POST' & keyof AppRoutes[P]]['request']
    ): Promise<AppRoutes[P]['POST' & keyof AppRoutes[P]]['response']> {
        return this.request('POST', path, body);
    }

    put<P extends keyof AppRoutes>(
        path: P, 
        body: AppRoutes[P]['PUT' & keyof AppRoutes[P]]['request']
    ): Promise<AppRoutes[P]['PUT' & keyof AppRoutes[P]]['response']> {
        return this.request('PUT', path, body);
    }

    delete<P extends keyof AppRoutes>(path: P): Promise<AppRoutes[P]['DELETE' & keyof AppRoutes[P]]['response']> {
        return this.request('DELETE', path);
    }
}
    `);

    return lines.join('\n');
}
