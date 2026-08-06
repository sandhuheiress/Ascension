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
const CAP=4, CAMP_LIMIT=4, GEAR_SLOTS=3, TRANSMUTE_COST=3, LOOT_REVEAL_MS=4500;
// Kasaka Fang alone is asked for by Basic Bow, Shield, and two different Floor Keys
// (including the one that wins the game), so a flat pool starves fast with more
// guilds drawing on it. Scale supply with the table instead of fixing it at 2p tuning.
function poolCapFor(n){ return 5*n; }
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
  // never crafted, only ever a lucky Loot Card draw (section 12)
  'Broken Gear':    { type:'broken', cost:{}, desc:'Single use: +2 to one hunt, then it breaks.' }
};
const GEAR_ICON={ 'Basic Bow':'\u{1F3F9}', 'Upgraded Bow':'\u{1F3F9}✨', 'Basic Sword':'⚔️', 'Upgraded Sword':'\u{1F5E1}️', 'Shield':'\u{1F6E1}️', 'Lucky Coin':'\u{1F340}', 'Compass':'\u{1F9ED}', 'Ironclad Ward':'\u{1F6E1}️✨', 'Broken Gear':'\u{1FA93}' };
// art/icons is full-color art (not the black line-work the rest of art/ uses),
// so it skips the invert filter via the existing .ink modifier. Only 5 of the
// 9 gear pieces have custom art so far — anything missing here just falls
// back to its emoji, same as before.
const GEAR_ART={ 'Basic Bow':'icon_basic_bow', 'Basic Sword':'icon_basic_sword', 'Compass':'icon_compass', 'Lucky Coin':'icon_lucky_coin', 'Shield':'icon_shield' };
function gearIcon(name){
  const file=GEAR_ART[name];
  if(!file) return '<span class="ic">'+(GEAR_ICON[name]||'&#x1F392;')+'</span>';
  return '<span class="ic art ink" style="--art:'+art('icons',file)+'"></span>';
}
// a material is worth its floor, so the tiebreaker can price a mat at the end (section 17)
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
  {label:'Stormfront', apply:function(g){ g.hexCurse=true; return 'A Stormfront rolls over the Tower: '+g.name+"'s next Hunt total takes -1."; }}
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
  outbreak: function(){ tone(110,0.5,'sawtooth',0.13); tone(104,0.6,'sawtooth',0.11,0.12); },
  // a neutral confirm blip for actions that don't already have their own
  // distinct sound (Train, Craft, Transmute, Sabotage, Scavenge, Trade) —
  // every button press should give some audible feedback, not just Hunt
  click: function(){ tone(440,0.05,'sine',0.09); tone(660,0.06,'sine',0.07,0.045); },
  // a soft ping for the activity toast queue — plays whenever a queued
  // Tower Event or Hunt result actually appears, not when it happened, so
  // the sound lines up with what the player is looking at right now
  notify: function(){ tone(660,0.06,'sine',0.08); tone(990,0.09,'sine',0.06,0.05); }
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

