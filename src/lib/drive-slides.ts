// Public marketing media only. This module never reads customer/queue data.
export const TV_DRIVE_FOLDER = '1wWndTHaR5FNv4FRu5SC-QvRoJ9GkpGJk';
export const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
export type DriveSlide = { id: string; name: string; version: string; resourceKey?: string };
const IMAGE_NAME = /\.(?:png|jpe?g|webp|avif)$/i;
const IMAGE_MIME = /^(?:image\/png|image\/jpeg|image\/webp|image\/avif)$/i;
function decode(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named: Record<string,string> = {'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
    if (named[entity]) return named[entity];
    const code = entity[2]?.toLowerCase() === 'x' ? parseInt(entity.slice(3,-1),16) : parseInt(entity.slice(2,-1),10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}
function attribute(tag: string, name: string) {
  return decode(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? '');
}
export function sortSlides(slides: DriveSlide[]) {
  return [...new Map(slides.map(slide => [slide.id,slide])).values()]
    .sort((a,b) => a.name.localeCompare(b.name,'id',{numeric:true}) || a.id.localeCompare(b.id));
}
/** Best-effort adapter for Google's public folder HTML, not an official API.
 * Unknown/login/partial layouts fail closed; never interpret them as deletions.
 * GOOGLE_DRIVE_API_KEY enables the supported Drive API instead.
 */
export function parsePublicFolder(html: string, now = Date.now()): DriveSlide[] {
  if (!/<title>[^<]* - Google Drive<\/title>/i.test(html)) throw new Error('Folder tidak tersedia');
  const rows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(match=>match[0])
    .filter(row => attribute(row.slice(0,row.indexOf('>')+1),'data-target') === 'doc');
  if (!rows.length && !/(?:This folder is empty|No items|Folder is empty)/i.test(html)) throw new Error('Format folder tidak dikenali');
  if (rows.length >= 50 || /aria-label=["'](?:Load more|Next page)/i.test(html)) throw new Error('Folder terlalu besar');
  const slides: DriveSlide[] = [];
  for (const row of rows) {
    const id = attribute(row.slice(0,row.indexOf('>')+1),'data-id');
    const tooltip = [...row.matchAll(/<[^>]+\bdata-tooltip=["'][^>]*>/gi)]
      .map(match=>attribute(match[0],'data-tooltip')).find(value=>/ Image$/i.test(value));
    const name = tooltip?.replace(/ Image$/i,'') ?? '';
    if (DRIVE_ID.test(id) && IMAGE_NAME.test(name)) slides.push({id,name,version:String(Math.floor(now/60000))});
  }
  return sortSlides(slides);
}
export async function limitedBody(response: Response, limit: number) {
  if (Number(response.headers.get('content-length') ?? 0) > limit) throw new Error('Media terlalu besar');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Respons kosong');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error('Media terlalu besar'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function loadDriveSlides(fetcher: typeof fetch = fetch, apiKey = process.env.GOOGLE_DRIVE_API_KEY) {
  if (!apiKey) {
    const response = await fetcher(`https://drive.google.com/drive/folders/${TV_DRIVE_FOLDER}?hl=en`,
      {cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Drive tidak tersedia');
    return parsePublicFolder((await limitedBody(response,4*1024*1024)).toString('utf8'));
  }
  const slides: DriveSlide[] = []; let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.search = new URLSearchParams({key:apiKey,q:`'${TV_DRIVE_FOLDER}' in parents and trashed = false`,
      fields:'nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime,resourceKey)',
      supportsAllDrives:'true',includeItemsFromAllDrives:'true',pageSize:'100',...(pageToken ? {pageToken} : {})}).toString();
    const response = await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('Drive API tidak tersedia');
    const data = JSON.parse((await limitedBody(response,1024*1024)).toString('utf8'));
    if (!Array.isArray(data.files)) throw new Error('Daftar materi tidak valid');
    for (const file of data.files) {
      if (typeof file.id==='string' && DRIVE_ID.test(file.id) && typeof file.name==='string' && IMAGE_MIME.test(file.mimeType))
        slides.push({id:file.id,name:file.name,version:String(file.md5Checksum ?? file.modifiedTime ?? Math.floor(Date.now()/60000)),
          ...(typeof file.resourceKey==='string' && DRIVE_ID.test(file.resourceKey) ? {resourceKey:file.resourceKey} : {})});
    }
    if (slides.length > 200) throw new Error('Maksimal 200 gambar');
    if (!data.nextPageToken) return sortSlides(slides);
    pageToken = data.nextPageToken;
  }
  throw new Error('Folder terlalu besar');
}
export function googleMediaHost(url: URL) {
  return url.protocol==='https:' && !url.username && !url.password && (!url.port || url.port==='443') &&
    (url.hostname==='drive.google.com' || url.hostname==='drive.usercontent.google.com' || url.hostname.endsWith('.googleusercontent.com'));
}
export async function loadDriveImage(slide: DriveSlide, fetcher: typeof fetch = fetch) {
  if (!DRIVE_ID.test(slide.id)) throw new Error('ID materi tidak valid');
  let url = new URL('https://drive.google.com/thumbnail');
  url.search = new URLSearchParams({id:slide.id,sz:'w1200',...(slide.resourceKey ? {resourcekey:slide.resourceKey} : {})}).toString();
  for (let attempt=0; attempt<4; attempt++) {
    if (!googleMediaHost(url)) throw new Error('Host media tidak diizinkan');
    const response = await fetcher(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000)});
    if ([301,302,303,307,308].includes(response.status)) {
      const target = response.headers.get('location'); if (!target) throw new Error('Redirect tidak valid');
      url = new URL(target,url); continue;
    }
    if (!response.ok || !IMAGE_MIME.test(response.headers.get('content-type')?.split(';')[0] ?? '')) throw new Error('Gambar tidak tersedia');
    return limitedBody(response,12*1024*1024);
  }
  throw new Error('Terlalu banyak redirect');
}

/** Cache only this fixed public catalogue; refresh expired lists synchronously.
 * Do not use stale-while-revalidate here: deletion/freshness matters to posters.
 */
export function createSlideCatalog(loader: () => Promise<DriveSlide[]>, now: () => number = Date.now) {
  let cached: {slides:DriveSlide[];checkedAt:number} | null = null;
  let pending: Promise<{slides:DriveSlide[];checkedAt:number}> | null = null;
  return () => {
    if (cached && now()-cached.checkedAt<30000) return Promise.resolve(cached);
    if (!pending) pending = loader().then(slides=>{
      cached={slides,checkedAt:now()}; return cached;
    }).finally(()=>{pending=null;});
    return pending;
  };
}
