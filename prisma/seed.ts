import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Seed determinístico: cópia fiel dos 3 artigos já revisados e publicados.
// O conteúdo NÃO é regenerado por IA — é o texto real que está no ar.
// aiAssisted/aiModel refletem que a redação inicial teve apoio de IA.
const AI_MODEL = "google/gemini-3.1-flash-lite";

const articles = [
  {
    title: "Rastreio no Marketplace vs. Transportadora: Entenda a Diferença",
    slug: "diferenca-rastreio-marketplace-transportadora",
    excerpt:
      "Descubra como funciona o rastreamento de pedidos e qual o papel do lojista na gestão das etiquetas e no acompanhamento das entregas.",
    content: `## O papel do rastreamento no e-commerce

O rastreamento de mercadorias é uma ferramenta essencial para qualquer lojista que deseja oferecer segurança e transparência aos seus clientes. Segundo a Intelipost, o objetivo principal é registrar o status da carga em cada etapa do percurso, desde a coleta até a entrega final ao consumidor. Além de aumentar a confiabilidade, essa prática permite que o cliente se programe para receber o produto, evitando desencontros.

Para a empresa, o rastreio vai além da logística: é uma ferramenta estratégica. De acordo com a Linx Commerce, acompanhar o trajeto em tempo real ajuda a identificar gargalos, reduzir custos e prever atrasos, permitindo que a loja aja com agilidade diante de imprevistos como extravios.

## A diferença no processo de rastreio

Quando falamos de vendas em marketplaces, existe uma particularidade importante no fluxo operacional. Conforme aponta a Intelipost, a grande diferença reside na responsabilidade pela geração da etiqueta de rastreio, que cabe ao próprio vendedor.

O processo funciona da seguinte forma:

1. **Geração da etiqueta:** Ao contratar o serviço de transporte, o vendedor é responsável por gerar a etiqueta, momento em que o código de rastreio é criado.
2. **Fixação:** A etiqueta deve ser fixada corretamente na embalagem da mercadoria.
3. **Atualização:** Ao despachar o produto, o vendedor deve atualizar o status da entrega como "pedido postado".

Uma vez que o código é gerado e o status atualizado, o cliente final pode acompanhar a movimentação da encomenda diretamente, sem precisar entrar em contato com a loja para saber onde o pedido se encontra.

## Por que investir no monitoramento?

Além de melhorar a experiência do cliente, o rastreamento permite que o lojista faça um gerenciamento de performance das transportadoras. Segundo a Intelipost, é possível analisar dados como:

* Tempo médio de entrega;
* Número de avarias;
* Frequência de extravios;
* Problemas logísticos recorrentes.

Com essas informações, o lojista consegue tomar decisões mais seguras sobre quais parceiros logísticos manter, garantindo um nível de serviço superior que se torna um diferencial competitivo no mercado. Como destaca a Linx Commerce, oferecer um rastreio eficiente transmite profissionalismo e fortalece o vínculo com o consumidor, transformando a entrega em uma oportunidade de engajamento e fidelização.`,
    metaTitle: "Rastreio no Marketplace vs. Transportadora: Guia para Lojistas",
    metaDescription:
      "Entenda como funciona o rastreamento de pedidos, a responsabilidade do lojista na geração de etiquetas e como otimizar a logística da sua loja virtual.",
    publishedAt: new Date("2026-07-11T14:47:19.535Z"),
    sources: [
      {
        title: "Como funciona o rastreamento para marketplace?",
        url: "https://www.intelipost.com.br/blog/como-funciona-o-rastreamento-para-marketplace/",
        accessedAt: new Date("2026-07-11T14:47:17.488Z"),
      },
      {
        title: "Rastreamento de pedidos no e-commerce: por que fazer?",
        url: "https://www.linxcommerce.com.br/rastreamento-de-pedidos-no-e-commerce-por-que-fazer/",
        accessedAt: new Date("2026-07-11T14:47:17.488Z"),
      },
    ],
  },
  {
    title: "Como usar notificações de status para fidelizar clientes no e-commerce",
    slug: "notificacoes-status-pedido-ecommerce",
    excerpt:
      "Aprenda como o envio de notificações de status em tempo real reduz a ansiedade do cliente e fortalece a confiança na sua marca.",
    content: `## A importância da transparência no pós-venda

No e-commerce, a confiança é um pilar fundamental. Com o receio de fraudes e a ansiedade natural da espera, manter o cliente informado sobre cada etapa do pedido deixou de ser um diferencial e passou a ser parte essencial da experiência de compra. Quanto mais transparente for o acompanhamento da entrega, mais seguro o consumidor se sente com a sua loja.

## Por que notificar o cliente sobre o status do pedido?

Permitir que o consumidor rastreie sua compra minuto a minuto aumenta a satisfação e reduz a carga sobre o seu suporte. De acordo com a pesquisa do IDC, 65% dos consumidores voltam a comprar de uma marca devido a uma boa experiência, que inclui o monitoramento do pedido como um dos fatores decisivos.

Os benefícios de um sistema de rastreamento eficaz incluem:

* **Melhor experiência do cliente (CX):** Reduz a ansiedade da espera com atualizações via e-mail, SMS, push notifications ou WhatsApp.
* **Redução de custos operacionais:** Automatizar respostas sobre "onde está meu pedido" diminui a necessidade de aumentar a equipe de atendimento, especialmente em períodos de alta demanda como Black Friday ou Natal.
* **Eficiência logística:** O monitoramento contínuo permite uma análise de dados mais precisa sobre as remessas.

## Como estruturar sua régua de comunicação

Para ser eficiente, a comunicação deve ser clara e proativa. Não espere o cliente perguntar; antecipe-se com mensagens automáticas. A SmartEnvios sugere uma régua de comunicação que acompanha a jornada do pacote:

1. **Pedido postado:** Confirme que o pacote foi entregue à transportadora e forneça o código de rastreio.
2. **Em trânsito:** Informe que o pedido está se movendo entre centros de distribuição.
3. **Saiu para entrega:** Avise que o produto está na rota final, gerando expectativa positiva.
4. **Objeto entregue:** Celebre a chegada e aproveite para enviar uma pesquisa de satisfação ou um cupom de desconto.

## Dicas para uma estratégia de sucesso

* **Escolha os canais certos:** Embora o e-mail seja padrão, os clientes estão cada vez mais abertos a receber atualizações via WhatsApp, SMS e push notifications. Identifique onde seu público é mais ativo.
* **Automatize com inteligência:** Ferramentas como o *Moments* da Infobip ou o *NotiFlow* da SmartEnvios permitem configurar gatilhos automáticos. Isso garante que a informação chegue no momento certo, sem esforço manual.
* **Use o rastreamento para cross-sell:** Notificações de entrega podem ser oportunidades para oferecer produtos complementares, desde que a oferta seja contextualizada e secundária à informação principal.
* **Seja honesto sobre prazos:** Informar prazos reais ajuda o cliente a se organizar, reduzindo a especulação e a preocupação.

Ao transformar a logística em uma experiência de comunicação transparente, você não apenas acalma o cliente, mas constrói uma relação de profissionalismo que diferencia sua loja da concorrência.`,
    metaTitle: "Notificações de status no e-commerce: guia de boas práticas",
    metaDescription:
      "Saiba como usar notificações de status via WhatsApp e e-mail para aumentar a confiança, reduzir chamados no suporte e fidelizar seus clientes.",
    publishedAt: new Date("2026-07-11T14:55:16.611Z"),
    sources: [
      {
        title: "Notificações de pedidos: boas práticas e dicas",
        url: "https://www.infobip.com/pt/blog/boas-praticas-notificacoes-acompanhamento-pedidos",
        accessedAt: new Date("2026-07-11T14:55:14.565Z"),
      },
      {
        title: "O que significa pedido postado no rastreamento",
        url: "https://smartenvios.com/o-que-significa-pedido-postado/",
        accessedAt: new Date("2026-07-11T14:55:14.565Z"),
      },
    ],
  },
  {
    title: "Integração entre ERP e transportadora: o que o lojista precisa saber",
    slug: "integracao-erp-transportadora-logistica",
    excerpt:
      "Descubra como a integração entre o seu ERP e as transportadoras pode otimizar a logística, reduzir custos e facilitar a emissão de etiquetas.",
    content: `## Por que integrar o seu ERP com transportadoras?

A logística é um dos pilares mais críticos para o sucesso de um e-commerce. Ao integrar um sistema de gestão (ERP) como o **Bling** a serviços logísticos e transportadoras, você centraliza todas as atividades em uma única plataforma. Isso elimina a necessidade de alternar entre diferentes sites, proporcionando mais agilidade e controle operacional.

Segundo a documentação do Bling, essa integração permite realizar desde a cotação de fretes até a emissão de remessas e a impressão de etiquetas de transporte com apenas alguns cliques. Além disso, o processo pode ser automatizado após a emissão da NF-e, garantindo que o pedido siga para a expedição sem gargalos.

## Principais benefícios da integração logística

### 1. Automação e eficiência
Ao integrar o sistema, a remessa é criada automaticamente quando um pedido é gerado. Além disso, é possível automatizar o envio do código de rastreio para o cliente com mensagens personalizadas, melhorando a experiência de compra.

### 2. Gestão de etiquetas simplificada
Esqueça a burocracia na hora de despachar. Com o ERP, você pode imprimir etiquetas de transporte, DANFE e até etiquetas unificadas (transporte com DANFE simplificado) de forma rápida. Ferramentas como o "Checkout de Pedidos de Venda" também auxiliam na conferência e separação dos produtos, reduzindo erros na expedição.

### 3. Logística Reversa
O processo de trocas e devoluções também é facilitado. As principais transportadoras integradas ao Bling oferecem suporte à logística reversa, permitindo que o lojista gerencie todo o fluxo de retorno diretamente pelo ERP.

## O papel dos Hubs Logísticos

Plataformas como o **Melhor Envio** funcionam como facilitadores que, ao serem integrados ao Bling, permitem acesso a diversas transportadoras sem a necessidade de contratos individuais com cada uma delas. De acordo com o Melhor Envio, essa integração oferece:
- **Cálculo de frete:** Disponível diretamente na página do produto ou checkout.
- **Preços competitivos:** Acesso a fretes com descontos e prazos especiais.
- **Rastreio centralizado:** Acompanhamento de encomendas de diferentes transportadoras em um só lugar.

## Como começar?

Para quem utiliza o Bling, o sistema funciona como um verdadeiro hub de gestão. A integração via API (Application Programming Interface) permite que o software se comunique com diversos parceiros logísticos, como Correios, Jadlog, Loggi, Total Express, entre outros.

Para configurar, basta acessar a área de integrações do seu ERP, selecionar o parceiro logístico desejado e seguir as instruções de configuração. Essa "virada de chave" na gestão permite que você dedique mais tempo ao crescimento do seu negócio, enquanto o sistema cuida da organização dos processos de entrega.`,
    metaTitle: "Integração ERP e Transportadora: Otimize sua Logística",
    metaDescription:
      "Aprenda como a integração entre ERP e transportadoras pode automatizar a emissão de etiquetas, o cálculo de frete e a gestão logística do seu e-commerce.",
    publishedAt: new Date("2026-07-11T14:59:12.234Z"),
    sources: [
      {
        title: "Integrações Logísticas | Bling - Sistema de gestão online",
        url: "https://www.bling.com.br/integracoes-bling/integracao-logistica",
        accessedAt: new Date("2026-07-11T14:59:11.110Z"),
      },
      {
        title:
          "Descubra as Vantagens de Integrar o Melhor Envio com o Bling e Otimize a Logística de sua loja virtual",
        url: "https://melhorenvio.com.br/blog/frete-e-logistica/integracao-melhor-envio-bling/",
        accessedAt: new Date("2026-07-11T14:59:11.110Z"),
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
