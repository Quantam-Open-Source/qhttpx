import fs from 'fs';
import path from 'path';

export function parseEnv(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const [key, ...values] = trimmed.split('=');
        if (!key) continue;

        const value = values.join('=').trim();
        // Remove quotes if present (single or double)
        const finalValue = value.replace(/^['"](.*)['"]$/, '$1');
        
        env[key.trim()] = finalValue;
    }
    return env;
}

export function loadEnv(filePath?: string) {
    const envPath = filePath || path.resolve(process.cwd(), '.env');
    
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const parsed = parseEnv(content);
        
        for (const [key, value] of Object.entries(parsed)) {
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
        return true;
    }
    return false;
}

// Helper to get typed env vars
export function env(key: string, defaultValue?: string): string {
    return process.env[key] || defaultValue || '';
}
