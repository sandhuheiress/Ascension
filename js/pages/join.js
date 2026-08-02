import { db, ref, get } from '../firebase.js';

document.getElementById('btnFindRoom').onclick=async function(){
  const code=document.getElementById('joinCodeInput').value.trim().toUpperCase();
  const errEl=document.getElementById('joinErr');
  errEl.textContent='';
  if(code.length!==4){ errEl.textContent='Enter the 4-letter code.'; return; }
  try{
    const snap=await get(ref(db,'rooms/'+code));
    if(!snap.exists()){ errEl.textContent='No room found with that code.'; return; }
    window.location.href='slots.html?code='+code;
  } catch(e){
    console.error(e);
    errEl.textContent = 'Could not reach the room: ' + (e && e.message ? e.message : e) + '. Check that Realtime Database is created and its rules allow read/write.';
  }
};
document.getElementById('btnBackFromJoin').onclick=function(){ window.location.href='index.html'; };
