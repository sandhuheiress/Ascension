import { db, ref, onValue, off, get, set, deviceId } from '../firebase.js';
import { getRoomCode, clearRoom } from '../state.js';

const roomCode=getRoomCode();
if(!roomCode){ window.location.href='index.html'; }

function roomRef(){ return ref(db, 'rooms/'+roomCode); }
let state=null;

function renderLobby(){
  document.getElementById('lobbyCode').textContent=roomCode;
  const row=document.getElementById('lobbySlots');
  row.innerHTML=state.guilds.map(function(g){
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

onValue(roomRef(), function(snap){
  state=snap.val();
  if(!state) return;
  if(state.started){ window.location.href='game.html'; return; }
  renderLobby();
});

document.getElementById('btnStartGame').onclick=async function(){
  const s=(await get(roomRef())).val();
  s.started=true;
  s.log.unshift({t:s.guilds[0].name+' goes first.', cls:''});
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
};
document.getElementById('btnLeaveLobby').onclick=function(){
  try{ off(roomRef()); }catch(e){}
  clearRoom();
  window.location.href='index.html';
};
