import { getConfig, getWebhookUrl } from './config.js';

const GENERAL_SLUG = 'general-application';

function json(message, status = 400) {
	return { ok: false, status, message };
}

export async function processApplication({ fields, file, fetchRoleContext }) {
	const firstName = String(fields.firstName || '').trim();
	const lastName = String(fields.lastName || '').trim();
	const email = String(fields.email || '').trim();
	const phone = String(fields.phone || '').trim();
	const profileUrl = String(fields.profileUrl || '').trim();
	const roleSlug = String(fields.roleSlug || GENERAL_SLUG).trim();
	const roleTitle = String(fields.roleTitle || '').trim();

	const applicationType = roleSlug === GENERAL_SLUG ? 'general' : 'job';

	if (!firstName || !lastName || !email || !roleTitle) {
		return json('Please complete all required fields before submitting.');
	}

	if (!email.includes('@')) {
		return json('Please enter a valid email address.');
	}

	if (!file || !file.size) {
		return json('Please attach a resume or CV before submitting.');
	}

	const config = getConfig();

	if (file.size > config.maxUploadBytes) {
		return json('Resume or CV must be 5 MB or smaller.');
	}

	const resumeName = file.originalname.toLowerCase();
	if (!config.allowedExtensions.some((ext) => resumeName.endsWith(ext))) {
		return json('Resume or CV must be provided as a PDF, DOC, or DOCX file.');
	}

	let webhookUrl;
	try {
		webhookUrl = getWebhookUrl(applicationType);
	} catch (error) {
		console.error('Careers portal: missing webhook', error);
		return json(
			'Applications cannot be accepted right now because webhook configuration is missing.',
			503
		);
	}

	let contextRole = {
		team: '',
		location: '',
		employmentType: '',
		summary: '',
	};

	if (typeof fetchRoleContext === 'function') {
		try {
			const ctx = await fetchRoleContext(roleSlug);
			if (ctx?.role) {
				contextRole = {
					team: ctx.role.team || '',
					location: ctx.role.location || '',
					employmentType: ctx.role.employmentType || '',
					summary: ctx.role.summary || '',
				};
			}
		} catch (error) {
			console.warn('Careers portal: could not load role context for webhook', error);
		}
	}

	const webhookFormData = new FormData();
	webhookFormData.set('firstName', firstName);
	webhookFormData.set('lastName', lastName);
	webhookFormData.set('email', email);
	webhookFormData.set('phone', phone);
	webhookFormData.set('role', roleSlug);
	webhookFormData.set('roleTitle', roleTitle);
	webhookFormData.set('positionOrRole', roleTitle);
	webhookFormData.set('applicationType', applicationType);
	webhookFormData.set('team', contextRole.team);
	webhookFormData.set('location', contextRole.location);
	webhookFormData.set('employmentType', contextRole.employmentType);
	webhookFormData.set('summary', contextRole.summary);
	webhookFormData.set('source', 'zig-careers-apply-portal');
	webhookFormData.set('submittedAt', new Date().toISOString());

	if (profileUrl) {
		webhookFormData.set('profileUrl', profileUrl);
	}

	const resumeBlob = new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' });
	webhookFormData.set('resume', resumeBlob, file.originalname);

	try {
		const response = await fetch(webhookUrl, {
			method: 'POST',
			body: webhookFormData,
		});

		if (!response.ok) {
			const errBody = await response.text().catch(() => '');
			console.error(
				`Careers portal webhook HTTP ${response.status}`,
				errBody ? errBody.slice(0, 500) : ''
			);
			return json(
				'The application service did not accept this submission. Please try again in a few minutes.',
				502
			);
		}
	} catch (error) {
		console.error('Careers portal webhook error:', error);
		return json('Unable to submit your application right now.', 400);
	}

	const message =
		applicationType === 'general'
			? `Thanks, ${firstName}. Your general application has been received.`
			: `Thanks, ${firstName}. Your application for ${roleTitle} has been received.`;

	return {
		ok: true,
		status: 200,
		message,
		role: roleSlug,
	};
}
