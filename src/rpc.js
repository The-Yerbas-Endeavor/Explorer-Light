import fs from 'node:fs';

export class RpcError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'RpcError';
    this.code = options.code ?? null;
    this.status = options.status ?? null;
    this.method = options.method ?? null;
  }
}

export class YerbasRpc {
  constructor(options) {
    this.options = options;
    this.nextId = 1;
    this.url = options.protocol + '://' + options.host + ':' + options.port + '/';
  }

  authValue() {
    if (this.options.user && this.options.password) {
      return this.options.user + ':' + this.options.password;
    }

    try {
      return fs.readFileSync(this.options.cookieFile, 'utf8').trim();
    } catch {
      throw new RpcError(
        'Yerbas RPC credentials are missing. Set RPC_USER/RPC_PASSWORD or make the RPC cookie readable at ' + this.options.cookieFile + '.'
      );
    }
  }

  async post(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const auth = Buffer.from(this.authValue(), 'utf8').toString('base64');
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          authorization: 'Basic ' + auth,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new RpcError('Yerbas RPC returned HTTP ' + response.status + '.', { status: response.status });
      }

      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new RpcError('Yerbas RPC request timed out after ' + this.options.timeoutMs + ' ms.');
      }
      if (error instanceof RpcError) throw error;
      throw new RpcError('Unable to reach Yerbas RPC at ' + this.url + ': ' + error.message);
    } finally {
      clearTimeout(timer);
    }
  }

  async call(method, params = []) {
    const id = this.nextId++;
    const reply = await this.post({ jsonrpc: '1.0', id, method, params });
    if (reply.error) {
      throw new RpcError(reply.error.message || 'Yerbas RPC error.', {
        code: reply.error.code,
        method
      });
    }
    return reply.result;
  }

  async batch(calls) {
    if (!calls.length) return [];

    const entries = calls.map((call) => ({
      jsonrpc: '1.0',
      id: this.nextId++,
      method: call.method,
      params: call.params || []
    }));
    const ids = entries.map((entry) => entry.id);
    const reply = await this.post(entries);
    const byId = new Map(reply.map((item) => [item.id, item]));

    return ids.map((id, index) => {
      const item = byId.get(id);
      if (!item) throw new RpcError('Missing Yerbas RPC batch response for ' + calls[index].method + '.');
      if (item.error) {
        throw new RpcError(item.error.message || 'Yerbas RPC error.', {
          code: item.error.code,
          method: calls[index].method
        });
      }
      return item.result;
    });
  }
}
