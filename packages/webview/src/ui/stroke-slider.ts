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

  const number = document.createElement('input');
  number.type = 'number';
  number.min = String(STROKE_WIDTH_MIN);
  number.max = String(STROKE_WIDTH_MAX);
  number.step = '1';
  number.value = String(initial);
  number.className = 'mv-stroke-slider__number';
  number.setAttribute('aria-label', 'Stroke width value');

  let frame = 0;
  let pendingValue = initial;
  let pointerDragging = false;

  const flush = (): void => {
    frame = 0;
    onChange(pendingValue);
  };

  const commit = (raw: number): void => {
    pendingValue = clamp(raw);
    input.value = String(pendingValue);
    number.value = String(pendingValue);
    input.setAttribute('aria-valuenow', String(pendingValue));
    input.setAttribute('aria-valuetext', `${pendingValue} pixels`);
    if (frame === 0) frame = window.requestAnimationFrame(flush);
  };

  input.addEventListener('input', () => {
    commit(Number(input.value));
  });

  input.addEventListener('pointerdown', (event) => {
    pointerDragging = true;
    input.setPointerCapture(event.pointerId);
    commit(valueFromPointer(event));
    event.preventDefault();
  });

  input.addEventListener('pointermove', (event) => {
    if (!pointerDragging) return;
    commit(valueFromPointer(event));
    event.preventDefault();
  });

  input.addEventListener('pointerup', (event) => {
    if (!pointerDragging) return;
    pointerDragging = false;
    commit(valueFromPointer(event));
    input.releasePointerCapture(event.pointerId);
    event.preventDefault();
  });

  input.addEventListener('pointercancel', () => {
    pointerDragging = false;
  });

  number.addEventListener('input', () => {
    commit(Number(number.value));
  });

  wrap.appendChild(input);
  wrap.appendChild(number);

  return {
    element: wrap,
    setValue(v: number) {
      if (pointerDragging) return;
      if (Number(input.value) === v) return;
      const next = clamp(v);
      input.value = String(next);
      number.value = String(next);
      input.setAttribute('aria-valuenow', String(next));
      input.setAttribute('aria-valuetext', `${next} pixels`);
    },
    destroy() {
      if (frame) window.cancelAnimationFrame(frame);
      wrap.remove();
    },
  };

  function valueFromPointer(event: PointerEvent): number {
    const rect = input.getBoundingClientRect();
    if (rect.width <= 0) return Number(input.value);
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    return STROKE_WIDTH_MIN + ratio * (STROKE_WIDTH_MAX - STROKE_WIDTH_MIN);
  }
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return STROKE_WIDTH_MIN;
  return Math.max(STROKE_WIDTH_MIN, Math.min(STROKE_WIDTH_MAX, Math.round(value)));
}
