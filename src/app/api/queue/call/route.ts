import { dispatchTicketPush, requestBody, serverDb, verifyOrigin } from '@/lib/server-push';
import { after } from 'next/server';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const bearer = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
    if (!bearer) return Response.json({ error: 'Silakan masuk kembali sebagai staf.' }, { status: 401 });
    const db = serverDb(bearer);
    const { data: user, error: authError } = await db.auth.getUser(bearer);
    if (authError || !user.user) return Response.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
    const { data: staff, error: roleError } = await db.rpc('is_staff');
    if (roleError || !staff) return Response.json({ error: 'Akses staf diperlukan.' }, { status: 403 });
    const body = await requestBody(request);
    if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id)) throw new Error('Tiket tidak valid.');
    if (!body.retry) {
      const { error } = await db.rpc('transition_queue', { p_id: body.id, p_status: 'called' });
      if (error) return Response.json({ error: 'Status antrean sudah berubah. Muat ulang daftar.' }, { status: 409 });
    }
    // The database call is already committed. A push failure must never undo or repeat it.
    const id = body.id;
    after(async () => {
      try { await dispatchTicketPush(db, id); }
      catch { console.error('Queue push dispatch did not complete. Staff can retry from the dashboard.'); }
    });
    return Response.json({ called: true });
  } catch { return Response.json({ error: 'Panggilan belum dapat diproses. Periksa koneksi dan coba lagi.' }, { status: 400 }); }
}
