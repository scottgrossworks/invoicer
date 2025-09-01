// DB_layer.js — interface for pluggable DB backends

export class DB_Layer {
  async save(state) {
    throw new Error('Not implemented');
  }
}


