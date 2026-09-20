import {spawn} from 'node:child_process';
const args=process.argv.slice(2).flatMap(a=>a==='--host'?['--hostname']:a==='--strictPort'?[]:[a]);
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...args],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
