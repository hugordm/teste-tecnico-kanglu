import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Seed determinístico: cópia fiel dos 3 artigos já revisados e publicados.
// O conteúdo NÃO é regenerado por IA — é o texto real que está no ar.
// aiAssisted/aiModel refletem que a redação inicial teve apoio de IA.
const AI_MODEL = "google/gemini-3.1-flash-lite";

const articles = [
  {
    title: "A importância do rastreamento de pedidos para o sucesso do seu e-commerce",
    slug: "importancia-rastreamento-pedidos-ecommerce",
    excerpt: "Descubra como o rastreamento de pedidos transforma a experiência do cliente, reduz a ansiedade pós-compra e otimiza a gestão logística da sua loja virtual.",
    content: `## Por que o rastreamento é essencial no e-commerce?

No cenário atual do comércio eletrônico, o rastreamento de encomendas deixou de ser um detalhe operacional para se tornar um diferencial competitivo estratégico. Com a rápida expansão do setor, observada em levantamentos da ABComm, muitos consumidores estão realizando suas primeiras compras online. Para esse público, o acompanhamento do pedido é fundamental para reduzir a ansiedade e transmitir a segurança necessária para fidelizar a compra.

## Benefícios práticos para a sua loja

Manter o cliente informado sobre cada etapa da entrega traz vantagens diretas para o lojista:

*   **Redução da ansiedade do consumidor:** Ao fornecer atualizações constantes, você diminui a insegurança do cliente durante o período de espera.
*   **Prevenção de reentregas:** Quando o cliente sabe quando o pedido chegará, ele pode se organizar para recebê-lo, evitando tentativas de entrega frustradas que geram custos extras.
*   **Gestão proativa de problemas:** O rastreamento permite identificar movimentações atípicas, como atrasos ou paradas prolongadas, antes que o cliente perceba. Isso possibilita que você entre em contato primeiro, mantendo a transparência e a credibilidade da marca.
*   **Adaptação ao digital:** Para novos compradores, o rastreio ajuda a diminuir o choque entre a experiência de compra física e a digital, tornando o processo mais compreensível e confiável.

## Como otimizar o acompanhamento das entregas

Gerenciar o rastreio manualmente, acessando diversos sites de transportadoras, é ineficiente e consome tempo precioso. A recomendação é utilizar plataformas de rastreamento que centralizam as informações de diferentes parceiros logísticos em um único painel.

Além de automatizar o processo, essas ferramentas permitem o envio de notificações automáticas para o cliente. Contudo, você pode ir além: ao enviar o código de rastreio por canais como WhatsApp ou e-mail, você reforça o cuidado da sua marca e mantém o canal de comunicação aberto para eventuais dúvidas.

## Comunicação como aliada

Lembre-se que a comunicação deve ser constante, especialmente em situações imprevistas. Caso ocorra um atraso, informar o cliente proativamente sobre a nova previsão de entrega é uma atitude que favorece a experiência do consumidor, mesmo diante de um contratempo. Ao otimizar o rastreamento, você não apenas melhora a eficiência interna da sua loja, mas também fortalece a reputação digital do seu negócio.`,
    metaTitle: "A importância do rastreamento de pedidos no e-commerce",
    metaDescription: "Entenda como o rastreamento de pedidos melhora a experiência do cliente, reduz a ansiedade e ajuda na gestão logística da sua loja virtual.",
    publishedAt: new Date("2026-07-11T16:48:50.014Z"),
    sources: [
      {
        title: "Entenda a importância do rastreamento de encomendas no e-commerce",
        url: "https://abcomm.org/noticias/entenda-a-importancia-do-rastreamento-de-encomendas-no-e-commerce/",
        accessedAt: new Date("2026-07-11T16:48:49.488Z"),
      },
      {
        title: "Como otimizar o rastreamento de encomendas no e-commerce",
        url: "https://www.ecommercebrasil.com.br/artigos/como-otimizar-o-rastreamento-de-encomendas-no-e-commerce",
        accessedAt: new Date("2026-07-11T16:48:49.488Z"),
      },
    ],
  },
  {
    title: "Como as notificações de status transformam a experiência pós-venda e fidelizam clientes",
    slug: "como-notificacoes-de-status-fidelizam-clientes-no-ecommerce",
    excerpt: "Descubra como manter seu cliente informado sobre cada etapa da entrega pode reduzir a ansiedade, aumentar a confiança e fortalecer a fidelização no e-commerce.",
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
    metaDescription: "Saiba como as notificações de status no pós-venda ajudam a reduzir a ansiedade do cliente, aumentar a confiança e fidelizar consumidores no e-commerce.",
    publishedAt: new Date("2026-07-11T16:50:14.736Z"),
    sources: [
      {
        title: "Entenda a importância do rastreamento de encomendas no e-commerce",
        url: "https://abcomm.org/noticias/entenda-a-importancia-do-rastreamento-de-encomendas-no-e-commerce/",
        accessedAt: new Date("2026-07-11T16:50:14.383Z"),
      },
    ],
  },
  {
    title: "Como a experiência pós-compra transforma clientes em compradores recorrentes",
    slug: "experiencia-pos-compra-fidelizacao-ecommerce",
    excerpt: "Descubra como o acompanhamento estratégico do pós-compra pode reduzir a ansiedade do cliente, aumentar a confiança na sua marca e impulsionar a fidelização.",
    content: `## O valor do pós-compra no e-commerce

No comércio eletrônico, a jornada do cliente não termina no clique final de pagamento. Diferente da compra em uma loja física, onde o processo é imediato, o e-commerce exige uma cadeia logística que demanda atenção constante até que o produto chegue às mãos do consumidor. Segundo a ABComm, o crescimento do setor no Brasil tem atraído milhões de novos compradores, muitos dos quais ainda estão se adaptando a esse modelo de consumo. Proporcionar uma experiência pós-compra transparente é o diferencial que transforma uma entrega comum em uma oportunidade de fidelização.

## Por que o rastreamento é a chave da confiança

Manter o cliente informado sobre cada etapa da entrega é uma das formas mais eficazes de construir credibilidade. De acordo com a ABComm, o rastreamento de encomendas desempenha papéis fundamentais para o sucesso do lojista:

*   **Redução da ansiedade:** O consumidor moderno deseja acompanhar cada atualização. Oferecer visibilidade sobre o status do pedido transmite segurança e tranquilidade durante o período de espera.
*   **Adaptação ao digital:** Para novos compradores, entender o fluxo logístico ajuda a diminuir o choque entre a experiência física e a virtual, tornando o processo mais natural.
*   **Gestão proativa de problemas:** Monitorar as encomendas permite que o lojista identifique movimentações atípicas ou atrasos antes mesmo que o cliente perceba. Antecipar-se e comunicar o consumidor sobre imprevistos é essencial para manter um bom relacionamento.
*   **Eficiência operacional:** Quando o cliente está ciente da data estimada de entrega, ele pode se organizar para receber o pacote. Isso evita tentativas de reentrega, que geram custos extras e frustração para ambas as partes.

## Transformando a entrega em fidelização

Quando o processo de entrega ocorre sem falhas e com boa comunicação, a reputação da sua loja é fortalecida. Esse é o momento ideal para incentivar o marketing espontâneo, convidando o cliente a avaliar o produto ou a experiência de compra. 

Lembre-se: cada atualização de status é uma oportunidade de manter sua marca presente na mente do consumidor. Ao investir em uma comunicação clara e eficiente após a venda, você não apenas entrega um produto, mas constrói a confiança necessária para que esse comprador retorne à sua loja no futuro.`,
    metaTitle: "Pós-compra: Como fidelizar clientes através da experiência de entrega",
    metaDescription: "Entenda como o rastreamento e a comunicação no pós-compra ajudam a reduzir a ansiedade do cliente e transformam compradores em clientes recorrentes.",
    publishedAt: new Date("2026-07-11T16:51:53.132Z"),
    sources: [
      {
        title: "Entenda a importância do rastreamento de encomendas no e-commerce",
        url: "https://abcomm.org/noticias/entenda-a-importancia-do-rastreamento-de-encomendas-no-e-commerce/",
        accessedAt: new Date("2026-07-11T16:51:52.680Z"),
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
