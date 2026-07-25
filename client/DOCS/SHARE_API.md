# Share Protocol - sh Parameter Specification

Updated: 2/8/2026

## Problem Solved

Two different clients call the same addLeed API:

1. Browser Extension (Share.js) -- sends Gmail to private emails BEFORE calling addLeed
2. Web Cloud (leed_create.js) -- does NOT send emails, relies on server to send via SES

Without distinction, the server would double-email recipients that the extension already emailed via Gmail.

## The '#' Prefix Protocol

A single character prefix on the sh parameter tells the server whether private emails have already been sent by the client.

- '#' present = client already sent private emails via Gmail. Server skips SES for those addresses.
- '#' absent = server must send SES emails to private list (web cloud workflow).

The '#' flag is orthogonal to the '*' broadcast indicator. They are independent:
- '#' = "private emails already handled by client"
- '*' = "broadcast to subscribed platform users"

## sh Parameter Values

| sh value | Source | Server sends SES to private list? | Server broadcasts? |
|---|---|---|---|
| email1,email2 | createLeed (web) | YES | NO |
| #email1,email2 | Share.js (extension) | NO | NO |
| * | either | N/A | YES |
| #* | Share.js (extension) | N/A | YES |
| *,email1,email2 | createLeed (web) | YES | YES (dedup against private list) |
| #*,email1,email2 | Share.js (extension) | NO | YES (dedup against private list) |
| (empty string) | either | N/A | NO |

## Server Processing Order (addLeed.py + async_email_helper.py)

1. addLeed.py receives sh parameter
2. For friends list update: strip '#' and '*' prefixes, extract emails, call async_updateFriendsList. Friends list is ALWAYS updated regardless of '#' flag.
3. If sh is non-empty: call async_emailUsers with the RAW sh string (including '#' if present)
4. async_email_helper.py receives sh:
   a. Check for '#' prefix. If present, set client_handled=True, strip '#'.
   b. Check for '*' prefix. If present, set is_broadcast=True.
   c. Extract private_emails from remainder.
   d. If private_emails AND NOT client_handled: send SES to private list.
   e. If private_emails AND client_handled: skip SES, log skip.
   f. If is_broadcast: query platform users by trade subscription, exclude private_emails (dedup), send SES to remaining users.

## Side Effects (unchanged by this protocol)

- Friends list (fr field) updated with private emails regardless of '#' flag
- Leed counter incremented
- Seller stats updated
- Broadcast emails sent to platform users (when '*' is present)
- The sh field is stored in DynamoDB WITH the '#' prefix (as-is)

## Files Involved

### Client - Browser Extension (INVOICER)
- client/js/pages/Share.js -- prepends '#' to all shareList values

### Client - Web Cloud (LEEDZ/FRONT_3)
- js/leed_create.js -- buildShareList() does NOT prepend '#'. Server sends SES.
- js/leed_edit.js -- does not touch sh (immutable after creation)

### Server (LEEDZ/FRONT_3/py)
- addLeed.py -- strips '#' for friends list parsing, passes raw sh to email helper
- emailHelper/async_email_helper.py -- detects '#', skips SES for private list when present
- changeLeed.py -- sh is NOT editable (immutable after creation)

## Backward Compatibility

Any sh value without '#' behaves exactly as before. The web cloud createLeed workflow is unchanged. Only the browser extension adds '#', and only the email helper checks for it.
