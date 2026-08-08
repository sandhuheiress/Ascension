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
  {name:"Kasaka Fang", dr:6, need:3, toll:1},
  {name:"Golem Crystal", dr:7, need:4, toll:2},
  {name:"Orc Tusk", dr:8, need:4, toll:2},
  {name:"Oracle Wisp", dr:9, need:5, toll:3},
  {name:"Kaisel Scale", dr:10, need:6, toll:3},
  {name:"Sovereign's Ash", dr:11, need:7, toll:0}
];

const KEYS={
  2: {name:"Vanguard's Sigil", art:1, cost:{'Kasaka Fang':1,'Golem Crystal':1}},
  4: {name:'Kaisel Ward',      art:2, cost:{'Orc Tusk':1,'Oracle Wisp':1}},
  5: {name:"Sovereign's Bane", art:3, cost:{'Kaisel Scale':1,'Kasaka Fang':1}}
};
const CAP=3, CAMP_LIMIT=4, GEAR_SLOTS=3, TRANSMUTE_COST=3, LOOT_REVEAL_MS=5500, DUEL_REVEAL_MS=1500;
function poolCapFor(n){ return 5*n; }
const LOOT_DECK=['mat','mat','mat','mat','mat','mat','mat','mat','mat','mat','broken','broken'];
const PALETTE=['#4fd8ff','#a480ff','#e0b756','#ff8b7a'];
const FLOOR_TINT=['#5ec98a','#8f7fd9','#c08a4a','#cbb8e6','#a83f42','#e6c26a'];
const FLOOR_RANK=['E','D','C','B','A','S'];
function art(kind, n){ return 'url(art/'+kind+'/'+n+'.png)'; }
const COLOR_OPTIONS=[
  {color:'#4fd8ff', name:'Azure'},
  {color:'#a480ff', name:'Amethyst'},
  {color:'#e0b756', name:'Topaz'},
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
  'Ironclad Ward':  { type:'accessory', cost:{'Orc Tusk':2,'Kaisel Scale':1}, desc:'Blocks the next Raid against you outright, then breaks.' },
  'Broken Gear':    { type:'broken', cost:{}, desc:'Single use: +2 to one hunt, then it breaks.' }
};
const GEAR_ICON={ 'Basic Bow':'\u{1F3F9}', 'Upgraded Bow':'\u{1F3F9}✨', 'Basic Sword':'⚔️', 'Upgraded Sword':'\u{1F5E1}️', 'Shield':'\u{1F6E1}️', 'Lucky Coin':'\u{1F340}', 'Compass':'\u{1F9ED}', 'Ironclad Ward':'\u{1F6E1}️✨', 'Broken Gear':'\u{1FA93}' };
const GEAR_ART={ 'Basic Bow':'icon_basic_bow', 'Upgraded Bow':'icon_bow_upgraded', 'Basic Sword':'icon_basic_sword', 'Upgraded Sword':'icon_sword_upgraded', 'Compass':'icon_compass', 'Lucky Coin':'icon_lucky_coin', 'Shield':'icon_shield' };
function pseudoHash(str){ let h=0; str=String(str); for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))>>>0; } return h; }
// Broken Gear has no fixed shape of its own — each piece shows a randomly
// (but stably, per seed) picked base weapon icon with the cracked overlay
// layered on top, so the same piece doesn't change look every render
const BROKEN_GEAR_POOL=['Basic Bow','Basic Sword'];
function brokenGearInner(seed){
  const base=GEAR_ART[BROKEN_GEAR_POOL[pseudoHash(seed)%BROKEN_GEAR_POOL.length]];
  return '<span class="brokenBase art ink" style="--art:'+art('icons',base)+'"></span>'+
    '<span class="brokenOverlay" style="--art:'+art('icons','broken_gear_overlay')+'"></span>';
}
function gearIcon(name, seed){
  if(name==='Broken Gear') return '<span class="ic art brokenArt">'+brokenGearInner(seed!==undefined?seed:name)+'</span>';
  const file=GEAR_ART[name];
  if(!file) return '<span class="ic">'+(GEAR_ICON[name]||'&#x1F392;')+'</span>';
  return '<span class="ic art ink" style="--art:'+art('icons',file)+'"></span>';
}
const MAT_VALUE={}; floors.forEach(function(f,i){ MAT_VALUE[f.name]=i+1; });
const EVENTS=[
  {label:'Windfall', apply:function(g,pools){const f=floors[g.idx]; if(pools[g.idx]>0&&addMat(g,f.name,1)){pools[g.idx]-=1; return g.name+' finds a Windfall cache: +1 '+f.name+'.';} return g.name+' finds a Windfall cache, but storage is full.';}},
  {label:'Ambush', apply:function(g){g.progress=Math.max(0,g.progress-1); return g.name+' is Ambushed by lesser beasts: -1 progress.';}},
  {label:'Guild rally', apply:function(g){g.ap+=1; return g.name+' hears a Guild Rally horn: +1 action point this turn.';}},
  {label:'Curse mist', apply:function(g){g.eventCurse=true; return 'Curse mist settles over '+g.name+': their next Hunt this turn auto-fails.';}},
  {label:'Old cache', apply:function(g){const prevIdx=Math.max(0,g.idx-1); const pn=floors[prevIdx].name; if(addMat(g,pn,1)) return g.name+' unearths an Old Cache: +1 '+pn+'.'; return g.name+' finds an Old Cache, but storage is full.';}},
  {label:'Quiet floor', apply:function(){ return 'The floor is quiet. Nothing happens.';}},
  {label:'Rockslide', apply:function(g){ if(g.ap>0){ g.ap-=1; return g.name+' is caught in a Rockslide: -1 action point this turn.'; } return g.name+' hears a Rockslide, but has no action points left to lose.'; }},
  {label:'Blessing', apply:function(g){ g.blessed=true; return g.name+' feels a Blessing settle in: their next Hunt this turn auto-succeeds.'; }},
  {label:'Twin find', apply:function(g,pools){ const f=floors[g.idx]; let got=0; for(let i=0;i<2;i++){ if(pools[g.idx]>0&&addMat(g,f.name,1)){ pools[g.idx]-=1; got+=1; } } return got ? g.name+' stumbles on a Twin Find: +'+got+' '+f.name+'.' : g.name+' finds a Twin cache, but storage is full.'; }},
  {label:'Landslide', apply:function(g){ state.guilds.forEach(function(o){ if(o.ap>0) o.ap-=1; }); return 'A Landslide shakes the whole Tower: every Guild loses 1 action point this turn.'; }},
  {label:'Old rival', apply:function(g){ const rivals=state.guilds.filter(function(o){ return o!==g && stockKeys(o).length; }); if(!rivals.length) return 'An Old Rival passes '+g.name+' by, with nothing worth swapping.'; const r=rivals[Math.floor(Math.random()*rivals.length)]; const myKeys=stockKeys(g); if(!myKeys.length) return g.name+' meets an Old Rival, but has nothing to offer in a swap.'; const mine=myKeys[Math.floor(Math.random()*myKeys.length)]; const theirs=stockKeys(r)[Math.floor(Math.random()*stockKeys(r).length)]; g.mat[mine]-=1; if(g.mat[mine]===0) delete g.mat[mine]; r.mat[theirs]-=1; if(r.mat[theirs]===0) delete r.mat[theirs]; addMat(g,theirs,1); addMat(r,mine,1); return g.name+' and '+r.name+' cross paths: 1 '+mine+' swaps for 1 '+theirs+'.'; }},
  {label:'Merchant caravan', apply:function(g){ g.ap+=1; return 'A Merchant Caravan passes through: '+g.name+' gains +1 action point this turn.'; }},
  {label:'Stormfront', apply:function(g){ g.hexCurse=true; return 'A Stormfront rolls over the Tower: '+g.name+"'s next Hunt total takes -2."; }}
];

(function () {
  const flicker = document.getElementById('heroFlicker');
  if (!flicker) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  function ember() {
    flicker.style.opacity = (0.55 + Math.random() * 0.35).toFixed(2);
  }
  setInterval(ember, 120 + Math.random() * 180);

  function strike() {
    flicker.style.transition = 'none';
    flicker.style.opacity = '1';
    flicker.style.background = 'radial-gradient(circle at 50% 40%, rgba(224,220,255,0.5), transparent 65%)';
    requestAnimationFrame(function () {
      flicker.style.transition = 'opacity 0.3s ease, background 0.3s ease';
      flicker.style.opacity = '0.65';
      flicker.style.background = 'radial-gradient(circle at 50% 40%, rgba(139,92,246,0.22), transparent 60%)';
    });
    setTimeout(strike, 8000 + Math.random() * 7000);
  }
  setTimeout(strike, 4000);
})();

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
  outbreak: function(){ tone(110,0.5,'sawtooth',0.13); tone(104,0.6,'sawtooth',0.11,0.12); },
  click: function(){ tone(440,0.05,'sine',0.09); tone(660,0.06,'sine',0.07,0.045); },
  notify: function(){ tone(660,0.06,'sine',0.08); tone(990,0.09,'sine',0.06,0.05); }
};
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

const BOT_SPEEDS=[1400,700,350,150];
const BOT_SPEED_LABELS=['0.5x','1x','2x','4x'];
let botSpeedIdx=parseInt(localStorage.getItem('ascension_bot_speed')||'1',10);
if(!(botSpeedIdx>=0 && botSpeedIdx<BOT_SPEEDS.length)) botSpeedIdx=1;
document.getElementById('btnSpeed').textContent=BOT_SPEED_LABELS[botSpeedIdx];
document.getElementById('btnSpeed').onclick=function(){
  botSpeedIdx=(botSpeedIdx+1)%BOT_SPEEDS.length;
  localStorage.setItem('ascension_bot_speed', String(botSpeedIdx));
  this.textContent=BOT_SPEED_LABELS[botSpeedIdx];
};

let deviceId = localStorage.getItem('ascension_device_id');
if(!deviceId){ deviceId='d'+Math.random().toString(36).slice(2,10); localStorage.setItem('ascension_device_id', deviceId); }

let roomCode=null, myGuildIndex=null, state=null, LOCAL_MODE=false, lastHumanSeatLocal=null;
let botStepScheduled=false;
function roomRef(){ return ref(db, 'rooms/'+roomCode); }

function screens(){ return ['screenHome','screenCreate','screenIdentity','screenJoin','screenSlots','screenLobby']; }
function showScreen(id){ screens().forEach(function(s){ document.getElementById(s).style.display = (s===id)?(s==='screenHome'?'block':'block'):'none'; }); document.getElementById('game').style.display='none'; document.body.classList.remove('in-game'); }
let turnStartedAt=null, lastTurnKey=null;
function updateTurnTimerDisplay(){
  const el=document.getElementById('turnTimer');
  if(!el || !turnStartedAt) return;
  const secs=Math.max(0, Math.floor((Date.now()-turnStartedAt)/1000));
  el.textContent=Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0');
}
setInterval(updateTurnTimerDisplay, 1000);

let tutorialOn=false, tutorialPrompted=false, tutorialChoiceMade=false, gamePaused=false;
const seenTips=new Set();
function isPaused(){ return LOCAL_MODE ? gamePaused : !!(state && state.paused); }
// Keep the board frozen for a moment after a Raid/Sabotage (or anything
// else that shares the pendingDuel/lastDuel system) resolves, so the next
// turn doesn't start — and steal the overlay — while the result is still
// being shown.
function duelRevealActive(){
  return !!(state && state.lastDuel && Date.now()-(state.lastDuel.at||0)<DUEL_REVEAL_MS);
}
function isFrozen(){
  return isPaused() || !tutorialChoiceMade || document.getElementById('seatingRollOverlay').classList.contains('show') || duelRevealActive();
}
function showGame(){
  screens().forEach(function(s){ document.getElementById(s).style.display='none'; });
  document.getElementById('game').style.display='flex';
  document.body.classList.add('in-game');
  document.getElementById('btnPause').style.display = (LOCAL_MODE || myGuildIndex===0) ? '' : 'none';
  document.getElementById('btnSpeed').style.display = LOCAL_MODE ? '' : 'none';
  document.getElementById('btnEndGame').style.display = (LOCAL_MODE || myGuildIndex===0) ? '' : 'none';
  if(!tutorialPrompted){
    tutorialPrompted=true;
    document.getElementById('tutorialPromptOverlay').classList.add('show');
  }
}
function resolveTutorialChoice(wantsTutorial){
  tutorialOn=wantsTutorial;
  tutorialChoiceMade=true;
  document.getElementById('tutorialPromptOverlay').classList.remove('show');
  if(state) render();
}
document.getElementById('btnTutorialYes').onclick=function(){ resolveTutorialChoice(true); };
document.getElementById('btnTutorialNo').onclick=function(){ resolveTutorialChoice(false); };

let seatingRollAckedId=null;
let seatingRollSoundedId=null;
function renderSeatingRollOverlay(){
  const overlay=document.getElementById('seatingRollOverlay');
  if(!state || !state.started || !tutorialChoiceMade){ overlay.classList.remove('show'); return; }
  const sr=state.seatingRoll;
  if(!sr || (sr.done && sr.id===seatingRollAckedId)){ overlay.classList.remove('show'); return; }
  overlay.classList.add('show');
  document.getElementById('seatingRollDice').style.display='none';
  const list=document.getElementById('seatingRollList');
  const winnerEl=document.getElementById('seatingRollWinner');
  const action=document.getElementById('seatingRollAction');

  const rolls=sr.rolls||{};
  if(!sr.done){
    document.getElementById('seatingRollHeading').textContent='Who goes first?';
    document.getElementById('seatingRollDesc').textContent='Each guild rolls their own 2d6 — highest total takes the first turn.';
    document.getElementById('seatingRollDesc').style.display='';
    winnerEl.textContent='';
    action.innerHTML='';
    list.innerHTML = state.guilds.map(function(g,i){
      const rolled = rolls[i]!==undefined;
      const canRoll = !rolled && !g.isBot && (LOCAL_MODE || i===myGuildIndex);
      const right = rolled
        ? '<span class="srVal">'+rolls[i]+'</span>'
        : (canRoll
          ? '<button class="glow-btn srRollBtn" data-i="'+i+'" style="padding:4px 16px;font-size:12px;">Roll</button>'
          : '<span class="srVal" style="color:var(--text-dim);font-size:11px;">'+(g.isBot?'rolling…':'waiting…')+'</span>');
      return '<div class="srRow"><span class="srDot" style="background:'+g.color+'"></span><span class="srName">'+g.name+'</span>'+right+'</div>';
    }).join('');
    list.querySelectorAll('.srRollBtn').forEach(function(btn){
      btn.onclick=function(){
        const idx=parseInt(btn.dataset.i,10);
        SFX.roll();
        withState(function(){ rollMySeat(idx); });
      };
    });
    return;
  }

  document.getElementById('seatingRollHeading').textContent='Rolling for first player…';
  document.getElementById('seatingRollDesc').style.display='none';
  list.innerHTML = state.guilds.map(function(g,i){
    return '<div class="srRow"><span class="srDot" style="background:'+g.color+'"></span><span class="srName">'+g.name+'</span><span class="srVal">'+rolls[i]+'</span></div>';
  }).join('');
  winnerEl.textContent=state.guilds[sr.winnerIdx].name+' goes first!';
  if(sr.id!==seatingRollSoundedId){
    seatingRollSoundedId=sr.id;
    SFX.climb();
  }
  action.innerHTML='<button class="glow-btn" id="btnSeatingRollGo">Start climbing</button>';
  document.getElementById('btnSeatingRollGo').onclick=function(){
    seatingRollAckedId=sr.id;
    render();
  };
}
let botSeatRollScheduled=false;
function maybeBotSeatingRoll(){
  if(!state || !isBotDriver()) return;
  if(botSeatRollScheduled) return;
  const sr=state.seatingRoll;
  if(!sr || sr.done) return;
  const rolls=sr.rolls||{};
  const idx=state.guilds.findIndex(function(g,i){ return g.isBot && rolls[i]===undefined; });
  if(idx<0) return;
  botSeatRollScheduled=true;
  setTimeout(function(){ botSeatRollScheduled=false; withState(function(){ rollMySeat(idx); }); }, BOT_SPEEDS[botSpeedIdx]);
}
let botDuelRollScheduled=false;
function maybeBotDuelRoll(){
  if(!state || !isBotDriver()) return;
  if(botDuelRollScheduled) return;
  const pr=state.pendingDuel;
  if(!pr) return;
  const atkIsBot=state.guilds[pr.atkIdx] && state.guilds[pr.atkIdx].isBot;
  const defIsBot=state.guilds[pr.defIdx] && state.guilds[pr.defIdx].isBot;
  let side=null;
  if(atkIsBot && !pr.atkRoll) side='atk';
  else if(defIsBot && !pr.defRoll) side='def';
  if(!side) return;
  botDuelRollScheduled=true;
  setTimeout(function(){ botDuelRollScheduled=false; withState(function(){ rollDuelSide(side); }); }, BOT_SPEEDS[botSpeedIdx]);
}

