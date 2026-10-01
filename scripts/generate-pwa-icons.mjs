import { mkdir } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bell } from 'lucide-react';
import sharp from 'sharp';

await mkdir('public/pwa', { recursive: true });
for (const [name, size, bellSize] of [
  ['icon-192.png', 192, 300], ['icon-512.png', 512, 300],
  ['icon-maskable-512.png', 512, 256], ['apple-touch-icon.png', 180, 300], ['favicon.png', 32, 340]
]) {
  const offset = (512 - bellSize) / 2;
  const svg = renderToStaticMarkup(React.createElement('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 512, height: 512, viewBox: '0 0 512 512' },
    React.createElement('rect', { width: 512, height: 512, fill: '#DD5736' }),
    React.createElement('g', { transform: `translate(${offset} ${offset})` },
      React.createElement(Bell, { size: bellSize, color: '#FFFFFF', strokeWidth: 1.8 }))));
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/pwa/${name}`);
  console.log(`public/pwa/${name} (${size}x${size})`);
}
