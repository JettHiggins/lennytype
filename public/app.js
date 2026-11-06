/* lennytype. English word list © Monkeytype contributors, GPL-3.0.
   Caret timing follows Monkeytype's smooth caret default (100 ms). */
const $ = id => document.getElementById(id);
const icons = {
  settings: '<path d="m12 3 2 3 3-.2.8 3.1 2.6 1.8-1.6 2.8.6 3.1-3 .9-2 2.5-2.8-1.4-3.2.3-.7-3.1L5 14l1.5-2.8L6 8.1l3-.9Z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  refresh: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>'
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const COLORS = ['#e2b714','#bb9af7','#7dc4a5','#f28b82','#7aa2f7','#ed9dcc','#e5b880','#8bd5ca'];
const anonymousName = 'typist ' + Math.random().toString(36).slice(2,5);
let restartSupported = false;
const apiBase = String(window.LENNYTYPE_CONFIG?.apiBase || '').replace(/\/$/, '');
let settings = { smooth:true, stats:true, theme:'serika' };
let nickname = 'you';
try {
  settings = {...settings, ...JSON.parse(localStorage.getItem('lennytype.settings') || localStorage.getItem('multitype.settings') || '{}')};
  nickname = localStorage.getItem('lennytype.name') || localStorage.getItem('multitype.name') || 'you';
} catch {}
if (!['serika','midnight','paper'].includes(settings.theme)) settings.theme = 'serika';
let dictionary = [], session = null, room = null, players = [], state = 'home';
let words = [], offsets = [], records = [], committed = [], wordIndex = 0;
let attempts = 0, hits = 0, position = 0, correct = 0, startAt = 0, clockOffset = 0, scrollY = 0;
let syncBusy = false, lastSync = 0, switching = false, starting = false, connectionErrors = 0;
let lastPlayerSignature = '', toastTimer, tabArmed = false, listBusy = false;
const input = $('typingInput');
function now() { return Date.now() + clockOffset; }
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2500);
}
function applySettings() {
  document.body.dataset.theme = settings.theme;
  document.body.classList.toggle('no-smooth', !settings.smooth);
  $('smoothSetting').checked = settings.smooth;
  $('statsSetting').checked = settings.stats;
  $('themeSelect').value = settings.theme;
  $('liveStats').hidden = !settings.stats || state !== 'racing';
}
function saveSettings() {
  try { localStorage.setItem('lennytype.settings', JSON.stringify(settings)); } catch {}
  applySettings();
}
function resetTest(seed) {
  words = makeWords(seed);
  let offset = 0;
  offsets = words.map(word => { const start = offset; offset += word.length + 1; return start; });
  records = words.map(() => '');
  committed = words.map(() => false);
  wordIndex = attempts = hits = position = correct = scrollY = 0;
  $('wordTrack').style.transform = 'translateY(0)';
  $('words').innerHTML = words.map((word,i) => `<span class="word" data-word="${i}">${[...word].map((letter,j) => `<span class="letter" data-pos="${offsets[i]+j}">${escapeHTML(letter)}</span>`).join('')}</span>`).join('');
  $('carets').replaceChildren();
  $('results').hidden = true;
  $('timeProgress').style.width = '100%';
  input.value = '';
  lastPlayerSignature = '';
}
function random(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
function makeWords(seed){const rng=random(seed);const result=[];for(let i=0;i<400;i++){let word;do{word=dictionary[Math.floor(rng()*dictionary.length)].toLowerCase()}while(word===result.at(-1));result.push(word)}return result}
function renderWord(i){const el=$('words').children[i];if(!el)return;const typed=records[i];el.classList.toggle('missed',committed[i]&&typed!==words[i]);el.innerHTML=[...words[i]].map((letter,j)=>`<span class="letter ${j<typed.length?(typed[j]===letter?'correct':'incorrect'):''}" data-pos="${offsets[i]+j}">${escapeHTML(letter)}</span>`).join('')+[...typed.slice(words[i].length)].map(letter=>`<span class="letter extra">${escapeHTML(letter)}</span>`).join('')}
function calculate(){position=offsets[wordIndex]+Math.min(records[wordIndex].length,words[wordIndex].length);correct=0;for(let i=0;i<=wordIndex;i++){for(let j=0;j<Math.min(records[i].length,words[i].length);j++)if(records[i][j]===words[i][j])correct++;if(committed[i]&&records[i]===words[i])correct++}}
function typeCharacter(char){if(state!=='racing'||now()>=startAt+30000)return;if(wordIndex>=words.length-1)return;const current=records[wordIndex];if(char===' '){if(!current.length)return;attempts++;if(current===words[wordIndex])hits++;committed[wordIndex]=true;renderWord(wordIndex);wordIndex++}else if(char.length===1&&!/[\r\n\t]/.test(char)){if(current.length>words[wordIndex].length+15)return;attempts++;if(char===words[wordIndex][current.length])hits++;records[wordIndex]+=char;renderWord(wordIndex)}calculate();updateCarets();updateStats()}
function backspace(wholeWord=false){if(state!=='racing')return;const current=records[wordIndex];if(current.length){records[wordIndex]=wholeWord?'':current.slice(0,-1);renderWord(wordIndex)}else if(wordIndex>0&&records[wordIndex-1]!==words[wordIndex-1]){wordIndex--;committed[wordIndex]=false;renderWord(wordIndex)}calculate();updateCarets();updateStats()}
function metrics(player){const elapsed=state==='finished'?30:Math.max(.5,Math.min(30,(now()-startAt)/1000));return {wpm:Math.round((player?player.correct:correct)/5/(elapsed/60)),accuracy:Math.round(100*(player?player.attempts?(player.hits??player.correct)/player.attempts:1:attempts?hits/attempts:1))}}
function localPlayer(){return {id:session?.id||'local',name:nickname,color:session?players.find(p=>p.id===session.id)?.color||0:0,position,correct,attempts}}
function updateStats(){const m=metrics();$('liveWpm').textContent=m.wpm;$('liveAccuracy').textContent=m.accuracy}
function cursorPoint(index, own = false) {
  let word, target, extra = 0;
  if (own) {
    word = $('words').children[wordIndex];
    if (!word) return null;
    const length = records[wordIndex].length;
    target = word.children[Math.min(length, word.children.length - 1)];
    if (length >= word.children.length) extra = target?.offsetWidth || 0;
  } else {
    target = $('words').querySelector(`[data-pos="${index}"]`);
    if (target) word = target.parentElement;
    else {
      const i = offsets.findIndex((offset,i) => index === offset + words[i].length);
      if (i < 0) return null;
      word = $('words').children[i];
      target = word.lastElementChild;
      extra = target.offsetWidth;
    }
  }
  if (!target) return null;
  const lineHeight = parseFloat(getComputedStyle($('words')).lineHeight);
  const caretHeight = innerWidth <= 700 ? 30 : 33;
  return {x: target.offsetLeft + extra, y: word.offsetTop + (lineHeight - caretHeight) / 2};
}
function updateCarets() {
  if (state !== 'racing' || !session || !words.length) return;
  const ownPoint = cursorPoint(position, true);
  if (!ownPoint) return;
  const lineHeight = parseFloat(getComputedStyle($('words')).lineHeight);
  const nextScroll = Math.max(0, Math.floor(ownPoint.y / lineHeight) - 1) * lineHeight;
  if (scrollY !== nextScroll) {
    scrollY = nextScroll;
    $('wordTrack').style.transform = `translateY(${-scrollY}px)`;
  }
  const valid = new Set();
  for (const p of [...players.filter(p => p.id !== session.id), localPlayer()]) {
    const own = p.id === session.id;
    const key = own ? 'local' : p.id;
    valid.add(key);
    let el = $('carets').querySelector(`[data-caret="${key}"]`);
    if (!el) {
      el = document.createElement('div');
      el.dataset.caret = key;
      el.className = `caret${own ? '' : ' remote'}`;
      el.style.setProperty('--cursor', COLORS[p.color % 8]);
      if (!own) {
        const label = document.createElement('span');
        label.className = 'caret-label';
        el.append(label);
      }
      $('carets').append(el);
    }
    let point = own ? ownPoint : cursorPoint(p.position);
    if (!point) { el.hidden = true; continue; }
    el.hidden = false;
    point = {x: point.x, y: point.y - scrollY};
    let outside = false;
    if (!own) {
      const height = $('wordViewport').clientHeight;
      if (point.y < 0) { point = {x:2, y:18}; outside = true; }
      else if (point.y > height - 33) { point = {x:$('wordViewport').clientWidth - 3, y:height - 36}; outside = true; }
      const label = el.firstElementChild;
      label.textContent = (outside ? p.position > position ? '→ ' : '← ' : '') + p.name;
      label.style.opacity = outside ? '1' : '';
      label.style.left = outside && p.position > position ? 'auto' : '';
      label.style.right = outside && p.position > position ? '0' : '';
    }
    el.style.transform = `translate(${point.x - 1}px, ${point.y}px)`;
  }
  for (const el of $('carets').children) if (!valid.has(el.dataset.caret)) el.remove();
}
function renderPlayers() {
  const signature = JSON.stringify(players.map(p => [p.id,p.name,p.color,p.position,p.correct])) + state;
  if (signature === lastPlayerSignature) return;
  lastPlayerSignature = signature;
  $('playerCount').textContent = `${players.length}/8`;
  $('playerList').innerHTML = players.map(p => {
    const own = p.id === session?.id;
    const name = own ? nickname : p.name;
    const wpm = state === 'racing' || state === 'finished' ? metrics(own ? undefined : p).wpm : null;
    return `<div class="player" style="--player:${COLORS[p.color % 8]}"><span class="player-dot"></span><span class="player-name">${escapeHTML(name)}</span>${own && name !== 'you' ? '<span class="you-label">you</span>' : ''}${wpm === null ? '' : `<span class="player-wpm">${wpm}</span>`}</div>`;
  }).join('');
}
function showRoomState() {
  $('restartButton').hidden = state !== 'racing' || !restartSupported;
  $('home').hidden = true;
  $('game').hidden = false;
  $('roomCode').textContent = room.code;
  $('typingArea').hidden = state !== 'racing';
  $('waitingArea').hidden = !['lobby','countdown'].includes(state);
  $('timeLeft').hidden = !['racing','countdown'].includes(state);
  $('timeTrack').hidden = state !== 'racing';
  $('results').hidden = state !== 'finished';
  $('startButton').hidden = state === 'countdown';
  const host = room.host === session.id;
  $('startButton').disabled = !host || starting;
  $('startButton').textContent = host ? 'start race' : 'waiting for host';
  document.body.classList.toggle('racing', state === 'racing');
  applySettings();
  renderPlayers();
}
function applyState(data) {
  if (!session || switching) return;
  if (room && room.starts_at > data.room.starts_at) return;
  restartSupported = Array.isArray(data.restartVotes);
  clockOffset = data.now - Date.now();
  const previousStart = room?.starts_at;
  room = data.room;
  players = data.players;
  if (room.starts_at && (room.starts_at !== previousStart || !startAt)) {
    resetTest(room.seed);
    startAt = room.starts_at;
    state = now() < startAt ? 'countdown' : now() < startAt + 30000 ? 'racing' : 'finished';
    if (state === 'racing') beginRacing();
  }
  showRoomState();
  const votes = data.restartVotes || [];
  $('restartButton').hidden = state !== 'racing' || !restartSupported;
  $('restartButton').disabled = votes.includes(session.id);
  $('restartButton').textContent = votes.length ? `restart ${votes.length}/${players.length}${votes.includes(session.id) ? ' · requested' : ' · request'}` : 'request restart';
  updateCarets();
  if (state === 'finished') renderResults();
}
async function api(path, body = {}, keepalive = false) {
  if (!apiBase && location.hostname.endsWith('.github.io')) throw new Error('Multiplayer is unavailable.');
  const response = await fetch(`${apiBase}/api/${path}`, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify(body), keepalive
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Multiplayer is unavailable.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not connect.');
  return data;
}
function credentials() { return {room:room?.code, id:session?.id, token:session?.token}; }
function homeURL() { return new URL(location.pathname, location.origin); }
function showHome() {
  session = room = null;
  players = [];
  state = 'home';
  startAt = position = correct = attempts = hits = 0;
  words = offsets = records = committed = [];
  $('words').replaceChildren();
  $('carets').replaceChildren();
  $('home').hidden = false;
  $('game').hidden = true;
  $('typingArea').hidden = true;
  $('typingArea').classList.remove('unfocused');
  document.body.classList.remove('racing');
  history.replaceState({}, '', homeURL());
  input.blur();
}
async function leaveRoom() {
  if (switching) return;
  const old = session ? credentials() : null;
  showHome();
  if (old) {
    try { await api('leave', old, true); } catch { /* Presence expires if disconnected. */ }
  }
}
async function enterRoom(path, body = {}) {
  if (switching || !dictionary.length) return;
  switching = true;
  $('createRoom').disabled = true;
  $('roomError').textContent = '';
  try {
    const data = await api(path, {name:nickname === 'you' ? anonymousName : nickname, ...body});
    const old = session ? credentials() : null;
    session = {id:data.id, token:data.token};
    room = data.room;
    players = data.players;
    clockOffset = data.now - Date.now();
    state = 'lobby';
    startAt = room.starts_at && now() >= room.starts_at + 30000 ? room.starts_at : 0;
    syncBusy = false;
    lastSync = 0;
    connectionErrors = 0;
    resetTest(room.seed);
    switching = false;
    applyState(data);
    if (old) api('leave', old, true).catch(() => {});
    const url = homeURL();
    url.searchParams.set('room', room.code);
    history.replaceState({}, '', url);
    $('joinDialog').close();
  } catch (error) {
    $('roomError').textContent = error.message;
    if (!$('joinDialog').open) toast(error.message);
  } finally {
    switching = false;
    $('createRoom').disabled = false;
  }
}
async function refreshRooms() {
  if (listBusy || !$('joinDialog').open) return;
  listBusy = true;
  $('refreshRooms').disabled = true;
  try {
    const data = await api('rooms');
    $('roomError').textContent = '';
    $('roomList').innerHTML = data.rooms.length ? data.rooms.map(r => {
      const status = r.starts_at && data.now < r.starts_at ? 'starting' : r.starts_at && data.now < r.starts_at + 30000 ? 'racing' : 'waiting';
      return `<button type="button" role="listitem" class="room-row" data-room="${r.code}" ${r.players >= 8 ? 'disabled' : ''}><span class="room-row-code">${r.code}</span><span class="room-row-host">${escapeHTML(r.host_name)}</span><span class="room-row-status">${status}</span><span class="room-row-count">${r.players}/8</span></button>`;
    }).join('') : '<div class="room-list-empty">no rooms</div>';
  } catch (error) {
    $('roomList').replaceChildren();
    $('roomError').textContent = error.message;
  } finally {
    listBusy = false;
    $('refreshRooms').disabled = false;
  }
}
async function sync() {
  if (!session || switching || starting || syncBusy || (state !== 'racing' && Date.now() - lastSync < 900)) return;
  lastSync = Date.now();
  syncBusy = true;
  const id = session.id;
  try {
    calculate();
    const data = await api('sync', {...credentials(), position, correct, attempts, round:startAt});
    if (session?.id !== id) return;
    connectionErrors = 0;
    applyState(data);
  } catch (error) {
    if (session?.id === id && ++connectionErrors === 3) toast('Connection lost. Reconnecting…');
  } finally {
    syncBusy = false;
  }
}
async function start() {
  if (starting || switching || !session || room.host !== session.id || !['lobby','finished'].includes(state)) return;
  starting = true;
  const id = session.id;
  $('startButton').disabled = true;
  try {
    const data = await api('start', credentials());
    if (session?.id === id) applyState(data);
  } catch (error) { toast(error.message); }
  finally { starting = false; if (session?.id === id) showRoomState(); }
}
function beginRacing() {
  $('restartButton').disabled = false;
  $('restartButton').textContent = 'request restart';
  state = 'racing';
  showRoomState();
  $('typingArea').classList.remove('unfocused');
  focusInput();
  updateCarets();
}
function renderResults() {
  const list = players.map(p => p.id === session.id ? {...p,...localPlayer()} : p)
    .sort((a,b) => b.correct - a.correct || b.position - a.position);
  const rank = list.findIndex(p => p.id === session.id) + 1;
  const m = metrics();
  $('resultWpm').textContent = m.wpm;
  $('resultAccuracy').innerHTML = `${m.accuracy}<span>%</span>`;
  $('resultPlace').innerHTML = `${rank || 1}<span>/${list.length}</span>`;
  $('leaderboard').innerHTML = list.length > 1 ? list.map((p,i) => `<div class="leader-row"><span class="leader-rank">${i+1}</span><span class="player-dot" style="--player:${COLORS[p.color % 8]}"></span><span class="leader-name">${escapeHTML(p.name)}</span><span class="leader-score">${Math.round(p.correct / 2.5)} wpm</span></div>`).join('') : '';
  $('againButton').disabled = room.host !== session.id || starting;
  $('againButton').textContent = room.host === session.id ? 'play again →' : 'waiting for host to play again';
}
function finish() {
  state = 'finished';
  input.blur();
  showRoomState();
  renderResults();
  lastSync = 0;
  sync();
}
function frame() {
  if (state === 'countdown') {
    const remaining = Math.ceil((startAt - now()) / 1000);
    $('timeLeft').textContent = Math.max(1, remaining);
    if (remaining <= 0) beginRacing();
  } else if (state === 'racing') {
    const remaining = Math.max(0, startAt + 30000 - now());
    $('timeLeft').textContent = Math.ceil(remaining / 1000);
    $('timeProgress').style.width = `${remaining / 300}%`;
    if (remaining <= 0) finish();
  }
  requestAnimationFrame(frame);
}
function focusInput() {
  if (state === 'racing' && !document.querySelector('dialog[open]')) {
    input.focus({preventScroll:true});
    $('typingArea').classList.remove('unfocused');
  }
}
async function copyRoomLink() {
  const url = homeURL();
  url.searchParams.set('room', room.code);
  try { await navigator.clipboard.writeText(url.href); toast('Link copied'); }
  catch { toast(room.code); }
}
$('createRoom').onclick = () => enterRoom('create');
$('browseRooms').onclick = () => { $('joinDialog').showModal(); refreshRooms(); };
$('refreshRooms').onclick = refreshRooms;
$('roomList').onclick = e => {
  const row = e.target.closest('[data-room]');
  if (row && !row.disabled) enterRoom('join', {code:row.dataset.room});
};
$('joinForm').onsubmit = e => {
  e.preventDefault();
  const code = $('joinCode').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { $('roomError').textContent = 'Enter a 6-character room code.'; return; }
  enterRoom('join', {code});
};
$('restartButton').onclick = async () => {
  const id = session?.id;
  try { const data = await api('restart', {...credentials(),round:startAt}); if(session?.id === id) applyState(data); }
  catch(error) { toast(error.message); }
};
$('leaveRoom').onclick = leaveRoom;
$('copyCode').onclick = copyRoomLink;
$('startButton').onclick = start;
$('againButton').onclick = start;
document.querySelector('.brand').onclick = e => { e.preventDefault(); leaveRoom(); };
$('profileButton').onclick = () => { $('nickname').value = nickname === 'you' ? '' : nickname; $('profileDialog').showModal(); };
$('nameForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('nickname').value.trim().replace(/[<>\x00-\x1f]/g, '').slice(0,16) || 'you';
  try {
    if (session) applyState(await api('name', {...credentials(), name:name === 'you' ? anonymousName : name}));
    nickname = name;
    try { localStorage.setItem('lennytype.name', nickname); } catch {}
    $('profileButton').textContent = `name: ${nickname} ✎`;
    lastPlayerSignature = '';
    renderPlayers();
    $('profileDialog').close();
  } catch (error) { toast(error.message); }
};
$('settingsButton').onclick = () => $('settingsDialog').showModal();
$('smoothSetting').onchange = e => { settings.smooth = e.target.checked; saveSettings(); };
$('statsSetting').onchange = e => { settings.stats = e.target.checked; saveSettings(); };
$('themeSelect').onchange = e => { settings.theme = e.target.value; saveSettings(); };
$('typingArea').addEventListener('pointerdown', e => { e.preventDefault(); focusInput(); });
input.addEventListener('focus', () => $('typingArea').classList.remove('unfocused'));
input.addEventListener('blur', () => { if (state === 'racing') $('typingArea').classList.add('unfocused'); });
input.addEventListener('input', e => {
  if (e.isComposing) return;
  const value = input.value;
  input.value = '';
  if (e.inputType === 'deleteContentBackward') { backspace(); return; }
  for (const char of value) typeCharacter(char);
});
input.addEventListener('paste', e => e.preventDefault());
input.addEventListener('drop', e => e.preventDefault());
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') { tabArmed = true; return; }
  const restart = e.key === 'Enter' && tabArmed;
  tabArmed = false;
  if (e.target.closest('button,a,input,select') && ['Enter',' '].includes(e.key)) return;
  if (document.querySelector('dialog[open]') || state === 'home') return;
  if (restart) { e.preventDefault(); start(); return; }
  if (e.key === 'Escape' && state === 'racing') { e.preventDefault(); input.blur(); $('typingArea').classList.add('unfocused'); return; }
  if (e.key === 'Enter') { e.preventDefault(); if (state === 'lobby' || state === 'finished') start(); else focusInput(); return; }
  if (state !== 'racing') return;
  if (e.key === 'Backspace' && document.activeElement === input) { e.preventDefault(); backspace(e.ctrlKey || e.metaKey || e.altKey); return; }
  if (e.key === ' ' && document.activeElement === input) { e.preventDefault(); typeCharacter(' '); return; }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== input && document.activeElement?.tagName !== 'BUTTON') {
    e.preventDefault(); focusInput(); typeCharacter(e.key);
  }
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', focusInput);
});
window.addEventListener('resize', updateCarets);
document.fonts.ready.then(updateCarets);
window.addEventListener('pagehide', () => {
  if (session) api('leave', credentials(), true).catch(() => {});
});
async function init() {
  applySettings();
  $('profileButton').textContent = `name: ${nickname} ✎`;
  $('createRoom').disabled = true;
  try {
    const response = await fetch('./english.json');
    if (!response.ok) throw new Error('Could not load words.');
    dictionary = (await response.json()).words;
    $('createRoom').disabled = false;
    const code = new URL(location.href).searchParams.get('room');
    if (code) await enterRoom('join', {code});
  } catch (error) { toast(error.message); }
  requestAnimationFrame(frame);
  setInterval(sync, 220);
  setInterval(() => { if (state === 'racing') { updateStats(); lastPlayerSignature = ''; renderPlayers(); } }, 600);
  setInterval(refreshRooms, 3000);
}
init();
