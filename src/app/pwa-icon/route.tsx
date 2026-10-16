import { ImageResponse } from 'next/og';
export const dynamic = 'force-static';
export function GET() {
  return new ImageResponse(<div style={{ width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'#171717',color:'#fff',fontSize:130,fontWeight:700 }}>B</div>, { width:192,height:192 });
}
