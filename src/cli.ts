#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'child_process';
import path from 'path';
import pc from 'picocolors';
import fs from 'fs';
import { NativeEngine } from '../core';
import { loadEnv } from './env';

loadEnv();

type DbTarget = { type: 'postgres' | 'sqlite'; url: string };

const resolveDbTarget = (options: { postgres?: string; sqlite?: string }): DbTarget | null => {
  const postgresUrl = options.postgres ?? process.env.POSTGRES_URL;
  const sqliteUrl = options.sqlite ?? process.env.SQLITE_URL;

  if (postgresUrl && sqliteUrl) {
    throw new Error('Provide only one of --postgres or --sqlite.');
  }

  if (sqliteUrl) {
    return { type: 'sqlite', url: sqliteUrl };
  }

  if (postgresUrl) {
    return { type: 'postgres', url: postgresUrl };
  }

  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    const type = envUrl.startsWith('sqlite') ? 'sqlite' : 'postgres';
    return { type, url: envUrl };
  }

  return null;
};

const splitSqlStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const prev = i > 0 ? sql[i - 1] : '';

    if (ch === "'" && !inDouble && prev !== '\\') {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && prev !== '\\') {
      inDouble = !inDouble;
    }

    if (ch === ';' && !inSingle && !inDouble) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
};

const readSqlStatements = async (filePath: string): Promise<string[]> => {
  const raw = await fs.promises.readFile(filePath, 'utf8');
  const cleaned = raw.replace(/^\s*--.*$/gm, '').trim();
  if (!cleaned) return [];
  return splitSqlStatements(cleaned);
};

const ensureMigrationsTable = async (engine: NativeEngine, dbType: DbTarget['type']) => {
  const sql = dbType === 'sqlite'
    ? 'CREATE TABLE IF NOT EXISTS _qhttpx_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
    : 'CREATE TABLE IF NOT EXISTS _qhttpx_migrations (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT NOW())';
  await engine.queryDb(sql);
};

const getAppliedMigrations = async (engine: NativeEngine): Promise<string[]> => {
  const res = await engine.queryDb('SELECT name FROM _qhttpx_migrations ORDER BY id');
  const rows = JSON.parse(res) as Array<{ name?: string }>;
  return rows.map((row) => row.name).filter((name): name is string => Boolean(name));
};

