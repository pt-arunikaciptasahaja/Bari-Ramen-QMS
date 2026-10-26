import { driveSnapshot, slideImage, tvMediaAccess } from '@/lib/server-tv-slides';
import { DRIVE_ID } from '@/lib/drive-slides';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  const denied = await tvMediaAccess(request); if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!DRIVE_ID.test(id)) return new Response(null,{status:400});
  try {
    const {slides} = await driveSnapshot();
    const slide = slides.find(slide=>slide.id===id);
    if (!slide) return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
    const bytes = Buffer.from(await slideImage(slide),'base64');
    return new Response(bytes,{headers:{'Content-Type':'image/webp','Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});
  } catch { return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}}); }
}
