import { floors, PALETTE, COLOR_OPTIONS, START_POOL } from './gameData.js';

export function genCode(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=chars[Math.floor(Math.random()*chars.length)]; return s; }

export function freshGuild(i){ return { name:'Guild '+String.fromCharCode(65+i), color:PALETTE[i], idx:0, progress:0, ap:2, mat:{}, gear:[], turnsOnFloor:1, eventCurse:false, hexCurse:false, claimedBy:null, isBot:false }; }

export function freshState(n){
  return {
    numPlayers: n,
    guilds: Array.from({length:n}, function(_,i){ return freshGuild(i); }),
    pools: floors.map(function(){ return START_POOL; }),
    current: 0,
    winner: null,
    started: false,
    turnCount: 1,
    lastHunt: null,
    log: [{t:'Room created. Waiting for guilds to join.', cls:''}],
    pendingTrade: null,
    clearedThrough: -1,
    outbreakFloor: 0,
    outbreakTimer: floors[0].need+2
  };
}

export function colorsForRoom(n, chosenIdx){
  const pool=COLOR_OPTIONS.map(function(o){return o.color;});
  const chosen=pool.splice(chosenIdx,1)[0];
  const ordered=[chosen].concat(pool);
  return ordered.slice(0,n);
}

// ---- cross-page persistence (localStorage) ----
// 'ascension_mode'        : 'local' | 'online'
// 'ascension_room'        : room code (online)
// 'ascension_slot_<code>' : claimed guild index in that room (online)
// 'ascension_local_state' : JSON game state (local vs AI)

export function getMode(){ return localStorage.getItem('ascension_mode'); }
export function setMode(m){ localStorage.setItem('ascension_mode', m); }

export function getRoomCode(){ return localStorage.getItem('ascension_room'); }
export function getRoomSlot(code){ const v=localStorage.getItem('ascension_slot_'+code); return v===null?null:parseInt(v,10); }
export function setRoom(code, slot){
  localStorage.setItem('ascension_room', code);
  localStorage.setItem('ascension_slot_'+code, String(slot));
}
export function clearRoom(){
  const code=getRoomCode();
  if(code) localStorage.removeItem('ascension_slot_'+code);
  localStorage.removeItem('ascension_room');
}

export function getLocalState(){
  const raw=localStorage.getItem('ascension_local_state');
  return raw?JSON.parse(raw):null;
}
export function saveLocalState(state){ localStorage.setItem('ascension_local_state', JSON.stringify(state)); }
export function clearLocalState(){ localStorage.removeItem('ascension_local_state'); }

export function clearSession(){ clearRoom(); clearLocalState(); localStorage.removeItem('ascension_mode'); }
