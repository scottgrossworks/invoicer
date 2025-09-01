// Render_layer.js — interface for pluggable renderers

export class RenderLayer {
  async renderToPdf(state, options = {}) {
    throw new Error('Not implemented');
  }
}


