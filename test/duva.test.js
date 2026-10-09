// Runs the built node (`npm run build` first) against a stub of n8n's execution context: no n8n
// instance, no network. `npm test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { NodeApiError, NodeOperationError } = require('n8n-workflow');
const { Duva } = require('../dist/nodes/Duva/Duva.node.js');

function context({ params, credentials, respond, items = [{ json: {} }], continueOnFail = false, binary }) {
	const requests = [];
	const ctx = {
		requests,
		getInputData: () => items,
		getNodeParameter: (name, i, fallback) => {
			const value = typeof params === 'function' ? params(i)[name] : params[name];
			return value === undefined ? fallback : value;
		},
		getCredentials: async () => ({
			apiKey: 'dv_key',
			domain: 'example.com',
			baseUrl: 'https://api.duva.ca/',
			...credentials,
		}),
		getNode: () => ({ name: 'Duva', type: 'duva', typeVersion: 1, id: 'n', position: [0, 0], parameters: {} }),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credentialName, options) => {
				requests.push({ credentialName, ...options });
				return respond ? respond(options, requests.length) : { id: 'msg_1', status: 'queued' };
			},
			assertBinaryData: (_i, property) => binary[property],
			getBinaryDataBuffer: async (_i, property) => binary[property].buffer,
		},
	};
	return ctx;
}

const run = (ctx) => new Duva().execute.call(ctx);

