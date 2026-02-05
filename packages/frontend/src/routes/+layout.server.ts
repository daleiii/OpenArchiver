import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import 'dotenv/config';
import { api } from '$lib/server/api';
import type { SystemSettings } from '@open-archiver/types';
import { version } from '../../../../package.json';
import semver from 'semver';

let upstreamUpdateInfo: { version: string; description: string; url: string } | null = null;
let lastChecked: Date | null = null;

// Extract base version from fork version (e.g., "0.4.1-fork.1" -> "0.4.1")
function getBaseVersion(ver: string): string {
	const match = ver.match(/^(\d+\.\d+\.\d+)/);
	return match ? match[1] : ver;
}

export const load: LayoutServerLoad = async (event) => {
	const { locals, url } = event;
	const response = await api('/auth/status', event);

	if (response.ok) {
		const { needsSetup } = await response.json();

		if (needsSetup && url.pathname !== '/setup') {
			throw redirect(307, '/setup');
		}

		if (!needsSetup && url.pathname === '/setup') {
			throw redirect(307, '/signin');
		}
	} else {
		// if auth status check fails, we can't know if the setup is complete,
		// so we redirect to signin page as a safe fallback.
		if (url.pathname !== '/signin') {
			console.error('Failed to get auth status:', await response.text());
			throw redirect(307, '/signin');
		}
	}

	const systemSettingsResponse = await api('/settings/system', event);
	const systemSettings: SystemSettings | null = systemSettingsResponse.ok
		? await systemSettingsResponse.json()
		: null;

	const now = new Date();
	if (!lastChecked || now.getTime() - lastChecked.getTime() > 1000 * 60 * 60) {
		try {
			const res = await fetch(
				'https://api.github.com/repos/LogicLabs-OU/OpenArchiver/releases/latest'
			);
			if (res.ok) {
				const latestRelease = await res.json();
				const latestUpstreamVersion = latestRelease.tag_name.replace('v', '');
				const baseVersion = getBaseVersion(version);
				// Check if upstream has a newer version than our base
				if (semver.gt(latestUpstreamVersion, baseVersion)) {
					upstreamUpdateInfo = {
						version: latestUpstreamVersion,
						description: latestRelease.name,
						url: latestRelease.html_url,
					};
				} else {
					upstreamUpdateInfo = null;
				}
			}
			lastChecked = now;
		} catch (error) {
			console.error('Failed to fetch latest version from GitHub:', error);
		}
	}

	return {
		user: locals.user,
		accessToken: locals.accessToken,
		enterpriseMode: locals.enterpriseMode,
		systemSettings,
		currentVersion: version,
		upstreamUpdateInfo,
	};
};
