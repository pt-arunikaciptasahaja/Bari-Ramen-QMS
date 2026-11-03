import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/bari-ramen', name: 'Antrean Bari Ramen', short_name: 'Bari Ramen',
    description: 'Pantau giliran dan terima pemberitahuan antrean Bari Ramen.',
    // Omitting start_url preserves the installing document URL, including its private fragment.
    scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#01215C',
    icons: [
      { src: '/pwa-icon?v=ios-fit-20261024', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon-512?v=ios-fit-20261024', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon-maskable?v=ios-fit-20261024', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
