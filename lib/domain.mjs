export const CAMPAIGN_ID = 'addis-dubai-2026';
export const DURATION_MS = 72 * 60 * 60 * 1000;
export const POSITIONS = [
  ['main-chest','Main Chest',1000,'jacket','The centerpiece. Front and center, wherever the journey goes.'],
  ['main-back','Main Back',1000,'jacket','The largest back placement. A statement from every angle.'],
  ['left-chest','Left Chest',500,'jacket','A close-up position on the upper left chest.'],
  ['right-chest','Right Chest',500,'jacket','A close-up position on the upper right chest.'],
  ['left-shoulder','Left Shoulder',500,'jacket','A distinctive patch on the left shoulder.'],
  ['right-shoulder','Right Shoulder',500,'jacket','A distinctive patch on the right shoulder.'],
  ['left-sleeve','Left Sleeve',500,'jacket','Travel along on the left upper sleeve.'],
  ['right-sleeve','Right Sleeve',500,'jacket','Travel along on the right upper sleeve.'],
  ['left-forearm','Left Forearm',250,'jacket','A compact placement on the left forearm.'],
  ['right-forearm','Right Forearm',250,'jacket','A compact placement on the right forearm.'],
  ['laptop','Laptop',500,'gear','Your brand on the laptop that builds the journey.'],
  ['backpack','Backpack',500,'gear','From airport to event floor, on the everyday backpack.'],
  ['luggage','Luggage',250,'gear','A placement on the carry-on for Mission 01.'],
  ['hat','Hat',250,'gear','A front-facing placement on the mission cap.'],
  ['wildcard','Wildcard',250,'gear','A special placement, with the final format agreed before launch.']
].map(([id,name,dollars,category,description],index)=>({id,name,openingCents:dollars*100,category,description,number:index+1}));
export function nextPrice(openingCents, successfulPurchases) {
  if (!Number.isSafeInteger(openingCents) || openingCents <= 0 || !Number.isInteger(successfulPurchases) || successfulPurchases < 0) throw new Error('Invalid price input');
  const price = openingCents * 2 ** successfulPurchases;
  if (!Number.isSafeInteger(price) || price > 100000000) throw new Error('Price exceeds supported limit');
  return price;
}
export function remainingMs(startsAt, now=Date.now()) {
  if (!startsAt) return null;
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) throw new Error('Invalid auction start');
  return Math.max(0, start + DURATION_MS - now);
}
export function money(cents) { return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100); }
export function initialCampaign() { return {
  id:CAMPAIGN_ID,status:'preview',startsAt:null,endsAt:null,serverNow:new Date().toISOString(),
  paymentsEnabled:false,dataSource:'preview',totalCents:0,
  positions:POSITIONS.map(p=>({...p,owner:null,paidCents:0,purchases:0,currentPriceCents:p.openingCents})),activity:[]
}; }
