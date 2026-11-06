import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync('drizzle/0000_rooms.sql','utf8'));
  sqlite.exec(readFileSync('drizzle/0001_restart_votes.sql','utf8'));
  const DB = {
    prepare(sql) {
      let args = [];
      return {
        bind(...a) { args = a; return this; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        async all() { return {results:sqlite.prepare(sql).all(...args)}; },
        async run() { const r = sqlite.prepare(sql).run(...args); return {success:true,meta:{changes:Number(r.changes)}}; }
      };
    },
    async batch(statements) { const result = []; for (const s of statements) result.push(await s.run()); return result; }
  };
  return {DB,sqlite};
}
async function call(DB, path, body = {}, origin = 'http://localhost', allowed = '') {
  const res = await worker.fetch(new Request(`http://localhost/api/${path}`, {
    method:'POST', headers:{'content-type':'application/json',origin}, body:JSON.stringify(body)
  }), {DB,ALLOWED_ORIGINS:allowed});
  return {status:res.status,...await res.json()};
}
const creds = p => ({room:p.room.code,id:p.id,token:p.token});
test('rooms are explicitly created, discoverable, and joined without automatic matchmaking', async () => {
  const {DB,sqlite} = database();
  assert.deepEqual((await call(DB,'rooms')).rooms,[]);
  assert.equal((await call(DB,'join')).status,400);
  const host = await call(DB,'create',{name:'host'});
  const other = await call(DB,'create',{name:'other'});
  assert.notEqual(host.room.code,other.room.code);
  const list = (await call(DB,'rooms')).rooms;
  assert.equal(list.length,2);
  assert.equal(list.find(r => r.code === host.room.code).host_name,'host');
  assert.equal(list[0].players,1);
  const guest = await call(DB,'join',{name:'guest',code:host.room.code.toLowerCase()});
  assert.equal(guest.room.starts_at,0);
  assert.equal(guest.room.seed,host.room.seed);
  assert.equal(guest.players.length,2);
  assert.equal(guest.players.every(p => p.position === 0),true);
  assert.equal((await call(DB,'join',{code:'ZZZZZZ'})).status,404);
  sqlite.close();
});
test('shared clocks, authenticated progress, and stale-round protection', async () => {
  const {DB,sqlite} = database();
  const host = await call(DB,'create');
  const guest = await call(DB,'join',{code:host.room.code});
  assert.equal((await call(DB,'start',creds(guest))).status,403);
  const race = await call(DB,'start',creds(host));
  assert.ok(race.room.starts_at > Date.now());
  assert.equal((await call(DB,'start',creds(host))).status,409);
  assert.equal((await call(DB,'sync',{...creds(guest),token:'forged'})).status,401);
  const round = Date.now() - 5000;
  sqlite.prepare('UPDATE rooms SET starts_at=? WHERE code=?').run(round,host.room.code);
  const update = await call(DB,'sync',{...creds(guest),round,position:15,correct:13,attempts:17});
  assert.equal(update.players.find(p => p.id === guest.id).position,15);
  const stale = await call(DB,'sync',{...creds(guest),round:round-1000,position:900,correct:900,attempts:900});
  assert.equal(stale.players.find(p => p.id === guest.id).correct,13);
  sqlite.prepare('UPDATE rooms SET starts_at=? WHERE code=?').run(Date.now()-33000,host.room.code);
  const rematch = await call(DB,'start',creds(host));
  assert.equal(rematch.players.find(p => p.id === guest.id).position,0);
  sqlite.close();
});
test('leaving a running race hands off the host and the last departure removes the room', async () => {
  const {DB,sqlite} = database();
  const host = await call(DB,'create');
  const guest = await call(DB,'join',{code:host.room.code});
  const race = await call(DB,'start',creds(host));
  assert.equal((await call(DB,'leave',creds(host))).status,200);
  const remaining = await call(DB,'sync',creds(guest));
  assert.equal(remaining.players.length,1);
  assert.equal(remaining.room.host,guest.id);
  assert.equal(remaining.room.starts_at,race.room.starts_at);
  await call(DB,'leave',creds(guest));
  assert.equal((await call(DB,'rooms')).rooms.length,0);
  assert.equal((await call(DB,'join',{code:host.room.code})).status,404);
  sqlite.close();
});
test('private and abandoned rooms are omitted; names update and stale hosts transfer', async () => {
  const {DB,sqlite} = database();
  await call(DB,'create',{private:true});
  const host = await call(DB,'create',{name:'host'});
  const guest = await call(DB,'join',{code:host.room.code,name:'guest'});
  await call(DB,'name',{...creds(guest),name:'new name'});
  sqlite.prepare('UPDATE players SET seen_at=? WHERE id=?').run(Date.now()-15000,host.id);
  const remaining = await call(DB,'sync',creds(guest));
  assert.equal(remaining.room.host,guest.id);
  const list = (await call(DB,'rooms')).rooms;
  assert.equal(list.length,1);
  assert.equal(list[0].host_name,'new name');
  sqlite.prepare('UPDATE players SET seen_at=?').run(Date.now()-15000);
  assert.equal((await call(DB,'rooms')).rooms.length,0);
  sqlite.close();
});
test('simultaneous joins reserve distinct colors and enforce the eight-player limit', async () => {
  const {DB,sqlite} = database();
  const host = await call(DB,'create');
  const joined = await Promise.all(Array.from({length:12},(_,i) => call(DB,'join',{code:host.room.code,name:`player ${i}`})));
  assert.equal(joined.filter(p => p.status === 200).length,7);
  assert.equal(joined.filter(p => p.status === 409).length,5);
  const result = await call(DB,'sync',creds(host));
  assert.equal(result.players.length,8);
  assert.equal(new Set(result.players.map(p => p.color)).size,8);
  sqlite.close();
});
test('the Pages origin is allowed, including preflight, while unrelated origins are rejected', async () => {
  const {DB,sqlite} = database();
  const origin = 'https://jetthiggins.github.io';
  assert.equal((await call(DB,'rooms',{},origin)).status,403);
  assert.equal((await call(DB,'rooms',{},origin,origin)).status,200);
  const preflight = await worker.fetch(new Request('http://localhost/api/create',{
    method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}
  }),{DB,ALLOWED_ORIGINS:origin});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
  assert.equal(preflight.headers.get('access-control-allow-headers'),'Content-Type');
  assert.equal((await call(DB,'rooms',{},'https://jetthiggins.github.io.evil.example',origin)).status,403);
  sqlite.close();
});
test('restart requires unanimous active votes and rejects duplicate and stale votes', async () => {
 const {DB,sqlite}=database();
 const host=await call(DB,'create'); const guest=await call(DB,'join',{code:host.room.code});
 const round=Date.now()-1000;
 sqlite.prepare('UPDATE rooms SET starts_at=? WHERE code=?').run(round,host.room.code);
 const vote=await call(DB,'restart',{...creds(host),round});
 assert.equal(vote.room.starts_at,round); assert.equal(vote.restartVotes.length,1);
 const duplicate=await call(DB,'restart',{...creds(host),round}); assert.equal(duplicate.restartVotes.length,1);
 const restarted=await call(DB,'restart',{...creds(guest),round});
 assert.ok(restarted.room.starts_at>Date.now()); assert.deepEqual(restarted.restartVotes,[]);
 assert.equal((await call(DB,'restart',{...creds(host),round})).status,409);
 sqlite.close();
});
