/**
 * One-time script to set up Postgres full-text search on the Product table.
 * Run: npx tsx server/scripts/setup-fts.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function main() {
  const sqlPath = path.resolve(__dirname, '../prisma/fts-setup.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // Split SQL into individual statements (split on semicolons not inside $$ blocks)
  const statements = splitStatements(sql);

  console.log(`Running FTS setup SQL (${statements.length} statements)...`);
  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }

  const count = await prisma.product.count();
  console.log(`Done. Backfilled search vectors for ${count} products.`);
}

/**
 * Split SQL text into individual statements, respecting $$ delimited blocks.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarBlock = false;

  const lines = sql.split('\n');
  for (const line of lines) {
    // Skip pure comment lines outside of blocks
    if (!inDollarBlock && line.trimStart().startsWith('--')) continue;

    current += line + '\n';

    // Track $$ blocks (DO $$ ... $$ and CREATE FUNCTION ... $$ LANGUAGE)
    const dollarMatches = line.match(/\$\$/g);
    if (dollarMatches) {
      for (const _ of dollarMatches) {
        inDollarBlock = !inDollarBlock;
      }
    }

    // If we're not in a $$ block and the line ends with a semicolon, it's a statement boundary
    if (!inDollarBlock && line.trimEnd().endsWith(';')) {
      const trimmed = current.trim();
      if (trimmed && trimmed !== ';') {
        statements.push(trimmed);
      }
      current = '';
    }
  }

  // Catch any trailing statement without a final semicolon
  const trimmed = current.trim();
  if (trimmed && trimmed !== ';') {
    statements.push(trimmed);
  }

  return statements;
}

main()
  .catch((e) => {
    console.error('FTS setup failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
