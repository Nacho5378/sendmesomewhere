import {spawnSync} from 'node:child_process';
// Owner approved production deployment of the pre-launch build on 2026-09-20.
// Auction and payment authorization remain false in lib/release.ts.
const result=spawnSync('npm',['run','build'],{stdio:'inherit',shell:process.platform==='win32'});process.exit(result.status??1);
