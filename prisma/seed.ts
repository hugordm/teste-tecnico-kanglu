import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Seed determinístico: cópia fiel dos 3 artigos que estão publicados no banco.
// O conteúdo NÃO é regenerado por IA — é o texto real que está no ar, incluindo
// as imagens (ogImage no Vercel Blob) e o crédito da geração.
// aiAssisted/aiModel refletem que a redação inicial teve apoio de IA.
const AI_MODEL = "google/gemini-3.1-flash-lite";
const IMAGE_CREDIT = "Nano Banana 2 (Gemini) via OpenRouter";

const articles = [
  {
    title:
      "Como as notificações de status transformam a experiência pós-venda e fidelizam clientes",
    slug: "como-notificacoes-de-status-fidelizam-clientes-no-ecommerce",
    excerpt:
      "Descubra como manter seu cliente informado sobre cada etapa da entrega pode reduzir a ansiedade, aumentar a confiança e fortalecer a fidelização no e-commerce.",
    content: `## A importância de manter o cliente informado

No e-commerce, a jornada do cliente não termina no clique do botão de compra. Diferente da loja física, onde a entrega é imediata, o ambiente online exige uma atenção especial à logística. Manter o consumidor munido de informações sobre sua encomenda, desde a finalização do pedido até a chegada em suas mãos, é um diferencial competitivo essencial para qualquer lojista.

Segundo a ABComm (Associação Brasileira de Comércio Eletrônico), o setor vive um momento de expansão acelerada, com milhões de novos consumidores ingressando no universo das compras online. Para esse público, que ainda está se adaptando ao modelo digital, o acompanhamento transparente da entrega é fundamental para transmitir segurança e confiança.

## Benefícios estratégicos das notificações de status

Oferecer atualizações constantes sobre o status do pedido traz vantagens práticas que impactam diretamente a operação e a percepção da marca:

* **Controle da ansiedade:** A espera por um produto gera expectativa. Comunicar cada nova atualização de status ajuda a tranquilizar o comprador, reduzindo a incerteza durante o período de trânsito da mercadoria.
* **Credibilidade e reputação:** Lojas que mantêm uma comunicação clara constroem uma imagem de profissionalismo. Quando o cliente percebe que a loja se importa com a entrega, a reputação digital é fortalecida, abrindo portas para avaliações positivas.
* **Prevenção de problemas logísticos:** O monitoramento constante permite que o lojista identifique movimentações atípicas ou atrasos antes mesmo que o cliente perceba. Agir de forma proativa, informando o consumidor sobre um imprevisto, transforma uma experiência negativa em uma oportunidade de demonstrar suporte e atenção.
* **Redução de reentregas:** Quando o cliente sabe com precisão quando o pedido chegará, ele pode se organizar para recebê-lo. Isso evita tentativas frustradas de entrega, que geram custos extras e desgastes desnecessários para ambas as partes.

## O papel do pós-venda na fidelização

O rastreamento de encomendas é uma ferramenta poderosa para a fidelização. Ao fornecer informações em tempo real, o lojista não apenas entrega um produto, mas oferece uma experiência de compra completa. Esse cuidado no pós-venda ajuda o cliente a se sentir seguro, tornando muito mais provável que ele retorne à sua loja em uma próxima oportunidade.

Lembre-se: em um mercado cada vez mais competitivo, o que diferencia uma loja de sucesso é a capacidade de manter o cliente informado e satisfeito em todas as etapas da jornada, especialmente na fase final da entrega.`,
    metaTitle: "Notificações de status e fidelização no e-commerce | Kanglu",
    metaDescription:
      "Saiba como as notificações de status no pós-venda ajudam a reduzir a ansiedade do cliente, aumentar a confiança e fidelizar consumidores no e-commerce.",
    ogImage:
      "https://hn6ldxzrjpr0vrlp.public.blob.vercel-storage.com/articles/cmrgltto60003pgs0r83l5mv0-1783797195651.jpg",
    imageCredit: IMAGE_CREDIT,
    publishedAt: new Date("2026-07-11T16:50:14.736Z"),
    sources: [
      {
        title:
          "Entenda a importância do rastreamento de encomendas no e-commerce",
        url: "https://abcomm.org/noticias/entenda-a-importancia-do-rastreamento-de-encomendas-no-e-commerce/",
        accessedAt: new Date("2026-07-11T19:13:25.296Z"),
      },
    ],
  },
  {
    title:
      "Como a experiência pós-compra transforma clientes em compradores recorrentes",
    slug: "experiencia-pos-compra-fidelizacao-ecommerce",
    excerpt:
      "Descubra como o acompanhamento transparente de pedidos pode reduzir a ansiedade do consumidor e construir a confiança necessária para fidelizar clientes no e-commerce.",
    content: `## O poder da experiência pós-compra

No e-commerce, a jornada do cliente não termina no clique final do checkout. Diferente da loja física, onde a transação é imediata, o ambiente digital exige que o lojista gerencie toda uma cadeia logística até que o produto chegue às mãos do consumidor. Segundo a Associação Brasileira de Comércio Eletrônico (ABComm), o setor tem passado por uma expansão acelerada, trazendo milhões de novos consumidores para o digital. Para esses novos usuários, o acompanhamento detalhado da entrega é fundamental para transmitir segurança e confiança.

## Por que o rastreamento é um diferencial competitivo?

Manter o cliente informado sobre cada etapa da entrega, desde a finalização do pedido até o recebimento, é uma estratégia poderosa para transformar compradores ocasionais em clientes recorrentes. Veja como o rastreio impacta o seu negócio:

*   **Redução da ansiedade:** O consumidor moderno deseja acompanhar o status do pedido em tempo real. Fornecer atualizações constantes ajuda a gerenciar essa expectativa e demonstra profissionalismo.
*   **Adaptação ao digital:** Para quem está começando a comprar online agora, o rastreamento funciona como uma ponte, tornando o processo mais transparente e menos intimidador.
*   **Construção de credibilidade:** Um processo de entrega bem comunicado fortalece a reputação da sua marca. Quando o cliente se sente seguro, a chance de ele avaliar positivamente a loja e retornar para novas compras aumenta significativamente.
*   **Eficiência logística:** O acompanhamento proativo permite que o lojista identifique movimentações atípicas ou atrasos antes que o cliente perceba, permitindo uma comunicação antecipada e resolutiva. Além disso, manter o cliente ciente da data de entrega ajuda a evitar tentativas de reentrega, otimizando custos e tempo.

## Transformando a espera em satisfação

O segredo para a recorrência está em transformar a fase de espera em um momento de tranquilidade. Ao fornecer informações claras e automáticas, você não apenas evita dúvidas, mas também cria uma experiência de compra memorável. Lembre-se: o marketing espontâneo e a fidelização são construídos quando a promessa de entrega é cumprida com transparência e suporte constante. Ao priorizar a comunicação pós-compra, sua loja se destaca em um mercado cada vez mais competitivo e pulsante.`,
    metaTitle: "Pós-compra: Como fidelizar clientes através da experiência de entrega",
    metaDescription:
      "Entenda como o rastreamento e a comunicação no pós-compra ajudam a reduzir a ansiedade do cliente e transformam compradores em clientes recorrentes.",
    ogImage:
      "https://hn6ldxzrjpr0vrlp.public.blob.vercel-storage.com/articles/cmrgltu820005pgs0wawt4rm6-1783796982930.jpg",
    imageCredit: IMAGE_CREDIT,
    publishedAt: new Date("2026-07-11T16:51:53.132Z"),
    sources: [
      {
        title:
          "Entenda a importância do rastreamento de encomendas no e-commerce",
        url: "https://abcomm.org/noticias/entenda-a-importancia-do-rastreamento-de-encomendas-no-e-commerce/",
        accessedAt: new Date("2026-07-11T18:36:56.964Z"),
      },
    ],
  },
  {
    title:
      "Como lidar com trocas e devoluções no e-commerce: guia prático para lojistas",
    slug: "como-lidar-com-trocas-e-devolucoes-no-e-commerce",
    excerpt:
      "Entenda como transformar o desafio das devoluções em uma oportunidade de fidelização e como reduzir custos operacionais na sua loja virtual.",
    content: `## O impacto das devoluções no seu e-commerce

As devoluções são uma parte natural do comércio digital, mas quando ocorrem em excesso, podem comprometer as margens de lucro da sua loja. Conforme apontado pela CNDL, uma parcela significativa dos custos operacionais no e-commerce é direcionada à logística reversa. Esse processo envolve gastos com coleta, transporte, armazenamento, inspeção, reembalagem e custos administrativos.

Além do impacto financeiro, é preciso considerar a questão ambiental, já que o transporte adicional aumenta a emissão de carbono. No Brasil, o Código de Defesa do Consumidor garante o direito de arrependimento, permitindo que o cliente devolva produtos comprados online em até 7 dias, o que torna a gestão desse processo um diferencial competitivo fundamental.

## Principais motivos de devolução

Para mitigar esse problema, é preciso entender por que os clientes devolvem produtos. Segundo dados citados pela CNDL, os motivos mais comuns incluem:

*   Itens danificados ou com defeito;
*   Problemas com tamanho ou ajuste;
*   Produtos que não correspondem à descrição original;
*   Insatisfação geral com o item;
*   Compra de múltiplos tamanhos para escolha posterior;
*   Atrasos na entrega.

## Estratégias para reduzir devoluções

Educar o consumidor antes da compra é a melhor forma de evitar expectativas frustradas. Algumas práticas recomendadas incluem:

*   **Conteúdo rico:** Utilize descrições detalhadas, imagens de alta resolução com múltiplos ângulos e vídeos que mostrem o produto em uso.
*   **Transparência técnica:** Ofereça guias de medidas precisos e informações técnicas claras.
*   **Prova social:** Incentive avaliações de outros clientes. Permitir que compradores filtrem comentários por biotipo, por exemplo, ajuda novos clientes a escolherem o tamanho correto.
*   **Logística eficiente:** Em datas sazonais, como Natal e Dia das Mães, garanta que os prazos de entrega sejam cumpridos para evitar devoluções por atraso.
*   **Atendimento consultivo:** Disponibilize canais de suporte para tirar dúvidas antes da finalização do pedido.

## Como transformar a devolução em experiência positiva

Se a devolução for inevitável, a forma como você conduz o processo define se o cliente voltará a comprar na sua loja. Um processo simples e objetivo é essencial. Oferecer uma página dedicada à solicitação de trocas, onde o cliente escolhe o método de envio e recebe instruções claras por e-mail, aumenta a confiança do consumidor.

Além disso, considere:

*   **Política clara:** Mantenha sua política de trocas e devoluções acessível e fácil de entender.
*   **Feedback contínuo:** Após a devolução, solicite o feedback do cliente. Entender o motivo real da insatisfação é o primeiro passo para ajustar falhas no seu catálogo ou operação.
*   **Integração com loja física:** Se você possui pontos físicos, permitir a troca ou devolução na loja pode ser uma excelente oportunidade para converter o cliente em uma nova venda.

Lembre-se: embora não seja possível eliminar totalmente as devoluções, um processo bem estruturado protege sua margem de lucro e fortalece o relacionamento com o seu público.`,
    metaTitle: "Como lidar com trocas e devoluções no e-commerce | Guia prático",
    metaDescription:
      "Saiba como criar uma política de trocas e devoluções clara, respeitar os prazos legais do CDC e reduzir custos com um processo eficiente no seu e-commerce.",
    ogImage:
      "https://hn6ldxzrjpr0vrlp.public.blob.vercel-storage.com/articles/cmrgu0mqo0000l70499qae7xw-1783802694027.jpg",
    imageCredit: IMAGE_CREDIT,
    publishedAt: new Date("2026-07-11T20:45:05.252Z"),
    sources: [
      {
        title: "Devoluções no e-commerce: aprenda a mitigar o problema - Varejo ...",
        url: "https://cndl.org.br/varejosa/devolucoes-no-e-commerce-aprenda-a-mitigar-o-problema/",
        accessedAt: new Date("2026-07-11T20:45:04.706Z"),
      },
    ],
  },
];

async function main() {
  // Idempotência: limpa tudo antes de recriar. As sources caem junto por
  // conta do onDelete: Cascade definido no schema.
  await prisma.article.deleteMany();

  for (const { sources, ...data } of articles) {
    await prisma.article.create({
      data: {
        ...data,
        status: "published",
        aiAssisted: true,
        aiModel: AI_MODEL,
        sources: { create: sources },
      },
    });
  }

  const count = await prisma.article.count();
  console.log(`Seed concluído: ${count} artigos criados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
