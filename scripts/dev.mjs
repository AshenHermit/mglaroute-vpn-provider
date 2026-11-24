import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Node >=20.12 refuses to spawn .cmd/.bat directly on Windows (EINVAL).
// Extensionless name + shell lets PATHEXT pick pnpm.exe (or corepack shim).
export const pnpm = "pnpm";
export const pnpmSpawnOptions = process.platform === "win32" ? { shell: true } : {};

const tasks = [
  { name: "backend", args: ["run", "backend:dev"] },
  { name: "frontend", args: ["run", "frontend:dev"] },
];

let shuttingDown = false;
let children = [];

function stop(child) {
  if (child.killed || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach(stop);
  process.exitCode = code;
}

function runDev() {
  children = tasks.map(({ name, args }) => {
    console.log(`[dev] starting ${name}`);
    const child = spawn(pnpm, args, {
      stdio: "inherit",
      ...pnpmSpawnOptions,
    });
    child.on("error", (err) => {
      console.error(`[dev] ${name} failed to start:`, err);
      shutdown(1);
    });
    child.on("exit", (code, signal) => {
      if (shuttingDown) return;
      console.log(`[dev] ${name} exited (code=${code}, signal=${signal})`);
      shutdown(signal ? 0 : (code ?? 0));
    });
    return child;
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDev();
}
