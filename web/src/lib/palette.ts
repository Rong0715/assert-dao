// Colours of the proposals of a round.
//
// Eight hues in a fixed order, validated for colour-vision deficiency on a white surface. The order is part of
// the validation: a proposal takes the hue of its position on the ballot and keeps it everywhere it is drawn. A
// ninth proposal does not get a made-up hue: it is drawn in neutral grey and told apart by its letter, which
// always accompanies the colour.
const series = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const;
const other = '#898781';

const ink = '#0b0b0b';
const white = '#ffffff';

export function colorOf(index: number): string {
  return series[index] ?? other;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Black or white, whichever reads better on a fill of the given colour. */
export function inkOn(fill: string): string {
  return contrast(fill, white) >= contrast(fill, ink) ? white : ink;
}
