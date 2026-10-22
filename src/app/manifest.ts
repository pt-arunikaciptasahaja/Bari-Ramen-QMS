import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/bari-ramen', name: 'Antrean Bari Ramen', short_name: 'Bari Ramen',
    description: 'Pantau giliran dan terima pemberitahuan antrean Bari Ramen.',
    // Omitting start_url preserves the installing document URL, including its private fragment.
    scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#1D2848',
    icons: [{ src: '/pwa-icon?v=bari-logo-1', sizes: '192x192', type: 'image/png', purpose: 'any' }],
  };
}
