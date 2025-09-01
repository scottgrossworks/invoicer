// parser_interface.js — base shape for parsers

export class ParserInterface {
  constructor() {
    this.name = 'UnnamedParser';
  }

  // Return true if parser can handle current page
  async checkPageMatch() {
    throw new Error('checkPageMatch() not implemented');
  }

  // Fill the provided state with parsed data
  // state: StateFactory.create() instance
  async parse(state) {
    throw new Error('parse() not implemented');
  }
}


