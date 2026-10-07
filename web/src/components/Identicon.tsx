import { hexToBytes, type Address } from 'viem';

// Pale tints, far from the saturated hues that identify proposals.
const tints = ['#e7f0fc', '#fdebe2', '#e2f5ec', '#fdf2d5', '#fbe6ef', '#e6f2e6', '#eae8f7', '#fbe4e4'];

/** A small symmetric pattern derived from an address: the same account always looks the same. */
export function Identicon({ address, size = 24 }: { address: Address; size?: number }) {
  const bytes = hexToBytes(address);
  const cells: [number, number][] = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 3; column++) {
      if ((bytes[row * 3 + column]! & 1) === 0) continue;
      cells.push([column, row]);
      if (column < 2) cells.push([4 - column, row]);
    }
  }
  return (
    <svg className="identicon" width={size} height={size} viewBox="0 0 7 7" aria-hidden="true">
      <rect width="7" height="7" rx="1.75" fill={tints[bytes[19]! % tints.length]} />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width="1.02" height="1.02" fill="#0b0b0b" opacity="0.8" />
      ))}
    </svg>
  );
}
