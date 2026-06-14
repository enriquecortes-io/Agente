export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
 const { searchParams } = new URL(req.url);
 const code = searchParams.get('code');
 
 if (!code) return new Response('No code', { status: 400 });

 const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
 const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
 const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://harvis-six.vercel.app'}/api/auth/callback`;

 const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
   method: 'POST',
   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
   body: new URLSearchParams({
     code,
     client_id: clientId,
     client_secret: clientSecret,
     redirect_uri: redirectUri,
     grant_type: 'authorization_code',
   }),
 });

 const tokens = await tokenRes.json();
 
 if (tokens.refresh_token) {
   return new Response(`
     <html><body style="background:#0a0a0a;color:#0066FF;font-family:Georgia;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
       <div style="text-align:center">
         <div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:16px">Autorización completada</div>
         <div style="font-size:13px;color:#555;margin-bottom:24px">Copia este refresh token y añádelo a Vercel</div>
         <div style="background:#111;border:1px solid #1a1a1a;padding:16px;border-radius:4px;font-size:12px;word-break:break-all;color:#e8e8e8;max-width:600px">
           GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}
         </div>
       </div>
     </body></html>
   `, { headers: { 'Content-Type': 'text/html' } });
 }

 return new Response(`Error: ${JSON.stringify(tokens)}`, { status: 400 });
}
