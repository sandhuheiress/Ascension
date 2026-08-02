import { db, ref, onValue, off, set, get, deviceId } from '../firebase.js';
import { floors, CAP, CAMP_LIMIT, START_POOL, FLOOR_TINT, FLOOR_ICON, GEAR, GEAR_ICON, EVENTS } from '../gameData.js';
import { getMode, getRoomCode, getRoomSlot, getLocalState, saveLocalState, clearRoom, clearLocalState } from '../state.js';
import { mountHowTo } from '../howto.js';

mountHowTo(['btnHowToGame']);

const MODE = getMode(); // 'local' | 'online'
const LOCAL_MODE = MODE==='local';
let roomCode=null, myGuildIndex=null, state=null;
let botStepScheduled=false, botTradeScheduled=false;

if(LOCAL_MODE){
  state=getLocalState();
  if(!state){ window.location.href='index.html'; }
  myGuildIndex=0;
  document.getElementById('roomTag').textContent='Local practice game';
} else {
  roomCode=getRoomCode();
  const slot=roomCode?getRoomSlot(roomCode):null;
  if(!roomCode || slot===null){ window.location.href='index.html'; }
  myGuildIndex=slot;
  document.getElementById('roomTag').innerHTML='Room <b>'+roomCode+'</b>';
}
function roomRef(){ return ref(db, 'rooms/'+roomCode); }

// Firebase Realtime Database silently drops empty objects/arrays (mat:{}, gear:[])
// on write, so a freshly-joined guild's fields can come back undefined after any
// round-trip. Restore them so downstream code can rely on g.mat/g.gear existing.
function normalizeState(s){
  if(!s || !s.guilds) return s;
  s.guilds.forEach(function(g){ g.mat=g.mat||{}; g.gear=g.gear||[]; });
  return s;
}

if(!LOCAL_MODE){
  onValue(roomRef(), function(snap){
    state=normalizeState(snap.val());
    if(!state) return;
    if(!state.started){ window.location.href='lobby.html'; return; }
    render();
  });
} else {
  state=normalizeState(state);
  render();
}

// ---- leave game ----
document.getElementById('btnLeaveGame').onclick=function(){
  if(!confirm('Leave this game and return to the home screen?')) return;
  if(LOCAL_MODE){ clearLocalState(); }
  else { try{ off(roomRef()); }catch(e){} clearRoom(); }
  window.location.href='index.html';
};

// ---- game helpers ----
function me(){ return state.guilds[state.current]; }
function isMyTurn(){ return myGuildIndex===state.current; }
function others(){ return state.guilds.map(function(g,i){return {g:g,i:i};}).filter(function(o){ return o.i!==state.current; }); }
function trailing(){ const min=Math.min.apply(null, state.guilds.map(function(g){return g.idx;})); return me().idx===min && state.guilds.some(function(g){return g.idx>min;}); }
function addLog(t, cls){ state.log = state.log||[]; state.log.unshift({t:t, cls:cls||''}); if(state.log.length>7) state.log=state.log.slice(0,7); }
function canAdd(g,name){ const mat=g.mat||{}; return mat.hasOwnProperty(name) || Object.keys(mat).length<CAP; }
function addMat(g,name,qty){ if(!canAdd(g,name)) return false; g.mat=g.mat||{}; g.mat[name]=(g.mat[name]||0)+qty; return true; }
function stockKeys(g){ const mat=g.mat||{}; return Object.keys(mat).filter(function(k){return mat[k]>0;}); }
function steal(from,to){ const keys=stockKeys(from); if(!keys.length) return null; const p=keys[Math.floor(Math.random()*keys.length)]; from.mat[p]-=1; if(from.mat[p]===0) delete from.mat[p]; return addMat(to,p,1)?p:null; }

async function withState(fn){
  if(LOCAL_MODE){
    fn();
    saveLocalState(state);
    render();
    return;
  }
  state=normalizeState((await get(roomRef())).val());
  fn();
  await set(roomRef(), state);
}

