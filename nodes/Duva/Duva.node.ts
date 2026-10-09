import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { duvaRequest, duvaRequestAllItems, splitList } from './GenericFunctions';

export class Duva implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Duva',
		name: 'duva',
		icon: { light: 'file:duva.svg', dark: 'file:duva.dark.svg' },
		group: ['output'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send transactional email through Duva and read delivery events',
		defaults: {
			name: 'Duva',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'duvaApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Event', value: 'event' },
					{ name: 'Message', value: 'message' },
					{ name: 'Suppression', value: 'suppression' },
				],
				default: 'message',
			},

			// ---- Message
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['message'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: "Get a message's status and each recipient's status",
						action: 'Get a message',
					},
					{
						name: 'Send',
						value: 'send',
						description: 'Send an email (accepted for delivery, not yet delivered)',
						action: 'Send a message',
					},
				],
				default: 'send',
			},
			{
				displayName: 'From',
				name: 'from',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'Shop <shop@example.com>',
				description: 'Sender, as address or Name &lt;address&gt;. Its domain must be your Duva domain.',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'To',
				name: 'to',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'client@example.org, other@example.org',
				description:
					'Recipient addresses, separated by commas. Every recipient sees the other To and Cc recipients: use Bcc to hide them.',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'Subject',
				name: 'subject',
				type: 'string',
				required: true,
				default: '',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: { rows: 5 },
				default: '',
				description: 'HTML body. At least one of HTML and Text is required.',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description:
					'Plain-text body. When only HTML is given, Duva derives a text version from it.',
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['message'], operation: ['send'] } },
				options: [
					{
						displayName: 'Attachments (Binary Properties)',
						name: 'attachments',
						type: 'string',
						default: 'data',
						description:
							'Names of the binary properties to attach, separated by commas. 10 files and 5 MB in total at most; production accounts only.',
					},
					{
						displayName: 'Bcc',
						name: 'bcc',
						type: 'string',
						default: '',
						description: 'Blind-copy addresses, separated by commas',
					},
					{
						displayName: 'Cc',
						name: 'cc',
						type: 'string',
						default: '',
						description: 'Copy addresses, separated by commas',
					},
					{
						displayName: 'Headers',
						name: 'headers',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						default: {},
						description:
							'Only the headers listed in the Duva API reference are accepted: List-Unsubscribe, Precedence, Importance, or any custom X- header',
						options: [
							{
								name: 'values',
								displayName: 'Header',
								values: [
									{ displayName: 'Name', name: 'name', type: 'string', default: '' },
									{ displayName: 'Value', name: 'value', type: 'string', default: '' },
								],
							},
						],
					},
					{
						displayName: 'Idempotency Key',
						name: 'idempotencyKey',
						type: 'string',
						default: '',
						placeholder: 'order-{{ $json.orderId }}',
						description:
							'A stable key (1 to 255 characters, no spaces): sending twice with the same key never creates a second message. Set it when Retry On Fail is on, or the workflow can run twice.',
					},
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						default: {},
						description:
							'Never sent to the recipient; returned with the message, its events and webhooks. 10 keys at most.',
						options: [
							{
								name: 'values',
								displayName: 'Entry',
								values: [
									{ displayName: 'Key', name: 'key', type: 'string', default: '' },
									{ displayName: 'Value', name: 'value', type: 'string', default: '' },
								],
							},
						],
					},
					{
						displayName: 'Reply To',
						name: 'replyTo',
						type: 'string',
						default: '',
						placeholder: 'Support <help@example.com>',
					},
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
						description: 'Labels, separated by commas (10 at most)',
					},
					{
						displayName: 'Track Clicks',
						name: 'trackClicks',
						type: 'boolean',
						default: false,
						description:
							'Whether to track link clicks. Needs an HTML body and tracking enabled on the domain.',
					},
					{
						displayName: 'Track Opens',
						name: 'trackOpens',
						type: 'boolean',
						default: false,
						description:
							'Whether to track opens. Needs an HTML body and tracking enabled on the domain.',
					},
				],
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'msg_...',
				displayOptions: { show: { resource: ['message'], operation: ['get'] } },
			},

			// ---- Event
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['event'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: "Get the domain's delivery events, newest first",
						action: 'Get many events',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['event'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Message ID',
						name: 'messageId',
						type: 'string',
						default: '',
						placeholder: 'msg_...',
					},
					{
						displayName: 'Recipient',
						name: 'recipient',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Since',
						name: 'since',
						type: 'dateTime',
						default: '',
						description: 'Only events from this moment',
					},
					{
						displayName: 'Type',
						name: 'type',
						type: 'options',
						default: 'delivered',
						options: [
							{ name: 'Bounced', value: 'bounced' },
							{ name: 'Clicked', value: 'clicked' },
							{ name: 'Complained', value: 'complained' },
							{ name: 'Deferred', value: 'deferred' },
							{ name: 'Delivered', value: 'delivered' },
							{ name: 'Expired', value: 'expired' },
							{ name: 'Opened', value: 'opened' },
						],
					},
				],
			},

			// ---- Suppression
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['suppression'] } },
				options: [
					{
						name: 'Add',
						value: 'add',
						description: 'Stop all sending to an address from this domain',
						action: 'Add an address to the suppression list',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get the addresses this domain no longer writes to',
						action: 'Get many suppressed addresses',
					},
					{
						name: 'Remove',
						value: 'remove',
						description: 'Allow sending to an address again',
						action: 'Remove an address from the suppression list',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'name@email.com',
				displayOptions: { show: { resource: ['suppression'], operation: ['add', 'remove'] } },
			},
			{
				displayName: 'Reason',
				name: 'reason',
				type: 'options',
				default: 'bounce',
				description: 'Only the addresses suppressed for this reason',
				displayOptions: { show: { resource: ['suppression'], operation: ['getAll'] } },
				options: [
					{ name: 'Bounce', value: 'bounce' },
					{ name: 'Complaint', value: 'complaint' },
					{ name: 'Manual', value: 'manual' },
					{ name: 'Unsubscribe', value: 'unsubscribe' },
				],
			},

			// ---- Paging, shared by the two lists
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { resource: ['event', 'suppression'], operation: ['getAll'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				typeOptions: { minValue: 1 },
				description: 'Max number of results to return',
				displayOptions: {
					show: { resource: ['event', 'suppression'], operation: ['getAll'], returnAll: [false] },
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let result: IDataObject | IDataObject[] = {};

				if (resource === 'message' && operation === 'send') {
					result = await sendMessage.call(this, i);
				} else if (resource === 'message' && operation === 'get') {
					const id = encodeURIComponent(this.getNodeParameter('messageId', i) as string);
					result = await duvaRequest.call(this, 'GET', `/messages/${id}`);
				} else if (resource === 'event' && operation === 'getAll') {
					const filters = this.getNodeParameter('filters', i) as IDataObject;
					const qs: IDataObject = {};
					if (filters.messageId) qs.message_id = filters.messageId;
					if (filters.type) qs.type = filters.type;
					if (filters.recipient) qs.recipient = filters.recipient;
					if (filters.since) qs.since = new Date(filters.since as string).toISOString();
					result = await duvaRequestAllItems.call(this, '/events', qs, listLimit.call(this, i));
				} else if (resource === 'suppression' && operation === 'getAll') {
					const qs: IDataObject = { reason: this.getNodeParameter('reason', i) as string };
					result = await duvaRequestAllItems.call(
						this,
						'/suppressions',
						qs,
						listLimit.call(this, i),
					);
				} else if (resource === 'suppression' && operation === 'add') {
					const email = this.getNodeParameter('email', i) as string;
					result = await duvaRequest.call(this, 'POST', '/suppressions', { body: { email } });
				} else if (resource === 'suppression' && operation === 'remove') {
					const email = this.getNodeParameter('email', i) as string;
					await duvaRequest.call(this, 'DELETE', `/suppressions/${encodeURIComponent(email)}`);
					result = { email, removed: true };
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation: ${resource} / ${operation}`,
						{ itemIndex: i },
					);
				}

				for (const entry of Array.isArray(result) ? result : [result]) {
					returnData.push({ json: entry, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

/** 0 means "no limit" for `duvaRequestAllItems`. */
function listLimit(this: IExecuteFunctions, itemIndex: number): number {
	return this.getNodeParameter('returnAll', itemIndex) as boolean
		? 0
		: (this.getNodeParameter('limit', itemIndex) as number);
}

async function sendMessage(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const from = this.getNodeParameter('from', itemIndex) as string;
	const to = splitList(this.getNodeParameter('to', itemIndex));
	const html = this.getNodeParameter('html', itemIndex) as string;
	const text = this.getNodeParameter('text', itemIndex) as string;
	const extra = this.getNodeParameter('additionalFields', itemIndex) as IDataObject;

	if (to.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one recipient is required in To', {
			itemIndex,
		});
	}
	if (!html && !text) {
		throw new NodeOperationError(this.getNode(), 'Give an HTML body, a Text body, or both', {
			itemIndex,
		});
	}

	const body: IDataObject = {
		from,
		to,
		subject: this.getNodeParameter('subject', itemIndex) as string,
	};
	if (html) body.html = html;
	if (text) body.text = text;
	if (extra.cc) body.cc = splitList(extra.cc);
	if (extra.bcc) body.bcc = splitList(extra.bcc);
	if (extra.replyTo) body.reply_to = extra.replyTo;
	if (extra.tags) body.tags = splitList(extra.tags);
	if (extra.trackOpens || extra.trackClicks) {
		body.tracking = { opens: Boolean(extra.trackOpens), clicks: Boolean(extra.trackClicks) };
	}

	const metadata = pairs(extra.metadata as IDataObject | undefined, 'key');
	if (Object.keys(metadata).length > 0) body.metadata = metadata;
	const headers = pairs(extra.headers as IDataObject | undefined, 'name');
	if (Object.keys(headers).length > 0) body.headers = headers;

	if (extra.attachments) {
		body.attachments = await Promise.all(
			splitList(extra.attachments).map(async (property) => {
				const binary = this.helpers.assertBinaryData(itemIndex, property);
				const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, property);
				return {
					filename: binary.fileName ?? property,
					content: buffer.toString('base64'),
					content_type: binary.mimeType,
				};
			}),
		);
	}

	const headersOut: IDataObject = {};
	if (extra.idempotencyKey) headersOut['Idempotency-Key'] = extra.idempotencyKey;

	return await duvaRequest.call(this, 'POST', '/messages', {
		body,
		headers: headersOut,
	});
}

/** A fixedCollection of `{key|name, value}` rows to a plain object. */
function pairs(collection: IDataObject | undefined, keyField: string): IDataObject {
	const out: IDataObject = {};
	for (const row of (collection?.values as IDataObject[] | undefined) ?? []) {
		const key = String(row[keyField] ?? '').trim();
		if (key) out[key] = String(row.value ?? '');
	}
	return out;
}
