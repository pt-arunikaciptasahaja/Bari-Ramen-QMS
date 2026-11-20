import { unstable_cache } from 'next/cache';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { singleFlight } from './single-flight';
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
// Authentication and current folder membership remain per-request in the route.
// Simultaneous TVs on one instance share downloads/cache misses, never auth.
export const slideImage = singleFlight(
  (slide: DriveSlide, previousEtag: string | null = null) =>
    JSON.stringify([slide.id, slide.version, slide.resourceKey, previousEtag]),
  async (slide: DriveSlide, previousEtag: string | null = null) => {
  // Real revisions share work across displays. The HTML adapter's minute token
  // still checks for replacements, but unchanged bytes never need re-encoding.
  let source: Buffer | undefined;
  const digest = await unstable_cache(async () => {
    source = await loadDriveImage(slide);
    return createHash('sha256').update(source).digest('hex');
  },['bari-tv-source-digest-v2',slide.id,slide.version],{revalidate:86400})();
  const etag = `"${digest}"`;
  // Return before reading the larger encoded-image cache for an unchanged TV.
  if (previousEtag === etag) return {body:null,etag};
  return unstable_cache(async () => {
    const body = source ?? await loadDriveImage(slide);
    // A replaced file must not be saved under an earlier revision's key.
    if (createHash('sha256').update(body).digest('hex') !== digest)
      throw new Error('Media changed during refresh');
    const image = await sharp(body,{limitInputPixels:25_000_000}).rotate()
      .resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
    return {body:image.toString('base64'), etag:`"${digest}"`};
  },['bari-tv-webp-v2',digest],{revalidate:86400})();
});
