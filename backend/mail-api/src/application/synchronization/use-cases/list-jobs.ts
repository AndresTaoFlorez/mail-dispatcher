import type { JobReader } from "../ports.js";
export function listJobs(reader: JobReader) {
  return reader.jobs();
}
