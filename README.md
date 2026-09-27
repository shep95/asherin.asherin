# asherin

asherin is a sourced research workspace that runs on your own device.

there is no account, no sign-in, no server and no subscription. the dashboard opens directly. every conversation, file, note and vault entry is kept in this browser's own store (IndexedDB), and the model that answers you is the one you connect: the key is encrypted on the device and used only for requests you start.

## run it

```sh
npm install
npm run dev        # http://localhost:8080
npm run build      # static output in dist/
npm run preview    # serve the built folder locally
```

the built `dist/` folder is plain static files. serve it from anywhere: a laptop, a home server, a private domain, or vercel (`vercel.json` carries the headers, redirects and rewrites).

## connect a model

open the dashboard → settings → ai keys. add a key for any provider (openai, anthropic, google, xai, mistral, deepseek, openrouter, venice, perplexity, groq, and more) or point asherin at a model running on this machine with ollama (`OLLAMA_ORIGINS=* ollama serve`) or lm studio.

keys are stored as aes-256-gcm ciphertext under a non-extractable webcrypto key that never leaves the browser. you can add a passphrase lock so nothing on disk can open a key until you unlock the vault for the session.

## what changed from the hosted edition

- the hosted database, edge functions, stripe billing and account system are gone. `src/lib/local/` holds the on-device replacements: a postgrest-shaped query layer over IndexedDB, local storage buckets, a local identity, an encrypted key vault, and direct browser → provider model streaming.
- rooms that used to lean on a server-side organ (paid third-party scanners and indexes) say "kernel offline" for that tool instead of pretending.
- nothing phones home. the only network calls are to the model provider you chose and to the public data sources the maps and feeds read.

## your data

everything lives in your browser profile for this origin. settings → data lets you export it as json or wipe it. clearing site data in the browser does the same.

## stack

react 18 · typescript · vite · tailwind · shadcn/ui · indexeddb · webcrypto