function render(){
  if(!state) return;
  const pool=state.pools[me().idx];
  const f=floors[me().idx];
  document.getElementById('floorTitle').textContent='Floor '+(me().idx+1)+', '+f.name+', DR '+f.dr+'+';
  document.getElementById('floorSub').textContent=(f.toll>0?('Toll to ascend: '+f.toll+' '+f.name):'Final floor, defeat the Sovereign to win')+' &middot; Pool left: '+pool;

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
  ['btnHunt','btnTrain','btnRaid','btnTradeToggle','btnSabotageToggle','btnBlacksmithToggle','btnTransmute','btnAscend'].forEach(function(id){
    document.getElementById(id).disabled = !canAct;
  });
  document.getElementById('btnEndTurn').disabled = !canAct;

  document.getElementById('log').innerHTML = (state.log||[]).map(function(l){return '<div class="'+(l.cls||'')+'">'+l.t+'</div>';}).join('');

  document.getElementById('headerAvatars').innerHTML = state.guilds.map(function(g,i){
    return '<div class="avatarChip'+(i===state.current&&!won?' turn':'')+'" style="background:'+g.color+'" title="'+g.name+'">'+g.name.charAt(0).toUpperCase()+'</div>';
  }).join('');

  document.getElementById('huntSub').textContent = '1 AP, 2d6 vs DR'+f.dr;
  document.getElementById('trainSub').textContent = '1 AP, 2 '+f.name;
  document.getElementById('transmuteSub').textContent = f.tcost+' materials for 1';
  document.getElementById('ascendSub').textContent = f.toll>0 ? ('pay '+f.toll+' '+f.name) : 'defeat the Sovereign';

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
    const ic=fi>=0?FLOOR_ICON[fi]:'&#x1F4E6;';
    return '<div class="matChip"><span class="ic">'+ic+'</span><span>'+k+'</span><span class="qty">x'+g.mat[k]+'</span></div>';
  });
  const gearChips=gear.map(function(name){
    const ic=GEAR_ICON[name]||'&#x1F392;';
    return '<div class="matChip gear"><span class="ic">'+ic+'</span><span>'+name+'</span></div>';
  });

  document.getElementById('placematMats').innerHTML = matChips.length
    ? matChips.join('')
    : '<div class="matChip empty"><span class="ic">&#x1F392;</span><span>None yet, go hunt</span></div>';
  document.getElementById('placematGear').innerHTML = gearChips.length
    ? gearChips.join('')
    : '<div class="matChip empty"><span class="ic">&#x2694;&#xFE0F;</span><span>None crafted yet</span></div>';
}

function renderTower(){
  const list=document.getElementById('towerList');
  const rows=[];
  for(let i=floors.length-1;i>=0;i--){
    const fl=floors[i];
    const here=state.guilds.filter(function(g){return g.idx===i;});
    const hereNow=here.some(function(g){return state.guilds.indexOf(g)===state.current;});
    const tint=FLOOR_TINT[i];

    const pipRows=here.map(function(g){
      const filled=Math.min(g.progress, fl.need);
      let pips='';
      for(let p=0;p<fl.need;p++){
        pips+='<span class="pip'+(p<filled?' filled':'')+'"></span>';
      }
      return '<div class="pipTrack" style="color:'+g.color+'"><span class="pips">'+pips+'</span><span class="pipLabel">'+g.name.charAt(0).toUpperCase()+' '+g.progress+'/'+fl.need+'</span></div>';
    }).join('');

    const poolTotal=START_POOL;
    const poolLeft=state.pools[i];
    let poolPips='';
    for(let p=0;p<poolTotal;p++){
      poolPips+='<span class="pip'+(p<poolLeft?' filled':'')+'"></span>';
    }

    rows.push(
      '<div class="floorRow'+(hereNow?' hereNow':'')+'" style="background:linear-gradient(135deg,'+tint+'16,'+tint+'09); border-color:'+tint+'40;">'+
        '<div class="frTop"><span>Floor '+(i+1)+'</span><span>DR '+fl.dr+'+</span></div>'+
        '<div class="frName"><span class="frIcon">'+FLOOR_ICON[i]+'</span><span>'+fl.name+'</span></div>'+
        '<div class="frMeta">'+(fl.toll>0?('Toll '+fl.toll+' '+fl.name):'Final floor — defeat the Sovereign')+'</div>'+
        (here.length ? ('<div class="frMarkers">'+here.map(function(g){
            return '<div class="frMarker" style="background:'+g.color+';color:'+g.color+'" title="'+g.name+', '+g.progress+'/'+fl.need+'">'+g.name.charAt(0).toUpperCase()+'</div>';
          }).join('')+'</div>'+pipRows) : '<div class="frMeta" style="opacity:0.6;">No guild here yet</div>')+
        '<div class="poolTrack"><span class="pips">'+poolPips+'</span><span class="poolLabel">pool '+poolLeft+'/'+poolTotal+'</span></div>'+
      '</div>'
    );
  }
  list.innerHTML=rows.join('');
}

