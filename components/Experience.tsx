'use client';
import dynamic from 'next/dynamic';
import {useEffect,useState,useCallback,useRef} from 'react';
import {ArrowUpRight,ArrowRight,ArrowLeft,Plane,Globe2,RotateCcw,MoveHorizontal,Layers,Plus,Lock,ChevronRight,VolumeX,Activity,RefreshCw} from 'lucide-react';
import {initialCampaign,money,remainingMs} from '@/lib/domain.mjs';
import type {Campaign,Position,SceneView} from '@/lib/types';
import Overlay from './Overlay';
const Scene=dynamic(()=>import('./Scene'),{ssr:false,loading:()=> <div className="scene-loading"><span className="loader-ring"/><span>Preparing the mission kit</span></div>});

export default function Experience(){
 const [campaign,setCampaign]=useState<Campaign>(initialCampaign() as Campaign);
 const [selected,setSelected]=useState<string|null>(null);
 const [overlay,setOverlay]=useState<'sponsors'|'how'|'activity'|null>(null);
 const [view,setView]=useState<SceneView>('front');
 const [rotation,setRotation]=useState(0);
 const [resetKey,setResetKey]=useState(0);
 const [hovered,setHovered]=useState<string|null>(null);
 const [filter,setFilter]=useState('all');
 const [connection,setConnection]=useState<'loading'|'ok'|'error'>('loading');
 const [reduced,setReduced]=useState(false);
 const [now,setNow]=useState(Date.now());
 const [checkoutError,setCheckoutError]=useState('');
 const [busy,setBusy]=useState(false);
 const [sponsorName,setSponsorName]=useState('');
 const serverOffset=useRef(0);
 const active=campaign.positions.find(p=>p.id===selected);
 const hoveredPosition=campaign.positions.find(p=>p.id===hovered);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  try{const res=await fetch('/api/campaign',{cache:'no-store',signal});if(!res.ok)throw new Error();const data=await res.json() as Campaign;
  serverOffset.current=Date.parse(data.serverNow)-Date.now();setCampaign(data);setConnection('ok');}
  catch(error){if(!(error instanceof DOMException && error.name==='AbortError'))setConnection('error');}
 },[]);
 useEffect(()=>{const abort=new AbortController();void refresh(abort.signal);const poll=setInterval(()=>{if(!document.hidden)void refresh(abort.signal)},15000);return()=>{abort.abort();clearInterval(poll)}},[refresh]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
 useEffect(()=>{const clock=setInterval(()=>setNow(Date.now()+serverOffset.current),1000);return()=>clearInterval(clock)},[]);
 const left=campaign.startsAt?remainingMs(campaign.startsAt,now):null;
 const timer=left===null?['72','00','00']:[Math.floor(left/3600000),Math.floor(left/60000)%60,Math.floor(left/1000)%60].map(n=>String(n).padStart(2,'0'));
 const isLive=campaign.status==='live' && left!==null && left>0 && now>=Date.parse(campaign.startsAt!);
 const claimed=campaign.positions.filter(p=>p.owner).length;
 const selectPosition=useCallback((id:string)=>{setOverlay(null);setSelected(id);setCheckoutError('');setSponsorName('')},[]);
 async function checkout(){if(!active)return;setBusy(true);setCheckoutError('');try{
 const res=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({positionId:active.id,sponsorName})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Checkout is unavailable.');
 const url=new URL(data.url);if(url.protocol!=='https:'||!(url.hostname==='whop.com'||url.hostname.endsWith('.whop.com')))throw new Error('Invalid checkout destination.');location.assign(url.href);
 }catch(e){setCheckoutError(e instanceof Error?e.message:'Checkout is unavailable.')}finally{setBusy(false)}}
 return <main className="experience">
  <header className="topbar"><a className="wordmark" href="/" aria-label="Send Me Somewhere home"><span className="brand-symbol"><ArrowUpRight size={26}/></span><span>SEND ME<br/><strong>SOMEWHERE</strong></span></a><div className="top-center"><span className="mission-square">01</span><span>THE FIRST MISSION</span><span className="top-divider"/><span className="muted">GITEX GLOBAL 2026</span></div><button className="how-button" onClick={()=>setOverlay('how')}>How it works <Plus size={16}/></button></header>
  <section className="showroom" aria-label="Interactive sponsorship showroom">
   <div className="scene-container"><Scene positions={campaign.positions} view={view} rotation={rotation} resetKey={resetKey} reduced={reduced} selected={selected} onSelect={selectPosition} onHover={setHovered}/></div>
   <div className="scene-vignette"/>
   <div className="mission-copy"><div className="eyebrow"><span className="orange-line"/> A DEVELOPER. A JACKET. A JOURNEY.</div><h1>Small origin.<br/>Big <em>somewhere.</em></h1><p>I’m a developer from Ethiopia.<br/>Put your brand on the journey.</p><button className="text-button" onClick={()=>setOverlay('sponsors')}>Find your position <ArrowUpRight size={19}/></button><div className="mission-route"><div><span className="airport">ADD</span><span>Addis Ababa</span></div><div className="route-dashes"><Plane size={17}/></div><div><span className="airport">DXB</span><span>Dubai</span></div></div><div className="route-caption"><Globe2 size={13}/> FIRST STOP · GITEX GLOBAL 2026</div></div>
   <aside className="auction-card"><div className="status-label"><span className={`status-dot ${isLive?'live':''}`}/>{isLive?'AUCTION LIVE':campaign.status==='closed'?'AUCTION CLOSED':campaign.status==='paused'?'AUCTION PAUSED':'PRE-LAUNCH EXPLORER'}</div><div className="timer" aria-label={left===null?'72-hour auction, not started':`${timer[0]} hours ${timer[1]} minutes ${timer[2]} seconds remaining`}>{timer.map((v,i)=><span key={i}>{v}<small>{['HOURS','MIN','SEC'][i]}</small>{i<2&&<b>:</b>}</span>)}</div><p>{left===null?'The 72-hour clock starts at launch.':campaign.status==='scheduled'?'Auction scheduled. Checkout is not open.':isLive?'Every position. Twice the next price.':'Sponsorship checkout is closed.'}</p><div className="auction-divider"/><div className="stat-row"><span>Total sponsorship</span><strong>{money(campaign.totalCents)}</strong></div><div className="stat-row subtle"><span>Positions claimed</span><span>{String(claimed).padStart(2,'0')} <i>/ 15</i></span></div><div className="position-progress">{campaign.positions.map(p=><span key={p.id} className={p.owner?'claimed':''}/>)}</div><button className="sponsor-button" onClick={()=>setOverlay('sponsors')}>View sponsors <ArrowUpRight size={17}/></button><div className="auction-footnote"><Lock size={12}/>{campaign.paymentsEnabled?'Secure checkout with Whop':'Payments are not open'}</div></aside>
   <div className="model-meta"><span>MISSION KIT — 001</span><span>{view==='gear'?'THE EVERYDAY ESSENTIALS':'RACING JACKET / CUSTOM EDITION'}</span></div>
   <div className={`hover-card ${hoveredPosition?'visible':''}`} aria-live="polite">{hoveredPosition&&<><span className="eyebrow">POSITION {String(hoveredPosition.number).padStart(2,'0')}</span><strong>{hoveredPosition.name}</strong><span>{hoveredPosition.owner?.name||'Unclaimed'} <b>{money(hoveredPosition.currentPriceCents)}</b></span><small>Click to explore <ArrowUpRight size={12}/></small></>}</div>
   <div className="scene-controls"><div className="view-switch" aria-label="Model view">{(['front','back','gear'] as SceneView[]).map(v=><button key={v} aria-pressed={view===v} onClick={()=>{setView(v);setRotation(0);setResetKey(k=>k+1)}}>{v==='gear'?<Layers size={15}/>:null}{v[0].toUpperCase()+v.slice(1)}</button>)}</div><div className="rotation-controls"><button className="icon-button" aria-label="Rotate left" onClick={()=>setRotation(v=>v-.55)}><ArrowLeft size={15}/></button><span><MoveHorizontal size={16}/> Drag to rotate</span><button className="icon-button" aria-label="Rotate right" onClick={()=>setRotation(v=>v+.55)}><ArrowRight size={15}/></button><button className="icon-button reset" aria-label="Reset view" onClick={()=>{setView('front');setRotation(0);setResetKey(k=>k+1)}}><RotateCcw size={15}/></button></div></div>
   <div className="stage-coordinate">9.03° N, 38.75° E <span>→</span> 25.20° N, 55.27° E</div>
  </section>
  <footer className="bottom-bar"><div className="creator"><div className="creator-monogram">KH<span/></div><div><strong>Kidanemariam</strong><span>Building from Addis Ababa, Ethiopia</span></div></div><button className="activity-button" onClick={()=>setOverlay('activity')}><Activity size={17}/><span>{campaign.activity.length?`${campaign.activity[0].name} claimed ${campaign.activity[0].position}`:'The journey starts with the first sponsor.'}</span><ChevronRight size={16}/></button><button className="sound-label" onClick={()=>setReduced(v=>!v)} aria-pressed={reduced}><VolumeX size={15}/>{reduced?'MOTION REDUCED':'AMBIENT MOTION'}</button></footer>
  {connection==='error'&&<div className="connection-notice" role="status">Live updates unavailable. Prices may be out of date.<button onClick={()=>void refresh()}><RefreshCw size={14}/> Retry</button></div>}
  <Overlay open={!!active} onClose={()=>setSelected(null)} title={active?.name||'Sponsorship position'} description={active?.description||''}>
   {active&&<><div className="placement-number">{String(active.number).padStart(2,'0')}<span>{active.category==='gear'?'MISSION GEAR':'ON THE JACKET'}</span></div><div className="owner-row"><span>Current sponsor</span><strong>{active.owner?.name||'Be the first'}</strong></div><div className="price-block"><span>{active.owner?'TAKEOVER PRICE':'OPENING PRICE'}</span><strong>{money(active.currentPriceCents)}<small>USD</small></strong></div><div className="price-ladder"><span className="current">{money(active.currentPriceCents)}</span><ArrowRight size={14}/><span>{money(active.currentPriceCents*2)}</span><ArrowRight size={14}/><span>{money(active.currentPriceCents*4)}</span></div><p className="fine-print">Each successful purchase doubles the next price. The sponsor holding the position at auction close gets the placement.</p>
   {campaign.paymentsEnabled&&isLive&&<label className="sponsor-input">Public sponsor name<input value={sponsorName} onChange={e=>setSponsorName(e.target.value)} maxLength={60} placeholder="Your brand" autoComplete="organization"/></label>}
   <button className="checkout-button" disabled={!campaign.paymentsEnabled||!isLive||busy||!sponsorName.trim()||!!active.owner||connection!=='ok'} onClick={checkout}>{!campaign.paymentsEnabled||!isLive?<><Lock size={17}/> Opens when the auction launches</>:active.owner?'Takeovers not yet enabled':busy?'Preparing checkout…':`Buy for ${money(active.currentPriceCents)}`}</button><p className="checkout-note">{active.owner?'Takeovers remain paused until the payment and refund workflow is verified.':'Checkout will be handled securely by Whop.'}</p>{checkoutError&&<p className="form-error" role="alert">{checkoutError}</p>}</>}
  </Overlay>
  <Overlay open={overlay==='sponsors'} onClose={()=>setOverlay(null)} title="Your brand. On the journey." description={`${claimed} of 15 positions claimed. Explore the jacket and the gear.`} wide>
   <div className="filter-tabs">{['all','jacket','gear'].map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='all'?'All positions':f==='jacket'?'The jacket':'The gear'}</button>)}</div><div className="sponsor-grid">{campaign.positions.filter(p=>filter==='all'||p.category===filter).map(p=><button className="position-card" key={p.id} onClick={()=>selectPosition(p.id)}><span className="position-top"><span>{String(p.number).padStart(2,'0')}</span><ArrowUpRight size={17}/></span><strong>{p.name}</strong><span className="position-owner">{p.owner?.name||'Unclaimed'}</span><span className="position-price">{money(p.currentPriceCents)}<small>{p.owner?'TAKEOVER':'OPENING'}</small></span></button>)}</div>
  </Overlay>
  <Overlay open={overlay==='how'} onClose={()=>setOverlay(null)} title="Own a piece of somewhere." description="15 positions. One developer. A journey powered by the brands that come along." wide>
   <div className="how-grid">{[['01','Pick your position','Explore the 3D jacket or choose a spot on the mission gear. Opening prices range from $250 to $1,000.'],['02','Make it yours','When the auction opens, complete a one-time Whop checkout. Ownership changes only after payment is verified.'],['03','The next price doubles','A $250 position becomes $500, then $1,000. Takeover payments stay disabled until the refund workflow is verified.'],['04','Come along for the ride','At the end of the 72-hour auction, the current sponsors secure their placements for Mission 01.']].map(([n,h,p])=><div className="how-step" key={n}><span>{n}</span><h3>{h}</h3><p>{p}</p></div>)}</div><div className="notice"><Lock size={17}/><p>This is the pre-launch explorer. No auction is running and no payments are being accepted. Final placement details and takeover terms will be published before launch.</p></div>
  </Overlay>
  <Overlay open={overlay==='activity'} onClose={()=>setOverlay(null)} title="The journey, as it happens." description="Verified sponsorship activity from Mission 01.">
   {campaign.activity.length?<div className="activity-list">{campaign.activity.map(a=><div key={a.id}><strong>{a.name}</strong><p>{a.position} · {money(a.amountCents)}</p><time dateTime={a.at}>{new Date(a.at).toLocaleString()}</time></div>)}</div>:<div className="empty-state"><Activity size={35}/><h3>A blank page. A big journey.</h3><p>No sponsorship payments yet. The first verified sponsorship will appear here.</p></div>}
  </Overlay>
 </main>
}
