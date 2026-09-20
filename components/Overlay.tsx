'use client';
import * as Dialog from '@radix-ui/react-dialog';
import {X} from 'lucide-react';
export default function Overlay({open,onClose,title,description,children,wide=false}:{open:boolean;onClose:()=>void;title:string;description:string;children:React.ReactNode;wide?:boolean}){
return <Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose()}}><Dialog.Portal><Dialog.Overlay className="overlay-backdrop"/><Dialog.Content className={`overlay-panel ${wide?'wide':''}`}><div className="panel-header"><span className="eyebrow">SEND ME SOMEWHERE / MISSION 01</span><Dialog.Close className="icon-button" aria-label="Close panel"><X size={20}/></Dialog.Close></div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className="panel-description">{description}</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
