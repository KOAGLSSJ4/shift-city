// Some static hosts (e.g. claude.ai artifacts) only serve web types, not .hdr/.glb. For those builds
// each binary is also shipped as `<file>.b64.txt`; this resolves to whichever copy is reachable.
const cache = new Map<string, Promise<string>>();

export function binaryUrl(url: string): Promise<string> {
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (head.ok) return url;
      } catch { /* try the text copy */ }
      const res = await fetch(`${url}.b64.txt`);
      if (!res.ok) return url;
      const bin = atob((await res.text()).trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes]));
    })());
  }
  return cache.get(url)!;
}
