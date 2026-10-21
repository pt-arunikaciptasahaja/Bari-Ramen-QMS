'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Check } from 'lucide-react';
import { Button } from './ui/button';

async function pushRequest(body: Record<string, unknown>) {
  const response = await fetch('/api/push', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Notifikasi belum dapat diproses. Coba lagi.');
  return result as {active?:boolean;accepted?:boolean};
}
function applicationKey(value: string): ArrayBuffer {
  const decoded = atob(value.replaceAll('-','+').replaceAll('_','/') + '='.repeat((4-value.length%4)%4));
  return Uint8Array.from(decoded, char=>char.charCodeAt(0)).buffer;
}
export function PushPermission({ticketToken,ended}:{ticketToken:string;ended:boolean}) {
  const [supported,setSupported]=useState<boolean|null>(null);
  const [needsInstall,setNeedsInstall]=useState(false);
  const [isIOS,setIsIOS]=useState(false);
  const [permission,setPermission]=useState<NotificationPermission>('default');
  const [active,setActive]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const lock=useRef(false);
  const registration=useRef<ServiceWorkerRegistration|null>(null);
  const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  useEffect(()=>{
    let alive=true;
    setActive(false);setMessage('');
    const ios=/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
    const standalone=window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone);
    setIsIOS(ios);setNeedsInstall(ios&&!standalone);
    const compatible='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(compatible);
    if(!compatible || (ios&&!standalone))return;
    setPermission(Notification.permission);
    // Register early so permission can be requested directly inside the click gesture on iOS.
    async function prepare(){
      try{
        const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
        if(!alive)return;
        registration.current=reg;
        const sub=await reg.pushManager.getSubscription();
        if(sub && key){
          const result=await pushRequest({action:'status',ticketToken,endpoint:sub.endpoint});
          if(alive)setActive(Boolean(result.active)&&Notification.permission==='granted');
        }
      }catch{if(alive)setMessage('Notifikasi belum siap. Periksa koneksi, lalu coba lagi.');}
    }
    void prepare();
    return()=>{alive=false;};
  },[ticketToken,key]);
  useEffect(()=>{
    const refresh=()=>{if('Notification' in window){setPermission(Notification.permission);if(Notification.permission!=='granted')setActive(false);}};
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  },[]);
  async function enable(){
    if(lock.current || !key)return;
    lock.current=true;setBusy(true);setMessage('');
    try{
      const result=await Notification.requestPermission();
      setPermission(result);
      if(result!=='granted'){setMessage(result==='denied'?'Izin belum diberikan. Aktifkan notifikasi untuk situs ini melalui pengaturan browser.':'Anda bisa mengaktifkan notifikasi nanti. Tetap pantau tiket selama menunggu.');return;}
      const reg=registration.current ?? await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(key)});
      await pushRequest({action:'subscribe',ticketToken,subscription:sub.toJSON()});
      registration.current=reg;setActive(true);setMessage('Notifikasi aktif untuk antrean ini. Anda dapat mengujinya sebelum menunggu.');
    }catch{setActive(false);setMessage('Notifikasi belum aktif. Periksa izin dan koneksi, lalu coba lagi.');}
    finally{lock.current=false;setBusy(false);}
  }
  async function change(action:'test'|'unsubscribe'){
    if(lock.current)return;
    lock.current=true;setBusy(true);setMessage('');
    try{
      const sub=await registration.current?.pushManager.getSubscription();
      if(!sub)throw new Error('Perangkat belum terdaftar. Aktifkan notifikasi kembali.');
      await pushRequest({action,ticketToken,endpoint:sub.endpoint});
      if(action==='unsubscribe'){setActive(false);setMessage('Notifikasi untuk antrean ini dinonaktifkan. Anda tetap bisa memantau tiket.');}
      else setMessage('Notifikasi uji diajukan. Periksa pusat notifikasi dan pengaturan suara HP Anda.');
    }catch(e){setMessage(e instanceof Error ? e.message : 'Belum berhasil. Silakan coba lagi.');}
    finally{lock.current=false;setBusy(false);}
  }
  if(ended)return null;
  return <section aria-labelledby="notification-title" className="mt-4 rounded-xl bg-white p-4">
    <h2 id="notification-title" className="flex items-center gap-2 text-sm font-semibold"><Bell size={17}/>Pemberitahuan giliran</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Aktifkan pemberitahuan agar tidak melewatkan giliran Anda. Izin ini hanya digunakan untuk notifikasi antrean; tetap pantau tiket jika notifikasi belum masuk.</p>
    {needsInstall ? <div className="mt-3 rounded-lg bg-slate-100 p-3 text-xs leading-6 text-slate-600"><p className="font-semibold">Menggunakan iPhone atau iPad?</p><p className="whitespace-pre-line">1. Buka tautan tiket ini di Safari (bukan browser dalam WhatsApp atau Instagram).
2. Ketuk Bagikan → Tambahkan ke Layar Utama → Tambah.
3. Buka ikon Bari Ramen dari Layar Utama. Ketuk Aktifkan notifikasi → Izinkan.
4. Ketuk Uji notifikasi, lalu periksa Pusat Notifikasi.</p><p className="mt-1">Memerlukan iOS/iPadOS 16.4 atau lebih baru. Jika tiket belum terbuka dari ikon, minta bantuan staf.</p></div>
      : supported===false ? <p className="mt-3 text-xs leading-5 text-amber-800">Browser ini belum mendukung notifikasi. Coba buka tautan tiket di Chrome atau Safari, bukan dari browser di dalam aplikasi.</p>
      : !key ? <p className="mt-3 text-xs text-slate-500">Notifikasi belum tersedia. Silakan pantau tiket atau hubungi staf.</p>
      : active ? <><p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-800"><Check size={16}/>Notifikasi aktif di perangkat ini</p><div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} variant="outline" onClick={()=>void change('test')}>Uji notifikasi</Button><Button disabled={busy} variant="ghost" onClick={()=>void change('unsubscribe')}><BellOff size={15}/>Nonaktifkan</Button></div></>
      : <><Button disabled={busy||supported===null||permission==='denied'} className="mt-3 w-full" onClick={()=>void enable()}><Bell size={16}/>{busy?'Mengaktifkan…':'Aktifkan notifikasi'}</Button>{permission==='denied'&&<p className="mt-2 text-xs leading-5 text-amber-800">{isIOS ? 'Izin ditolak? Buka Pengaturan iPhone/iPad → Notifikasi → Bari Ramen → Izinkan Notifikasi. Buka lagi tiket dari ikon Layar Utama, lalu ketuk Aktifkan notifikasi. Jika aplikasi belum tercantum, minta bantuan staf.' : 'Izin ditolak? Di Chrome, ketuk ikon kontrol di sebelah alamat → Izin → Notifikasi → Izinkan (nama menu dapat berbeda). Periksa juga Pengaturan Android → Aplikasi → Chrome → Notifikasi. Kembali ke tiket, muat ulang, lalu ketuk Aktifkan notifikasi.'}</p>}</>}
    <details className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600" open={!isIOS}>
      <summary className="cursor-pointer font-semibold">Panduan Android</summary>
      <ol className="ml-4 mt-2 list-decimal">
        <li>Buka tautan tiket di Chrome, bukan browser dalam WhatsApp/Instagram.</li>
        <li>Ketuk Aktifkan notifikasi di atas, lalu pilih Izinkan saat diminta.</li>
        <li>Ketuk Uji notifikasi. Periksa panel notifikasi HP, termasuk saat layar dikunci.</li>
        <li>Jika belum muncul, periksa izin notifikasi Chrome di Pengaturan Android, internet, mode Jangan Ganggu, dan pembatasan baterai Chrome. Coba uji kembali setelah 30 detik.</li>
      </ol>
    </details>
    {isIOS && !needsInstall && <details className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600">
      <summary className="cursor-pointer font-semibold">Panduan iPhone / iPad</summary>
      <p className="mt-2">Buka tiket dari ikon Bari Ramen di Layar Utama (iOS/iPadOS 16.4+). Ketuk Aktifkan notifikasi → Izinkan, lalu Uji notifikasi. Periksa Pusat Notifikasi, Pengaturan → Notifikasi → Bari Ramen, dan mode Fokus jika uji belum muncul. Coba lagi setelah 30 detik.</p>
    </details>}
    <p className="mt-3 text-xs leading-5 text-slate-500">Notifikasi dapat muncul saat halaman ditutup atau HP dikunci pada perangkat yang mendukungnya. Pastikan internet dan notifikasi browser aktif. Suara mengikuti mode senyap atau Fokus HP.</p>
    {message&&<p role="status" className="mt-3 text-xs leading-5 text-slate-700">{message}</p>}
  </section>;
}
