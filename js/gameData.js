export const floors=[
  {name:"Kasaka Fang", dr:6, need:2, toll:1, tcost:4},
  {name:"Golem Crystal", dr:7, need:3, toll:2, tcost:4},
  {name:"Orc Tusk", dr:8, need:4, toll:2, tcost:3},
  {name:"Oracle Wisp", dr:9, need:5, toll:3, tcost:3},
  {name:"Kaisel Scale", dr:10, need:6, toll:3, tcost:2},
  {name:"Sovereign's Ash", dr:11, need:7, toll:0, tcost:2}
];

export const CAP=3, CAMP_LIMIT=3, START_POOL=10;
export const PALETTE=['#4fd8ff','#a480ff','#e0b756','#ff8b7a'];
export const FLOOR_TINT=['#4fd8ff','#5de0c8','#a480ff','#d97fe0','#e0b756','#ff8b7a'];
export const FLOOR_ICON=['\u{1F40D}','\u{1F5FF}','\u{1F479}','\u{1F441}\u{FE0F}','\u{1F48E}','\u{1F409}'];
export const COLOR_OPTIONS=[
  {color:'#4fd8ff', name:'Azure', icon:'\u{1F30A}'},
  {color:'#a480ff', name:'Amethyst', icon:'\u{1F52E}'},
  {color:'#e0b756', name:'Amber', icon:'\u{1F3C6}'},
  {color:'#ff8b7a', name:'Ember', icon:'\u{1F525}'}
];
export const GEAR={
  'Basic Bow':      { type:'weapon', line:'bow',   tier:1, cost:{'Kasaka Fang':2}, desc:'Reroll one die once, must accept the new sum.' },
  'Upgraded Bow':   { type:'weapon', line:'bow',   tier:2, cost:{'Golem Crystal':2}, requires:'Basic Bow', desc:'Reroll one die once, add the new value on top of the original total.' },
  'Basic Sword':    { type:'weapon', line:'sword', tier:1, cost:{'Golem Crystal':2}, desc:'+2 to the final roll total.' },
  'Upgraded Sword': { type:'weapon', line:'sword', tier:2, cost:{'Orc Tusk':3}, requires:'Basic Sword', desc:'+4 to the final roll total.' },
  'Shield':         { type:'accessory', cost:{'Kasaka Fang':2,'Golem Crystal':1}, desc:'Prevents progress loss when a snake-eyes hunt finds no rival to steal from.' },
  'Lucky Coin':     { type:'accessory', cost:{'Orc Tusk':2,'Oracle Wisp':1}, desc:'+1 extra material on a successful hunt.' },
  'Compass':        { type:'accessory', cost:{'Kaisel Scale':1,'Orc Tusk':2}, desc:'+1 extra Ascension Progress on a successful hunt.' }
};
export const GEAR_ICON={ 'Basic Bow':'\u{1F3F9}', 'Upgraded Bow':'\u{1F3F9}✨', 'Basic Sword':'⚔️', 'Upgraded Sword':'\u{1F5E1}️', 'Shield':'\u{1F6E1}️', 'Lucky Coin':'\u{1F340}', 'Compass':'\u{1F9ED}' };

export function addMatTo(g,name,qty){
  const mat=g.mat||{};
  if(!(mat.hasOwnProperty(name) || Object.keys(mat).length<CAP)) return false;
  g.mat=mat; g.mat[name]=(g.mat[name]||0)+qty; return true;
}

export const EVENTS=[
  {label:'Windfall', apply:function(g,pools){const f=floors[g.idx]; if(pools[g.idx]>0&&addMatTo(g,f.name,1)){pools[g.idx]-=1; return g.name+' finds a Windfall cache: +1 '+f.name+'.';} return g.name+' finds a Windfall cache, but storage is full.';}},
  {label:'Ambush', apply:function(g){g.progress=Math.max(0,g.progress-1); return g.name+' is Ambushed by lesser beasts: -1 progress.';}},
  {label:'Guild rally', apply:function(g){g.ap+=1; return g.name+' hears a Guild Rally horn: +1 action point this turn.';}},
  {label:'Curse mist', apply:function(g){g.eventCurse=true; return 'Curse mist settles over '+g.name+': their next Hunt this turn auto-fails.';}},
  {label:'Old cache', apply:function(g){const prevIdx=Math.max(0,g.idx-1); const pn=floors[prevIdx].name; if(addMatTo(g,pn,1)) return g.name+' unearths an Old Cache: +1 '+pn+'.'; return g.name+' finds an Old Cache, but storage is full.';}},
  {label:'Quiet floor', apply:function(){ return 'The floor is quiet. Nothing happens.';}}
];
