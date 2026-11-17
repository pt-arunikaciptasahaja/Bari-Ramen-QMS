import { driveSnapshot, slideImage, tvMediaAccess } from '@/lib/server-tv-slides';
import { DRIVE_ID } from '@/lib/drive-slides';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function GET(request: Request) {
  const denied = await tvMediaAccess(request); if (denied) return denied;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!DRIVE_ID.test(id)) return new Response(null,{status:400});
  try {
    const {slides} = await driveSnapshot();
    const slide = slides.find(slide=>slide.id===id);
    if (!slide) return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
    const image = await slideImage(slide, request.headers.get('if-none-match'));
    if (image.body === null)
      return new Response(null,{status:304,headers:{ETag:image.etag,'Cache-Control':'private, no-store'}});
    const bytes = Buffer.from(image.body,'base64');
    return new Response(bytes,{headers:{ETag:image.etag,'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch { return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}}); }
}
