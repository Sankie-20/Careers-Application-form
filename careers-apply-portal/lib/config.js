import 'dotenv/config';

function read(name) {
	const value = process.env[name];
	return typeof value === 'string' ? value.trim() : '';
}

function readFirst(names) {
	for (const name of names) {
		const value = read(name);
		if (value) return value;
	}
	return '';
}

/** Portal public URL — same env name as the main Astro site uses for Apply routing. */
export function readPortalPublicUrl() {
	return readFirst(['PUBLIC_CAREERS_APPLY_PORTAL_URL', 'PUBLIC_ORIGIN', 'CAREERS_APPLY_PORTAL_URL']);
}

function resolvePort() {
	const portRaw = read('PORT');
	if (portRaw) {
		const parsed = Number(portRaw);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}

	const portalUrl = readPortalPublicUrl();
	if (portalUrl) {
		try {
			const parsed = Number(new URL(portalUrl).port);
			if (Number.isFinite(parsed) && parsed > 0) return parsed;
		} catch {
			// fall through
		}
	}

	throw new Error(
		'Missing PORT. Set PORT in .env, or set PUBLIC_CAREERS_APPLY_PORTAL_URL with a port (e.g. http://localhost:8081).'
	);
}

function resolvePublicOrigin(port) {
	const portalUrl = readPortalPublicUrl();
	if (portalUrl) {
		try {
			return new URL(portalUrl).origin;
		} catch {
			throw new Error('Invalid PUBLIC_CAREERS_APPLY_PORTAL_URL in .env');
		}
	}

	const host = read('HOST') || 'localhost';
	const protocol = read('PROTOCOL') || 'http';
	return `${protocol}://${host}:${port}`;
}

export function getConfig() {
	const port = resolvePort();
	const publicOrigin = resolvePublicOrigin(port);
	const contextApiBase =
		readFirst(['CONTEXT_API_BASE_URL', 'PUBLIC_CAREERS_CONTEXT_API_URL']) ||
		'http://localhost:4321';

	return {
		port,
		publicOrigin,
		portalPublicUrl: readPortalPublicUrl() || publicOrigin,
		contextApiBase: contextApiBase.replace(/\/$/, ''),
		careersBasePath: read('CAREERS_BASE_PATH') || '/careers',
		generalApplicationSlug: 'general-application',
		jobWebhookUrl: readFirst([
			'CAREERS_JOB_APPLICATION_WEBHOOK_URL',
			'PUBLIC_CAREERS_JOB_APPLICATION_WEBHOOK_URL',
		]),
		generalWebhookUrl: readFirst([
			'CAREERS_GENERAL_APPLICATION_WEBHOOK_URL',
			'PUBLIC_CAREERS_GENERAL_APPLICATION_WEBHOOK_URL',
		]),
		siteBrand: read('SITE_BRAND') || 'The Zig Group',
		maxUploadBytes: 5 * 1024 * 1024,
		allowedExtensions: ['.pdf', '.doc', '.docx'],
	};
}

export function getWebhookUrl(applicationType) {
	const config = getConfig();
	const url =
		applicationType === 'general' ? config.generalWebhookUrl : config.jobWebhookUrl;
	if (!url) {
		throw new Error(
			applicationType === 'general'
				? 'Missing CAREERS_GENERAL_APPLICATION_WEBHOOK_URL'
				: 'Missing CAREERS_JOB_APPLICATION_WEBHOOK_URL'
		);
	}
	return url;
}
