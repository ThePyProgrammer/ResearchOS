// Optional disposable PostgreSQL engine: npm install --prefix backend/data/citation-validation @electric-sql/pglite
// Run from any directory: node backend/tests/run_citation_sql.mjs
import { readFile } from 'node:fs/promises'
import { PGlite } from '../data/citation-validation/node_modules/@electric-sql/pglite/dist/index.js'

const db = new PGlite()
try {
  const schema = await readFile(new URL('../migrations/schema.sql', import.meta.url), 'utf8')
  // Use the repository's actual library/paper definitions; storage policies need Supabase.
  await db.exec(schema.slice(0, schema.indexOf('-- WEBSITES')))
  const migration = await readFile(new URL('../migrations/033_paper_citations.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // Migration replay must be safe.
  await db.exec(await readFile(new URL('./sql/paper_citations.sql', import.meta.url), 'utf8'))
  console.log('Citation SQL transaction checks passed; migration applied twice.')
} finally {
  await db.close()
}
