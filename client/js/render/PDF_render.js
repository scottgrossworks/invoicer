// PDF_render.js — stub PDF renderer (client-side)
import { RenderLayer } from './Render_layer.js';

export class PDFRender extends RenderLayer {
  constructor(config = {}) {
    super();
    this.config = config;
  }

  async renderToPdf(state, options = {}) {
    const data = state.toObject ? state.toObject() : {};
    const dir = options.dir || this.config?.render?.outputDir || '';
    const defaultName = `invoice_${(data.name || data.clientName || 'client')}_${new Date().toISOString().slice(0,10)}.pdf`;
    const fileName = options.fileName || this.config?.render?.fileName || defaultName;
    // Stub: just return the intended path
    return { fileName, dir };
  }
}

export default PDFRender;


