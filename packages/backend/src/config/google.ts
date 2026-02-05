import 'dotenv/config';

export const googleOAuth = {
	clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
	clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
	redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
};
