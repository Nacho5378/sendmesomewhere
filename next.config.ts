import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
const config: NextConfig = {
  poweredByHeader: false,
  async headers() { return [{source:'/(.*)',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}
  ]}]; }
};
export default (phase: string) => ({...config, distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next', allowedDevOrigins: ['terminal.local']});
