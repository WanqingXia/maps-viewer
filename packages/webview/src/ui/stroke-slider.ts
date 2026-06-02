import { STROKE_WIDTH_MIN, STROKE_WIDTH_MAX } from '@maps-viewer/shared';

export interface StrokeSliderEl {
  element: HTMLElement;
  setValue(v: number): void;
  destroy(): void;
}

/**
 * Range input 0..50 with a live numeric readout. Emits onChange on `input`
 * (live drag) but throttles via requestAnimationFrame so we don't spam
 * the reducer on every pixel of slider travel.
 */
export function mountStrokeSlider(
  initial: number,
  onChange: (value: number) => void,
): StrokeSliderEl {
  const wrap = document.createElement('div');
  wrap.className = 'mv-stroke-slider';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(STROKE_WIDTH_MIN);
  input.max = String(STROKE_WIDTH_MAX);
  input.step = '1';
  input.value = String(initial);
  input.className = 'mv-stroke-slider__input';
  input.setAttribute('aria-label', 'Stroke width');
  input.setAttribute('aria-valuemin', String(STROKE_WIDTH_MIN));
  input.setAttribute('aria-valuemax', String(STROKE_WIDTH_MAX));
  input.setAttribute('aria-valuenow', String(initial));
  input.setAttribute('aria-valuetext', `${initial} pixels`);

  const readout = document.createElement('span');
  readout.className = 'mv-stroke-slider__value';
  readout.textContent = String(initial);
  readout.setAttribute('aria-hidden', 'true');

  let frame = 0;
  let pendingValue = initial;

  const flush = (): void => {
    frame = 0;
    onChange(pendingValue);
  };

  input.addEventListener('input', () => {
    pendingValue = Number(input.value);
    readout.textContent = String(pendingValue);
    input.setAttribute('aria-valuenow', String(pendingValue));
    input.setAttribute('aria-valuetext', `${pendingValue} pixels`);
    if (frame === 0) frame = window.requestAnimationFrame(flush);
  });

  wrap.appendChild(input);
  wrap.appendChild(readout);

  return {
    element: wrap,
    setValue(v: number) {
      if (Number(input.value) === v) return;
      input.value = String(v);
      readout.textContent = String(v);
      input.setAttribute('aria-valuenow', String(v));
      input.setAttribute('aria-valuetext', `${v} pixels`);
    },
    destroy() {
      if (frame) window.cancelAnimationFrame(frame);
      wrap.remove();
    },
  };
}
