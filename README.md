# n8n-nodes-duva

[n8n](https://n8n.io/) community node for [Duva](https://duva.ca), the transactional email API hosted in Canada. Send
email from your workflows, read delivery events, and manage the suppression list.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Usage](#usage) ·
[Compatibility](#compatibility) · [Resources](#resources)

## Installation

In n8n: **Settings → Community nodes → Install**, then enter `n8n-nodes-duva`. See the n8n
[installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

Create a **Duva API** credential with:

- **API Key**: the key created for your domain in the Duva dashboard (API keys). It only opens that domain.
- **Domain**: the sending domain the key belongs to, for example `example.com`.
- **Base URL**: leave `https://api.duva.ca` unless you test against another environment.

The credential has a built-in test (it reads one suppression entry).

## Operations

| Resource | Operation | What it does |
|---|---|---|
| Message | Send | Sends an email: From, To, Subject, HTML and/or Text; optional Cc, Bcc, Reply To, Tags, Metadata, Headers, open/click tracking, attachments (binary properties) and an Idempotency Key |
| Message | Get | Reads a message's status and each recipient's status |
| Event | Get Many | Reads the domain's delivery events (delivered, bounced, deferred, expired, complained, opened, clicked), with filters; follows the pages for you |
| Suppression | Add | Stops all sending to an address from this domain |
| Suppression | Remove | Allows sending to an address again |
| Suppression | Get Many | Lists the suppressed addresses, optionally by reason |

## Usage

**Sending is asynchronous.** `Send` returns `status: queued`: Duva accepted the message, which is not a delivery. Read
the outcome with `Message → Get`, `Event → Get Many`, or a Duva webhook.

**Avoid duplicates.** If the node has **Retry On Fail** on, or a workflow can run twice, set an **Idempotency Key**
(Additional Fields), built from your own data, for example `order-{{ $json.orderId }}`. Duva ignores a second message with
the same key. n8n re-runs the whole node on a retry, so without a key a retry after a network timeout can send twice.

**Recipients see each other.** Every recipient of a message sees the other To and Cc recipients. Use Bcc to hide
addresses, or send one message per recipient.

**Attachments.** Put the files in binary properties of the incoming item, then list their names (default `data`) in
*Attachments (Binary Properties)*. Attachments are for production accounts only (10 files, 5 MB in total).

Duva's limits and rules (sandbox, sender domain, headers, error codes) are in the
[API reference](https://duva.ca/en/docs).

## Compatibility

Tested with n8n 2.x. Requires n8n with community nodes enabled.

## Resources

- [Duva API reference](https://duva.ca/en/docs) · [OpenAPI specification](https://duva.ca/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Source code and issues](https://github.com/duva-mail/duva-n8n)

## License

MIT
