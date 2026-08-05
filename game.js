import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, onValue, off, set, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCETNzuvNn0-f5CsJhR_okTIgyJMC-dEPQ",
  authDomain: "ascension-e83bb.firebaseapp.com",
  databaseURL: "https://ascension-e83bb-default-rtdb.firebaseio.com",
  projectId: "ascension-e83bb",
  storageBucket: "ascension-e83bb.firebasestorage.app",
  messagingSenderId: "269995200895",
  appId: "1:269995200895:web:3780fadb27fb1810944a4a",
  measurementId: "G-94ER7T1W8W"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const floors=[
  {name:"Kasaka Fang", dr:6, need:2, toll:1},
  {name:"Golem Crystal", dr:7, need:3, toll:2},
  {name:"Orc Tusk", dr:8, need:4, toll:2},
  {name:"Oracle Wisp", dr:9, need:5, toll:3},
  {name:"Kaisel Scale", dr:10, need:6, toll:3},
  {name:"Sovereign's Ash", dr:11, need:7, toll:0}
];

// Rules of Play sections 9 and 14: leaving floors 3, 5 and 6 also costs a Floor Key.
// A Key is crafted and spent in the same instant, so it never occupies a mat slot.
// The last one reaches back to Floor 1 on purpose: the leader needs a trailing Guild's material.
const KEYS={
  2: {name:"Vanguard's Sigil", art:1, cost:{'Kasaka Fang':1,'Golem Crystal':1}},
  4: {name:'Kaisel Ward',      art:2, cost:{'Orc Tusk':1,'Oracle Wisp':1}},
  5: {name:"Sovereign's Bane", art:3, cost:{'Kaisel Scale':1,'Kasaka Fang':1}}
};
// section 11: 4 material slots and 2 item slots. section 8: 3 materials buy 1 of choice.
// section 17: 12 rounds, then the highest climber wins.
const CAP=4, CAMP_LIMIT=3, START_POOL=10, GEAR_SLOTS=2, TRANSMUTE_COST=3, ROUND_LIMIT=12;
// most Loot Cards are the floor's raw material, a few are Broken Gear (section 5)
const LOOT_DECK=['mat','mat','mat','mat','mat','mat','mat','mat','mat','mat','broken','broken'];
const PALETTE=['#4fd8ff','#a480ff','#e0b756','#ff8b7a'];
const FLOOR_TINT=['#4fd8ff','#5de0c8','#a480ff','#d97fe0','#e0b756','#ff8b7a'];
const FLOOR_RANK=['E','D','C','B','A','S'];
// floor 1-6 art: mon = Temple Serpant, crystal golem, Minotaur, Bone Oracle, Ash Drake, Tower Guardian.
// mat = snake's tooth, resonant crystal, cursed bone, ancient wood, dragon scale, astral core.
function art(kind, n){ return 'url(art/'+kind+'/'+n+'.png)'; }
const COLOR_OPTIONS=[
  {color:'#4fd8ff', name:'Azure'},
  {color:'#a480ff', name:'Amethyst'},
  {color:'#e0b756', name:'Amber'},
  {color:'#ff8b7a', name:'Ember'}
];
const GEAR={
  'Basic Bow':      { type:'weapon', line:'bow',   tier:1, cost:{'Kasaka Fang':2}, desc:'Reroll one die once, must accept the new sum.' },
  'Upgraded Bow':   { type:'weapon', line:'bow',   tier:2, cost:{'Golem Crystal':2}, requires:'Basic Bow', desc:'Reroll one die once, add the new value on top of the original total.' },
  'Basic Sword':    { type:'weapon', line:'sword', tier:1, cost:{'Golem Crystal':2}, desc:'+2 to the final roll total.' },
  'Upgraded Sword': { type:'weapon', line:'sword', tier:2, cost:{'Orc Tusk':3}, requires:'Basic Sword', desc:'+4 to the final roll total.' },
  'Shield':         { type:'accessory', cost:{'Kasaka Fang':2,'Golem Crystal':1}, desc:'Prevents Ascension Progress loss on a failed hunt.' },
  'Lucky Coin':     { type:'accessory', cost:{'Orc Tusk':2,'Oracle Wisp':1}, desc:'+1 extra loot on a successful hunt.' },
  'Compass':        { type:'accessory', cost:{'Kaisel Scale':1,'Orc Tusk':2}, desc:'+1 extra Ascension Progress on a successful hunt.' },
  // never crafted, only ever a lucky Loot Card draw (section 12)
  'Broken Gear':    { type:'broken', cost:{}, desc:'Single use: +2 to one hunt, then it breaks.' }
};
const GEAR_ICON={ 'Basic Bow':'\u{1F3F9}', 'Upgraded Bow':'\u{1F3F9}✨', 'Basic Sword':'⚔️', 'Upgraded Sword':'\u{1F5E1}️', 'Shield':'\u{1F6E1}️', 'Lucky Coin':'\u{1F340}', 'Compass':'\u{1F9ED}', 'Broken Gear':'\u{1FA93}' };
// a material is worth its floor, so the tiebreaker can price a mat at the end (section 17)
const MAT_VALUE={}; floors.forEach(function(f,i){ MAT_VALUE[f.name]=i+1; });
const EVENTS=[
  {label:'Windfall', apply:function(g,pools){const f=floors[g.idx]; if(pools[g.idx]>0&&addMat(g,f.name,1)){pools[g.idx]-=1; return g.name+' finds a Windfall cache: +1 '+f.name+'.';} return g.name+' finds a Windfall cache, but storage is full.';}},
  {label:'Ambush', apply:function(g){g.progress=Math.max(0,g.progress-1); return g.name+' is Ambushed by lesser beasts: -1 progress.';}},
  {label:'Guild rally', apply:function(g){g.ap+=1; return g.name+' hears a Guild Rally horn: +1 action point this turn.';}},
  {label:'Curse mist', apply:function(g){g.eventCurse=true; return 'Curse mist settles over '+g.name+': their next Hunt this turn auto-fails.';}},
  {label:'Old cache', apply:function(g){const prevIdx=Math.max(0,g.idx-1); const pn=floors[prevIdx].name; if(addMat(g,pn,1)) return g.name+' unearths an Old Cache: +1 '+pn+'.'; return g.name+' finds an Old Cache, but storage is full.';}},
  {label:'Quiet floor', apply:function(){ return 'The floor is quiet. Nothing happens.';}}
];

// ---- sound: short synthesised cues, no audio files and no library ----
let actx=null, muted=localStorage.getItem('ascension_muted')==='1';
function tone(freq, dur, type, vol, delay){
  if(!actx || muted) return;
  const t=actx.currentTime+(delay||0);
  const o=actx.createOscillator(), g=actx.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(vol,t+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t+dur+0.02);
}
const SFX={
  roll: function(){ for(let i=0;i<5;i++) tone(210+Math.random()*280,0.05,'square',0.05,i*0.07); },
  success: function(){ tone(523,0.12,'triangle',0.16); tone(784,0.22,'triangle',0.13,0.10); },
  crit: function(){ [523,784,1047].forEach(function(f,i){ tone(f,i===2?0.3:0.1,'triangle',0.15,i*0.09); }); },
  fail: function(){ tone(196,0.22,'sawtooth',0.10); tone(147,0.30,'sawtooth',0.08,0.06); },
  climb: function(){ [392,523,659,880].forEach(function(f,i){ tone(f,0.22,'triangle',0.13,i*0.08); }); },
  gain: function(){ tone(880,0.07,'sine',0.11); tone(1175,0.10,'sine',0.09,0.06); },
  outbreak: function(){ tone(110,0.5,'sawtooth',0.13); tone(104,0.6,'sawtooth',0.11,0.12); }
};
// browsers refuse to play audio until the user has interacted with the page
document.addEventListener('pointerdown', function(){
  if(!actx) actx=new (window.AudioContext||window.webkitAudioContext)();
  if(actx.state==='suspended') actx.resume();
});
document.getElementById('btnSound').onclick=function(){
  muted=!muted;
  localStorage.setItem('ascension_muted', muted?'1':'0');
  this.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
};
document.getElementById('btnSound').textContent = muted ? '\u{1F507}' : '\u{1F50A}';

let deviceId = localStorage.getItem('ascension_device_id');
if(!deviceId){ deviceId='d'+Math.random().toString(36).slice(2,10); localStorage.setItem('ascension_device_id', deviceId); }

let roomCode=null, myGuildIndex=null, state=null, LOCAL_MODE=false;
let botStepScheduled=false, botTradeScheduled=false;
function roomRef(){ return ref(db, 'rooms/'+roomCode); }

