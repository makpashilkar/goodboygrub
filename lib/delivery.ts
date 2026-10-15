interface PincodeDistance {
  [key: string]: number;
}

const THANE_PINCODE_DISTANCES: PincodeDistance = {
  '400601': 0,
  '400602': 2.5,
  '400603': 3.8,
  '400605': 4.2,
  '400606': 5.1,
  '400607': 6.3,
  '400608': 7.0,
  '400610': 4.5,
  '400612': 5.8,
  '400615': 8.2,
  '421201': 9.5,
  '421202': 11.0,
  '421203': 12.5,
  '421204': 14.0,
  '421302': 6.8,
  '421306': 10.2,
};

export function getDistanceForPincode(pincode: string): number {
  if (THANE_PINCODE_DISTANCES[pincode] !== undefined) {
    return THANE_PINCODE_DISTANCES[pincode];
  }
  const prefix = pincode.substring(0, 4);
  if (prefix === '4006') return 7;
  if (prefix === '4212' || prefix === '4213') return 12;
  return 15;
}

export function calculateDeliveryFee(distanceKm: number): number {
  if (distanceKm <= 4) return 0;
  return Math.round(40 + (distanceKm - 4) * 12);
}

export function getDeliveryInfo(pincode: string): {
  distanceKm: number;
  deliveryFee: number;
} {
  const distanceKm = getDistanceForPincode(pincode);
  const deliveryFee = calculateDeliveryFee(distanceKm);
  return { distanceKm, deliveryFee };
}
