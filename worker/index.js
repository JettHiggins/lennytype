const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers:{'content-type':'application/json', 'cache-control':'no-store'}
});
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const cleanName = name => String(name || 'typist').trim().replace(/[<>\x00-\x1f]/g, '').slice(0,16) || 'typist';
const ACTIVE_MS = 12000;

async function state(db, code) {
  const room = await db.prepare('SELECT code,public,host,seed,starts_at FROM rooms WHERE code=?').bind(code).first();
  if (!room) fail('Room not found.', 404);
  const {results:players} = await db.prepare('SELECT id,name,color,position,correct,attempts,seen_at FROM players WHERE room=? AND seen_at>? ORDER BY color,id')
    .bind(code, Date.now() - ACTIVE_MS).all();
  if (players.length && !players.some(p => p.id === room.host)) {
    room.host = players[0].id;
    await db.prepare('UPDATE rooms SET host=? WHERE code=?').bind(room.host, code).run();
  }
  return {room, players, now:Date.now()};
}
async function addPlayer(db, room, name) {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = Date.now();
  // Each transactional batch reserves exactly one free color, even on simultaneous joins.
  const inserts = await db.batch(Array.from({length:8}, (_,color) => db.prepare(
    'INSERT INTO players(id,room,token,name,color,seen_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM players WHERE room=? AND id=?) AND NOT EXISTS (SELECT 1 FROM players WHERE room=? AND color=? AND seen_at>?)'
  ).bind(id, room.code, token, cleanName(name), color, now, room.code, id, room.code, color, now - ACTIVE_MS)));
  if (!inserts.some(result => result.meta.changes)) fail('Room is full.', 409);
  return {id, token, ...await state(db, room.code)};
}
async function handle(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return json({error:'Not found.'}, 404);
  if (request.method !== 'POST') return json({error:'Use POST.'}, 405);
  const db = env.DB;
  if (!db) fail('Multiplayer is unavailable.', 503);
  const body = await request.json();
  const now = Date.now();
  if (url.pathname === '/api/rooms') {
    const {results:rooms} = await db.prepare(
      'SELECT r.code,r.starts_at,COUNT(p.id) AS players,COALESCE(MAX(CASE WHEN p.id=r.host THEN p.name END),MIN(p.name)) AS host_name FROM rooms r JOIN players p ON p.room=r.code AND p.seen_at>? WHERE r.public=1 GROUP BY r.code ORDER BY r.created_at DESC LIMIT 50'
    ).bind(now - ACTIVE_MS).all();
    return json({rooms, now});
  }
  if (url.pathname === '/api/create') {
    const code = crypto.randomUUID().replace(/-/g, '').slice(0,6).toUpperCase();
    const room = {code, public:body.private ? 0 : 1, seed:Math.floor(Math.random() * 2147483647)};
    await db.prepare('INSERT INTO rooms(code,public,host,seed,created_at) VALUES(?,?,?,?,?)')
      .bind(code, room.public, '', room.seed, now).run();
    return json(await addPlayer(db, room, body.name));
  }
  if (url.pathname === '/api/join') {
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) fail('Enter a 6-character room code.');
    const room = await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();
    if (!room) fail('Room not found.', 404);
    return json(await addPlayer(db, room, body.name));
  }
  const code = String(body.room || '');
  const player = await db.prepare('SELECT * FROM players WHERE room=? AND id=? AND token=?')
    .bind(code, body.id || '', body.token || '').first();
  if (!player) fail('Session ended. Join the room again.', 401);
  if (url.pathname === '/api/leave') {
    await db.batch([
      db.prepare('DELETE FROM players WHERE room=? AND id=?').bind(code, player.id),
      db.prepare('DELETE FROM rooms WHERE code=? AND NOT EXISTS (SELECT 1 FROM players WHERE room=? AND seen_at>?)').bind(code, code, now - ACTIVE_MS)
    ]);
    return json({ok:true});
  }
  let room = await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();
  if (!room) fail('Room not found.', 404);
  if (url.pathname === '/api/start') {
    await state(db, code);
    room = await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();
    if (room.host !== player.id) fail('Only the host can start.', 403);
    if (room.starts_at && now < room.starts_at + 30000) fail('Race already started.', 409);
    await db.batch([
      db.prepare('UPDATE rooms SET starts_at=?,seed=? WHERE code=?').bind(now + 3000, Math.floor(Math.random() * 2147483647), code),
      db.prepare('UPDATE players SET position=0,correct=0,attempts=0 WHERE room=?').bind(code)
    ]);
  } else if (url.pathname === '/api/name') {
    await db.prepare('UPDATE players SET name=?,seen_at=? WHERE room=? AND id=?')
      .bind(cleanName(body.name), now, code, player.id).run();
  } else if (url.pathname === '/api/sync') {
    const position = Math.max(0, Math.min(10000, Math.floor(Number(body.position) || 0)));
    const correct = Math.max(0, Math.min(position, Math.floor(Number(body.correct) || 0)));
    const attempts = Math.max(correct, Math.min(30000, Math.floor(Number(body.attempts) || 0)));
    if (room.starts_at && body.round === room.starts_at && now >= room.starts_at && now <= room.starts_at + 32000) {
      await db.prepare('UPDATE players SET position=?,correct=?,attempts=?,seen_at=? WHERE room=? AND id=?')
        .bind(position, correct, attempts, now, code, player.id).run();
    } else {
      await db.prepare('UPDATE players SET seen_at=? WHERE room=? AND id=?').bind(now, code, player.id).run();
    }
  } else return json({error:'Not found.'}, 404);
  return json(await state(db, code));
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin');
    const self = new URL(request.url).origin;
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (origin && origin !== self && !allowed.includes(origin)) return json({error:'Invalid origin.'}, 403);
    let response;
    try {
      response = request.method === 'OPTIONS' ? new Response(null, {status:204}) : await handle(request, env);
    } catch (error) {
      if (!error.status) console.error(error.message, error.cause?.message || '');
      response = json({error:error.status ? error.message : 'Could not connect.'}, error.status || 500);
    }
    response.headers.set('Vary', 'Origin');
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      response.headers.set('Access-Control-Max-Age', '86400');
    }
    return response;
  }
};
