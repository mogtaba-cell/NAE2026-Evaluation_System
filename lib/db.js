import { createClient } from "@supabase/supabase-js";

let adminClient;
export function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return adminClient;
}
export const db = () => getAdminClient();

// Throw on a Supabase error, return data otherwise.
export async function q(promise) {
  const { data, error, count } = await promise;
  if (error) throw new Error(error.message || "Database error");
  return count !== undefined && count !== null && data && !Array.isArray(data) ? data : data;
}
export async function qc(promise) {
  const { data, error, count } = await promise;
  if (error) throw new Error(error.message || "Database error");
  return { data: data || [], count: count || 0 };
}
// Read every row of a query (PostgREST returns at most 1000 rows per request).
export async function all(build, size = 1000) {
  const out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw new Error(error.message || "Database error");
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}
// Run .in() lookups in chunks so URLs stay short.
export async function inChunks(ids, fn, size = 150) {
  const out = [];
  const list = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < list.length; i += size) out.push(...(await fn(list.slice(i, i + size))));
  return out;
}
