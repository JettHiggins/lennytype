const PAGE = /* PAGE */ null;
const ASSETS = /* ASSETS */ {};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const cleanName=name=>String(name||'typist').trim().replace(/[<>\x00-\x1f]/g,'').slice(0,16)||'typist';
async function state(db,code){
 const room=await db.prepare('SELECT code,public,host,seed,starts_at FROM rooms WHERE code=?').bind(code).first();
 if(!room)fail('That room no longer exists.',404);
 const {results:players}=await db.prepare('SELECT id,name,color,position,correct,attempts,seen_at FROM players WHERE room=? AND seen_at>? ORDER BY color,id').bind(code,Date.now()-12000).all();
 if(players.length&&!players.some(p=>p.id===room.host)){room.host=players[0].id;await db.prepare('UPDATE rooms SET host=? WHERE code=?').bind(room.host,code).run()}
 return {room,players,now:Date.now()};
}
export default {async fetch(request,env){
 try{
 const url=new URL(request.url);
 if(ASSETS[url.pathname]){const asset=ASSETS[url.pathname];return new Response(asset.encoding==='base64'?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body,{headers:{'content-type':asset.type,'cache-control':'public,max-age=86400'}})}
 if(!url.pathname.startsWith('/api/'))return new Response(PAGE||'Use npm run dev for local development.',{headers:{'content-type':'text/html;charset=utf-8'}});
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Invalid origin.'},403);
 const db=env.DB;if(!db)fail('Multiplayer storage is unavailable. Practice is still available.',503);
 const body=await request.json();const now=Date.now();
 if(url.pathname==='/api/join'){
  let room;let code=String(body.code||'').trim().toUpperCase();
  if(code&&!/^[A-Z0-9]{6}$/.test(code))fail('Room codes have 6 letters or numbers.');
  if(code){room=await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();if(!room)fail('Room not found. Double-check the code.',404)}
  else if(!body.private){room=await db.prepare('SELECT r.* FROM rooms r WHERE r.public=1 AND r.starts_at=0 AND r.created_at>? AND (SELECT COUNT(*) FROM players p WHERE p.room=r.code AND p.seen_at>?) BETWEEN 1 AND 7 ORDER BY r.created_at LIMIT 1').bind(now-3600000,now-12000).first()}
  const id=crypto.randomUUID();const token=crypto.randomUUID();
  if(!room){code=crypto.randomUUID().replace(/-/g,'').slice(0,6).toUpperCase();room={code,public:body.private?0:1,host:id,seed:Math.floor(Math.random()*2147483647),starts_at:0};await db.prepare('INSERT INTO rooms(code,public,host,seed,created_at) VALUES(?,?,?,?,?)').bind(code,room.public,id,room.seed,now).run()}
  const {results:active}=await db.prepare('SELECT color FROM players WHERE room=? AND seen_at>?').bind(room.code,now-12000).all();
  if(active.length>=8)fail('This room is full. Try another room.',409);
  const color=Array.from({length:8},(_,i)=>i).find(i=>!active.some(p=>p.color===i));
  await db.prepare('INSERT INTO players(id,room,token,name,color,seen_at) VALUES(?,?,?,?,?,?)').bind(id,room.code,token,cleanName(body.name),color,now).run();
  return json({id,token,...await state(db,room.code)});
 }
 const code=String(body.room||'');
 const player=await db.prepare('SELECT * FROM players WHERE room=? AND id=? AND token=?').bind(code,body.id||'',body.token||'').first();
 if(!player)fail('Your session ended. Join a room again.',401);
 if(url.pathname==='/api/leave'){await db.prepare('DELETE FROM players WHERE room=? AND id=?').bind(code,player.id).run();return json({ok:true})}
 let room=await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();if(!room)fail('Room not found.',404);
 if(url.pathname==='/api/start'){
  await state(db,code);room=await db.prepare('SELECT * FROM rooms WHERE code=?').bind(code).first();
  if(room.host!==player.id)fail('The room host starts the race.',403);
  if(room.starts_at&&now<room.starts_at+30000)fail('The race is already running.',409);
  await db.batch([db.prepare('UPDATE rooms SET starts_at=?,seed=? WHERE code=?').bind(now+3000,Math.floor(Math.random()*2147483647),code),db.prepare('UPDATE players SET position=0,correct=0,attempts=0 WHERE room=?').bind(code)]);
 }else if(url.pathname==='/api/sync'){
  const position=Math.max(0,Math.min(10000,Math.floor(Number(body.position)||0)));
  const correct=Math.max(0,Math.min(position,Math.floor(Number(body.correct)||0)));
  const attempts=Math.max(correct,Math.min(30000,Math.floor(Number(body.attempts)||0)));
  if(room.starts_at&&now>=room.starts_at&&now<=room.starts_at+32000){await db.prepare('UPDATE players SET position=?,correct=?,attempts=?,seen_at=? WHERE room=? AND id=?').bind(position,correct,attempts,now,code,player.id).run()}
  else await db.prepare('UPDATE players SET seen_at=? WHERE room=? AND id=?').bind(now,code,player.id).run();
 }else return json({error:'Not found'},404);
 return json(await state(db,code));
 }catch(error){if(!error.status)console.error(error);return json({error:error.status?error.message:'Something went wrong. Please try again.'},error.status||500)}
}};