function screens(){ return ['screenHome','screenCreate','screenIdentity','screenJoin','screenSlots','screenLobby']; }
function showScreen(id){ screens().forEach(function(s){ document.getElementById(s).style.display = (s===id)?(s==='screenHome'?'block':'block'):'none'; }); document.getElementById('game').style.display='none'; document.body.classList.remove('in-game'); }
function showGame(){ screens().forEach(function(s){ document.getElementById(s).style.display='none'; }); document.getElementById('game').style.display='flex'; document.body.classList.add('in-game'); }

// ---- home mode toggle ----
document.getElementById('modeLocalBtn').onclick=function(){
  document.getElementById('modeLocalBtn').classList.add('sel');
  document.getElementById('modeOnlineBtn').classList.remove('sel');
  document.getElementById('homeLocalPanel').style.display='block';
  document.getElementById('homeOnlinePanel').style.display='none';
};
document.getElementById('modeOnlineBtn').onclick=function(){
  document.getElementById('modeOnlineBtn').classList.add('sel');
  document.getElementById('modeLocalBtn').classList.remove('sel');
  document.getElementById('homeOnlinePanel').style.display='block';
  document.getElementById('homeLocalPanel').style.display='none';
};

function openHowTo(){ document.getElementById('howToOverlay').classList.add('show'); }
function closeHowTo(){ document.getElementById('howToOverlay').classList.remove('show'); }
document.getElementById('btnHowToHome').onclick=openHowTo;
document.getElementById('btnHowToGame').onclick=openHowTo;
document.getElementById('btnCloseHowTo').onclick=closeHowTo;
document.getElementById('howToOverlay').onclick=function(e){ if(e.target.id==='howToOverlay') closeHowTo(); };

document.getElementById('btnGoCreate').onclick=function(){ showScreen('screenCreate'); };
document.getElementById('btnBackFromCreate').onclick=function(){ showScreen('screenHome'); };
document.getElementById('btnGoJoin').onclick=function(){ showScreen('screenJoin'); };
document.getElementById('btnBackFromJoin').onclick=function(){ showScreen('screenHome'); };
document.getElementById('btnBackFromSlots').onclick=function(){ showScreen('screenJoin'); };

// ---- identity (name + color) step, shared by local and online-create flows ----
let pendingFlow=null; // 'local' or 'online'
let identityColorIdx=0;
const colorGrid=document.getElementById('colorGrid');
COLOR_OPTIONS.forEach(function(opt,i){
  const b=document.createElement('div');
  b.className='colorOpt'+(i===0?' sel':'');
  b.style.color=opt.color;
  b.innerHTML='<span class="ic art" style="--art:'+art('guild',i+1)+'"></span><span class="nm">'+opt.name+'</span>';
  b.onclick=function(){
    identityColorIdx=i;
    Array.from(colorGrid.children).forEach(function(c){c.classList.remove('sel');});
    b.classList.add('sel');
  };
  colorGrid.appendChild(b);
});
function openIdentity(flow){
  pendingFlow=flow;
  document.getElementById('identityName').value='';
  document.getElementById('identityErr').textContent='';
  identityColorIdx=0;
  Array.from(colorGrid.children).forEach(function(c,i){c.classList.toggle('sel', i===0);});
  showScreen('screenIdentity');
}
document.getElementById('btnLocalNext').onclick=function(){ openIdentity('local'); };
document.getElementById('btnCreateNext').onclick=function(){ openIdentity('online'); };
document.getElementById('btnBackFromIdentity').onclick=function(){ showScreen(pendingFlow==='local' ? 'screenHome' : 'screenCreate'); };

function colorsForRoom(n, chosenIdx){
  const pool=COLOR_OPTIONS.map(function(o){return o.color;});
  const chosen=pool.splice(chosenIdx,1)[0];
  const ordered=[chosen].concat(pool);
  return ordered.slice(0,n);
}

document.getElementById('btnIdentityGo').onclick=async function(){
  const name=document.getElementById('identityName').value.trim();
  const errEl=document.getElementById('identityErr');
  if(!name){ errEl.textContent='Give your guild a name.'; return; }
  errEl.textContent='';
  const chosenColor=COLOR_OPTIONS[identityColorIdx].color;

  if(pendingFlow==='local'){
    LOCAL_MODE=true; roomCode=null; myGuildIndex=0;
    state=freshState(localN);
    const colors=colorsForRoom(localN, identityColorIdx);
    state.guilds.forEach(function(g,i){ g.color=colors[i]; });
    state.guilds[0].name=name;
    state.guilds[0].claimedBy='local';
    for(let i=1;i<localN;i++){ state.guilds[i].isBot=true; state.guilds[i].claimedBy='bot'; }
    state.started=true;
    state.log=[{t:'Practice game started.', cls:''}];
    rollForFirstPlayer(state);
    document.getElementById('roomTag').textContent='Local practice game';
    showGame();
    render();
    return;
  }

  const btn=document.getElementById('btnIdentityGo');
  btn.disabled=true; btn.textContent='Creating...';
  try{
    LOCAL_MODE=false;
    roomCode=genCode();
    const s=freshState(createN);
    const colors=colorsForRoom(createN, identityColorIdx);
    s.guilds.forEach(function(g,i){ g.color=colors[i]; });
    s.guilds[0].name=name;
    s.guilds[0].claimedBy=deviceId;
    await set(roomRef(), s);
    myGuildIndex=0;
    localStorage.setItem('ascension_room', roomCode);
    localStorage.setItem('ascension_slot_'+roomCode, '0');
    attachListener();
  } catch(e){
    console.error(e);
    errEl.textContent = 'Could not create room: ' + (e && e.message ? e.message : e) + '. Check that Realtime Database (not Firestore) is created in the Firebase console, and that its rules allow read/write.';
    showScreen('screenIdentity');
  } finally {
    btn.disabled=false; btn.textContent='Next';
  }
};

let createN=2;
const countRow=document.getElementById('countRow');
[2,3,4].forEach(function(n){
  const b=document.createElement('button');
  b.className='count-btn'+(n===2?' sel':'');
  b.textContent=n;
  b.onclick=function(){ createN=n; Array.from(countRow.children).forEach(function(c){c.classList.remove('sel');}); b.classList.add('sel'); };
  countRow.appendChild(b);
});

let localN=2;
const localCountRow=document.getElementById('localCountRow');
[2,3,4].forEach(function(n){
  const b=document.createElement('button');
  b.className='count-btn'+(n===2?' sel':'');
  b.textContent=n;
  b.onclick=function(){ localN=n; Array.from(localCountRow.children).forEach(function(c){c.classList.remove('sel');}); b.classList.add('sel'); };
  localCountRow.appendChild(b);
});

