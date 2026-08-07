import { db, ref, get, set, deviceId } from '../firebase.js';
import { setMode, setRoom } from '../state.js';

const params=new URLSearchParams(window.location.search);
const roomCode=(params.get('code')||'').toUpperCase();
if(!roomCode){ window.location.href='join.html'; }

function roomRef(){ return ref(db, 'rooms/'+roomCode); }

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
      setMode('online');
      setRoom(roomCode, i);
      window.location.href='lobby.html';
    };
    row.appendChild(b);
  });
}

(async function init(){
  const snap=await get(roomRef());
  if(!snap.exists()){ window.location.href='join.html'; return; }
  renderSlotPicker(snap.val());
})();

document.getElementById('btnBackFromSlots').onclick=function(){ window.location.href='join.html'; };
