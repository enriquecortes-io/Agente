export const dynamic = 'force-dynamic';

export async function GET() {
 const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
 const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://harvis-six.vercel.app'}/api/auth/callback`;
 
 const params = new URLSearchParams({
   client_id: clientId!,
   redirect_uri: redirectUri,
   response_type: 'code',
   scope: 'https://www.googleapis.com/auth/drive',
   access_type: 'offline',
   prompt: 'consent',
 });

 return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
