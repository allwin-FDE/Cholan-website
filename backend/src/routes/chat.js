// POST /api/chat — the website's assistant.
//
// Body: { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
// (the conversation so far, ending with the visitor's new question).
//
// Each question goes through the LangChain pipeline in chat/chain.js: a topic
// check first (rice, millets, pulses and the shop only), then, if it passes,
// the website chunks that match it (chat/retrieve.js) and the answer chain.
// The reply streams back as server-sent events:
//
//   data: {"type":"sources","sources":[{"title":"…","url":"/products/…"}]}
//   data: {"type":"text","text":"…"}          (repeated, as it is written)
//   data: {"type":"done"}
//   data: {"type":"error","error":"…"}        (instead of done, on failure)
import { Router } from 'express';
import { config } from '../config.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { retrieve } from '../chat/retrieve.js';
import { isOnTopic, offTopicReply, streamAnswer } from '../chat/chain.js';

const router = Router();

const MAX_TURNS = 12; // messages kept from the conversation
const MAX_CHARS = 1000; // per message

const chatLimit = createRateLimit({
  windowMs: config.chat.rateWindowMs,
  max: config.chat.rateMax,
  message: 'You are sending questions very quickly. Please wait a minute and try again.',
});

// Keeps only well-formed text turns, the last MAX_TURNS of them, starting with
// a user turn and ending with the new question.
function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const messages = raw
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim(),
    )
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages.at(-1).role !== 'user') return null;
  return messages;
}

router.post('/', chatLimit, async (req, res) => {
  if (!config.chat.enabled) {
    return res.status(503).json({ error: 'The assistant is not available right now.' });
  }
  const messages = cleanMessages(req.body?.messages);
  if (!messages) return res.status(400).json({ error: 'Please type a question.' });

  const userTurns = messages.filter((m) => m.role === 'user');
  const question = userTurns.at(-1).content;
  const previous = userTurns.at(-2)?.content || '';

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // The visitor closed the chat or the page: stop generating.
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    // 1. Off-topic questions get the fixed reply and go no further.
    if (!(await isOnTopic(question, previous, controller.signal))) {
      send({ type: 'sources', sources: [] });
      send({ type: 'text', text: offTopicReply(question) });
      send({ type: 'done' });
      return res.end();
    }

    // 2. Search on the new question plus the one before it, so a follow-up
    // like "what sizes does it come in?" still finds the product discussed.
    const { context, sources } = retrieve([previous, question].filter(Boolean).join('\n'));
    const seen = new Set();
    send({
      type: 'sources',
      sources: sources
        .filter((c) => !seen.has(c.url) && seen.add(c.url))
        .slice(0, 3)
        .map((c) => ({ title: c.label ?? c.title, url: c.url })),
    });

    // 3. The grounded answer, streamed.
    await streamAnswer({
      question,
      history: messages.slice(0, -1),
      context,
      signal: controller.signal,
      onText: (text) => send({ type: 'text', text }),
    });
    send({ type: 'done' });
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error('[chat] could not answer:', error.message);
    send({
      type: 'error',
      error: 'Sorry, the assistant could not answer just now. Please try again, or call or WhatsApp us.',
    });
  }
  res.end();
});

export default router;