const getMigrationFiles = async (dir: string) => {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const migrations = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.up.sql'))
    .map((entry) => {
      const name = entry.name.replace(/\.up\.sql$/, '');
      const upPath = path.join(dir, entry.name);
      const downPath = path.join(dir, `${name}.down.sql`);
      return { name, upPath, downPath };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return migrations;
};

const applyStatements = async (engine: NativeEngine, statements: string[]) => {
  for (const statement of statements) {
    await engine.queryDb(statement);
  }
};

const insertMigration = async (engine: NativeEngine, dbType: DbTarget['type'], name: string) => {
  const placeholder = dbType === 'sqlite' ? '?' : '$1';
  await engine.queryDbWithParams(
    `INSERT INTO _qhttpx_migrations (name) VALUES (${placeholder})`,
    [name]
  );
};

const removeMigration = async (engine: NativeEngine, dbType: DbTarget['type'], name: string) => {
  const placeholder = dbType === 'sqlite' ? '?' : '$1';
  await engine.queryDbWithParams(
    `DELETE FROM _qhttpx_migrations WHERE name = ${placeholder}`,
    [name]
  );
};

const runMigrations = async (direction: 'up' | 'down', options: { dir?: string; postgres?: string; sqlite?: string; steps?: string }) => {
  const dbTarget = resolveDbTarget(options);
  if (!dbTarget) {
    throw new Error('No database configured. Use --postgres, --sqlite, or set DATABASE_URL.');
  }

  const migrationsDir = path.resolve(process.cwd(), options.dir || 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const engine = new NativeEngine(0);
  if (dbTarget.type === 'sqlite') {
    await engine.connectSqlite(dbTarget.url);
  } else {
    await engine.connectPostgres(dbTarget.url);
  }

  await ensureMigrationsTable(engine, dbTarget.type);

  const migrations = await getMigrationFiles(migrationsDir);
  if (migrations.length === 0) {
    console.log(pc.yellow('No migrations found.'));
    return;
  }

  if (direction === 'up') {
    const applied = new Set(await getAppliedMigrations(engine));
    const pending = migrations.filter((m) => !applied.has(m.name));

    if (pending.length === 0) {
      console.log(pc.green('All migrations already applied.'));
      return;
    }

    for (const migration of pending) {
      const statements = await readSqlStatements(migration.upPath);
      if (statements.length === 0) continue;
      await applyStatements(engine, statements);
      await insertMigration(engine, dbTarget.type, migration.name);
      console.log(pc.green(`Applied ${migration.name}`));
    }
    return;
  }

  const applied = await getAppliedMigrations(engine);
  const steps = Math.max(1, Number.parseInt(options.steps || '1', 10) || 1);
  const toRollback = applied.slice(-steps).reverse();

  if (toRollback.length === 0) {
    console.log(pc.yellow('No migrations to roll back.'));
    return;
  }

  for (const name of toRollback) {
    const migration = migrations.find((m) => m.name === name);
    if (!migration) {
      throw new Error(`Migration file missing for ${name}`);
    }
    if (!fs.existsSync(migration.downPath)) {
      throw new Error(`Down migration not found for ${name}`);
    }
    const statements = await readSqlStatements(migration.downPath);
    if (statements.length === 0) continue;
    await applyStatements(engine, statements);
    await removeMigration(engine, dbTarget.type, name);
    console.log(pc.yellow(`Reverted ${name}`));
  }
};

const program = new Command();

program
  .name('qhttpx')
  .description('The AI-Native High-Performance Web Engine CLI')
  .version('0.1.1');

program
  .command('dev [entry]')
  .description('Start the development server with "Magic" Dev Mode')
  .action((entry = 'src/index.ts') => {
    console.clear();
    console.log(pc.bold(pc.cyan(`\n✨ QHTTPX Magic Dev Mode\n`)));
    
    const args = ['watch', entry];
    
    // Check if entry file exists
    const fs = require('fs');
    if (!fs.existsSync(entry)) {
      console.error(pc.red(`❌ Entry file not found: ${entry}`));
      console.log(pc.gray(`Please provide a valid entry file (default: src/index.ts)`));
      process.exit(1);
    }

    console.log(pc.gray(`Watching ${entry} and dependencies...`));

    const child = spawn('npx', ['tsx', ...args], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '1' }
    });

    child.on('error', (err) => {
      console.error(pc.red(`Failed to start server: ${err.message}`));
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        child.kill('SIGINT');
        process.exit(0);
    });
  });

const migrate = program
  .command('migrate')
  .description('Run SQL migrations');

migrate
  .command('up')
  .option('--dir <path>', 'Migrations directory', 'migrations')
  .option('--postgres <url>', 'Postgres connection string')
  .option('--sqlite <url>', 'SQLite connection string')
  .action(async (options) => {
    try {
      await runMigrations('up', options);
    } catch (err: any) {
      console.error(pc.red(err?.message || 'Migration failed.'));
      process.exitCode = 1;
    }
  });

migrate
  .command('down')
  .option('--dir <path>', 'Migrations directory', 'migrations')
  .option('--postgres <url>', 'Postgres connection string')
  .option('--sqlite <url>', 'SQLite connection string')
  .option('--steps <count>', 'Number of migrations to roll back', '1')
  .action(async (options) => {
    try {
      await runMigrations('down', options);
    } catch (err: any) {
      console.error(pc.red(err?.message || 'Migration failed.'));
      process.exitCode = 1;
    }
  });

program.parse();
