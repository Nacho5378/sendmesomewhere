export type Position = {id:string;name:string;number:number;openingCents:number;currentPriceCents:number;paidCents:number;purchases:number;category:string;description:string;owner:null|{name:string;website?:string}};
export type Campaign = {id:string;status:'preview'|'scheduled'|'live'|'closed'|'paused';startsAt:string|null;endsAt:string|null;serverNow:string;paymentsEnabled:boolean;dataSource:string;totalCents:number;positions:Position[];activity:{id:string;name:string;position:string;amountCents:number;at:string}[]};
export type SceneView='front'|'back'|'gear';
