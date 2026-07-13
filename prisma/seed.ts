import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Seed determinístico: cópia FIEL dos 3 artigos publicados no banco (lidos em
// 2026-07-13). O conteúdo NÃO é regenerado por IA — é o texto real já revisado,
// preservado byte a byte, INCLUINDO os marcadores [[imagem:URL]] no corpo e as
// URLs de imagem (capa em ogImage e imagens do corpo) hospedadas no Vercel Blob.
// aiModel/imageCredit/publishAt são gravados por artigo (variam entre eles).

const articles = [
  {
    title: "A importância do atendimento pós-venda para fidelização de clientes no e-commerce",
    slug: "importancia-atendimento-pos-venda-fidelizacao",
    excerpt: "Descubra como um pós-venda estratégico pode transformar compradores ocasionais em clientes fiéis, reduzir custos e aumentar a lucratividade da sua loja.",
    content: "## O que é o pós-venda e por que ele é estratégico?\n\nNo e-commerce, a jornada do consumidor não termina no clique final de compra. O pós-venda compreende todas as ações realizadas após a transação, incluindo logística, suporte, trocas e o relacionamento contínuo com o cliente. Longe de ser apenas uma tarefa operacional, o pós-venda é um pilar fundamental para a fidelização e o crescimento sustentável de qualquer negócio digital.\n\n## Por que investir na retenção de clientes?\n\nManter um cliente atual costuma ser bem mais vantajoso do que conquistar um novo. O custo de aquisição de novos consumidores tende a ser consideravelmente maior do que o investimento necessário para reter quem já comprou, e clientes fiéis geram mais valor ao longo do tempo. Por isso, direcionar esforços para a retenção costuma trazer um retorno expressivo para o negócio.\n\n## Benefícios de um pós-venda eficiente\n\n* **Aumento do LTV (Lifetime Value):** Clientes fiéis tendem a comprar com maior frequência e gastar mais ao longo do tempo.\n* **Redução do Churn:** Um suporte ágil e atencioso evita desistências e insatisfações.\n* **Marketing Orgânico:** Clientes satisfeitos tornam-se promotores da marca, gerando indicações espontâneas e fortalecendo a reputação do negócio.\n* **Previsibilidade Financeira:** A recorrência de compras traz mais estabilidade ao planejamento financeiro da loja.\n\n## Estratégias para um pós-venda de sucesso\n\nPara transformar a experiência do seu cliente, considere estas práticas:\n\n1. **Acompanhamento Proativo:** Não espere o cliente reclamar. Envie mensagens de agradecimento, confirme o recebimento do pedido e ofereça suporte para o uso do produto.\n2. **Atendimento Ágil e Multicanal:** Disponibilize canais como WhatsApp, e-mail e chat. A rapidez na resolução de problemas, como trocas ou dúvidas, é um fator decisivo para a confiança do consumidor.\n3. **Coleta de Feedback:** Utilize pesquisas de satisfação (como o NPS) para entender pontos de melhoria e mostrar ao cliente que a opinião dele é valorizada.\n4. **Conteúdo de Valor:** Envie tutoriais, dicas de uso ou manuais que ajudem o cliente a aproveitar melhor o que comprou, reforçando o compromisso da marca com o sucesso dele.\n5. **Personalização e Benefícios:** Utilize o histórico de compras para oferecer recomendações assertivas, cupons de desconto ou acesso a programas de fidelidade, criando uma conexão emocional com o consumidor.\n\n## O papel da tecnologia na organização\n\nPara escalar essas ações, a organização é essencial. O uso de sistemas de gestão e CRM permite manter a base de dados atualizada, automatizar comunicações e garantir que a equipe de atendimento tenha acesso rápido ao histórico de cada cliente, evitando que ele precise repetir informações desnecessariamente.\n\nLembre-se: em um mercado competitivo, a experiência pós-compra é o que diferencia uma loja comum de uma marca memorável. Ao cuidar de cada detalhe, você não apenas resolve problemas, mas constrói relacionamentos duradouros.",
    metaTitle: "Atendimento Pós-Venda: A Chave para Fidelizar Clientes no E-commerce",
    metaDescription: "Descubra como o pós-venda fideliza clientes, reduz custos de aquisição e aumenta o ticket médio. Estratégias práticas para lojistas de e-commerce.",
    ogImage: "https://hn6ldxzrjpr0vrlp.public.blob.vercel-storage.com/articles/cmrj7k2uz0000l104ywnrf9sa-1783946310464-1.jpg",
    imageCredit: "Nano Banana 2 (Gemini) via OpenRouter",
    aiAssisted: true,
    aiModel: "google/gemini-3.1-flash-lite",
    publishedAt: new Date("2026-07-13T12:44:16.099Z"),
    publishAt: new Date("2026-07-13T12:44:00.000Z"),
    sources: [
      {
        title: "Pós-venda: o que é, importância e como fazer corretamente",
        url: "https://www.docusign.com/pt-br/blog/fidelizar-o-cliente-no-pos-vendas",
        accessedAt: new Date("2026-07-13T12:44:15.564Z"),
      },
      {
        title: "Serviço pós-venda e fidelização de clientes",
        url: "https://dialnet.unirioja.es/descarga/articulo/7284719.pdf",
        accessedAt: new Date("2026-07-13T12:44:15.564Z"),
      },
      {
        title: "A importância do pós-venda para o sucesso de um negócio",
        url: "https://sebraeplay.com.br/content/a-importancia-do-pos-venda-para-o-sucesso-de-um-negocio",
        accessedAt: new Date("2026-07-13T12:44:15.564Z"),
      },
      {
        title: "Pós-venda: 3 estratégias para fidelizar clientes - UOL Host",
        url: "https://uolhost.uol.com.br/blog/pos-venda/",
        accessedAt: new Date("2026-07-13T12:44:15.564Z"),
      },
    ],
  },
  {
    title: "Como reduzir prazos de entrega no e-commerce: 9 estratégias práticas",
    slug: "como-reduzir-prazos-de-entrega-no-ecommerce",
    excerpt: "Descubra como mapear processos, automatizar etapas, organizar o estoque e diversificar transportadoras para entregar pedidos mais rápido e aumentar a satisfação dos clientes.",
    content: "\nAbaixo, detalhamos as principais ações práticas que qualquer lojista pode adotar para agilizar sua operação:\n\n## 1. Mapeie e organize os processos internos\nO primeiro passo é ter clareza de como funcionam cada etapa da sua operação logística: separação, embalagem e expedição. Com um levantamento preciso de informações, você identifica gargalos e documenta a maneira mais eficiente de realizar cada tarefa. Mapear toda a jornada, da produção ao *last mile*, permite antecipar imprevistos que impactam o tempo de envio.\n\n## 2. Automatize etapas da operação\nIdentifique tudo que pode ser automatizado para otimizar o fluxo. A automação é essencial para garantir o cumprimento dos prazos prometidos. Práticas como **automatizar a emissão de notas fiscais**, **integrar pedidos de todos os canais** em uma estrutura única e **atualizar status automaticamente** reduzem registros manuais e antecipam etapas. Softwares de gestão, APIs e automação dos fluxos de *picking* e *packing* são fundamentais para essa agilidade.\n\n## 3. Preveja demanda e controle estoques\nSó é possível estimar um bom prazo se as demandas forem previstas com antecedência, especialmente em datas como Black Friday e Natal. Mantenha o estoque **100% conferido e atualizado**, com produtos disponíveis e organizados para **separação rápida**. A dica é manter tudo etiquetado e agrupado por categorias de saída rápida, deixando materiais à mão para poupar minutos preciosos. Treinar a equipe para reconhecer produtos de alta saída também acelera o processo.\n\n## 4. Diversifique opções de frete e tenha bons parceiros\nDiversificar as opções de frete e transportadoras garante que o prazo seja o menor possível, evitando dependência de um único parceiro. Tenha **backups de parceiros de transporte**: se o principal atrasar, o segundo já entra em ação. Contar com fornecedores e parceiros logísticos confiáveis, com contratos firmados, garante disponibilidade e não prejudica o prazo.\n\n## 5. Tenha centros de distribuição mais próximos do cliente\nContar com centros de distribuição (CDs) mais próximos dos clientes é uma estratégia fundamental para entregar pedidos mais rápido. O planejamento deve incluir a **análise da localização geográfica dos clientes** para criar estratégias inteligentes de rotas e evitar trajetos desnecessários.\n\n## 6. Melhore a logística com roteirização e agrupamento\nA **roteirização de entregas bem feita**, definindo as melhores rotas, faz toda a diferença para organizar o tempo dos motoristas e fazer mais entregas no mesmo dia. Estratégias como **agrupamento de pedidos** para um mesmo destino reduzem o número de viagens e custos. O aproveitamento adequado do centro de distribuição e a adoção de um eficiente **sistema de gestão de fretes** são cruciais.\n\n## 7. Estabeleça prazos realistas e comunique com clareza\nSeja realista e transparente: considere o tempo médio de separação, expedição, distância e desempenho dos parceiros para definir o prazo ideal. Para reduzir dúvidas, informe o prazo em **dias úteis**, explique quando ele começa a contar e deixe claro se existe **prazo de separação interna**. Mostre diferentes opções de frete no checkout e envie atualizações de rastreamento automaticamente.\n\n## 8. Monitore indicadores e acompanhe em tempo real\nMonitorar indicadores logísticos é essencial para identificar gargalos e melhorar o tempo de entrega continuamente. Use **sistemas de rastreamento de pedidos em tempo real** e painéis de pedidos para acompanhar a movimentação. Monitore entregas paradas ou sem atualização e tenha processos claros para devolução e avaria.\n\n## 9. Terceirize a entrega quando necessário\nTerceirizar o transporte ou a entrega da empresa pode ser uma estratégia eficaz para reduzir prazos, especialmente se a operação interna não tem escala.\n\n[[imagem:https://hn6ldxzrjpr0vrlp.public.blob.vercel-storage.com/articles/cmrj7wr4b000il1047jw9e88y-1783946878920-0.jpg]]\n\n\nA melhor forma de reduzir prazos é **alinhar expectativa desde o checkout**, informar com clareza, enviar rastreamento automático e acompanhar pedidos com risco de atraso antes que o cliente precise entrar em contato. O segredo está em unir **organização de estoque**, **automação do processo de separação** e uma **boa escolha de parceiros logísticos**.",
    metaTitle: "Como reduzir prazos de entrega no e-commerce: 9 estratégias",
    metaDescription: "Descubra estratégias práticas para reduzir prazos de entrega: mapeie processos, automatize, organize o estoque e diversifique transportadoras para entregar mais rápido.",
    ogImage: "https://hn6ldxzrjpr0vrlp.public.blob.vercel-storage.com/articles/cmrj7wr4b000il1047jw9e88y-1783946878619-2.jpg",
    imageCredit: "Nano Banana 2 (Gemini) via OpenRouter",
    aiAssisted: true,
    aiModel: "perplexity/sonar",
    publishedAt: new Date("2026-07-13T12:52:01.333Z"),
    publishAt: new Date("2026-07-13T12:53:00.000Z"),
    sources: [
      {
        title: "Aprenda a reduzir prazos e custos na entrega de produtos",
        url: "https://www.mosistemas.com/reduzir-prazos-e-custos-na-entrega-de-produtos/",
        accessedAt: new Date("2026-07-13T12:52:00.875Z"),
      },
      {
        title: "9 formas de reduzir o prazo de entrega e garantir a ...",
        url: "https://dialogologistica.com.br/logistica/prazo-de-entrega/",
        accessedAt: new Date("2026-07-13T12:52:00.875Z"),
      },
    ],
  },
  {
    title: "A importância do rastreamento de pedidos no e-commerce",
    slug: "importancia-rastreamento-pedidos-ecommerce",
    excerpt: "Descubra como o rastreamento de pedidos transforma a experiência pós-compra, aumenta a confiança do cliente e otimiza a logística da sua loja virtual.",
    content: "\n\n## Por que o rastreamento é essencial no e-commerce?\n\nNo cenário atual do comércio eletrônico brasileiro, que tem experimentado uma expansão acelerada, o rastreamento de encomendas deixou de ser um detalhe operacional para se tornar um diferencial competitivo estratégico. Segundo a ABComm, o crescimento do setor trouxe milhões de novos consumidores para o ambiente digital, muitos dos quais ainda estão se adaptando à dinâmica de compras online.\n\nDiferente da loja física, onde a transação termina no caixa, o e-commerce exige uma gestão logística eficiente até que o produto chegue às mãos do cliente. O rastreamento atua como uma ponte de transparência nessa jornada.\n\n## Benefícios estratégicos para o seu negócio\n\n### 1. Redução da ansiedade do consumidor\nMesmo com um prazo de entrega definido, o cliente sente necessidade de acompanhar o status do pedido. Oferecer a possibilidade de rastreio, seja através de notificações automáticas ou disponibilizando o código para consulta, ajuda a controlar essa ansiedade e transmite uma sensação de segurança.\n\n### 2. Apoio à adaptação digital\nPara os novos compradores online, o rastreamento ajuda a diminuir o choque cultural entre a compra física e a digital. Saber exatamente onde está a encomenda gera confiança, essencial para fidelizar esse novo público.\n\n### 3. Construção de credibilidade\nA reputação de uma loja virtual é construída pela sua capacidade de cumprir prazos. Quando o processo de entrega ocorre sem surpresas, o cliente tende a avaliar positivamente a loja, gerando um marketing espontâneo valioso para o crescimento do negócio.\n\n### 4. Gestão proativa de problemas\nO monitoramento constante permite que o lojista identifique movimentações atípicas ou atrasos antes mesmo que o cliente perceba. Agir de forma preventiva, comunicando o consumidor sobre qualquer imprevisto, é fundamental para manter um bom suporte e evitar frustrações.\n\n### 5. Otimização de custos com reentregas\nUm cliente bem informado sobre a data de chegada de seu pedido tem mais chances de estar presente para recebê-lo. Isso reduz drasticamente as tentativas de reentrega, que geram custos extras e desgastes logísticos tanto para o lojista quanto para a transportadora.\n\n[[imagem:https://hn6ldxzrjpr0vrlp.public.blob.vercel-storage.com/articles/cmrj88j630000ie048aja8ji6-1783947428325-0.jpg]]\n\n## Como implementar uma boa estratégia de rastreio\n\nPara o lojista, o ideal é centralizar o acompanhamento de pedidos em um único painel, especialmente se você utiliza diferentes transportadoras. O uso de plataformas de rastreamento permite automatizar o envio de alertas por e-mail sempre que o status da entrega for atualizado. Essa prática não apenas economiza tempo da sua equipe, mas também coloca o cliente no centro da experiência, garantindo que ele se sinta cuidado do início ao fim da jornada de compra.",
    metaTitle: "A importância do rastreamento de pedidos no e-commerce | Kanglu",
    metaDescription: "Entenda por que o rastreamento de pedidos é vital para a experiência do cliente, reduzindo ansiedade e aumentando a credibilidade da sua loja virtual.",
    ogImage: "https://hn6ldxzrjpr0vrlp.public.blob.vercel-storage.com/articles/cmrj88j630000ie048aja8ji6-1783947428833-1.jpg",
    imageCredit: "Nano Banana 2 (Gemini) via OpenRouter",
    aiAssisted: true,
    aiModel: "google/gemini-3.1-flash-lite",
    publishedAt: new Date("2026-07-13T12:58:00.940Z"),
    publishAt: new Date("2026-07-13T12:59:00.000Z"),
    sources: [
      {
        title: "Entenda a importância do rastreamento de encomendas no e-commerce",
        url: "https://abcomm.org/noticias/entenda-a-importancia-do-rastreamento-de-encomendas-no-e-commerce/",
        accessedAt: new Date("2026-07-13T12:58:00.554Z"),
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
