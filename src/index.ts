import { createServer } from './app.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';

const { app } = createServer();

await app.listen({ port, host });
