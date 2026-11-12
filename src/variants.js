// Vehicle variants: dimensions only (no three.js), shared by sim and visuals.
// len = total length incl. trailer. frontLen = length of the front body
// (tractor / towing car) which carries the vehicle's own lights.
export const VARIANTS = {
  hatch: { type: 'car', len: 4.1, width: 1.78, frontLen: 4.1 },
  sedan: { type: 'car', len: 4.75, width: 1.83, frontLen: 4.75 },
  estate: { type: 'car', len: 4.8, width: 1.84, frontLen: 4.8 },
  suv: { type: 'car', len: 4.65, width: 1.9, frontLen: 4.65 },
  van: { type: 'van', len: 5.9, width: 2.0, frontLen: 5.9 },
  truck: { type: 'truck', len: 16.8, width: 2.55, frontLen: 6.1 },
  rigid: { type: 'truck', len: 10.2, width: 2.5, frontLen: 10.2 },
  caravan: { type: 'caravan', len: 12.6, width: 2.25, frontLen: 4.7 },
};

export const TYPE_VARIANTS = {
  car: [
    ['hatch', 0.3],
    ['sedan', 0.22],
    ['estate', 0.27],
    ['suv', 0.21],
  ],
  van: [['van', 1]],
  truck: [
    ['truck', 0.8],
    ['rigid', 0.2],
  ],
  caravan: [['caravan', 1]],
};
