// provider_registry.js — loads configuration and returns providers

export async function loadConfig() {
  try {
    const res = await fetch(chrome.runtime.getURL('invoicer_config.json'));
    if (!res.ok) throw new Error('Config fetch failed');
    return await res.json();
  } catch (e) {
    return { llm: { baseUrl: 'http://localhost:1234' }, db: { baseUrl: 'http://localhost:3000', provider: 'local_prisma_sqlite' } };
  }
}

export async function getDbLayer() {
  const cfg = await loadConfig();
  const provider = cfg?.db?.provider || 'local_prisma_sqlite';
  if (provider === 'local_prisma_sqlite') {
    const module = await import('./db/DB_local_prisma_sqlite.js');
    return new module.DB_Local_PragmaSqlite(cfg.db.baseUrl);
  }
  throw new Error('Unknown DB provider: ' + provider);
}

export async function getLlmConfig() {
  const cfg = await loadConfig();
  return cfg.llm || { baseUrl: 'http://localhost:1234' };
}

export async function getRenderer() {
  const cfg = await loadConfig();
  const provider = cfg?.render?.provider || 'pdf';
  if (provider === 'pdf') {
    const mod = await import('./render/PDF_render.js');
    return new mod.PDFRender(cfg);
  }
  throw new Error('Unknown render provider: ' + provider);
}

export async function getParsers() {
  const cfg = await loadConfig();
  const entries = cfg.parsers || [];
  const instances = [];
  for (const entry of entries) {
    try {
      const mod = await import(chrome.runtime.getURL(entry.module));
      // Accept default export or named
      const ParserCtor = mod.default || mod[entry.name] || mod.Parser || null;
      if (ParserCtor) {
        instances.push(new ParserCtor());
      }
    } catch (e) {
      // skip failed parser load
    }
  }
  return instances;
}


