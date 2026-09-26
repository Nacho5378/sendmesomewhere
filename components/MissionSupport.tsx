'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowUpRight,Lock} from 'lucide-react';

type MissionProgress={goalCents:number;raisedCents:number;remainingCents:number;individualCents:number;corporateCents:number;individualContributions:number;individualSupporters:number;sponsorCompanies:number;sourceBreakdown:Record<string,{amountCents:number;contributions:number}>;serverNow:string};
const ALLOWED=new Set(['instagram','tiktok','x','reddit','creator','sponsor_email','linkedin','direct','other']);
const PRESETS=[100,500,1000,2500,5000,10000];
const fmt=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100);

export default function MissionSupport(){
 const [progress,setProgress]=useState<MissionProgress|null>(null);
 const [amount,setAmount]=useState(100);
 const [custom,setCustom]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const attribution=useMemo(()=>{
  if(typeof window==='undefined')return {source:'direct',ref:''};
  const q=new URLSearchParams(window.location.search);
  const raw=(q.get('source')||'direct').toLowerCase();
  const source=ALLOWED.has(raw)?raw:'other';
  const ref=(q.get('ref')||'').slice(0,80).replace(/[^A-Za-z0-9._-]/g,'');
  return {source,ref};
 },[]);
 useEffect(()=>{let active=true;async function load(){try{const r=await fetch('/api/mission',{cache:'no-store'});if(!r.ok)throw new Error();const data=await r.json();if(active)setProgress(data)}catch{}}void load();const id=setInterval(load,15000);return()=>{active=false;clearInterval(id)}},[]);
 const selected=custom?Math.round(Number(custom)*100):amount;
 const pct=progress?Math.min(100,(progress.raisedCents/progress.goalCents)*100):0;
 async function support(){setError('');if(!Number.isSafeInteger(selected)||selected<100||selected>820000){setError('Choose an amount between $1 and $8,200.');return}setBusy(true);try{const r=await fetch('/api/support/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountCents:selected,source:attribution.source,ref:attribution.ref})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Support checkout is unavailable.');const url=new URL(data.url);if(url.protocol!=='https:'||!(url.hostname==='whop.com'||url.hostname.endsWith('.whop.com')))throw new Error('Invalid checkout destination.');location.assign(url.href)}catch(e){setError(e instanceof Error?e.message:'Support checkout is unavailable.')}finally{setBusy(false)}}
 return <section aria-label="Mission 01 fundraising goal" style={{position:'fixed',zIndex:8,left:'3.4%',top:130,width:'min(430px,42vw)',padding:'22px 24px',background:'linear-gradient(145deg,rgba(17,25,30,.96),rgba(10,16,19,.94))',border:'1px solid #334047',boxShadow:'0 20px 60px rgba(0,0,0,.28)',backdropFilter:'blur(12px)'}}>
  <div style={{fontSize:10,letterSpacing:1.7,color:'#ff8b60',fontWeight:700}}>MISSION #1 · ADDIS ABABA → DUBAI</div>
  <h1 style={{fontFamily:"'Barlow Condensed','Arial Narrow',Impact,sans-serif",fontSize:'clamp(38px,3.6vw,60px)',lineHeight:.96,margin:'12px 0 10px',textTransform:'uppercase',fontWeight:600}}>Can the internet fund an <span style={{color:'#ff682e'}}>$8,200 mission</span>, starting with $1?</h1>
  <p style={{margin:'0 0 15px',fontSize:13,lineHeight:1.55,color:'#aab5b9'}}>Send Me Somewhere · Addis Ababa → Dubai for GITEX Global 2026. Individual support and corporate sponsorships count toward the same goal.</p>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'baseline'}}><strong style={{fontFamily:"'Barlow Condensed','Arial Narrow',Impact,sans-serif",fontSize:32,fontWeight:600}}>{fmt(progress?.raisedCents||0)}</strong><span style={{fontSize:12,color:'#8d9a9f'}}>of $8,200 · {fmt(progress?.remainingCents??820000)} remaining</span></div>
  <div style={{height:7,background:'#2c383e',margin:'8px 0 14px',overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:'#ff682e',transition:'width .3s'}}/></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14,fontSize:11,color:'#8d9a9f'}}><span><b style={{display:'block',fontSize:16,color:'#e9eee8'}}>{progress?.individualSupporters||0}</b>supporters</span><span><b style={{display:'block',fontSize:16,color:'#e9eee8'}}>{progress?.sponsorCompanies||0}</b>companies</span><span><b style={{display:'block',fontSize:16,color:'#e9eee8'}}>{progress?.individualContributions||0}</b>contributions</span></div>
  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{PRESETS.map(c=><button key={c} onClick={()=>{setAmount(c);setCustom('')}} aria-pressed={!custom&&amount===c} style={{padding:'8px 11px',background:!custom&&amount===c?'#ff682e':'#182329',color:!custom&&amount===c?'#10171b':'#dce3df',border:'1px solid #35434a',fontSize:12}}>{fmt(c)}</button>)}</div>
  <div style={{display:'flex',gap:8,marginTop:8}}><label style={{flex:1,display:'flex',alignItems:'center',gap:6,background:'#0d161b',border:'1px solid #425862',padding:'0 10px',fontSize:12,color:'#8d9a9f'}}>$<input aria-label="Custom support amount in USD" inputMode="decimal" value={custom} onChange={e=>setCustom(e.target.value.replace(/[^0-9.]/g,''))} placeholder="Custom" style={{width:'100%',background:'transparent',border:0,color:'#e9eee8',padding:'10px 0',outline:'none'}}/></label><button onClick={support} disabled={busy} style={{minWidth:145,display:'flex',alignItems:'center',justifyContent:'center',gap:7,background:'#ff682e',color:'#10171b',padding:'10px 14px',fontWeight:700,fontSize:12}}>{busy?'Opening…':<>Support {fmt(selected||100)} <ArrowUpRight size={15}/></>}</button></div>
  {error&&<p role="alert" style={{fontSize:11,color:'#ffb18d',margin:'8px 0 0'}}>{error}</p>}
  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:10,fontSize:10,color:'#7f8d92'}}><Lock size={11}/> One-time support. Corporate sponsor positions remain a separate checkout flow.</div>
 </section>
}
