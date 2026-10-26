import { driveSnapshot, tvMediaAccess } from '@/lib/server-tv-slides';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  const denied = await tvMediaAccess(request); if (denied) return denied;
  try {
    const {slides,checkedAt} = await driveSnapshot();
    return Response.json({slides:slides.map(({id,name,version})=>({id,name,version})),checkedAt},
      {headers:{'Cache-Control':'private, no-store'}});
  } catch { return Response.json({error:'Materi belum dapat diperbarui'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
