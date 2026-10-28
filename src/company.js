// The company profile: one `company` row per workspace (its `profile`, and its `costing` that blind mode hides from
// anyone without the workspace's costing key). Saved debounced, on the row's revision; made on the first save.
import * as db from './data.js';
import { companyFromRecord, companyToRecord } from './record.js';

const SAVE_AFTER = 800;

export async function loadCompany() {
  const rows = await db.list('company', { per_page: 1, sort: 'created_at' });
  const row = rows[0] ?? null;
  return { row, value: companyFromRecord(row), timer: null, running: Promise.resolve() };
}

// The cover's address is short-lived: fetched from its file id each time the profile is opened.
export async function applyFiles(value) {
  if (!value?.coverFile) return value;
  try { value.cover = await db.fileUrl(value.coverFile); } catch { value.cover = ''; }
  return value;
}

export function saveCompany(handle, company, { canSeeCosts }) {
  clearTimeout(handle.timer);
  return new Promise((resolve, reject) => {
    handle.timer = setTimeout(() => {
      const body = companyToRecord(company, { canSeeCosts });
      handle.running = handle.running.then(async () => {
        if (handle.row) handle.row = { ...handle.row, ...(await db.update('company', handle.row, body)) };
        else handle.row = await db.create('company', body);
      }).then(resolve, reject);
    }, SAVE_AFTER);
  });
}
