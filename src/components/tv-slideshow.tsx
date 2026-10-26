'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { isDemo, supabase } from '@/lib/supabase';
import { canAdvanceSlide, nextSlideId } from '@/lib/slideshow';
import type { DriveSlide } from '@/lib/drive-slides';

type Slide = Pick<DriveSlide,'id'|'name'|'version'>;
async function mediaFetch(url: string, signal: AbortSignal) {
  const headers: Record<string,string> = {};
  if (!isDemo) {
    const {data,error} = await supabase().auth.getSession();
    if (error || !data.session) throw new Error('Sesi staf berakhir');
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return fetch(url,{headers,signal,cache:'no-store'});
}
export function TVSlideshow() {
  const [slides,setSlides] = useState<Slide[]>([]);
  const [active,setActive] = useState('');
  const [freshAt,setFreshAt] = useState(0);
  const [now,setNow] = useState(0);
  const [frame,setFrame] = useState<{id:string;name:string;src:string;version:string;loadedAt:number}|null>(null);
  const objectUrl = useRef('');
  const loadingImage = useRef(false);
  const shownAt = useRef(0);
  const [listAttempt,setListAttempt] = useState(0);
  const [listIssue,setListIssue] = useState('');
  const [imageIssue,setImageIssue] = useState('');
  useEffect(() => {
    let alive = true, busy = false;
    let request: AbortController | null = null;
    const refresh = async () => {
      if (!alive || busy) return;
      busy = true; request = new AbortController(); setListAttempt(Date.now());
      const timeout = setTimeout(()=>request?.abort(),20000);
      try {
        const response = await mediaFetch(`/api/tv/slides?t=${Math.floor(Date.now()/60000)}`,request.signal);
        if (!response.ok) throw new Error(`list-http-${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.slides) || typeof data.checkedAt!=='number' || data.checkedAt>Date.now()+60000 || Date.now()-data.checkedAt>120000) throw new Error('list-expired');
        const next: Slide[] = data.slides.filter((slide: Slide)=>typeof slide.id==='string' && typeof slide.name==='string' && typeof slide.version==='string');
        if (alive) {
          setSlides(next); setFreshAt(data.checkedAt); setNow(Date.now()); setListIssue('');
          setActive(previous=>next.some(slide=>slide.id===previous) ? previous : next[0]?.id ?? '');
        }
      } catch (error) {
        if (alive) setListIssue(error instanceof Error && /^list-[a-z0-9-]+$/.test(error.message) ? error.message : 'list-network');
      }
      finally { clearTimeout(timeout); busy = false; }
    };
    const visible = () => { if (document.visibilityState==='visible') void refresh(); };
    void refresh();
    const interval = setInterval(()=>void refresh(),60000);
    window.addEventListener('online',refresh); document.addEventListener('visibilitychange',visible);
    return () => { alive=false; clearInterval(interval); request?.abort(); window.removeEventListener('online',refresh); document.removeEventListener('visibilitychange',visible); };
  },[]);
  useEffect(() => {
    const timer = setInterval(()=>{
      setNow(Date.now());
      if (canAdvanceSlide(loadingImage.current,shownAt.current,Date.now())) setActive(previous=>nextSlideId(slides,previous));
    },10000);
    return ()=>clearInterval(timer);
  },[slides]);
  const selected = slides.find(slide=>slide.id===active) ?? slides[0];
  useEffect(() => {
    if (!selected) return;
    let alive = true, localUrl = '';
    loadingImage.current=true;
    const request = new AbortController();
    const timeout = setTimeout(()=>request.abort(),25000);
    void (async () => {
      try {
        const response = await mediaFetch(`/api/tv/slides/image?id=${encodeURIComponent(selected.id)}&v=${encodeURIComponent(selected.version)}`,request.signal);
        if (!response.ok) throw new Error(`image-http-${response.status}`);
        if (response.headers.get('content-type')!=='image/webp') throw new Error('image-type');
        localUrl = URL.createObjectURL(await response.blob());
        const image = new window.Image(); image.src = localUrl; await image.decode();
        if (!alive) { URL.revokeObjectURL(localUrl); return; }
        const old = objectUrl.current; objectUrl.current=localUrl;
        shownAt.current=Date.now(); setImageIssue('');
        setFrame({id:selected.id,name:selected.name,src:localUrl,version:selected.version,loadedAt:Date.now()});
        if (old) URL.revokeObjectURL(old);
      } catch (error) {
        if (localUrl) URL.revokeObjectURL(localUrl);
        if (alive) setImageIssue(error instanceof Error && /^image-[a-z0-9-]+$/.test(error.message) ? error.message : 'image-network');
      }
      finally { clearTimeout(timeout); if (alive) loadingImage.current=false; }
    })();
    return ()=>{ alive=false; loadingImage.current=false; clearTimeout(timeout); request.abort(); };
  },[selected?.id,selected?.version]);
  useEffect(()=>()=>{ if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); },[]);
  const visible = frame && now-freshAt<=120000 && slides.some(slide=>slide.id===frame.id && (slide.version===frame.version || now-frame.loadedAt<=120000));
  return <figure className="tv-menu-feature tv-slideshow" aria-label="Materi Bari Ramen" data-slide-updated-at={freshAt} data-slide-count={slides.length} data-slide-frame={frame?.id ?? ""} data-slide-loaded-at={frame?.loadedAt ?? 0} data-slide-visible={Boolean(visible)} data-list-attempt={listAttempt} data-list-error={listIssue} data-image-error={imageIssue}>
    <p className="tv-menu-kicker">BARI-RAMEN</p>
    <p lang="ja" className="tv-menu-japanese">バリラーメン</p>
    {visible ? <>
      <div className="tv-slideshow-frame">
        {/* Optimized server-side; blob URLs keep staff tokens out of image URLs. */}
        <img src={frame.src} alt={`Materi Bari Ramen: ${frame.name}`} className="tv-slideshow-image" />
      </div>
      <p className="tv-slide-position" aria-label="Posisi slideshow">{slides.findIndex(slide=>slide.id===frame.id)+1} / {slides.length}</p>
    </> : <>
      <div className="ramen-photo-frame"><Image src="/brand/bari-ramen-bowls-source.jpg" alt="Tiga mangkuk ramen Bari Ramen dengan beragam topping." width={709} height={1536} sizes="(min-width: 640px) 34vw, 100vw" className="ramen-photo-source" /></div>
      <figcaption className="tv-menu-caption">Semangkuk ramen,<br />banyak cerita.</figcaption>
    </>}
  </figure>;
}
