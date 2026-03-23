// examples/usage.ts
//
// Shows how to wire parsePdfToCharacter to three different LLM backends:
//   A) Anthropic Claude API (recommended — best extraction accuracy)
//   B) Local Ollama (self-hosted, free, works on homelab)
//   C) OpenAI-compatible (any provider)

import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { parsePdfToCharacter } from './parsePdfToCharacter';

// ---------------------------------------------------------------------------
// A) Anthropic Claude API
//    npm install @anthropic-ai/sdk
// ---------------------------------------------------------------------------

async function parseWithClaude(pdfPath: string) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  const pdfBuffer = fs.readFileSync(pdfPath);

  const character = await parsePdfToCharacter(pdfBuffer, {
    callLLM: async (systemPrompt, userMessage) => {
      const response = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const block = response.content[0];
      if (block.type !== 'text') throw new Error('Unexpected non-text response');
      return block.text;
    },
  });

  console.log('Parsed character:', JSON.stringify(character, null, 2));
  return character;
}

// ---------------------------------------------------------------------------
// B) Local Ollama (homelab self-hosted)
//    1. Install Ollama: https://ollama.com
//    2. Pull a model: ollama pull llama3.1:8b  (or mistral, qwen2.5, etc.)
//    3. No API key needed — runs on your machine
//    npm install node-fetch (or use native fetch in Node 18+)
// ---------------------------------------------------------------------------

async function parseWithOllama(pdfPath: string) {
  const pdfBuffer = fs.readFileSync(pdfPath);

  const character = await parsePdfToCharacter(pdfBuffer, {
    callLLM: async (systemPrompt, userMessage) => {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.1:8b', // swap for any model you have pulled
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = (await response.json()) as { message: { content: string } };
      return data.message.content;
    },
  });

  console.log('Parsed character:', JSON.stringify(character, null, 2));
  return character;
}

// ---------------------------------------------------------------------------
// C) Any OpenAI-compatible endpoint (OpenAI, Groq, Together, etc.)
//    npm install openai
// ---------------------------------------------------------------------------

async function parseWithOpenAI(pdfPath: string) {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI(); // reads OPENAI_API_KEY from env

  const pdfBuffer = fs.readFileSync(pdfPath);

  const character = await parsePdfToCharacter(pdfBuffer, {
    callLLM: async (systemPrompt, userMessage) => {
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0, // deterministic — important for data extraction
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      return response.choices[0].message.content ?? '';
    },
  });

  console.log('Parsed character:', JSON.stringify(character, null, 2));
  return character;
}

// ---------------------------------------------------------------------------
// Fastify route example — drop this into your Fastify backend
// ---------------------------------------------------------------------------

// import Fastify from 'fastify';
// import multipart from '@fastify/multipart';
//
// const app = Fastify();
// app.register(multipart);
//
// app.post('/api/characters/import', async (request, reply) => {
//   const data = await request.file();
//   if (!data) return reply.status(400).send({ error: 'No file uploaded' });
//
//   const buffer = await data.toBuffer();
//
//   try {
//     const character = await parsePdfToCharacter(buffer, {
//       callLLM: async (system, user) => {
//         // your LLM call here (Claude, Ollama, etc.)
//       }
//     });
//
//     // TODO: save to Postgres via Prisma
//     // await prisma.character.create({ data: character });
//
//     return reply.send({ success: true, character });
//   } catch (err) {
//     return reply.status(422).send({ error: 'Failed to parse character sheet', details: String(err) });
//   }
// });

// ---------------------------------------------------------------------------
// Quick test runner — run with: npx ts-node examples/usage.ts
// ---------------------------------------------------------------------------

const PDF_PATH = process.argv[2] ?? './brightgamer_141818457.pdf';

console.log(`Parsing: ${PDF_PATH}`);
console.log('Using: Claude API (set ANTHROPIC_API_KEY env var)\n');

parseWithClaude(PDF_PATH).catch(console.error);

// To switch backends, comment out parseWithClaude and uncomment one of:
// parseWithOllama(PDF_PATH).catch(console.error);
// parseWithOpenAI(PDF_PATH).catch(console.error);
