import { createElement, type ImgHTMLAttributes } from 'react';
// Next's image loader is not needed to test slideshow effects in a DOM.
export default function Image(props: ImgHTMLAttributes<HTMLImageElement>) {
  return createElement('img', props);
}
