import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const workdir = path.join(root, ".security-local");
const cli = path.join(root, "node_modules/supabase/dist/supabase.js");
const action = process.argv[2];
const commands = new Set(["prepare", "start", "reset", "integration", "build", "status", "stop"]);
if (!commands.has(action) || process.argv.length !== 3) {
  console.error("Usage: node scripts/security-local.mjs prepare|start|reset|integration|build|status|stop");
  process.exit(1);
}

// Keep original production migration names and content intact. The isolated local
// copy assigns unique versions and creates jobs before its foreign-key dependents.
const migrations = [
  ["20260817_create_customers_and_inquiries.sql", "20260817000000_customers_and_inquiries.sql"],
  ["20260818_create_jobs_and_sales.sql", "20260818000000_jobs_and_sales.sql"],
  ["20260818_create_content_tables.sql", "20260818000100_content_tables.sql"],
  ["20260818_create_media_assets.sql", "20260818000200_media_assets.sql"],
  ["20260819_add_homepage_inquiry_source.sql", "20260819000000_homepage_inquiry_source.sql"],
];

function localEnv() {
  const env = { ...process.env };
  // Do not inherit cloud access tokens, production DB URLs or a remote project ref.
  for (const key of Object.keys(env)) {
    if (/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|DATABASE_URL$|PG|TELEGRAM_|VERCEL_)/i.test(key)) delete env[key];
  }
  return env;
}

function checkDocker() {
  const installed = process.platform === "win32"
    ? path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker/Docker/resources/bin/docker.exe") : "docker";
  const docker = existsSync(installed) ? installed : "docker";
  const result = spawnSync(docker, ["info", "--format", "{{.ServerVersion}}"], {
    env: localEnv(), encoding: "utf8", timeout: 12_000, windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Docker engine unavailable. Complete WSL/VirtualMachinePlatform setup and restart Windows if pending. No database command was run.");
  }
  return path.dirname(docker);
}

let dockerBin;
function run(args, capture = false) {
  const result = spawnSync(process.execPath, [cli, "--workdir", workdir, ...args], {
    cwd: root, env: { ...localEnv(), PATH: dockerBin + path.delimiter + process.env.PATH }, encoding: "utf8", timeout: 900_000,
    stdio: capture ? "pipe" : "inherit", windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("Local Supabase command failed; check Docker Desktop/WSL and the preceding output.");
  return result.stdout;
}

async function prepare() {
  const sourceDir = path.join(root, "supabase/migrations");
  const files = (await readdir(sourceDir)).filter((name) => name.endsWith(".sql")).sort();
  if (JSON.stringify(files) !== JSON.stringify(migrations.map(([name]) => name).sort())) {
    throw new Error("Migration set changed. Review and update the explicit local ordering first.");
  }
  const target = path.join(workdir, "supabase");
  await mkdir(path.join(target, "migrations"), { recursive: true });
  await mkdir(path.join(target, "tests"), { recursive: true });
  await copyFile(path.join(root, "supabase/security.config.toml"), path.join(target, "config.toml"));
  const existing = await readdir(path.join(target, "migrations"));
  if (existing.some((name) => !migrations.some(([, dest]) => name === dest))) {
    throw new Error("Unexpected generated migration file; inspect the local workdir before continuing.");
  }
  for (const [source, dest] of migrations) {
    await copyFile(path.join(sourceDir, source), path.join(target, "migrations", dest));
  }
  const testDir = path.join(root, "supabase/tests");
  for (const name of existsSync(testDir) ? await readdir(testDir) : []) {
    if (name.endsWith(".sql")) await copyFile(path.join(testDir, name), path.join(target, "tests", name));
  }
  // Refuse a local workdir that someone has linked to a remote project.
  try {
    const ref = await readFile(path.join(target, ".temp/project-ref"), "utf8");
    if (ref.trim()) throw new Error("Refusing remotely linked local workdir.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(path.join(workdir, "migration-map.json"), JSON.stringify(migrations, null, 2) + "\n");
}

try {
  await prepare();
  if (action !== "prepare") dockerBin = checkDocker();
  if (action === "prepare") console.log("Prepared five byte-identical migrations with unique local versions and dependency order.");
  if (action === "start") { run(["start"], true); console.log("Local Supabase started (local-only keys omitted)."); }
  if (action === "reset") run(["db", "reset", "--local", "--yes"]);
  if (action === "stop") run(["stop"]);
  if (action === "status" || action === "integration" || action === "build") {
    const info = JSON.parse(run(["status", "--output", "json"], true));
    const api = new URL(info.API_URL);
    if (api.protocol !== "http:" || api.hostname !== "127.0.0.1" || api.port !== "56321") {
      throw new Error("Refusing non-local Supabase endpoint.");
    }
    if (action === "status") console.log("Local Supabase is running at http://127.0.0.1:56321 (keys omitted).");
    else {
      for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
        if (existsSync(path.join(root, name))) throw new Error("Refusing Next validation in a checkout containing automatic env files; use an isolated worktree.");
      }
      if (!info.SERVICE_ROLE_KEY || !info.ANON_KEY) throw new Error("Local API keys unavailable.");
      const args = action === "build" ? ["node_modules/next/dist/bin/next", "build"] : ["--test", "tests/crm-local.integration.mjs"];
      const result = spawnSync(process.execPath, args, {
        cwd: root, windowsHide: true, stdio: "inherit",
        env: { ...localEnv(), CLEAN_MANAGER_LOCAL_API_URL: api.origin, NEXT_PUBLIC_SUPABASE_URL: api.origin, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: info.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: info.SERVICE_ROLE_KEY, NEXT_TELEMETRY_DISABLED: "1", OPENAI_API_KEY: "",
          CLEAN_MANAGER_LOCAL_SERVICE_KEY: info.SERVICE_ROLE_KEY, CLEAN_MANAGER_LOCAL_ANON_KEY: info.ANON_KEY },
      });
      if (result.error || result.status !== 0) throw new Error(action === "build" ? "Local production build failed." : "Local database integration tests failed.");
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
