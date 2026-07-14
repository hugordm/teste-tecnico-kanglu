import { PrismaClient } from "@prisma/client";
import { normalizeCategory } from "../src/lib/categories";

// ---------------------------------------------------------------------------
// Atribui CATEGORIA aos artigos JÁ existentes, por SLUG — de forma
// NÃO-DESTRUTIVA. Diferente do seed (que faz deleteMany + recria), este script
// só roda UPDATEs pontuais: nada é apagado, então é seguro rodar contra um banco
// COMPARTILHADO. Idempotente: rodar de novo apenas reafirma os mesmos valores.
//
// Uso (aponte o DATABASE_URL para o banco desejado):
//   DATABASE_URL=... npx tsx prisma/assign-categories.ts
//
// As categorias abaixo refletem o tema real de cada um dos 3 artigos. Passam por
// normalizeCategory (mesma allowlist da app) — um slug inválido aqui viraria erro
// explícito em vez de gravar lixo.
// ---------------------------------------------------------------------------

const ASSIGNMENTS: { slug: string; category: string }[] = [
  { slug: "importancia-atendimento-pos-venda-fidelizacao", category: "atendimento" },
  { slug: "como-reduzir-prazos-de-entrega-no-ecommerce", category: "logistica" },
  { slug: "importancia-rastreamento-pedidos-ecommerce", category: "logistica" },
];

const prisma = new PrismaClient();

async function main() {
  for (const { slug, category } of ASSIGNMENTS) {
    const normalized = normalizeCategory(category);
    if (!normalized) {
      throw new Error(`Categoria inválida para "${slug}": ${category}`);
    }
    // updateMany por slug (único): 0 se o artigo não existir, 1 se existir.
    // Não cria nada — se o slug não estiver no banco, apenas avisa.
    const res = await prisma.article.updateMany({
      where: { slug },
      data: { category: normalized },
    });
    console.log(
      res.count > 0
        ? `✓ ${slug} → ${normalized}`
        : `· ${slug} não encontrado (pulado)`,
    );
  }
  console.log("Atribuição de categorias concluída (não-destrutiva).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
