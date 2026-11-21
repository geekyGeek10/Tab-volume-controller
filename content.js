(()=>{
if(globalThis.__mediaControlInstalled)return; globalThis.__mediaControlInstalled=true;
const ids=new WeakMap();let next=0;
const media=()=>Array.from(document.querySelectorAll('video,audio')).filter(e=>e.currentSrc||e.src||e.srcObject);
const id=e=>{if(!ids.has(e))ids.set(e,++next);return ids.get(e)};
chrome.runtime.onMessage.addListener((m,s,reply)=>{
if(m.type!=='mediaAction')return;
const e=media().find(e=>id(e)===m.id);if(!e){reply({ok:false});return;}
try{if(m.action==='volume')e.volume=Math.max(0,Math.min(1,m.value));if(m.action==='mute')e.muted=m.value;if(m.action==='pause')e.pause();if(m.action==='play'){e.play().then(()=>reply({ok:true})).catch(err=>reply({ok:false,error:err.message}));return true;}reply({ok:true});}catch(err){reply({ok:false,error:err.message});}
});
globalThis.__mediaControlScan=()=>media().map(e=>({id:id(e),title:e.title||navigator.mediaSession?.metadata?.title||document.title,volume:e.volume,muted:e.muted,paused:e.paused,kind:e.tagName}));
})();
