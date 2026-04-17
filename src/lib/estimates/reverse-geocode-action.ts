'use server';

export type GeocodeResult = { address: string } | { error: string };

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Invalid coordinates' };
  }
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'coolbid/1.0 (changeout-wizard)' }, cache: 'no-store' });
    if (!res.ok) return { error: `Geocoding failed (${res.status})` };
    const data = (await res.json()) as { display_name?: string };
    if (!data.display_name) return { error: 'No address found' };
    return { address: data.display_name };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Geocoding failed' };
  }
}
