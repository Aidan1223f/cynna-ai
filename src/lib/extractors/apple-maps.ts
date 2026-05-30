export type Place = {
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  maps_url: string;
  provider: "apple_maps" | "google_maps";
  raw: Record<string, string>;
};

export function extractAppleMaps(rawUrl: string): Place | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.hostname !== "maps.apple.com") return null;

  const params: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    params[k] = v;
  });

  const ll = params.ll || params.coordinate || "";
  let lat: number | null = null;
  let lng: number | null = null;
  if (ll) {
    const [a, b] = ll.split(",").map((s) => parseFloat(s.trim()));
    if (Number.isFinite(a) && Number.isFinite(b)) {
      lat = a;
      lng = b;
    }
  }

  const name =
    params.q ||
    params.name ||
    params["place-name"] ||
    null;

  const address = params.address || null;

  if (!name && !address && lat == null) return null;

  return {
    name,
    address,
    lat,
    lng,
    maps_url: u.toString(),
    provider: "apple_maps",
    raw: params,
  };
}