// pausing an online room is a host-only privilege — everyone's actions
// freeze either way (isFrozen() reads the synced state.paused), but only
// the host's device can flip it, same as calling End Game
function setPaused(p){
  if(LOCAL_MODE){
    gamePaused=p;
    renderPauseUI();
    if(state) render();
    return;
  }
  if(myGuildIndex!==0) return;
  withState(function(){ state.paused=p; });
}
function renderPauseUI(){
  const p=isPaused();
  const isHost=LOCAL_MODE || myGuildIndex===0;
  document.getElementById('pausedBanner').classList.toggle('show', p);
  document.getElementById('btnPause').textContent = p ? '▶️' : '⏸️';
  document.getElementById('btnPause').title = p ? 'Resume' : 'Pause';
  document.getElementById('btnResume').style.display = isHost ? '' : 'none';
  document.getElementById('pausedBannerHint').textContent = isHost
    ? "No one's turn is moving while this is up."
    : "The host paused the game — no one's turn is moving while this is up.";
}
document.getElementById('btnPause').onclick=function(){ setPaused(!isPaused()); };
document.getElementById('btnResume').onclick=function(){ setPaused(false); };

document.getElementById('logToggle').onclick=function(){ document.getElementById('logPanel').classList.toggle('collapsed'); };

// Tips show immediately (rather than queueing one-at-a-time) so several
// can be on screen together, each anchored near its own target — they
// stack instead of forcing the player to dismiss one before seeing the next.
function coachTip(id, targetEl, html){
  if(!tutorialOn || seenTips.has(id) || !targetEl || !targetEl.offsetParent) return;
  seenTips.add(id);
  const tip=document.createElement('div');
  tip.className='coachTip glass';
  tip.innerHTML='<div class="coachTipBody">'+html+'</div><button class="coachTipClose" type="button">Got it</button>';
  document.body.appendChild(tip);
  const rect=targetEl.getBoundingClientRect();
  const tw=tip.offsetWidth||260, th=tip.offsetHeight||80;
  let top=rect.bottom+10, left=rect.left+rect.width/2-tw/2;
  if(top+th>window.innerHeight-10){ top=Math.max(10,rect.top-th-10); }
  left=Math.max(10, Math.min(left, window.innerWidth-tw-10));
  tip.style.top=top+'px'; tip.style.left=left+'px';
  const closeFn=function(){ if(tip.parentNode) tip.remove(); };
  tip.querySelector('.coachTipClose').onclick=closeFn;
  setTimeout(closeFn, 16000);
}

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

// Static reference — always available, doesn't reflect any guild's own
// stock (unlike the Blacksmith shop grid), just what everything costs.
function renderRecipesPage(){
  const gearGrid=document.getElementById('recipesGearGrid');
  const items=Object.keys(GEAR).filter(function(n){ return GEAR[n].type!=='broken'; });
  gearGrid.innerHTML = items.map(function(name){
    const def=GEAR[name];
    const costChips=Object.keys(def.cost).map(function(m){ return '<span class="costPill">'+def.cost[m]+' '+m+'</span>'; }).join('');
    return '<div class="shopItem">'+
      '<div class="shopIcon">'+gearIcon(name)+'</div>'+
      '<div class="shopName">'+name+(def.requires?' <span class="shopReq">(needs '+def.requires+')</span>':'')+'</div>'+
      '<div class="shopCost">'+(costChips||'<span class="costPill">free</span>')+'</div>'+
      '<div class="shopDesc">'+def.desc+'</div>'+
    '</div>';
  }).join('');
  const floorList=document.getElementById('recipesFloorList');
  floorList.innerHTML = floors.map(function(f,i){
    const key=keyFor(i);
    return '<div class="recipesFloorRow">'+
      '<span class="recipesFloorName">Floor '+(i+1)+' &mdash; '+f.name+'</span>'+
      '<span class="recipesFloorDetail">DR '+f.dr+', '+f.need+' progress'+(f.toll?', '+f.toll+' '+f.name+' toll':'')+(key?', + '+key.name+' ('+costText(key.cost)+')':'')+'</span>'+
    '</div>';
  }).join('');
}
function openRecipes(){ renderRecipesPage(); document.getElementById('recipesOverlay').classList.add('show'); }
function closeRecipes(){ document.getElementById('recipesOverlay').classList.remove('show'); }
document.getElementById('btnRecipesGame').onclick=openRecipes;
document.getElementById('btnCloseRecipes').onclick=closeRecipes;
document.getElementById('recipesOverlay').onclick=function(e){ if(e.target.id==='recipesOverlay') closeRecipes(); };

document.getElementById('btnGoCreate').onclick=function(){ showScreen('screenCreate'); };
document.getElementById('btnBackFromCreate').onclick=function(){ showScreen('screenHome'); };
document.getElementById('btnGoJoin').onclick=function(){ showScreen('screenJoin'); };
document.getElementById('btnBackFromJoin').onclick=function(){ showScreen('screenHome'); };
document.getElementById('btnBackFromSlots').onclick=function(){ showScreen('screenJoin'); };

let pendingFlow=null;
let identityColorIdx=0;
const colorGrid=document.getElementById('colorGrid');
COLOR_OPTIONS.forEach(function(opt,i){
  const b=document.createElement('div');
  b.className='colorOpt'+(i===0?' sel':'');
  b.style.color=opt.color;
  b.innerHTML='<span class="ic art" style="--art:'+art('guild',i+1)+'"></span><span class="nm">'+opt.name+'</span>';
  b.onclick=function(){
    if(b.classList.contains('taken')) return;
    identityColorIdx=i;
    Array.from(colorGrid.children).forEach(function(c){c.classList.remove('sel');});
    b.classList.add('sel');
  };
  colorGrid.appendChild(b);
});
// disables colors already claimed by earlier seats in this same local
// pass-and-play setup, so two guilds can't end up sharing an identity
function refreshColorGridAvailability(usedColors){
  const firstFree=COLOR_OPTIONS.findIndex(function(o){ return usedColors.indexOf(o.color)<0; });
  identityColorIdx = firstFree>=0 ? firstFree : 0;
  Array.from(colorGrid.children).forEach(function(c,i){
    const taken=usedColors.indexOf(COLOR_OPTIONS[i].color)>=0;
    c.classList.toggle('taken', taken);
    c.classList.toggle('sel', i===identityColorIdx);
  });
}
function openIdentity(flow){
  pendingFlow=flow;
  colorGrid.style.display='';
  document.getElementById('identityHeading').textContent='Name your guild';
  document.getElementById('identityDesc').textContent='Pick a name and a color for your guild.';
  document.getElementById('identityName').value='';
  document.getElementById('identityErr').textContent='';
  refreshColorGridAvailability([]);
  showScreen('screenIdentity');
}
let localSetupQueue=[];
let localSetupResults=[];
function openLocalIdentityStep(){
  const seat=localSetupQueue[0];
  colorGrid.style.display='';
  document.getElementById('identityHeading').textContent = seat===0 ? 'Name your guild' : 'Pass the device — Seat '+String.fromCharCode(65+seat);
  document.getElementById('identityDesc').textContent = seat===0 ? 'Pick a name and a color for your guild.' : 'Hand the device to that friend, then have them pick a name and color.';
  document.getElementById('identityName').value='';
  document.getElementById('identityErr').textContent='';
  refreshColorGridAvailability(localSetupResults.map(function(r){ return r.color; }));
  showScreen('screenIdentity');
}
let pendingJoinSlot=null;
function openJoinIdentity(slotIdx, usedColors){
  pendingFlow='join';
  pendingJoinSlot=slotIdx;
  colorGrid.style.display='';
  document.getElementById('identityHeading').textContent='Name your guild';
  document.getElementById('identityDesc').textContent='Pick a name and a color for your guild.';
  document.getElementById('identityName').value='';
  document.getElementById('identityName').placeholder='Guild name';
  document.getElementById('identityErr').textContent='';
  refreshColorGridAvailability(usedColors||[]);
  showScreen('screenIdentity');
}
document.getElementById('btnLocalNext').onclick=function(){
  pendingFlow='local';
  localSetupResults=[];
  localSetupQueue=[0];
  for(let i=1;i<localN;i++){ if(localSeatFriend[i]) localSetupQueue.push(i); }
  openLocalIdentityStep();
};
document.getElementById('btnCreateNext').onclick=function(){ openIdentity('online'); };
document.getElementById('btnBackFromIdentity').onclick=function(){
  showScreen(pendingFlow==='local' ? 'screenHome' : (pendingFlow==='join' ? 'screenSlots' : 'screenCreate'));
};

