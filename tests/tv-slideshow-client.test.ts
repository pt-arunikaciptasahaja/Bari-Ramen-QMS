import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';

test('TV reuses images, reconciles revisions/deletions, pauses hidden tabs and expires stale posters', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'https://tv.example.test',pretendToBeVisual:true});
  const keys = ['window','document','navigator','IS_REACT_ACT_ENVIRONMENT','fetch','setInterval','clearInterval'] as const;
  const saved = keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  const oldNow = Date.now;
  let time = oldNow(), visibility = 'visible', offline = false;
  let slides = [{id:'aaaaaaaaaaaa',name:'A',version:'1'},{id:'bbbbbbbbbbbb',name:'B',version:'1'}];
  const requests: {url:string;etag:string|undefined;status:number}[] = [];
  const timers = new Map<number,{fn:()=>void;ms:number}>(); let timerId=0;
  let contentVersion='original';
  Object.defineProperty(dom.window.document,'visibilityState',{get:()=>visibility});
  Object.defineProperty(dom.window.Image.prototype,'decode',{value:async()=>{}});
  const define = (key:string,value:unknown)=>Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  define('window',dom.window);define('document',dom.window.document);define('navigator',dom.window.navigator);
  define('IS_REACT_ACT_ENVIRONMENT',true);
  define('setInterval',(fn:()=>void,ms:number)=>{timers.set(++timerId,{fn,ms});return timerId;});
  define('clearInterval',(id:number)=>timers.delete(id));
  Date.now = ()=>time;
  define('fetch',async(url:string,options:RequestInit)=>{
    const etag=(options.headers as Record<string,string>)['If-None-Match'];
    const listing=!url.includes('/image?');
    const status=listing ? (offline?503:200) : etag===`"${contentVersion}"` ? 304 : 200;
    requests.push({url,etag,status});
    if(listing) return Response.json(offline?{error:'offline'}:{slides,checkedAt:time},{status});
    return new Response(status===304?null:new Blob([contentVersion]),{status,headers:{'content-type':'image/webp',etag:`"${contentVersion}"`}});
  });
  const hooks=registerHooks({resolve(specifier,context,next){
    return next(specifier === 'next/image' ? new URL('./fixtures/next-image.ts',import.meta.url).href : specifier, context);
  }});
  const root=createRoot(dom.window.document.getElementById('root')!);
  const flush=async(fn:()=>void=()=>{})=>{
    await act(async()=>{fn();await new Promise(resolve=>setImmediate(resolve));});
    await act(async()=>{await new Promise(resolve=>setImmediate(resolve));});
  };
  const tick=async(ms:number)=>{time+=ms;await flush(()=>{for(const timer of [...timers.values()])if(timer.ms===ms)timer.fn();});};
  const images=()=>requests.filter(r=>r.url.includes('/image?'));
  const figure=()=>dom.window.document.querySelector('figure')!;
  try {
    const {TVSlideshow}=await import('../src/components/tv-slideshow');
    await flush(()=>root.render(createElement(TVSlideshow)));
    assert.equal(images().length,1);assert.equal(figure().getAttribute('data-slide-visible'),'true');
    await tick(10000);await tick(10000);await tick(10000);
    assert.equal(images().length,2,'a second rotation must reuse previously downloaded blobs');
    slides=slides.map(s=>({...s,version:'2'}));
    await tick(60000);
    assert.equal(images().at(-1)?.status,304,'new catalogue revision with identical bytes uses a conditional response');
    contentVersion='replacement';slides=slides.map(s=>({...s,version:'3'}));
    await tick(60000);assert.equal(images().at(-1)?.status,200);
    slides=slides.filter(s=>s.id==='aaaaaaaaaaaa');await tick(60000);
    assert.equal(figure().getAttribute('data-slide-frame'),'aaaaaaaaaaaa');
    slides.push({id:'bbbbbbbbbbbb',name:'B',version:'3'});await tick(60000);await tick(10000);
    assert.equal(images().at(-1)?.etag,undefined,'deleted posters are evicted, even if later re-added');
    await flush(()=>{visibility='hidden';dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));});
    const before=requests.length;
    await tick(60000);await tick(10000);await flush(()=>dom.window.dispatchEvent(new dom.window.Event('online')));
    assert.equal(requests.length,before,'hidden tabs do not poll or fetch images');assert.equal(timers.size,0);
    await flush(()=>{visibility='visible';dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));});
    assert.ok(requests.length>before,'visibility restoration immediately refreshes catalogue');
    offline=true;await tick(60000);await tick(60000);await tick(10000);
    assert.equal(figure().getAttribute('data-slide-visible'),'false','stale posters disappear after the existing two-minute limit');
    offline=false;await tick(60000);
    assert.equal(figure().getAttribute('data-slide-visible'),'true','fresh catalogue restores the display');
  } finally {
    await flush(()=>root.unmount());hooks.deregister();dom.window.close();Date.now=oldNow;
    for(const [key,descriptor] of saved)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
  }
});
