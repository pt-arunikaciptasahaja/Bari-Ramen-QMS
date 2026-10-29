import { unstable_cache } from 'next/cache';
import sharp from 'sharp';
import { serverDb } from './server-push';
import { isDemo } from './supabase';
import { loadDriveSlides, loadDriveImage, createSlideCatalog, type DriveSlide } from './drive-slides';

export async function tvMediaAccess(request: Request): Promise<Response | null> {
  // Preview/local demo has no production credentials or customer data.
  if (isDemo) return null;
  const bearer = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if (!bearer) return Response.json({error:'Akses staf diperlukan'},{status:401});
  try {
    const db = serverDb(bearer);
    const {data:user,error} = await db.auth.getUser(bearer);
    if (error || !user.user) return Response.json({error:'Sesi berakhir'},{status:401});
    const {data:staff,error:roleError} = await db.rpc('is_staff');
    if (roleError || !staff) return Response.json({error:'Akses staf diperlukan'},{status:403});
    return null;
  } catch { return Response.json({error:'Akses belum dapat diperiksa'},{status:503}); }
}
const snapshot = createSlideCatalog(loadDriveSlides);
export function driveSnapshot() { return snapshot(); }
export function slideImage(slide: DriveSlide) {
  return unstable_cache(async () => {
    const body = await loadDriveImage(slide);
    const image = await sharp(body,{limitInputPixels:25_000_000}).rotate()
      .resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
    return image.toString('base64');
  },['bari-tv-slide',slide.id,slide.version],{revalidate:60})();
}
