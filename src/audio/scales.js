// Музыкальные гаммы: любой индекс столкновения превращается в ноту, которая звучит красиво.

export const SCALES = {
  pentatonic: { name: 'Пентатоника', steps: [0, 2, 4, 7, 9] },
  major: { name: 'Мажор', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'Минор', steps: [0, 2, 3, 5, 7, 8, 10] },
  chromatic: { name: 'Хроматика', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

const BASE_MIDI = 60; // До первой октавы (C4)

/** Частота ноты по индексу ступени в гамме (индекс может быть любым целым). */
export function noteFreq(index, scaleKey = 'pentatonic', octaveShift = 0) {
  const steps = (SCALES[scaleKey] || SCALES.pentatonic).steps;
  const n = steps.length;
  const i = Math.round(index);
  const octave = Math.floor(i / n);
  const step = steps[((i % n) + n) % n];
  const midi = BASE_MIDI + step + 12 * (octave + octaveShift);
  return 440 * Math.pow(2, (midi - 69) / 12);
}
