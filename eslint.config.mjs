import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: [
      "qa-artifacts/**",
      ".vercel/**",
      "supabase/functions/**",
    ],
  },
];

export default config;
