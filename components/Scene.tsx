'use client';
import {Canvas,useFrame,useThree,ThreeEvent} from '@react-three/fiber';
import {Component,ReactNode,useEffect,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import type {Position,SceneView} from '@/lib/types';

type Props={positions:Position[];view:SceneView;rotation:number;resetKey:number;reduced:boolean;selected:string|null;onSelect:(id:string)=>void;onHover:(id:string|null)=>void};
type Vec=[number,number,number];
const ORANGE='#ff662c',IVORY='#d9ded9',DARK='#171c20';

// Original parametric garment: shaped cross-sections, asymmetrical cloth folds,
// individually surfaced panels, ribbing, piping, zipper and physical patch meshes.
function garmentGeometry(levels:number[][],segments=64){
 const verts:number[]=[],uv:number[]=[],indices:number[]=[];
 levels.forEach(([y,rx,rz],j)=>{for(let i=0;i<=segments;i++){
  const a=i/segments*Math.PI*2;
  const fold=(Math.sin(a*11+j*.8)*.008+Math.sin(a*19-j*.55)*.004)*Math.sin(j/(levels.length-1)*Math.PI);
  const x=Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.8*(rx+fold);
  const z=Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.7*(rz+fold);
  verts.push(x,y,z);uv.push(i/segments,j/(levels.length-1));
  if(j<levels.length-1&&i<segments){const n=j*(segments+1)+i;indices.push(n,n+segments+1,n+1,n+1,n+segments+1,n+segments+2)}
 }});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function labelTexture(lines:string[],dark=false){
 const c=document.createElement('canvas');c.width=1024;c.height=512;const ctx=c.getContext('2d')!;
 ctx.fillStyle=dark?'#172024':'#dce1da';ctx.fillRect(0,0,1024,512);
 ctx.strokeStyle=dark?'#6a7476':'#7b817d';ctx.lineWidth=4;ctx.setLineDash([8,8]);ctx.strokeRect(16,16,992,480);ctx.setLineDash([]);
 lines.forEach((s,i)=>{ctx.fillStyle=i===0?'#ff682e':dark?'#e9eee7':'#1b2326';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${i===0?'600':'800'} ${i===0?55:lines.length===2?100:74}px Arial`;ctx.fillText(s.toUpperCase(),512,lines.length===2?160+i*160:100+i*140,910)});
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function Patch({position,p,rotation=[0,0,0],size=[.65,.28],selected,onSelect,onHover}:{position:Vec;p:Position;rotation?:Vec;size?:[number,number];selected:boolean;onSelect:Props['onSelect'];onHover:Props['onHover']}){
 const [hover,setHover]=useState(false);
 const texture=useMemo(()=>labelTexture([`${String(p.number).padStart(2,'0')} / ${p.owner?'SPONSOR':'YOUR BRAND'}`,p.owner?.name||p.name],true),[p.number,p.name,p.owner?.name]);
 useEffect(()=>()=>texture.dispose(),[texture]);
 function over(e:ThreeEvent<PointerEvent>){e.stopPropagation();setHover(true);onHover(p.id);document.body.style.cursor='pointer'}
 function out(){setHover(false);onHover(null);document.body.style.cursor=''}
 return <group position={position} rotation={rotation}><mesh onPointerOver={over} onPointerOut={out} onClick={e=>{if(e.delta>5)return;e.stopPropagation();onSelect(p.id)}}><boxGeometry args={[size[0]+.026,size[1]+.025,.018]}/><meshStandardMaterial color={hover||selected?ORANGE:'#3b4446'} roughness={.6} emissive={ORANGE} emissiveIntensity={(hover||selected) ? .6 : 0}/></mesh><mesh position={[0,0,.011]} onPointerOver={over} onPointerOut={out} onClick={e=>{if(e.delta>5)return;e.stopPropagation();onSelect(p.id)}}><planeGeometry args={size}/><meshStandardMaterial map={texture} roughness={.85} emissive={hover?'#51220e':'#000'} emissiveIntensity={.3}/></mesh></group>
}
function Stitch({points,color=ORANGE,radius=.008}:{points:Vec[];color?:string;radius?:number}){
 const geometry=useMemo(()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),40,radius,5,false),[points,color,radius]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry}><meshStandardMaterial color={color} roughness={.72}/></mesh>
}
function Box({position=[0,0,0],scale,color=DARK,rotation=[0,0,0]}:{position?:Vec;scale:Vec;color?:string;rotation?:Vec}){return <mesh position={position} rotation={rotation} castShadow receiveShadow><boxGeometry args={scale}/><meshStandardMaterial color={color} roughness={.75} metalness={.1}/></mesh>}
function Jacket(props:Props){
 const torso=useMemo(()=>garmentGeometry([[-1.15,.51,.25],[-1.08,.55,.28],[-.94,.57,.29],[-.75,.58,.31],[-.55,.60,.31],[-.35,.62,.33],[-.1,.65,.34],[.13,.68,.34],[.35,.72,.33],[.56,.73,.3],[.7,.66,.27],[.81,.38,.22]]),[]);
 const arm=useMemo(()=>garmentGeometry([[-1.68,.14,.16],[-1.6,.165,.18],[-1.45,.18,.2],[-1.28,.185,.21],[-1.1,.2,.22],[-.9,.21,.22],[-.7,.22,.24],[-.48,.24,.25],[-.28,.25,.26],[-.12,.23,.23],[0,.13,.18]],40),[]);
 const hem=useMemo(()=>garmentGeometry([[-1.16,.51,.25],[-1.1,.54,.265],[-1.02,.55,.27]],48),[]);
 const brand=useMemo(()=>labelTexture(['SEND ME','SOMEWHERE'],true),[]);
 useEffect(()=>()=>{torso.dispose();arm.dispose();hem.dispose();brand.dispose()},[torso,arm,hem,brand]);
 function patch(id:string,position:Vec,size:[number,number],rotation:Vec=[0,0,0]){const p=props.positions.find(p=>p.id===id)!;return <Patch key={id} p={p} position={position} size={size} rotation={rotation} selected={props.selected===id} onSelect={props.onSelect} onHover={props.onHover}/>}
 return <group position={[0,.65,0]}>
  <mesh geometry={torso} castShadow receiveShadow><meshStandardMaterial color={IVORY} roughness={.94} side={THREE.DoubleSide}/></mesh>
  <mesh geometry={hem} castShadow><meshStandardMaterial color={DARK} roughness={1}/></mesh>
  {/* Contrasting shoulder yoke and side panels wrap around the garment. */}
  {[-1,1].map(s=><group key={s}>
   <mesh position={[s*.53,.63,0]} rotation={[0,0,s*-.2]} scale={[.36,.12,.31]} castShadow><sphereGeometry args={[1,24,16]}/><meshStandardMaterial color={DARK} roughness={.85}/></mesh>
   <mesh position={[s*.53,-.54,0]} scale={[.105,.53,.294]} castShadow><sphereGeometry args={[1,20,20]}/><meshStandardMaterial color={DARK} roughness={.84}/></mesh>
   <group position={[s*.70,.66,0]} rotation={[0,0,s*.27]}>
    <mesh geometry={arm} castShadow><meshStandardMaterial color={DARK} roughness={.92}/></mesh>
    <mesh position={[0,-1.59,0]}><cylinderGeometry args={[.163,.14,.16,40]}/><meshStandardMaterial color={ORANGE} roughness={.85}/></mesh>
    <Stitch points={[[s*.2,-.15,.12],[s*.2,-.65,.15],[s*.17,-1.18,.13],[s*.13,-1.5,.1]]}/>
    {patch(s===1?'left-sleeve':'right-sleeve',[0,-.57,.247],[.32,.38])}
    {patch(s===1?'left-forearm':'right-forearm',[0,-1.19,.213],[.26,.26])}
    {patch(s===1?'left-shoulder':'right-shoulder',[s*.155,-.13,.145],[.25,.18],[0,s*.6,0])}
   </group>
   <Stitch points={[[s*.42,.71,.218],[s*.58,.42,.30],[s*.54,-.14,.325],[s*.43,-.83,.288]]} radius={.01}/>
   <Stitch points={[[s*.42,.71,-.218],[s*.58,.42,-.30],[s*.54,-.14,-.325],[s*.43,-.83,-.288]]} radius={.01}/>
   <Box position={[s*.35,-.69,.29]} scale={[.3,.025,.014]} color="#65706c" rotation={[0,0,s*.22]}/>
  </group>)}
  <mesh position={[0,.85,0]}><cylinderGeometry args={[.235,.31,.19,48,1,true]}/><meshStandardMaterial color={DARK} side={THREE.DoubleSide} roughness={.95}/></mesh>
  <mesh position={[0,.953,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.237,.014,8,60]}/><meshStandardMaterial color={ORANGE}/></mesh>
  <Box position={[0,-.08,.348]} scale={[.025,1.84,.021]} color="#343b3e"/>
  {Array.from({length:44},(_,i)=><Box key={i} position={[0,.74-i*.04,.361]} scale={[.039,.012,.013]} color="#969e9a"/>)}
  <Box position={[0,.57,.372]} scale={[.047,.095,.024]} color="#6d7578"/>
  <mesh position={[0,-.81,.302]}><planeGeometry args={[.63,.25]}/><meshStandardMaterial map={brand} roughness={.9}/></mesh>
  {patch('main-chest',[0,-.12,.365],[.96,.38])}
  {patch('left-chest',[.32,.39,.334],[.43,.20])}
  {patch('right-chest',[-.32,.39,.334],[.43,.20])}
  {patch('main-back',[0,.08,-.361],[1.02,.69],[0,Math.PI,0])}
  <mesh position={[0,-.70,-.312]} rotation={[0,Math.PI,0]}><planeGeometry args={[.75,.28]}/><meshStandardMaterial map={brand} roughness={.9}/></mesh>
 </group>
}
function Gear(props:Props){
 function patch(id:string,pos:Vec,size:[number,number],rotation:Vec=[0,0,0]){return <Patch p={props.positions.find(p=>p.id===id)!} position={pos} size={size} rotation={rotation} selected={props.selected===id} onSelect={props.onSelect} onHover={props.onHover}/>}
 return <group>
  <group position={[-1.15,.08,.28]} rotation={[0,.2,0]}><Box scale={[1,.64,.05]} color="#626e73"/>{patch('laptop',[0,0,.04],[.66,.32])}<Box position={[0,-.33,.3]} scale={[1,.035,.64]} color="#404b51"/></group>
  <group position={[.07,.46,-.15]}><mesh scale={[.48,.65,.24]} castShadow><sphereGeometry args={[1,32,24]}/><meshStandardMaterial color="#242e31" roughness={1}/></mesh><Box position={[0,-.23,.21]} scale={[.66,.35,.14]}/>{patch('backpack',[0,.16,.23],[.54,.3])}<Stitch points={[[-.2,.61,0],[-.16,.79,0],[.16,.79,0],[.2,.61,0]]} radius={.035}/></group>
  <group position={[1.23,.23,0]}><Box scale={[.71,1.11,.36]} color="#79847e"/>{Array.from({length:7},(_,i)=><Box key={i} position={[-.3+i*.1,0,.2]} scale={[.025,1,.024]} color="#52615d"/>)}{patch('luggage',[0,.04,.227],[.52,.27])}<Stitch points={[[-.22,.55,0],[-.22,1.02,0],[.22,1.02,0],[.22,.55,0]]} color="#a1aaa5" radius={.023}/>{[-.24,.24].map(x=><mesh position={[x,-.61,0]} key={x} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.07,.07,.12,16]}/><meshStandardMaterial color={DARK}/></mesh>)}</group>
  <group position={[-.75,1.18,0]}><mesh scale={[.35,.26,.3]}><sphereGeometry args={[1,32,16,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color={ORANGE} side={THREE.DoubleSide}/></mesh><mesh position={[0,0,.24]} scale={[.37,.025,.32]}><sphereGeometry args={[1,24,12]}/><meshStandardMaterial color={DARK}/></mesh>{patch('hat',[0,.10,.28],[.34,.16])}</group>
  <group position={[.0,-.64,.54]} rotation={[-.12,0,0]}><Box scale={[.68,.43,.025]} color={ORANGE}/>{patch('wildcard',[0,0,.025],[.6,.35])}</group>
 </group>
}
function Route({reduced}:{reduced:boolean}){
 const dot=useRef<THREE.Mesh>(null);
 const curve=useMemo(()=>new THREE.CatmullRomCurve3([new THREE.Vector3(-2.9,-1.08,-.7),new THREE.Vector3(-1.9,-.22,-1.7),new THREE.Vector3(0,.35,-2.7),new THREE.Vector3(2.15,.12,-1.8),new THREE.Vector3(2.95,-1.08,-.7)]),[]);
 useFrame(({clock})=>{if(dot.current)dot.current.position.copy(curve.getPoint(reduced?.5:(clock.elapsedTime*.045)%1))});
 const tube=useMemo(()=>new THREE.TubeGeometry(curve,100,.008,4,false),[curve]);
 useEffect(()=>()=>tube.dispose(),[tube]);
 return <group><mesh geometry={tube}><meshBasicMaterial color="#7d5439" transparent opacity={.65}/></mesh><mesh ref={dot}><sphereGeometry args={[.038,12,8]}/><meshBasicMaterial color={ORANGE}/></mesh>{[-2.9,2.95].map(x=><group key={x} position={[x,-1.08,-.7]}><mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.1,.12,32]}/><meshBasicMaterial color={ORANGE} side={THREE.DoubleSide}/></mesh><mesh><sphereGeometry args={[.027,10,8]}/><meshBasicMaterial color={ORANGE}/></mesh></group>)}</group>
}
function World(props:Props){
 const kit=useRef<THREE.Group>(null);const jacket=useRef<THREE.Group>(null);const gear=useRef<THREE.Group>(null);
 const yaw=useRef(-.23),target=useRef(-.23),velocity=useRef(0),drag=useRef(false),last=useRef(0),settling=useRef(true);
 const {gl,camera,invalidate}=useThree();
 useEffect(()=>{target.current=(props.view==='back'?Math.PI:props.view==='gear'?-.12:-.23)+props.rotation;settling.current=true;velocity.current=0;invalidate()},[props.view,props.rotation,props.resetKey,invalidate]);
 useEffect(()=>{const el=gl.domElement;
 const down=(e:PointerEvent)=>{drag.current=true;last.current=e.clientX;velocity.current=0;settling.current=false;el.setPointerCapture(e.pointerId)};
 const move=(e:PointerEvent)=>{if(!drag.current)return;velocity.current=(e.clientX-last.current)*.008;yaw.current+=velocity.current;last.current=e.clientX;invalidate()};
 const up=()=>{drag.current=false};
 el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);
 return()=>{el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);el.removeEventListener('lostpointercapture',up);document.body.style.cursor=''};
 },[gl,invalidate]);
 useFrame(({clock,size},delta)=>{
  const d=Math.min(delta,.04);if(settling.current){yaw.current=THREE.MathUtils.damp(yaw.current,target.current,props.reduced?40:7,d);if(Math.abs(yaw.current-target.current)<.001)settling.current=false}
  else if(!drag.current){yaw.current+=velocity.current;velocity.current*=Math.exp(-d*5)}
  if(kit.current){kit.current.rotation.y=yaw.current;kit.current.position.y=props.reduced?0:Math.sin(clock.elapsedTime*.7)*.022}
  const isGear=props.view==='gear';if(jacket.current){const s=THREE.MathUtils.damp(jacket.current.scale.x,isGear?.001:1,9,d);jacket.current.scale.setScalar(s);jacket.current.visible=s>.02}
  if(gear.current){const s=THREE.MathUtils.damp(gear.current.scale.x,isGear?1:.001,9,d);gear.current.scale.setScalar(s);gear.current.visible=s>.02}
  const mobile=size.width<700;camera.position.z=THREE.MathUtils.damp(camera.position.z,mobile?7.7:6.3,4,d);camera.position.x=THREE.MathUtils.damp(camera.position.x,mobile?0:-.15,3,d);camera.lookAt(0,.27,0);
 });
 return <><color attach="background" args={['#0b1013']}/><fog attach="fog" args={['#0b1013',10,23]}/><ambientLight intensity={.75}/><hemisphereLight args={['#e7f5ef','#363327',1.5]}/><directionalLight position={[2,5,4]} intensity={3.3} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-normalBias={.04}/><pointLight position={[-3,1,-2]} color={ORANGE} intensity={14}/><directionalLight position={[-3,2,2]} color="#b7d2e2" intensity={1.6}/>
  <group ref={kit}><group ref={jacket}><Jacket {...props}/></group><group ref={gear} scale={.001} visible={false}><Gear {...props}/></group></group>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,-1.18,0]} receiveShadow><planeGeometry args={[100,100]}/><meshStandardMaterial color="#0e1518" roughness={.83}/></mesh>
  <mesh position={[0,-1.19,0]} receiveShadow><cylinderGeometry args={[1.8,1.9,.12,96]}/><meshStandardMaterial color="#1b2428" roughness={.72} metalness={.4}/></mesh>
  {[1.9,2.28,3.18].map((r,i)=><mesh key={r} rotation={[-Math.PI/2,0,0]} position={[0,-1.122-i*.012,0]}><ringGeometry args={[r,r+.008,120]}/><meshBasicMaterial color={i===0?'#b4512d':'#293b41'} transparent opacity={.65} side={THREE.DoubleSide}/></mesh>)}
  <gridHelper args={[40,80,'#203037','#192429']} position={[0,-1.175,0]}/><Route reduced={props.reduced}/>
 </>
}
class SceneBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true}}render(){return this.state.failed?this.props.fallback:this.props.children}}
export default function Scene(props:Props){
 const [available,setAvailable]=useState<boolean|null>(null);const [contextLost,setContextLost]=useState(false);
 useEffect(()=>{const c=document.createElement('canvas');const context=c.getContext('webgl2');setAvailable(!!context);context?.getExtension('WEBGL_lose_context')?.loseContext()},[]);
 const fallback=<div className="webgl-fallback"><LayersFallback/><h3>Explore every position.</h3><p>The 3D view is unavailable on this device. All 15 placements are available in View sponsors.</p></div>;
 if(available===null)return <div className="scene-loading"><span className="loader-ring"/><span>Preparing the mission kit</span></div>;
 if(!available||contextLost)return fallback;
 return <SceneBoundary fallback={fallback}><Canvas shadows dpr={[1,1.6]} camera={{position:[0,1.1,6.3],fov:38}} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} onCreated={({gl})=>{gl.domElement.addEventListener('webglcontextlost',()=>setContextLost(true),{once:true});gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.05}}><World {...props}/></Canvas></SceneBoundary>
}
function LayersFallback(){return <span className="fallback-number">15</span>}
