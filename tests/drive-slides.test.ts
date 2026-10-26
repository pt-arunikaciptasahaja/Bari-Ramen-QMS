import test from 'node:test';
import assert from 'node:assert/strict';
import {createSlideCatalog,parsePublicFolder,loadDriveSlides,loadDriveImage,limitedBody,googleMediaHost} from '../src/lib/drive-slides';
import {nextSlideId} from '../src/lib/slideshow';
const row=(id:string,name:string)=>`<tr role="row" data-target="doc" data-id="${id}"><div data-id="${id}" data-tooltip="${name} Image"></div></tr>`;
const folder=(rows:string)=>`<html><title>TV - Google Drive</title><table>${rows}</table></html>`;
const a='aaaaaaaaaaaa', b='bbbbbbbbbbbb', c='cccccccccccc';
test('public folder snapshots reflect additions/deletions and sort names naturally',()=>{
  const initial=parsePublicFolder(folder(row(a,'10-menu.png')+row(b,'2-menu.jpg')),60000);
  assert.deepEqual(initial.map(s=>s.id),[b,a]);
  const updated=parsePublicFolder(folder(row(c,'1-new.webp')+row(b,'2-menu.jpg')),120000);
  assert.deepEqual(updated.map(s=>s.id),[c,b]);
  assert.ok(!updated.some(s=>s.id===a));
  assert.notEqual(initial[0].version,updated[1].version);
  assert.equal(nextSlideId(updated,a),c);
  assert.equal(nextSlideId(updated,b),c);
});
test('public adapter decodes file names, deduplicates and rejects unsupported files',()=>{
  const slides=parsePublicFolder(folder(row(a,'1-Ramen &amp; Gyoza.png')+row(a,'1-Ramen &amp; Gyoza.png')+row(b,'script.svg')+row(c,'document.pdf')));
  assert.equal(slides.length,1); assert.equal(slides[0].name,'1-Ramen & Gyoza.png');
});
test('unknown/login/partial layouts fail closed instead of pretending the folder is empty',()=>{
  for(const html of ['<title>Sign in</title>',folder('unexpected markup'),folder(Array.from({length:50},(_,i)=>row(a+i,'menu.png')).join(''))]) assert.throws(()=>parsePublicFolder(html));
  assert.deepEqual(parsePublicFolder(folder('This folder is empty')),[]);
  assert.deepEqual(parsePublicFolder(folder(row(a,'note.pdf'))),[]);
});
test('supported Drive API follows pagination and only returns raster image files',async()=>{
  const urls:URL[]=[];
  const fetcher=(async(input:RequestInfo|URL)=>{
    const url=new URL(String(input)); urls.push(url);
    assert.match(url.searchParams.get('q') ?? '',/trashed = false/);
    return Response.json(urls.length===1 ? {files:[{id:a,name:'2-menu.png',mimeType:'image/png',md5Checksum:'rev1'}],nextPageToken:'page2'} : {files:[{id:b,name:'1-poster.jpg',mimeType:'image/jpeg',modifiedTime:'revision'},{id:c,name:'unsafe.svg',mimeType:'image/svg+xml'}]});
  }) as typeof fetch;
  const slides=await loadDriveSlides(fetcher,'fixture-api-key');
  assert.deepEqual(slides.map(s=>s.id),[b,a]);
  assert.equal(urls[1].searchParams.get('pageToken'),'page2');
  assert.equal(slides[1].version,'rev1');
  assert.ok(!JSON.stringify(slides).includes('fixture-api-key'));
});
test('public transport handles failed folder requests without leaking partial content',async()=>{
  await assert.rejects(loadDriveSlides((async()=>new Response('No access',{status:403})) as typeof fetch,''));
  const slides=await loadDriveSlides((async()=>new Response(folder(row(a,'photo.png')))) as typeof fetch,'');
  assert.equal(slides[0].id,a);
});
test('image transport rejects SSRF redirects and non-image responses',async()=>{
  assert.equal(googleMediaHost(new URL('https://lh3.googleusercontent.com/image')),true);
  for(const url of ['http://drive.google.com/x','https://evil.test/x','https://user:pass@drive.google.com/x','https://drive.google.com.evil.test/x','https://drive.google.com:444/x']) assert.equal(googleMediaHost(new URL(url)),false);
  let requests=0;
  await assert.rejects(loadDriveImage({id:a,name:'test.png',version:'1'},(async()=>{requests++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/internal'}});}) as typeof fetch));
  assert.equal(requests,1);
  await assert.rejects(loadDriveImage({id:a,name:'test.png',version:'1'},(async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}})) as typeof fetch));
  await assert.rejects(loadDriveImage({id:'../../secret',name:'x',version:'1'}));
});
test('bounded reads reject oversized streams, including missing content-length',async()=>{
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(8));c.enqueue(new Uint8Array(8));c.close();}});
  await assert.rejects(limitedBody(new Response(stream),10));
  assert.equal((await limitedBody(new Response('photo'),10)).toString(),'photo');
});
test('production TV media routes reject unauthenticated requests before listing or fetching',async()=>{
  const beforeUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, beforeKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture';
  try {
    const {GET:list}=await import('../src/app/api/tv/slides/route');
    const {GET:image}=await import('../src/app/api/tv/slides/image/route');
    assert.equal((await list(new Request('https://example.com/api/tv/slides'))).status,401);
    assert.equal((await image(new Request('https://example.com/api/tv/slides/image?id='+a))).status,401);
  } finally {
    if (beforeUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=beforeUrl;
    if (beforeKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=beforeKey;
  }
});

test('catalogue waits for a fresh list after expiry, coalesces readers and retries failures',async()=>{
  let time=0,reads=0,fail=false;
  const catalog=createSlideCatalog(async()=>{
    reads++; if(fail)throw new Error('offline');
    return [{id:reads===1?a:b,name:'poster.png',version:String(reads)}];
  },()=>time);
  const first=await Promise.all([catalog(),catalog()]); assert.equal(reads,1);
  assert.equal(first[0].slides[0].id,a);
  time=29999;assert.equal((await catalog()).slides[0].id,a);assert.equal(reads,1);
  time=30000;assert.equal((await catalog()).slides[0].id,b);assert.equal(reads,2);
  time=60000;fail=true;await assert.rejects(catalog());
  fail=false;const recovered=await catalog();assert.equal(recovered.checkedAt,60000);assert.equal(reads,4);
});
