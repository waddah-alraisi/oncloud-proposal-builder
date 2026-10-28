// What a refusal from /connected/* means to the person: one message, plus the field errors to show on a form.
const KNOWN = {
  'appregistry.record_locked': 'errLocked',
  'appregistry.revision_conflict': 'errConflict',
  'appregistry.quota_exceeded': 'errQuota',
  'appregistry.scope_not_granted': 'errScope',
  'appregistry.not_in_package': 'errPackage',
  'auth.forbidden': 'errForbidden',
  'appregistry.origin_not_allowed': 'errOrigin',
  'appregistry.apps_cluster_unavailable': 'errUnavailable',
  'validation.failed': 'errInvalid',
  signed_out: 'errSignedOut',
};

export function explain(error) {
  const envelope = error?.envelope ?? null;
  const key = KNOWN[error?.message] ?? 'errGeneric';
  const fields = {};
  const general = [];

  for (const [field, messages] of Object.entries(envelope?.errors ?? {})) {
    const list = Array.isArray(messages) ? messages : [String(messages)];
    if (field.startsWith('rules.') || field === 'record' || field === 'ref') general.push(...list);
    else fields[field] = list.join(' ');
  }

  return { key, fields, general, detail: envelope?.message ?? null };
}
