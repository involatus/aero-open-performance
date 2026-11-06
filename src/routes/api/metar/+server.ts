import { checkWx } from '#lib/server/checkwx.ts';
import { metarResponse } from '#lib/server/metar-endpoint.ts';
import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = ({ url, request }) =>
	metarResponse(url, checkWx(process.env.CHECKWX_API_KEY), request.headers.get('sec-fetch-site'));
