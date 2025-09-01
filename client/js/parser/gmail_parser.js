// gmail_parser.js — extract visible Gmail thread text
import { ParserInterface } from './parser_interface.js';

export function extractEmails() {
  const emailThread = document.querySelector('.ii.gt');
  if (!emailThread) {
    alert("Could not find the email thread. Make sure you are in a Gmail conversation view.");
    return;
  }
  const collapsedElements = document.querySelectorAll('.ajy');
  collapsedElements.forEach(el => { try { el.click(); } catch {} });
  let fullText = '';
  const emailBodies = emailThread.querySelectorAll('.a3s.aiL');
  emailBodies.forEach(emailBody => { fullText += (emailBody.innerText || '') + '\n\n---\n\n'; });
  chrome.runtime.sendMessage({ fullThread: fullText });
}

class GmailParser extends ParserInterface {
  constructor() {
    super();
    this.name = 'GmailParser';
  }

  async checkPageMatch() {
    return location.hostname.includes('mail.google.com');
  }

  async parse(state) {
    // Basic example: stash whole thread text
    try {
      const bodies = document.querySelectorAll('.a3s.aiL');
      const text = Array.from(bodies).map(b => b.innerText || '').join('\n\n---\n\n');
      if (text && text.trim()) {
        state.set('sourceEmail', 'gmail');
        state.set('extractedData', text.substring(0, 100000));
      }
    } catch {}
  }
}

export default GmailParser;


