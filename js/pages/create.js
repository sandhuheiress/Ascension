let createN=2;
const countRow=document.getElementById('countRow');
[2,3,4].forEach(function(n){
  const b=document.createElement('button');
  b.className='count-btn'+(n===2?' sel':'');
  b.textContent=n;
  b.onclick=function(){ createN=n; Array.from(countRow.children).forEach(function(c){c.classList.remove('sel');}); b.classList.add('sel'); };
  countRow.appendChild(b);
});

document.getElementById('btnCreateNext').onclick=function(){
  window.location.href='identity.html?flow=online&n='+createN;
};
document.getElementById('btnBackFromCreate').onclick=function(){ window.location.href='index.html'; };
