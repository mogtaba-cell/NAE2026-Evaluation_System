import { route } from "@/lib/api";
import { entryFiles } from "@/lib/files";
import { loadEntry, fileView } from "@/lib/entryview";
export const GET = route("*", async ({ session, params }) => {
  const e = await loadEntry(params.code, session);
  const files = await entryFiles(e, { refresh: true });
  return { files: files.map(fileView) };
});
