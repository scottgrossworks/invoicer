/**
 * @file DB_layer.js
 * @description Abstract database layer interface for pluggable backends
 * 
 */



export class DB_Layer {
  async save(state) {
    throw new Error('Not implemented');
  }
  async load() {
    throw new Error('Not implemented');
  }
}


