import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Send Me Somewhere — Mission 01',description:'A developer from Ethiopia. A jacket powered by sponsors. Explore the journey from Addis Ababa to Dubai for GITEX Global 2026.',metadataBase:new URL('https://sendmesomewhere.veridianapi.com'),robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