// AI turns default to a readable pace, but that can feel painfully slow to a
// spectator or too fast to actually follow — this cycles through a few fixed
// delays between bot actions instead of picking one speed for everyone
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
// informational only, no consequence: just shows how long the current turn has run
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
// nothing (bot turns, your own actions) moves while a choice is pending or the
// game is explicitly paused, so answering the tutorial prompt is never a race
function isFrozen(){
  return gamePaused || !tutorialChoiceMade || document.getElementById('seatingRollOverlay').classList.contains('show');
}
function showGame(){
  screens().forEach(function(s){ document.getElementById(s).style.display='none'; });
  document.getElementById('game').style.display='flex';
  document.body.classList.add('in-game');
  // pausing your own device is fine solo, but it would freeze the game for
  // everyone else in an online room, so it's only offered against AI
  document.getElementById('btnPause').style.display = LOCAL_MODE ? '' : 'none';
  document.getElementById('btnSpeed').style.display = LOCAL_MODE ? '' : 'none';
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

// who goes first is now a real choice the table makes together: the overlay
// waits at a "Roll" button rather than the roll happening invisibly and just
// being revealed. Gated by the roll's own id so a synced online client only
// plays the animation once per actual roll, and by tutorialChoiceMade so it
// never stacks on top of the first-ever-game tutorial prompt
let seatingRollAckedId=null;
function performSeatingRoll(){ rollForFirstPlayer(state); }
let seatingRollSoundedId=null;
function renderSeatingRollOverlay(){
  const overlay=document.getElementById('seatingRollOverlay');
  if(!state || !state.started || !tutorialChoiceMade){ overlay.classList.remove('show'); return; }
  const sr=state.seatingRoll;
  if(sr && sr.id===seatingRollAckedId){ overlay.classList.remove('show'); return; }
  overlay.classList.add('show');
  const diceBox=document.getElementById('seatingRollDice');
  const list=document.getElementById('seatingRollList');
  const winnerEl=document.getElementById('seatingRollWinner');
  const action=document.getElementById('seatingRollAction');
  if(!sr){
    document.getElementById('seatingRollHeading').textContent='Who goes first?';
    document.getElementById('seatingRollDesc').textContent="Everyone rolls 2d6 — highest total takes the first turn.";
    document.getElementById('seatingRollDesc').style.display='';
    diceBox.style.display='flex';
    diceBox.innerHTML=diceFace(1,'idle')+diceFace(1,'idle');
    list.innerHTML='';
    winnerEl.textContent='';
    action.innerHTML='<button class="glow-btn" id="btnRollSeating">Roll for first player</button>';
    document.getElementById('btnRollSeating').onclick=function(){ SFX.roll(); withState(performSeatingRoll); };
    return;
  }
  diceBox.style.display='none';
  document.getElementById('seatingRollHeading').textContent='Rolling for first player…';
  document.getElementById('seatingRollDesc').style.display='none';
  list.innerHTML = sr.results.map(function(r,i){
    return '<div class="srRow" style="animation-delay:'+(i*0.22)+'s;">'+
      '<span class="srDot" style="background:'+r.color+'"></span><span class="srName">'+r.name+'</span><span class="srVal">'+r.roll+'</span></div>';
  }).join('');
  winnerEl.textContent=sr.results[sr.winnerIdx].name+' goes first!';
  const revealDelay=sr.results.length*0.22+0.15;
  winnerEl.style.animationDelay=revealDelay+'s';
  if(sr.id!==seatingRollSoundedId){
    seatingRollSoundedId=sr.id;
    setTimeout(SFX.climb, revealDelay*1000);
  }
  action.innerHTML='<button class="glow-btn" id="btnSeatingRollGo">Start climbing</button>';
  document.getElementById('btnSeatingRollGo').onclick=function(){
    seatingRollAckedId=sr.id;
    render();
  };
}

function setPaused(p){
  gamePaused=p;
  document.getElementById('pausedBanner').classList.toggle('show', p);
  document.getElementById('btnPause').textContent = p ? '▶️' : '⏸️';
  document.getElementById('btnPause').title = p ? 'Resume' : 'Pause';
  if(state) render();
}
document.getElementById('btnPause').onclick=function(){ setPaused(!gamePaused); };
document.getElementById('btnResume').onclick=function(){ setPaused(false); };

document.getElementById('logToggle').onclick=function(){ document.getElementById('logPanel').classList.toggle('collapsed'); };

// contextual coach marks: a small callout anchored to whatever the player is
// about to try, shown once ever per id, only if the tutorial was opted into.
// Deliberately not a forced sequence, just tips as things become relevant.
// tips queue instead of stacking, so a burst of newly-relevant mechanics
// (e.g. several buttons unlocking on the same render) don't pile on screen
let activeTip=false;
const tipQueue=[];
function coachTip(id, targetEl, html){
  if(!tutorialOn || seenTips.has(id) || !targetEl) return;
  seenTips.add(id);
  tipQueue.push({targetEl:targetEl, html:html});
  if(!activeTip) showNextTip();
}
function showNextTip(){
  const next=tipQueue.shift();
  if(!next){ activeTip=false; return; }
  if(!next.targetEl.offsetParent){ showNextTip(); return; } // target hidden now, skip it
  activeTip=true;
  const tip=document.createElement('div');
  tip.className='coachTip glass';
  tip.innerHTML='<div class="coachTipBody">'+next.html+'</div><button class="coachTipClose" type="button">Got it</button>';
  document.body.appendChild(tip);
  const rect=next.targetEl.getBoundingClientRect();
  const tw=tip.offsetWidth||260, th=tip.offsetHeight||80;
  let top=rect.bottom+10, left=rect.left+rect.width/2-tw/2;
  if(top+th>window.innerHeight-10){ top=Math.max(10,rect.top-th-10); }
  left=Math.max(10, Math.min(left, window.innerWidth-tw-10));
  tip.style.top=top+'px'; tip.style.left=left+'px';
  const closeFn=function(){ if(tip.parentNode) tip.remove(); showNextTip(); };
  tip.querySelector('.coachTipClose').onclick=closeFn;
  setTimeout(closeFn, 11000);
}

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
  document.getElementById('identityHeading').textContent='Name your guild';
  document.getElementById('identityDesc').textContent='Pick a name and a color for your guild.';
  document.getElementById('identityName').value='';
  document.getElementById('identityErr').textContent='';
  identityColorIdx=0;
  Array.from(colorGrid.children).forEach(function(c,i){c.classList.toggle('sel', i===0);});
  showScreen('screenIdentity');
}
// local pass-and-play walks the same identity screen once per human seat: seat 0
// (this device's owner) first, then any seat marked "Friend" in turn, so every
// human at the table gets to pick their own name and color before play starts
let localSetupQueue=[]; // remaining seat indices still needing a name+color
let localSetupResults=[]; // {seat, name, color} collected so far
function openLocalIdentityStep(){
  const seat=localSetupQueue[0];
  document.getElementById('identityHeading').textContent = seat===0 ? 'Name your guild' : 'Pass the device — Seat '+String.fromCharCode(65+seat);
  document.getElementById('identityDesc').textContent = seat===0 ? 'Pick a name and a color for your guild.' : 'Hand the device to that friend, then have them pick a name and color.';
  document.getElementById('identityName').value='';
  document.getElementById('identityErr').textContent='';
  identityColorIdx=0;
  Array.from(colorGrid.children).forEach(function(c,i){c.classList.toggle('sel', i===0);});
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
    state.turnStartedAt=Date.now();
    state.log=[{t:(friendCount? 'Local pass-and-play game started.' : 'Practice game started.'), cls:''}];
    document.getElementById('roomTag').textContent = friendCount ? 'Local pass-and-play' : 'Local practice game';
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
let localSeatFriend=[false,false,false]; // index 1..3, seat 0 is always you
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
function freshGuild(i){ return { name:'Guild '+String.fromCharCode(65+i), color:PALETTE[i], idx:0, progress:0, ap:2, mat:{}, gear:[], turnsOnFloor:1, eventCurse:false, hexCurse:false, hexCurseHeavy:false, claimedBy:null, isBot:false }; }
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
    outbreakTimer: floors[0].need+3
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
  s.turnStartedAt=Date.now();
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
// same guilds (names, colors, human/AI seats), a fresh climb — lets a local
// table play another round without walking back through setup each time
function restartLocalGame(){
  if(!LOCAL_MODE || !state) return;
  const seats=state.guilds.map(function(g){ return {name:g.name, color:g.color, isBot:g.isBot, claimedBy:g.claimedBy}; });
  state=freshState(seats.length);
  state.guilds.forEach(function(g,i){
    g.name=seats[i].name; g.color=seats[i].color; g.isBot=seats[i].isBot; g.claimedBy=seats[i].claimedBy;
  });
  state.started=true;
  state.turnStartedAt=Date.now();
  lastHumanSeatLocal=null;
  seatingRollAckedId=null;
  state.log=[{t:'New expedition, same guilds.', cls:''}];
  render();
}
document.getElementById('btnLeaveLobby').onclick=leaveOnline;
document.getElementById('btnLeaveGame').onclick=function(){
  if(confirm('Leave this game and return to the home screen?')) leaveGame();
};
document.getElementById('btnEndGame').onclick=function(){
  if(!state || (state.winner!==null && state.winner!==undefined)) return;
  if(confirm("Call the game now? Standings are ranked by floor reached, then progress, then materials/gear on hand — this ends it for everyone.")) withState(concludeGame);
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
function isMyTurn(){
  if(LOCAL_MODE) return !state.guilds[state.current].isBot;
  return myGuildIndex===state.current;
}
// which seat "this device" is currently acting as: in an online room that's your
// fixed claimed slot; in a local pass-and-play game it's whichever human seat is
// active, and it holds onto the last human seat through any bot turns in between
// so a hotseat player's placemat doesn't blank out and flash back on
function myActiveIdx(){
  if(!LOCAL_MODE) return myGuildIndex;
  if(!state.guilds[state.current].isBot) lastHumanSeatLocal=state.current;
  // nobody human has taken a turn yet this game (a bot won the seating roll) —
  // fall back to the first human seat so the placemat is visible from turn 1
  if(lastHumanSeatLocal===null || lastHumanSeatLocal===undefined || !state.guilds[lastHumanSeatLocal] || state.guilds[lastHumanSeatLocal].isBot){
    const firstHuman=state.guilds.findIndex(function(g){ return !g.isBot; });
    if(firstHuman>=0) lastHumanSeatLocal=firstHuman;
  }
  return lastHumanSeatLocal;
}
function others(){ return state.guilds.map(function(g,i){return {g:g,i:i};}).filter(function(o){ return o.i!==state.current; }); }
function trailing(){ const min=Math.min.apply(null, state.guilds.map(function(g){return g.idx;})); return me().idx===min && state.guilds.some(function(g){return g.idx>min;}); }
function addLog(t, cls){ state.log = state.log||[]; state.log.unshift({t:t, cls:cls||''}); if(state.log.length>50) state.log=state.log.slice(0,50); }
function canAdd(g,name){ const mat=g.mat||{}; return mat.hasOwnProperty(name) || Object.keys(mat).length<CAP; }
function addMat(g,name,qty){ if(!canAdd(g,name)) return false; g.mat=g.mat||{}; g.mat[name]=(g.mat[name]||0)+qty; return true; }
function stockKeys(g){ const mat=g.mat||{}; return Object.keys(mat).filter(function(k){return mat[k]>0;}); }
function matTotal(g){ let t=0; for(const k in (g.mat||{})) t+=g.mat[k]; return t; }
function returnMat(name,qty){
  const fi=floors.findIndex(function(fl){ return fl.name===name; });
  if(fi<0) return;
  const cap=state.poolCap||poolCapFor(state.numPlayers||2);
  state.pools[fi]=Math.max(0,Math.min(cap,state.pools[fi]+qty));   // a negative qty draws from the pool
}
function spendMat(g,name,qty){ g.mat[name]-=qty; if(g.mat[name]<=0) delete g.mat[name]; returnMat(name,qty); }

// section 3: each Guild rolls, the highest total goes first. The rolls are
// also kept as structured data (not just the log line) so every device can
// play back a proper reveal instead of the game just starting mid-turn
function rollForFirstPlayer(s){
  let best=-1, first=0;
  const results=s.guilds.map(function(g,i){
    const r=2+Math.floor(Math.random()*6)+Math.floor(Math.random()*6);
    if(r>best){ best=r; first=i; }
    return {name:g.name, color:g.color, roll:r};
  });
  s.current=first; s.round=1; s.turnStartedAt=Date.now();
  s.seatingRoll={ id:'sr'+Date.now()+Math.floor(Math.random()*10000), results:results, winnerIdx:first };
  s.log.unshift({t:'Seating roll: '+results.map(function(r){return r.name+' '+r.roll;}).join(', ')+'. '+s.guilds[first].name+' goes first.', cls:''});
}

// shared "can this guild pay this material cost" check, used for gear, Floor Keys, and Wards
function canAfford(g,cost){ return Object.keys(cost).every(function(m){ return (g.mat[m]||0)>=cost[m]; }); }
function payCost(g,cost){ Object.keys(cost).forEach(function(m){ spendMat(g,m,cost[m]); }); }
function costText(cost){ return Object.keys(cost).map(function(m){ return cost[m]+' '+m; }).join(' + '); }

// section 9: leaving floors 3, 5 and 6 also costs a Floor Key, crafted and spent on the spot
function keyFor(idx){ return KEYS[idx]||null; }
function canPayKey(g,idx){
  const k=keyFor(idx);
  return !k || canAfford(g,k.cost);
}
function canAscend(g){
  const f=floors[g.idx];
  return g.ap>0 && g.progress>=f.need && (g.mat[f.name]||0)>=f.toll && canPayKey(g,g.idx);
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
function steal(from,to){ const keys=stockKeys(from); if(!keys.length) return null; const p=keys[Math.floor(Math.random()*keys.length)]; from.mat[p]-=1; if(from.mat[p]===0) delete from.mat[p]; if(addMat(to,p,1)) return p; addMat(from,p,1); return null; }
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
  renderSeatingRollOverlay();
  const pool=state.pools[me().idx];
  const f=floors[me().idx];

  const arena=document.getElementById('arena');
  (function(){
    const active=me();
    const activeIdx=state.current;
    const activeGf=floors[active.idx];
    const keys=stockKeys(active);
    const activeYou = LOCAL_MODE ? !active.isBot : active.claimedBy===deviceId;
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
      const you = g.claimedBy===deviceId; // in LOCAL_MODE a rival, by definition, isn't the seat currently at the device
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
  const g0=me(), hasAP = canAct && g0.ap>0;
  const dis={
    btnHunt: !hasAP,
    btnTrain: !hasAP || (g0.mat[f.name]||0)<2,
    btnRaidToggle: !hasAP,
    btnSabotageToggle: !hasAP || !stockKeys(g0).length,
    btnTradeToggle: !canAct,
    btnBlacksmithToggle: !canAct,
    btnTransmute: !canAct || matTotal(g0)<TRANSMUTE_COST,
    btnAscend: !canAct || !canAscend(g0),
    btnScavenge: !hasAP || g0.scavenged || canDoAnything(g0)
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
  // g0 is whoever's turn it currently is, not necessarily the human's own guild —
  // these are all about the player's own state, so only check them on canAct
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

  document.getElementById('log').innerHTML = (state.log||[]).map(function(l){return '<div class="'+(l.cls||'')+'">'+l.t+'</div>';}).join('');

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
  if(document.getElementById('blacksmithPanel').classList.contains('show')) renderBlacksmithShop();
  maybeBotContinue();
}

function renderOutbreakBadge(){
  const el=document.getElementById('outbreakBadge');
  if(!el) return;
  if(state.outbreakFloor===undefined || state.outbreakFloor===null){ el.innerHTML=''; return; }
  const fl=floors[state.outbreakFloor];
  const t=state.outbreakTimer;
  const maxT=fl.need+3;
  const pct=Math.max(0, Math.min(1, t/maxT));
  el.classList.toggle('warn', t<=2);
  el.innerHTML =
    '<div class="obLabel">Outbreak Timer<b>Floor '+(state.outbreakFloor+1)+', '+fl.name+'</b></div>'+
    '<div class="obDial" style="--pct:'+pct+'"><div class="obCount">'+Math.max(0,t)+'</div></div>';
  if(t<=2) coachTip('outbreak', el,
    'When this hits 0, the Monster attacks: whoever\'s furthest ahead loses progress and a material, everyone else loses one or the other. Clearing '+fl.name+' resets it.');
}

// A single "last event" / "last hunt" slot gets clobbered when things happen
// back-to-back (bots pace fast, or a human chains two Hunts) — whatever was
// there gets overwritten before anyone reads it. This queues every distinct
// Tower Event and Hunt result instead, so each gets its own full turn in the
// toast, in order, none of them silently skipped.
const ACTIVITY_TOAST_MS=3800;
const seenEventIds={}, seenHuntSeqs={};
// each toast is its own element in the stack, so a new one pops in at the
// top and pushes the rest down instead of replacing whatever's still up
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
  // a plain miss is the most common roll outcome — no toast for those, only
  // for the outcomes actually worth interrupting to look at
  const h=state.lastHunt;
  if(h && h.seq!==undefined && !seenHuntSeqs[h.seq]){
    seenHuntSeqs[h.seq]=true;
    if(h.snake || h.crit){
      const resultText = h.snake
        ? (h.stolenFrom ? (h.guildName+' steals from '+h.stolenFrom+'!') : h.shielded ? (h.guildName+"'s Shield absorbs the natural 2.") : (h.guildName+' loses 1 banked progress.'))
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
  // your own supplies, always visible on your device, not just on your turn —
  // you need to reference what you're holding while waiting just as much as
  // when it's actually your move
  const show = !!g && !g.isBot && (state.winner===null || state.winner===undefined);
  wrap.classList.toggle('show', show);
  if(!show) return;
  const keys=stockKeys(g);
  const gear=g.gear||[];

  const matChips=keys.map(function(k){
    const fi=floors.findIndex(function(fl){return fl.name===k;});
    const tint=fi>=0?FLOOR_TINT[fi]:'var(--border-glow)';
    const ic=fi>=0
      ? '<span class="ic art" style="--art:'+art('mat',fi+1)+'; --tint:'+tint+'"></span>'
      : '<span class="ic">&#x1F4E6;</span>';
    const fresh=(g.mat[k]||0)>(prevMats[k]||0);   // a token you just gained drops in
    return '<div class="matCard'+(fresh?' fresh':'')+'" style="--tint:'+tint+'"><span class="mcQty">x'+g.mat[k]+'</span>'+ic+'<span class="mcName">'+k+'</span></div>';
  });
  Object.keys(prevMats).forEach(function(k){ delete prevMats[k]; });
  keys.forEach(function(k){ prevMats[k]=g.mat[k]; });

  const gearChips=gear.map(function(name){
    const fresh=prevGear.indexOf(name)<0;
    return '<div class="matCard gear'+(fresh?' fresh':'')+'" style="--tint:var(--violet)">'+gearIcon(name)+'<span class="mcName">'+name+'</span></div>';
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
  const resultText = h.snake ? (h.stolenFrom ? (h.guildName+' steals from '+h.stolenFrom+'!') : h.shielded ? (h.guildName+"'s Shield absorbs the natural 2.") : (h.guildName+' loses 1 banked progress.'))
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
    (showLoot ? '<div class="lootRevealRow">'+h.loot.map(lootCard).join('')+'</div>' : '');
  
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
      coachTip('naturalTwo', box, h.stolenFrom
        ? 'That\'s a natural 2: instead of a flat penalty, it raids whoever shares your floor. Standing alone has upsides.'
        : 'That\'s a natural 2 &mdash; normally it costs banked progress, punishing whoever\'s on your floor instead. No one was here this time.');
    }
  }
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

// the Trade panel is a live board: your own want (or the form to post one),
// then every other guild's open want with a way to pitch against it
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

// picking a card doesn't clear the whole choice — you can keep clicking to
// claim more than one if you have room, or leave the rest behind on purpose
function renderGearSwap(){
  const banner=document.getElementById('gearSwapBanner');
  const ps=state.pendingGearSwap;
  if(ps && ps.guildIdx===myActiveIdx() && !state.guilds[ps.guildIdx].isBot){
    banner.classList.add('show');
    const optsHtml=ps.current.map(function(name){
      return '<button class="gsOption" type="button" data-name="'+name+'">'+gearIcon(name)+' Drop '+name+'</button>';
    }).join('');
    banner.innerHTML = '<div class="lcTitle">Gear full</div><div class="lcSub">Keep both current pieces and leave the new Broken Gear, or drop one to make room.</div>'+
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
      return '<button class="lcOption" type="button" data-i="'+i+'">'+lootCard(preview)+'</button>';
    }).join('');
    banner.innerHTML = '<div class="lcTitle">Extra loot — keep which one'+(pl.options.length>1?'s':'')+'?</div><div class="lcOptions">'+optionsHtml+'</div>'+
      (pl.options.length>1 ? '<div class="btnRow" style="margin-top:10px;"><button class="ghost-btn" id="btnSkipLoot">Leave the rest</button></div>' : '');
    banner.querySelectorAll('.lcOption').forEach(function(btn){
      btn.onclick=function(){
        const i=parseInt(btn.dataset.i,10);
        withState(function(){ claimLoot(i); });
      };
    });
    const skipBtn=document.getElementById('btnSkipLoot');
    if(skipBtn) skipBtn.onclick=function(){ withState(function(){ dismissPendingLoot(); }); };
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

// gear slots full when Broken Gear drops: offer a swap instead of just wasting
// the new item, since bumping an existing piece can be the right call
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

// Trade is a want-board, not a one-to-one proposal: post what you need,
// anyone can pitch what they'd take for it, you pick whichever offer (if
// any) you like. Only one active want per guild; a new post replaces it.
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
// the poster rejecting one offer on their own want, without accepting it or
// cancelling the whole want — the offering guild is free to pitch again
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
    // a broken event must never be able to freeze the whole turn cycle
    try{
      const text=ev.apply(g, state.pools);
      addLog('Tower Event, '+ev.label+': '+text, 'ev');
      // the log line alone is easy to miss mid-turn, so this also drives a
      // toast (renderEventToast) that pops over the board for a few seconds
      state.lastEvent={ id:'ev'+Date.now()+Math.floor(Math.random()*10000), guildName:g.name, label:ev.label, text:text };
    }
    catch(e){ console.error('Tower Event "'+ev.label+'" failed:', e); }
  }
}
function nextIndex(){ return (state.current+1)%state.guilds.length; }

// ---- Monster Outbreak (section 13 of Rules of Play) ----
function resetOutbreakTimer(){
  state.outbreakFloor = Math.min(state.clearedThrough+1, floors.length-1);
  state.outbreakTimer = floors[state.outbreakFloor].need + 3;
}
// softer than a flat hit: the leader gives up ground on two fronts at once,
// everyone else only loses whichever they can spare least
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
  resetOutbreakTimer();
}

// ---- core actions (shared by human buttons and the AI bot) ----
// there's no fixed round limit — the game can be called at any point, ranked
// by floor reached, then progress on that floor, then materials/gear value
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
  // fixed seating order, no rotation: rotating the round's starting seat was
  // handing the same guild two turns in a row at every round boundary
  const wrapped = state.current===n-1;
  state.current=(state.current+1)%n;
  if(wrapped) state.round=(state.round||1)+1;
  state.turnCount=(state.turnCount||1)+1;
  state.turnStartedAt=Date.now();
  state.lastHunt=null;
  const g=me();
  g.ap=2; g.hexCurse=false; g.scavenged=false;
  g.turnsOnFloor=(g.turnsOnFloor||0)+1;   // nothing was counting this, so the camp penalty never fired
  checkFloorCamping(g);
  addLog('--- '+g.name+"'s turn begins (round "+state.round+"). ---");
  maybeDrawEvent(g);
  if(wrapped){
    if(state.outbreakTimer===undefined || state.outbreakTimer===null) resetOutbreakTimer();
    state.outbreakTimer-=1;
    if(state.outbreakTimer<=0) triggerOutbreak();
  }
}

// section 5: a successful hunt draws a Loot Card, usually the floor's material
// drawing a card from the shared deck and actually claiming it into a guild's
// storage are separate steps, so a hunt that turns up more than one card can
// offer them all before anything is committed
function rollLootCard(){
  if(!state.loot || !state.loot.length){
    state.loot=LOOT_DECK.slice();
    for(let i=state.loot.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=state.loot[i]; state.loot[i]=state.loot[j]; state.loot[j]=t; }
  }
  return state.loot.pop(); // 'mat' or 'broken'
}
function commitLootCard(g, kind, floorIdx){
  g.gear=g.gear||[];
  if(kind==='broken'){
    if(g.gear.length>=GEAR_SLOTS) return null;
    g.gear.push('Broken Gear');
    return {kind:'broken', name:'Broken Gear', label:'a piece of Broken Gear'};
  }
  const f=floors[floorIdx];
  if(state.pools[floorIdx]<=0 || !addMat(g,f.name,1)) return null;
  state.pools[floorIdx]-=1;
  return {kind:'mat', floor:floorIdx, name:f.name, label:'1 '+f.name};
}
function drawLoot(g){ return commitLootCard(g, rollLootCard(), g.idx); }
// a single card just gets kept (as before); a bot auto-claims everything that
// fits; a human facing 2+ cards gets a picker instead of the game deciding
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
  // more than one card: if there's room to just keep all of them, do that —
  // only ask the player to pick when gear or material slots actually force a choice
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
// would every card in this batch actually fit? all "mat" cards from one hunt
// are the same material (it stacks into a single slot), so the only real
// constraints are: room for that one material kind, and enough open gear
// slots for however many Broken Gear cards are in the batch
function canKeepAllLoot(g, kinds, floorIdx){
  const hasMat=kinds.some(function(k){ return k!=='broken'; });
  if(hasMat && !canAdd(g, floors[floorIdx].name)) return false;
  const brokenCount=kinds.filter(function(k){ return k==='broken'; }).length;
  return brokenCount<=GEAR_SLOTS-(g.gear||[]).length;
}

// section 10: the fallback that keeps a stuck Guild from waiting forever
// "no other option" means no *guaranteed* move is available — Train (if
// affordable), Blacksmith (if any item is affordable), Ascend, Transmute,
// and Trade all count. Hunt and Raid don't, since those are a roll, not a
// sure thing. This only matters while AP remains; at 0 AP there's nothing
// left to spend on Scavenge, so it's simply unavailable
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
  const name = from>=0 ? floors[from].name : floors[g.idx].name;   // otherwise the general supply
  if(!addMat(g,name,1)){ addLog(g.name+' has no free material slot to scavenge into.'); return; }
  if(from>=0) state.pools[from]-=1;
  g.ap-=1;
  g.scavenged=true;
  addLog(g.name+' has no other move and Scavenges 1 '+name+', spending its last action point.', 'ev');
  SFX.click();
}
// useBrokenGear: omit/true to burn it if equipped (bots always do); pass false
// to hold onto it — the player decides per-hunt via the checkbox, it's no
// longer forced onto whatever hunt happens to come next
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
    // splice out a single copy — you can hold more than one, and filter() would
    // have burned all of them at once instead of just the one being used
    const brokenIdx=gear.indexOf('Broken Gear');
    if(brokenIdx>=0) gear.splice(brokenIdx,1);
    g.gear=gear;
  }

  const behind=trailing();
  const curseAmount=g.hexCurse?(g.hexCurseHeavy?2:1):0;
  let total=d1+d2+bowBonus+swordBonus+brokenBonus+(behind?1:0)-curseAmount;
  g.ap-=1;
  state.rollSeq=(state.rollSeq||0)+1;
  const hunt={ seq:state.rollSeq, guildName:g.name, matName:f.name, d1:d1, d2:d2, total:total, dr:f.dr, snake:false, crit:false, success:false, stolenFrom:null, gearNote:gearNote };

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
    // a natural 2 plays like the Catan robber: punish whoever is sharing your floor
    // instead of a blind self-penalty, so it rewards reading the board, not luck
    hunt.snake=true; hunt.shielded=hasShield;
    const here=others().filter(function(o){ return o.g.idx===g.idx && stockKeys(o.g).length; });
    if(here.length){
      const t=here[Math.floor(Math.random()*here.length)].g;
      const s=steal(t,g);
      hunt.stolenFrom=t.name;
      addLog(g.name+' rolls a natural 2 and raids '+t.name+' right off this floor, stealing 1 '+s+'.', 'st');
    } else if(hasShield){
      addLog(g.name+' rolls a natural 2, but the Shield absorbs it, no progress lost.', 'st');
    } else {
      g.progress=Math.max(0,g.progress-1);
      addLog(g.name+' rolls a natural 2 with no rival on this floor to punish, loses 1 banked Ascension Progress.', 'st');
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
  state.lastHunt=hunt;
}
function trainAction(){
  const g=me(), f=floors[g.idx];
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  if((g.mat[f.name]||0)>=2){ spendMat(g,f.name,2); g.progress+=1; g.ap-=1; addLog(g.name+' trains using 2 '+f.name+', guaranteed +1 progress.'); SFX.click(); }
  else addLog(g.name+' needs 2 '+f.name+' in storage to train.');
}
// Raid is a deliberate strike: you pick who and what you're after, and gear
// (weapons, Lucky Coin, Compass) adds a bonus to an opposed 2d6 roll against
// the target's own gear-boosted roll. Broken Gear stays Hunt-only — it's
// governed by the checkbox there, so it doesn't silently burn on a Raid too.
// wagerMat: optional — going all-in stakes 1 material on the outcome. Win,
// and the raid's normal effect lands plus the target is knocked down 1
// progress, with the stake returned untouched. Lose, and the defender
// keeps the stake as their prize for fighting the raid off.
function raidAction(targetIdx, wantDestroy, wagerMat){
  const g=me();
  if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
  const targets=others();
  if(!targets.length) return;
  const t = targetIdx!==undefined && targetIdx!==null && state.guilds[targetIdx]
    ? state.guilds[targetIdx]
    : targets[Math.floor(Math.random()*targets.length)].g;
  const wagering = !!wagerMat && (g.mat[wagerMat]||0)>=1;
  g.ap-=1;
  if((t.gear||[]).includes('Ironclad Ward')){
    t.gear=t.gear.filter(function(x){ return x!=='Ironclad Ward'; });
    addLog(g.name+" raids "+t.name+", but an Ironclad Ward blocks it outright and breaks.", 'st');
    SFX.fail();
    return;
  }
  SFX.roll();
  const ad1=1+Math.floor(Math.random()*6), ad2=1+Math.floor(Math.random()*6);
  const dd1=1+Math.floor(Math.random()*6), dd2=1+Math.floor(Math.random()*6);
  const atkBonus=raidGearBonus(g), defBonus=raidGearBonus(t);
  const atkScore=ad1+ad2+atkBonus, defScore=dd1+dd2+defBonus;
  if(atkScore<=defScore){
    let msg=g.name+' raids '+t.name+' and loses the roll, '+atkScore+' ('+ad1+'+'+ad2+'+'+atkBonus+') vs '+defScore+' ('+dd1+'+'+dd2+'+'+defBonus+'), fought off.';
    if(wagering){
      spendMat(g,wagerMat,1);
      addMat(t,wagerMat,1);
      msg+=' Going all-in cost '+g.name+' its wagered '+wagerMat+' — '+t.name+' keeps it.';
    }
    addLog(msg);
    setTimeout(SFX.fail, 350);
    return;
  }
  setTimeout(SFX.success, 350);
  const allInTag = wagering ? ' All-in pays off: '+t.name+' also loses 1 progress, and '+g.name+' keeps its wager.' : '';
  if(wagering && t.progress>0) t.progress-=1;
  if(wantDestroy){
    const tgear=t.gear||[];
    if(!tgear.length){ addLog(g.name+' raids '+t.name+' ('+atkScore+' vs '+defScore+') hoping to break their gear, but they have none.'+allInTag, 'st'); return; }
    const piece=tgear[Math.floor(Math.random()*tgear.length)];
    t.gear=tgear.filter(function(x){ return x!==piece; });
    addLog(g.name+' raids '+t.name+' ('+atkScore+' vs '+defScore+') and destroys their '+piece+'!'+allInTag, 'st');
    return;
  }
  const s=steal(t,g);
  addLog((s
    ? (g.name+' raids '+t.name+': '+atkScore+' vs '+defScore+', stealing 1 '+s+'.')
    : (g.name+' raids '+t.name+' and wins the roll, '+atkScore+' vs '+defScore+', but they had nothing to take.'))+allInTag, 'st');
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
function affordGear(g,cost){ return canAfford(g,cost); }
function payGear(g,cost){ payCost(g,cost); }
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
  const targetFi=floors.findIndex(function(fl){ return fl.name===target; });
  if(targetFi>=0 && state.pools[targetFi]<=0){ addLog('The Tower has no '+target+' left to hand out, its supply is empty.'); return; }
  let toSpend=TRANSMUTE_COST;
  // spend the other materials first, so asking for more of what you hold still works
  const order=stockKeys(g).sort(function(a,b){ return (a===target?1:0)-(b===target?1:0); });
  for(const k of order){
    if(toSpend<=0) break;
    const take=Math.min(g.mat[k],toSpend);
    toSpend-=take;
    spendMat(g,k,take);
  }
  addMat(g,target,1); returnMat(target,-1);   // the Tower hands one back out of its own supply
  addLog(g.name+' transmutes '+TRANSMUTE_COST+' materials into 1 '+target+'.');
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
    if(g.idx===floors.length-1){ state.winner=state.current; state.winReason='sovereign'; addLog(g.name+' defeats the Sovereign and wins the game.', 'wn'); }
    else { g.idx+=1; g.progress=0; g.turnsOnFloor=1; addLog(g.name+' ascends to Floor '+(g.idx+1)+'.'); }
    SFX.climb();
    if(clearedIdx>state.clearedThrough){ state.clearedThrough=clearedIdx; resetOutbreakTimer(); addLog('Floor '+(clearedIdx+1)+' is cleared for the first time, the Outbreak Timer moves up.', 'ev'); }
  } else {
    const key=keyFor(g.idx);
    addLog(g.name+' needs 1 action point, '+f.need+' progress (has '+g.progress+')'+(f.toll?', '+f.toll+' '+f.name+' toll (has '+(g.mat[f.name]||0)+')':'')+(key?', and the '+key.name+' ('+keyCostText(g.idx)+')':'')+'.');
  }
}
function keyCostText(idx){
  const key=keyFor(idx);
  return key ? costText(key.cost) : '';
}

