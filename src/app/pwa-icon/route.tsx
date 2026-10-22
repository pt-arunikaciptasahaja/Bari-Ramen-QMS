import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
export async function GET() {
  const logo = await readFile(join(process.cwd(), 'public/brand/bari-ramen-logo.png'));
  const source = `data:image/png;base64,${logo.toString('base64')}`;
  return new ImageResponse(
    <div style={{ width:192, height:192, display:'flex', position:'relative', overflow:'hidden', borderRadius:96, background:'#1D2848' }}>
      <img src={source} alt="" width={384} height={384} style={{ position:'absolute', left:-96, top:-96 }} />
    </div>,
    { width:192, height:192 },
  );
}
