// Synthetic receiver used to verify the exact .NET anonymous-stdin launcher.
// It never loads .env, runs Docker/age, writes files or contacts a database.
import { approveBackupCredentials, encodeCredentialFrame, readBackupCredentialInput }
  from '../../scripts/lib/production-backup-policy.mjs';
const fixture = {
  host: 'aws-1-ap-south-1.pooler.supabase.com',
  user: 'postgres.abcdefghijklmnopqrst', port: '5432',
  password: 'SYNTHETIC-ONLY-한글-"-quote-\\-$-&-not-a-real-password',
};
try {
  const input = await readBackupCredentialInput(process.stdin);
  const approved = approveBackupCredentials(input, 'https://abcdefghijklmnopqrst.supabase.co');
  const exact = Object.keys(fixture).every(key => approved[key] === fixture[key]);
  const frameExact = encodeCredentialFrame(approved).equals(encodeCredentialFrame(fixture));
  const passwordAbsentFromArguments = !process.argv.some(value => value.includes(fixture.password));
  const ok = exact && frameExact && passwordAbsentFromArguments;
  console.log(JSON.stringify({ syntheticOnly:true, anonymousStdinReceivedExactly:exact,
    framingMatches:frameExact, passwordAbsentFromArguments, databaseAccessed:false, success:ok }));
  process.exitCode = ok ? 0 : 1;
} catch {
  console.log(JSON.stringify({syntheticOnly:true, success:false, databaseAccessed:false}));
  process.exitCode = 1;
}
