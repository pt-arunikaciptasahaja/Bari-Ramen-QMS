import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/** Original JPEG stays intact. Frame the centered artwork without stretching it.
 * Bright artwork bounds: x=312..940, y=331..953 in the 1254px source.
 * A 730px frame places the logo at ~86% width, centered at (626, 642).
 * Android maskable uses a wider frame to keep the logo inside its safe zone.
 */
export async function renderAppIcon(size: 180 | 192 | 512, maskable = false) {
  const logo = await readFile(join(process.cwd(), 'public/brand/app-icon-source.jpg'));
  const source = `data:image/jpeg;base64,${logo.toString('base64')}`;
  const crop = maskable ? 800 : 730;
  const scale = size / crop;
  const left = (626 - crop / 2) * scale;
  const top = (642 - crop / 2) * scale;
  return new ImageResponse(
    <div style={{ width:size, height:size, display:'flex', position:'relative', overflow:'hidden', background:'#01215C' }}>
      <img src={source} alt="" width={1254 * scale} height={1254 * scale}
        style={{ position:'absolute', left:-left, top:-top }} />
    </div>,
    { width:size, height:size },
  );
}
