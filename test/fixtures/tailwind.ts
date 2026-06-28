import { readFile } from "node:fs/promises";

export async function nodeTailwindStylesheetLoader(id: string, base: string) {
  const normalized = id === "tailwindcss" ? "tailwindcss/index.css" : id;
  const path = normalized.startsWith("tailwindcss/")
    ? `node_modules/${normalized}`
    : `${base.replace(/^\//, "")}/${normalized}`;

  return readFile(path, "utf8");
}

export const inlineTailwindCss = `
@theme {
  --color-red-500: oklch(63.7% 0.237 25.331);
  --color-blue-100: oklch(93.2% 0.032 255.585);
}
@tailwind utilities;
`;
