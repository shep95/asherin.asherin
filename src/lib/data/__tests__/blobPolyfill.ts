// jsdom 20 ships a Blob without text() / arrayBuffer(); every browser has
// both. test-only: the room's code calls them as any browser would.
const proto = Blob.prototype as Blob & { text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> };

function read<T>(blob: Blob, how: "readAsText" | "readAsArrayBuffer"): Promise<T> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
    r[how](blob);
  });
}

if (typeof proto.text !== "function") {
  proto.text = function (this: Blob) { return read<string>(this, "readAsText"); };
}
if (typeof proto.arrayBuffer !== "function") {
  proto.arrayBuffer = function (this: Blob) { return read<ArrayBuffer>(this, "readAsArrayBuffer"); };
}