function genCode(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=chars[Math.floor(Math.random()*chars.length)]; return s; }
function freshGuild(i){ return { name:'Guild '+String.fromCharCode(65+i), color:PALETTE[i], idx:0, progress:0, ap:2, mat:{}, gear:[], turnsOnFloor:1, eventCurse:false, hexCurse:false, claimedBy:null, isBot:false }; }
function freshState(n){
  return {
    numPlayers: n,
    guilds: Array.from({length:n}, function(_,i){ return freshGuild(i); }),
    pools: floors.map(function(){ return START_POOL; }),
    current: 0,
    roundStart: 0,
    turnsThisRound: 0,
    round: 1,
    loot: null,
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

document.getElementById('btnFindRoom').onclick=async function(){
  const code=document.getElementById('joinCodeInput').value.trim().toUpperCase();
  const errEl=document.getElementById('joinErr');
  errEl.textContent='';
  if(code.length!==4){ errEl.textContent='Enter the 4-letter code.'; return; }
  try{
    const snap=await get(ref(db,'rooms/'+code));
    if(!snap.exists()){ errEl.textContent='No room found with that code.'; return; }
    LOCAL_MODE=false;
    roomCode=code;
    renderSlotPicker(snap.val());
    showScreen('screenSlots');
  } catch(e){
    console.error(e);
    errEl.textContent = 'Could not reach the room: ' + (e && e.message ? e.message : e) + '. Check that Realtime Database is created and its rules allow read/write.';
  }
};

function renderSlotPicker(s){
  const row=document.getElementById('slotRow');
  row.innerHTML='';
  s.guilds.forEach(function(g,i){
    const b=document.createElement('button');
    b.className='slotBtn';
    const taken = !!g.claimedBy;
    b.innerHTML='<span><span class="dotc" style="background:'+g.color+'"></span>'+g.name+'</span><span class="tag'+(g.isBot?' bot':'')+'">'+(g.isBot?'AI':(taken?'taken':'open'))+'</span>';
    if(taken) b.disabled=true;
    b.onclick=async function(){
      const fresh=await get(roomRef());
      const fs=fresh.val();
      if(fs.guilds[i].claimedBy){ renderSlotPicker(fs); return; }
      const nm=prompt('Name your guild:', fs.guilds[i].name);
      if(nm===null) return;
      if(nm.trim()) fs.guilds[i].name=nm.trim().slice(0,18);
      fs.guilds[i].claimedBy=deviceId;
      await set(roomRef(), fs);
      myGuildIndex=i;
      localStorage.setItem('ascension_room', roomCode);
      localStorage.setItem('ascension_slot_'+roomCode, String(i));
      attachListener();
    };
    row.appendChild(b);
  });
}

function attachListener(){
  onValue(roomRef(), function(snap){
    state=snap.val();
    if(!state) return;
    if(!state.started){ renderLobby(); showScreen('screenLobby'); }
    else { document.getElementById('roomTag').innerHTML='Room <b>'+roomCode+'</b>'; showGame(); render(); }
  });
}

function renderLobby(){
  document.getElementById('lobbyCode').textContent=roomCode;
  const row=document.getElementById('lobbySlots');
  row.innerHTML=state.guilds.map(function(g,i){
    const you = g.claimedBy===deviceId;
    const tag = g.isBot ? 'AI' : (g.claimedBy?'ready':'waiting');
    return '<div class="slotBtn"><span><span class="dotc" style="background:'+g.color+'"></span>'+g.name+(you?' (you)':'')+'</span><span class="tag'+(g.isBot?' bot':'')+'">'+tag+'</span></div>';
  }).join('');
  const claimedCount=state.guilds.filter(function(g){return !!g.claimedBy;}).length;
  const openSlot=state.guilds.some(function(g){return !g.claimedBy;});
  document.getElementById('btnAddBot').disabled=!openSlot;
  document.getElementById('lobbyHint').textContent = claimedCount<2 ? 'Need at least 2 guilds claimed (human or AI) to start.' : (claimedCount+' of '+state.guilds.length+' guilds ready. Anyone can start.');
  document.getElementById('btnStartGame').disabled = claimedCount<2;
}
document.getElementById('btnStartGame').onclick=async function(){
  const s=(await get(roomRef())).val();
  s.started=true;
  rollForFirstPlayer(s);
  await set(roomRef(), s);
};
document.getElementById('btnAddBot').onclick=async function(){
  const s=(await get(roomRef())).val();
  const idx=s.guilds.findIndex(function(g){return !g.claimedBy;});
  if(idx===-1) return;
  s.guilds[idx].isBot=true;
  s.guilds[idx].claimedBy='bot';
  s.log.unshift({t:s.guilds[idx].name+' is now controlled by AI.', cls:''});
  await set(roomRef(), s);
  renderLobby();
};

// ---- leave / back ----
function clearLocalStorageRoom(){
  if(roomCode){ localStorage.removeItem('ascension_slot_'+roomCode); }
  localStorage.removeItem('ascension_room');
}
function leaveOnline(){
  if(roomCode){ try{ off(roomRef()); }catch(e){} }
  clearLocalStorageRoom();
  roomCode=null; myGuildIndex=null; state=null;
  showScreen('screenHome');
}
function leaveGame(){
  if(LOCAL_MODE){ LOCAL_MODE=false; state=null; showScreen('screenHome'); }
  else { leaveOnline(); }
}
document.getElementById('btnLeaveLobby').onclick=leaveOnline;
document.getElementById('btnLeaveGame').onclick=function(){
  if(confirm('Leave this game and return to the home screen?')) leaveGame();
};

// ---- auto-rejoin ----
(function tryAutoRejoin(){
  const savedRoom=localStorage.getItem('ascension_room');
  const savedSlot=localStorage.getItem('ascension_slot_'+savedRoom);
  if(savedRoom && savedSlot!==null){
    get(ref(db,'rooms/'+savedRoom)).then(function(snap){
      if(snap.exists()){
        LOCAL_MODE=false;
        roomCode=savedRoom; myGuildIndex=parseInt(savedSlot,10);
        attachListener();
      } else { showScreen('screenHome'); }
    }).catch(function(){ showScreen('screenHome'); });
  } else { showScreen('screenHome'); }
})();

// ---- game helpers ----
function me(){ return state.guilds[state.current]; }
function isMyTurn(){ return myGuildIndex===state.current; }
function others(){ return state.guilds.map(function(g,i){return {g:g,i:i};}).filter(function(o){ return o.i!==state.current; }); }
function trailing(){ const min=Math.min.apply(null, state.guilds.map(function(g){return g.idx;})); return me().idx===min && state.guilds.some(function(g){return g.idx>min;}); }
function addLog(t, cls){ state.log = state.log||[]; state.log.unshift({t:t, cls:cls||''}); if(state.log.length>7) state.log=state.log.slice(0,7); }
function canAdd(g,name){ const mat=g.mat||{}; return mat.hasOwnProperty(name) || Object.keys(mat).length<CAP; }
function addMat(g,name,qty){ if(!canAdd(g,name)) return false; g.mat=g.mat||{}; g.mat[name]=(g.mat[name]||0)+qty; return true; }
function stockKeys(g){ const mat=g.mat||{}; return Object.keys(mat).filter(function(k){return mat[k]>0;}); }
function matTotal(g){ let t=0; for(const k in (g.mat||{})) t+=g.mat[k]; return t; }
function returnMat(name,qty){
  const fi=floors.findIndex(function(fl){ return fl.name===name; });
  if(fi<0) return;
  const room=START_POOL-state.pools[fi];
  state.pools[fi]+=Math.max(0,Math.min(qty,room));   // pool never exceeds START_POOL
}

// section 3: each Guild rolls, the highest total goes first
function rollForFirstPlayer(s){
  let best=-1, first=0;
  const rolls=s.guilds.map(function(g,i){
    const r=2+Math.floor(Math.random()*6)+Math.floor(Math.random()*6);
    if(r>best){ best=r; first=i; }
    return g.name+' '+r;
  });
  s.current=first; s.roundStart=first; s.turnsThisRound=0; s.round=1;
  s.log.unshift({t:'Seating roll: '+rolls.join(', ')+'. '+s.guilds[first].name+' goes first.', cls:''});
}

// section 9: leaving floors 3, 5 and 6 also costs a Floor Key, crafted and spent on the spot
function keyFor(idx){ return KEYS[idx]||null; }
function canPayKey(g,idx){
  const k=keyFor(idx);
  return !k || Object.keys(k.cost).every(function(m){ return (g.mat[m]||0)>=k.cost[m]; });
}
function canAscend(g){
  const f=floors[g.idx];
  return g.progress>=f.need && (g.mat[f.name]||0)>=f.toll && canPayKey(g,g.idx);
}
// section 17 leaves the tiebreak open, so: a material is worth its floor, gear is worth what it cost
function guildValue(g){
  let v=0;
  for(const k in (g.mat||{})) v+=(MAT_VALUE[k]||0)*g.mat[k];
  (g.gear||[]).forEach(function(name){
    const cost=(GEAR[name]||{}).cost||{};
    for(const k in cost) v+=(MAT_VALUE[k]||0)*cost[k];
  });
  return v;
}
function steal(from,to){ const keys=stockKeys(from); if(!keys.length) return null; const p=keys[Math.floor(Math.random()*keys.length)]; from.mat[p]-=1; if(from.mat[p]===0) delete from.mat[p]; return addMat(to,p,1)?p:null; }
async function pushState(){ await set(roomRef(), state); }

async function withState(fn){
  if(LOCAL_MODE){
    fn();
    render();
    return;
  }
  const fresh=(await get(roomRef())).val();
  state=fresh;
  fn();
  await pushState();
}

function render(){
  if(!state) return;
  const pool=state.pools[me().idx];
  const f=floors[me().idx];

  const arena=document.getElementById('arena');
  (function(){
    const active=me();
    const activeIdx=state.current;
    const activeGf=floors[active.idx];
    const keys=stockKeys(active);
    const activeYou = active.claimedBy===deviceId || (LOCAL_MODE && activeIdx===0);
    const gameWon = state.winner!==null && state.winner!==undefined;
    const placematShowing = isMyTurn() && !active.isBot && !gameWon;
    const fullPanel = '<div class="guildPanel glass" style="border-left-color:'+active.color+(gameWon?'':';box-shadow:0 0 16px '+active.color+'44')+';">'+
      '<h3><span class="dot" style="width:8px;height:8px;border-radius:50%;background:'+active.color+';box-shadow:0 0 6px '+active.color+';display:inline-block;"></span>'+active.name+(gameWon?'':' <span style="color:'+active.color+';font-size:10.5px;">&middot; turn</span>')+(activeYou?' <span class="youTag">you</span>':'')+(active.isBot?' <span class="botTag">AI</span>':'')+(active.hexCurse?' <span class="curseTag">cursed</span>':'')+'</h3>'+
      '<div class="miniStats">'+
        '<div class="miniStat"><div class="l">Floor</div><div class="v">'+(active.idx+1)+'</div></div>'+
        '<div class="miniStat"><div class="l">Progress</div><div class="v">'+active.progress+' / '+activeGf.need+'</div></div>'+
        '<div class="miniStat"><div class="l">AP</div><div class="v">'+active.ap+'</div></div>'+
        '<div class="miniStat"><div class="l">Turns on floor</div><div class="v">'+active.turnsOnFloor+'</div></div>'+
      '</div>'+
      (placematShowing ? '' :
        '<p class="line"><b style="color:var(--text-hi)">Materials:</b> '+(keys.length?keys.map(function(k){return k+' x'+active.mat[k];}).join(', '):'empty')+'</p>'+
        '<p class="line"><b style="color:var(--text-hi)">Gear:</b> '+((active.gear||[]).length?active.gear.join(', '):'none')+'</p>')+
    '</div>';

    const rivalChips = others().map(function(o){
      const g=o.g;
      const you = g.claimedBy===deviceId || (LOCAL_MODE && o.i===0);
      return '<div class="rivalChip" style="border-color:'+g.color+'66;">'+
        '<span class="dot" style="background:'+g.color+';box-shadow:0 0 6px '+g.color+';"></span>'+
        '<span class="rname">'+g.name+'</span>'+
        '<span class="rap">AP '+g.ap+'</span>'+
        (you?' <span class="youTag">you</span>':'')+(g.isBot?' <span class="botTag">AI</span>':'')+(g.hexCurse?' <span class="curseTag">cursed</span>':'')+
      '</div>';
    }).join('');

    arena.innerHTML = fullPanel + (rivalChips ? '<div class="rivalRow">'+rivalChips+'</div>' : '');
  })();

  const won = state.winner!==null && state.winner!==undefined;
  document.getElementById('turnBanner').innerHTML = won
    ? '<span>Game over</span><span class="hint"></span>'
    : '<span><span class="dot" style="background:'+me().color+';color:'+me().color+'"></span>'+me().name+(me().isBot?' — AI thinking':(isMyTurn()?" — your turn":" — waiting"))+'</span><span class="hint">Turn '+(state.turnCount||1)+' &middot; '+me().ap+' action points &middot; floor '+(me().idx+1)+'</span>';

  if(won){
    document.getElementById('winBanner').style.display='block';
    document.getElementById('winBanner').textContent=state.guilds[state.winner].name+' defeated the Sovereign and wins the game.';
  } else {
    document.getElementById('winBanner').style.display='none';
  }

  const canAct = isMyTurn() && !won && !me().isBot;
  const g0=me(), hasAP = canAct && g0.ap>0;
  const dis={
    btnHunt: !hasAP,
    btnTrain: !hasAP || (g0.mat[f.name]||0)<2,
    btnRaid: !hasAP,
    btnSabotageToggle: !hasAP || !stockKeys(g0).length,
    btnTradeToggle: !canAct || !stockKeys(g0).length,
    btnBlacksmithToggle: !canAct,
    btnTransmute: !canAct || matTotal(g0)<TRANSMUTE_COST,
    btnAscend: !canAct || !canAscend(g0),
    btnScavenge: !canAct || g0.scavenged || canDoAnything(g0)
  };
  Object.keys(dis).forEach(function(id){ document.getElementById(id).disabled = dis[id]; });
  document.getElementById('btnEndTurn').disabled = !canAct;

  document.getElementById('log').innerHTML = (state.log||[]).map(function(l){return '<div class="'+(l.cls||'')+'">'+l.t+'</div>';}).join('');

  document.getElementById('headerAvatars').innerHTML = state.guilds.map(function(g,i){
    return '<div class="avatarChip art ink'+(i===state.current&&!won?' turn':'')+'" style="background:'+g.color+'; --art:'+art('guild',i+1)+'" title="'+g.name+'"></div>';
  }).join('');

  document.getElementById('huntSub').textContent = '1 AP, 2d6 vs DR'+f.dr;
  document.getElementById('trainSub').textContent = '1 AP, 2 '+f.name;
  document.getElementById('transmuteSub').textContent = TRANSMUTE_COST+' materials for 1 of choice';
  const key=keyFor(me().idx);
  document.getElementById('ascendSub').textContent =
    (f.toll>0 ? 'pay '+f.toll+' '+f.name : 'defeat the Sovereign') + (key ? ' + '+key.name+' ('+keyCostText(me().idx)+')' : '');

  renderPlacemat();
  renderOutbreakBadge();
  refreshTargetSelects();
  renderTradeOffer();
  renderTower();
  renderDice();
  maybeBotContinue();
}

function renderOutbreakBadge(){
  const el=document.getElementById('outbreakBadge');
  if(!el) return;
  if(state.outbreakFloor===undefined || state.outbreakFloor===null){ el.innerHTML=''; return; }
  const fl=floors[state.outbreakFloor];
  const t=state.outbreakTimer;
  el.classList.toggle('warn', t<=2);
  el.innerHTML =
    '<div class="obLabel">Outbreak Timer<b>Floor '+(state.outbreakFloor+1)+', '+fl.name+'</b></div>'+
    '<div class="obCount">'+Math.max(0,t)+'</div>';
}

const prevMats={};
let prevGear=[];

function renderPlacemat(){
  const wrap=document.getElementById('myPlacemat');
  const show = isMyTurn() && !me().isBot && (state.winner===null || state.winner===undefined);
  wrap.classList.toggle('show', show);
  if(!show) return;
  const g=me();
  const keys=stockKeys(g);
  const gear=g.gear||[];

  const matChips=keys.map(function(k){
    const fi=floors.findIndex(function(fl){return fl.name===k;});
    const ic=fi>=0
      ? '<span class="ic art" style="--art:'+art('mat',fi+1)+'; --tint:'+FLOOR_TINT[fi]+'"></span>'
      : '<span class="ic">&#x1F4E6;</span>';
    const fresh=(g.mat[k]||0)>(prevMats[k]||0);   // a token you just gained drops in
    return '<div class="matChip'+(fresh?' fresh':'')+'">'+ic+'<span>'+k+'</span><span class="qty">x'+g.mat[k]+'</span></div>';
  });
  Object.keys(prevMats).forEach(function(k){ delete prevMats[k]; });
  keys.forEach(function(k){ prevMats[k]=g.mat[k]; });

  const gearChips=gear.map(function(name){
    const ic=GEAR_ICON[name]||'&#x1F392;';
    const fresh=prevGear.indexOf(name)<0;
    return '<div class="matChip gear'+(fresh?' fresh':'')+'"><span class="ic">'+ic+'</span><span>'+name+'</span></div>';
  });
  prevGear=gear.slice();
  if(matChips.concat(gearChips).some(function(c){ return c.indexOf('fresh')>=0; })) SFX.gain();

  function pad(chips, slots){
    const out=chips.slice();
    while(out.length<slots) out.push('<div class="slotEmpty">empty</div>');
    return out.join('');
  }
  document.getElementById('pmMatLabel').innerHTML='Materials &middot; '+keys.length+'/'+CAP+' kinds';
  document.getElementById('pmGearLabel').innerHTML='Gear &middot; '+gear.length+'/'+GEAR_SLOTS;
  document.getElementById('placematMats').innerHTML = pad(matChips, CAP);
  document.getElementById('placematGear').innerHTML = pad(gearChips, GEAR_SLOTS);
}

const pawnAt={};
const PLAT_TILT=50;

function movePawns(){
  document.querySelectorAll('#towerList .stand').forEach(function(st){
    const gi=parseInt(st.dataset.g,10);
    const cell=st.parentElement;
    const key=state.guilds[gi].idx+':'+cell.dataset.s;
    const was=pawnAt[gi];
    pawnAt[gi]=key;
    if(was===undefined || was===key) return;
    if(was.split(':')[0]!==String(state.guilds[gi].idx)){ st.classList.add('arriving'); return; }
    const prev=cell.parentElement.querySelector('.step[data-s="'+was.split(':')[1]+'"]');
    if(!prev) return;
    const dx=prev.offsetLeft-cell.offsetLeft;
    st.animate([
      {transform:'rotateX(-'+PLAT_TILT+'deg) translateX('+dx+'px)'},
      {transform:'rotateX(-'+PLAT_TILT+'deg) translateX('+(dx/2)+'px) translateY(-14px)', offset:0.5},
      {transform:'rotateX(-'+PLAT_TILT+'deg) translateX(0)'}
    ], {duration:460, easing:'cubic-bezier(0.3,1,0.4,1)'});
  });
}

function renderTower(){
  const list=document.getElementById('towerList');
  const cam=me().idx;
  const rows=[];
  for(let i=0;i<floors.length;i++){
    const fl=floors[i];
    const here=state.guilds.filter(function(g){return g.idx===i;});
    const hereNow=here.some(function(g){return state.guilds.indexOf(g)===state.current;});

    let track='';
    for(let s=0;s<=fl.need;s++){
      const onStep=here.filter(function(g){ return Math.min(g.progress, fl.need)===s; });
      track+='<span class="step'+(s===fl.need?' last':'')+'" data-s="'+s+'">'+onStep.map(function(g){
        const gi=state.guilds.indexOf(g);
        return '<span class="stand" data-g="'+gi+'"><span class="pawn'+(gi===state.current?' turnNow':'')+'" style="color:'+g.color+'" title="'+g.name+', '+g.progress+'/'+fl.need+' progress"></span></span>';
      }).join('')+'</span>';
    }
    const gk=KEYS[i];
    const gic=gk
      ? '<span class="gic art" style="--art:'+art('key',gk.art)+'"></span>'
      : '<span class="gic">&#x26E9;&#xFE0F;</span>';
    track += fl.toll>0
      ? '<span class="gate" title="Pay '+fl.toll+' '+fl.name+(gk?' and the '+gk.name:'')+' to climb">'+gic+'toll '+fl.toll+'</span>'
      : '<span class="gate boss" title="Defeat the Sovereign to win">'+gic+'boss</span>';

    const poolLeft=state.pools[i];
    let poolPips='';
    for(let p=0;p<START_POOL;p++){
      poolPips+='<span class="pip'+(p<poolLeft?' filled':'')+'"></span>';
    }

    rows.push(
      '<div class="plat'+(hereNow?' hereNow':'')+(i<cam?' past':'')+(i===floors.length-1?' top':'')+'" style="--i:'+i+'; --tint:'+FLOOR_TINT[i]+'; --mon:'+art('mon',i+1)+';">'+
        '<div class="frHead">'+
          '<span class="frNum">'+(i+1)+'</span>'+
          '<span class="frIcon art" title="'+fl.name+'"></span>'+
          '<span class="frName">'+fl.name+'</span>'+
          '<span class="frDR">'+FLOOR_RANK[i]+'-rank &middot; DR '+fl.dr+'+</span>'+
        '</div>'+
        '<div class="track">'+track+'</div>'+
        '<div class="frFoot">'+
          '<span class="frToll">pool</span>'+
          '<span class="pips">'+poolPips+'</span>'+
          '<span class="poolLabel">'+poolLeft+'/'+START_POOL+'</span>'+
        '</div>'+
      '</div>'
    );
  }
  list.innerHTML=rows.join('');
  list.style.transform='rotateX('+PLAT_TILT+'deg) translate3d(0,'+(cam*182)+'px,'+(-cam*20)+'px)';
  movePawns();
}

function popAnimate(el){
  if(!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

const PIP_MAP={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function pipCells(n){
  const on=PIP_MAP[n]||[];
  let cells='';
  for(let i=0;i<9;i++) cells+='<i'+(on.indexOf(i)>=0?' class="on"':'')+'></i>';
  return cells;
}
function diceFace(n, cls, id){
  return '<div class="diceCube'+(cls?' '+cls:'')+'"'+(id?' id="'+id+'"':'')+' title="'+n+'">'+pipCells(n)+'</div>';
}
function setFace(el,n){ el.innerHTML=pipCells(n); el.title=n; }

let lastRollKey=null;
let lastRollKeyForSfx=null;
let lastRollTime = 0;
function throwDie(el, finalN){
  if(!el) return;
  el.classList.remove('rolling'); void el.offsetWidth; el.classList.add('rolling');
  let ticks=0;
  const iv=setInterval(function(){
    setFace(el, 1+Math.floor(Math.random()*6));
    if(++ticks>=6){ clearInterval(iv); setFace(el, finalN); }
  }, 65);
}

function lootCard(loot){
  if(!loot) return '';
  const face = loot.kind==='mat'
    ? '<span class="lootArt art" style="--art:'+art('mat',loot.floor+1)+'"></span>'
    : '<span class="lootArt broken">&#x1FA93;</span>';
  const tint = loot.kind==='mat' ? FLOOR_TINT[loot.floor] : 'var(--coral)';
  return '<div class="lootCard" style="--tint:'+tint+'"><span class="lootTag">Loot</span>'+face+'<span class="lootName">'+loot.name+'</span></div>';
}

function renderDice(){
  const box=document.getElementById('diceReveal');
  const h=state.lastHunt;
  if(!h){
    box.innerHTML =
      '<p style="font-size:11.5px;color:var(--text-mid);margin:0 0 4px;">'+me().name+' ready to hunt</p>'+
      '<div class="diceRow">'+diceFace(1,'idle')+'<span class="plus">+</span>'+diceFace(1,'idle')+'</div>'+
      '<p style="font-size:12px;color:var(--text-dim);">Hunt to roll against DR '+floors[me().idx].dr+'</p>'+
      '<p class="resultLine" style="visibility:hidden;">placeholder</p>';
    return;
  }
  const resultCls = h.snake ? 'fail' : h.crit ? 'crit' : h.success ? 'success' : 'fail';
  const resultText = h.snake ? (h.shielded ? (h.guildName+"'s Shield absorbs the natural 2.") : (h.guildName+' loses 1 banked progress.'))
    : h.crit ? 'Critical hunt! +2 progress, action point refunded.'
    : h.success ? 'Success! +1 progress.'
    : 'Failed.';
  
  const key = (h.seq!==undefined ? h.seq : (h.guildName+'|'+h.d1+'|'+h.d2+'|'+h.total));
  if(key!==lastRollKey){
    lastRollKey=key;
    lastRollTime=Date.now();
  }

  const elasped=Date.now()-lastRollTime;
  const showLoot=h.loot && elasped<2000;

  box.innerHTML =
    '<p style="font-size:11.5px;color:var(--text-mid);margin:0 0 4px;">'+h.guildName+' hunts '+h.matName+'</p>'+
    '<div class="diceRow">'+diceFace(h.d1,'','dc1')+'<span class="plus">+</span>'+diceFace(h.d2,'','dc2')+'</div>'+
    (h.snake ? '<p style="font-size:12px;color:var(--text-dim);">snake eyes</p>' : '<p style="font-size:12px;color:var(--text-dim);">total '+h.total+' vs DR '+h.dr+'</p>')+
    '<p class="resultLine '+resultCls+'">'+resultText+'</p>'+
    (showLoot ? lootCard(h.loot) : '');
  
  if(key!==lastRollKeyForSfx){
    lastRollKeyForSfx=key;
    throwDie(document.getElementById('dc1'), h.d1);
    throwDie(document.getElementById('dc2'), h.d2);
    SFX.roll();
    setTimeout(function(){ (h.crit ? SFX.crit : h.success ? SFX.success : SFX.fail)(); }, 460);
    if(h.loot){
      setTimeout(function(){ if(lastRollKey===key) renderDice(); }, 2000);
    }
  }
}

function refreshTargetSelects(){
  const opts = others().map(function(o){ return '<option value="'+o.i+'">'+o.g.name+'</option>'; }).join('');
  ['tradeTarget','sabTarget'].forEach(function(id){
    const sel=document.getElementById(id);
    const prev=sel.value;
    sel.innerHTML=opts;
    if(prev) sel.value=prev;
  });
  const allMats=floors.map(function(f){return f.name;});
  const giveMat=document.getElementById('tradeGiveMat');
  giveMat.innerHTML = stockKeys(me()).map(function(k){return '<option value="'+k+'">'+k+'</option>';}).join('') || '<option value="">none</option>';
  const giveQty=document.getElementById('tradeGiveQty');
  const maxGive = (me().mat||{})[giveMat.value] || 0;
  giveQty.innerHTML = Array.from({length: Math.max(1,maxGive)}, function(_,i){return i+1;}).map(function(n){return '<option value="'+n+'">'+n+'</option>';}).join('');
  const wantMat=document.getElementById('tradeWantMat');
  wantMat.innerHTML = allMats.map(function(m){return '<option value="'+m+'">'+m+'</option>';}).join('');
  const wantQty=document.getElementById('tradeWantQty');
  wantQty.innerHTML = [1,2,3].map(function(n){return '<option value="'+n+'">'+n+'</option>';}).join('');
  const tTarget=document.getElementById('transmuteTarget');
  const tPrev=tTarget.value;
  tTarget.innerHTML = allMats.map(function(m){return '<option value="'+m+'">'+m+'</option>';}).join('');
  if(tPrev) tTarget.value=tPrev;
  const sabMat=document.getElementById('sabMat');
  sabMat.innerHTML = stockKeys(me()).map(function(k){return '<option value="'+k+'">'+k+'</option>';}).join('') || '<option value="">none</option>';
}
document.getElementById('tradeGiveMat').onchange=refreshTargetSelects;

function renderTradeOffer(){
  const banner=document.getElementById('tradeOfferBanner');
  const pt=state.pendingTrade;
  if(pt && pt.to===myGuildIndex && !state.guilds[pt.to].isBot){
    const from=state.guilds[pt.from];
    banner.classList.add('show');
    banner.innerHTML = '<b>'+from.name+'</b> offers you '+pt.giveQty+' '+pt.giveMat+' for your '+pt.wantQty+' '+pt.wantMat+'.'+
      '<div class="submitRow"><button class="act trade" id="btnAcceptTrade">Accept</button><button class="act" id="btnDeclineTrade">Decline</button></div>';
    document.getElementById('btnAcceptTrade').onclick=function(){
      withState(function(){ resolveTrade(true); });
    };
    document.getElementById('btnDeclineTrade').onclick=function(){
      withState(function(){ resolveTrade(false); });
    };
  } else {
    banner.classList.remove('show');
    banner.innerHTML='';
  }
}

function resolveTrade(accept){
  const p=state.pendingTrade;
  if(!p) return;
  const fromG=state.guilds[p.from], toG=state.guilds[p.to];
  if(accept){
    if((toG.mat[p.wantMat]||0)<p.wantQty || (fromG.mat[p.giveMat]||0)<p.giveQty){
      addLog('Trade could not complete, materials had changed.', 'st');
    } else {
      fromG.mat[p.giveMat]-=p.giveQty; if(fromG.mat[p.giveMat]===0) delete fromG.mat[p.giveMat];
      toG.mat[p.wantMat]-=p.wantQty; if(toG.mat[p.wantMat]===0) delete toG.mat[p.wantMat];
      addMat(toG,p.giveMat,p.giveQty);
      addMat(fromG,p.wantMat,p.wantQty);
      addLog(fromG.name+' and '+toG.name+' complete a trade: '+p.giveQty+' '+p.giveMat+' for '+p.wantQty+' '+p.wantMat+'.', 'ev');
    }
  } else {
    addLog(toG.name+' declines the trade offer.');
  }
  state.pendingTrade=null;
}

function checkFloorCamping(g){
  if(g.turnsOnFloor>CAMP_LIMIT){
    const keys=stockKeys(g);
    if(keys.length){ const p=keys[Math.floor(Math.random()*keys.length)]; g.mat[p]-=1; if(g.mat[p]===0) delete g.mat[p]; returnMat(p,1); }
    g.progress=Math.max(0,g.progress-1); g.turnsOnFloor=1;
    addLog(g.name+' camped Floor '+(g.idx+1)+' too long, the Monster attacks: -1 progress'+(keys.length?', -1 material.':'.'), 'st');
  }
}
function maybeDrawEvent(g){
  const roll=1+Math.floor(Math.random()*6);
  if(roll>=5){
    const ev=EVENTS[Math.floor(Math.random()*EVENTS.length)];
    addLog('Tower Event, '+ev.label+': '+ev.apply(g, state.pools), 'ev');
  }
}
function nextIndex(){ return (state.current+1)%state.guilds.length; }

// ---- Monster Outbreak (section 13 of Rules of Play) ----
function resetOutbreakTimer(){
  state.outbreakFloor = Math.min(state.clearedThrough+1, floors.length-1);
  state.outbreakTimer = floors[state.outbreakFloor].need + 2;
}
function triggerOutbreak(){
  let leadIdx=0;
  state.guilds.forEach(function(g,i){
    const lead=state.guilds[leadIdx];
    if(g.idx>lead.idx || (g.idx===lead.idx && g.progress>lead.progress)) leadIdx=i;
  });
  state.guilds.forEach(function(g,i){
    const loss = i===leadIdx ? 2 : 1;
    g.progress=Math.max(0,g.progress-loss);
  });
  SFX.outbreak();
  addLog('Monster Outbreak on Floor '+(state.outbreakFloor+1)+'! '+state.guilds[leadIdx].name+' (furthest ahead) loses 2 progress, every other Guild loses 1.', 'st');
  resetOutbreakTimer();
}

// ---- core actions (shared by human buttons and the AI bot) ----
// section 17: after 12 rounds the highest climber wins, ties go to progress then to what they hold
function endOnRoundLimit(){
  let bestIdx=0;
  state.guilds.forEach(function(g,i){
    const b=state.guilds[bestIdx];
    if(g.idx>b.idx) bestIdx=i;
    else if(g.idx===b.idx && g.progress>b.progress) bestIdx=i;
    else if(g.idx===b.idx && g.progress===b.progress && guildValue(g)>guildValue(b)) bestIdx=i;
  });
  state.winner=bestIdx;
  addLog('Round '+ROUND_LIMIT+' is over. '+state.guilds[bestIdx].name+' has climbed the highest (Floor '+(state.guilds[bestIdx].idx+1)+', '+guildValue(state.guilds[bestIdx])+' in materials and gear) and wins.', 'wn');
}

function endTurnAction(){
  if(state.winner!==null && state.winner!==undefined) return;
  const n=state.guilds.length;
  state.turnsThisRound=(state.turnsThisRound||0)+1;
  const wrapped = state.turnsThisRound>=n;
  if(wrapped){
    // section 3: turn order rotates by one seat each round
    state.turnsThisRound=0;
    state.round=(state.round||1)+1;
    state.roundStart=((state.roundStart||0)+1)%n;
    state.current=state.roundStart;
  } else {
    state.current=(state.current+1)%n;
  }
  state.turnCount=(state.turnCount||1)+1;
  state.lastHunt=null;
  const g=me();
  g.ap=2; g.hexCurse=false; g.scavenged=false;
  checkFloorCamping(g);
  addLog('--- '+g.name+"'s turn begins (round "+state.round+" of "+ROUND_LIMIT+"). ---");
  maybeDrawEvent(g);
  if(wrapped){
    if(state.outbreakTimer===undefined || state.outbreakTimer===null) resetOutbreakTimer();
    state.outbreakTimer-=1;
    if(state.outbreakTimer<=0) triggerOutbreak();
    if(state.round>ROUND_LIMIT) endOnRoundLimit();
  }
}

// section 5: a successful hunt draws a Loot Card, usually the floor's material
function drawLoot(g){
  if(!state.loot || !state.loot.length){
    state.loot=LOOT_DECK.slice();
    for(let i=state.loot.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=state.loot[i]; state.loot[i]=state.loot[j]; state.loot[j]=t; }
  }
  const card=state.loot.pop();
  g.gear=g.gear||[];
  if(card==='broken' && g.gear.length<GEAR_SLOTS){ g.gear.push('Broken Gear'); return {kind:'broken', name:'Broken Gear', label:'a piece of Broken Gear'}; }
  const f=floors[g.idx];
  if(state.pools[g.idx]>0 && addMat(g,f.name,1)){ state.pools[g.idx]-=1; return {kind:'mat', floor:g.idx, name:f.name, label:'1 '+f.name}; }
  return null;
}

// section 10: the fallback that keeps a stuck Guild from waiting forever
function canDoAnything(g){
  if(g.ap>0) return true;
  if(canAscend(g)) return true;
  if(matTotal(g)>=TRANSMUTE_COST) return true;
  return stockKeys(g).length>0 && others().some(function(o){ return stockKeys(o.g).length>0; });
}
function scavengeAction(){
  const g=me();
  if(g.scavenged){ addLog('Desperate Scavenge is once per turn.'); return; }
  if(canDoAnything(g)){ addLog(g.name+' still has a legal action, Desperate Scavenge is not available.'); return; }
  let from=g.idx;
  while(from>=0 && state.pools[from]<=0) from-=1;
  const name = from>=0 ? floors[from].name : floors[g.idx].name;   // otherwise the general supply
  if(!addMat(g,name,1)){ addLog(g.name+' has no free material slot to scavenge into.'); return; }
  if(from>=0) state.pools[from]-=1;
  g.scavenged=true;
  addLog(g.name+' is out of options and Desperate Scavenges 1 '+name+'.', 'ev');
}
function huntAction(){
  const g=me(), f=floors[g.idx];
  if(state.winner!==null && state.winner!==undefined) return;
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  if(g.eventCurse){ g.eventCurse=false; g.ap-=1; addLog(g.name+"'s Hunt is swallowed by curse mist, automatic failure.", 'st'); return; }

  const gear=g.gear||[];
  const hasUpBow=gear.includes('Upgraded Bow'), hasBasicBow=gear.includes('Basic Bow');
  const hasUpSword=gear.includes('Upgraded Sword'), hasBasicSword=gear.includes('Basic Sword');
  const hasShield=gear.includes('Shield'), hasCoin=gear.includes('Lucky Coin'), hasCompass=gear.includes('Compass');
  const hasBroken=gear.includes('Broken Gear');

  let d1=1+Math.floor(Math.random()*6), d2=1+Math.floor(Math.random()*6);
  let bowBonus=0, gearNote='';
  if(hasBasicBow||hasUpBow){
    const rerollFirst=d1<=d2;
    const rerolled=1+Math.floor(Math.random()*6);
    if(hasUpBow){ bowBonus=rerolled; gearNote+=' (Upgraded Bow +'+rerolled+')'; }
    else { if(rerollFirst) d1=rerolled; else d2=rerolled; gearNote+=' (Bow reroll)'; }
  }
  const swordBonus = hasUpSword?4:(hasBasicSword?2:0);
  if(swordBonus) gearNote+=' (+'+swordBonus+' sword)';
  let brokenBonus=0;
  if(hasBroken){ brokenBonus=2; gearNote+=' (Broken Gear +2, breaks)'; g.gear=gear.filter(function(x){ return x!=='Broken Gear'; }); }

  const behind=trailing();
  let total=d1+d2+bowBonus+swordBonus+brokenBonus+(behind?1:0)-(g.hexCurse?2:0);
  g.ap-=1;
  state.rollSeq=(state.rollSeq||0)+1;
  const hunt={ seq:state.rollSeq, guildName:g.name, matName:f.name, d1:d1, d2:d2, total:total, dr:f.dr, snake:false, crit:false, success:false, stolenFrom:null, gearNote:gearNote };

  function successExtras(){
    let extra='';
    if(hasCoin){ const bonus=drawLoot(g); if(bonus){ extra+=' Lucky Coin: +'+bonus.label+'.'; hunt.loot=hunt.loot||bonus; } }
    if(hasCompass){ g.progress+=1; extra+=' Compass: +1 extra progress.'; }
    return extra;
  }

  if(d1===6&&d2===6){
    g.progress+=2;
    const loot=drawLoot(g);
    g.ap+=1;
    hunt.crit=true; hunt.success=true; hunt.loot=loot;
    addLog(g.name+' rolls double sixes! Critical hunt: +2 progress'+(loot?', loot: '+loot.label:'')+', action point refunded.'+gearNote+successExtras());
  } else if(d1===1&&d2===1){
    // section 5: a natural 2 is the only roll that costs banked progress
    hunt.snake=true; hunt.shielded=hasShield;
    if(hasShield){
      addLog(g.name+' rolls a natural 2, but the Shield absorbs it, no progress lost.', 'st');
    } else {
      g.progress=Math.max(0,g.progress-1);
      addLog(g.name+' rolls a natural 2 and loses 1 banked Ascension Progress.', 'st');
    }
  } else if(total>=f.dr){
    g.progress+=1;
    hunt.success=true;
    const loot=drawLoot(g);
    hunt.loot=loot;
    if(loot) addLog(g.name+' rolls '+total+(behind?' (+1 catch-up)':'')+(g.hexCurse?' (-2 cursed)':'')+gearNote+' vs DR'+f.dr+', success: +1 progress, loot: '+loot.label+'.'+successExtras());
    else addLog(g.name+' succeeds but storage is full or the pool is empty. Progress only.'+successExtras());
  } else {
    addLog(g.name+' rolls '+total+(behind?' (+1 catch-up)':'')+(g.hexCurse?' (-2 cursed)':'')+gearNote+' vs DR'+f.dr+', failed. Action point spent.');
  }
  g.hexCurse=false;
  state.lastHunt=hunt;
}
function trainAction(){
  const g=me(), f=floors[g.idx];
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  if((g.mat[f.name]||0)>=2){ g.mat[f.name]-=2; g.progress+=1; g.ap-=1; addLog(g.name+' trains using 2 '+f.name+', guaranteed +1 progress.'); }
  else addLog(g.name+' needs 2 '+f.name+' in storage to train.');
}
function raidAction(){
  const g=me();
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  const targets=others();
  if(!targets.length) return;
  const t=targets[Math.floor(Math.random()*targets.length)].g;
  g.ap-=1;
  const roll=1+Math.floor(Math.random()*6);
  if(roll>=4){
    const s=steal(t,g);
    addLog(s? (g.name+' raids '+t.name+' (rolled '+roll+'), stealing 1 '+s+'.') : (g.name+' raids '+t.name+' but they had nothing to take.'), 'st');
  } else {
    addLog(g.name+' raids '+t.name+' and rolls '+roll+', fought off.');
  }
}
function affordGear(g,cost){ return Object.keys(cost).every(function(k){ return (g.mat[k]||0)>=cost[k]; }); }
function payGear(g,cost){ Object.keys(cost).forEach(function(k){ g.mat[k]-=cost[k]; if(g.mat[k]<=0) delete g.mat[k]; returnMat(k,cost[k]); }); }
function eligibleGear(g){
  const owned=g.gear||[];
  return Object.keys(GEAR).filter(function(name){
    const def=GEAR[name];
    if(def.type==='broken') return false;   // Broken Gear only ever comes from a Loot Card
    if(owned.includes(name)) return false;
    if(def.requires) return owned.includes(def.requires);
    if(def.type==='accessory' && owned.some(function(o){ return GEAR[o]&&GEAR[o].type==='accessory'; })) return false;
    if(owned.length>=GEAR_SLOTS) return false;
    if(def.line){
      const upName=Object.keys(GEAR).find(function(n){ return GEAR[n].line===def.line && GEAR[n].tier===2; });
      if(upName && owned.includes(upName)) return false;
    }
    return true;
  });
}
function craftAction(itemName){
  const g=me();
  const def=GEAR[itemName];
  if(!def) return;
  g.gear=g.gear||[];
  if(def.requires){
    if(!g.gear.includes(def.requires)){ addLog(g.name+' needs a '+def.requires+' before upgrading to '+itemName+'.'); return; }
    if(!affordGear(g,def.cost)){ addLog(g.name+' cannot afford the upgrade to '+itemName+'.'); return; }
    payGear(g,def.cost);
    g.gear=g.gear.map(function(x){ return x===def.requires?itemName:x; });
    addLog(g.name+' upgrades to a '+itemName+'.');
    return;
  }
  if(def.type==='accessory' && g.gear.some(function(x){ return GEAR[x]&&GEAR[x].type==='accessory'; })){ addLog(g.name+' already carries an accessory, only one at a time.'); return; }
  if(g.gear.length>=GEAR_SLOTS){ addLog(g.name+' has no open item slot.'); return; }
  if(!affordGear(g,def.cost)){ addLog(g.name+' cannot afford a '+itemName+'.'); return; }
  payGear(g,def.cost);
  g.gear.push(itemName);
  addLog(g.name+' crafts a '+itemName+'.');
}
// section 8: discard any 3 materials, any mix, to receive 1 material of choice
function transmuteAction(target){
  const g=me();
  const total=matTotal(g);
  if(total<TRANSMUTE_COST){ addLog(g.name+' needs '+TRANSMUTE_COST+' materials to transmute, has '+total+'.'); return; }
  if(!canAdd(g,target)){ addLog(g.name+' has no free material slot for '+target+'.'); return; }
  let toSpend=TRANSMUTE_COST;
  // spend the other materials first, so asking for more of what you hold still works
  const order=stockKeys(g).sort(function(a,b){ return (a===target?1:0)-(b===target?1:0); });
  for(const k of order){
    if(toSpend<=0) break;
    const take=Math.min(g.mat[k],toSpend);
    g.mat[k]-=take; toSpend-=take;
    if(g.mat[k]===0) delete g.mat[k];
    returnMat(k,take);
  }
  addMat(g,target,1);
  addLog(g.name+' transmutes '+TRANSMUTE_COST+' materials into 1 '+target+'.');
}
function ascendAction(){
  const g=me(), f=floors[g.idx];
  if(canAscend(g)){
    if(f.toll>0){ g.mat[f.name]-=f.toll; if(g.mat[f.name]===0) delete g.mat[f.name]; returnMat(f.name,f.toll); }
    const key=keyFor(g.idx);
    if(key){
      for(const m in key.cost){ g.mat[m]-=key.cost[m]; if(g.mat[m]<=0) delete g.mat[m]; returnMat(m,key.cost[m]); }
      addLog(g.name+' crafts and spends the '+key.name+'.', 'ev');
    }
    const clearedIdx=g.idx;
    if(g.idx===floors.length-1){ state.winner=state.current; addLog(g.name+' defeats the Sovereign and wins the game.', 'wn'); }
    else { g.idx+=1; g.progress=0; g.turnsOnFloor=1; addLog(g.name+' ascends to Floor '+(g.idx+1)+'.'); }
    SFX.climb();
    if(clearedIdx>state.clearedThrough){ state.clearedThrough=clearedIdx; resetOutbreakTimer(); addLog('Floor '+(clearedIdx+1)+' is cleared for the first time, the Outbreak Timer moves up.', 'ev'); }
  } else {
    const key=keyFor(g.idx);
    addLog(g.name+' needs '+f.need+' progress (has '+g.progress+')'+(f.toll?', '+f.toll+' '+f.name+' toll (has '+(g.mat[f.name]||0)+')':'')+(key?', and the '+key.name+' ('+keyCostText(g.idx)+')':'')+'.');
  }
}
function keyCostText(idx){
  const key=keyFor(idx);
  if(!key) return '';
  return Object.keys(key.cost).map(function(m){ return key.cost[m]+' '+m; }).join(' + ');
}

// ---- button wiring (human only, gated by isMyTurn) ----
document.getElementById('btnEndTurn').onclick=function(){ if(!isMyTurn()) return; withState(endTurnAction); };
document.getElementById('btnHunt').onclick=function(){ if(!isMyTurn()) return; withState(huntAction); };
document.getElementById('btnTrain').onclick=function(){ if(!isMyTurn()) return; withState(trainAction); };
document.getElementById('btnRaid').onclick=function(){ if(!isMyTurn()) return; withState(raidAction); };
document.getElementById('btnTransmute').onclick=function(){
  document.getElementById('transmutePanel').classList.toggle('show');
  ['tradePanel','sabotagePanel','blacksmithPanel'].forEach(function(id){ document.getElementById(id).classList.remove('show'); });
  refreshTargetSelects();
};
document.getElementById('btnCancelTransmute').onclick=function(){ document.getElementById('transmutePanel').classList.remove('show'); };
document.getElementById('btnDoTransmute').onclick=function(){
  if(!isMyTurn()) return;
  const target=document.getElementById('transmuteTarget').value;
  withState(function(){ transmuteAction(target); });
  document.getElementById('transmutePanel').classList.remove('show');
};
document.getElementById('btnScavenge').onclick=function(){ if(!isMyTurn()) return; withState(scavengeAction); };
document.getElementById('btnAscend').onclick=function(){ if(!isMyTurn()) return; withState(ascendAction); };

document.getElementById('btnTradeToggle').onclick=function(){ document.getElementById('tradePanel').classList.toggle('show'); document.getElementById('sabotagePanel').classList.remove('show'); refreshTargetSelects(); };
document.getElementById('btnCancelTrade').onclick=function(){ document.getElementById('tradePanel').classList.remove('show'); };
document.getElementById('btnSendTrade').onclick=function(){
  if(!isMyTurn()) return;
  const targetIdx=parseInt(document.getElementById('tradeTarget').value,10);
  const giveMat=document.getElementById('tradeGiveMat').value;
  const giveQty=parseInt(document.getElementById('tradeGiveQty').value||'0',10);
  const wantMat=document.getElementById('tradeWantMat').value;
  const wantQty=parseInt(document.getElementById('tradeWantQty').value||'0',10);
  withState(function(){
    const g=me();
    if(!giveMat || (g.mat[giveMat]||0)<giveQty){ addLog(g.name+' does not have enough to offer that trade.'); return; }
    state.pendingTrade={ from: state.current, to: targetIdx, giveMat: giveMat, giveQty: giveQty, wantMat: wantMat, wantQty: wantQty };
    addLog(g.name+' proposes a trade to '+state.guilds[targetIdx].name+'.', 'ev');
  });
  document.getElementById('tradePanel').classList.remove('show');
};

document.getElementById('btnSabotageToggle').onclick=function(){ document.getElementById('sabotagePanel').classList.toggle('show'); document.getElementById('tradePanel').classList.remove('show'); refreshTargetSelects(); };
document.getElementById('btnCancelSabotage').onclick=function(){ document.getElementById('sabotagePanel').classList.remove('show'); };
document.getElementById('btnSendSabotage').onclick=function(){
  if(!isMyTurn()) return;
  const targetIdx=parseInt(document.getElementById('sabTarget').value,10);
  const payMat=document.getElementById('sabMat').value;
  withState(function(){
    const g=me();
    if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
    if(!payMat || (g.mat[payMat]||0)<1){ addLog(g.name+' has no material to spend on a curse.'); return; }
    g.mat[payMat]-=1; if(g.mat[payMat]===0) delete g.mat[payMat];
    g.ap-=1;
    state.guilds[targetIdx].hexCurse=true;
    addLog(g.name+' spends 1 '+payMat+' to curse '+state.guilds[targetIdx].name+': their next Hunt total takes -2.', 'ev');
  });
  document.getElementById('sabotagePanel').classList.remove('show');
};

document.getElementById('btnBlacksmithToggle').onclick=function(){
  document.getElementById('blacksmithPanel').classList.toggle('show');
  document.getElementById('tradePanel').classList.remove('show');
  document.getElementById('sabotagePanel').classList.remove('show');
  populateBlacksmith();
};
document.getElementById('btnCancelBlacksmith').onclick=function(){ document.getElementById('blacksmithPanel').classList.remove('show'); };
document.getElementById('blacksmithItem').onchange=updateBlacksmithCost;
document.getElementById('btnCraftItem').onclick=function(){
  if(!isMyTurn()) return;
  const item=document.getElementById('blacksmithItem').value;
  if(!item) return;
  withState(function(){ craftAction(item); });
};
function populateBlacksmith(){
  const g=me();
  const sel=document.getElementById('blacksmithItem');
  const options=eligibleGear(g);
  if(!options.length){
    sel.innerHTML='<option value="">Nothing craftable right now</option>';
    document.getElementById('btnCraftItem').disabled=true;
  } else {
    sel.innerHTML=options.map(function(name){ return '<option value="'+name+'">'+(GEAR_ICON[name]||'')+' '+name+'</option>'; }).join('');
    document.getElementById('btnCraftItem').disabled=false;
  }
  updateBlacksmithCost();
}
function updateBlacksmithCost(){
  const sel=document.getElementById('blacksmithItem');
  const def=GEAR[sel.value];
  const costEl=document.getElementById('blacksmithCost');
  if(!def){ costEl.textContent='Full item slots or no owned base gear to upgrade.'; return; }
  const costStr=Object.keys(def.cost).map(function(k){ return def.cost[k]+' '+k; }).join(' + ');
  costEl.textContent=costStr+' — '+def.desc;
}

// ---- AI bot driver ----
// In an online room, only the host device (myGuildIndex===0) drives bot turns, so two devices never race to act for the same bot.
function isBotDriver(){ return LOCAL_MODE || myGuildIndex===0; }

function maybeBotContinue(){
  if(!state || !isBotDriver()) return;
  if(state.pendingTrade){
    const target=state.guilds[state.pendingTrade.to];
    if(target && target.isBot && !botTradeScheduled){
      botTradeScheduled=true;
      setTimeout(function(){ botTradeScheduled=false; withState(function(){ resolveBotTrade(); }); }, 600);
    }
  }
  if(botStepScheduled) return;
  if(state.winner!==null && state.winner!==undefined) return;
  const g=me();
  if(!g || !g.isBot) return;
  botStepScheduled=true;
  setTimeout(function(){ botStepScheduled=false; botStep(); }, 700);
}

function resolveBotTrade(){
  const p=state.pendingTrade;
  if(!p) return;
  const toG=state.guilds[p.to];
  if(!toG || !toG.isBot) return;
  const canAfford=(toG.mat[p.wantMat]||0)>=p.wantQty;
  const accept = canAfford && Math.random()<0.7;
  resolveTrade(accept);
}

function botStep(){
  if(!state) return;
  if(state.winner!==null && state.winner!==undefined) return;
  const g=me();
  if(!g.isBot) return;
  const f=floors[g.idx];
  if(canAscend(g)){ withState(ascendAction); return; }
  if(!canDoAnything(g) && !g.scavenged){ withState(scavengeAction); return; }
  // ready to climb but short a toll or Key material: buy it at the camp
  if(g.progress>=f.need && matTotal(g)>=TRANSMUTE_COST){
    const want=[];
    if((g.mat[f.name]||0)<f.toll) want.push(f.name);
    const key=keyFor(g.idx);
    if(key) for(const m in key.cost){ if((g.mat[m]||0)<key.cost[m]) want.push(m); }
    if(want.length && canAdd(g,want[0])){ withState(function(){ transmuteAction(want[0]); }); return; }
  }
  if(g.ap<=0){ withState(endTurnAction); return; }
  if((g.gear||[]).length<2){
    const options=eligibleGear(g).filter(function(name){ return GEAR[name].type==='weapon'; });
    const craftable=options.find(function(name){ return affordGear(g,GEAR[name].cost); });
    if(craftable){ withState(function(){ craftAction(craftable); }); return; }
  }
  if((g.mat[f.name]||0)>=2 && Math.random()<0.5){ withState(trainAction); return; }
  if(Math.random()<0.15 && others().some(function(o){return stockKeys(o.g).length;})){ withState(raidAction); return; }
  withState(huntAction);
}