document.getElementById('btnIdentityGo').onclick=async function(){
  const name=document.getElementById('identityName').value.trim();
  const errEl=document.getElementById('identityErr');
  if(!name){ errEl.textContent='Give your guild a name.'; return; }
  errEl.textContent='';
  const chosenColor=COLOR_OPTIONS[identityColorIdx].color;

  if(pendingFlow==='local'){
    localSetupResults.push({seat: localSetupQueue[0], name: name, color: chosenColor});
    localSetupQueue.shift();
    if(localSetupQueue.length){ openLocalIdentityStep(); return; }

    LOCAL_MODE=true; roomCode=null; myGuildIndex=0; lastHumanSeatLocal=null;
    state=freshState(localN);
    const usedColors=localSetupResults.map(function(r){return r.color;});
    const spareColors=COLOR_OPTIONS.map(function(o){return o.color;}).filter(function(c){return usedColors.indexOf(c)<0;});
    let friendCount=0;
    localSetupResults.forEach(function(r){
      state.guilds[r.seat].name=r.name;
      state.guilds[r.seat].color=r.color;
      state.guilds[r.seat].claimedBy='local';
      if(r.seat!==0) friendCount++;
    });
    for(let i=1;i<localN;i++){
      if(!localSeatFriend[i]){
        state.guilds[i].isBot=true; state.guilds[i].claimedBy='bot';
        state.guilds[i].color = spareColors.length ? spareColors.shift() : COLOR_OPTIONS[i%COLOR_OPTIONS.length].color;
      }
    }
    state.started=true;
    state.seatingRoll={ id:'sr'+Date.now()+Math.floor(Math.random()*10000), rolls:{}, startedAt:Date.now() };
    state.log=[{t:(friendCount? 'Local pass-and-play game started.' : 'Practice game started.'), cls:''}];
    document.getElementById('roomTag').textContent = friendCount ? 'Local pass-and-play' : 'Local practice game';
    showGame();
    render();
    return;
  }

  if(pendingFlow==='join'){
    const btn=document.getElementById('btnIdentityGo');
    btn.disabled=true; btn.textContent='Joining...';
    try{
      const fresh=await get(roomRef());
      const fs=fresh.val();
      if(!fs || fs.guilds[pendingJoinSlot].claimedBy){
        errEl.textContent='That slot was just taken — pick another.';
        renderSlotPicker(fs);
        showScreen('screenSlots');
        return;
      }
      const takenColors=fs.guilds.filter(function(g){return !!g.claimedBy;}).map(function(g){return g.color;});
      if(takenColors.indexOf(chosenColor)>=0){
        errEl.textContent='That color was just taken — pick another.';
        refreshColorGridAvailability(takenColors);
        btn.disabled=false; btn.textContent='Next';
        return;
      }
      fs.guilds[pendingJoinSlot].name=name.slice(0,18);
      fs.guilds[pendingJoinSlot].color=chosenColor;
      fs.guilds[pendingJoinSlot].claimedBy=deviceId;
      await set(roomRef(), fs);
      myGuildIndex=pendingJoinSlot;
      localStorage.setItem('ascension_room', roomCode);
      localStorage.setItem('ascension_slot_'+roomCode, String(pendingJoinSlot));
      attachListener();
    } catch(e){
      console.error(e);
      errEl.textContent = 'Could not join: ' + (e && e.message ? e.message : e);
      showScreen('screenIdentity');
    } finally {
      btn.disabled=false; btn.textContent='Next';
    }
    return;
  }

  const btn=document.getElementById('btnIdentityGo');
  btn.disabled=true; btn.textContent='Creating...';
  try{
    LOCAL_MODE=false;
    roomCode=genCode();
    const s=freshState(createN);
    s.guilds.forEach(function(g,i){ g.color = i===0 ? chosenColor : null; });
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
let localSeatFriend=[false,false,false];
const localCountRow=document.getElementById('localCountRow');
const localSeatRow=document.getElementById('localSeatRow');
function renderLocalSeatRow(){
  localSeatRow.innerHTML='';
  for(let i=1;i<localN;i++){
    const b=document.createElement('button');
    b.type='button';
    b.className='seatChip'+(localSeatFriend[i]?' friend':'');
    b.textContent='Seat '+String.fromCharCode(66+i-1)+': '+(localSeatFriend[i]?'Friend (pass device)':'AI');
    b.onclick=function(){ localSeatFriend[i]=!localSeatFriend[i]; renderLocalSeatRow(); };
    localSeatRow.appendChild(b);
  }
}
[2,3,4].forEach(function(n){
  const b=document.createElement('button');
  b.className='count-btn'+(n===2?' sel':'');
  b.textContent=n;
  b.onclick=function(){ localN=n; Array.from(localCountRow.children).forEach(function(c){c.classList.remove('sel');}); b.classList.add('sel'); renderLocalSeatRow(); };
  localCountRow.appendChild(b);
});
renderLocalSeatRow();

function genCode(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<4;i++) s+=chars[Math.floor(Math.random()*chars.length)]; return s; }
function freshGuild(i){ return { name:'Guild '+String.fromCharCode(65+i), color:PALETTE[i], idx:0, progress:0, ap:2, mat:{}, gear:[], turnsOnFloor:1, eventCurse:false, hexCurse:false, hexCurseHeavy:false, claimedBy:null, isBot:false, inactiveSkips:0 }; }
function freshState(n){
  const poolCap=poolCapFor(n);
  return {
    numPlayers: n,
    poolCap: poolCap,
    guilds: Array.from({length:n}, function(_,i){ return freshGuild(i); }),
    pools: floors.map(function(){ return poolCap; }),
    current: 0,
    round: 1,
    loot: null,
    winner: null,
    started: false,
    turnCount: 1,
    lastHunt: null,
    log: [{t:'Room created. Waiting for guilds to join.', cls:''}],
    tradeWants: [],
    clearedThrough: -1,
    outbreakFloor: 0,
    outbreakTimer: floors[0].need+3,
    outbreakActive: false
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
document.getElementById('identityName').addEventListener('keydown', function(e){
  if(e.key==='Enter'){ e.preventDefault(); document.getElementById('btnIdentityGo').click(); }
});
document.getElementById('joinCodeInput').addEventListener('keydown', function(e){
  if(e.key==='Enter'){ e.preventDefault(); document.getElementById('btnFindRoom').click(); }
});

// Enter/Space triggers whichever roll is currently yours to make — the
// duel roll (highest priority, it's blocking everything else while
// pending), then your own seating roll, then Hunt on your turn — so you
// never have to aim for a small button mid-game.
document.addEventListener('keydown', function(e){
  if(e.key!=='Enter' && e.key!==' ') return;
  const tag=(document.activeElement && document.activeElement.tagName || '').toLowerCase();
  if(tag==='input' || tag==='textarea' || tag==='select' || tag==='button') return;
  const duelBtn=document.getElementById('duelRollBtn');
  if(duelBtn && duelBtn.style.display!=='none' && !duelBtn.disabled){
    e.preventDefault(); duelBtn.click(); return;
  }
  const seatBtn=document.querySelector('#seatingRollOverlay .srRollBtn');
  if(seatBtn){
    e.preventDefault(); seatBtn.click(); return;
  }
  const huntBtn=document.getElementById('btnHunt');
  if(huntBtn && huntBtn.offsetParent && !huntBtn.disabled){
    e.preventDefault(); huntBtn.click();
  }
});

function renderSlotPicker(s){
  const row=document.getElementById('slotRow');
  row.innerHTML='';
  s.guilds.forEach(function(g,i){
    const b=document.createElement('button');
    b.className='slotBtn';
    const taken = !!g.claimedBy;
    if(g.color){
      const colorIdx=COLOR_OPTIONS.findIndex(function(o){ return o.color===g.color; });
      const colorName = colorIdx>=0 ? COLOR_OPTIONS[colorIdx].name : g.name;
      const icon = colorIdx>=0
        ? '<span class="ic art" style="--art:'+art('guild',colorIdx+1)+';color:'+g.color+'"></span>'
        : '<span class="dotc" style="background:'+g.color+'"></span>';
      b.innerHTML='<span class="slotIdentity">'+icon+'<span class="slotName" style="color:'+g.color+'">'+colorName+'</span></span><span class="tag'+(g.isBot?' bot':'')+'">'+(g.isBot?'AI':(taken?'taken':'open'))+'</span>';
    } else {
      b.innerHTML='<span class="slotIdentity"><span class="dotc" style="background:transparent;border:1px dashed var(--text-dim);"></span><span class="slotName">Open seat</span></span><span class="tag">open</span>';
    }
    if(taken) b.disabled=true;
    b.onclick=async function(){
      const fresh=await get(roomRef());
      const fs=fresh.val();
      if(fs.guilds[i].claimedBy){ renderSlotPicker(fs); return; }
      const usedColors=fs.guilds.filter(function(gg){return !!gg.claimedBy;}).map(function(gg){return gg.color;});
      openJoinIdentity(i, usedColors);
    };
    row.appendChild(b);
  });
}

// Firebase strips empty objects/arrays on write (an empty {} or [] is
// indistinguishable from "no data" to it), so a guild with no materials yet,
// no gear yet, or a fresh tradeWants/rolls map can come back from a read as
// undefined instead of {}/[] . Every state read from the room needs this
// restored before anything downstream assumes those fields exist.
function normalizeState(s){
  if(!s) return s;
  (s.guilds||[]).forEach(function(g){
    g.mat = g.mat || {};
    g.gear = g.gear || [];
  });
  s.tradeWants = s.tradeWants || [];
  if(s.seatingRoll) s.seatingRoll.rolls = s.seatingRoll.rolls || {};
  return s;
}
function attachListener(){
  onValue(roomRef(), function(snap){
    state=normalizeState(snap.val());
    if(!state) return;
    if(!state.started){ renderLobby(); showScreen('screenLobby'); }
    else { document.getElementById('roomTag').innerHTML='Room <b>'+roomCode+'</b>'; showGame(); render(); }
  });
}

function renderLobby(){
  document.getElementById('lobbyCode').textContent=roomCode;
  const row=document.getElementById('lobbySlots');
  row.innerHTML=state.guilds.map(function(g,i){
    const you = i===myGuildIndex;
    const tag = g.isBot ? 'AI' : (g.claimedBy?'ready':'waiting');
    const dotStyle = g.color ? 'background:'+g.color+';' : 'background:transparent;border:1px dashed var(--text-dim);';
    const label = g.color ? g.name : 'Open seat';
    return '<div class="slotBtn"><span><span class="dotc" style="'+dotStyle+'"></span>'+label+(you?' (you)':'')+'</span><span class="tag'+(g.isBot?' bot':'')+'">'+tag+'</span></div>';
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
  s.seatingRoll={ id:'sr'+Date.now()+Math.floor(Math.random()*10000), rolls:{}, startedAt:Date.now() };
  await set(roomRef(), s);
};
document.getElementById('btnAddBot').onclick=async function(){
  const s=(await get(roomRef())).val();
  const idx=s.guilds.findIndex(function(g){return !g.claimedBy;});
  if(idx===-1) return;
  const usedColors=s.guilds.filter(function(g){return !!g.claimedBy;}).map(function(g){return g.color;});
  const freeColor=COLOR_OPTIONS.find(function(o){return usedColors.indexOf(o.color)<0;});
  s.guilds[idx].color = freeColor ? freeColor.color : COLOR_OPTIONS[idx%COLOR_OPTIONS.length].color;
  s.guilds[idx].isBot=true;
  s.guilds[idx].claimedBy='bot';
  s.log.unshift({t:s.guilds[idx].name+' is now controlled by AI.', cls:''});
  await set(roomRef(), s);
  renderLobby();
};

function clearLocalStorageRoom(){
  if(roomCode){ localStorage.removeItem('ascension_slot_'+roomCode); }
  localStorage.removeItem('ascension_room');
}
async function leaveOnline(midGame){
  if(roomCode && myGuildIndex!==null){
    try{
      const fresh=(await get(roomRef())).val();
      const g=fresh && fresh.guilds[myGuildIndex];
      if(g){
        if(midGame){
          g.isBot=true;
          g.claimedBy='bot';
          fresh.log=fresh.log||[];
          fresh.log.push({t:g.name+' left — now controlled by AI.', cls:''});
        } else {
          g.claimedBy=null;
        }
        await set(roomRef(), fresh);
      }
    } catch(e){ console.error(e); }
  }
  if(roomCode){ try{ off(roomRef()); }catch(e){} }
  clearLocalStorageRoom();
  roomCode=null; myGuildIndex=null; state=null;
  showScreen('screenHome');
}
function leaveGame(){
  if(LOCAL_MODE){ LOCAL_MODE=false; state=null; showScreen('screenHome'); }
  else { leaveOnline(true); }
}
function restartLocalGame(){
  if(!LOCAL_MODE || !state) return;
  const seats=state.guilds.map(function(g){ return {name:g.name, color:g.color, isBot:g.isBot, claimedBy:g.claimedBy}; });
  state=freshState(seats.length);
  state.guilds.forEach(function(g,i){
    g.name=seats[i].name; g.color=seats[i].color; g.isBot=seats[i].isBot; g.claimedBy=seats[i].claimedBy;
  });
  state.started=true;
  state.seatingRoll={ id:'sr'+Date.now()+Math.floor(Math.random()*10000), rolls:{}, startedAt:Date.now() };
  lastHumanSeatLocal=null;
  seatingRollAckedId=null;
  state.log=[{t:'New expedition, same guilds.', cls:''}];
  gamePaused=false;
  render();
}
document.getElementById('btnLeaveLobby').onclick=function(){ leaveOnline(false); };
document.getElementById('btnLeaveGame').onclick=function(){
  if(confirm('Leave this game and return to the home screen?')) leaveGame();
};
document.getElementById('btnEndGame').onclick=function(){
  if(!state || (state.winner!==null && state.winner!==undefined)) return;
  if(!LOCAL_MODE && myGuildIndex!==0){ addLog('Only the host can call the game.'); return; }
  if(confirm("Call the game now? Standings are ranked by floor reached, then progress, then materials/gear on hand — this ends it for everyone.")) withState(concludeGame);
};

// A refresh always lands back on the home screen — no auto-rejoin — so
// stale room/slot info is cleared rather than reattaching to whatever
// game happened to be open before the reload.
(function goHomeOnLoad(){
  const savedRoom=localStorage.getItem('ascension_room');
  if(savedRoom) localStorage.removeItem('ascension_slot_'+savedRoom);
  localStorage.removeItem('ascension_room');
  showScreen('screenHome');
})();

function me(){ return state.guilds[state.current]; }
function isMyTurn(){
  if(LOCAL_MODE) return !state.guilds[state.current].isBot;
  return myGuildIndex===state.current;
}
function myActiveIdx(){
  if(!LOCAL_MODE) return myGuildIndex;
  if(!state.guilds[state.current].isBot) lastHumanSeatLocal=state.current;
  if(lastHumanSeatLocal===null || lastHumanSeatLocal===undefined || !state.guilds[lastHumanSeatLocal] || state.guilds[lastHumanSeatLocal].isBot){
    const firstHuman=state.guilds.findIndex(function(g){ return !g.isBot; });
    if(firstHuman>=0) lastHumanSeatLocal=firstHuman;
  }
  return lastHumanSeatLocal;
}
function others(){ return state.guilds.map(function(g,i){return {g:g,i:i};}).filter(function(o){ return o.i!==state.current; }); }
// Catch-up only kicks in once you're meaningfully behind — 2+ floors
// behind whoever's closest ahead of you, not just anyone in last place.
function trailing(){
  const g=me();
  const ahead=state.guilds.filter(function(o){ return o.idx>g.idx; }).map(function(o){ return o.idx; });
  if(!ahead.length) return false;
  const nextAhead=Math.min.apply(null, ahead);
  return (nextAhead-g.idx)>=2;
}
function addLog(t, cls){ state.log = state.log||[]; state.log.push({t:t, cls:cls||''}); if(state.log.length>50) state.log.shift(); }
function capProgress(g){ const need=floors[g.idx].need; if(g.progress>need) g.progress=need; }
function canAdd(g,name){ const mat=g.mat||{}; return mat.hasOwnProperty(name) || Object.keys(mat).length<CAP; }
function addMat(g,name,qty){ if(!canAdd(g,name)) return false; g.mat=g.mat||{}; g.mat[name]=(g.mat[name]||0)+qty; return true; }
function stockKeys(g){ const mat=g.mat||{}; return Object.keys(mat).filter(function(k){return mat[k]>0;}); }
function matTotal(g){ let t=0; for(const k in (g.mat||{})) t+=g.mat[k]; return t; }
function returnMat(name,qty){
  const fi=floors.findIndex(function(fl){ return fl.name===name; });
  if(fi<0) return;
  const cap=state.poolCap||poolCapFor(state.numPlayers||2);
  state.pools[fi]=Math.max(0,Math.min(cap,state.pools[fi]+qty));
}
function spendMat(g,name,qty){ g.mat[name]-=qty; if(g.mat[name]<=0) delete g.mat[name]; returnMat(name,qty); }

function rollMySeat(idx){
  const sr=state.seatingRoll;
  if(!sr || sr.done) return;
  sr.rolls=sr.rolls||{};
  if(sr.rolls[idx]!==undefined) return;
  sr.rolls[idx]=2+Math.floor(Math.random()*6)+Math.floor(Math.random()*6);
  if(Object.keys(sr.rolls).length<state.guilds.length) return;
  let best=-1;
  state.guilds.forEach(function(g,i){ if(sr.rolls[i]>best) best=sr.rolls[i]; });
  const tied=state.guilds.map(function(g,i){return i;}).filter(function(i){ return sr.rolls[i]===best; });
  const summary='Seating roll: '+state.guilds.map(function(g,i){return g.name+' '+sr.rolls[i];}).join(', ')+'. ';
  if(tied.length>1){
    // A tie for the lead rerolls just the tied guilds instead of picking
    // one of them arbitrarily — everyone else's roll stands.
    const names=tied.map(function(i){ return state.guilds[i].name; }).join(' and ');
    state.log.unshift({t:summary+'Tied for the lead at '+best+' — '+names+' roll again.', cls:''});
    tied.forEach(function(i){ delete sr.rolls[i]; });
    return;
  }
  const first=tied[0];
  sr.done=true;
  sr.winnerIdx=first;
  state.current=first; state.round=1; state.turnStartedAt=Date.now();
  state.log.unshift({t:summary+state.guilds[first].name+' goes first.', cls:''});
}

function canAfford(g,cost){ return Object.keys(cost).every(function(m){ return (g.mat[m]||0)>=cost[m]; }); }
function payCost(g,cost){ Object.keys(cost).forEach(function(m){ spendMat(g,m,cost[m]); }); }
function costText(cost){ return Object.keys(cost).map(function(m){ return cost[m]+' '+m; }).join(' + '); }

function keyFor(idx){ return KEYS[idx]||null; }
function canPayKey(g,idx){
  const k=keyFor(idx);
  return !k || canAfford(g,k.cost);
}
function canAscend(g){
  const f=floors[g.idx];
  return g.ap>0 && g.progress>=f.need && (g.mat[f.name]||0)>=f.toll && canPayKey(g,g.idx);
}
function guildValue(g){
  let v=0;
  for(const k in (g.mat||{})) v+=(MAT_VALUE[k]||0)*g.mat[k];
  (g.gear||[]).forEach(function(name){
    const cost=(GEAR[name]||{}).cost||{};
    for(const k in cost) v+=(MAT_VALUE[k]||0)*cost[k];
  });
  return v;
}
function steal(from,to){ const keys=stockKeys(from); if(!keys.length) return null; const p=keys[Math.floor(Math.random()*keys.length)]; from.mat[p]-=1; if(from.mat[p]===0) delete from.mat[p]; if(addMat(to,p,1)) return p; addMat(from,p,1); return null; }
async function pushState(){ await set(roomRef(), state); }

async function withState(fn){
  if(LOCAL_MODE){
    fn();
    render();
    return;
  }
  const fresh=(await get(roomRef())).val();
  state=normalizeState(fresh);
  fn();
  await pushState();
}

let lastLogCount=0;
function render(){
  if(!state) return;
  renderPauseUI();
  renderSeatingRollOverlay();
  const pool=state.pools[me().idx];
  const f=floors[me().idx];

  const arena=document.getElementById('arena');
  (function(){
    const active=me();
    const activeIdx=state.current;
    const activeGf=floors[active.idx];
    const keys=stockKeys(active);
    const activeYou = LOCAL_MODE ? !active.isBot : activeIdx===myGuildIndex;
    const gameWon = state.winner!==null && state.winner!==undefined;
    const placematShowing = isMyTurn() && !active.isBot && !gameWon;
    const fullPanel = '<div class="guildPanel glass" style="border-left-color:'+active.color+(gameWon?'':';box-shadow:0 0 16px '+active.color+'44')+';">'+
      '<h3><span class="dot" style="width:8px;height:8px;border-radius:50%;background:'+active.color+';box-shadow:0 0 6px '+active.color+';display:inline-block;"></span>'+active.name+(activeYou?' <span class="youTag">you</span>':'')+(active.isBot?' <span class="botTag">AI</span>':'')+(active.hexCurse?' <span class="curseTag">cursed</span>':'')+'</h3>'+
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
      const you = !LOCAL_MODE && o.i===myGuildIndex;
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
    : '<span><span class="dot" style="background:'+me().color+';color:'+me().color+'"></span>'+me().name+(me().isBot?' — AI thinking':(isMyTurn()?" — your turn":" — waiting"))+'</span><span class="hint">Turn '+(state.turnCount||1)+' &middot; '+me().ap+' action points &middot; floor '+(me().idx+1)+' &middot; <span id="turnTimer">0:00</span></span>';
  const turnKey=state.current+':'+(state.turnCount||1);
  if(turnKey!==lastTurnKey){ lastTurnKey=turnKey; turnStartedAt=Date.now(); }
  updateTurnTimerDisplay();

  const winBox=document.getElementById('winBanner');
  if(won){
    winBox.style.display='block';
    const endButtons = '<div class="btnRow" style="margin-top:12px;">'+
      (LOCAL_MODE ? '<button class="glow-btn" id="btnRestartGame">Play again</button>' : '')+
      '<button class="ghost-btn" id="btnLeaveFromWin">Leave</button></div>';
    if(state.winReason==='called'){
      const ranking=state.finalRanking || state.guilds.map(function(g,i){ return {i:i, idx:g.idx, progress:g.progress, value:guildValue(g)}; }).sort(function(a,b){ return b.idx-a.idx || b.progress-a.progress || b.value-a.value; });
      winBox.innerHTML = '<div class="wbTitle">Expedition called — final standings</div><ol class="wbRank">'+
        ranking.map(function(r,pos){
          const rg=state.guilds[r.i];
          return '<li><span class="wbPos">'+(pos+1)+'</span>'+
            '<span class="wbName" style="color:'+rg.color+'">'+rg.name+'</span>'+
            '<span class="wbDetail">Floor '+(r.idx+1)+' ('+FLOOR_RANK[r.idx]+'-rank) &middot; '+r.progress+'/'+floors[r.idx].need+' progress &middot; '+r.value+' in materials &amp; gear</span></li>';
        }).join('')+'</ol>'+endButtons;
    } else {
      winBox.innerHTML='<div class="wbTitle">'+state.guilds[state.winner].name+' defeated the Sovereign and wins the game.</div>'+endButtons;
    }
    const restartBtn=document.getElementById('btnRestartGame');
    if(restartBtn) restartBtn.onclick=restartLocalGame;
    document.getElementById('btnLeaveFromWin').onclick=function(){ leaveGame(); };
  } else {
    winBox.style.display='none';
  }

  const canAct = isMyTurn() && !won && !me().isBot && !isFrozen();
  const canView = !won && !isFrozen();
  const g0=me(), hasAP = canAct && g0.ap>0;
  const dis={
    btnHunt: !hasAP,
    btnTrain: !hasAP || (g0.mat[f.name]||0)<2,
    btnRaidToggle: !hasAP,
    btnSabotageToggle: !hasAP || !stockKeys(g0).length,
    btnTradeToggle: !canAct,
    // Blacksmith is viewable any time — recipes and tolls are useful to
    // check off-turn — the shop grid itself still gates actually crafting
    // to your own turn, this just controls whether the panel opens at all.
    btnBlacksmithToggle: !canView,
    btnTransmute: !canAct || matTotal(g0)<TRANSMUTE_COST,
    btnAscend: !canAct || !canAscend(g0),
    btnScavenge: !hasAP || g0.scavenged || canDoAnything(g0),
    btnDiscardToggle: !canAct || !stockKeys(g0).length
  };
  Object.keys(dis).forEach(function(id){ document.getElementById(id).disabled = dis[id]; });
  document.getElementById('btnEndTurn').disabled = !canAct;

  const brokenRow=document.getElementById('brokenGearRow');
  const showBroken=canAct && (g0.gear||[]).includes('Broken Gear');
  brokenRow.style.display = showBroken ? '' : 'none';
  if(showBroken) coachTip('brokenGear', brokenRow,
    'That\'s Broken Gear: a one-time +2 to a Hunt, then it breaks. It used to apply itself automatically — now you decide, so you can save it for a hunt that actually matters instead of burning it on a random one.');

  if(!dis.btnTrain) coachTip('train', document.getElementById('btnTrain'),
    '<b>Train</b> spends 2 of this floor\'s material for a guaranteed +1 progress, no dice. When the rolls aren\'t going your way, this is the safe option.');
  if(!dis.btnScavenge) coachTip('scavenge', document.getElementById('btnScavenge'),
    '<b>Scavenge</b> shows up when you have no material options &mdash; can\'t Train, Blacksmith, Transmute, Ascend, or Trade with what you\'re holding. Spends 1 AP for 1 material from this floor, or the nearest one below. Once per turn.');
  if(!dis.btnAscend) coachTip('ascend', document.getElementById('btnAscend'),
    'You can <b>Ascend</b> now. Progress resets on the next floor, so there\'s no rush to leave the instant you qualify — finish what you\'re doing here first if it helps.');
  if(canAct && stockKeys(g0).length>=CAP) coachTip('materialFull', document.getElementById('placematMats'),
    'Storage full: '+CAP+' material <i>kinds</i> is the cap, but stacking more of a kind you already hold is unlimited. Trade, Transmute, or spend some down to make room for a new type.');
  if(canAct && (g0.gear||[]).length>=GEAR_SLOTS) coachTip('gearFull', document.getElementById('placematGear'),
    'Both gear slots are full. Upgrading something you already own replaces it in place — a brand new item needs an open slot first.');
  if(canAct && g0.turnsOnFloor>=CAMP_LIMIT) coachTip('camping', document.getElementById('turnBanner'),
    'You\'ve camped this floor a while. One more turn here and the Monster attacks — usually a lost material, though a good roll shrugs it off. Might be worth pushing to Ascend soon.');

  if(hasAP) coachTip('hunt', document.getElementById('btnHunt'),
    '<b>Hunt</b> is your main way up: roll 2d6 against this floor\'s DR. Success banks progress and usually a material. It\'s not the only option though &mdash; look around before you spend your last action point.');
  if(canAct && !hasAP) coachTip('outOfAp', document.getElementById('btnEndTurn'),
    'Out of action points, but you\'re not stuck: Trade, Blacksmith, Transmute, and Ascend are all free. Check those before ending your turn.');

  const logEl=document.getElementById('log');
  const logCount=(state.log||[]).length;
  logEl.innerHTML = (state.log||[]).map(function(l){return '<div class="'+(l.cls||'')+'">'+l.t+'</div>';}).join('');
  if(logCount!==lastLogCount){ lastLogCount=logCount; logEl.scrollTop=logEl.scrollHeight; }

  document.getElementById('headerAvatars').innerHTML = state.guilds.map(function(g,i){
    return '<div class="avatarChip art ink'+(i===state.current&&!won?' turn':'')+'" style="background:'+g.color+'; --art:'+art('guild',i+1)+'" title="'+g.name+'"></div>';
  }).join('');

  document.getElementById('huntSub').textContent = '1 AP, 2d6 vs DR'+f.dr;
  document.getElementById('trainSub').textContent = '1 AP, 2 '+f.name;
  document.getElementById('transmuteSub').textContent = TRANSMUTE_COST+' materials for 1 of choice';
  const key=keyFor(me().idx);
  document.getElementById('ascendSub').textContent =
    '1 AP, ' + (f.toll>0 ? 'pay '+f.toll+' '+f.name : 'defeat the Sovereign') + (key ? ' + '+key.name+' ('+keyCostText(me().idx)+')' : '');

  renderPlacemat();
  renderOutbreakBadge();
  checkForNewActivity();
  refreshTargetSelects();
  renderTradeBoard();
  renderLootChoice();
  renderGearSwap();
  renderTower();
  renderDice();
  renderDuel();
  if(document.getElementById('blacksmithPanel').classList.contains('show')) renderBlacksmithShop();
  maybeBotSeatingRoll();
  maybeBotDuelRoll();
  maybeBotContinue();
}

function renderOutbreakBadge(){
  const el=document.getElementById('outbreakBadge');
  if(!el) return;
  if(state.outbreakFloor===undefined || state.outbreakFloor===null){ el.innerHTML=''; return; }
  const fl=floors[state.outbreakFloor];
  if(state.outbreakActive){
    el.classList.add('warn');
    el.innerHTML =
      '<div class="obLabel">Outbreak Timer<b>Floor '+(state.outbreakFloor+1)+', '+fl.name+'</b></div>'+
      '<div class="obDial" style="--pct:1"><div class="obCount">!</div></div>';
    coachTip('outbreak', el,
      'The Monster is active and hits everyone again every round. Only someone ascending &mdash; any floor, any guild &mdash; drives it off.');
    return;
  }
  const t=state.outbreakTimer;
  const maxT=fl.need+3;
  const pct=Math.max(0, Math.min(1, t/maxT));
  el.classList.toggle('warn', t<=2);
  el.innerHTML =
    '<div class="obLabel">Outbreak Timer<b>Floor '+(state.outbreakFloor+1)+', '+fl.name+'</b></div>'+
    '<div class="obDial" style="--pct:'+pct+'"><div class="obCount">'+Math.max(0,t)+'</div></div>';
  if(t<=2) coachTip('outbreak', el,
    'When this hits 0, the Monster attacks every round until someone ascends &mdash; any floor, any guild &mdash; to drive it off.');
}

const ACTIVITY_TOAST_MS=5000;
const seenEventIds={}, seenHuntSeqs={};
function queueActivity(item){
  const stack=document.getElementById('eventToastStack');
  if(!stack) return;
  const el=document.createElement('div');
  el.className='eventToast glass';
  el.innerHTML='<div class="etLabel">'+item.label+'</div><div class="etTitle">'+item.title+'</div><div class="etText">'+item.text+'</div>';
  stack.insertBefore(el, stack.firstChild);
  requestAnimationFrame(function(){ el.classList.add('show'); });
  SFX.notify();
  setTimeout(function(){
    el.classList.remove('show');
    setTimeout(function(){ el.remove(); }, 260);
  }, ACTIVITY_TOAST_MS);
}
function checkForNewActivity(){
  if(!state) return;
  const le=state.lastEvent;
  if(le && !seenEventIds[le.id]){
    seenEventIds[le.id]=true;
    queueActivity({ label:'Tower Event &middot; '+le.guildName, title:le.label, text:le.text });
  }
  const h=state.lastHunt;
  if(h && h.seq!==undefined && !seenHuntSeqs[h.seq]){
    seenHuntSeqs[h.seq]=true;
    if(h.snake || h.crit){
      const resultText = h.snake
        ? (h.shielded ? (h.guildName+"'s Shield absorbs the natural 2.") : (h.guildName+' loses 1 banked progress.'))
        : 'Critical hunt! +2 progress, action point refunded.';
      queueActivity({ label:h.guildName+' hunts '+h.matName, title: h.snake?'Natural 2':'Critical!', text:resultText });
    }
  }
}

const prevMats={};
let prevGear=[];

function renderPlacemat(){
  const wrap=document.getElementById('myPlacemat');
  const activeIdx=myActiveIdx();
  const g=activeIdx!==null && activeIdx!==undefined ? state.guilds[activeIdx] : null;
  const show = !!g && !g.isBot && (state.winner===null || state.winner===undefined);
  wrap.classList.toggle('show', show);
  if(!show) return;
  const keys=stockKeys(g);
  const gear=g.gear||[];

  const canDiscardNow=isMyTurn();
  const matChips=keys.map(function(k){
    const fi=floors.findIndex(function(fl){return fl.name===k;});
    const tint=fi>=0?FLOOR_TINT[fi]:'var(--border-glow)';
    const ic=fi>=0
      ? '<span class="ic art" style="--art:'+art('mat',fi+1)+'; --tint:'+tint+'"></span>'
      : '<span class="ic">&#x1F4E6;</span>';
    const fresh=(g.mat[k]||0)>(prevMats[k]||0);
    return '<div class="matCard'+(fresh?' fresh':'')+(canDiscardNow?' clickable':'')+'" style="--tint:'+tint+'" data-mat="'+k+'" title="'+(canDiscardNow?'Click to discard':'')+'"><span class="mcQty">x'+g.mat[k]+'</span>'+ic+'<span class="mcName">'+k+'</span></div>';
  });
  Object.keys(prevMats).forEach(function(k){ delete prevMats[k]; });
  keys.forEach(function(k){ prevMats[k]=g.mat[k]; });

  const gearChips=gear.map(function(name,i){
    const fresh=prevGear.indexOf(name)<0;
    return '<div class="matCard gear'+(fresh?' fresh':'')+'" style="--tint:var(--violet)">'+gearIcon(name,g.name+'|'+i)+'<span class="mcName">'+name+'</span></div>';
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
  const matsEl=document.getElementById('placematMats');
  matsEl.innerHTML = pad(matChips, CAP);
  matsEl.querySelectorAll('.matCard[data-mat]').forEach(function(el){
    el.onclick=function(){ openDiscardPanel(el.dataset.mat); };
  });
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
    const poolCap=state.poolCap||poolCapFor(state.numPlayers||2);
    let poolPips='';
    for(let p=0;p<poolCap;p++){
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
          '<span class="poolLabel">'+poolLeft+'/'+poolCap+'</span>'+
        '</div>'+
      '</div>'
    );
  }
  list.innerHTML=rows.join('');
  list.style.transform='rotateX('+PLAT_TILT+'deg) translate3d(0,'+(cam*182)+'px,'+(-cam*20)+'px)';
  movePawns();
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

function lootCard(loot, seed){
  if(!loot) return '';
  const face = loot.kind==='mat'
    ? '<span class="lootArt art" style="--art:'+art('mat',loot.floor+1)+'"></span>'
    : '<span class="lootArt brokenArt">'+brokenGearInner(seed!==undefined?seed:loot.name)+'</span>';
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
  const showLoot=h.loot && h.loot.length && elasped<LOOT_REVEAL_MS;

  box.innerHTML =
    '<p style="font-size:11.5px;color:var(--text-mid);margin:0 0 4px;">'+h.guildName+' hunts '+h.matName+'</p>'+
    '<div class="diceRow">'+diceFace(h.d1,'','dc1')+'<span class="plus">+</span>'+diceFace(h.d2,'','dc2')+'</div>'+
    (h.snake ? '<p style="font-size:12px;color:var(--text-dim);">snake eyes</p>' : '<p style="font-size:12px;color:var(--text-dim);">total '+h.total+' vs DR '+h.dr+'</p>')+
    '<p class="resultLine '+resultCls+'">'+resultText+'</p>'+
    (showLoot ? '<div class="lootRevealRow">'+h.loot.map(function(loot,i){ return lootCard(loot, loot.gearSeed!==undefined ? loot.gearSeed : h.seq+'|'+i); }).join('')+'</div>' : '');
  
  if(key!==lastRollKeyForSfx){
    lastRollKeyForSfx=key;
    throwDie(document.getElementById('dc1'), h.d1);
    throwDie(document.getElementById('dc2'), h.d2);
    SFX.roll();
    setTimeout(function(){ (h.crit ? SFX.crit : h.success ? SFX.success : SFX.fail)(); }, 460);
    if(h.loot){
      setTimeout(function(){ if(lastRollKey===key) renderDice(); }, LOOT_REVEAL_MS);
    }
    const myGuild=state.guilds[myActiveIdx()];
    if(h.snake && myGuild && h.guildName===myGuild.name){
      coachTip('naturalTwo', box, h.shielded
        ? 'That\'s a natural 2 &mdash; your Shield absorbed it, no progress lost.'
        : 'That\'s a natural 2 &mdash; it costs you 1 banked Ascension Progress. Only affects you, not the table.');
    }
  }
}

let lastDuelKey=null;
function renderDuel(){
  const overlay=document.getElementById('duelOverlay');
  if(!overlay) return;
  const rollBtn=document.getElementById('duelRollBtn');
  const pending=state.pendingDuel;
  const d=state.lastDuel;
  if(pending && (!d || d.seq!==pending.seq)){
    const atk=state.guilds[pending.atkIdx], def=state.guilds[pending.defIdx];
    document.getElementById('duelTypeLabel').textContent = pending.type==='sabotage' ? 'SABOTAGE' : 'RAID';
    document.getElementById('duelAtkName').textContent=atk.name;
    document.getElementById('duelDefName').textContent=def.name;
    const atkBonus=raidGearBonus(atk), defBonus=raidGearBonus(def);
    if(pending.atkRoll){
      const atkScore=pending.atkRoll.d1+pending.atkRoll.d2+atkBonus;
      document.getElementById('duelAtkDice').innerHTML=diceFace(pending.atkRoll.d1,'','duelA1')+diceFace(pending.atkRoll.d2,'','duelA2');
      document.getElementById('duelAtkScore').textContent=atkScore+' '+diceBreakdown(pending.atkRoll.d1,pending.atkRoll.d2,atkBonus);
    } else {
      document.getElementById('duelAtkDice').innerHTML=diceFace(1,'idle')+diceFace(1,'idle');
      document.getElementById('duelAtkScore').textContent='';
    }
    if(pending.defRoll){
      const defScore=pending.defRoll.d1+pending.defRoll.d2+defBonus;
      document.getElementById('duelDefDice').innerHTML=diceFace(pending.defRoll.d1,'','duelD1')+diceFace(pending.defRoll.d2,'','duelD2');
      document.getElementById('duelDefScore').textContent=defScore+' '+diceBreakdown(pending.defRoll.d1,pending.defRoll.d2,defBonus);
    } else {
      document.getElementById('duelDefDice').innerHTML=diceFace(1,'idle')+diceFace(1,'idle');
      document.getElementById('duelDefScore').textContent='';
    }
    const resultEl=document.getElementById('duelResultText');
    const canRollAtk = !pending.atkRoll && (LOCAL_MODE || isMyTurn());
    const canRollDef = !pending.defRoll && (LOCAL_MODE || myGuildIndex===pending.defIdx);
    if(canRollAtk){
      resultEl.textContent = atk.name+', roll your dice!';
      rollBtn.style.display='';
      rollBtn.dataset.side='atk';
    } else if(canRollDef){
      resultEl.textContent = def.name+', roll to defend!';
      rollBtn.style.display='';
      rollBtn.dataset.side='def';
    } else {
      resultEl.textContent = !pending.atkRoll ? 'Waiting for '+atk.name+' to roll…' : 'Waiting for '+def.name+' to roll…';
      rollBtn.style.display='none';
    }
    resultEl.className='duelResultText';
    overlay.classList.add('show');
    return;
  }
  rollBtn.style.display='none';
  if(!d || d.seq===lastDuelKey) return;
  lastDuelKey=d.seq;
  document.getElementById('duelTypeLabel').textContent = d.type==='raid' ? 'RAID' : 'SABOTAGE';
  document.getElementById('duelAtkName').textContent=d.atkName;
  document.getElementById('duelDefName').textContent=d.defName;
  document.getElementById('duelAtkDice').innerHTML=diceFace(d.ad1,'','duelA1')+diceFace(d.ad2,'','duelA2');
  document.getElementById('duelDefDice').innerHTML=diceFace(d.dd1,'','duelD1')+diceFace(d.dd2,'','duelD2');
  document.getElementById('duelAtkScore').textContent=d.atkScore+' '+diceBreakdown(d.ad1,d.ad2,d.atkBonus);
  document.getElementById('duelDefScore').textContent=d.defScore+' '+diceBreakdown(d.dd1,d.dd2,d.defBonus);
  const resultEl=document.getElementById('duelResultText');
  resultEl.textContent=d.resultText;
  resultEl.className='duelResultText '+(d.win?'win':'lose');
  overlay.classList.add('show');
  throwDie(document.getElementById('duelA1'), d.ad1);
  throwDie(document.getElementById('duelA2'), d.ad2);
  throwDie(document.getElementById('duelD1'), d.dd1);
  throwDie(document.getElementById('duelD2'), d.dd2);
  SFX.roll();
  setTimeout(function(){ (d.win?SFX.success:SFX.fail)(); }, 460);
  const key=d.seq;
  setTimeout(function(){
    if(lastDuelKey!==key) return;
    overlay.classList.remove('show');
    // The board was frozen (isFrozen -> duelRevealActive) while this was
    // showing; nothing else would trigger a re-render once that timer
    // lapses on its own, so nudge the game forward here.
    if(state) render();
  }, DUEL_REVEAL_MS);
}

function refreshTargetSelects(){
  const opts = others().map(function(o){ return '<option value="'+o.i+'">'+o.g.name+'</option>'; }).join('');
  ['sabTarget','raidTarget'].forEach(function(id){
    const sel=document.getElementById(id);
    const prev=sel.value;
    sel.innerHTML=opts;
    if(prev) sel.value=prev;
  });
  const allMats=floors.map(function(f){return f.name;});
  const tTarget=document.getElementById('transmuteTarget');
  const tPrev=tTarget.value;
  tTarget.innerHTML = allMats.map(function(m){return '<option value="'+m+'">'+m+'</option>';}).join('');
  if(tPrev) tTarget.value=tPrev;
  const sabMat=document.getElementById('sabMat');
  sabMat.innerHTML = stockKeys(me()).map(function(k){return '<option value="'+k+'">'+k+'</option>';}).join('') || '<option value="">none</option>';
  const raidWagerMat=document.getElementById('raidWagerMat');
  raidWagerMat.innerHTML = stockKeys(me()).map(function(k){return '<option value="'+k+'">'+k+'</option>';}).join('') || '<option value="">none</option>';
}
document.getElementById('raidWagerToggle').onchange=function(){
  document.getElementById('raidWagerRow').style.display=this.checked?'':'none';
};

function renderTradeBoard(){
  const board=document.getElementById('tradeBoard');
  if(!board || !state) return;
  const g=me();
  const allMats=floors.map(function(f){return f.name;});
  const qtyOpts=[1,2,3].map(function(n){return '<option value="'+n+'">'+n+'</option>';}).join('');
  const wants=state.tradeWants||[];
  const myWant=wants.find(function(w){ return w.guildIdx===state.current; });

  let html='<div class="twSection"><h4>Your want</h4>';
  if(myWant){
    const offersHtml=(myWant.offers||[]).length
      ? myWant.offers.map(function(o){
          const og=state.guilds[o.fromGuildIdx];
          return '<div class="twOffer"><span>'+og.name+' offers '+o.returnQty+' '+o.returnMat+'</span><div class="btnRow"><button class="act trade twAccept" data-want="'+myWant.id+'" data-offer="'+o.id+'">Accept</button><button class="act twDecline" data-want="'+myWant.id+'" data-offer="'+o.id+'">Decline</button></div></div>';
        }).join('')
      : '<p class="twEmpty">No offers yet.</p>';
    html+='<div class="twWant"><div class="twWantHead">You want <b>'+myWant.wantQty+' '+myWant.wantMat+'</b><button class="act twCancel" data-want="'+myWant.id+'">Cancel</button></div>'+
      '<div class="twOffers">'+offersHtml+'</div></div>';
  } else {
    html+='<div class="row">'+
      '<div class="field"><label>Material</label><select id="twPostMat">'+allMats.map(function(m){return '<option value="'+m+'">'+m+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label>Qty</label><select id="twPostQty">'+qtyOpts+'</select></div>'+
      '<button class="act trade" id="btnPostWant" style="align-self:flex-end;">Post want</button>'+
    '</div>';
  }
  html+='</div>';

  const otherWants=wants.filter(function(w){ return w.guildIdx!==state.current; });
  html+='<div class="twSection"><h4>Open wants</h4>';
  if(!otherWants.length){
    html+='<p class="twEmpty">No one is asking for anything right now.</p>';
  } else {
    html+=otherWants.map(function(w){
      const poster=state.guilds[w.guildIdx];
      const myOffer=(w.offers||[]).find(function(o){ return o.fromGuildIdx===state.current; });
      const canFill=(g.mat[w.wantMat]||0)>=w.wantQty;
      let inner;
      if(myOffer){
        inner='<div class="twMyOffer"><span>You offered '+myOffer.returnQty+' '+myOffer.returnMat+'</span><button class="act twWithdraw" data-want="'+w.id+'">Withdraw</button></div>';
      } else if(!canFill){
        inner='<p class="twEmpty">You don\'t have '+w.wantQty+' '+w.wantMat+' to offer.</p>';
      } else {
        inner='<div class="row">'+
          '<div class="field"><label>For</label><select class="twReturnMat" data-want="'+w.id+'">'+allMats.map(function(m){return '<option value="'+m+'">'+m+'</option>';}).join('')+'</select></div>'+
          '<div class="field"><label>Qty</label><select class="twReturnQty" data-want="'+w.id+'">'+qtyOpts+'</select></div>'+
          '<button class="act trade twPitch" data-want="'+w.id+'" style="align-self:flex-end;">Make offer</button>'+
        '</div>';
      }
      return '<div class="twWant"><div class="twWantHead">'+poster.name+' wants <b>'+w.wantQty+' '+w.wantMat+'</b></div>'+inner+'</div>';
    }).join('');
  }
  html+='</div>';

  board.innerHTML=html;

  const btnPost=document.getElementById('btnPostWant');
  if(btnPost) btnPost.onclick=function(){
    if(!isMyTurn()) return;
    const mat=document.getElementById('twPostMat').value;
    const qty=parseInt(document.getElementById('twPostQty').value,10);
    withState(function(){ postWant(mat,qty); });
  };
  board.querySelectorAll('.twCancel').forEach(function(btn){
    btn.onclick=function(){ if(!isMyTurn()) return; withState(function(){ cancelWant(btn.dataset.want); }); };
  });
  board.querySelectorAll('.twAccept').forEach(function(btn){
    btn.onclick=function(){ if(!isMyTurn()) return; withState(function(){ acceptOffer(btn.dataset.want, btn.dataset.offer); }); };
  });
  board.querySelectorAll('.twDecline').forEach(function(btn){
    btn.onclick=function(){ if(!isMyTurn()) return; withState(function(){ declineOffer(btn.dataset.want, btn.dataset.offer); }); };
  });
  board.querySelectorAll('.twWithdraw').forEach(function(btn){
    btn.onclick=function(){ if(!isMyTurn()) return; withState(function(){ withdrawOffer(btn.dataset.want); }); };
  });
  board.querySelectorAll('.twPitch').forEach(function(btn){
    btn.onclick=function(){
      if(!isMyTurn()) return;
      const wantId=btn.dataset.want;
      const returnMat=board.querySelector('.twReturnMat[data-want="'+wantId+'"]').value;
      const returnQty=parseInt(board.querySelector('.twReturnQty[data-want="'+wantId+'"]').value,10);
      withState(function(){ pitchOffer(wantId, returnMat, returnQty); });
    };
  });
}

function renderGearSwap(){
  const banner=document.getElementById('gearSwapBanner');
  const ps=state.pendingGearSwap;
  if(ps && ps.guildIdx===myActiveIdx() && !state.guilds[ps.guildIdx].isBot){
    banner.classList.add('show');
    const optsHtml=ps.current.map(function(name,i){
      return '<button class="gsOption" type="button" data-name="'+name+'">'+gearIcon(name,ps.guildIdx+'|'+i)+' Drop '+name+'</button>';
    }).join('');
    banner.innerHTML = '<div class="lcTitle">Gear full</div><div class="lcSub">Keep your current gear pieces and leave the new Broken Gear, or drop one to make room.</div>'+
      '<div class="lcOptions">'+optsHtml+'</div>'+
      '<div class="btnRow"><button class="ghost-btn" id="btnKeepGear">Leave the new one</button></div>';
    banner.querySelectorAll('.gsOption').forEach(function(btn){
      btn.onclick=function(){ withState(function(){ resolveGearSwap(btn.dataset.name); }); };
    });
    document.getElementById('btnKeepGear').onclick=function(){ withState(dismissGearSwap); };
  } else {
    banner.classList.remove('show');
    banner.innerHTML='';
  }
}
function renderLootChoice(){
  const banner=document.getElementById('lootChoiceBanner');
  const pl=state.pendingLoot;
  if(pl && pl.guildIdx===myActiveIdx() && !state.guilds[pl.guildIdx].isBot && pl.options.length){
    banner.classList.add('show');
    const optionsHtml=pl.options.map(function(opt,i){
      const preview = opt.kind==='broken'
        ? {kind:'broken', name:'Broken Gear'}
        : {kind:'mat', floor:opt.floorIdx, name:floors[opt.floorIdx].name};
      return '<button class="lcOption" type="button" data-i="'+i+'">'+lootCard(preview,i)+'</button>';
    }).join('');
    banner.innerHTML = '<div class="lcTitle">Extra loot — choose which one'+(pl.options.length>1?'s':'')+' you want</div><div class="lcOptions">'+optionsHtml+'</div>'+
      '<div class="btnRow" style="margin-top:10px;"><button class="ghost-btn" id="btnSkipLoot">Drop the rest</button></div>';
    banner.querySelectorAll('.lcOption').forEach(function(btn){
      btn.onclick=function(){
        const i=parseInt(btn.dataset.i,10);
        withState(function(){ claimLoot(i); });
      };
    });
    document.getElementById('btnSkipLoot').onclick=function(){ withState(function(){ dismissPendingLoot(); }); };
  } else {
    banner.classList.remove('show');
    banner.innerHTML='';
  }
}
function claimLoot(idx){
  const pl=state.pendingLoot;
  if(!pl) return;
  const g=state.guilds[pl.guildIdx];
  const opt=pl.options[idx];
  if(!opt) return;
  pl.options.splice(idx,1);
  if(!pl.options.length) state.pendingLoot=null;
  if(opt.kind==='broken' && g.gear.length>=GEAR_SLOTS){ offerGearSwap(g); return; }
  const card=commitLootCard(g, opt.kind, opt.floorIdx);
  if(card) addLog(g.name+' keeps '+card.label+'.', 'ev');
  else addLog(g.name+' tried to keep a Loot Card, but there was no room after all.', 'st');
}
function dismissPendingLoot(){
  const pl=state.pendingLoot;
  if(!pl) return;
  addLog(state.guilds[pl.guildIdx].name+' leaves the rest of the loot behind.');
  state.pendingLoot=null;
}

function offerGearSwap(g){
  state.pendingGearSwap={ guildIdx: state.guilds.indexOf(g), current: (g.gear||[]).slice() };
  addLog(g.name+"'s gear is full — choose what to drop for the new Broken Gear, or leave it.", 'ev');
}
function resolveGearSwap(dropName){
  const ps=state.pendingGearSwap;
  if(!ps) return;
  const g=state.guilds[ps.guildIdx];
  const idx=(g.gear||[]).indexOf(dropName);
  state.pendingGearSwap=null;
  if(idx<0) return;
  g.gear.splice(idx,1,'Broken Gear');
  addLog(g.name+' drops '+dropName+' for a piece of Broken Gear.', 'ev');
}
function dismissGearSwap(){
  const ps=state.pendingGearSwap;
  if(!ps) return;
  addLog(state.guilds[ps.guildIdx].name+' leaves the new Broken Gear behind.');
  state.pendingGearSwap=null;
}

function postWant(wantMat, wantQty){
  const g=me();
  state.tradeWants=(state.tradeWants||[]).filter(function(w){ return w.guildIdx!==state.current; });
  state.tradeWants.push({ id:'w'+Date.now()+Math.floor(Math.random()*10000), guildIdx: state.current, wantMat: wantMat, wantQty: wantQty, offers: [] });
  addLog(g.name+' posts a want: '+wantQty+' '+wantMat+'.', 'ev');
}
function cancelWant(wantId){
  const idx=(state.tradeWants||[]).findIndex(function(w){ return w.id===wantId && w.guildIdx===state.current; });
  if(idx<0) return;
  addLog(state.guilds[state.current].name+' cancels its want.');
  state.tradeWants.splice(idx,1);
}
function pitchOffer(wantId, returnMat, returnQty){
  const want=(state.tradeWants||[]).find(function(w){ return w.id===wantId; });
  if(!want || want.guildIdx===state.current) return;
  const g=me();
  if((g.mat[want.wantMat]||0)<want.wantQty){ addLog(g.name+' no longer has enough '+want.wantMat+' to offer.'); return; }
  want.offers=(want.offers||[]).filter(function(o){ return o.fromGuildIdx!==state.current; });
  want.offers.push({ id:'o'+Date.now()+Math.floor(Math.random()*10000), fromGuildIdx: state.current, returnMat: returnMat, returnQty: returnQty });
  addLog(g.name+' offers '+want.wantQty+' '+want.wantMat+' for '+returnQty+' '+returnMat+' from '+state.guilds[want.guildIdx].name+'.', 'ev');
}
function withdrawOffer(wantId){
  const want=(state.tradeWants||[]).find(function(w){ return w.id===wantId; });
  if(!want) return;
  want.offers=(want.offers||[]).filter(function(o){ return o.fromGuildIdx!==state.current; });
}
function declineOffer(wantId, offerId){
  const want=(state.tradeWants||[]).find(function(w){ return w.id===wantId && w.guildIdx===state.current; });
  if(!want) return;
  const offer=(want.offers||[]).find(function(o){ return o.id===offerId; });
  if(!offer) return;
  want.offers=want.offers.filter(function(o){ return o.id!==offerId; });
  addLog(state.guilds[want.guildIdx].name+' declines '+state.guilds[offer.fromGuildIdx].name+"'s offer.");
}
function acceptOffer(wantId, offerId){
  const wIdx=(state.tradeWants||[]).findIndex(function(w){ return w.id===wantId; });
  if(wIdx<0) return;
  const want=state.tradeWants[wIdx];
  if(want.guildIdx!==state.current) return;
  const offer=(want.offers||[]).find(function(o){ return o.id===offerId; });
  if(!offer) return;
  const poster=me(), offerer=state.guilds[offer.fromGuildIdx];
  if((offerer.mat[want.wantMat]||0)<want.wantQty){ addLog(offerer.name+' no longer has enough '+want.wantMat+', that offer fell through.', 'st'); want.offers=want.offers.filter(function(o){ return o.id!==offerId; }); return; }
  if((poster.mat[offer.returnMat]||0)<offer.returnQty){ addLog(poster.name+' no longer has enough '+offer.returnMat+' to pay for that.', 'st'); return; }
  if(!canAdd(poster,want.wantMat)){ addLog(poster.name+' has no room to receive '+want.wantMat+'.'); return; }
  if(!canAdd(offerer,offer.returnMat)){ addLog(offerer.name+' has no room to receive '+offer.returnMat+'.'); return; }
  offerer.mat[want.wantMat]-=want.wantQty; if(offerer.mat[want.wantMat]===0) delete offerer.mat[want.wantMat];
  poster.mat[offer.returnMat]-=offer.returnQty; if(poster.mat[offer.returnMat]===0) delete poster.mat[offer.returnMat];
  addMat(poster,want.wantMat,want.wantQty);
  addMat(offerer,offer.returnMat,offer.returnQty);
  addLog(poster.name+' accepts '+offerer.name+"'s offer: "+offer.returnQty+' '+offer.returnMat+' for '+want.wantQty+' '+want.wantMat+'.', 'ev');
  state.tradeWants.splice(wIdx,1);
}

function checkFloorCamping(g){
  if(g.turnsOnFloor>CAMP_LIMIT){
    g.turnsOnFloor=1;
    const roll=1+Math.floor(Math.random()*6);
    if(roll>=4){
      addLog(g.name+' camped Floor '+(g.idx+1)+' too long, but fights off the Monster (rolled '+roll+').', 'ev');
      return;
    }
    const keys=stockKeys(g);
    if(keys.length){ spendMat(g,keys[Math.floor(Math.random()*keys.length)],1); }
    addLog(g.name+' camped Floor '+(g.idx+1)+' too long, the Monster attacks (rolled '+roll+'): '+(keys.length?'-1 material.':'nothing to take.'), 'st');
  }
}
function maybeDrawEvent(g){
  const roll=1+Math.floor(Math.random()*6);
  if(roll>=5){
    const ev=EVENTS[Math.floor(Math.random()*EVENTS.length)];
    try{
      const text=ev.apply(g, state.pools);
      addLog('Tower Event, '+ev.label+': '+text, 'ev');
      state.lastEvent={ id:'ev'+Date.now()+Math.floor(Math.random()*10000), guildName:g.name, label:ev.label, text:text };
    }
    catch(e){ console.error('Tower Event "'+ev.label+'" failed:', e); }
  }
}
function nextIndex(){ return (state.current+1)%state.guilds.length; }

function resetOutbreakTimer(){
  state.outbreakFloor = Math.min(state.clearedThrough+1, floors.length-1);
  state.outbreakTimer = floors[state.outbreakFloor].need + 3;
  state.outbreakActive = false;
}
function triggerOutbreak(){
  let leadIdx=0;
  state.guilds.forEach(function(g,i){
    const lead=state.guilds[leadIdx];
    if(g.idx>lead.idx || (g.idx===lead.idx && g.progress>lead.progress)) leadIdx=i;
  });
  const notes=[];
  state.guilds.forEach(function(g,i){
    if(i===leadIdx){
      g.progress=Math.max(0,g.progress-1);
      const keys=stockKeys(g);
      if(keys.length){ const p=keys[Math.floor(Math.random()*keys.length)]; g.mat[p]-=1; if(g.mat[p]===0) delete g.mat[p]; }
      notes.push(g.name+' (furthest ahead) loses 1 progress'+(keys.length?' and 1 material':'')+'.');
      return;
    }
    const keys=stockKeys(g);
    if(keys.length){
      const p=keys[Math.floor(Math.random()*keys.length)]; g.mat[p]-=1; if(g.mat[p]===0) delete g.mat[p];
      notes.push(g.name+' loses 1 material.');
    } else {
      g.progress=Math.max(0,g.progress-1);
      notes.push(g.name+' loses 1 progress.');
    }
  });
  SFX.outbreak();
  addLog('Monster Outbreak on Floor '+(state.outbreakFloor+1)+'! '+notes.join(' '), 'st');
  // Stays active — hitting everyone again each round — until someone
  // actually ascends (any floor), rather than quietly re-arming itself
  // on the same clock regardless of what players do.
  state.outbreakActive = true;
}

function concludeGame(){
  if(state.winner!==null && state.winner!==undefined) return;
  const ranking=state.guilds.map(function(g,i){ return {i:i, idx:g.idx, progress:g.progress, value:guildValue(g)}; })
    .sort(function(a,b){ return b.idx-a.idx || b.progress-a.progress || b.value-a.value; });
  state.winner=ranking[0].i;
  state.winReason='called';
  state.finalRanking=ranking;
  addLog('The expedition is called. '+state.guilds[ranking[0].i].name+' holds the strongest position.', 'wn');
}

function endTurnAction(){
  if(state.winner!==null && state.winner!==undefined) return;
  const n=state.guilds.length;
  const wrapped = state.current===n-1;
  state.current=(state.current+1)%n;
  if(wrapped) state.round=(state.round||1)+1;
  state.turnCount=(state.turnCount||1)+1;
  state.turnStartedAt=Date.now();
  state.lastHunt=null;
  const g=me();
  g.ap=2; g.hexCurse=false; g.scavenged=false;
  g.turnsOnFloor=(g.turnsOnFloor||0)+1;
  checkFloorCamping(g);
  addLog('--- '+g.name+"'s turn begins (round "+state.round+"). ---");
  maybeDrawEvent(g);
  if(wrapped){
    if(state.outbreakTimer===undefined || state.outbreakTimer===null) resetOutbreakTimer();
    if(state.outbreakActive){
      triggerOutbreak();
    } else {
      state.outbreakTimer-=1;
      if(state.outbreakTimer<=0) triggerOutbreak();
    }
  }
}

function rollLootCard(){
  if(!state.loot || !state.loot.length){
    state.loot=LOOT_DECK.slice();
    for(let i=state.loot.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=state.loot[i]; state.loot[i]=state.loot[j]; state.loot[j]=t; }
  }
  return state.loot.pop();
}
function commitLootCard(g, kind, floorIdx){
  g.gear=g.gear||[];
  if(kind==='broken'){
    if(g.gear.length>=GEAR_SLOTS) return null;
    g.gear.push('Broken Gear');
    return {kind:'broken', name:'Broken Gear', label:'a piece of Broken Gear', gearSeed:g.name+'|'+(g.gear.length-1)};
  }
  const f=floors[floorIdx];
  if(state.pools[floorIdx]<=0 || !addMat(g,f.name,1)) return null;
  state.pools[floorIdx]-=1;
  return {kind:'mat', floor:floorIdx, name:f.name, label:'1 '+f.name};
}
function drawLoot(g){ return commitLootCard(g, rollLootCard(), g.idx); }
function resolveLoot(g, kinds, floorIdx, hunt){
  if(!kinds.length) return;
  if(g.isBot){
    const committed=[];
    kinds.forEach(function(k){ const c=commitLootCard(g,k,floorIdx); if(c) committed.push(c); });
    hunt.loot=committed.length ? committed : null;
    if(committed.length) addLog(g.name+' loots '+committed.map(function(c){return c.label;}).join(' and ')+'.');
    else addLog(g.name+' finds loot, but has no room for it.');
    return;
  }
  if(kinds.length===1){
    if(kinds[0]==='broken' && g.gear.length>=GEAR_SLOTS){ offerGearSwap(g); return; }
    const card=commitLootCard(g, kinds[0], floorIdx);
    hunt.loot=card?[card]:null;
    if(card) addLog(g.name+' loots '+card.label+'.');
    else addLog(g.name+' finds loot, but has no room for it.');
    return;
  }
  if(canKeepAllLoot(g, kinds, floorIdx)){
    const committed=[];
    kinds.forEach(function(k){ const c=commitLootCard(g,k,floorIdx); if(c) committed.push(c); });
    hunt.loot=committed.length ? committed : null;
    if(committed.length) addLog(g.name+' loots '+committed.map(function(c){return c.label;}).join(' and ')+'.');
    else addLog(g.name+' finds loot, but has no room for it.');
    return;
  }
  state.pendingLoot={ guildIdx: state.current, options: kinds.map(function(k){ return {kind:k, floorIdx:floorIdx}; }) };
  addLog(g.name+' draws '+kinds.length+' Loot Cards — choose which to keep.', 'ev');
}
function canKeepAllLoot(g, kinds, floorIdx){
  const hasMat=kinds.some(function(k){ return k!=='broken'; });
  if(hasMat && !canAdd(g, floors[floorIdx].name)) return false;
  const brokenCount=kinds.filter(function(k){ return k==='broken'; }).length;
  return brokenCount<=GEAR_SLOTS-(g.gear||[]).length;
}

function canDoAnything(g){
  if(canAscend(g)) return true;
  if(matTotal(g)>=TRANSMUTE_COST) return true;
  if((g.mat[floors[g.idx].name]||0)>=2) return true;
  if(eligibleGear(g).some(function(name){ return affordGear(g,GEAR[name].cost); })) return true;
  return stockKeys(g).length>0 && others().some(function(o){ return stockKeys(o.g).length>0; });
}
function scavengeAction(){
  const g=me();
  if(g.scavenged){ addLog('Desperate Scavenge is once per turn.'); return; }
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  if(canDoAnything(g)){ addLog(g.name+' still has a legal action, Desperate Scavenge is not available.'); return; }
  let from=g.idx;
  while(from>=0 && state.pools[from]<=0) from-=1;
  const name = from>=0 ? floors[from].name : floors[g.idx].name;
  if(!addMat(g,name,1)){ addLog(g.name+' has no free material slot to scavenge into.'); return; }
  if(from>=0) state.pools[from]-=1;
  g.ap-=1;
  g.scavenged=true;
  addLog(g.name+' has no other move and Scavenges 1 '+name+', spending its last action point.', 'ev');
  SFX.click();
}
function huntAction(useBrokenGear){
  const g=me(), f=floors[g.idx];
  if(state.winner!==null && state.winner!==undefined) return;
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  if(g.eventCurse){
    g.eventCurse=false; g.ap-=1;
    addLog(g.name+"'s Hunt is swallowed by curse mist, automatic failure.", 'st');
    queueActivity({ label:g.name+' hunts '+f.name, title:'Cursed', text:'Swallowed by curse mist — automatic failure.' });
    return;
  }

  const gear=g.gear||[];
  const hasUpBow=gear.includes('Upgraded Bow'), hasBasicBow=gear.includes('Basic Bow');
  const hasUpSword=gear.includes('Upgraded Sword'), hasBasicSword=gear.includes('Basic Sword');
  const hasShield=gear.includes('Shield'), hasCoin=gear.includes('Lucky Coin'), hasCompass=gear.includes('Compass');
  const hasBroken=gear.includes('Broken Gear') && useBrokenGear!==false;

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
  if(hasBroken){
    brokenBonus=2; gearNote+=' (Broken Gear +2, breaks)';
    const brokenIdx=gear.indexOf('Broken Gear');
    if(brokenIdx>=0) gear.splice(brokenIdx,1);
    g.gear=gear;
  }

  const behind=trailing();
  const curseAmount=g.hexCurse?(g.hexCurseHeavy?3:2):0;
  let total=d1+d2+bowBonus+swordBonus+brokenBonus+(behind?1:0)-curseAmount;
  g.ap-=1;
  state.rollSeq=(state.rollSeq||0)+1;
  const hunt={ seq:state.rollSeq, guildName:g.name, matName:f.name, d1:d1, d2:d2, total:total, dr:f.dr, snake:false, crit:false, success:false, gearNote:gearNote };

  function successExtras(){
    let extra='';
    if(hasCompass){ g.progress+=1; extra+=' Compass: +1 extra progress.'; }
    return extra;
  }

  if(d1===6&&d2===6){
    g.progress+=2;
    const rolled=[rollLootCard(), rollLootCard()];
    if(hasCoin) rolled.push(rollLootCard());
    g.ap+=1;
    hunt.crit=true; hunt.success=true;
    addLog(g.name+' rolls double sixes! Critical hunt: +2 progress, action point refunded.'+gearNote+successExtras());
    resolveLoot(g, rolled, g.idx, hunt);
  } else if(d1===1&&d2===1){
    hunt.snake=true; hunt.shielded=hasShield;
    if(hasShield){
      addLog(g.name+' rolls a natural 2, but the Shield absorbs it, no progress lost.', 'st');
    } else {
      g.progress=Math.max(0,g.progress-1);
      addLog(g.name+' rolls a natural 2, loses 1 banked Ascension Progress.', 'st');
    }
  } else if(total>=f.dr){
    g.progress+=1;
    hunt.success=true;
    const rolled=[rollLootCard()];
    if(hasCoin) rolled.push(rollLootCard());
    addLog(g.name+' rolls '+total+(behind?' (+1 catch-up)':'')+(curseAmount?' (-'+curseAmount+' cursed)':'')+gearNote+' vs DR'+f.dr+', success: +1 progress.'+successExtras());
    resolveLoot(g, rolled, g.idx, hunt);
  } else {
    addLog(g.name+' rolls '+total+(behind?' (+1 catch-up)':'')+(curseAmount?' (-'+curseAmount+' cursed)':'')+gearNote+' vs DR'+f.dr+', failed. Action point spent.');
  }
  g.hexCurse=false;
  g.hexCurseHeavy=false;
  capProgress(g);
  state.lastHunt=hunt;
}
function trainAction(){
  const g=me(), f=floors[g.idx];
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  if((g.mat[f.name]||0)>=2){ spendMat(g,f.name,2); g.progress+=1; capProgress(g); g.ap-=1; addLog(g.name+' trains using 2 '+f.name+', guaranteed +1 progress.'); SFX.click(); }
  else addLog(g.name+' needs 2 '+f.name+' in storage to train.');
}
// commits to a raid (spends the AP, locks in target and wager) but doesn't
// roll yet — a human player rolls their own dice via the duel overlay's
// Roll button; a bot's turn rolls immediately since nothing is waiting on it
function raidAction(targetIdx, wagerMat){
  const g=me();
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  if(state.pendingDuel) return;
  const targets=others();
  if(!targets.length) return;
  let defIdx=targetIdx;
  if(defIdx===undefined || defIdx===null || !state.guilds[defIdx]){
    defIdx = targets[Math.floor(Math.random()*targets.length)].i;
  }
  const t = state.guilds[defIdx];
  const wagering = !!wagerMat && (g.mat[wagerMat]||0)>=1;
  g.ap-=1;
  if((t.gear||[]).includes('Ironclad Ward')){
    t.gear=t.gear.filter(function(x){ return x!=='Ironclad Ward'; });
    addLog(g.name+" raids "+t.name+", but an Ironclad Ward blocks it outright and breaks.", 'st');
    SFX.fail();
    return;
  }
  state.rollSeq=(state.rollSeq||0)+1;
  state.pendingDuel = { type:'raid', seq: state.rollSeq, atkIdx: state.current, defIdx: defIdx, wagerMat: wagering?wagerMat:null, atkRoll:null, defRoll:null, createdAt:Date.now() };
}
// Raid and Sabotage are both face-offs both sides actually play: the
// attacker rolls their own dice, then the defender rolls theirs (on their
// own device in online play), and only once both are in does the outcome
// resolve. Bots roll their side automatically via maybeBotDuelRoll,
// whichever side they're on.
function rollDuelSide(side){
  const pr=state.pendingDuel;
  if(!pr) return;
  if(side==='atk'){ if(pr.atkRoll) return; pr.atkRoll={ d1:1+Math.floor(Math.random()*6), d2:1+Math.floor(Math.random()*6) }; }
  else { if(pr.defRoll) return; pr.defRoll={ d1:1+Math.floor(Math.random()*6), d2:1+Math.floor(Math.random()*6) }; }
  if(pr.atkRoll && pr.defRoll){
    if(pr.type==='sabotage') finalizeSabotage();
    else finalizeRaid();
  }
}
// Consistent "(d1+d2)" / "(d1+d2+bonus)" breakdown text, used everywhere
// a duel score is shown so it never looks arbitrary which rolls explain
// themselves and which don't.
function diceBreakdown(d1,d2,bonus){
  return bonus ? '('+d1+'+'+d2+'+'+bonus+')' : '('+d1+'+'+d2+')';
}
function finalizeRaid(){
  const pending=state.pendingDuel;
  if(!pending || !pending.atkRoll || !pending.defRoll) return;
  const g=state.guilds[pending.atkIdx], t=state.guilds[pending.defIdx];
  const wagerMat=pending.wagerMat, wagering=!!wagerMat;
  const ad1=pending.atkRoll.d1, ad2=pending.atkRoll.d2;
  const dd1=pending.defRoll.d1, dd2=pending.defRoll.d2;
  const atkBonus=raidGearBonus(g), defBonus=raidGearBonus(t);
  const atkScore=ad1+ad2+atkBonus, defScore=dd1+dd2+defBonus;
  const win=atkScore>defScore;
  let resultText;
  const atkBreak=diceBreakdown(ad1,ad2,atkBonus), defBreak=diceBreakdown(dd1,dd2,defBonus);
  if(!win){
    let msg=g.name+' raids '+t.name+' and loses the roll, '+atkScore+' '+atkBreak+' vs '+defScore+' '+defBreak+', fought off.';
    resultText='Fought off!';
    if(wagering){
      spendMat(g,wagerMat,1);
      addMat(t,wagerMat,1);
      msg+=' Going all-in cost '+g.name+' its wagered '+wagerMat+' — '+t.name+' keeps it.';
      resultText+=' '+g.name+' loses its wagered '+wagerMat+'.';
    }
    addLog(msg);
  } else {
    const allInTag = wagering ? ' All-in pays off: '+t.name+' also loses 1 progress, and '+g.name+' keeps its wager.' : '';
    if(wagering && t.progress>0) t.progress-=1;
    const s=steal(t,g);
    addLog((s
      ? (g.name+' raids '+t.name+': '+atkScore+' '+atkBreak+' vs '+defScore+' '+defBreak+', stealing 1 '+s+'.')
      : (g.name+' raids '+t.name+' and wins the roll, '+atkScore+' '+atkBreak+' vs '+defScore+' '+defBreak+', but they had nothing to take.'))+allInTag, 'st');
    resultText = s ? ('Steals 1 '+s+'!') : 'Wins, but there was nothing to take.';
    if(wagering) resultText+=' '+t.name+' also loses 1 progress.';
  }
  state.lastDuel={
    seq: pending.seq, type:'raid', at: Date.now(),
    atkName:g.name, ad1:ad1, ad2:ad2, atkBonus:atkBonus, atkScore:atkScore,
    defName:t.name, dd1:dd1, dd2:dd2, defBonus:defBonus, defScore:defScore,
    win:win, resultText:resultText
  };
  state.pendingDuel=null;
}
function raidGearBonus(g){
  let bonus=0;
  (g.gear||[]).forEach(function(name){
    const def=GEAR[name];
    if(!def) return;
    if(def.type==='weapon') bonus += (def.tier===2 ? 3 : 2);
    else if(name==='Lucky Coin' || name==='Compass') bonus += 1;
  });
  return bonus;
}
function sabotageAction(targetIdx, payMat, allIn){
  const g=me();
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  if(state.pendingDuel) return;
  const cost=allIn?2:1;
  if(!payMat || (g.mat[payMat]||0)<cost){ addLog(g.name+' does not have '+cost+' '+ (payMat||'material') +' to spend on '+(allIn?'an all-in curse':'a curse')+'.'); return; }
  const t=state.guilds[targetIdx];
  spendMat(g,payMat,cost);
  g.ap-=1;
  state.rollSeq=(state.rollSeq||0)+1;
  state.pendingDuel = { type:'sabotage', seq: state.rollSeq, atkIdx: state.current, defIdx: targetIdx, payMat: payMat, allIn: !!allIn, atkRoll:null, defRoll:null, createdAt:Date.now() };
}
function finalizeSabotage(){
  const pending=state.pendingDuel;
  if(!pending || !pending.atkRoll || !pending.defRoll) return;
  const g=state.guilds[pending.atkIdx], t=state.guilds[pending.defIdx];
  const payMat=pending.payMat, allIn=pending.allIn;
  const ad1=pending.atkRoll.d1, ad2=pending.atkRoll.d2;
  const dd1=pending.defRoll.d1, dd2=pending.defRoll.d2;
  const atkBonus=raidGearBonus(g), defBonus=raidGearBonus(t);
  const atkScore=ad1+ad2+atkBonus, defScore=dd1+dd2+defBonus;
  const win=atkScore>defScore;
  const atkBreak=diceBreakdown(ad1,ad2,atkBonus), defBreak=diceBreakdown(dd1,dd2,defBonus);
  let resultText;
  if(!win){
    resultText=t.name+' resists the curse!';
    addLog(g.name+' tries to curse '+t.name+' ('+atkScore+' '+atkBreak+' vs '+defScore+' '+defBreak+'), but they resist it.', 'st');
  } else {
    t.hexCurse=true;
    if(allIn){
      t.hexCurseHeavy=true;
      if(t.progress>0) t.progress-=1;
      resultText=t.name+"'s next Hunt takes -3, and they lose 1 progress now.";
      addLog(g.name+' goes all-in, spending 2 '+payMat+' to curse '+t.name+' ('+atkScore+' '+atkBreak+' vs '+defScore+' '+defBreak+'): their next Hunt total takes -3, and they lose 1 progress right now.', 'ev');
    } else {
      resultText=t.name+"'s next Hunt takes -2.";
      addLog(g.name+' spends 1 '+payMat+' to curse '+t.name+' ('+atkScore+' '+atkBreak+' vs '+defScore+' '+defBreak+'): their next Hunt total takes -2.', 'ev');
    }
  }
  state.lastDuel={
    seq: pending.seq, type:'sabotage', at: Date.now(),
    atkName:g.name, ad1:ad1, ad2:ad2, atkBonus:atkBonus, atkScore:atkScore,
    defName:t.name, dd1:dd1, dd2:dd2, defBonus:defBonus, defScore:defScore,
    win:win, resultText:resultText
  };
  state.pendingDuel=null;
}
function affordGear(g,cost){ return canAfford(g,cost); }
function payGear(g,cost){ payCost(g,cost); }
function eligibleGear(g){
  const owned=g.gear||[];
  return Object.keys(GEAR).filter(function(name){
    const def=GEAR[name];
    if(def.type==='broken') return false;
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
// Whether spending would free up a slot (e.g. it empties out a material
// you're not saving) is only knowable after simulating the spend, so the
// storage check happens against the post-spend inventory, not the
// current one. If it still wouldn't fit even then, dropExtra names one
// more material (chosen by the player) to discard to make room.
function simulateTransmuteSpend(g, spend, dropExtra){
  const simMat={};
  Object.keys(g.mat||{}).forEach(function(k){ simMat[k]=g.mat[k]; });
  Object.keys(spend).forEach(function(k){ simMat[k]=(simMat[k]||0)-spend[k]; if(simMat[k]<=0) delete simMat[k]; });
  if(dropExtra) delete simMat[dropExtra];
  return simMat;
}
function transmuteSpendFor(g, target, picks){
  if(picks){
    const pickTotal=Object.keys(picks).reduce(function(sum,k){ return sum+picks[k]; },0);
    if(pickTotal!==TRANSMUTE_COST) return null;
    const spend={};
    for(const k in picks){
      if((g.mat[k]||0)<picks[k]) return null;
      if(picks[k]>0) spend[k]=picks[k];
    }
    return spend;
  }
  let toSpend=TRANSMUTE_COST;
  const spend={};
  const order=stockKeys(g).sort(function(a,b){ return (a===target?1:0)-(b===target?1:0); });
  for(const k of order){
    if(toSpend<=0) break;
    const take=Math.min(g.mat[k],toSpend);
    toSpend-=take;
    spend[k]=(spend[k]||0)+take;
  }
  return spend;
}
function transmuteAction(target, picks, dropExtra){
  const g=me();
  const total=matTotal(g);
  if(total<TRANSMUTE_COST){ addLog(g.name+' needs '+TRANSMUTE_COST+' materials to transmute, has '+total+'.'); return; }
  const targetFi=floors.findIndex(function(fl){ return fl.name===target; });
  if(targetFi>=0 && state.pools[targetFi]<=0){ addLog('The Tower has no '+target+' left to hand out, its supply is empty.'); return; }
  const spend=transmuteSpendFor(g, target, picks);
  if(!spend){ addLog('Pick exactly '+TRANSMUTE_COST+' materials to transmute.'); return; }
  const simMat=simulateTransmuteSpend(g, spend, dropExtra);
  const willFit = simMat.hasOwnProperty(target) || Object.keys(simMat).length<CAP;
  if(!willFit){ addLog(g.name+' still has no free material slot for '+target+' after spending.'); return; }
  Object.keys(spend).forEach(function(k){ spendMat(g,k,spend[k]); });
  if(dropExtra && (g.mat[dropExtra]||0)>0){
    const amt=g.mat[dropExtra];
    delete g.mat[dropExtra];
    addLog(g.name+' also discards '+amt+' '+dropExtra+' to make room.', 'st');
  }
  addMat(g,target,1); returnMat(target,-1);
  addLog(g.name+' transmutes '+TRANSMUTE_COST+' materials into 1 '+target+'.');
}
function discardAction(mat, qty){
  const g=me();
  const have=g.mat[mat]||0;
  if(!mat || qty<=0 || have<qty){ addLog(g.name+' does not have '+qty+' '+mat+' to discard.'); return; }
  spendMat(g, mat, qty);
  addLog(g.name+' discards '+qty+' '+mat+'.');
}
function ascendAction(){
  const g=me(), f=floors[g.idx];
  if(canAscend(g)){
    g.ap-=1;
    if(f.toll>0){ g.mat[f.name]-=f.toll; if(g.mat[f.name]===0) delete g.mat[f.name]; returnMat(f.name,f.toll); }
    const key=keyFor(g.idx);
    if(key){
      payCost(g,key.cost);
      addLog(g.name+' crafts and spends the '+key.name+'.', 'ev');
    }
    const clearedIdx=g.idx;
    const wasOutbreakActive=state.outbreakActive;
    if(g.idx===floors.length-1){ state.winner=state.current; state.winReason='sovereign'; addLog(g.name+' defeats the Sovereign and wins the game.', 'wn'); }
    else { g.idx+=1; g.progress=0; g.turnsOnFloor=1; addLog(g.name+' ascends to Floor '+(g.idx+1)+'.'); }
    SFX.climb();
    if(clearedIdx>state.clearedThrough){
      state.clearedThrough=clearedIdx;
      resetOutbreakTimer();
      addLog('Floor '+(clearedIdx+1)+' is cleared for the first time, the Outbreak Timer moves up.', 'ev');
    } else if(wasOutbreakActive){
      // An active Outbreak isn't tied to clearing its own floor — any
      // ascend, anywhere, is what actually stops it once it's started.
      resetOutbreakTimer();
      addLog(g.name+"'s ascent drives the Monster off — the Outbreak ends.", 'ev');
    }
  } else {
    const key=keyFor(g.idx);
    addLog(g.name+' needs 1 action point, '+f.need+' progress (has '+g.progress+')'+(f.toll?', '+f.toll+' '+f.name+' toll (has '+(g.mat[f.name]||0)+')':'')+(key?', and the '+key.name+' ('+keyCostText(g.idx)+')':'')+'.');
  }
}
function keyCostText(idx){
  const key=keyFor(idx);
  return key ? costText(key.cost) : '';
}

const PANEL_IDS=['tradePanel','sabotagePanel','transmutePanel','blacksmithPanel','raidPanel','discardPanel'];
function showOnlyPanel(id){
  PANEL_IDS.forEach(function(p){
    const el=document.getElementById(p);
    if(!el) return;
    if(p===id) el.classList.toggle('show');
    else el.classList.remove('show');
  });
}

document.getElementById('btnEndTurn').onclick=function(){
  if(!isMyTurn()) return;
  withState(function(){ me().inactiveSkips=0; endTurnAction(); });
};
document.getElementById('btnHunt').onclick=function(){
  if(!isMyTurn()) return;
  const useBroken=document.getElementById('brokenGearToggle').checked;
  withState(function(){ huntAction(useBroken); });
};
document.getElementById('btnTrain').onclick=function(){ if(!isMyTurn()) return; withState(trainAction); };
document.getElementById('btnRaidToggle').onclick=function(){
  showOnlyPanel('raidPanel'); refreshTargetSelects();
  coachTip('raid', document.getElementById('raidTarget'),
    'Pick a target and steal 1 random material. The opposed roll (yours vs theirs, gear included) decides whether it lands. Feeling bold? Go all-in below to wager a material for a bigger payoff, at the risk of losing it.');
};
document.getElementById('btnCancelRaid').onclick=function(){ document.getElementById('raidPanel').classList.remove('show'); };
document.getElementById('btnSendRaid').onclick=function(){
  if(!isMyTurn()) return;
  const targetIdx=parseInt(document.getElementById('raidTarget').value,10);
  const wagerMat=document.getElementById('raidWagerToggle').checked ? document.getElementById('raidWagerMat').value : null;
  withState(function(){ raidAction(targetIdx, wagerMat); });
  document.getElementById('raidPanel').classList.remove('show');
  document.getElementById('raidWagerToggle').checked=false;
  document.getElementById('raidWagerRow').style.display='none';
};
document.getElementById('duelRollBtn').onclick=function(){
  const side=this.dataset.side;
  if(!side) return;
  withState(function(){ rollDuelSide(side); });
};
let transmutePicks={};
function renderTransmutePicker(){
  const g=me();
  const box=document.getElementById('transmutePicker');
  const keys=stockKeys(g);
  for(const k in transmutePicks){ if(keys.indexOf(k)<0) delete transmutePicks[k]; }
  const total=Object.keys(transmutePicks).reduce(function(sum,k){ return sum+transmutePicks[k]; },0);
  box.innerHTML=keys.map(function(k){
    const have=g.mat[k]||0;
    const picked=transmutePicks[k]||0;
    return '<div class="transRow">'+
      '<span class="transName">'+k+'</span>'+
      '<span class="transHave">have '+have+'</span>'+
      '<div class="stepper">'+
        '<button type="button" class="stepBtn" data-mat="'+k+'" data-d="-1">-</button>'+
        '<span class="stepVal">'+picked+'</span>'+
        '<button type="button" class="stepBtn" data-mat="'+k+'" data-d="1">+</button>'+
      '</div>'+
    '</div>';
  }).join('');
  document.getElementById('transmutePickTotal').textContent=total+'/'+TRANSMUTE_COST;
  box.querySelectorAll('.stepBtn').forEach(function(btn){
    btn.onclick=function(){
      const mat=btn.dataset.mat, d=parseInt(btn.dataset.d,10);
      const g2=me();
      const have=g2.mat[mat]||0;
      const picked=transmutePicks[mat]||0;
      const total2=Object.keys(transmutePicks).reduce(function(sum,k){ return sum+transmutePicks[k]; },0);
      let next=picked+d;
      if(next<0) next=0;
      if(next>have) next=have;
      if(d>0 && total2>=TRANSMUTE_COST) next=picked;
      if(next<=0) delete transmutePicks[mat]; else transmutePicks[mat]=next;
      renderTransmutePicker();
    };
  });
  // Whether this fits is only knowable after simulating the spend — it
  // can free up a slot (spending a material down to 0) that wasn't free
  // a moment ago, so the check runs on the post-spend inventory instead
  // of blocking the whole action up front.
  const target=document.getElementById('transmuteTarget').value;
  const dropRow=document.getElementById('transmuteDropRow');
  const dropSel=document.getElementById('transmuteDropMat');
  const doBtn=document.getElementById('btnDoTransmute');
  if(total!==TRANSMUTE_COST){
    doBtn.disabled=true;
    dropRow.style.display='none';
    return;
  }
  const spend=Object.assign({}, transmutePicks);
  const simMat=simulateTransmuteSpend(g, spend, null);
  const fitsAlready = simMat.hasOwnProperty(target) || Object.keys(simMat).length<CAP;
  if(fitsAlready){
    dropRow.style.display='none';
    doBtn.disabled=false;
  } else {
    dropRow.style.display='';
    const remaining=Object.keys(simMat);
    const prev=dropSel.value;
    dropSel.innerHTML=remaining.map(function(k){ return '<option value="'+k+'">'+k+'</option>'; }).join('');
    if(remaining.indexOf(prev)>=0) dropSel.value=prev;
    doBtn.disabled=!remaining.length;
  }
}
document.getElementById('btnTransmute').onclick=function(){
  showOnlyPanel('transmutePanel');
  refreshTargetSelects();
  transmutePicks={};
  renderTransmutePicker();
  coachTip('transmute', document.getElementById('transmutePicker'),
    'Pick exactly '+TRANSMUTE_COST+' materials, in any mix, to discard for 1 of your choice. Free and repeatable — the reliable way to turn junk you\'re holding into what you actually need, without touching what you\'re saving.');
};
document.getElementById('transmuteTarget').onchange=function(){ renderTransmutePicker(); };
document.getElementById('btnCancelTransmute').onclick=function(){ document.getElementById('transmutePanel').classList.remove('show'); };
document.getElementById('btnDoTransmute').onclick=function(){
  if(!isMyTurn()) return;
  const target=document.getElementById('transmuteTarget').value;
  const picks=Object.assign({}, transmutePicks);
  const dropRow=document.getElementById('transmuteDropRow');
  const dropExtra = dropRow.style.display!=='none' ? document.getElementById('transmuteDropMat').value : null;
  withState(function(){ transmuteAction(target, picks, dropExtra); });
  document.getElementById('transmutePanel').classList.remove('show');
  transmutePicks={};
};
function renderDiscardQtyOptions(){
  const g=me();
  const matSel=document.getElementById('discardMat');
  const qtySel=document.getElementById('discardQty');
  const have=g.mat[matSel.value]||0;
  const prevQty=qtySel.value;
  qtySel.innerHTML='';
  for(let i=1;i<=have;i++){ qtySel.innerHTML+='<option value="'+i+'">'+i+'</option>'; }
  if(prevQty && parseInt(prevQty,10)<=have) qtySel.value=prevQty;
  document.getElementById('discardTitle').textContent = matSel.value ? 'Discard '+matSel.value+'?' : 'Discard?';
}
function openDiscardPanel(preselectMat){
  if(!isMyTurn()) return;
  showOnlyPanel('discardPanel');
  const g=me();
  const keys=stockKeys(g);
  const matSel=document.getElementById('discardMat');
  matSel.innerHTML = keys.map(function(k){ return '<option value="'+k+'">'+k+'</option>'; }).join('') || '<option value="">none</option>';
  if(preselectMat && keys.indexOf(preselectMat)>=0) matSel.value=preselectMat;
  renderDiscardQtyOptions();
  coachTip('discard', matSel,
    'Free, no roll — drop any material you don\'t want, any time it\'s your turn. Useful for clearing a slot before Transmuting for something else, or just because.');
}
document.getElementById('btnDiscardToggle').onclick=function(){ openDiscardPanel(); };
document.getElementById('discardMat').onchange=renderDiscardQtyOptions;
document.getElementById('btnCancelDiscard').onclick=function(){ document.getElementById('discardPanel').classList.remove('show'); };
document.getElementById('btnDoDiscard').onclick=function(){
  if(!isMyTurn()) return;
  const mat=document.getElementById('discardMat').value;
  const qty=parseInt(document.getElementById('discardQty').value,10);
  withState(function(){ discardAction(mat, qty); });
  document.getElementById('discardPanel').classList.remove('show');
};
document.getElementById('btnScavenge').onclick=function(){ if(!isMyTurn()) return; withState(scavengeAction); };
document.getElementById('btnAscend').onclick=function(){ if(!isMyTurn()) return; withState(ascendAction); };
document.getElementById('btnTradeToggle').onclick=function(){
  showOnlyPanel('tradePanel'); renderTradeBoard();
  coachTip('trade', document.getElementById('tradeBoard'),
    'Post what you want, and any guild can pitch what they\'d take for it. Pick whichever offer you like — or none at all.');
};
document.getElementById('btnCancelTrade').onclick=function(){ document.getElementById('tradePanel').classList.remove('show'); };
document.getElementById('btnSabotageToggle').onclick=function(){
  showOnlyPanel('sabotagePanel'); refreshTargetSelects();
  coachTip('sabotage', document.getElementById('sabMat'),
    'Spend 1 material to try to curse a rival: their next Hunt total takes -2, but they get a resist roll first. Go all-in to spend 2 instead, for a -3 curse and an immediate 1 progress hit if it lands.');
};
document.getElementById('btnCancelSabotage').onclick=function(){ document.getElementById('sabotagePanel').classList.remove('show'); };
document.getElementById('btnSendSabotage').onclick=function(){
  if(!isMyTurn()) return;
  const targetIdx=parseInt(document.getElementById('sabTarget').value,10);
  const payMat=document.getElementById('sabMat').value;
  const allIn=document.getElementById('sabWagerToggle').checked;
  withState(function(){ sabotageAction(targetIdx, payMat, allIn); });
  document.getElementById('sabotagePanel').classList.remove('show');
  document.getElementById('sabWagerToggle').checked=false;
};

document.getElementById('btnBlacksmithToggle').onclick=function(){
  showOnlyPanel('blacksmithPanel');
  renderBlacksmithShop();
  const firstItem=document.querySelector('#blacksmithGrid .shopItem');
  coachTip('blacksmith', firstItem,
    'Everything craftable is shown here, even what you can\'t afford yet &mdash; greyed-out items tell you exactly why. Crafting is free, it just costs materials.');
};
document.getElementById('btnCancelBlacksmith').onclick=function(){ document.getElementById('blacksmithPanel').classList.remove('show'); };

function gearBlockReason(g,name){
  const def=GEAR[name];
  const owned=g.gear||[];
  if(owned.includes(name)) return 'Owned';
  if(def.requires && !owned.includes(def.requires)) return 'Requires '+def.requires;
  if(def.type==='accessory' && owned.some(function(o){ return GEAR[o]&&GEAR[o].type==='accessory'; })) return 'Accessory slot full';
  if(!def.requires && owned.length>=GEAR_SLOTS) return 'No item slot open';
  if(def.line){
    const upName=Object.keys(GEAR).find(function(n){ return GEAR[n].line===def.line && GEAR[n].tier===2; });
    if(upName && owned.includes(upName)) return 'Already upgraded';
  }
  if(!affordGear(g,def.cost)) return "Can't afford";
  return null;
}
function renderBlacksmithShop(){
  // Shown relative to the viewer's own guild (not whoever's turn it is)
  // so checking recipes off-turn reflects your own stock, not theirs.
  const g=state.guilds[myActiveIdx()];
  const myTurn=isMyTurn();
  const grid=document.getElementById('blacksmithGrid');
  const items=Object.keys(GEAR).filter(function(n){ return GEAR[n].type!=='broken'; });
  grid.innerHTML = items.map(function(name){
    const def=GEAR[name];
    const reason=gearBlockReason(g,name);
    const blockText = !myTurn ? 'Not your turn' : reason;
    const costChips=Object.keys(def.cost).map(function(m){
      const short=(g.mat[m]||0)<def.cost[m];
      return '<span class="costPill'+(short?' short':'')+'">'+def.cost[m]+' '+m+'</span>';
    }).join('');
    return '<div class="shopItem'+(blockText?' locked':'')+'">'+
      '<div class="shopIcon">'+gearIcon(name)+'</div>'+
      '<div class="shopName">'+name+'</div>'+
      '<div class="shopCost">'+(costChips||'<span class="costPill">free</span>')+'</div>'+
      '<div class="shopDesc">'+def.desc+'</div>'+
      (blockText
        ? '<div class="shopLock">'+blockText+'</div>'
        : '<button class="act shopCraft" type="button" data-item="'+name+'">Craft</button>')+
    '</div>';
  }).join('');
  grid.querySelectorAll('.shopCraft').forEach(function(btn){
    btn.onclick=function(){
      if(!isMyTurn()) return;
      const item=btn.dataset.item;
      withState(function(){ craftAction(item); });
    };
  });
}

function isBotDriver(){ return LOCAL_MODE || myGuildIndex===0; }

const INACTIVITY_MS = 60*1000;
function maybeSkipInactivePlayer(){
  if(LOCAL_MODE || myGuildIndex!==0) return;
  if(!state || (state.winner!==null && state.winner!==undefined)) return;
  const sr=state.seatingRoll;
  const pd=state.pendingDuel;
  const stuckSeating = sr && !sr.done && sr.startedAt && Date.now()-sr.startedAt>=INACTIVITY_MS;
  const stuckDuel = pd && pd.createdAt && Date.now()-pd.createdAt>=INACTIVITY_MS;
  const stuckTurn = (!sr || sr.done) && !pd && state.turnStartedAt && Date.now()-state.turnStartedAt>=INACTIVITY_MS;
  if(!stuckSeating && !stuckDuel && !stuckTurn) return;
  withState(function(){
    if(state.winner!==null && state.winner!==undefined) return;
    // A player stuck not rolling their own seating dice would otherwise
    // freeze the whole room forever — force-roll for anyone who's sat on
    // it too long, same as if they'd clicked it themselves.
    const sr2=state.seatingRoll;
    if(sr2 && !sr2.done && sr2.startedAt && Date.now()-sr2.startedAt>=INACTIVITY_MS){
      state.guilds.forEach(function(g,i){
        if(!g.isBot && (sr2.rolls||{})[i]===undefined) rollMySeat(i);
      });
      return;
    }
    // Same idea for a Raid/Sabotage duel: whichever side hasn't rolled
    // gets force-rolled once the wait drags on, instead of leaving the
    // duel (and every future bot action, which waits on it) stuck forever.
    const pd2=state.pendingDuel;
    if(pd2 && pd2.createdAt && Date.now()-pd2.createdAt>=INACTIVITY_MS){
      if(!pd2.atkRoll) rollDuelSide('atk');
      if(state.pendingDuel && !state.pendingDuel.defRoll) rollDuelSide('def');
      return;
    }
    if(state.pendingDuel) return;
    const cur=me();
    if(!cur || cur.isBot) return;
    if(!state.turnStartedAt || Date.now()-state.turnStartedAt<INACTIVITY_MS) return;
    cur.inactiveSkips=(cur.inactiveSkips||0)+1;
    if(cur.inactiveSkips>=3){
      cur.isBot=true;
      cur.claimedBy='bot';
      cur.inactiveSkips=0;
      addLog(cur.name+' was inactive for 3 turns in a row and is now controlled by AI.', 'st');
    } else {
      addLog(cur.name+' was inactive too long, their turn was skipped.', 'st');
    }
    endTurnAction();
  });
}
setInterval(maybeSkipInactivePlayer, 15000);

function maybeBotContinue(){
  if(isFrozen()) return;
  if(!state || !isBotDriver()) return;
  if(botStepScheduled) return;
  if(state.winner!==null && state.winner!==undefined) return;
  const g=me();
  if(!g || !g.isBot) return;
  botStepScheduled=true;
  setTimeout(function(){ botStepScheduled=false; botStep(); }, BOT_SPEEDS[botSpeedIdx]);
}

function botStep(){
  if(!state) return;
  if(state.winner!==null && state.winner!==undefined) return;
  if(state.pendingDuel) return;
  const g=me();
  if(!g.isBot) return;
  const f=floors[g.idx];
  if(canAscend(g)){ withState(ascendAction); return; }
  const myWant=(state.tradeWants||[]).find(function(w){ return w.guildIdx===state.current; });
  if(myWant && (myWant.offers||[]).length && Math.random()<0.85){
    const pick=myWant.offers[Math.floor(Math.random()*myWant.offers.length)];
    withState(function(){ acceptOffer(myWant.id, pick.id); });
    return;
  }
  if(!myWant && Math.random()<0.45){
    const short=[];
    if((g.mat[f.name]||0)<f.toll) short.push(f.name);
    const key=keyFor(g.idx);
    if(key) for(const m in key.cost){ if((g.mat[m]||0)<key.cost[m]) short.push(m); }
    const wantMat=short.length ? short[0] : floors[Math.floor(Math.random()*floors.length)].name;
    withState(function(){ postWant(wantMat,1); });
    return;
  }
  const pitchable=(state.tradeWants||[]).find(function(w){
    if(w.guildIdx===state.current) return false;
    if((w.offers||[]).some(function(o){ return o.fromGuildIdx===state.current; })) return false;
    const have=g.mat[w.wantMat]||0;
    return have>=w.wantQty && (have-w.wantQty>=1 || have>2);
  });
  if(pitchable && Math.random()<0.6){
    const spare=stockKeys(g).filter(function(k){ return k!==pitchable.wantMat; });
    const returnMat=spare.length ? spare[0] : floors[g.idx].name;
    withState(function(){ pitchOffer(pitchable.id, returnMat, 1); });
    return;
  }
  if(g.ap>0 && !canDoAnything(g) && !g.scavenged){ withState(scavengeAction); return; }
  // Transmute and Craft are both free (no AP cost), so they're checked
  // before the AP-exhaustion end-turn fallback below, and Transmute is no
  // longer gated on already being ascend-ready — a bot with spare
  // materials converts toward whatever toll/key material it's short on
  // as soon as it can, instead of only at the last moment.
  if(matTotal(g)>=TRANSMUTE_COST){
    const want=[];
    if((g.mat[f.name]||0)<f.toll) want.push(f.name);
    const key=keyFor(g.idx);
    if(key) for(const m in key.cost){ if((g.mat[m]||0)<key.cost[m]) want.push(m); }
    const gettable=want.filter(function(m){ const fi=floors.findIndex(function(fl){return fl.name===m;}); return fi<0 || state.pools[fi]>0; });
    if(gettable.length && canAdd(g,gettable[0])){ withState(function(){ transmuteAction(gettable[0]); }); return; }
  }
  if((g.gear||[]).length<GEAR_SLOTS){
    const options=eligibleGear(g);
    const weapons=options.filter(function(name){ return GEAR[name].type==='weapon'; });
    const craftable=weapons.find(function(name){ return affordGear(g,GEAR[name].cost); }) || options.find(function(name){ return affordGear(g,GEAR[name].cost); });
    if(craftable){ withState(function(){ craftAction(craftable); }); return; }
  }
  if(g.ap<=0){ withState(endTurnAction); return; }
  if((g.mat[f.name]||0)>=2 && Math.random()<0.5){ withState(trainAction); return; }
  if(Math.random()<0.15 && others().length){
    const viable=others().filter(function(o){ return stockKeys(o.g).length; });
    const pool=viable.length?viable:others();
    const pick=pool[Math.floor(Math.random()*pool.length)];
    const spareKeys=stockKeys(g);
    const wagerMat = spareKeys.length>=2 && Math.random()<0.35 ? spareKeys[Math.floor(Math.random()*spareKeys.length)] : null;
    withState(function(){ raidAction(pick.i, wagerMat); });
    return;
  }
  if(Math.random()<0.1 && others().length && stockKeys(g).length){
    const targets=others().filter(function(o){ return !o.g.hexCurse; });
    if(targets.length){
      const pick=targets[Math.floor(Math.random()*targets.length)];
      const keys=stockKeys(g);
      const allIn=keys.length>=2 && (g.mat[keys[0]]||0)>=2 && Math.random()<0.3;
      const payMat=keys.find(function(k){ return (g.mat[k]||0)>=(allIn?2:1); });
      if(payMat){
        withState(function(){ sabotageAction(pick.i, payMat, allIn); });
        return;
      }
    }
  }
  withState(huntAction);
}
