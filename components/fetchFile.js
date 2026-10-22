"use client";
// Fetch a file from /api/files in 4 MB pieces (the server never sends more than that at once).
const CH = 4 * 1000 * 1000;

async function piece(url, start) {
  const r = await fetch(url, { headers: { range: `bytes=${start}-${start + CH - 1}` } });
  if (r.status === 401) { location.href = "/login"; throw new Error("Please sign in again."); }
  if (!r.ok) throw new Error(r.status === 403 ? "You can't open this file." : r.status === 404 ? "File not found in Google Drive." : `Could not load the file (${r.status}).`);
  const cr = r.headers.get("content-range"); const total = cr ? Number(cr.split("/")[1]) : Number(r.headers.get("content-length"));
  return { buf: new Uint8Array(await r.arrayBuffer()), total, type: r.headers.get("content-type") || "application/octet-stream" };
}

// Whole file as a Blob (for viewing large PDFs or opening a large original in a new tab).
export async function fetchBlob(url, onProgress) {
  const first = await piece(url, 0); const parts = [first.buf]; let got = first.buf.length;
  onProgress && onProgress(got, first.total);
  while (got < first.total) { const p = await piece(url, got); parts.push(p.buf); got += p.buf.length; onProgress && onProgress(got, first.total); if (!p.buf.length) break; }
  return new Blob(parts, { type: first.type });
}

// Save a file to disk. Chrome and Edge write straight to the chosen file (fine for very large videos);
// other browsers collect the pieces in memory first.
export async function downloadFile(url, name, onProgress) {
  const durl = url + (url.includes("?") ? "&" : "?") + "download=1";
  if (typeof window !== "undefined" && window.showSaveFilePicker) {
    let handle;
    try { handle = await window.showSaveFilePicker({ suggestedName: name }); }
    catch (e) { if (e.name === "AbortError") return false; handle = null; }
    if (handle) {
      const w = await handle.createWritable();
      try {
        const first = await piece(durl, 0); await w.write(first.buf); let got = first.buf.length; onProgress && onProgress(got, first.total);
        while (got < first.total) { const p = await piece(url, got); if (!p.buf.length) break; await w.write(p.buf); got += p.buf.length; onProgress && onProgress(got, first.total); }
        await w.close(); return true;
      } catch (e) { try { await w.abort(); } catch {} throw e; }
    }
  }
  const blob = await fetchBlob(durl, onProgress);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return true;
}
