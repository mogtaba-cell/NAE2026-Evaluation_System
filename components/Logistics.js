// Labels for artwork states, shared by pages that show one artwork. Movements live in components/Movements.js.
export { SHORT as LG, MISSING } from "@/components/Movements";
export const isExc = r => r.state === "missing" || r.damaged || !!r.issue;
