// Pure validation. No I/O, logging or credential persistence.
export function approveBackupCredentials(input, applicationUrl) {
  const reject = (kind) => { const error = new Error(kind); error.safeKind = kind; throw error; };
  if (!input || typeof input !== 'object' || typeof input.host !== 'string' ||
      typeof input.user !== 'string' || typeof input.port !== 'string' ||
      typeof input.password !== 'string' || !input.password || /[\r\n\0]/.test(input.password)) {
    reject('credential-input-invalid');
  }
  let url;
  try { url = new URL(applicationUrl); } catch { reject('expected-project-invalid'); }
  const ref = url.hostname.split('.')[0];
  if (url.protocol !== 'https:' || !/^[a-z]{20}$/.test(ref) || url.hostname !== `${ref}.supabase.co`) {
    reject('expected-project-invalid');
  }
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(input.host);
  if (!pooler) reject('host-not-approved');
  // Validate the supplied Dashboard values; never derive/overwrite the user or port.
  if (input.user !== `postgres.${ref}`) reject('dashboard-user-mismatch');
  if (input.port !== '5432') reject('dashboard-session-port-mismatch');
  return { host: input.host, user: input.user, port: input.port, password: input.password };
}

export function encodeCredentialFrame(credentials) {
  return Buffer.from(`${credentials.host}\n${credentials.user}\n${credentials.port}\n${credentials.password}\n`, 'utf8');
}

// Shared by production transport and its credential-free synthetic verification.
export const readonlySourceShell = `IFS= read -r PGHOST && IFS= read -r PGUSER && IFS= read -r PGPORT && IFS= read -r PGPASSWORD || exit 91
export PGHOST PGUSER PGPORT PGPASSWORD
export PGDATABASE=postgres PGSSLMODE=verify-full PGSSLROOTCERT=system
export PGAPPNAME=SkyCleanReadOnlyBackup
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=600000 -c lock_timeout=2000'
exec "$@"`;

export async function readBackupCredentialInput(stream) {
  stream.setEncoding('utf8');
  let input = '';
  for await (const chunk of stream) {
    input += chunk;
    if (Buffer.byteLength(input) > 16384) {
      const error = new Error('credential-input-too-large'); error.safeKind = error.message; throw error;
    }
  }
  try { return JSON.parse(input); }
  catch { const error = new Error('credential-input-invalid'); error.safeKind = error.message; throw error; }
  finally { input = ''; }
}
