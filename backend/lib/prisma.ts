/// <reference types="node" />
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import { generateSnowflakeIdString } from "./snowFlake";

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 5,
});
const prisma = new PrismaClient({ adapter }).$extends({
  query: {
    $allModels: {
      async create({ args, query }) {
        args.data.id = generateSnowflakeIdString();
        return query(args);
      },
      async createMany({ args, query }) {
        const records = Array.isArray(args.data) ? args.data : [args.data];
        records.forEach((r) => (r.id = generateSnowflakeIdString()));
        return query(args);
      },
    },
  },
});

export { prisma };
