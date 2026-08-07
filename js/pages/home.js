import { db, ref, get } from '../firebase.js';
import { mountHowTo } from '../howto.js';
import { getRoomCode, getRoomSlot } from '../state.js';

mountHowTo(['btnHowToHome']);

// ---- mode toggle ----
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

// ---- local party size ----
let localN=2;
const localCountRow=document.getElementById('localCountRow');
[2,3,4].forEach(function(n){
  const b=document.createElement('button');
  b.className='count-btn'+(n===2?' sel':'');
  b.textContent=n;
  b.onclick=function(){ localN=n; Array.from(localCountRow.children).forEach(function(c){c.classList.remove('sel');}); b.classList.add('sel'); };
  localCountRow.appendChild(b);
});
document.getElementById('btnLocalNext').onclick=function(){
  window.location.href='identity.html?flow=local&n='+localN;
};

document.getElementById('btnGoCreate').onclick=function(){ window.location.href='create.html'; };
document.getElementById('btnGoJoin').onclick=function(){ window.location.href='join.html'; };

// ---- auto-rejoin an in-progress online room ----
(function tryAutoRejoin(){
  const savedRoom=getRoomCode();
  const savedSlot=savedRoom?getRoomSlot(savedRoom):null;
  if(savedRoom && savedSlot!==null){
    get(ref(db,'rooms/'+savedRoom)).then(function(snap){
      if(snap.exists()){
        const s=snap.val();
        window.location.href = s.started ? 'game.html' : 'lobby.html';
      }
    }).catch(function(){});
  }
})();
