import { db, ref, set, deviceId } from '../firebase.js';
import { COLOR_OPTIONS } from '../gameData.js';
import { genCode, freshState, colorsForRoom, setMode, setRoom, saveLocalState } from '../state.js';

const params=new URLSearchParams(window.location.search);
const flow=params.get('flow')==='online' ? 'online' : 'local';
const n=Math.max(2, Math.min(4, parseInt(params.get('n')||'2',10)));

document.getElementById('btnBackFromIdentity').onclick=function(){
  window.location.href = flow==='local' ? 'index.html' : 'create.html';
};

let identityColorIdx=0;
const colorGrid=document.getElementById('colorGrid');
COLOR_OPTIONS.forEach(function(opt,i){
  const b=document.createElement('div');
  b.className='colorOpt'+(i===0?' sel':'');
  b.style.color=opt.color;
  b.innerHTML='<span class="ic">'+opt.icon+'</span><span class="nm">'+opt.name+'</span>';
  b.onclick=function(){
    identityColorIdx=i;
    Array.from(colorGrid.children).forEach(function(c){c.classList.remove('sel');});
    b.classList.add('sel');
  };
  colorGrid.appendChild(b);
});

document.getElementById('btnIdentityGo').onclick=async function(){
  const name=document.getElementById('identityName').value.trim();
  const errEl=document.getElementById('identityErr');
  if(!name){ errEl.textContent='Give your guild a name.'; return; }
  errEl.textContent='';

  if(flow==='local'){
    const state=freshState(n);
    const colors=colorsForRoom(n, identityColorIdx);
    state.guilds.forEach(function(g,i){ g.color=colors[i]; });
    state.guilds[0].name=name;
    state.guilds[0].claimedBy='local';
    for(let i=1;i<n;i++){ state.guilds[i].isBot=true; state.guilds[i].claimedBy='bot'; }
    state.started=true;
    state.log=[{t:'Practice game started. '+state.guilds[0].name+' (you) goes first.', cls:''}];
    setMode('local');
    saveLocalState(state);
    window.location.href='game.html';
    return;
  }

  const btn=document.getElementById('btnIdentityGo');
  btn.disabled=true; btn.textContent='Creating...';
  try{
    const roomCode=genCode();
    const s=freshState(n);
    const colors=colorsForRoom(n, identityColorIdx);
    s.guilds.forEach(function(g,i){ g.color=colors[i]; });
    s.guilds[0].name=name;
    s.guilds[0].claimedBy=deviceId;
    await set(ref(db, 'rooms/'+roomCode), s);
    setMode('online');
    setRoom(roomCode, 0);
    window.location.href='lobby.html';
  } catch(e){
    console.error(e);
    errEl.textContent = 'Could not create room: ' + (e && e.message ? e.message : e) + '. Check that Realtime Database (not Firestore) is created in the Firebase console, and that its rules allow read/write.';
    btn.disabled=false; btn.textContent='Next';
  }
};
