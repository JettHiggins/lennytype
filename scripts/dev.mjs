import http from 'node:http';
import {readFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
mkdirSync('.local', {recursive:true});
const sqlite = new DatabaseSync('.local/lennytype.sqlite');
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get()) {
  sqlite.exec(readFileSync('drizzle/0000_rooms.sql', 'utf8'));
}
sqlite.exec(readFileSync('drizzle/0001_restart_votes.sql', 'utf8'));
function prepare(sql) {
  let args = [];
  return {
    bind(...values) { args = values; return this; },
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return {results:sqlite.prepare(sql).all(...args)}; },
    async run() { const result = sqlite.prepare(sql).run(...args); return {success:true, meta:{changes:Number(result.changes)}}; }
  };
}
let transaction = Promise.resolve();
const DB = {
  prepare,
  batch(statements) {
    // Queue batches so concurrent HTTP requests cannot nest SQLite transactions.
    const result = transaction.then(async () => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    });
    transaction = result.catch(() => {});
    return result;
  }
};
const port = Number(process.env.PORT || 3000);
const root = resolve(process.env.STATIC_DIR || 'public');
const types = {'.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.woff2':'font/woff2', '.html':'text/html;charset=utf-8', '.md':'text/plain;charset=utf-8', '.txt':'text/plain;charset=utf-8'};
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!url.pathname.startsWith('/api/')) {
      const path = decodeURIComponent(url.pathname);
      let file = resolve(root, `.${path.endsWith('/') ? path + 'index.html' : path}`);
      if (path === '/LICENSE' || path === '/THIRD_PARTY_NOTICES.md') file = resolve(path.slice(1));
      else if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', types[extname(file)] || 'text/plain');
      res.end(readFileSync(file));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(url, {method:req.method, headers:req.headers, ...(chunks.length ? {body:Buffer.concat(chunks)} : {})});
    const result = await worker.fetch(request, {DB, ALLOWED_ORIGINS:process.env.ALLOWED_ORIGINS || ''});
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) { console.error(error); res.writeHead(500); res.end('Server error'); }
}).listen(port, '0.0.0.0', () => console.log(`lennytype: http://localhost:${port}`));