// every inline action panel, so opening one always closes the rest (they used to
// each hide a different hand-written list, which let two panels show at once)
const PANEL_IDS=['tradePanel','sabotagePanel','transmutePanel','blacksmithPanel','raidPanel'];
function showOnlyPanel(id){
  PANEL_IDS.forEach(function(p){
    const el=document.getElementById(p);
    if(!el) return;
    if(p===id) el.classList.toggle('show');
    else el.classList.remove('show');
  });
}

// ---- button wiring (human only, gated by isMyTurn) ----
document.getElementById('btnEndTurn').onclick=function(){ if(!isMyTurn()) return; withState(endTurnAction); };
document.getElementById('btnHunt').onclick=function(){
  if(!isMyTurn()) return;
  const useBroken=document.getElementById('brokenGearToggle').checked;
  withState(function(){ huntAction(useBroken); });
};
document.getElementById('btnTrain').onclick=function(){ if(!isMyTurn()) return; withState(trainAction); };
document.getElementById('btnRaidToggle').onclick=function(){
  showOnlyPanel('raidPanel'); refreshTargetSelects();
  coachTip('raid', document.getElementById('raidGoal'),
    'Pick your goal before you roll: stealing takes a random material, destroying breaks one piece of their gear. The opposed roll (yours vs theirs, gear included) decides whether it lands. Feeling bold? Go all-in below to wager a material for a bigger payoff, at the risk of losing it.');
};
document.getElementById('btnCancelRaid').onclick=function(){ document.getElementById('raidPanel').classList.remove('show'); };
document.getElementById('btnSendRaid').onclick=function(){
  if(!isMyTurn()) return;
  const targetIdx=parseInt(document.getElementById('raidTarget').value,10);
  const wantDestroy=document.getElementById('raidGoal').value==='destroy';
  const wagerMat=document.getElementById('raidWagerToggle').checked ? document.getElementById('raidWagerMat').value : null;
  withState(function(){ raidAction(targetIdx, wantDestroy, wagerMat); });
  document.getElementById('raidPanel').classList.remove('show');
  document.getElementById('raidWagerToggle').checked=false;
  document.getElementById('raidWagerRow').style.display='none';
};
document.getElementById('btnTransmute').onclick=function(){
  showOnlyPanel('transmutePanel');
  refreshTargetSelects();
  coachTip('transmute', document.getElementById('transmuteTarget'),
    'Discard any '+TRANSMUTE_COST+' materials, in any mix, for 1 of your choice. Free and repeatable — the reliable way to turn junk you\'re holding into what you actually need.');
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
document.getElementById('btnTradeToggle').onclick=function(){
  showOnlyPanel('tradePanel'); renderTradeBoard();
  coachTip('trade', document.getElementById('tradeBoard'),
    'Post what you want, and any guild can pitch what they\'d take for it. Pick whichever offer you like — or none at all.');
};
document.getElementById('btnCancelTrade').onclick=function(){ document.getElementById('tradePanel').classList.remove('show'); };
document.getElementById('btnSabotageToggle').onclick=function(){
  showOnlyPanel('sabotagePanel'); refreshTargetSelects();
  coachTip('sabotage', document.getElementById('sabMat'),
    'Spend 1 material to curse a rival: their next Hunt total takes -1. Cheap, but it still costs an action point to cast. Go all-in to spend 2 instead, for a -2 curse and an immediate 1 progress hit.');
};
document.getElementById('btnCancelSabotage').onclick=function(){ document.getElementById('sabotagePanel').classList.remove('show'); };
document.getElementById('btnSendSabotage').onclick=function(){
  if(!isMyTurn()) return;
  const targetIdx=parseInt(document.getElementById('sabTarget').value,10);
  const payMat=document.getElementById('sabMat').value;
  const allIn=document.getElementById('sabWagerToggle').checked;
  withState(function(){
    const g=me();
    if(g.ap<=0){ addLog('No action points left, end your turn.'); return; }
    const cost=allIn?2:1;
    if(!payMat || (g.mat[payMat]||0)<cost){ addLog(g.name+' does not have '+cost+' '+ (payMat||'material') +' to spend on '+(allIn?'an all-in curse':'a curse')+'.'); return; }
    spendMat(g,payMat,cost);
    g.ap-=1;
    const t=state.guilds[targetIdx];
    t.hexCurse=true;
    if(allIn){
      t.hexCurseHeavy=true;
      if(t.progress>0) t.progress-=1;
      addLog(g.name+' goes all-in, spending 2 '+payMat+' to curse '+t.name+': their next Hunt total takes -2, and they lose 1 progress right now.', 'ev');
    } else {
      addLog(g.name+' spends 1 '+payMat+' to curse '+t.name+': their next Hunt total takes -1.', 'ev');
    }
    SFX.click();
  });
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

// same eligibility rules as eligibleGear(), but explains *why* a locked item is locked
// instead of just hiding it, so the shop reads like a shop, not a shrinking dropdown
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
  const g=me();
  const grid=document.getElementById('blacksmithGrid');
  const items=Object.keys(GEAR).filter(function(n){ return GEAR[n].type!=='broken'; });
  grid.innerHTML = items.map(function(name){
    const def=GEAR[name];
    const reason=gearBlockReason(g,name);
    const costChips=Object.keys(def.cost).map(function(m){
      const short=(g.mat[m]||0)<def.cost[m];
      return '<span class="costPill'+(short?' short':'')+'">'+def.cost[m]+' '+m+'</span>';
    }).join('');
    return '<div class="shopItem'+(reason?' locked':'')+'">'+
      '<div class="shopIcon">'+gearIcon(name)+'</div>'+
      '<div class="shopName">'+name+'</div>'+
      '<div class="shopCost">'+(costChips||'<span class="costPill">free</span>')+'</div>'+
      '<div class="shopDesc">'+def.desc+'</div>'+
      (reason
        ? '<div class="shopLock">'+reason+'</div>'
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

// ---- AI bot driver ----
// In an online room, only the host device (myGuildIndex===0) drives bot turns, so two devices never race to act for the same bot.
function isBotDriver(){ return LOCAL_MODE || myGuildIndex===0; }

// online only: if a human sits idle too long (most likely a dropped connection,
// not just slow thinking) the host device skips their turn so the room isn't
// stuck waiting on someone who may never come back
const INACTIVITY_MS = 2*60*1000;
function maybeSkipInactivePlayer(){
  if(LOCAL_MODE || myGuildIndex!==0) return; // only the online host enforces this
  if(!state || (state.winner!==null && state.winner!==undefined)) return;
  const g=me();
  if(!g || g.isBot) return;
  if(!state.turnStartedAt || Date.now()-state.turnStartedAt<INACTIVITY_MS) return;
  withState(function(){
    if(state.winner!==null && state.winner!==undefined) return;
    const cur=me();
    if(cur.isBot || !state.turnStartedAt || Date.now()-state.turnStartedAt<INACTIVITY_MS) return;
    addLog(cur.name+' was inactive too long, their turn was skipped.', 'st');
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
  const g=me();
  if(!g.isBot) return;
  const f=floors[g.idx];
  if(canAscend(g)){ withState(ascendAction); return; }
  // Trade is free, so bots work the want-board opportunistically rather than
  // competing with their AP economy: accept a good offer on their own want,
  // post a want when they're short something, or pitch spare stock at
  // someone else's want. One action per tick, same as everything else here.
  const myWant=(state.tradeWants||[]).find(function(w){ return w.guildIdx===state.current; });
  if(myWant && (myWant.offers||[]).length && Math.random()<0.6){
    const pick=myWant.offers[Math.floor(Math.random()*myWant.offers.length)];
    withState(function(){ acceptOffer(myWant.id, pick.id); });
    return;
  }
  if(!myWant && Math.random()<0.25){
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
  if(pitchable && Math.random()<0.4){
    const spare=stockKeys(g).filter(function(k){ return k!==pitchable.wantMat; });
    const returnMat=spare.length ? spare[0] : floors[g.idx].name;
    withState(function(){ pitchOffer(pitchable.id, returnMat, 1); });
    return;
  }
  if(g.ap>0 && !canDoAnything(g) && !g.scavenged){ withState(scavengeAction); return; }
  // ready to climb but short a toll or Key material: buy it at the camp
  if(g.progress>=f.need && matTotal(g)>=TRANSMUTE_COST){
    const want=[];
    if((g.mat[f.name]||0)<f.toll) want.push(f.name);
    const key=keyFor(g.idx);
    if(key) for(const m in key.cost){ if((g.mat[m]||0)<key.cost[m]) want.push(m); }
    // don't chase a material the Tower has none left of, or the bot loops forever
    const gettable=want.filter(function(m){ const fi=floors.findIndex(function(fl){return fl.name===m;}); return fi<0 || state.pools[fi]>0; });
    if(gettable.length && canAdd(g,gettable[0])){ withState(function(){ transmuteAction(gettable[0]); }); return; }
  }
  if(g.ap<=0){ withState(endTurnAction); return; }
  if((g.gear||[]).length<2){
    const options=eligibleGear(g).filter(function(name){ return GEAR[name].type==='weapon'; });
    const craftable=options.find(function(name){ return affordGear(g,GEAR[name].cost); });
    if(craftable){ withState(function(){ craftAction(craftable); }); return; }
  }
  if((g.mat[f.name]||0)>=2 && Math.random()<0.5){ withState(trainAction); return; }
  if(Math.random()<0.15 && others().length){
    // prefer a target with something actually worth taking (material or gear)
    const viable=others().filter(function(o){ return stockKeys(o.g).length || (o.g.gear||[]).length; });
    const pool=viable.length?viable:others();
    const pick=pool[Math.floor(Math.random()*pool.length)];
    const wantDestroy=(pick.g.gear||[]).length>=2 || (!stockKeys(pick.g).length && (pick.g.gear||[]).length>0);
    // going all-in risks a real loss, so only do it with stock to spare
    const spareKeys=stockKeys(g);
    const wagerMat = spareKeys.length>=2 && Math.random()<0.35 ? spareKeys[Math.floor(Math.random()*spareKeys.length)] : null;
    withState(function(){ raidAction(pick.i, wantDestroy, wagerMat); });
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
        withState(function(){
          const cost=allIn?2:1;
          spendMat(g,payMat,cost);
          g.ap-=1;
          pick.g.hexCurse=true;
          if(allIn){
            pick.g.hexCurseHeavy=true;
            if(pick.g.progress>0) pick.g.progress-=1;
            addLog(g.name+' goes all-in, spending 2 '+payMat+' to curse '+pick.g.name+': their next Hunt total takes -2, and they lose 1 progress right now.', 'ev');
          } else {
            addLog(g.name+' spends 1 '+payMat+' to curse '+pick.g.name+': their next Hunt total takes -1.', 'ev');
          }
          SFX.click();
        });
        return;
      }
    }
  }
  withState(huntAction);
}
