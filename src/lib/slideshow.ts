export function nextSlideId(slides: readonly {id:string}[], current: string) {
  if (!slides.length) return '';
  const index = slides.findIndex(slide=>slide.id===current);
  return slides[(index+1)%slides.length].id;
}
