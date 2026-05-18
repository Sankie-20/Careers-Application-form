const app = document.getElementById('app');

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function getRoleFromUrl() {
	return new URLSearchParams(window.location.search).get('role')?.trim() || '';
}

async function loadPortalConfig() {
	const response = await fetch('/api/config');
	if (!response.ok) throw new Error('Portal configuration unavailable');
	return response.json();
}

async function loadApplyContext(config, roleSlug) {
	const url = new URL('/api/careers/apply-context', config.contextApiBase);
	if (roleSlug) url.searchParams.set('role', roleSlug);
	url.searchParams.set('basePath', config.careersBasePath);

	const response = await fetch(url.href, {
		headers: { Accept: 'application/json' },
	});

	if (!response.ok) {
		throw new Error(`Could not load role data (${response.status})`);
	}

	return response.json();
}

function renderOverview(ctx) {
	const { applyPage: a, isGeneralApplication, role, roleBadge, roleHeadingPrefix, roleMetaPills, roleSummary, roleDescription, focusAreas } = ctx;

	const heading = isGeneralApplication
		? `<h1>${escapeHtml(a.headingGeneral)}</h1>`
		: `<h1><span>${escapeHtml(roleHeadingPrefix)}</span><span class="careers-form-heading-accent">${escapeHtml(role.title)}</span></h1>`;

	const pills =
		roleMetaPills.length > 0
			? `<ul class="careers-form-role-pills">${roleMetaPills.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
			: '';

	const screening =
		a.showScreeningPill && a.screeningPill
			? `<span class="careers-form-screening-pill">${escapeHtml(a.screeningPill)}</span>`
			: '';

	const intro = isGeneralApplication
		? `<p>${escapeHtml(roleDescription || a.formIntro)}</p>${
				focusAreas.length
					? `<ul class="careers-form-focus-pills" aria-label="Focus areas">${focusAreas.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
					: ''
			}`
		: `<p>${escapeHtml(a.formIntro)}</p>`;

	const responseNote = a.responseNote
		? `<div class="careers-form-response-note"><p>${escapeHtml(a.responseNote)}</p></div>`
		: '';

	const roleSummaryBlock =
		!isGeneralApplication && roleSummary
			? `<div class="careers-form-role-summary"><h2>${escapeHtml(a.asideSelectedPathLabel)}</h2><p>${escapeHtml(roleSummary)}</p></div>`
			: '';

	return `
		<section class="careers-form-overview" aria-label="${escapeHtml(a.asideAriaLabel)}">
			<span class="careers-form-badge">${escapeHtml(roleBadge)}</span>
			${heading}
			${pills}
			${screening}
			${intro}
			${responseNote}
			${roleSummaryBlock}
		</section>
	`;
}

function renderForm(ctx) {
	const { applyPage: a, isGeneralApplication, role, suggestions } = ctx;
	const suggestionsId = 'careers-active-role-suggestions';

	const generalRoleField = isGeneralApplication
		? `
			<label class="careers-field careers-field--full">
				<span>${escapeHtml(a.labelPositionRole)}</span>
				<input type="text" name="roleTitle" required autocomplete="organization-title" list="${suggestionsId}" data-role-title-input value="${escapeHtml(role.title)}" placeholder="${escapeHtml(a.placeholderPositionRole)}" />
				${
					suggestions.length
						? `<datalist id="${suggestionsId}">${suggestions.map((item) => `<option value="${escapeHtml(item.title)}"></option>`).join('')}</datalist>`
						: ''
				}
				${a.helpPositionRole ? `<small>${escapeHtml(a.helpPositionRole)}</small>` : ''}
			</label>
		`
		: `<input type="hidden" name="roleTitle" value="${escapeHtml(role.title)}" />`;

	return `
		<section class="careers-form-panel">
			<form class="careers-form-card" data-careers-form enctype="multipart/form-data">
				<div class="careers-form-card-header"><span>${escapeHtml(a.applicationSectionLabel)}</span></div>
				<div class="careers-form-grid">
					<label class="careers-field">
						<span>${escapeHtml(a.labelFirstName)}</span>
						<input type="text" name="firstName" autocomplete="given-name" required />
					</label>
					<label class="careers-field">
						<span>${escapeHtml(a.labelLastName)}</span>
						<input type="text" name="lastName" autocomplete="family-name" required />
					</label>
					<label class="careers-field careers-field--full">
						<span>${escapeHtml(a.labelEmail)}</span>
						<input type="email" name="email" autocomplete="email" required />
					</label>
					<label class="careers-field careers-field--full">
						<span>${escapeHtml(a.labelPhone)}</span>
						<input type="tel" name="phone" autocomplete="tel" />
					</label>
				</div>
				<input type="hidden" name="roleSlug" value="${escapeHtml(role.slug)}" data-role-slug-input />
				<input type="hidden" name="applicationType" value="${isGeneralApplication ? 'general' : 'job'}" />
				${generalRoleField}
				<label class="careers-field careers-field--full">
					<span>${escapeHtml(a.labelLinkedin)}</span>
					<input type="url" name="profileUrl" inputmode="url" autocomplete="url" placeholder="${escapeHtml(a.profileUrlPlaceholder)}" />
				</label>
				<label class="careers-field careers-field--full careers-field--upload">
					<span>${escapeHtml(a.labelResume)}</span>
					<div class="careers-upload-zone" data-upload-zone>
						<input class="careers-upload-input" type="file" name="resume" accept=".pdf,.doc,.docx" required data-upload-input />
						<div class="careers-upload-copy">
							<div class="careers-upload-icon" aria-hidden="true">↑</div>
							<strong data-upload-label>${escapeHtml(a.resumeDropzoneLabel)}</strong>
							<small>${escapeHtml(a.resumeDropzoneHelp)}</small>
						</div>
					</div>
				</label>
				<div class="careers-form-actions">
					<button type="submit" data-submit-button>${escapeHtml(a.submitButtonLabel)}</button>
					<p class="careers-form-status" data-form-status role="status" aria-live="polite"></p>
				</div>
				${a.privacyNote ? `<p class="careers-form-privacy">${escapeHtml(a.privacyNote)}</p>` : ''}
			</form>
		</section>
	`;
}

function renderPage(ctx, config) {
	const closeHref = ctx.links?.backHref || config.contextApiBase;
	document.title = ctx.pageTitle || 'Careers application';

	app.innerHTML = `
		<div class="careers-form-shell-inner">
			<div class="careers-form-topbar">
				<span class="careers-form-handle" aria-hidden="true"></span>
				<a class="careers-form-close" href="${escapeHtml(closeHref)}">${escapeHtml(ctx.applyPage.closeLinkLabel)}</a>
			</div>
			<div class="careers-form-layout">
				${renderOverview(ctx)}
				${renderForm(ctx)}
			</div>
		</div>
	`;

	app.removeAttribute('aria-busy');
	wireForm(ctx);
}

function renderError(message) {
	app.innerHTML = `
		<div class="careers-form-error-page">
			<h1>Unable to load application</h1>
			<p>${escapeHtml(message)}</p>
		</div>
	`;
	app.removeAttribute('aria-busy');
}

function wireForm(ctx) {
	const form = app.querySelector('[data-careers-form]');
	if (!(form instanceof HTMLFormElement)) return;

	const status = form.querySelector('[data-form-status]');
	const submitButton = form.querySelector('[data-submit-button]');
	const roleTitleInput = form.querySelector('[data-role-title-input]');
	const roleSlugInput = form.querySelector('[data-role-slug-input]');
	const uploadZone = form.querySelector('[data-upload-zone]');
	const uploadInput = form.querySelector('[data-upload-input]');
	const uploadLabel = form.querySelector('[data-upload-label]');

	const initialUploadLabel =
		uploadLabel instanceof HTMLElement ? uploadLabel.textContent || '' : '';
	const initialRoleSlug =
		roleSlugInput instanceof HTMLInputElement ? roleSlugInput.value : ctx.role.slug;

	const syncApplicationTypeFromSlug = () => {
		const appType = form.querySelector('input[name="applicationType"]');
		if (!(roleSlugInput instanceof HTMLInputElement) || !(appType instanceof HTMLInputElement)) return;
		appType.value =
			roleSlugInput.value.trim() === ctx.generalApplicationSlug ? 'general' : 'job';
	};

	const syncRoleSlugFromTitle = () => {
		if (!(roleTitleInput instanceof HTMLInputElement) || !(roleSlugInput instanceof HTMLInputElement)) return;
		const typed = roleTitleInput.value.trim().toLowerCase();
		const match = ctx.suggestions.find((role) => role.title.trim().toLowerCase() === typed);
		if (match) roleSlugInput.value = match.slug;
		syncApplicationTypeFromSlug();
	};

	const updateUploadLabel = (files) => {
		if (!(uploadLabel instanceof HTMLElement)) return;
		const firstFile = files && files.length > 0 ? files[0] : null;
		uploadLabel.textContent = firstFile ? firstFile.name : initialUploadLabel;
		if (uploadZone instanceof HTMLElement) {
			uploadZone.classList.toggle('has-file', Boolean(firstFile));
		}
	};

	if (roleTitleInput instanceof HTMLInputElement) {
		roleTitleInput.addEventListener('input', syncRoleSlugFromTitle);
		roleTitleInput.addEventListener('change', syncRoleSlugFromTitle);
	}

	if (uploadInput instanceof HTMLInputElement) {
		uploadInput.addEventListener('change', () => updateUploadLabel(uploadInput.files));
	}

	if (uploadZone instanceof HTMLElement && uploadInput instanceof HTMLInputElement) {
		['dragenter', 'dragover'].forEach((eventName) => {
			uploadZone.addEventListener(eventName, (event) => {
				event.preventDefault();
				uploadZone.classList.add('is-dragging');
			});
		});
		['dragleave', 'dragend', 'drop'].forEach((eventName) => {
			uploadZone.addEventListener(eventName, (event) => {
				event.preventDefault();
				uploadZone.classList.remove('is-dragging');
			});
		});
		uploadZone.addEventListener('drop', (event) => {
			const fileList = event.dataTransfer?.files;
			if (!fileList?.length) return;
			try {
				uploadInput.files = fileList;
			} catch {
				/* ignore */
			}
			updateUploadLabel(fileList);
		});
	}

	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!form.reportValidity()) return;

		syncRoleSlugFromTitle();

		if (status instanceof HTMLElement) {
			status.dataset.state = 'loading';
			status.textContent = 'Submitting your application...';
		}
		if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;

		try {
			const response = await fetch('/api/submit', {
				method: 'POST',
				body: new FormData(form),
			});

			const raw = await response.text().catch(() => '');
			let result = {};
			try {
				result = raw.trim() ? JSON.parse(raw) : {};
			} catch {
				throw new Error('The server returned an unexpected response. Please try again later.');
			}

			if (!response.ok) {
				throw new Error(
					typeof result.message === 'string' && result.message.trim()
						? result.message
						: `Unable to submit (${response.status}).`
				);
			}

			if (typeof result.message !== 'string' || !result.message.trim()) {
				throw new Error('Invalid response from server.');
			}

			form.reset();
			if (roleTitleInput instanceof HTMLInputElement && ctx.isGeneralApplication) {
				roleTitleInput.value = ctx.role.title;
			}
			if (roleSlugInput instanceof HTMLInputElement) {
				roleSlugInput.value = initialRoleSlug;
			}
			syncApplicationTypeFromSlug();
			updateUploadLabel(null);

			if (status instanceof HTMLElement) {
				status.dataset.state = 'success';
				status.textContent = result.message;
			}
		} catch (error) {
			if (status instanceof HTMLElement) {
				status.dataset.state = 'error';
				status.textContent =
					error instanceof Error ? error.message : 'Unable to submit your application right now.';
			}
		} finally {
			if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
		}
	});
}

async function init() {
	try {
		const config = await loadPortalConfig();
		const roleSlug = getRoleFromUrl();
		const ctx = await loadApplyContext(config, roleSlug);
		renderPage(ctx, config);
	} catch (error) {
		console.error(error);
		renderError(
			error instanceof Error
				? error.message
				: 'Something went wrong loading this application form.'
		);
	}
}

init();
