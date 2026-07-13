import { z } from "zod";
import {
  answerBlogQuestion,
  ChatError,
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
} from "@/lib/chat";

// Usa Prisma (via lib/chat → public-articles) e o SDK fetch no runtime Node.
export const runtime = "nodejs";

/**
 * Entrada do POST /api/chat. Histórico da conversa; cada mensagem é do usuário
 * ou do assistente. Tetos de tamanho/quantidade contêm abuso trivial num
 * endpoint público (o próprio lib/chat também corta as últimas N).
 */
const chatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
      }),
    )
    .min(1, "Envie ao menos uma mensagem")
    .max(MAX_HISTORY_MESSAGES * 4), // teto generoso; lib/chat usa só as últimas N
});

/**
 * POST /api/chat  (PÚBLICO — é o chatbot do blog público, sem auth)
 *
 * Responde dúvidas sobre os artigos publicados. O contexto vem do banco em
 * tempo real (mesmo filtro público das páginas), então reflete o blog atual.
 *
 * Contratos de falha:
 *   - 400 se o corpo for inválido.
 *   - 502 (amigável) se a IA falhar — o front mostra uma bolha de erro.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = chatInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos", issues: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  // A última mensagem precisa ser do usuário — é a pergunta a responder.
  const { messages } = parsed.data;
  if (messages[messages.length - 1].role !== "user") {
    return Response.json(
      { error: "A última mensagem deve ser do usuário." },
      { status: 400 },
    );
  }

  try {
    const reply = await answerBlogQuestion(messages);
    return Response.json({ reply });
  } catch (err) {
    if (err instanceof ChatError) {
      console.warn(`[chat] falhou: ${err.message}`);
      return Response.json(
        {
          error:
            "Não consegui responder agora. Tente novamente em instantes.",
        },
        { status: 502 },
      );
    }
    throw err; // erro inesperado (bug nosso): handler padrão
  }
}
