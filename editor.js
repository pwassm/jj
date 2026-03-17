async function openQF(cs){
  qfCell=cs;
  const ex=linksData.find(it=>it.cell===cs);
  let lv=ex?(ex.link||''):'';
  if(!ISMOBILE){
    try{ const c=(await navigator.clipboard.readText()).trim(); if(/^https?:\/\//i.test(c)) lv=c; }catch(e){}
  }
  document.getElementById('qfLink').value=lv;
  document.getElementById('qfLinkPrev').textContent=lv;
  document.getElementById('qfCname').value=ex?(ex.cname||''):'';
  if(!ISMOBILE){
    document.getElementById('qfSname').value  =ex?(ex.sname||''):'';
    document.getElementById('qfAttrib').value =ex?(ex.attribution||''):'';
    document.getElementById('qfComment').value=ex?(ex.comment||''):'';
    document.getElementById('qfAsset').value  =ex?(ex.asset||'i'):'i';
    document.getElementById('qfFit').value    =ex?(ex.fit||''):'';
  }
  document.getElementById('qfTitle').textContent='Pin '+cs;
  document.getElementById('qfError').textContent='';
  document.getElementById('qfModal').classList.add('open');
  setTimeout(()=>document.getElementById(lv?'qfCname':'qfLink').focus(),80);
}

function qfSave(){
  const link =document.getElementById('qfLink').value.trim();
  const cname=document.getElementById('qfCname').value.trim();
  if(!link&&!cname){ document.getElementById('qfError').textContent='Need link or cname'; return; }
  const sname  =ISMOBILE?'':document.getElementById('qfSname').value.trim();
  const attrib =ISMOBILE?'':document.getElementById('qfAttrib').value.trim();
  const comment=ISMOBILE?'':document.getElementById('qfComment').value.trim();
  const asset  =ISMOBILE?'i':document.getElementById('qfAsset').value;
  const fit    =ISMOBILE?'':document.getElementById('qfFit').value;
  let e=linksData.find(it=>it.cell===qfCell);
  if(e) Object.assign(e,{show:'1',asset,fit,link,cname,sname,attribution:attrib,comment});
  else  linksData.push({show:'1',asset,cell:qfCell,fit,link,cname,sname,attribution:attrib,comment,Mute:"1"});
  localStorage.setItem('mlynx-links',JSON.stringify(linksData));
  document.getElementById('qfModal').classList.remove('open');
  render();
}

['qfSave','qfSave2'].forEach(id=>
  document.getElementById(id).addEventListener('pointerup',e=>{ e.stopPropagation(); qfSave(); })
);
['qfCancel','qfCancel2'].forEach(id=>
  document.getElementById(id).addEventListener('pointerup',e=>{ e.stopPropagation(); document.getElementById('qfModal').classList.remove('open'); })
);
document.getElementById('qfLink').addEventListener('input',function(){ document.getElementById('qfLinkPrev').textContent=this.value; });
document.getElementById('qfModal').addEventListener('pointerup',e=>e.stopPropagation());

// THE ONE NEW THING: Ctrl+S inside quick-fill saves
document.getElementById('qfModal').addEventListener('keydown',e=>{
  if(e.ctrlKey && e.key.toLowerCase()==='s'){ e.preventDefault(); qfSave(); }
});

document.getElementById('qfPasteBtn').addEventListener('pointerup',async e=>{
  e.stopPropagation();
  try{
    const t=(await navigator.clipboard.readText()).trim();
    if(/^https?:\/\//i.test(t)){
      document.getElementById('qfLink').value=t;
      document.getElementById('qfLinkPrev').textContent=t;
    } else alert('No URL in clipboard.');
  }catch(err){ alert('Tap Image link field and paste manually.'); }
});

// JSON editor
window.applyJsonChanges = function() {
  try {
    if(rawJsonMode) {
      const d=JSON.parse(document.getElementById('jsonText').value);
      if(!Array.isArray(d)) throw new Error('Expected array');
      linksData=d;
    }
    localStorage.setItem('seeandlearn-links',JSON.stringify(linksData));
    document.getElementById('jsonModal').classList.remove('open');
    render(); return true;
  } catch(e) { document.getElementById('jsonStatus').textContent='Error: '+e.message; return false; }
}
document.getElementById('jsonApply').addEventListener('click', window.applyJsonChanges);
document.getElementById('jsonPush').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (window.applyJsonChanges()) { window.pushToGitHub(); } });
document.getElementById('jsonDl').addEventListener('click',saveJson);
document.getElementById('jsonCancel').addEventListener('click',()=>document.getElementById('jsonModal').classList.remove('open'));
document.getElementById('jsonModal').addEventListener('pointerup',e=>e.stopPropagation());
document.getElementById('jsonText').addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.key.toLowerCase()==='s'){ e.preventDefault(); document.getElementById('jsonApply').dispatchEvent(new Event('pointerup')); }
});

// bootstrap
