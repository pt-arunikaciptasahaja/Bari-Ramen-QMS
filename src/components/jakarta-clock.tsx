'use client';
import { useEffect, useState } from 'react';
import { formatJakartaClock } from '@/lib/jakarta-clock';
export function JakartaClock() {
  const [now,setNow] = useState(0);
  useEffect(() => {
    const tick=()=>setNow(Date.now()); tick();
    const timer=setInterval(tick,1000);
    return ()=>clearInterval(timer);
  },[]);
  return <time className="customer-clock" aria-label="Waktu Jakarta" dateTime={now ? new Date(now).toISOString() : undefined}>{formatJakartaClock(now)}</time>;
}
