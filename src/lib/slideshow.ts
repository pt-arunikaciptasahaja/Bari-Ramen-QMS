export function nextSlideId(slides: readonly {id:string}[], current: string) {
  if (!slides.length) return '';
  const index = slides.findIndex(slide=>slide.id===current);
  return slides[(index+1)%slides.length].id;
}

// Do not abort a slow image merely because another 10-second tick elapsed.
export function canAdvanceSlide(loading: boolean, shownAt: number, now: number) {
  return !loading && now-shownAt>=10000;
}
