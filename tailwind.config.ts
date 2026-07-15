import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        saarly: {
          green: "#85BB64",
          light: "#B2F789",
          off: "#F7F6F3",
          dark: "#23262B",
          yellow: "#F5B82E"
        }
      },
      fontFamily: {
        tajawal: ["Tajawal", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;