function popAnimate(el){
  if(!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function renderDice(){
  const box=document.getElementById('diceReveal');
  const h=state.lastHunt;
  if(!h){
    box.innerHTML =
      '<p style="font-size:11.5px;color:var(--text-mid);margin:0 0 4px;">'+me().name+' ready to hunt</p>'+
      '<div class="diceRow"><div class="diceCube idle">1</div><span class="plus">+</span><div class="diceCube idle">1</div></div>'+
      '<p style="font-size:12px;color:var(--text-dim);">Hunt to roll against DR '+floors[me().idx].dr+'</p>'+
      '<p class="resultLine" style="visibility:hidden;">placeholder</p>';
    return;
  }
  const resultCls = h.snake ? 'fail' : h.crit ? 'crit' : h.success ? 'success' : 'fail';
  const resultText = h.snake ? (h.stolenFrom ? (h.guildName+' steals from '+h.stolenFrom+'!') : (h.guildName+' loses 1 progress.'))
    : h.crit ? 'Critical hunt! +2 progress, action point refunded.'
    : h.success ? 'Success! +1 progress.'
    : 'Failed.';
  box.innerHTML =
    '<p style="font-size:11.5px;color:var(--text-mid);margin:0 0 4px;">'+h.guildName+' hunts '+h.matName+'</p>'+
    '<div class="diceRow"><div class="diceCube" id="dc1">'+h.d1+'</div><span class="plus">+</span><div class="diceCube" id="dc2">'+h.d2+'</div></div>'+
    (h.snake ? '<p style="font-size:12px;color:var(--text-dim);">snake eyes</p>' : '<p style="font-size:12px;color:var(--text-dim);">total '+h.total+' vs DR '+h.dr+'</p>')+
    '<p class="resultLine '+resultCls+'">'+resultText+'</p>';
  popAnimate(document.getElementById('dc1'));
  popAnimate(document.getElementById('dc2'));
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
    if(keys.length){ const p=keys[Math.floor(Math.random()*keys.length)]; g.mat[p]-=1; if(g.mat[p]===0) delete g.mat[p]; }
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
  addLog('Monster Outbreak on Floor '+(state.outbreakFloor+1)+'! '+state.guilds[leadIdx].name+' (furthest ahead) loses 2 progress, every other Guild loses 1.', 'st');
  resetOutbreakTimer();
}

// ---- core actions (shared by human buttons and the AI bot) ----
function endTurnAction(){
  if(state.winner!==null && state.winner!==undefined) return;
  const wrapped = nextIndex()===0;
  state.current=nextIndex();
  state.turnCount=(state.turnCount||1)+1;
  state.lastHunt=null;
  const g=me();
  g.ap=2; g.hexCurse=false;
  checkFloorCamping(g);
  addLog('--- '+g.name+"'s turn begins. ---");
  maybeDrawEvent(g);
  if(wrapped){
    if(state.outbreakTimer===undefined || state.outbreakTimer===null) resetOutbreakTimer();
    state.outbreakTimer-=1;
    if(state.outbreakTimer<=0) triggerOutbreak();
  }
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

  const behind=trailing();
  let total=d1+d2+bowBonus+swordBonus+(behind?1:0)-(g.hexCurse?2:0);
  g.ap-=1;
  const hunt={ guildName:g.name, matName:f.name, d1:d1, d2:d2, total:total, dr:f.dr, snake:false, crit:false, success:false, stolenFrom:null, gearNote:gearNote };

  function successExtras(){
    let extra='';
    if(hasCoin && state.pools[g.idx]>0 && addMat(g,f.name,1)){ state.pools[g.idx]-=1; extra+=' Lucky Coin: +1 extra '+f.name+'.'; }
    if(hasCompass){ g.progress+=1; extra+=' Compass: +1 extra progress.'; }
    return extra;
  }

  if(d1===6&&d2===6){
    g.progress+=2; if(state.pools[g.idx]>0&&addMat(g,f.name,1)) state.pools[g.idx]-=1;
    g.ap+=1;
    hunt.crit=true; hunt.success=true;
    addLog(g.name+' rolls double sixes! Critical hunt: +2 progress, action point refunded.'+gearNote+successExtras());
  } else if(d1===1&&d2===1){
    hunt.snake=true;
    const targets=others().filter(function(o){return stockKeys(o.g).length;});
    if(targets.length){
      const t=targets[Math.floor(Math.random()*targets.length)].g;
      const s=steal(t,g);
      hunt.stolenFrom=t.name;
      addLog(g.name+' rolls snake eyes and raids the vault, stealing 1 '+s+' from '+t.name+'.', 'st');
    } else if(hasShield){
      addLog(g.name+' rolls snake eyes, but the Shield absorbs it, no penalty.', 'st');
    } else {
      g.progress=Math.max(0,g.progress-1);
      addLog(g.name+' rolls snake eyes. No rival has anything to steal, -1 progress instead.', 'st');
    }
  } else if(total>=f.dr){
    g.progress+=1;
    hunt.success=true;
    if(state.pools[g.idx]>0 && addMat(g,f.name,1)){ state.pools[g.idx]-=1; addLog(g.name+' rolls '+total+(behind?' (+1 catch-up)':'')+(g.hexCurse?' (-2 cursed)':'')+gearNote+' vs DR'+f.dr+', success: +1 progress, +1 '+f.name+'.'+successExtras()); }
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
function payGear(g,cost){ Object.keys(cost).forEach(function(k){ g.mat[k]-=cost[k]; if(g.mat[k]<=0) delete g.mat[k]; }); }
function eligibleGear(g){
  const owned=g.gear||[];
  return Object.keys(GEAR).filter(function(name){
    const def=GEAR[name];
    if(owned.includes(name)) return false;
    if(def.requires) return owned.includes(def.requires);
    if(def.type==='accessory' && owned.some(function(o){ return GEAR[o]&&GEAR[o].type==='accessory'; })) return false;
    if(owned.length>=2) return false;
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
  if(g.gear.length>=2){ addLog(g.name+' has no open item slot.'); return; }
  if(!affordGear(g,def.cost)){ addLog(g.name+' cannot afford a '+itemName+'.'); return; }
  payGear(g,def.cost);
  g.gear.push(itemName);
  addLog(g.name+' crafts a '+itemName+'.');
}
function transmuteAction(){
  const g=me(), f=floors[g.idx];
  let total=0; for(const k in (g.mat||{})) total+=g.mat[k];
  if(total>=f.tcost){
    let toSpend=f.tcost;
    for(const k of Object.keys(g.mat||{})){ if(toSpend<=0) break; const take=Math.min(g.mat[k],toSpend); g.mat[k]-=take; toSpend-=take; if(g.mat[k]===0) delete g.mat[k]; }
    addMat(g,f.name,1);
    addLog(g.name+' transmutes '+f.tcost+' materials into 1 '+f.name+'.');
  } else addLog(g.name+' needs '+f.tcost+' total materials to transmute, has '+total+'.');
}
function ascendAction(){
  const g=me(), f=floors[g.idx];
  if(g.progress>=f.need && (g.mat[f.name]||0)>=f.toll){
    if(f.toll>0){ g.mat[f.name]-=f.toll; if(g.mat[f.name]===0) delete g.mat[f.name]; }
    const clearedIdx=g.idx;
    if(g.idx===floors.length-1){ state.winner=state.current; addLog(g.name+' defeats the Sovereign and wins the game.', 'wn'); }
    else { g.idx+=1; g.progress=0; g.turnsOnFloor=1; addLog(g.name+' ascends to Floor '+(g.idx+1)+'.'); }
    if(clearedIdx>state.clearedThrough){ state.clearedThrough=clearedIdx; resetOutbreakTimer(); addLog('Floor '+(clearedIdx+1)+' is cleared for the first time, the Outbreak Timer moves up.', 'ev'); }
  } else addLog(g.name+' needs '+f.need+' progress (has '+g.progress+') and '+f.toll+' '+f.name+' toll (has '+(g.mat[f.name]||0)+').');
}

// ---- button wiring (human only, gated by isMyTurn) ----
document.getElementById('btnEndTurn').onclick=function(){ if(!isMyTurn()) return; withState(endTurnAction); };
document.getElementById('btnHunt').onclick=function(){ if(!isMyTurn()) return; withState(huntAction); };
document.getElementById('btnTrain').onclick=function(){ if(!isMyTurn()) return; withState(trainAction); };
document.getElementById('btnRaid').onclick=function(){ if(!isMyTurn()) return; withState(raidAction); };
document.getElementById('btnTransmute').onclick=function(){ if(!isMyTurn()) return; withState(transmuteAction); };
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
  if(g.ap<=0){ withState(endTurnAction); return; }
  const f=floors[g.idx];
  if(g.progress>=f.need && (g.mat[f.name]||0)>=f.toll){ withState(ascendAction); return; }
  if((g.gear||[]).length<2){
    const options=eligibleGear(g).filter(function(name){ return GEAR[name].type==='weapon'; });
    const craftable=options.find(function(name){ return affordGear(g,GEAR[name].cost); });
    if(craftable){ withState(function(){ craftAction(craftable); }); return; }
  }
  if((g.mat[f.name]||0)>=2 && Math.random()<0.5){ withState(trainAction); return; }
  if(Math.random()<0.15 && others().some(function(o){return stockKeys(o.g).length;})){ withState(raidAction); return; }
  withState(huntAction);
}
