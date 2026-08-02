import { floors } from './gameData.js';

const MODAL_HTML = `
<div class="modalOverlay" id="howToOverlay">
  <div class="modalCard glass">
    <h2>How to play</h2>
    <div class="howRow"><span class="hic">&#x1F3AF;</span><span class="htxt"><b>Objective:</b> race to Floor 6 and defeat the Sovereign, or hold the strongest position when your friends call the game.</span></div>
    <div class="howRow"><span class="hic">&#x2694;&#xFE0F;</span><span class="htxt"><b>Turn actions (2 AP):</b> Hunt, Train, Raid, and Sabotage each cost 1 action point. Trade, Craft, Transmute, and Ascend are free.</span></div>
    <div class="howRow"><span class="hic">&#x1F3B2;</span><span class="htxt"><b>Hunt:</b> roll 2d6 vs the floor's DR. Success grants progress and usually a material. Snake eyes (1+1) lets you steal from a rival instead of losing progress. Double sixes crit for +2 progress and a free action.</span></div>
    <div class="howRow"><span class="hic">&#x1F4DA;</span><span class="htxt"><b>Train:</b> spend 2 of the current floor's material for a guaranteed +1 progress, no roll.</span></div>
    <div class="howRow"><span class="hic">&#x1F5E1;&#xFE0F;</span><span class="htxt"><b>Raid:</b> roll a d6, 4 or higher steals 1 random material from a rival.</span></div>
    <div class="howRow"><span class="hic">&#x1F91D;</span><span class="htxt"><b>Trade:</b> propose a material swap with any guild. They accept or decline on their own device (AI guilds respond automatically).</span></div>
    <div class="howRow"><span class="hic">&#x1FA84;</span><span class="htxt"><b>Sabotage:</b> spend 1 material to curse a rival, their next Hunt total takes -2.</span></div>
    <div class="howRow"><span class="hic">&#x1F3F9;</span><span class="htxt"><b>Blacksmith:</b> craft Basic Bow (2 Kasaka Fang, reroll a die) or Basic Sword (2 Golem Crystal, +2 total), upgrade them, or craft accessories: Shield (blocks a snake-eyes penalty), Lucky Coin (+1 loot on success), Compass (+1 progress on success). 2 item slots, only 1 accessory at a time.</span></div>
    <div class="howRow"><span class="hic">&#x2728;</span><span class="htxt"><b>Transmute:</b> spend the floor's listed cost in any combination of materials to receive 1 of that floor's material.
      <div class="tcostTable" id="tcostTable"></div>
    </span></div>
    <div class="howRow"><span class="hic">&#x1FA9C;</span><span class="htxt"><b>Ascend:</b> once you meet the progress requirement and hold the toll material, move up to the next floor.</span></div>
    <div class="howRow"><span class="hic">&#x1F480;</span><span class="htxt"><b>Monster Outbreak:</b> the lowest floor nobody has cleared yet carries a countdown, shown above the Tower panel. It resets when that floor is finally cleared. If it hits 0, the guild furthest ahead loses 2 progress and everyone else loses 1.</span></div>
    <div class="howRow"><span class="hic">&#x1F4A5;</span><span class="htxt"><b>Camping:</b> stay on the same floor past 3 of your own turns and the Monster attacks, -1 progress and -1 material.</span></div>
    <div class="howRow"><span class="hic">&#x1F340;</span><span class="htxt"><b>Tower Events:</b> roughly 1 in 3 turns draws a random event, good or bad, when your turn begins.</span></div>
    <div class="howRow"><span class="hic">&#x1F4C8;</span><span class="htxt"><b>Catch-up:</b> whoever is on the lowest floor gets +1 added to their Hunt rolls.</span></div>
    <div class="modalCloseRow"><button class="glow-btn" id="btnCloseHowTo">Got it</button></div>
  </div>
</div>`;

// Injects the "How to play" modal into the page and wires it to any trigger
// button ids given (e.g. 'btnHowToHome', 'btnHowToGame').
export function mountHowTo(triggerIds){
  document.body.insertAdjacentHTML('beforeend', MODAL_HTML);
  document.getElementById('tcostTable').innerHTML = floors.map(function(f,i){
    return '<div><span>Floor '+(i+1)+', '+f.name+'</span><b>'+f.tcost+' given &rarr; receive 1</b></div>';
  }).join('');

  const overlay=document.getElementById('howToOverlay');
  function open(){ overlay.classList.add('show'); }
  function close(){ overlay.classList.remove('show'); }
  document.getElementById('btnCloseHowTo').onclick=close;
  overlay.onclick=function(e){ if(e.target.id==='howToOverlay') close(); };
  (triggerIds||[]).forEach(function(id){
    const btn=document.getElementById(id);
    if(btn) btn.onclick=open;
  });
}
