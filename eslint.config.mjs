import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadFlatCompat() {
  try {
    const module = await import("@eslint/eslintrc");
    return module.FlatCompat;
  } catch {
    const pnpmDir = join(__dirname, "node_modules", ".pnpm");
    let compatModulePath;

    try {
      const entries = readdirSync(pnpmDir, { withFileTypes: true });
      const eslintrcEntry = entries.find((entry) =>
        entry.isDirectory() && entry.name.startsWith("@eslint+eslintrc@")
      );

      if (eslintrcEntry) {
        compatModulePath = pathToFileURL(
          join(
            pnpmDir,
            eslintrcEntry.name,
            "node_modules",
            "@eslint",
            "eslintrc",
            "lib",
            "index.js",
          ),
        ).href;
      }
    } catch {
      // Swallow filesystem errors so a clearer exception is raised below.
    }

    if (!compatModulePath) {
      throw new Error(
        "Unable to resolve @eslint/eslintrc. Ensure dependencies are installed.",
      );
    }

    const module = await import(compatModulePath);
    return module.FlatCompat;
  }
}

const FlatCompat = await loadFlatCompat();

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^ignored" },
      ],
    },
  },
];

export default eslintConfig;
