import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
mkdirSync('.local',{recursive:true});
const sqlite=new DatabaseSync('.local/multitype.sqlite');
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get()) sqlite.exec(readFileSync('drizzle/0000_rooms.sql','utf8'));
function prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}}}}}
const DB={prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements) result.push(await s.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
const port=Number(process.env.PORT||3000);
http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host}`);if(!url.pathname.startsWith('/api/')){const file=url.pathname==='/style.css'?'public/style.css':url.pathname==='/app.js'?'public/app.js':url.pathname==='/english.json'?'public/english.json':url.pathname==='/RobotoMono-Regular.woff2'?'public/RobotoMono-Regular.woff2':'public/index.html';res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.json')?'application/json':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(readFileSync(file));return}const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});const result=await worker.fetch(request,{DB});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()))}catch(e){console.error(e);res.writeHead(500);res.end('Server error')}}).listen(port,'0.0.0.0',()=>console.log(`multitype running at http://localhost:${port}`));
