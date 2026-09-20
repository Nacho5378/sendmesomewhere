import {spawnSync} from 'node:child_process';
if(process.env.VERCEL_ENV==='production'){console.error('Production deployment requires owner approval.');process.exit(1)}
const result=spawnSync('npm',['run','build'],{stdio:'inherit',shell:process.platform==='win32'});process.exit(result.status??1);
