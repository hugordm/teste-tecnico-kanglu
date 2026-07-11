import { PrismaClient } from "@prisma/client";

// Em dev o hot-reload reavalia os módulos a cada save. Sem o singleton,
// cada reload cria um novo PrismaClient e o Postgres esgota conexões.
// Guardamos a instância no globalThis (que sobrevive ao hot-reload) e a
// reutilizamos; em produção o processo é único, então instanciamos direto.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
