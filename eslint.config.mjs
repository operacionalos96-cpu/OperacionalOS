import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Camadas (docs/adr/0002-camadas.md): o domínio é regra pura, sem tela nem banco.
  // Assim ele roda em qualquer lugar (navegador, servidor, testes) e não quebra quando a infraestrutura muda.
  {
    files: ["src/lib/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*", "next", "next/*"], message: "Domínio não conhece tela: mova isto para components/ ou app/." },
            { group: ["@supabase/*", "@/lib/supabase/*", "@/lib/server/*", "@/lib/repositories/*"], message: "Domínio não conhece banco: receba os dados por parâmetro." },
            { group: ["@/lib/store", "@/lib/modules", "@/lib/*-store"], message: "Domínio não conhece estado da tela: receba os dados por parâmetro." },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "workers/**",
    ],
  },
];

export default eslintConfig;
