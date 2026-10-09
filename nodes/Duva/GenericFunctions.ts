import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
} from 'n8n-workflow';

export async function duvaRequest(
	this: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	options: { body?: IDataObject; qs?: IDataObject; headers?: IDataObject } = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('duvaApi');
	const baseUrl = String(credentials.baseUrl || 'https://api.duva.ca').replace(/\/+$/, '');
	const domain = encodeURIComponent(String(credentials.domain));

	const request: IHttpRequestOptions = {
		method,
		url: `${baseUrl}/v1/${domain}${path}`,
		json: true,
	};
	if (options.body) request.body = options.body;
	if (options.qs) request.qs = options.qs;
	if (options.headers) request.headers = options.headers;

	const response = await this.helpers.httpRequestWithAuthentication.call(
		this,
		'duvaApi',
		request,
	);
	// A 204 (DELETE) has no body.
	return (response || {}) as IDataObject;
}

/** Follows `next_cursor` until the last page, or until `limit` items when it is not 0. */
export async function duvaRequestAllItems(
	this: IExecuteFunctions,
	path: string,
	qs: IDataObject,
	limit: number,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | undefined;
	do {
		const remaining = limit > 0 ? limit - items.length : 100;
		const page = await duvaRequest.call(this, 'GET', path, {
			qs: { ...qs, limit: Math.min(100, remaining), ...(cursor ? { cursor } : {}) },
		});
		items.push(...((page.data as IDataObject[] | undefined) ?? []));
		cursor = (page.next_cursor as string | null | undefined) ?? undefined;
	} while (cursor && (limit === 0 || items.length < limit));
	return limit > 0 ? items.slice(0, limit) : items;
}

/** "a@x.com, b@x.com" to ["a@x.com", "b@x.com"]. */
export function splitList(value: unknown): string[] {
	return String(value ?? '')
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part !== '');
}
