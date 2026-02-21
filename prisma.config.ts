import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: isProd ? "node dist/utils/seed.js" : "tsx src/utils/seed.ts",
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
