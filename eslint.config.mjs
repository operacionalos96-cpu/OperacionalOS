import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** Áreas do app (cada uma pode virar um app próprio). Base comum fora desta lista: ui, shared, entities, dialogs, shell. */
const FEATURE_MODULES = ["ai-office", "board", "content", "crm", "dashboard", "finance", "goals", "mindmap", "org", "products", "prospecting", "tasks"];

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
  // Fronteiras entre módulos (docs/adr/0007-frontend-modular.md): uma área (ex.: tarefas) não usa
  // telas de outra área diretamente — só a base comum (ui, shared, entities, dialogs). É o que permite
  // separar cada área em um app no futuro. Aviso (não erro) enquanto os 4 casos antigos são resolvidos.
  ...FEATURE_MODULES.map((mod) => ({
    files: [`src/components/${mod}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: FEATURE_MODULES.filter((m) => m !== mod).map((m) => `@/components/${m}/*`),
              message: "Área importando tela de outra área: mova o que é comum para components/shared ou components/entities (ADR 0007).",
            },
          ],
        },
      ],
    },
  })),
];

export default eslintConfig;
