import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Wes — ECD centre helper',
    short_name: 'Wes',
    description: 'Get registered, funded and running well. Plans, printables and registration help for ECD centres.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FCF7F0',
    theme_color: '#FCEBCB',
    lang: 'en-ZA',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Take register', url: '/children' },
      { name: 'Ask Wes', url: '/wes' },
    ],
  };
}
