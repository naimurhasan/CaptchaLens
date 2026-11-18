import { build, context } from "esbuild";
import { cpSync, readFileSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

const env = {};
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  console.warn("no .env found — solver will run unconfigured");
}

rmSync("dist", { recursive: true, force: true });
cpSync("public", "dist", { recursive: true });

const common = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: ["chrome120"],
  define: {
    "process.env.OPENROUTER_API_KEY": JSON.stringify(env.OPENROUTER_API_KEY ?? ""),
    "process.env.OPENROUTER_MODEL": JSON.stringify(env.OPENROUTER_MODEL ?? "typesafe/jev-1.14"),
  },
};

const entries = [
  { in: "src/content/main.ts", out: "content" },
  { in: "src/background/service-worker.ts", out: "service-worker" },
  { in: "src/ui/popup/popup.ts", out: "popup" },
  { in: "src/ui/options/options.ts", out: "options" },
];

if (watch) {
  const contexts = await Promise.all(
    entries.map((e) =>
      context({ ...common, entryPoints: [e.in], outfile: `dist/${e.out}.js` })
    )
  );
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching...");
} else {
  await Promise.all(
    entries.map((e) =>
      build({ ...common, entryPoints: [e.in], outfile: `dist/${e.out}.js` })
    )
  );
  console.log("built dist/");
}