test('send maps every field to the request body and the Idempotency-Key header', async () => {
	const ctx = context({
		params: {
			resource: 'message',
			operation: 'send',
			from: 'Shop <shop@example.com>',
			to: 'a@example.org, Bea <b@example.org> ,',
			subject: 'Order',
			html: '<p>Hi</p>',
			text: '',
			additionalFields: {
				cc: 'c@example.org',
				bcc: 'd@example.org, e@example.org',
				replyTo: 'help@example.com',
				tags: 'welcome, order',
				trackOpens: true,
				metadata: { values: [{ key: 'order_id', value: '42' }, { key: ' ', value: 'ignored' }] },
				headers: { values: [{ name: 'List-Unsubscribe', value: '<https://example.com/u>' }] },
				idempotencyKey: 'order-42',
				attachments: 'data',
			},
		},
		binary: { data: { fileName: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') } },
	});

	const [out] = await run(ctx);

	assert.deepEqual(out[0].json, { id: 'msg_1', status: 'queued' });
	const [request] = ctx.requests;
	assert.equal(request.credentialName, 'duvaApi');
	assert.equal(request.method, 'POST');
	assert.equal(request.url, 'https://api.duva.ca/v1/example.com/messages');
	assert.deepEqual(request.headers, { 'Idempotency-Key': 'order-42' });
	assert.deepEqual(request.body, {
		from: 'Shop <shop@example.com>',
		to: ['a@example.org', 'Bea <b@example.org>'],
		subject: 'Order',
		html: '<p>Hi</p>',
		cc: ['c@example.org'],
		bcc: ['d@example.org', 'e@example.org'],
		reply_to: 'help@example.com',
		tags: ['welcome', 'order'],
		tracking: { opens: true, clicks: false },
		metadata: { order_id: '42' },
		headers: { 'List-Unsubscribe': '<https://example.com/u>' },
		attachments: [
			{ filename: 'note.txt', content: Buffer.from('hello').toString('base64'), content_type: 'text/plain' },
		],
	});
});

test('send sends no Idempotency-Key header unless one is given', async () => {
	const ctx = context({
		params: { resource: 'message', operation: 'send', from: 'a@example.com', to: 'b@example.org', subject: 'S', html: '', text: 'x', additionalFields: {} },
	});

	await run(ctx);

	assert.deepEqual(ctx.requests[0].headers, {});
	assert.equal(ctx.requests[0].body.tracking, undefined);
});

test('send refuses a message without body or without recipient, before any request', async () => {
	const base = { resource: 'message', operation: 'send', from: 'a@example.com', subject: 'S', additionalFields: {} };
	const noBody = context({ params: { ...base, to: 'b@example.org', html: '', text: '' } });
	const noTo = context({ params: { ...base, to: ' , ', html: 'x', text: '' } });

	await assert.rejects(run(noBody), NodeOperationError);
	await assert.rejects(run(noTo), NodeOperationError);
	assert.equal(noBody.requests.length + noTo.requests.length, 0);
});

test('get reads one message, the id is path-encoded', async () => {
	const ctx = context({ params: { resource: 'message', operation: 'get', messageId: 'msg_a/b' } });

	await run(ctx);

	assert.equal(ctx.requests[0].method, 'GET');
	assert.equal(ctx.requests[0].url, 'https://api.duva.ca/v1/example.com/messages/msg_a%2Fb');
});

test('events getAll follows next_cursor and stops at the limit', async () => {
	const pages = [
		{ data: [{ id: 'evt_1' }, { id: 'evt_2' }], next_cursor: 'c1' },
		{ data: [{ id: 'evt_3' }, { id: 'evt_4' }], next_cursor: 'c2' },
	];
	const ctx = context({
		params: {
			resource: 'event',
			operation: 'getAll',
			returnAll: false,
			limit: 3,
			filters: { type: 'bounced', recipient: 'x@example.org', since: '2026-10-01T12:00:00.000Z' },
		},
		respond: (_o, n) => pages[n - 1],
	});

	const [out] = await run(ctx);

	assert.deepEqual(out.map((e) => e.json.id), ['evt_1', 'evt_2', 'evt_3']);
	assert.equal(ctx.requests.length, 2);
	assert.deepEqual(ctx.requests[0].qs, {
		type: 'bounced',
		recipient: 'x@example.org',
		since: '2026-10-01T12:00:00.000Z',
		limit: 3,
	});
	assert.equal(ctx.requests[1].qs.cursor, 'c1');
	assert.equal(ctx.requests[1].qs.limit, 1);
});

test('events getAll with Return All reads every page', async () => {
	const pages = [
		{ data: [{ id: 'evt_1' }], next_cursor: 'c1' },
		{ data: [{ id: 'evt_2' }], next_cursor: null },
	];
	const ctx = context({
		params: { resource: 'event', operation: 'getAll', returnAll: true, filters: {} },
		respond: (_o, n) => pages[n - 1],
	});

	const [out] = await run(ctx);

	assert.equal(out.length, 2);
	assert.equal(ctx.requests[0].qs.limit, 100);
});

test('suppressions: add, remove (204 has no body) and list by reason', async () => {
	const add = context({ params: { resource: 'suppression', operation: 'add', email: 'a@example.org' } });
	await run(add);
	assert.equal(add.requests[0].method, 'POST');
	assert.deepEqual(add.requests[0].body, { email: 'a@example.org' });

	const remove = context({
		params: { resource: 'suppression', operation: 'remove', email: 'a+b@example.org' },
		respond: () => undefined,
	});
	const [removed] = await run(remove);
	assert.equal(remove.requests[0].method, 'DELETE');
	assert.equal(remove.requests[0].url, 'https://api.duva.ca/v1/example.com/suppressions/a%2Bb%40example.org');
	assert.deepEqual(removed[0].json, { email: 'a+b@example.org', removed: true });

	const list = context({
		params: { resource: 'suppression', operation: 'getAll', reason: 'complaint', returnAll: false, limit: 50 },
		respond: () => ({ data: [{ email: 'z@example.org', reason: 'complaint' }], next_cursor: null }),
	});
	const [listed] = await run(list);
	assert.equal(list.requests[0].qs.reason, 'complaint');
	assert.equal(listed[0].json.email, 'z@example.org');
});

test('the domain of the credentials is path-encoded', async () => {
	const ctx = context({
		params: { resource: 'message', operation: 'get', messageId: 'msg_1' },
		credentials: { domain: 'ex ample.com/../x' },
	});

	await run(ctx);

	assert.equal(ctx.requests[0].url, 'https://api.duva.ca/v1/ex%20ample.com%2F..%2Fx/messages/msg_1');
});

test('an API error is a NodeApiError, or an output item with Continue On Fail', async () => {
	const failing = () => {
		throw Object.assign(new Error('Request failed'), { httpCode: '422', description: 'Invalid message' });
	};
	const params = { resource: 'message', operation: 'get', messageId: 'msg_1' };

	await assert.rejects(run(context({ params, respond: failing })), NodeApiError);

	const [out] = await run(context({ params, respond: failing, continueOnFail: true }));
	assert.equal(out[0].json.error, 'Request failed');
});

test('each input item is processed with its own parameters', async () => {
	const ctx = context({
		items: [{ json: {} }, { json: {} }],
		params: (i) => ({ resource: 'message', operation: 'get', messageId: `msg_${i}` }),
	});

	const [out] = await run(ctx);

	assert.equal(out.length, 2);
	assert.deepEqual(ctx.requests.map((r) => r.url.split('/').pop()), ['msg_0', 'msg_1']);
	assert.deepEqual(out.map((o) => o.pairedItem.item), [0, 1]);
});
