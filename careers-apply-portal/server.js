import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig } from './lib/config.js';
import { processApplication } from './lib/submit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const config = getConfig();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: config.maxUploadBytes },
});

const app = express();

app.disable('x-powered-by');

app.get('/api/config', (_req, res) => {
	res.json({
		contextApiBase: config.contextApiBase,
		careersBasePath: config.careersBasePath,
		siteBrand: config.siteBrand,
		submitPath: '/api/submit',
		port: config.port,
		publicOrigin: config.publicOrigin,
		portalPublicUrl: config.portalPublicUrl,
	});
});

app.get('/health', (_req, res) => {
	res.json({ ok: true });
});

async function fetchRoleContext(roleSlug) {
	const url = new URL('/api/careers/apply-context', config.contextApiBase);
	url.searchParams.set('role', roleSlug);
	url.searchParams.set('basePath', config.careersBasePath);

	const response = await fetch(url.href, {
		headers: { Accept: 'application/json' },
	});

	if (!response.ok) {
		throw new Error(`apply-context HTTP ${response.status}`);
	}

	return response.json();
}

app.post('/api/submit', (req, res) => {
	upload.single('resume')(req, res, async (uploadError) => {
		if (uploadError) {
			const message =
				uploadError.code === 'LIMIT_FILE_SIZE'
					? 'Resume or CV must be 5 MB or smaller.'
					: 'Unable to upload your file. Please try again.';
			res.status(400).json({ message });
			return;
		}

		try {
			const result = await processApplication({
				fields: req.body,
				file: req.file,
				fetchRoleContext,
			});

			const status = result.ok ? result.status : result.status || 400;
			res.status(status).json({
				message: result.message,
				...(result.role ? { role: result.role } : {}),
			});
		} catch (error) {
			console.error('POST /api/submit error:', error);
			res.status(400).json({ message: 'Unable to submit your application right now.' });
		}
	});
});

app.use(express.static(publicDir, { maxAge: '1h', index: false }));

app.get('*', (_req, res) => {
	res.sendFile(path.join(publicDir, 'index.html'));
});

const server = app.listen(config.port, () => {
	console.log(`Careers apply portal: ${config.publicOrigin}`);
	console.log(`Context API: ${config.contextApiBase}`);
});

server.on('error', (error) => {
	if (error && error.code === 'EADDRINUSE') {
		console.error(
			`Port ${config.port} is already in use. Stop the other process or set PORT to a different value in .env`
		);
		process.exit(1);
	}
	throw error;
});
