import { Brand } from '@/components/brand';
import { RegistrationQr } from '@/components/registration-qr';

export default function RegistrationQrPage() {
  return <main className="mx-auto max-w-2xl px-4 py-8">
    <div className="mb-6 flex justify-center"><Brand /></div>
    <RegistrationQr poster />
  </main>;
}
